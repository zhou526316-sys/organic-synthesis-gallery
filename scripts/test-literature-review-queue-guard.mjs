import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publisherOnlyReviewEligible,exclusionRecheckBelongsToPrimaryWindow,
  buildUnverifiedPublisherBacklog,mergeHistoricalRecheckBacklog
} from './lib/literature-review-queue-guard.mjs';
const primary='2026-10-11',end='2026-10-13';
const wiley={doi:'10.1002/anie.7360177',journal:'Angew',title:'A Cytochrome P450 Enzyme-Catalyzed Acetyl Migration',
  date:'',feedDate:'2026-10-10',publisherFeedUrl:'https://onlinelibrary.wiley.com/feed/15213773/most-recent',
  sources:['publisher-feed:Angew']};
test('previous-week Wiley RSS entries are held for DOI/date verification, never removed',()=>{
  assert.equal(publisherOnlyReviewEligible(wiley,primary,end),false);
  assert.equal(publisherOnlyReviewEligible({...wiley,feedDate:'2026-10-12'},primary,end),true);
  assert.equal(publisherOnlyReviewEligible({...wiley,feedDate:''},primary,end),false);
});
test('cross-source verified registered DOI still flows through normal review even with older RSS date',()=>{
  const cross={...wiley,date:'2026-10-12',sources:[...wiley.sources,'crossref:1521-3773:online']};
  assert.equal(publisherOnlyReviewEligible(cross,primary,end),true);
  assert.equal(publisherOnlyReviewEligible({...cross,date:''},primary,end),true);
});
test('historical changed-abstract DOI does not flood fresh three-day review',()=>{
  assert.equal(exclusionRecheckBelongsToPrimaryWindow({date:'2026-09-19'},primary,end),false);
  assert.equal(exclusionRecheckBelongsToPrimaryWindow({date:'2026-10-09'},primary,end),false);
  assert.equal(exclusionRecheckBelongsToPrimaryWindow({date:'2026-10-12'},primary,end),true);
  assert.equal(exclusionRecheckBelongsToPrimaryWindow({date:''},primary,end),false);
});
test('publisher-only undated entries survive changing RSS windows until metadata is verified',()=>{
  const older=[wiley,{...wiley,doi:'10.1002/anie.8888888',title:'One old unknown'}];
  const active=[{...wiley,title:'Improved article title',feedDate:'2026-10-11'}];
  const list=buildUnverifiedPublisherBacklog(older,active);
  assert.equal(list.length,2);
  const item=list.find(x=>x.doi===wiley.doi);
  assert.equal(item.title,'Improved article title');
  assert.equal(item.feedDate,'2026-10-11');
  assert.equal(item.status,'first_online_date_unverified');
  const resolved=buildUnverifiedPublisherBacklog(older,active,{
    discoveredDoiSet:new Set([wiley.doi]),
    galleryDoiSet:new Set(['10.1002/anie.8888888']),
  });
  assert.equal(resolved.length,0);
});
test('historical changed-evidence challenges are retained and confirmed exclusions cannot re-enter',()=>{
  const row={doi:'10.1038/s41467-026-78111-w',journal:'Nature Communications',
    title:'Contact-electro-catalyzed direct hydroxylation of aromatic C-H bonds under ambient conditions',
    date:'2026-09-28',reason:'new_substantive_abstract_after_previous_exclusion',
    previousReviewFile:'review-2026-10-09-0800.json',reviewPriority:'high'};
  const pending=mergeHistoricalRecheckBacklog([row],[row],new Map([[row.doi,{decision:'exclude'}]]),new Set());
  assert.equal(pending.length,1);
  assert.equal(pending[0].status,'historical_evidence_challenge_pending');
  assert.equal(mergeHistoricalRecheckBacklog([row],[row],new Map(),new Set([row.doi])).length,0);
  assert.equal(mergeHistoricalRecheckBacklog([row],[row],new Map([[row.doi,{decision:'include'}]]),new Set()).length,0);
});
