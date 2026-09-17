import { readFile, writeFile } from 'node:fs/promises';

const GAP_FILE = process.env.NATURE_GAP_FILE || 'audit/visual-gap-dois-2026-09-16.json';
const MEDIA_INDEX = process.env.MEDIA_INDEX || 'public/media-index.json';
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.NATURE_FIGURE_CONCURRENCY || 3)));
const REQUEST_DELAY_MS = Math.max(80, Number(process.env.NATURE_FIGURE_REQUEST_DELAY_MS || 180));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function hasLargeImage(item) {
  return Boolean(item?.toc?.available && item?.toc?.imageUrl);
}

function parseSpringerNatureDoi(doi) {
  const match = doi.match(/^10\.1038\/(s(\d+)-(\d{3})-(\d+)-[a-z0-9]+)$/i);
  if (!match) return null;
  const articleId = match[1].toLowerCase();
  const journalId = match[2];
  const year = 2000 + Number(match[3]);
  const articleNumber = match[4];
  if (!Number.isFinite(year) || year < 2000 || year > 2099) return null;
  return { articleId, journalId, year, articleNumber };
}

function figureOneUrl(doi) {
  const parsed = parseSpringerNatureDoi(doi);
  if (!parsed) return null;
  const encodedDoi = encodeURIComponent(doi).replace(/%2f/ig, '%2F');
  const filename = `${parsed.journalId}_${parsed.year}_${parsed.articleNumber}_Fig1_HTML.png`;
  return `https://media.springernature.com/full/springer-static/image/art%3A${encodedDoi}/MediaObjects/${filename}`;
}

function articleUrl(doi) {
  const parsed = parseSpringerNatureDoi(doi);
  return parsed ? `https://www.nature.com/articles/${parsed.articleId}` : `https://doi.org/${doi}`;
}

async function probeImage(url) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(700 * 2 ** attempt);
    await sleep(REQUEST_DELAY_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'User-Agent': 'organic-synthesis-gallery-nature-figure-probe/1.0',
        },
        signal: AbortSignal.timeout(25_000),
      });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const contentLength = Number(response.headers.get('content-length') || 0);
      const ok = response.ok && (contentType.startsWith('image/') || contentLength >= 500);
      try { await response.body?.cancel(); } catch { /* ignore */ }
      if (ok) return { ok: true, status: response.status, contentType, contentLength, finalUrl: response.url || url };
      last = { ok: false, status: response.status, contentType, contentLength };
      if (response.status === 404 || response.status === 410) break;
    } catch (error) {
      last = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return last || { ok: false, error: 'probe failed' };
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

async function main() {
  const gapPayload = JSON.parse(await readFile(GAP_FILE, 'utf8'));
  const manifest = JSON.parse(await readFile(MEDIA_INDEX, 'utf8'));
  manifest.items ||= {};

  const targets = [...new Set((gapPayload?.dois || []).map(normalizeDoi).filter(Boolean))]
    .filter(doi => doi.startsWith('10.1038/'))
    .filter(doi => parseSpringerNatureDoi(doi))
    .filter(doi => !hasLargeImage(manifest.items[doi]));

  let stored = 0;
  const results = await mapConcurrent(targets, CONCURRENCY, async doi => {
    const sourceUrl = figureOneUrl(doi);
    if (!sourceUrl) return { doi, state: 'unsupported_doi' };
    const probe = await probeImage(sourceUrl);
    if (!probe.ok) return { doi, state: 'figure1_unavailable', probe };

    const existing = manifest.items[doi] || { doi, figures: { available: false, doi, figures: [] } };
    if (hasLargeImage(existing)) return { doi, state: 'existing_large_image_won_race' };

    const imageUrl = probe.finalUrl || sourceUrl;
    existing.toc = {
      available: true,
      doi,
      articleUrl: articleUrl(doi),
      imageUrl,
      reason: 'figure1_fallback',
      sourceType: 'article_figure1',
      sourceRepository: 'Springer Nature',
      sourceUrl: imageUrl,
    };

    existing.figures ||= { available: false, doi, figures: [] };
    const figures = Array.isArray(existing.figures.figures) ? existing.figures.figures : [];
    if (!figures.some(item => /^figure\s*1$/i.test(String(item?.label || '')))) {
      figures.unshift({
        id: 'springer-nature-figure-1',
        label: 'Figure 1',
        caption: null,
        imageUrl,
        sourceType: 'article_figure1',
        sourceRepository: 'Springer Nature',
        sourceUrl: imageUrl,
        order: 0,
      });
    }
    existing.figures = { ...existing.figures, available: figures.length > 0, doi, figures: figures.slice(0, 10) };
    existing.inventory = {
      ...(existing.inventory || {}),
      status: 'figures_only',
      largeSource: 'figure1',
      fallbackLabel: 'Figure 1',
      figureCount: existing.figures.figures.length,
    };
    manifest.items[doi] = existing;
    stored += 1;
    return { doi, state: 'stored', imageUrl, contentType: probe.contentType, contentLength: probe.contentLength };
  });

  manifest.version = Math.max(3, Number(manifest.version || 1));
  manifest.generatedAt = Date.now();
  await writeFile(MEDIA_INDEX, JSON.stringify(manifest));

  const summary = {
    sourceGapCount: Number(gapPayload?.count || gapPayload?.dois?.length || 0),
    natureTargets: targets.length,
    stored,
    states: results.reduce((acc, item) => {
      const key = item?.state || (item?.error ? 'error' : 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
  console.log(`NATURE_FIGURE_FALLBACK_SUMMARY ${JSON.stringify(summary)}`);
  for (const item of results) console.log(`NATURE_FIGURE_FALLBACK_RESULT ${JSON.stringify(item)}`);
}

await main();
