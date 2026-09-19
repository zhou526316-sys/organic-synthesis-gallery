import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const originalFetch = globalThis.fetch;
const originalSource = process.env.GALLERY_BACKEND_SOURCE;
const script = pathToFileURL(path.join(root, 'cloudflare/scripts/merge-worker-media.mjs'));
await mkdir('.artifacts', { recursive: true });
try {
  for (const failure of [403, 429, 502, 'timeout', 'image403']) {
    const folder = await mkdtemp(path.join(root, '.artifacts/pages-fail-soft-'));
    await mkdir(path.join(folder, 'public'));
    const doi = '10.1038/fixture';
    const knownGood = { doi, toc: { available: true, imageUrl: 'media-mirror/known-good.png', reason: 'official' }, figures: { available: false, figures: [] } };
    await writeFile(path.join(folder, 'public/papers.gz.b64'), gzipSync(JSON.stringify([{ doi }])).toString('base64'));
    await writeFile(path.join(folder, 'public/media-index.json'), JSON.stringify({ items: { [doi]: knownGood } }));
    process.env.GALLERY_BACKEND_SOURCE = 'https://fixture.invalid';
    globalThis.fetch = async url => {
      if (failure === 'timeout') throw new DOMException('Fixture timeout', 'TimeoutError');
      if (failure === 'image403' && String(url).includes('/api/media/batch')) return Response.json({ items: [{ doi, toc: { available: true, imageUrl: 'https://fixture.invalid/image.png' } }] });
      return new Response('', { status: failure === 'image403' ? 403 : failure });
    };
    process.chdir(folder);
    await import(script.href + '?fixture=' + failure);
    const result = JSON.parse(await readFile(path.join(folder, 'public/media-index.json'), 'utf8'));
    assert.deepEqual(result.items[doi].toc, knownGood.toc, `known-good survives ${failure}`);
    process.chdir(root);
  }
  console.log('PASS: Pages media merge survives HTTP 403/429/502, timeout and image failure without losing known-good');
} finally {
  process.chdir(root); globalThis.fetch = originalFetch;
  if (originalSource === undefined) delete process.env.GALLERY_BACKEND_SOURCE; else process.env.GALLERY_BACKEND_SOURCE = originalSource;
}
