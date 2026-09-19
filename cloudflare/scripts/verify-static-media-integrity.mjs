import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
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

function expectedFromPath(value) {
  const ext = path.extname(value).slice(1).toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  return ext;
}

function localPath(value) {
  if (typeof value !== 'string' || !value || /^(?:https?:|data:|blob:)/i.test(value)) return null;
  const clean = value.replace(/[?#].*$/, '').replace(/^\/+/, '');
  return path.join(PUBLIC, clean);
}

async function checkAsset(doi, role, url, failures) {
  const file = localPath(url);
  if (!file) return;
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 100) {
      failures.push({ doi, role, url, reason: 'missing_or_too_small' });
      return;
    }
    const bytes = await readFile(file);
    const actual = sniff(bytes);
    const expected = expectedFromPath(file);
    if (actual === 'unknown') {
      failures.push({ doi, role, url, reason: 'unknown_image_bytes', expected });
      return;
    }
    if (expected !== actual) {
      failures.push({ doi, role, url, reason: 'extension_magic_mismatch', expected, actual });
    }
  } catch (error) {
    failures.push({ doi, role, url, reason: 'file_not_found', error: error instanceof Error ? error.message : String(error) });
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(INDEX, 'utf8'));
  const items = manifest?.items && typeof manifest.items === 'object' ? manifest.items : {};
  const failures = [];
  let refs = 0;

  for (const [doi, record] of Object.entries(items)) {
    const tocUrl = record?.toc?.imageUrl;
    if (tocUrl) {
      refs += 1;
      await checkAsset(doi, 'toc', tocUrl, failures);
    }
    for (const figure of record?.figures?.figures || []) {
      if (!figure?.imageUrl) continue;
      refs += 1;
      await checkAsset(doi, figure.id || figure.label || 'figure', figure.imageUrl, failures);
    }
  }

  console.log('STATIC_MEDIA_INTEGRITY ' + JSON.stringify({
    records: Object.keys(items).length,
    referencedAssets: refs,
    failures: failures.length,
  }));

  if (failures.length) {
    for (const failure of failures.slice(0, 100)) {
      console.error('STATIC_MEDIA_FAILURE ' + JSON.stringify(failure));
    }
    if (failures.length > 100) console.error('STATIC_MEDIA_FAILURE_MORE ' + (failures.length - 100));
    process.exitCode = 1;
  }
}

await main();
