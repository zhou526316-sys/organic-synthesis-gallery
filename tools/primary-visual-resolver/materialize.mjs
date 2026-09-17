import { readFile, writeFile } from 'node:fs/promises';
import { compatibilityToc, primaryVisualRecord, selectBestPrimaryVisual } from './core.mjs';

const MEDIA_INDEX = process.env.MEDIA_INDEX || 'public/media-index.json';

async function main() {
  const manifest = JSON.parse(await readFile(MEDIA_INDEX, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !manifest.items || typeof manifest.items !== 'object') {
    throw new Error('media-index.json must contain an items object');
  }

  let selected = 0;
  let promotedFromFigures = 0;
  let upgraded = 0;
  let unchanged = 0;
  let noVisual = 0;

  for (const [doi, item] of Object.entries(manifest.items)) {
    if (!item || typeof item !== 'object') continue;
    item.doi ||= doi;
    const beforeUrl = item?.toc?.available ? item.toc.imageUrl : '';
    const beforeKind = item?.primaryVisual?.kind || item?.toc?.kind || '';
    const best = selectBestPrimaryVisual(item);
    if (!best) {
      noVisual += 1;
      delete item.primaryVisual;
      continue;
    }

    item.primaryVisual = primaryVisualRecord(best);
    item.toc = compatibilityToc(best, item.toc || {}, doi);
    selected += 1;

    if (!beforeUrl && best.imageUrl) promotedFromFigures += 1;
    else if (beforeUrl && beforeUrl !== best.imageUrl) upgraded += 1;
    else if (beforeKind && beforeKind !== item.primaryVisual.kind) upgraded += 1;
    else unchanged += 1;

    item.inventory = {
      ...(item.inventory || {}),
      primaryVisualKind: item.primaryVisual.kind,
      primaryVisualConfidence: item.primaryVisual.confidence,
      largeSource: item.primaryVisual.kind === 'figure1'
        ? 'figure1'
        : ['graphical_abstract', 'toc_graphic', 'visual_abstract', 'abstract_image', 'graphical_synopsis'].includes(item.primaryVisual.kind)
          ? 'publisher_primary_graphic'
          : item.primaryVisual.kind === 'pdf_primary_visual'
            ? 'pdf_primary_visual'
            : 'figure',
    };
  }

  manifest.version = Math.max(4, Number(manifest.version || 1));
  manifest.primaryVisualVersion = 2;
  manifest.generatedAt = Date.now();
  await writeFile(MEDIA_INDEX, JSON.stringify(manifest));
  console.log(`PRIMARY_VISUAL_MATERIALIZE_SUMMARY ${JSON.stringify({
    records: Object.keys(manifest.items).length,
    selected,
    promotedFromFigures,
    upgraded,
    unchanged,
    noVisual,
  })}`);
}

await main();
