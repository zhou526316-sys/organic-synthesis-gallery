import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsHistoricalDepositReview,buildHistoricalCrossrefDepositBacklog}
  from './lib/crossref-deposit-backlog.mjs';

const old={doi:'10.1038/s41467-026-77000-1',journal:'Nature Communications',
  date:'2026-09-25',title:'An older research article newly redeposited',
  depositedDate:'2026-10-12',reviewPriority:'high'};
test('older redeposit is NOT a new October 12 paper; fresh date stays primary',()=>{
  assert.equal(needsHistoricalDepositReview(old,{
    journalRescueStart:'2026-10-07',endDate:'2026-10-13'
  }),true);
  assert.equal(needsHistoricalDepositReview({...old,date:'2026-10-10'},{
    journalRescueStart:'2026-10-07',endDate:'2026-10-13'
  }),false);
  assert.equal(needsHistoricalDepositReview(old,{
    journalRescueStart:'2026-10-07',endDate:'2026-10-13',createdRecently:true
  }),false);
});
test('unknown first-publication date with deposit-only source stays historical date investigation',()=>{
  assert.equal(needsHistoricalDepositReview({...old,date:''},{
    journalRescueStart:'2026-10-07',endDate:'2026-10-13'
  }),true);
  assert.equal(needsHistoricalDepositReview({...old,date:''},{
    journalRescueStart:'2026-10-07',endDate:'2026-10-13',
    hasIndependentPublicationDiscovery:true
  }),false);
});
test('retain redeposited unmatched DOI but protect accepted, explicitly removed, and old final exclusions',()=>{
  const fresh=buildHistoricalCrossrefDepositBacklog([],[old],{
    journalActivationDates:new Map([['Nature Communications','2026-07-01']])
  });
  assert.equal(fresh.length,1);
  assert.equal(fresh[0].date,'2026-09-25');
  assert.equal(fresh[0].depositedDate,'2026-10-12');
  assert.equal(fresh[0].status,'historical_redeposit_requires_doi_evidence_review');
  assert.equal(buildHistoricalCrossrefDepositBacklog([],[old],{acceptedDois:new Set([old.doi])}).length,0);
  assert.equal(buildHistoricalCrossrefDepositBacklog([],[old],{confirmedExcludedDois:new Set([old.doi])}).length,0);
  assert.equal(buildHistoricalCrossrefDepositBacklog([],[old],{
    reviewedHistory:new Map([[old.doi,{decision:'exclude',abstract:'already reviewed'}]])
  }).length,0);
});
test('preserve new substantive evidence on historical excluded DOI for independent two-pass challenge',()=>{
  const list=buildHistoricalCrossrefDepositBacklog([],[old],{
    reviewedHistory:new Map([[old.doi,{decision:'exclude',reviewFile:'audit/review-2026-09-26-0800.json'}]]),
    recheckReason:()=> 'new_substantive_abstract_after_previous_exclusion'
  });
  assert.equal(list.length,1);
  assert.equal(list[0].previousReviewFile,'audit/review-2026-09-26-0800.json');
  assert.equal(list[0].evidenceBasis,'new_substantive_abstract_after_previous_exclusion');
});
test('backlog survives later source feed rotations without turning into an accepted paper',()=>{
  const earlier=buildHistoricalCrossrefDepositBacklog([],[old]);
  const merged=buildHistoricalCrossrefDepositBacklog(earlier,[],{});
  assert.equal(merged.length,1);
  assert.equal(merged[0].doi,old.doi);
  assert.equal(merged[0].date,old.date);
});
test('reject DOI outside journal prospective activation dates from staged historical catchup',()=>{
  const row={...old,journal:'Chemical Science',date:'2026-09-23'};
  assert.deepEqual(buildHistoricalCrossrefDepositBacklog([],[row],{
    journalActivationDates:new Map([['Chemical Science','2026-10-01']])
  }),[]);
});
