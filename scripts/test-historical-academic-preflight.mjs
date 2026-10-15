import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rankEvidence,buildAcademicBatch,runAcademicPreflight,SCHEMA}
  from './historical-academic-preflight.mjs';

const sha='a'.repeat(64);
const row=(doi,title,journal='JACS',priority='P0')=>({
  doi,title,journal,priority,firstAuthor:'A Author',
  apiDateCandidate:'2026-08-10',sourceRootIds:['2026-08-08_2026-08-14_jacs'],
  sourceHashes:[sha]
});
const docs=[
 row('10.1021/jacs.6c11111',
  'Enantioselective palladium catalyzed C–N cross-coupling of aryl halides'),
 row('10.1021/jacs.6c11112',
  'Asymmetric Hydration and Protonation Switching of Dual Aspartates Drive Flagellar Rotation'),
 row('10.1038/s41586-026-09999-1',
  'Asymmetric prefrontal representations for leader-follower dynamics','Nature'),
 row('10.1038/s41557-026-09999-2',
  'Photoredox organocatalytic enantioselective C–C bond construction','Nature Chemistry'),
 row('10.1021/jacs.6c11113',
  'TiFe2 reticular MOF catalyzed decarboxylative Giese reaction')
];
test('real synthetic transformations rank above unrelated asymmetric biology while keeping recall',()=>{
  const a=rankEvidence(docs[0]),b=rankEvidence(docs[1]),
    c=rankEvidence(docs[2]),d=rankEvidence(docs[3]),e=rankEvidence(docs[4]);
  assert.ok(a.score>b.score);
  assert.ok(d.score>c.score);
  assert.ok(e.score>c.score);
  assert.equal(b.offTopicTitleRisk,true);
  assert.equal(c.offTopicTitleRisk,true);
  assert.equal(e.offTopicTitleRisk,false);
  assert.equal(a.noAutomaticScopeDecision,true);
});
test('160 max DOI evidence packets contain no fictitious academic admission, lossless original page',()=>{
 const batch=buildAcademicBatch(docs,{mode:'q3',batchSize:160,
 sourceTotal:11246,worklistTimestamp:'2026-10-15T12:26:10.685Z',
 sourceWorklistHash:'f'.repeat(64)});
 assert.equal(batch.schemaVersion,SCHEMA);
 assert.equal(batch.selected,5);
 assert.equal(batch.sourceRowsInProvidedPage,5);
 assert.equal(batch.sourceTotalUnreviewed,11246);
 assert.equal(new Set(batch.candidates.map(x=>x.doi)).size,5);
 assert.ok(batch.candidates.find(x=>x.doi==='10.1021/jacs.6c11112'));
 assert.ok(batch.candidates.find(x=>x.doi==='10.1038/s41586-026-09999-1'));
 for(const x of batch.candidates){
   assert.equal(x.decision,'unreviewed');
   assert.equal(x.publicationAuthority,false);
   assert.equal(x.scienceFirstPass,'not_performed');
   assert.equal(x.scienceAdversarialPass,'not_performed');
   assert.equal(x.truePublisherOnlineDate,null);
   assert.equal(x.publisherCategory,null);
   assert.deepEqual(x.sourceProof.sourceSha256Hashes,[sha]);
 }
 assert.equal(batch.guards.lowRankDoesNotRemoveOriginalCandidates,true);
 assert.equal(batch.guards.noAutomaticIncludeOrExclude,true);
 assert.equal(batch.guards.noD1,true);
});
test('an evidence page over 200 never bypasses size bounds; source hashes/duplicates are required',()=>{
 assert.throws(()=>buildAcademicBatch(docs,{batchSize:201}),/historical_preflight_invalid_arguments/);
 assert.throws(()=>buildAcademicBatch([...docs,docs[0]],{batchSize:20}),
 /historical_preflight_invalid_or_duplicate_Doi/);
 assert.throws(()=>buildAcademicBatch([{...docs[0],sourceHashes:['0'.repeat(40)]}],{batchSize:20}),
 /historical_preflight_source_identity_untrusted/);
 assert.throws(()=>buildAcademicBatch([{...docs[0],doi:'junk'}],{batchSize:20}),
 /historical_preflight_invalid_or_duplicate_Doi/);
});
test('160-record batch selection spans high-priority journals, retains low title cues for downstream reviewers',()=>{
 const rows=Array.from({length:180},(_,i)=>{
  const j=i%3===0?'JACS':i%3===1?'Organic Letters':'Nature';
  return row('10.1021/jacs.6c'+String(i).padStart(5,'0'),
   i%4===0?'Enantioselective C–C carbonylative coupling reaction':
   i%4===1?'Asymmetric prefrontal representations in neural circuits':
   i%4===2?'Polymer material interfacial photoluminescence':
   'Skeletal editing to nitrogen heterocycles',j);
 });
 const batch=buildAcademicBatch(rows,{mode:'q3',batchSize:160,sourceTotal:11246});
 assert.equal(batch.selected,160);
 assert.equal(new Set(batch.candidates.map(x=>x.doi)).size,160);
 assert.equal(batch.journalCoverage.length,3);
 assert.ok(batch.candidates.some(x=>x.evidenceRank.score<=0));
 assert.ok(batch.candidates.some(x=>x.evidenceRank.score>=7));
});
test('staging packet runner has zero network/production writes and independently hashed input records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gallery-academic-preflight-')),root=join(dir,'stage');
 const prev={a:process.env.HISTORICAL_STAGING_ONLY,
  b:process.env.HISTORICAL_STAGING_BRANCH},originalFetch=global.fetch;
 try{
  await mkdir(root,{recursive:true});
  const q3={schemaVersion:'gallery-historical-q3-source-and-scope-v1',
   generatedAt:'2026-10-15T12:26:10.685Z',rows:docs,
   selected:5,totalUnreviewedCandidates:11246,
   noAutomaticAcademicDecision:true,noCloudflareD1Access:true};
  const global={schemaVersion:'gallery-history-review-worklist-v1',
   producedAt:'2026-10-15T12:26:10.685Z',
   mode:'scientific_review_worklist_only_not_scope_decision',
   noAutomatedIncludesOrExcludes:true,worklist:docs.map(p=>({
     ...p,date:p.apiDateCandidate,sourceBatchIds:p.sourceRootIds,
     sourceFingerprints:p.sourceHashes
   })),selected:5,statusCounts:{needsReview:55056}};
  await writeFile(join(root,'quarter-2026-q3-review-worklist.json'),JSON.stringify(q3));
  await writeFile(join(root,'reviewer-worklist.json'),JSON.stringify(global));
  process.env.HISTORICAL_STAGING_ONLY='1';
  process.env.HISTORICAL_STAGING_BRANCH='1';
  global.fetch=async()=>{throw Error('unexpected_network_access')};
  const run=await runAcademicPreflight({root,batchSize:4});
  assert.equal(run.length,2);
  assert.equal(run[0].selected,4);
  assert.equal(run[1].selected,4);
  for(const name of ['q3','global']){
   const x=JSON.parse(await readFile(join(root,'academic-preflight-'+name+'.json'),'utf8'));
   assert.equal(x.sourceWorklistSha256.length,64);
   assert.equal(x.selected,4);
   assert.equal(x.guards.noExternalRequests,true);
   assert.equal(x.guards.noFormalPublication,true);
   assert.equal(x.candidates.every(y=>y.decision==='unreviewed'),true);
  }
 }finally{
  global.fetch=originalFetch;
  if(prev.a===undefined)delete process.env.HISTORICAL_STAGING_ONLY;
  else process.env.HISTORICAL_STAGING_ONLY=prev.a;
  if(prev.b===undefined)delete process.env.HISTORICAL_STAGING_BRANCH;
  else process.env.HISTORICAL_STAGING_BRANCH=prev.b;
  await rm(dir,{recursive:true,force:true});
 }
});

test('automatic bootstrap drains newly source-complete reviewer shards before packet build',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/historical-triage-bootstrap.yml',
   import.meta.url),'utf8');
 assert.match(workflow,
   /MAX_HISTORICAL_TRIAGE_ROOTS:.*workflow_run.*'320'/);
 assert.match(workflow,/node scripts\/historical-review-triage\.mjs/);
 assert.match(workflow,/node scripts\/historical-review-worklist\.mjs/);
 assert.match(workflow,/node scripts\/historical-q3-reconciliation\.mjs/);
 assert.match(workflow,/node scripts\/historical-academic-preflight\.mjs/);
 // Source-by-root reviewer shards must finish before the global worklist
 // reads them. Both are only GitHub staging files, not production admissions.
 const triage=workflow.indexOf('node scripts/historical-review-triage.mjs');
 const worklist=workflow.indexOf('node scripts/historical-review-worklist.mjs');
 const preflight=workflow.indexOf('node scripts/historical-academic-preflight.mjs');
 assert.ok(triage>=0&&triage<worklist&&worklist<preflight);
});
