import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { importPrimaryVisual, primaryVisualResponse } from '../cloudflare/worker/src/primary-visual.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) {
  const bound = values => ({ async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async first() { return sqlite.prepare(sql).get(...values) || null; }, async run() { return { meta: sqlite.prepare(sql).run(...values) }; } });
  return { ...bound([]), bind: (...values) => bound(values) };
}, async batch(statements) { return Promise.all(statements.map(s => s.run())); } };
const objects = new Map();
const env = { DB, MEDIA: { async put(key, data) { objects.set(key, data); }, async delete() { throw new Error('Known-good deletion forbidden'); } } };
function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
  for (const b of payload) { crc ^= b; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, payload, checksum]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(400); header.writeUInt32BE(200, 4); header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc((400 * 3 + 1) * 200, 120);
for (let row = 0; row < 200; row++) pixels[row * 1201] = 0;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const base = { doi: '10.1038/primary-fixture', width: 400, height: 200, confidence: 95, source: 'fixture', imageData: 'data:image/png;base64,' + png.toString('base64') };
const imported = await Promise.all(['figure1', 'official_visual'].map(kind => importPrimaryVisual(null, env, { ...base, kind })));
assert.ok(imported.every(result => result.status === 200));
const row = sqlite.prepare('SELECT * FROM primary_visual_assets').get();
assert.equal(row.kind, 'official_visual');
assert.equal((await importPrimaryVisual(null, env, { ...base, kind: 'figure1', confidence: 100 })).body.importState, 'known_good_preserved');
assert.ok(objects.size >= 1);
const response = primaryVisualResponse(new Request('https://fixture.invalid/api/toc'), base.doi, row, [{ role: 'master', r2_key: 'stale', width: 1 }, { role: 'thumbnail', r2_key: 'stale-thumb' }]);
assert.ok(response.imageUrl.endsWith(row.r2_key));
assert.equal(response.thumbnailImageUrl, undefined);
assert.equal((await importPrimaryVisual(null, env, { ...base, kind: 'official_visual', imageData: 'data:image/png;base64,' + Buffer.alloc(200, 65).toString('base64') })).status, 400);
console.log('PASS: SQLite import with mock R2, concurrent rank upgrade, immutable objects, stale variant rejection, MIME signature rejection');
