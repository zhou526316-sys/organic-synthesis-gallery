import test from 'node:test';
import assert from 'node:assert/strict';
import {publisherDateReviewQueue,generatePublisherDateReviewQueue} from './build-publisher-date-review-queue.mjs';

const fixed={doi:'10.1038/s41586-026-11242-8',
  title:'Catalytic transfer of carbon atoms enables spirofusion of C–C σ-bonds',
  journal:'Nature',date:'2026-10-14',dateUnverified:true,authors:[],addedDate:'2026-10-15'};
const joc={doi:'10.1021/acs.joc.6c01769',title:'Practical fluorination',journal:'JOC',
  date:'2026-10-15',dateUnverified:false,authors:['Real author'],addedDate:'2026-10-14',createdDate:'2026-10-13'};
const rsc={doi:'10.1039/d6sc06571f',title:'Stereoregulated polymer synthesis',journal:'Chemical Science',
  date:'',dateUnverified:true,authors:['Author'],addedDate:'2026-10-14',createdDate:'2026-10-13'};
const source={mode:'slot-release',publicationSlot:'2026-10-15T08:00:00+08:00',productionCards:3};
test('verified Nature is closed, while same-day JOC and created-only RSC remain queued',()=>{
  const res=publisherDateReviewQueue([fixed,joc,rsc],source,'2026-10-15');
  assert.equal(res.catalogCount,3);
  assert.equal(res.dateLabelsNotMarkedProvisional,1);
  assert.equal(res.unresolvedPublisherFirstOnlineDates,2);
  assert.deepEqual(res.issues.map(z=>z.doi),['10.1021/acs.joc.6c01769','10.1039/d6sc06571f']);
  assert.equal(res.issues[0].proposedFirstOnlineDate,'2026-10-15');
  assert.equal(res.issues[0].crossrefCreatedDate,'2026-10-13');
  assert.equal(res.issues[0].dateEvidenceStatus,'unverified');
  assert.equal(res.issues[1].proposedFirstOnlineDate,null);
  assert.equal(res.issues[1].crossrefCreatedDate,'2026-10-13');
});
test('unknown papers cannot be treated as verified merely by moving one day forward',()=>{
  const res=publisherDateReviewQueue([joc],{productionCards:1},'2026-10-16');
  assert.equal(res.unresolvedPublisherFirstOnlineDates,1);
});
test('rejects DOI truncation and catalog incompleteness instead of masking gaps',()=>{
  assert.throws(()=>publisherDateReviewQueue([{...joc,doi:'10.1021/acs.joc.6c01 769'}],{productionCards:1},'2026-10-15'));
  assert.throws(()=>publisherDateReviewQueue([joc],{productionCards:1151},'2026-10-15'));
});
test('actual protected Gallery corpus yields stable total and excludes fully verified Nature DOI',()=>{
  const result=generatePublisherDateReviewQueue(process.cwd(),'2026-10-15');
  assert(result.catalogCount>500);
  assert.equal(result.dateLabelsNotMarkedProvisional+result.unresolvedPublisherFirstOnlineDates,result.catalogCount);
  assert(!result.issues.some(z=>z.doi==='10.1038/s41586-026-11242-8'));
  // Existing pending DOI remain tracked until their individual publisher proof
  // is explicitly promoted by a future authorized metadata correction.
  assert(result.issues.every(z=>z.status==='publisher_first_online_evidence_needed'));
});
