import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const SCOPE_CORRECTIONS_FILE = 'audit/literature-scope-corrections.json';
export const normalizeScopeDoi = value => String(value || '').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
export function validateScopeCorrections(payload) {
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.items)) throw new Error('Invalid scope correction registry');
  const seen = new Set();
  for (const row of payload.items) {
    const doi = normalizeScopeDoi(row.doi);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi) || seen.has(doi)) throw new Error('Duplicate or invalid correction DOI');
    seen.add(doi);
    if (row.decision !== 'exclude' || row.firstPassDecision !== 'exclude' || row.challengeDecision !== 'exclude') throw new Error('Scope corrections cannot add or silently defer literature');
    if (!row.title || !row.journal || !/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')) throw new Error('Correction metadata is incomplete');
    if (String(row.reason || '').length < 24 || String(row.evidenceBasis || '').length < 40 || String(row.challengeReason || '').length < 30) throw new Error('Correction evidence missing');
    if (!String(row.source || '').startsWith('explicit_user_scope_correction')) throw new Error('Correction requires recorded explicit user scope instruction');
  }
  return payload.items;
}
export async function loadScopeCorrections(root = process.cwd()) {
  try { return validateScopeCorrections(JSON.parse(await readFile(path.join(root, SCOPE_CORRECTIONS_FILE), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export function withScopeCorrections(candidates, corrections, galleryDois) {
  const byDoi = new Map(candidates.map(row => [normalizeScopeDoi(row.doi), row]));
  for (const row of corrections) {
    const doi = normalizeScopeDoi(row.doi);
    if (!galleryDois.has(doi) && !byDoi.has(doi)) continue;
    const existing = byDoi.get(doi);
    byDoi.set(doi, {
      ...(existing || { doi, title: row.title, journal: row.journal, date: row.date, abstract: '', authors: [], topics: [], sources: [], type: 'journal-article' }),
      reviewPriority: 'high', scopeCorrection: row,
    });
  }
  return [...byDoi.values()];
}
export function scopeDecisionFailures(decisions, corrections) {
  const byDoi = new Map(corrections.map(row => [normalizeScopeDoi(row.doi), row]));
  return decisions.filter(row => byDoi.has(normalizeScopeDoi(row.doi)) && row.decision !== 'exclude')
    .map(row => `scope: explicit user exclusion not respected: ${normalizeScopeDoi(row.doi)}`);
}
