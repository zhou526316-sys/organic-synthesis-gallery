/**
 * Deterministically materialize all already approved DOI titles in English and
 * Chinese without modifying any fixed-slot-protected literature source.
 *
 * The six editorial manifests have explicit DOI+English-title pairing.
 * They are editorial translations, never presented as publisher-supplied text.
 * Only the generated Pages supplement and its translation-cache asset change.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { DATA_FILES, collectPapers } from './pages-release-delivery.mjs';
import { normalizeDoi } from '../shared/literature-identity.mjs';
import { chineseTitle, titleKey, validChineseTitle } from '../shared/chinese-title-overrides.js';
import { isExcludedDoi } from '../shared/literature-policy.js';
import { pendingTitle } from './backfill-pending-titles.mjs';

export const DIAGNOSTIC_PATH = 'audit/title-backfill/2026-10-10-full-bilingual-coverage-diagnosis.json';
export const EDITORIAL_PARTS = Object.freeze(Array.from({length:6},(_,i) =>
  'audit/title-backfill/2026-10-10-editorial-zh-part' + String(i+1).padStart(2,'0') + '.json'));
const ok = (condition,message) => { if(!condition) throw new Error(message); };
const isValidZh = str => validChineseTitle(str)
  && !/待核验|待翻译|正在翻译|暂无中文|待补充|机器翻译待审核/i.test(str);
const normalize = value => normalizeDoi(value);
const pretty = value => JSON.stringify(value,null,2) + '\n';

function validatedManifestEntries(diagnostic, manifests) {
  ok(diagnostic?.schema === 'gallery-bilingual-title-gap-diagnostic-v1'
    && Array.isArray(diagnostic.missingTitles)
    && diagnostic.summary?.doisMissingSavedChineseTitle === 278,
    'invalid_278_doi_diagnostic');
  ok(Array.isArray(manifests) && manifests.length === EDITORIAL_PARTS.length,
    'editorial_manifest_count_mismatch');

  const expected = new Map();
  for(const row of diagnostic.missingTitles) {
    const doi = normalize(row?.doi);
    ok(doi && !expected.has(doi) && typeof row.titleEn === 'string'
      && !pendingTitle(row.titleEn), 'diagnostic_duplicate_or_missing_title:' + doi);
    expected.set(doi,row.titleEn);
  }
  ok(expected.size === 278, 'incorrect_missing_title_diagnostic_size');

  const translations=new Map();
  for (let n=0;n<manifests.length;n++) {
    const part=manifests[n];
    ok(part?.schema === 'gallery-editorial-zh-backfill-v1'
      && part.language === 'zh-CN'
      && part.sourceDiagnostic === DIAGNOSTIC_PATH
      && part.batch === n+1 && part.expectedBatchCount === manifests.length
      && Array.isArray(part.entries)
      && part.provenance?.includes('editorial translation'),
      'invalid_editorial_translation_manifest:'+(n+1));
    for(const row of part.entries) {
      const doi = normalize(row?.doi);
      ok(doi && typeof row.doi === 'string' && doi === row.doi
        && expected.has(doi) && !translations.has(doi),
        'duplicate_unapproved_zh_doi:'+doi);
      ok(titleKey(row.titleEn) === titleKey(expected.get(doi)),
        'title_pair_not_matching_diagnostic:'+doi);
      ok(isValidZh(row.titleZh) && row.titleZh.trim().length >= 5
        && row.titleZh.trim().length <= 350,
        'invalid_editorial_zh_title:'+doi);
      translations.set(doi,row.titleZh.trim());
    }
  }
  ok(translations.size === expected.size,
    'editorial_zh_coverage_incomplete:'+translations.size+'/'+expected.size);
  return {expected,translations};
}

/**
 * Pure transform shared by isolated real-corpus and negative tests.
 * canonicalPapers must be the exact authorized DOI union, with duplicate
 * source values already merged under the existing Pages release precedence.
 */
