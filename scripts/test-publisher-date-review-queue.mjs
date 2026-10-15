import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publisherDateReviewQueue,generatePublisherDateReviewQueue} from './build-publisher-date-review-queue.mjs';

const fixed={doi:'10.1038/s41586-026-11242-8',
  title:'Catalytic transfer of carbon atoms enables spirofusion of C–C σ-bonds',
  journal:'Nature',date:'2026-10-14',dateUnverified:true,authors:[],addedDate:'2026-10-15'};
const joc={doi:'10.1021/acs.joc.6c09999',title:'Unverified JOC article',journal:'JOC',
  date:'2026-10-15',dateUnverified:true,authors:['Real author'],addedDate:'2026-10-14',createdDate:'2026-10-13'};
const rsc={doi:'10.1039/d6sc00000x',title:'Unverified future RSC article without publisher evidence',journal:'Chemical Science',
  date:'',dateUnverified:true,authors:['Author'],addedDate:'2026-10-14',createdDate:'2026-10-13'};
const source={mode:'slot-release',publicationSlot:'2026-10-15T08:00:00+08:00',productionCards:3};
test('verified Nature is closed, while same-day JOC and created-only RSC remain queued',()=>{
  const res=publisherDateReviewQueue([fixed,joc,rsc],source,'2026-10-15');
  assert.equal(res.catalogCount,3);
  assert.equal(res.dateLabelsNotMarkedProvisional,1);
  assert.equal(res.unresolvedPublisherFirstOnlineDates,2);
  assert.deepEqual(res.issues.map(z=>z.doi),['10.1021/acs.joc.6c09999','10.1039/d6sc00000x']);
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
  const confirmedACS=['10.1021/acs.joc.6c01792','10.1021/acs.joc.6c01506','10.1021/acs.joc.6c01769','10.1021/acs.joc.6c01159','10.1021/acs.joc.6c01796'];
  for(const doi of confirmedACS)assert(!result.issues.some(z=>z.doi===doi),'ACS verified DOI remains queued:'+doi);
  const rscEvidence=JSON.parse(readFileSync(
    'audit/publisher-date-evidence/2026-10-15-rsc-ten-first-online.json','utf8'));
  assert.equal(rscEvidence.records.length,10);
  for(const row of rscEvidence.records)
    assert(!result.issues.some(z=>z.doi===row.doi),
      'RSC first-published date is evidenced but remains queued:'+row.doi);
  // Future unevidenced DOI remain allowed in this queue. Do not overstate
  // global publisher completeness using the Oct-15 frozen evidence only.
  assert(result.issues.every(z=>z.status==='publisher_first_online_evidence_needed'));
});
