import { normalizeDoi } from '../shared/literature-identity.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validTitle = value => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const text = value.trim().toLowerCase().replace(/[：:….]/g, '').replace(/\s+/g, ' ');
  return !['title pending verification','title pending','pending verification','pending title verification',
    '标题待核验','待核验','标题待确认','待确认'].includes(text)
    && !/cloudflare|checking your browser|verify you are human|enable javascript|access denied|page not found/i.test(text);
};
/**
 * Temporary, digest-bound display compatibility, NOT a change to canonical facts.
 * Existing src/main.ts keeps the first nonempty English title for a DOI across
 * baseline -> total -> manual -> final-audit -> generated supplement. Preserve
 * that precedence during read-path migration rather than silently correcting it.
 * The full/newer canonical title remains in record.paper and in audit evidence.
 */
export function buildLegacyTitlePresentation(records, groups, { catalogId, sourceHashes }) {
  assert(hash(catalogId) && sourceHashes && Object.keys(sourceHashes).length > 0
    && Object.values(sourceHashes).every(hash), 'presentation_source_identity_required');
  const titles = new Map();
  for (const rows of groups) {
    assert(Array.isArray(rows), 'presentation_source_not_array');
    for (const row of rows) {
      const doi = normalizeDoi(row?.doi || row?.url);
      if (doi && !titles.has(doi) && validTitle(row.title)) titles.set(doi, row.title.trim());
    }
  }
  const overrides = {}, seen = new Set();
  for (const record of records) {
    assert(normalizeDoi(record.doi) === record.doi && hash(record.revision) && !seen.has(record.doi), 'presentation_record_identity_invalid');
    seen.add(record.doi);
    const title = titles.get(record.doi);
    if (title && title !== record.paper.title) overrides[record.doi] = { revision: record.revision, title };
  }
  return { schema:'gallery-shadow-catalog-v1', kind:'legacy-title-presentation-v1', catalogId,
    policy:'display-compatibility-not-fact-correction', sourceHashes:{...sourceHashes}, overrides };
}
export function applyTitlePresentation(record, presentation, catalogId) {
  assert(presentation?.kind === 'legacy-title-presentation-v1' && presentation.catalogId === catalogId, 'presentation_generation_mismatch');
  const entry = presentation.overrides[record.doi];
  const paper = structuredClone(record.paper);
  if (!entry) return paper;
  assert(entry.revision === record.revision && validTitle(entry.title)
    && Object.keys(entry).every(key => ['revision','title'].includes(key)), 'presentation_revision_or_field_mismatch');
  paper.title = entry.title;
  return paper;
}
