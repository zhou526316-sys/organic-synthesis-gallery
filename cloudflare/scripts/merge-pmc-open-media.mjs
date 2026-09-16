import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GAP_FILE = process.env.TOC_GAP_FILE || 'audit/toc-gap-dois-2026-09-16.json';
const MEDIA_INDEX = process.env.MEDIA_INDEX || 'public/media-index.json';
const OUTPUT_DIR = process.env.PMC_MEDIA_DIR || 'public/open-media-mirror';
const ID_CONVERTER = 'https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/';
const S3_ROOT = 'https://pmc-oa-opendata.s3.amazonaws.com';
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.PMC_MEDIA_CONCURRENCY || 2)));
const MAX_IMAGE_BYTES = Math.max(500_000, Number(process.env.PMC_MAX_IMAGE_BYTES || 4_000_000));
const REQUEST_DELAY_MS = Math.max(80, Number(process.env.PMC_REQUEST_DELAY_MS || 180));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function truePublisherToc(toc) {
  if (!toc?.available || !toc?.imageUrl) return false;
  const reason = String(toc?.reason || '');
  const sourceType = String(toc?.sourceType || '');
  if (sourceType === 'publisher_toc' || sourceType === 'publisher_visual_abstract') return true;
  if (reason === 'figure1_fallback' || reason.startsWith('figure_fallback:')) return false;
  if (reason.startsWith('open_') || reason.startsWith('preprint_')) return false;
  return true;
}

