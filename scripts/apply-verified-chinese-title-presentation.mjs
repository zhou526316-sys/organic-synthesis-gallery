/**
 * Title-translation read model for the 125 DOI-verified historical English-title repairs.
 * It edits only generated Pages presentation and translation-cache artifacts; never
 * rewrites fixed-slot-protected static literature inputs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeDoi } from '../shared/literature-identity.mjs';
import { titleKey, validChineseTitle } from '../shared/chinese-title-overrides.js';

export const ZH_PARTS = Object.freeze([1, 2, 3].map(n =>
  'audit/title-backfill/verified-title-zh-20261010-part' + n + '.json'));
export const ENGLISH_RECEIPT = 'audit/title-backfill/verified-titles-20261010.json';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const validZh = value => typeof value === 'string'
  && validChineseTitle(value) && /[\u3400-\u9fff]/gu.test(value)
  && !/待核实|标题缺失|暂未翻译|暂无中文|原题|机器翻译待审核/.test(value)
  && value.trim().length >= 5 && value.trim().length <= 350;

export function applyVerifiedChineseTitlePresentation({ supplement, translationPayload, receipt, approvedDois }) {
  assert(supplement && Array.isArray(supplement.papers), 'missing_derived_supplement');
  assert(Array.isArray(translationPayload) && translationPayload.every(part =>
    part?.schema === 'gallery-doi-title-zh-presentation-v1'
    && part.language === 'zh-CN'
    && part.sourceEnglishEvidence === ENGLISH_RECEIPT
    && part.translationProvenance === 'editorial_chemistry_translation'
    && Array.isArray(part.entries)), 'invalid_chinese_translation_evidence');
  assert(receipt?.schema === 'gallery-verified-title-backfill-v1'
    && receipt?.scope === 'existing_approved_dois_only'
    && receipt?.pendingUniqueDoisAfter === 0
    && receipt?.doiMembershipUnchanged === true
    && receipt?.publicationDatesUnchanged === true
    && receipt?.newLiteraturePublished === false
    && Array.isArray(receipt.resolved)
    && receipt.resolvedUniqueDois === receipt.resolved.length,
    'invalid_english_doi_title_receipt');
  assert(approvedDois instanceof Set && approvedDois.size === receipt.originalUniqueDois,
    'approved_doi_membership_mismatch');

  const expected = new Map();
  for (const row of receipt.resolved) {
    const doi = normalizeDoi(row.doi);
    assert(doi && !expected.has(doi) && approvedDois.has(doi)
      && typeof row.title === 'string' && row.title.trim(),
      'english_receipt_duplicate_or_unapproved_doi');
    expected.set(doi, row.title);
  }

  const byDoi = new Map();
  for (const part of translationPayload) {
    for (const entry of part.entries) {
      assert(Array.isArray(entry) && entry.length === 2, 'malformed_chinese_translation');
      const [rawDoi, rawZh] = entry;
      const doi = normalizeDoi(rawDoi);
      assert(doi && rawDoi === doi && expected.has(doi) && !byDoi.has(doi),
        'chinese_translation_duplicate_or_unapproved_doi:' + rawDoi);
      assert(validZh(rawZh), 'invalid_chemistry_chinese_title:' + doi);
      byDoi.set(doi, rawZh.trim());
    }
  }
  assert(byDoi.size === expected.size, 'chinese_translation_coverage_incomplete:'
    + byDoi.size + '/' + expected.size);
  const papers = supplement.papers.map(row => ({...row}));
  const matched = new Set();
  const titleCache = new Map();
  for (const paper of papers) {
    const doi = normalizeDoi(paper.doi || paper.url);
    if (!doi || !byDoi.has(doi)) continue;
    assert(!matched.has(doi), 'duplicate_derived_title_doi:' + doi);
    assert(titleKey(paper.title) === titleKey(expected.get(doi)),
      'chinese_translation_english_title_mismatch:' + doi);
    const zh = byDoi.get(doi);
    // A verified DOI-specific mapping remains authoritative over a stale
    // title-only browser cache, while all other paper fields stay unchanged.
    paper.titleZh = zh;
    matched.add(doi);
    const key = titleKey(paper.title);
    assert(!titleCache.has(key) || titleCache.get(key).zh === zh,
      'ambiguous_english_title_translation:' + key);
    titleCache.set(key, { title:paper.title, zh });
  }
  assert(matched.size === expected.size, 'verified_doi_missing_from_derived_supplement');
  assert(papers.length === supplement.papers.length, 'translation_changed_paper_count');
  assert(papers.every(row => approvedDois.has(normalizeDoi(row?.doi || row?.url))),
    'translation_introduced_unapproved_doi');

  return {
    supplement: {
      ...supplement, papers,
      verifiedChineseTitlePresentation: {
        schema:'gallery-verified-zh-title-presentation-v1',
        sourceEnglishEvidence: ENGLISH_RECEIPT,
        sourceChineseEvidence: [...ZH_PARTS],
        coveredDois: matched.size,
      },
    },
    translations: [...titleCache.values()],
    summary: {
      originalApprovedDois:approvedDois.size,
      verifiedEnglishBackfills:expected.size,
      verifiedChineseTitles:matched.size,
      missingChineseTitles:expected.size - matched.size,
      unchangedPaperCount:true,
      newLiteratureAdmissions:0,
      protectedFilesModified:0,
    },
  };
}

export async function applyVerifiedChineseTitlePresentationToPages(root = process.cwd()) {
  const at = p => path.resolve(root, p);
  const [rawReceipt, rawSupplement, ...rawParts] = await Promise.all([
    readFile(at(ENGLISH_RECEIPT),'utf8'),
    readFile(at('public/literature-supplement.json'),'utf8'),
    ...ZH_PARTS.map(p => readFile(at(p), 'utf8')),
  ]);
  const receipt = JSON.parse(rawReceipt);
  const supplement = JSON.parse(rawSupplement);
  const parts = rawParts.map(s => JSON.parse(s));
  const members = new Set();
  // Read the exact 938-member DOI allowlist frozen at the authorized 08:00
  // release. Generated presentation may not append a DOI outside this set.
  const marker = JSON.parse(await readFile(at('audit/publication-release-state.json'), 'utf8'));
  const {gunzipSync} = await import('node:zlib');
  const baseline = JSON.parse(gunzipSync(Buffer.from(
    (await readFile(at('public/papers.gz.b64'),'utf8')).trim(),'base64')).toString('utf8'));
  for (const row of baseline) {
    const doi = normalizeDoi(row?.doi || row?.url);
    assert(doi, 'invalid_authorized_baseline_doi');
    members.add(doi);
  }
  for (const file of [
    'public/total-synthesis.json','public/manual-supplement.json',
    'public/final-audit-supplement.json','public/curated-supplement.json',
    'public/automation-supplement.json','public/rolling-supplement.json',
  ]) {
    const rows = JSON.parse(await readFile(at(file),'utf8')).papers;
    assert(Array.isArray(rows), 'invalid_authorized_supplement:' + file);
    rows.forEach(row => {
      const doi = normalizeDoi(row?.doi || row?.url);
      assert(doi, 'invalid_authorized_supplement_doi:' + file);
      members.add(doi);
    });
  }
  assert(members.size === marker.productionCards && receipt.originalUniqueDois === members.size,
    'doi_count_mismatch_with_fixed_slot');
  const result = applyVerifiedChineseTitlePresentation({
    supplement, translationPayload:parts, receipt, approvedDois:members,
  });

  // Write both together *after all validation*; do not alter the static inputs
  // covered by marker.protectedBlobs. The existing translation file may contain
  // other DOI/title translations, so preserve them.
  const cachePath = at('public/title-translations-zh.json');
  let cache = { translations: [] };
  try {cache=JSON.parse(await readFile(cachePath,'utf8'));}
  catch(error){if(error.code!=='ENOENT') throw error;}
  assert(Array.isArray(cache.translations), 'invalid_existing_translations');
  const merged = new Map(cache.translations
    .filter(row=>typeof row?.title==='string' && validChineseTitle(row?.zh))
    .map(row => [titleKey(row.title), {title:row.title,zh:row.zh}]));
  result.translations.forEach(row => merged.set(titleKey(row.title),row));
  await writeFile(at('public/literature-supplement.json'),
    JSON.stringify(result.supplement));
  await writeFile(cachePath, JSON.stringify({ ...cache, translations:[...merged.values()] }));
  console.log('VERIFIED_CHINESE_TITLE_PRESENTATION '+JSON.stringify(result.summary));
  return result.summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  await applyVerifiedChineseTitlePresentationToPages();
