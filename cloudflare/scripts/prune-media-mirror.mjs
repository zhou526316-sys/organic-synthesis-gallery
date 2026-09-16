import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = path.resolve('public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media-mirror');
const manifest = JSON.parse(await readFile(path.join(PUBLIC_DIR, 'media-index.json'), 'utf8'));
const referenced = new Set();
for (const item of Object.values(manifest?.items || {})) {
  const toc = item?.toc?.imageUrl;
  if (typeof toc === 'string' && toc.startsWith('media-mirror/')) referenced.add(toc.slice('media-mirror/'.length));
  for (const figure of item?.figures?.figures || []) {
    const url = figure?.imageUrl;
    if (typeof url === 'string' && url.startsWith('media-mirror/')) referenced.add(url.slice('media-mirror/'.length));
  }
}
const files = await readdir(MEDIA_DIR).catch(() => []);
let removed = 0;
for (const file of files) {
  if (referenced.has(file)) continue;
  await rm(path.join(MEDIA_DIR, file), { force: true });
  removed += 1;
}
console.log(`MEDIA_PRUNE_SUMMARY ${JSON.stringify({ referenced: referenced.size, before: files.length, removed, after: files.length - removed })}`);