export function completeBilingualTitlePresentation({
  canonicalPapers, supplement, diagnostic, manifests
}) {
  ok(Array.isArray(canonicalPapers) && canonicalPapers.length>0,
    'canonical_approved_source_rows_required');
  ok(supplement && Array.isArray(supplement.papers),
    'derived_pages_supplement_required');

  const canonical=new Map();
  for(const row of canonicalPapers) {
    const doi=normalize(row?.doi||row?.url);
    ok(doi && !canonical.has(doi),'duplicate_or_invalid_canonical_doi:'+doi);
    canonical.set(doi,{...row,doi});
  }
  const currentSupplement=new Map();
  for(const row of supplement.papers) {
    const doi=normalize(row?.doi||row?.url);
    ok(doi && canonical.has(doi) && !currentSupplement.has(doi),
      'unapproved_or_duplicate_derived_supplement_doi:'+doi);
    currentSupplement.set(doi,{...row,doi});
  }
  // Existing derived rows take normal canonical last-writer precedence.
  const combined=new Map([...canonical].map(([doi,paper]) => [
    doi,{...paper,...(currentSupplement.get(doi)||{}),doi}
  ]));
  const {expected,translations}=validatedManifestEntries(diagnostic,manifests);
  const sourceCount=Number(diagnostic.summary.totalPublishedDois);
  // A later authorized 08:00 release can add new DOI records. Never freeze the
  // whole catalog to the 2026-10-10 count.
  ok(canonical.size>=Math.min(sourceCount,canonical.size) && canonical.size>0,
    'canonical_member_set_empty');
  let applied=0,alreadyReviewed=0,notMember=0,bundledMaterialized=0;
  const patches=new Map();

  const offer=(doi,zh,reason) => {
    const present=combined.get(doi);
    ok(present && !pendingTitle(present.title),
      'approved_doi_without_valid_english_title:'+doi);
    const prior=currentSupplement.get(doi);
    // Only titleZh changes on any existing derived paper; a newly inserted
    // presentation row is an exact copy of a currently approved DOI source.
    const base=prior||canonical.get(doi);
    const patch={...base,title:present.title,titleZh:zh,doi};
    if(prior) {
      ok(Object.keys(patch).filter(k=>!['titleZh'].includes(k)).every(k=>
        JSON.stringify(patch[k]) === JSON.stringify(base[k])),
      'non_chinese_field_mutation:'+doi);
    }
    patches.set(doi,patch);
    combined.set(doi,{...present,titleZh:zh});
    return reason;
  };

  for(const [doi,zh] of translations) {
    if(!combined.has(doi)){
      // DOI may have been explicitly withdrawn by a later approved review.
      notMember++;
      continue;
    }
    const paper=combined.get(doi);
    ok(titleKey(paper.title)===titleKey(expected.get(doi))
      || isValidZh(paper.titleZh),
      'editorial_chinese_title_stale_english_source:'+doi);
    if(isValidZh(paper.titleZh)) {
      alreadyReviewed++;
      continue; // Respect a newer reviewer-provided titleZh.
    }
    offer(doi,zh,'editorial_zh');
    applied++;
  }

  // Older curated DOI-specific translations already shipped as a bundled
  // registry must also enter the canonical all-time card/search view, not only
  // a browser cache. Preserving publisher titles takes priority.
  for(const [doi,row] of combined) {
    if(isValidZh(row.titleZh)) continue;
    const fallback=chineseTitle(row,new Map());
    if(!isValidZh(fallback)) continue;
    offer(doi,fallback,'bundled_zh');
    bundledMaterialized++;
  }
  // Fail closed rather than show an unreviewed online auto-translation as
  // if it were a fully covered, verified authoritative Chinese title.
  const missing=[];
  for(const [doi,row] of combined) if(!isValidZh(row.titleZh)
    || pendingTitle(row.title)) missing.push(doi);
  ok(missing.length===0,'full_corpus_bilingual_title_missing:'+missing.slice(0,35).join(','));

  const papers=supplement.papers.map(p=>patches.get(normalize(p?.doi||p?.url))||p);
  for(const [doi,p] of patches) if(!currentSupplement.has(doi))papers.push(p);
  ok(new Set(papers.map(p=>normalize(p?.doi||p?.url))).size===papers.length,
    'duplicate_derived_paper');
  ok(papers.every(p=>canonical.has(normalize(p?.doi||p?.url))),
    'offslot_literature_admission_detected');
  const allTitles=[...combined.values()].map(p=>({
    title:p.title,zh:p.titleZh,doi:normalize(p.doi)
  }));
  return {
    supplement:{
      ...supplement,papers,
      fullBilingualTitleCoverage:{
        schema:'gallery-full-bilingual-title-coverage-v1',
        diagnostic:DIAGNOSTIC_PATH,
        manifestFiles:[...EDITORIAL_PARTS],
        memberCount:canonical.size, covered:canonical.size,
        editorialTranslationsApplied:applied,
        newerReviewerTranslationsPreserved:alreadyReviewed,
        withdrawnHistoricalDois:notMember,
        bundledTranslationsMaterialized:bundledMaterialized,
        remaining:0
      }
    },
    allTitles,
    summary:{
      approvedDois:canonical.size,englishCovered:canonical.size,
      chineseCovered:canonical.size,englishMissing:0,chineseMissing:0,
      targetDiagnostic:expected.size,editorialApplied:applied,
      approvedAlreadyTranslated:alreadyReviewed,
      withdrawnTargets:notMember,
      bundledMaterialized,
      derivedPapers:papers.length,
      newLiteratureAdmissions:0,publicationDateChanges:0,
      protectedSourceChanges:0
    }
  };
}

