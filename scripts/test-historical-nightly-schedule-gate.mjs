import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shouldRunHistoricalNight,beijingParts} from './historical-nightly-schedule-gate.mjs';
const check=(event,prior,now)=>shouldRunHistoricalNight(event,prior?{lastRunStarted:prior}:null,new Date(now));
test('regular 23:00 success makes 23:09 fallback a no-op',()=>{
  assert.equal(check('schedule','2026-10-11T15:02:00Z','2026-10-11T15:09:00Z'),false);
});
test('GitHub four-hour midnight delay must not duplicate 23:00 and 23:09',()=>{
  assert.equal(check('schedule','2026-10-11T19:17:00Z','2026-10-11T19:27:00Z'),false);
  assert.equal(check('schedule','2026-10-11T15:03:00Z','2026-10-11T19:27:00Z'),false);
});
test('next evening scheduled collection proceeds even after delayed prior night',()=>{
  assert.equal(check('schedule','2026-10-11T19:17:00Z','2026-10-12T15:00:00Z'),true);
});
test('daytime rescue should not suppress tonight scheduled collector',()=>{
  assert.equal(check('schedule','2026-10-12T04:42:00Z','2026-10-12T15:00:00Z'),true);
  assert.equal(check('schedule','2026-10-12T11:42:00Z','2026-10-12T15:00:00Z'),true);
});
test('manual requests always run under the already established staging guard',()=>{
  assert.equal(check('push','2026-10-12T15:00:00Z','2026-10-12T15:09:00Z'),true);
  assert.equal(check('workflow_dispatch','2026-10-12T15:00:00Z','2026-10-12T15:09:00Z'),true);
});
test('uninitialized and invalid timestamps handled correctly',()=>{
  assert.equal(check('schedule',null,'2026-10-12T15:09:00Z'),true);
  assert.deepEqual(beijingParts('2026-10-12T15:00:00Z'),{day:'2026-10-12',hour:23});
  assert.throws(()=>beijingParts('invalid'),/historical_schedule_invalid_timestamp/);
});
