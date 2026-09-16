import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const MANIFEST_FILE = path.resolve(process.env.MEDIA_MANIFEST || 'public/media-index.json');
const manifest = JSON.parse(await readFile(MANIFEST_FILE, 'utf8'));
const items = manifest?.items && typeof manifest.items === 'object' ? manifest.items : {};
const dois = Object.keys(items);

async function inventoryBatch(batch) {
  const response = await fetch(`${SOURCE}/api/media/inventory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dois: batch }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`media inventory HTTP ${response.status}`);
  return response.json();
}

let annotated = 0;
let realToc = 0;
let figureFallback = 0;
let suspiciousToc = 0;
for (let offset = 0; offset < dois.length; offset += 100) {
  const payload = await inventoryBatch(dois.slice(offset, offset + 100));
  for (const inventory of payload?.items || []) {
    const doi = String(inventory?.doi || '').toLowerCase();
    if (!items[doi]) continue;
    items[doi].inventory = {
      status: inventory.status,
      largeSource: inventory.largeSource,
      tocStored: inventory.tocStored === true,
      tocMissing: inventory.tocMissing === true,
      tocReason: inventory.tocReason,
      fallbackLabel: inventory.fallbackLabel,
      suspiciousToc: inventory.suspiciousToc === true,
      figureCount: Number(inventory.figureCount || 0),
      figureOneStored: inventory.figureOneStored === true,
    };
    annotated += 1;
    if (inventory.tocStored === true) realToc += 1;
    if (inventory.tocMissing === true && Number(inventory.figureCount || 0) > 0) figureFallback += 1;
    if (inventory.suspiciousToc === true) suspiciousToc += 1;
  }
}
manifest.version = Math.max(3, Number(manifest.version || 1));
manifest.inventoryAnnotatedAt = Date.now();
await writeFile(MANIFEST_FILE, JSON.stringify(manifest));
console.log(`MEDIA_INVENTORY_ANNOTATION ${JSON.stringify({items:dois.length,annotated,realToc,figureFallback,suspiciousToc})}`);