export async function applyFullBilingualTitleCoverageToPages(root=process.cwd()) {
  const at=name=>path.resolve(root,name);
  const [rawDiagnostic,rawSupplement,rawManifests,...data]=await Promise.all([
    readFile(at(DIAGNOSTIC_PATH),'utf8'),
    readFile(at('public/literature-supplement.json'),'utf8'),
    Promise.all(EDITORIAL_PARTS.map(p=>readFile(at(p),'utf8'))),
    ...DATA_FILES.map(name=>readFile(at('public/'+name),'utf8'))
  ]);
  const diagnostic=JSON.parse(rawDiagnostic);
  const supplement=JSON.parse(rawSupplement);
  const manifests=rawManifests.map(t=>JSON.parse(t));
  const contents=Object.fromEntries(DATA_FILES.map((name,i)=>[name,data[i]]));
  const approved=collectPapers(contents,isExcludedDoi);
  const marker=JSON.parse(await readFile(at('audit/publication-release-state.json'),'utf8'));
  ok(approved.size===marker.productionCards,'authorized_08_slot_doi_count_mismatch');
  const result=completeBilingualTitlePresentation({
    canonicalPapers:[...approved.values()],supplement,diagnostic,manifests
  });
  const translationPath=at('public/title-translations-zh.json');
  let existing={translations:[]};
  try{existing=JSON.parse(await readFile(translationPath,'utf8'))}
  catch(error){if(error.code!=='ENOENT')throw error}
  ok(Array.isArray(existing.translations),'existing_translation_cache_invalid');
  const merged=new Map(existing.translations
    .filter(row=>typeof row?.title==='string'&&isValidZh(row.zh))
    .map(row=>[titleKey(row.title),{title:row.title,zh:row.zh}]));
  const conflicts=[];
  for(const {title,zh,doi} of result.allTitles){
    const key=titleKey(title);
    ok(key,'invalid_published_english_title:'+doi);
    const prev=merged.get(key);
    if(prev&&prev.zh!==zh&&prev.doi)conflicts.push(doi);
    merged.set(key,{title,zh});
  }
  ok(conflicts.length===0,'ambiguous_public_title_translation:'+conflicts.join(','));
  // All checks and source reads complete before modifying generated assets.
  await writeFile(at('public/literature-supplement.json'),JSON.stringify(result.supplement));
  await writeFile(translationPath,JSON.stringify({
    ...existing,translations:[...merged.values()]
  }));
  await writeFile(at('public/bilingual-title-coverage.json'),pretty({
    schema:'gallery-bilingual-title-coverage-v1',...result.summary,
    diagnostic:DIAGNOSTIC_PATH,manifests:[...EDITORIAL_PARTS]
  }));
  console.log('FULL_BILINGUAL_TITLE_COVERAGE '+JSON.stringify(result.summary));
  return result.summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  await applyFullBilingualTitleCoverageToPages();
}
