import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_SITE = (process.env.SOURCE_SITE || 'https://organic-synthesis-literature-gallery-ase43k.v2.appdeploy.ai').replace(/\/$/, '');
const OUTPUT_DIR = resolve(process.env.OUTPUT_DIR || 'public');
const files = [
  'papers.gz.b64',
  'total-synthesis.json',
  'manual-supplement.json',
  'final-audit-supplement.json',
];

await mkdir(OUTPUT_DIR, { recursive: true });

for (const file of files) {
  const response = await fetch(`${SOURCE_SITE}/${file}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Unable to snapshot ${file}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error(`Production asset ${file} is empty.`);
  await writeFile(resolve(OUTPUT_DIR, file), bytes);
  console.log(`Snapshotted ${file} (${bytes.byteLength} bytes)`);
}
