import { readFile, writeFile } from 'node:fs/promises';

const GAP_FILE = process.env.VISUAL_GAP_FILE || 'audit/visual-gap-dois-2026-09-16.json';
const REPORT_FILE = process.env.ACS_STATIC_REPORT || 'audit/acs-static-media-report.json';
const LIMIT = Math.max(1, Number(process.env.ACS_PROBE_LIMIT || 3));
const INDEX_MAX = Math.max(1, Math.min(24, Number(process.env.ACS_IMAGE_INDEX_MAX || 14)));
const DELAY_MS = Math.max(50, Number(process.env.ACS_PROBE_DELAY_MS || 120));
const MAX_BYTES = 4_000_000;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[?#].*$/, '');
  return /^10\.1021\/(?:acs\.orglett|jacs|acscatal)\.6c\d+$/i.test(cleaned) ? cleaned : null;
}

function stemForDoi(doi) {
  const suffix = doi.split('/')[1] || '';
  const match = suffix.match(/^(acs\.orglett|jacs|acscatal)\.(6c\d+)$/i);
  if (!match) return null;
  const [, journal, code] = match;
  if (journal.toLowerCase() === 'acs.orglett') return `ol${code}`;
  if (journal.toLowerCase() === 'jacs') return `ja${code}`;
  if (journal.toLowerCase() === 'acscatal') return `cs${code}`;
  return null;
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function dimensions(buffer, contentType = '') {
  const type = String(contentType).toLowerCase();
  if ((type.includes('png') || buffer.subarray(1, 4).toString() === 'PNG') && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ((type.includes('gif') || buffer.subarray(0, 3).toString() === 'GIF') && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  return jpegDimensions(buffer);
}

async function probe(url) {
  await sleep(DELAY_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://pubs.acs.org/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok) return { status: response.status };
    if (!contentType.startsWith('image/')) return { status: response.status, contentType, rejected: 'not_image' };
    if (contentLength > MAX_BYTES) return { status: response.status, contentType, bytes: contentLength, rejected: 'too_large' };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 200 || bytes.length > MAX_BYTES) return { status: response.status, contentType, bytes: bytes.length, rejected: 'invalid_size' };
    return { status: response.status, contentType, bytes: bytes.length, dimensions: dimensions(bytes, contentType), finalUrl: response.url };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeDoi(doi) {
  const stem = stemForDoi(doi);
  if (!stem) return { doi, state: 'unsupported', assets: [] };
  const suffix = doi.split('/')[1];
  const assets = [];
  const statuses = {};
  for (let index = 1; index <= INDEX_MAX; index += 1) {
    const serial = String(index).padStart(4, '0');
    for (const ext of ['jpeg', 'jpg', 'gif', 'png']) {
      const url = `https://pubs.acs.org/cms/10.1021/${suffix}/asset/images/large/${stem}_${serial}.${ext}`;
      const result = await probe(url);
      const key = String(result.status ?? 'error');
      statuses[key] = (statuses[key] || 0) + 1;
      if (result.status === 200 && !result.rejected) assets.push({ index, ext, url, ...result });
      // Once one extension exists for an index, avoid redundant alternatives.
      if (result.status === 200 && !result.rejected) break;
    }
  }
  return { doi, stem, state: assets.length ? 'assets_found' : 'no_assets', assets, statuses };
}

const payload = JSON.parse(await readFile(GAP_FILE, 'utf8'));
const acsDois = [...new Set((payload?.dois || []).map(normalizeDoi).filter(Boolean))].slice(0, LIMIT);
const results = [];
for (const doi of acsDois) {
  const item = await probeDoi(doi);
  results.push(item);
  console.log(`ACS_STATIC_PROBE ${JSON.stringify({ doi, state: item.state, assets: item.assets.length, statuses: item.statuses })}`);
  for (const asset of item.assets) console.log(`ACS_STATIC_ASSET ${JSON.stringify({ doi, index: asset.index, url: asset.url, bytes: asset.bytes, dimensions: asset.dimensions, contentType: asset.contentType })}`);
}
const summary = {
  probed: results.length,
  withAssets: results.filter(item => item.assets.length).length,
  assets: results.reduce((sum, item) => sum + item.assets.length, 0),
  allBlocked403: results.filter(item => !item.assets.length && Object.keys(item.statuses || {}).length === 1 && item.statuses?.['403']).length,
};
await writeFile(REPORT_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)}\n`, 'utf8');
console.log(`ACS_STATIC_SUMMARY ${JSON.stringify(summary)}`);
