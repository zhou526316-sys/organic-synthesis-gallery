import { execFileSync } from 'node:child_process';

const WORKER = (process.env.GALLERY_BACKEND_SOURCE || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const D1_NAME = process.env.D1_NAME || 'organic-synthesis-gallery';
const CONFIG = process.env.D1_CONFIG || 'wrangler.backfill.toml';
const LIMIT = Math.max(1, Math.min(500, Number(process.env.FIGURE_DIMENSION_LIMIT || 300)));

function runWrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore','pipe','inherit'] });
}

function sqlEscape(value) {
  return String(value ?? '').replaceAll("'", "''");
}

function queryRows() {
  const sql = `SELECT doi, semantic_key, r2_key
    FROM figure_assets
    WHERE r2_key IS NOT NULL
      AND (COALESCE(width,0)=0 OR COALESCE(height,0)=0)
    ORDER BY updated_at DESC
    LIMIT ${LIMIT};`;
  const raw = runWrangler(['d1','execute',D1_NAME,'--remote','--config',CONFIG,'--json','--command',sql]);
  const payload = JSON.parse(raw);
  const rows = Array.isArray(payload) ? payload.flatMap(x => x?.results || []) : payload?.results || [];
  return rows.filter(row => row?.doi && row?.semantic_key && row?.r2_key);
}

function mediaUrl(key) {
  return WORKER + '/media/' + String(key).split('/').map(encodeURIComponent).join('/');
}

function dimensions(bytes, type='') {
  const mime = String(type).split(';')[0].trim().toLowerCase().replace('image/jpg','image/jpeg');
  if (mime === 'image/png' && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === 'image/gif' && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mime === 'image/jpeg' && bytes.length > 4) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      if (offset + 4 >= bytes.length) break;
      const len = bytes.readUInt16BE(offset + 2);
      if (len < 2 || offset + 2 + len > bytes.length) break;
      if (new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]).has(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + len;
    }
  }
  if (mime === 'image/webp' && bytes.length >= 30 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') {
    const chunk = bytes.toString('ascii',12,16);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (chunk === 'VP8L' && bytes.length >= 25) {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 >> 6) | ((b3 & 0xf0) << 4));
      return { width, height };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30) {
      for (let i = 20; i + 9 < Math.min(bytes.length, 80); i++) {
        if (bytes[i]===0x9d && bytes[i+1]===0x01 && bytes[i+2]===0x2a) {
          return {
            width: bytes.readUInt16LE(i+3) & 0x3fff,
            height: bytes.readUInt16LE(i+5) & 0x3fff,
          };
        }
      }
    }
  }
  if ((mime === 'image/avif' || mime === 'image/heif' || mime === 'image/heic') && bytes.length >= 32) {
    for (let offset = 0; offset + 20 <= bytes.length; offset += 1) {
      if (bytes.toString('ascii', offset, offset + 4) !== 'ispe') continue;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return { width: 0, height: 0 };
}

async function fetchDimensions(row) {
  try {
    const response = await fetch(mediaUrl(row.r2_key), { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!response.ok) return { ...row, width: 0, height: 0, error: 'HTTP ' + response.status };
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 4_000_000) return { ...row, width: 0, height: 0, mime, error: 'invalid_bytes:' + bytes.length };
    const size = dimensions(bytes, mime);
    return { ...row, ...size, mime, bytes: bytes.length };
  } catch (error) {
    return { ...row, width: 0, height: 0, error: String(error?.message || error) };
  }
}

async function main() {
  const rows = queryRows();
  const measured = [];
  for (let i = 0; i < rows.length; i += 6) {
    measured.push(...await Promise.all(rows.slice(i, i + 6).map(fetchDimensions)));
  }
  const valid = measured.filter(x => x.width > 0 && x.height > 0);
  for (let i = 0; i < valid.length; i += 60) {
    const batch = valid.slice(i, i + 60);
    const sql = batch.map(row =>
      `UPDATE figure_assets SET width=${Math.round(row.width)}, height=${Math.round(row.height)}
       WHERE doi='${sqlEscape(row.doi)}' AND semantic_key='${sqlEscape(row.semantic_key)}'
         AND r2_key='${sqlEscape(row.r2_key)}'
         AND (COALESCE(width,0)=0 OR COALESCE(height,0)=0);`
    ).join('\n');
    runWrangler(['d1','execute',D1_NAME,'--remote','--config',CONFIG,'--command',sql]);
  }
  const failed = measured.filter(x => !(x.width > 0 && x.height > 0));
  console.log('FIGURE_DIMENSION_BACKFILL_SUMMARY ' + JSON.stringify({
    requested: rows.length,
    measured: valid.length,
    failed: failed.length,
    limit: LIMIT,
    failedSample: failed.slice(0,10).map(x => ({ doi:x.doi, semanticKey:x.semantic_key, mime:x.mime || '', error:x.error || 'unsupported_image_format' }))
  }));
}

await main();
