import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DATA_FILES, papersFrom, collectPapers } from './pages-release-delivery.mjs';
import { applyVerifiedTitlePresentationToPages } from './apply-verified-title-presentation.mjs';
import { applyVerifiedChineseTitlePresentationToPages,
  ZH_PARTS, ENGLISH_RECEIPT } from './apply-verified-chinese-title-presentation.mjs';
import { completeBilingualTitlePresentation, applyFullBilingualTitleCoverageToPages,
  DIAGNOSTIC_PATH,EDITORIAL_PARTS } from './apply-full-bilingual-title-coverage.mjs';
import { chineseTitle, validChineseTitle } from '../shared/chinese-title-overrides.js';
import { isExcludedDoi } from '../shared/literature-policy.js';
import { titleKey } from '../shared/chinese-title-overrides.js';

const tmp=await mkdtemp(path.join(tmpdir(),'gallery-938-bilingual-'));
const inTemp=name=>path.join(tmp,name);
async function copy(name){
  await mkdir(path.dirname(inTemp(name)),{recursive:true});
  await copyFile(name,inTemp(name));
}
try {
  const protectedInputs=[
    ...DATA_FILES.map(name=>'public/'+name),'shared/literature-policy.js'
  ];
  const assets=[
    ...protectedInputs,'audit/publication-release-state.json',
    ENGLISH_RECEIPT,...ZH_PARTS,DIAGNOSTIC_PATH,...EDITORIAL_PARTS
  ];
  for(const name of assets)await copy(name);
  const snapshot=await Promise.all(protectedInputs.map(file=>readFile(file)));

  // Mirror the Pages derived-source precedence but without publisher or media
  // network requests. No changes to static source data are allowed.
  const byDoi=new Map();
  for(const name of ['curated-supplement.json','automation-supplement.json','rolling-supplement.json']){
    for(const paper of JSON.parse(await readFile('public/'+name,'utf8')).papers) {
      const doi=String(paper?.doi||'').toLowerCase();
      if(doi && !isExcludedDoi(doi))byDoi.set(doi,{
        ...(byDoi.get(doi)||{}),...paper,doi
      });
    }
  }
  await mkdir(inTemp('public'),{recursive:true});
  await writeFile(inTemp('public/literature-supplement.json'),
    JSON.stringify({generatedAt:'isolated-ci',papers:[...byDoi.values()]}));
  await writeFile(inTemp('public/title-translations-zh.json'),
    JSON.stringify({translations:[]}));
  const before=Object.fromEntries(DATA_FILES.map((name,i)=>[
    name,undefined
  ]));
  for(const name of DATA_FILES)before[name]=await readFile(inTemp('public/'+name),'utf8');

  const r1=await applyVerifiedTitlePresentationToPages(tmp);
  assert.equal(r1.verifiedReceipts,125);
  const r2=await applyVerifiedChineseTitlePresentationToPages(tmp);
  assert.equal(r2.verifiedChineseTitles,125);
  const rawPrior=JSON.parse(await readFile(inTemp('public/literature-supplement.json'),'utf8'));
  const r3=await applyFullBilingualTitleCoverageToPages(tmp);
  assert.equal(r3.approvedDois,938);
  assert.equal(r3.englishCovered,938);
  assert.equal(r3.chineseCovered,938);
  assert.equal(r3.chineseMissing,0);
  assert.equal(r3.englishMissing,0);
  assert.equal(r3.targetDiagnostic,278);
  assert.equal(r3.editorialApplied,278);
  assert.equal(r3.newLiteratureAdmissions,0);
  assert.equal(r3.protectedSourceChanges,0);

  const after=JSON.parse(await readFile(inTemp('public/literature-supplement.json'),'utf8'));
  const coverage=JSON.parse(await readFile(inTemp('public/bilingual-title-coverage.json'),'utf8'));
  assert.equal(coverage.schema,'gallery-bilingual-title-coverage-v1');
  assert.equal(coverage.chineseCovered,938);
  const finalSources={};
  const protectedByDoi={};
  for(const name of DATA_FILES){
    const original=await readFile(inTemp('public/'+name),'utf8');
    assert.equal(original,before[name],'protected static literature input modified: '+name);
    protectedByDoi[name]=before[name];
  }
  const original=collectPapers(protectedByDoi,isExcludedDoi);
  finalSources['literature-supplement.json']=JSON.stringify(after);
  const rendered=collectPapers({...protectedByDoi,...finalSources},isExcludedDoi);
  assert.equal(original.size,938);
  assert.equal(rendered.size,938);
  for(const [doi,row] of original) {
    const shown=rendered.get(doi);
    assert(shown,'formerly approved DOI removed:'+doi);
    assert.equal(shown.date,row.date,'publication date mutated:'+doi);
    assert.equal(shown.addedDate,row.addedDate,'date of admission mutated:'+doi);
    assert.deepEqual(shown.authors,row.authors,'author identities modified:'+doi);
    assert(validChineseTitle(shown.titleZh),'missing Chinese title:'+doi);
    assert(chineseTitle(shown)===shown.titleZh,
      'Chinese-mode rendering inconsistent with persisted metadata:'+doi);
    assert.equal(typeof shown.title,'string','English-mode title missing:'+doi);
    assert(!/title pending|标题待核验/i.test(shown.title),'English title placeholder:'+doi);
  }
  const translationAsset=JSON.parse(await readFile(inTemp('public/title-translations-zh.json'),'utf8'));
  const byEnglish=new Map(translationAsset.translations.map(x=>[titleKey(x.title),x.zh]));
  for(const row of rendered.values())
    assert(validChineseTitle(byEnglish.get(titleKey(row.title))),
      'English/Chinese title cache missing:'+row.doi);
  for(const [i,name] of protectedInputs.entries())
    assert.deepEqual(await readFile(inTemp(name)),snapshot[i],
      'protected source changed:'+name);

  const diag=JSON.parse(await readFile(DIAGNOSTIC_PATH,'utf8'));
  const manuscripts=await Promise.all(EDITORIAL_PARTS.map(async p=>
    JSON.parse(await readFile(p,'utf8'))));
  const canonical=[...original.values()];
  const payload={canonicalPapers:canonical,supplement:rawPrior,diagnostic:diag,manifests:manuscripts};
  const rejects=q=>assert.throws(()=>completeBilingualTitlePresentation(q));
  rejects({...payload,manifests:manuscripts.slice(1)});
  rejects({...payload,manifests:manuscripts.map((p,i)=>i===0?{
    ...p,entries:p.entries.slice(1)
  }:p)});
  rejects({...payload,manifests:manuscripts.map((p,i)=>i===0?{
    ...p,entries:[{...p.entries[0],titleEn:'Wrong DOI article'},...p.entries.slice(1)]
  }:p)});
  rejects({...payload,manifests:manuscripts.map((p,i)=>i===0?{
    ...p,entries:[{...p.entries[0],titleZh:'Title pending verification'},...p.entries.slice(1)]
  }:p)});
  rejects({...payload,manifests:manuscripts.map((p,i)=>i===0?{
    ...p,entries:[p.entries[1],p.entries[1],...p.entries.slice(2)]
  }:p)});
  rejects({...payload,manifests:manuscripts.map((p,i)=>i===0?{
    ...p,entries:[{...p.entries[0],doi:'10.9999/not-approved'},...p.entries.slice(1)]
  }:p)});
  rejects({...payload,supplement:{...rawPrior,papers:[
    ...rawPrior.papers,{...canonical[0],doi:'10.9999/off-slot-new-article'}
  ]}});

  // Later authorized 08:00 releases are permitted to grow the DOI set while
  // retaining these exact DOI/English bindings and completed historical titles.
  const future={...canonical[0],
    doi:'10.9999/new-reviewed-20261011',title:'A Future Reviewed Article',
    titleZh:'已审核新增文献标题',date:'2026-10-11',addedDate:'2026-10-11'};
  const futureResult=completeBilingualTitlePresentation({
    ...payload,canonicalPapers:[...canonical,future]
  });
  assert.equal(futureResult.summary.approvedDois,939);
  assert.equal(futureResult.summary.chineseMissing,0);
  assert.equal(futureResult.summary.newLiteratureAdmissions,0);

  // Exercise the real three-stage build adapters against a later authorized
  // catalog with 939 members. A frozen October-10 evidence receipt must not
  // block October-11 publication just because the approved DOI count grows.
  const futureRolling=JSON.parse(await readFile(inTemp('public/rolling-supplement.json'),'utf8'));
  futureRolling.papers.push(future);
  await writeFile(inTemp('public/rolling-supplement.json'),JSON.stringify(futureRolling));
  const futureMarker=JSON.parse(await readFile(inTemp('audit/publication-release-state.json'),'utf8'));
  futureMarker.productionCards=939;
  await writeFile(inTemp('audit/publication-release-state.json'),JSON.stringify(futureMarker));
  const futureEnglish=await applyVerifiedTitlePresentationToPages(tmp);
  assert.equal(futureEnglish.originalApprovedDois,939);
  const futureZh=await applyVerifiedChineseTitlePresentationToPages(tmp);
  assert.equal(futureZh.originalApprovedDois,939);
  const futureAll=await applyFullBilingualTitleCoverageToPages(tmp);
  assert.equal(futureAll.approvedDois,939);
  assert.equal(futureAll.chineseCovered,939);
  assert.equal(futureAll.chineseMissing,0);

  const frontend=await readFile('src/main.ts','utf8');
  assert(frontend.includes('scheduleMissingChineseTitleTranslations();'),
    'new archive or indexed DOI results do not trigger Chinese hydration');
  assert(frontend.includes("requestedZhTranslations.add(key)"),
    'translation retry deduplication missing');
  console.log(JSON.stringify({
    ok:true,approvedDois:938,bilingualCovered:938,
    editorial278:r3.editorialApplied,previous125:r2.verifiedChineseTitles,
    missingEnglish:0,missingChinese:0,
    protectedInputsPreserved:protectedInputs.length,
    negativeTests:7,forwardGrowthTest:true,dynamicIndexedTranslationRefresh:true
  },null,2));
} finally{
  await rm(tmp,{recursive:true,force:true});
}
