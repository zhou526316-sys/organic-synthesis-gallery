import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyVerifiedTitlePresentationToPages } from './apply-verified-title-presentation.mjs';
import { applyVerifiedChineseTitlePresentationToPages,
  applyVerifiedChineseTitlePresentation, ZH_PARTS, ENGLISH_RECEIPT
} from './apply-verified-chinese-title-presentation.mjs';
import { chineseTitle, validChineseTitle } from '../shared/chinese-title-overrides.js';

const report=JSON.parse(await readFile(ENGLISH_RECEIPT,'utf8'));
const translations=await Promise.all(ZH_PARTS.map(p=>readFile(p,'utf8').then(JSON.parse)));
assert.equal(report.resolvedUniqueDois,125,'English backfill count regression');
assert.equal(translations.reduce((n,p)=>n+p.entries.length,0),125,
  'All English title repairs require Chinese translations');

const tmp=await mkdtemp(path.join(tmpdir(),'gallery-chinese-title-recovery-'));
try {
  await mkdir(path.join(tmp,'public'),{recursive:true});
  await mkdir(path.join(tmp,'audit/title-backfill'),{recursive:true});
  const originals=[
    'public/papers.gz.b64',
    'public/total-synthesis.json',
    'public/manual-supplement.json',
    'public/final-audit-supplement.json',
    'public/curated-supplement.json',
    'public/automation-supplement.json',
    'public/rolling-supplement.json',
  ];
  await Promise.all([
    ...originals, 'audit/publication-release-state.json',
    ENGLISH_RECEIPT,...ZH_PARTS,
  ].map(async name => { await mkdir(path.dirname(path.join(tmp,name)),{recursive:true});await copyFile(name,path.join(tmp,name)); }));
  const rows=[];
  for(const name of ['public/curated-supplement.json','public/automation-supplement.json',
    'public/rolling-supplement.json']) {
    const body=JSON.parse(await readFile(name,'utf8'));
    rows.push(...body.papers);
  }
  const unique=[...new Map(rows.map(row=>[row.doi.toLowerCase(),row])).values()];
  await writeFile(path.join(tmp,'public/literature-supplement.json'),
    JSON.stringify({generatedAt:'test-only',papers:unique}));
  await writeFile(path.join(tmp,'public/title-translations-zh.json'),
    JSON.stringify({translations:[{title:'Separate paper',zh:'单独文献'}]}));

  const before=await Promise.all(originals.map(p=>readFile(path.join(tmp,p))));
  const english=await applyVerifiedTitlePresentationToPages(tmp);
  const chinese=await applyVerifiedChineseTitlePresentationToPages(tmp);
  assert.equal(english.verifiedReceipts,125);
  assert.equal(chinese.verifiedChineseTitles,125);
  assert.equal(chinese.missingChineseTitles,0);
  assert.equal(chinese.originalApprovedDois,938);
  assert.equal(chinese.newLiteratureAdmissions,0);
  assert.equal(chinese.protectedFilesModified,0);

  const updated=JSON.parse(await readFile(path.join(tmp,'public/literature-supplement.json'),'utf8'));
  const byDoi=new Map(updated.papers.map(row=>[row.doi.toLowerCase(),row]));
  const cache=JSON.parse(await readFile(path.join(tmp,'public/title-translations-zh.json'),'utf8'));
  const byEnglish=new Map(cache.translations.map(row=>[row.title,row.zh]));
  assert.equal(updated.verifiedChineseTitlePresentation.coveredDois,125);
  assert.equal(cache.translations.find(row=>row.title==='Separate paper')?.zh,'单独文献');
  for (const entry of report.resolved) {
    const row=byDoi.get(entry.doi.toLowerCase());
    assert(row, 'DOI missing: '+entry.doi);
    assert.equal(row.title,entry.title,'English original changed: '+entry.doi);
    assert(validChineseTitle(row.titleZh),'Chinese missing: '+entry.doi);
    assert.equal(chineseTitle(row,new Map([[row.title,'无效翻译']])),row.titleZh,
      'Chinese mode must use DOI-verified metadata rather than a browser cache');
    assert.equal(byEnglish.get(row.title),row.titleZh,'offline translations incomplete: '+entry.doi);
  }
  const after=await Promise.all(originals.map(p=>readFile(path.join(tmp,p))));
  for(let i=0;i<before.length;i++)assert.deepEqual(after[i],before[i],
    'protected source modified: '+originals[i]);

  const members=new Set([...byDoi.keys()]);
  assert.equal(members.size,938,'source fixture unexpectedly incomplete');
  const payload={supplement:updated,translationPayload:translations,receipt:report,approvedDois:members};
  const fail=p=>assert.throws(()=>applyVerifiedChineseTitlePresentation(p));
  fail({...payload,translationPayload:translations.slice(0,2)});
  fail({...payload,translationPayload:translations.map((p,i)=>i===0?{
    ...p, entries:[[...p.entries[0].slice(0,1),'标题待核验'],...p.entries.slice(1)]
  }:p)});
  fail({...payload,translationPayload:translations.map((p,i)=>i===0?{
    ...p,entries:[['10.1021/jacs.unapproved','不受批准的标题'],...p.entries.slice(1)]
  }:p)});
  fail({...payload,translationPayload:translations.map((p,i)=>i===1?{
    ...p,entries:[p.entries[0],...p.entries]
  }:p)});
  fail({...payload,supplement:{...updated,papers:updated.papers.map(row=>
    row.doi===report.resolved[0].doi?{...row,title:'Mismatched English title'}:row)}});
  fail({...payload,approvedDois:new Set([...members].slice(0,-1))});
  console.log(JSON.stringify({
    ok:true,uniqueApprovedDois:members.size,bilingualTitlesVerified:125,
    missingChineseTitles:0,englishTitlesPreserved:125,
    frozenLiteratureInputsUnchanged:originals.length,
    offlineChineseAndEnglishLanguageSwap:true,
    negativeTests:6,
  },null,2));
} finally { await rm(tmp,{recursive:true,force:true}); }
