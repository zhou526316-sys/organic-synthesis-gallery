import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {isExcludedDoi} from '../shared/literature-policy.js';

const manifest=JSON.parse(readFileSync('audit/historical-reviewed/approved-admissions.json','utf8'));
const evidence=JSON.parse(readFileSync('audit/historical-reviewed/2026-10-16-q3-six-acs-original-two-pass.json','utf8'));
const official=JSON.parse(readFileSync('public/toc-demand-live.json','utf8'));
const expected=[
  ['10.1021/acs.joc.6c00182','2026-07-02','JOC','158a2415687e4a0ecf0c588356f417cc1679d70a','e9329cb8a744736f9ad34288c1d3d0d6c54aef61','00ad1bd997c7e2b3d7d340caf44df2e3f661cdcda8c1978d5048de9bbacde8f7'],
  ['10.1021/acs.joc.6c01588','2026-08-24','JOC','30ad0c3b51b48a210e90d8fe19b56412b1c94f7a','177ce47f670497b4972af032a9644a7a2c3c415b','713253fb6cb7d97c32fcb4cbc8e03e50b2910024b6ad4119d6af99faf5d40eb2'],
  ['10.1021/acs.orglett.6c02387','2026-07-28','Organic Letters','67f6960bccfa31a1d2477390309426061dc65563','45c411bb7519f5d80e4fd04071712c17d7a24af9','0a6b01c9f69433c2bd3e8e0c008e3e872e2e5c2e70b65b3d341e55f9868a5e61'],
  ['10.1021/acs.orglett.6c02217','2026-08-18','Organic Letters','9b28580b6638049b3007fea208c8d489c769ed79','5ff040b285c4168e2a317ffd6af3f0ed9c107e0c','4e0a55312a755bc2654efdcb628c9f9d4ffdf94cffa1c7e82a9e8a0fa1d474f6'],
  ['10.1021/acscatal.6c05124','2026-08-05','ACS Catalysis','8170ee7aca54bb199f18c0d0e91bfff4527e0874','b49a4de7ea6a7a5db35510431b14d6ed2714db0f','037efd0e9bfd958b1a7dc9cd9bd07598bea808f7187d844bce038a1d97362919'],
  ['10.1021/acscatal.6c05113','2026-09-26','ACS Catalysis','744c512a24b0c00c68b0d1b6895c3b3c351e88fa','5ad5a7c291a5a5aafd08cd2fc932dc1df7da684f','9c7a0340d23b2a880cca27c4b79b96253a37d56806969a763b34ccda39613ce3']
];

test('six newly approved source-complete original preparations, no duplicate and full two-pass review',()=>{
 assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
 assert.equal(manifest.newOctober16SixAcsOriginalMethods.count,6);
 assert.equal(manifest.summary.checked,manifest.accepted.length+manifest.pending.length);
 assert.equal(manifest.pending.length,2);
 assert.equal(new Set(manifest.accepted.map(x=>x.doi)).size,manifest.accepted.length);
 assert.equal(evidence.batchDois.length,6);
 assert.deepEqual(new Set(manifest.newOctober16SixAcsOriginalMethods.approvedDois),new Set(expected.map(x=>x[0])));
 for(const [doi,day,journal,rawBlob,queueBlob,sourceSha] of expected){
  const x=manifest.accepted.find(v=>v.doi===doi);
  const ev=evidence.batchDois.find(v=>v.doi===doi);
  assert.ok(x&&ev,doi);
  assert.equal(x.journal,journal);
  assert.equal(x.date,day);
  assert.equal(x.reviewEvidence.publisherOnlineDate,day);
  assert.equal(x.reviewEvidence.firstOnlineDateEvidence.officialPublisherFirstOnline,day);
  assert.equal(x.reviewEvidence.stageBatchSha,rawBlob);
  assert.equal(x.reviewEvidence.sourceReviewQueueGitBlobSha,queueBlob);
  assert.equal(x.reviewEvidence.stageSourceSha256,sourceSha);
  assert.equal(ev.rawGitBlob,rawBlob);
  assert.equal(ev.reviewQueueGitBlob,queueBlob);
  assert.equal(ev.stageRootSha256,sourceSha);
  assert.equal(x.reviewPasses,2);
  assert.deepEqual(x.independentPasses.map(z=>z.decision),['include','include']);
  assert.equal(x.challengeDecision,'include');
  assert.equal(x.mediaPolicy,'toc_only');
  assert.equal(x.addedDate,'');
  assert.equal(x.new,false);
  assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  assert.equal(x.reviewEvidence.abstractCopied,false);
  assert.equal(x.reviewEvidence.figureFetched,false);
  assert.equal(x.reviewEvidence.pdfFetched,false);
  assert.equal(validChineseTitle(x.titleZh),true);
  assert.equal(isExcludedDoi(doi),false);
  for(const field of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
   assert.ok(x.scopeAssessment[field].length>=35,doi+':'+field);
  const already=official.articles.find(y=>y.doi===doi);
  if(already){
   // Subsequent legitimate 08:00 admission is allowed, but never as today's fresh paper.
   assert.equal(already.ingestionChannel,'historical_backfill');
   assert.equal(already.mediaPolicy,'toc_only');
   assert.equal(already.addedDate,'');
   // Formal historical cards may omit an explicit default false flag.
    assert.notEqual(already.new,true);
    assert.equal(already.date,day);
  }
 }
});

test('scientific boundaries: distinguish ee/yield, conversion, mechanism inference and substrate scope',()=>{
 const p=new Map(manifest.accepted.map(x=>[x.doi,x]));
 assert.match(p.get('10.1021/acs.joc.6c00182').scopeAssessment.generalityEvidence,/82%/);
 assert.match(p.get('10.1021/acs.joc.6c01588').scopeAssessment.generalityEvidence,/20倍/);
 assert.match(p.get('10.1021/acs.orglett.6c02387').scopeAssessment.generalityEvidence,/99%/);
 assert.match(p.get('10.1021/acs.orglett.6c02217').scopeAssessment.boundaryChallenge,/噻蒽盐/);
 assert.match(p.get('10.1021/acscatal.6c05124').scopeAssessment.generalityEvidence,/转化率/);
 assert.match(p.get('10.1021/acscatal.6c05113').scopeAssessment.generalityEvidence,/10次/);
 assert.equal(evidence.guards.noFormalPublication,true);
 assert.equal(evidence.guards.noMediaWrites,true);
 assert.equal(evidence.guards.noPdfOrSI,true);
});
