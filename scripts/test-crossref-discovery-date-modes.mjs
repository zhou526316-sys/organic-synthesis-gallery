import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CROSSREF_DATE_MODES,crossrefModeQuery,wasRecentlyDeposited} from './lib/crossref-discovery-date-modes.mjs';
const q={queryStart:'2026-09-19',rescueStart:'2026-10-07',endDate:'2026-10-13'};
test('Crossref DOI discovery checks online/published/created plus recent redeposits',()=>{
  assert.deepEqual(CROSSREF_DATE_MODES,['online','published','created','deposited']);
  assert.equal(crossrefModeQuery('online',q).filter,'from-online-pub-date:2026-09-19,until-online-pub-date:2026-10-13');
  assert.equal(crossrefModeQuery('published',q).filter,'from-pub-date:2026-09-19,until-pub-date:2026-10-13');
  assert.equal(crossrefModeQuery('created',q).filter,'from-created-date:2026-09-19,until-created-date:2026-10-13');
  assert.equal(crossrefModeQuery('deposited',q).filter,'from-deposit-date:2026-10-07,until-deposit-date:2026-10-13');
});
test('deposited re-registration uses seven-day rescue instead of unrestricted backlog',()=>{
  const mode=crossrefModeQuery('deposited',q);
  assert.equal(mode.modeStart,q.rescueStart);
  assert.notEqual(mode.modeStart,q.queryStart);
});
test('late redeposited original records are discoverable without falsifying first-publication date',()=>{
  const old={doi:'10.1021/acs.orglett.6c04027',date:'2026-09-22',createdDate:'2026-09-22',
    depositedDate:'2026-10-12',sources:['crossref:1523-7052:deposited']};
  assert.equal(wasRecentlyDeposited(old,'2026-10-07','2026-10-13'),true);
  assert.equal(wasRecentlyDeposited({...old,depositedDate:'2026-09-28'},'2026-10-07','2026-10-13'),false);
  assert.equal(wasRecentlyDeposited({...old,sources:['openalex:S1']},'2026-10-07','2026-10-13'),false);
});
test('reject invalid date modes and malformed windows',()=>{
  assert.throws(()=>crossrefModeQuery('unknown',q),/invalid_crossref_discovery_mode/);
  assert.throws(()=>crossrefModeQuery('deposited',{...q,rescueStart:'2026-10-14'}),/invalid_crossref_date_window/);
});
