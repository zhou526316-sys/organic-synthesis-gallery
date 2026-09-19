import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const INDEX = path.join(PUBLIC, 'media-index.json');

function sniff(bytes) {
  const head = bytes.subarray(0, Math.min(bytes.length, 1024));
  const text = head.toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
  if (text.startsWith('<?xml') || text.startsWith('<svg') || text.includes('<svg ')) return 'svg';
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.length >= 12 && head.toString('ascii',0,4) === 'RIFF' && head.toString('ascii',8,12) === 'WEBP') return 'webp';
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.toString('ascii',0,6))) return 'gif';
  return 'unknown';
}

function expected(value) {
  const ext = path.extname(String(value || '').replace(/[?#].*$/, '')).slice(1).toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function localFile(value) {
  if (typeof value !== 'string' || !value || /^(?:https?:|data:|blob:)/i.test(value)) return null;
  return path.join(PUBLIC, value.replace(/[?#].*$/, '').replace(/^\/+/, ''));
}

async function validLocal(value) {
  const file = localFile(value);
  if (!file) return true;
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 100) return false;
    const bytes = await readFile(file);
    const actual = sniff(bytes);
    return actual !== 'unknown' && actual === expected(file);
  } catch {
    return false;
  }
}

function figureOne(figures) {
  return figures.find(f => /^figure\s*1$/i.test(String(f?.label || '')))
    || figures.find(f => String(f?.id || '').toLowerCase() === 'figure-1')
    || figures[0];
}

function updateInventory(record) {
  const figures = record?.figures?.figures || [];
  const tocAvailable = Boolean(record?.toc?.available && record?.toc?.imageUrl);
  const fallback = figureOne(figures);
  record.inventory = {
    ...(record.inventory || {}),
    status: tocAvailable && figures.length ? 'complete' : tocAvailable ? 'large_only' : figures.length ? 'figures_only' : 'missing',
    largeSource: tocAvailable
      ? (record?.toc?.reason === 'figure1_fallback' ? 'figure1' : 'toc')
      : fallback ? (/^figure\s*1$/i.test(String(fallback.label || '')) ? 'figure1' : 'figure') : 'none',
    fallbackLabel: tocAvailable ? record?.inventory?.fallbackLabel : fallback?.label,
    figureCount: figures.length,
    tocStored: tocAvailable,
    tocMissing: !tocAvailable,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(INDEX, 'utf8'));
  const items = manifest?.items && typeof manifest.items === 'object' ? manifest.items : {};
  let prunedFigures = 0;
  let invalidTocs = 0;
  let promotedFallbacks = 0;

  for (const [doi, record] of Object.entries(items)) {
    const originalFigures = Array.isArray(record?.figures?.figures) ? record.figures.figures : [];
    const kept = [];
    for (const figure of originalFigures) {
      if (await validLocal(figure?.imageUrl)) kept.push(figure);
      else {
        prunedFigures += 1;
        console.warn('STATIC_MEDIA_PRUNE_FIGURE ' + JSON.stringify({ doi, id: figure?.id || '', url: figure?.imageUrl || '' }));
      }
    }

    record.figures = {
      ...(record.figures || {}),
      doi,
      available: kept.length > 0,
      figures: kept,
    };

    const tocUrl = record?.toc?.imageUrl;
    if (tocUrl && !(await validLocal(tocUrl))) {
      invalidTocs += 1;
      console.warn('STATIC_MEDIA_PRUNE_TOC ' + JSON.stringify({ doi, url: tocUrl, reason: record?.toc?.reason || '' }));
      const fallback = figureOne(kept);
      if (fallback?.imageUrl) {
        record.toc = {
          available: true,
          doi,
          articleUrl: record?.toc?.articleUrl || record?.figures?.articleUrl,
          imageUrl: fallback.imageUrl,
          reason: 'figure1_fallback',
          sourceType: 'article_figure1',
          sourceRepository: fallback.sourceRepository || record?.toc?.sourceRepository || '',
          sourceUrl: fallback.sourceUrl || '',
          cacheHit: true,
          cacheState: 'hit',
        };
        promotedFallbacks += 1;
      } else {
        record.toc = {
          available: false,
          doi,
          articleUrl: record?.toc?.articleUrl || record?.figures?.articleUrl || '',
          reason: 'invalid_static_media_pruned',
          cacheHit: true,
          cacheState: 'miss',
        };
      }
    }

    updateInventory(record);
    items[doi] = record;
  }

  manifest.items = items;
  manifest.generatedAt = Date.now();
  await writeFile(INDEX, JSON.stringify(manifest));
  console.log('STATIC_MEDIA_SANITIZE ' + JSON.stringify({
    records: Object.keys(items).length,
    prunedFigures,
    invalidTocs,
    promotedFallbacks,
  }));
}

await main();
