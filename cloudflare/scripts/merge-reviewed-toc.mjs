import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExcludedDoi } from '../../shared/literature-policy.js';

export function normalizeDoi(value) {
  let text = String(value || '').trim().toLowerCase();
  try { text = decodeURIComponent(text); } catch {}
  text = text.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/.test(text) ? text : '';
}
export function embeddedDois(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('review_source_https_required');
  let text = url.origin + url.pathname;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeURIComponent(text);
    if (text === next) break;
    text = next;
  }
  const found = new Set([...text.matchAll(/10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig)].map(m => normalizeDoi('10.' + m[1] + '/' + m[2])));
  if (/^(?:www\.)?nature\.com$/.test(url.hostname)) {
    const match = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);
    if (match) found.add(normalizeDoi('10.1038/' + match[1]));
  }
  return [...found].filter(Boolean);
}
export function verifyReviewedAsset(item, bytes) {
  const doi = normalizeDoi(item.doi);
  if (!doi || !item.approved || item.kind !== 'official') throw new Error('official_review_required');
  if (!/^[0-9a-f]{64}$/.test(item.sha256 || '')) throw new Error('full_digest_required');
  for (const url of [item.articleUrl, item.sourceUrl]) {
    const ids = embeddedDois(url);
    if (ids.length !== 1 || ids[0] !== doi) throw new Error('review_source_doi_conflict');
  }
  if (bytes.length !== item.byteLength || bytes.length < 100 || bytes.length > 4000000) throw new Error('review_size_mismatch');
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error('review_hash_mismatch');
  if (!item.sha256.startsWith(item.contentHash || 'invalid')) throw new Error('stored_hash_mismatch');
  if (item.contentType === 'image/png') {
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('invalid_png');
    return 'png';
  }
  if (item.contentType !== 'image/svg+xml') throw new Error('unsupported_review_type');
  const svg = bytes.toString('utf8');
  if (!/<svg[\s>]/i.test(svg) || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|animate|set)\b|\son[a-z]+\s*=/i.test(svg)) throw new Error('unsafe_svg');
  for (const match of svg.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
    if (!match[2].startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(match[2])) throw new Error('external_svg_reference');
  }
  if (/url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(svg)) throw new Error('external_svg_css');
  return 'svg';
}
export function trueToc(toc) {
  return Boolean(toc?.available && toc?.imageUrl && !/fallback/i.test(toc.reason || ''));
}
export async function readPapers(root) {
  const pub = path.join(root, 'public');
  const encoded = (await readFile(path.join(pub, 'papers.gz.b64'), 'utf8')).trim();
  const base = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  if (!Array.isArray(base)) throw new Error('literature_baseline_not_array');
  const all = base.slice();
  for (const name of ['total-synthesis.json','manual-supplement.json','final-audit-supplement.json','curated-supplement.json','automation-supplement.json','rolling-supplement.json','literature-supplement.json']) {
    let value;
    try { value = JSON.parse(await readFile(path.join(pub, name), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' && name === 'literature-supplement.json') continue; throw error; }
    if (!Array.isArray(value.papers)) throw new Error('literature_papers_missing:' + name);
    all.push(...value.papers);
  }
  const papers = new Map();
  for (const paper of all) {
    const doi = normalizeDoi(paper?.doi || paper?.url);
    if (doi && !isExcludedDoi(doi)) papers.set(doi, paper);
  }
  if (papers.size < 100) throw new Error('literature_membership_incomplete');
  return papers;
}
export async function mergeReviewedToc(root = process.cwd()) {
  const pub = path.join(root, 'public');
  const plan = JSON.parse(await readFile(path.join(root, 'audit/media-recovery/toc-batch1-manifest.json'), 'utf8'));
  if (plan.recoveryId !== 'toc-batch1-20260922' || plan.quarantineCutoverUnchanged !== 1790082000000 || plan.reviewedCount !== plan.items.length) throw new Error('invalid_recovery_plan');
  const papers = await readPapers(root);
  const manifestPath = path.join(pub, 'media-index.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.items ||= {};
  const duplicates = new Set(); const prepared = [];
  // Validate the ENTIRE approved bundle before making any output changes.
  for (const item of plan.items) {
    if (duplicates.has(item.doi)) throw new Error('duplicate_approved_doi');
    duplicates.add(item.doi);
    if (!/^audit\/media-recovery\/assets\/[0-9a-f]{64}\.(?:svg|png)$/.test(item.assetPath)) throw new Error('invalid_review_path');
    const bytes = await readFile(path.join(root, item.assetPath));
    const ext = verifyReviewedAsset(item, bytes);
    prepared.push({item, ext});
  }
  const summary = { recoveryId: plan.recoveryId, reviewed: prepared.length, eligible: 0, restored: 0, alreadyAvailable: 0, notPublished: [], restoredDois: [], journalCounts: {}, literatureMutations: 0, quarantineCutoverUnchanged: true };
  await mkdir(path.join(pub, 'media-mirror'), {recursive: true});
  for (const {item, ext} of prepared) {
    const doi = normalizeDoi(item.doi);
    if (!papers.has(doi)) { summary.notPublished.push(doi); continue; }
    summary.eligible += 1;
    const record = manifest.items[doi] || { doi, toc: {available: false, doi}, figures: { available: false, doi, figures: [] } };
    if (trueToc(record.toc)) {
      const image = String(record.toc.imageUrl);
      const local = !image.startsWith('/') && !image.includes('..') && !image.includes(':');
      if (local) {
        try { await access(path.join(pub, image)); summary.alreadyAvailable += 1; continue; } catch {}
      }
    }
    const imageUrl = 'media-mirror/recovered-' + item.sha256 + '.' + ext;
    await copyFile(path.join(root, item.assetPath), path.join(pub, imageUrl));
    record.toc = { available: true, doi, articleUrl: item.articleUrl, sourceUrl: item.sourceUrl, imageUrl,
      contentHash: item.contentHash, verifiedSha256: item.sha256,
      reason: 'reviewed_official_toc_recovery', sourceRepository: 'Verified TOC recovery',
      source: 'reviewed-preserved-capture', recoveryId: plan.recoveryId,
      originalUpdatedAt: item.originalUpdatedAt, cacheHit: true, cacheState: 'hit' };
    const figures = record.figures?.figures || [];
    record.inventory = {...(record.inventory || {}), status: figures.length ? 'complete' : 'large_only', largeSource: 'toc', figureCount: figures.length, tocStored: true, tocMissing: false, suspiciousToc: false};
    manifest.items[doi] = record;
    summary.restored += 1; summary.restoredDois.push(doi);
    const journal = papers.get(doi).journal || 'unknown';
    summary.journalCounts[journal] = (summary.journalCounts[journal] || 0) + 1;
  }
  manifest.version = Math.max(2, Number(manifest.version || 2));
  manifest.generatedAt = Date.now();
  summary.generatedAt = manifest.generatedAt;
  summary.finalMediaRecords = Object.keys(manifest.items).length;
  summary.finalOfficialToc = Object.values(manifest.items).filter(r => trueToc(r.toc)).length;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(pub, 'toc-recovery-status.json'), JSON.stringify(summary));
  console.log('REVIEWED_TOC_RECOVERY ' + JSON.stringify(summary));
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await mergeReviewedToc();