async function fetchWithRetry(url, init = {}, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await sleep(500 * 2 ** attempt);
    await sleep(REQUEST_DELAY_MS);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': 'organic-synthesis-gallery-open-media/1.0',
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('request failed');
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return await response.json();
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, { headers: { Accept: 'application/xml,text/xml,text/plain,*/*' } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return await response.text();
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeXml(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function graphicHref(fragment) {
  const graphic = fragment.match(/<(?:graphic|inline-graphic)\b[^>]*\b(?:xlink:href|href)=["']([^"']+)["'][^>]*>/i);
  return graphic ? decodeXml(graphic[1].trim()) : null;
}

function findGraphic(xml) {
  // A true graphical abstract is preferred over a generic first figure.
  const abstracts = xml.match(/<abstract\b[\s\S]*?<\/abstract>/gi) || [];
  for (const block of abstracts) {
    const attrs = block.match(/^<abstract\b([^>]*)>/i)?.[1] || '';
    const text = stripTags(block).toLowerCase();
    if (/graphical|visual\s+abstract/i.test(attrs) || /graphical\s+abstract|visual\s+abstract/i.test(text.slice(0, 220))) {
      const href = graphicHref(block);
      if (href) return { href, kind: 'graphical_abstract', label: 'Open graphical abstract' };
    }
  }

  const figures = xml.match(/<fig\b[\s\S]*?<\/fig>/gi) || [];
  let fallback = null;
  for (const block of figures) {
    const label = stripTags(block.match(/<label\b[^>]*>([\s\S]*?)<\/label>/i)?.[1] || '');
    const id = block.match(/^<fig\b[^>]*\bid=["']([^"']+)["']/i)?.[1] || '';
    const href = graphicHref(block);
    if (!href) continue;
    if (!fallback) fallback = { href, kind: 'figure1', label: label || 'Figure 1' };
    if (/^(?:fig(?:ure)?\.?\s*)?1\b/i.test(label) || /^(?:f|fig)0*1$/i.test(id)) {
      return { href, kind: 'figure1', label: label || 'Figure 1' };
    }
  }
  return fallback;
}

function toHttpsS3Url(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^https:\/\//i.test(value)) return value;
  const s3 = value.match(/^s3:\/\/pmc-oa-opendata\/(.+)$/i);
  if (s3) return `${S3_ROOT}/${s3[1]}`;
  return null;
}

function mediaUrl(entry) {
  if (typeof entry === 'string') return toHttpsS3Url(entry) || (/^https:\/\//i.test(entry) ? entry : null);
  if (!entry || typeof entry !== 'object') return null;
  const value = entry.url || entry.href || entry.s3_url || entry.download_url;
  return toHttpsS3Url(value) || (typeof value === 'string' && /^https:\/\//i.test(value) ? value : null);
}

function filenameFromUrl(url) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '').toLowerCase(); }
  catch { return ''; }
}

function supportedImage(url) {
  const file = filenameFromUrl(url).split('?')[0];
  return /\.(?:png|jpe?g|gif|webp|svg)$/i.test(file);
}

function chooseMediaUrl(metadata, href) {
  const urls = (Array.isArray(metadata?.media_urls) ? metadata.media_urls : []).map(mediaUrl).filter(Boolean);
  if (!urls.length) return null;
  const target = decodeURIComponent(String(href || '').split('/').pop() || '').toLowerCase();
  const targetStem = target.replace(/\.[a-z0-9]+$/i, '');
  const ranked = urls.map(url => {
    const file = filenameFromUrl(url);
    const stem = file.replace(/\.[a-z0-9]+$/i, '');
    let score = 0;
    if (file === target) score += 100;
    if (stem === targetStem) score += 80;
    if (target && file.includes(target)) score += 60;
    if (targetStem && stem.includes(targetStem)) score += 45;
    if (supportedImage(url)) score += 20;
    return { url, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 20 ? ranked[0].url : null;
}

function licenseRedistributable(metadata) {
  const open = metadata?.is_pmc_openaccess === true || String(metadata?.is_pmc_openaccess || '').toLowerCase() === 'yes';
  const code = String(metadata?.license_code || '').trim().toUpperCase();
  if (!open || !code || code === 'TDM') return false;
  return code === 'CC0' || code.startsWith('CC ');
}

async function listVersions(pmcid) {
  const url = `${S3_ROOT}/?list-type=2&prefix=${encodeURIComponent(`${pmcid}.`)}&delimiter=/`;
  const xml = await fetchText(url);
  const prefixes = [...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)]
    .map(match => decodeXml(match[1]).replace(/\/$/, ''))
    .filter(prefix => new RegExp(`^${pmcid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`, 'i').test(prefix));
  return [...new Set(prefixes)];
}

async function selectVersion(pmcid, doi) {
  const versions = await listVersions(pmcid);
  const candidates = [];
  for (const version of versions) {
    try {
      const metadata = await fetchJson(`${S3_ROOT}/metadata/${version}.json`);
      const mdDoi = normalizeDoi(metadata?.doi);
      if (mdDoi && mdDoi !== doi) continue;
      if (!licenseRedistributable(metadata)) continue;
      candidates.push({ version, metadata });
    } catch (error) {
      console.warn(`PMC metadata failed ${version}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  candidates.sort((a, b) => {
    const aManuscript = String(a.metadata?.is_manuscript || '').toLowerCase() === 'yes' || a.metadata?.is_manuscript === true;
    const bManuscript = String(b.metadata?.is_manuscript || '').toLowerCase() === 'yes' || b.metadata?.is_manuscript === true;
    if (aManuscript !== bManuscript) return aManuscript ? 1 : -1;
    return Number(b.version.split('.').pop() || 0) - Number(a.version.split('.').pop() || 0);
  });
  return candidates[0] || null;
}

async function downloadImage(url, doi) {
  const response = await fetchWithRetry(url, { headers: { Accept: 'image/*,*/*;q=0.8' } });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 200 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`image size ${bytes.length}`);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const sourceExt = filenameFromUrl(url).match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const typeExt = contentType === 'image/png' ? 'png'
    : contentType === 'image/jpeg' ? 'jpg'
      : contentType === 'image/gif' ? 'gif'
        : contentType === 'image/webp' ? 'webp'
          : contentType === 'image/svg+xml' ? 'svg'
            : null;
  const ext = typeExt || (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(sourceExt || '') ? (sourceExt === 'jpeg' ? 'jpg' : sourceExt) : null);
  if (!ext) throw new Error(`unsupported image type ${contentType || sourceExt || 'unknown'}`);
  const hash = createHash('sha256').update(`${doi}|${url}`).digest('hex').slice(0, 28);
  const name = `pmc-${hash}.${ext}`;
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, name), bytes);
  return { path: `${path.basename(OUTPUT_DIR)}/${name}`, bytes: bytes.length };
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { results[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return results;
}

async function resolvePmcids(dois) {
  const map = new Map();
  for (let offset = 0; offset < dois.length; offset += 180) {
    const batch = dois.slice(offset, offset + 180);
    const params = new URLSearchParams({
      ids: batch.join(','),
      idtype: 'doi',
      format: 'json',
      tool: 'organic_synthesis_gallery',
    });
    const payload = await fetchJson(`${ID_CONVERTER}?${params}`);
    for (const record of payload?.records || []) {
      const doi = normalizeDoi(record?.doi || record?.['requested-id']);
      const pmcid = typeof record?.pmcid === 'string' ? record.pmcid.toUpperCase() : null;
      if (doi && /^PMC\d+$/.test(pmcid || '') && record?.live !== false) map.set(doi, pmcid);
    }
  }
  return map;
}

async function main() {
  const gapPayload = JSON.parse(await readFile(GAP_FILE, 'utf8'));
  const gapDois = [...new Set((gapPayload?.dois || []).map(normalizeDoi).filter(Boolean))];
  const manifest = JSON.parse(await readFile(MEDIA_INDEX, 'utf8'));
  manifest.items ||= {};
  const targetDois = gapDois.filter(doi => !truePublisherToc(manifest.items[doi]?.toc));
  const pmcids = await resolvePmcids(targetDois);
  const targets = targetDois.map(doi => ({ doi, pmcid: pmcids.get(doi) })).filter(item => item.pmcid);

  let graphicalAbstracts = 0;
  let figureOneFallbacks = 0;
  let bytesTotal = 0;
  const failures = [];
  const results = await mapConcurrent(targets, CONCURRENCY, async ({ doi, pmcid }) => {
    const selected = await selectVersion(pmcid, doi);
    if (!selected) return { doi, pmcid, state: 'no_redistributable_open_version' };
    const xmlUrl = toHttpsS3Url(selected.metadata?.xml_url) || selected.metadata?.xml_url;
    if (!xmlUrl || !/^https:\/\//i.test(xmlUrl)) return { doi, pmcid, state: 'no_xml' };
    const xml = await fetchText(xmlUrl);
    const graphic = findGraphic(xml);
    if (!graphic) return { doi, pmcid, state: 'no_graphic_reference' };
    const sourceUrl = chooseMediaUrl(selected.metadata, graphic.href);
    if (!sourceUrl || !supportedImage(sourceUrl)) return { doi, pmcid, state: 'no_browser_image', href: graphic.href };
    const mirrored = await downloadImage(sourceUrl, doi);
    bytesTotal += mirrored.bytes;

    const existing = manifest.items[doi] || { doi, figures: { available: false, doi, figures: [] } };
    if (truePublisherToc(existing?.toc)) return { doi, pmcid, state: 'publisher_toc_won_race' };
    const sourceType = graphic.kind === 'graphical_abstract' ? 'open_graphical_abstract' : 'article_figure1';
    const reason = graphic.kind === 'graphical_abstract' ? 'open_graphical_abstract:pmc' : 'figure1_fallback';
    existing.toc = {
      available: true,
      doi,
      articleUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
      imageUrl: mirrored.path,
      reason,
      sourceType,
      sourceRepository: 'PMC',
      sourceUrl,
      license: selected.metadata?.license_code || null,
    };
    if (graphic.kind === 'figure1') {
      existing.figures ||= { available: false, doi, figures: [] };
      const figures = Array.isArray(existing.figures.figures) ? existing.figures.figures : [];
      if (!figures.some(item => /^figure\s*1$/i.test(String(item?.label || '')))) {
        figures.unshift({
          id: 'pmc-figure-1',
          label: 'Figure 1',
          caption: null,
          imageUrl: mirrored.path,
          sourceType: 'article_figure1',
          sourceRepository: 'PMC',
          sourceUrl,
          order: 0,
        });
      }
      existing.figures = { ...existing.figures, available: figures.length > 0, doi, figures: figures.slice(0, 10) };
      figureOneFallbacks += 1;
    } else {
      graphicalAbstracts += 1;
    }
    existing.inventory = {
      ...(existing.inventory || {}),
      status: existing?.figures?.figures?.length ? 'figures_only' : 'large_only',
      largeSource: graphic.kind === 'graphical_abstract' ? 'open_graphical_abstract' : 'figure1',
      fallbackLabel: graphic.kind === 'graphical_abstract' ? 'Open graphical abstract' : 'Figure 1',
      figureCount: existing?.figures?.figures?.length || 0,
    };
    manifest.items[doi] = existing;
    return { doi, pmcid, state: 'stored', kind: graphic.kind, license: selected.metadata?.license_code, bytes: mirrored.bytes };
  });

  for (const result of results) {
    if (result?.error) failures.push(result);
  }
  manifest.version = Math.max(3, Number(manifest.version || 1));
  manifest.generatedAt = Date.now();
  await writeFile(MEDIA_INDEX, JSON.stringify(manifest));

  const summary = {
    gapDois: gapDois.length,
    targetsWithoutPublisherToc: targetDois.length,
    foundInPmc: pmcids.size,
    pmcCandidates: targets.length,
    graphicalAbstracts,
    figureOneFallbacks,
    stored: graphicalAbstracts + figureOneFallbacks,
    bytesTotal,
    failures: failures.length,
    states: results.reduce((acc, item) => {
      const key = item?.state || (item?.error ? 'error' : 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
  console.log(`PMC_OPEN_MEDIA_SUMMARY ${JSON.stringify(summary)}`);
  for (const item of results.filter(item => item?.state && item.state !== 'stored').slice(0, 40)) console.log(`PMC_OPEN_MEDIA_SKIP ${JSON.stringify(item)}`);
  for (const item of failures.slice(0, 20)) console.warn(`PMC_OPEN_MEDIA_ERROR ${JSON.stringify(item)}`);
}

await main();
