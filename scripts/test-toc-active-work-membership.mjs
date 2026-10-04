import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync('public/toc-mainline.user.js','utf8');
const match=source.match(/\/\/ BEGIN OSG_ACTIVE_WORK_MEMBERSHIP_V1([\s\S]*?)\/\/ END OSG_ACTIVE_WORK_MEMBERSHIP_V1/);
assert.ok(match,'active-work pure policy block missing');
const policy=Function(`"use strict";${match[1]};return {activeWorkParseDate,activeWorkCutoff,activeWorkShiftDays,activeWorkBeijingDate,activeWorkEligibility};`)();

for(const [date,expected] of [
  ['2026-10-04','2026-07-04'],
  ['2026-10-31','2026-07-31'],
  ['2027-05-31','2027-02-28'],
  ['2028-05-31','2028-02-29'],
  ['2026-01-31','2025-10-31'],
]) test('three-month cutoff '+date,()=>assert.equal(policy.activeWorkCutoff(date),expected));

test('Beijing date changes at UTC 16:00',()=>{
  assert.equal(policy.activeWorkBeijingDate(Date.parse('2026-10-03T15:59:59Z')),'2026-10-03');
  assert.equal(policy.activeWorkBeijingDate(Date.parse('2026-10-03T16:00:00Z')),'2026-10-04');
  assert.throws(()=>policy.activeWorkBeijingDate(NaN),/trusted_time/);
});

test('cutoff day remains Hot and prior day is Archive idle',()=>{
  assert.equal(policy.activeWorkEligibility({firstOnlineDate:'2026-07-04',datePrecision:'day',addedDate:'2026-07-04'},'2026-10-04'),'hot');
  assert.equal(policy.activeWorkEligibility({firstOnlineDate:'2026-07-03',datePrecision:'day',addedDate:'2026-07-03'},'2026-10-04'),'archive_idle');
});

test('late historical addition gets seven Beijing dates without becoming Hot',()=>{
  const r={firstOnlineDate:'2026-07-01',datePrecision:'day',addedDate:'2026-10-04'};
  assert.equal(policy.activeWorkEligibility(r,'2026-10-04'),'archive_recent_addition');
  assert.equal(policy.activeWorkEligibility(r,'2026-10-10'),'archive_recent_addition');
  assert.equal(policy.activeWorkEligibility(r,'2026-10-11'),'archive_idle');
});

test('unknown/invalid/future dates never silently enter work',()=>{
  assert.equal(policy.activeWorkEligibility({firstOnlineDate:'2026-07',datePrecision:'unknown'},'2026-10-04'),'date_review_required');
  assert.equal(policy.activeWorkEligibility({firstOnlineDate:'2026-02-31',datePrecision:'day'},'2026-10-04'),'date_review_required');
  assert.equal(policy.activeWorkEligibility({firstOnlineDate:'2026-10-05',datePrecision:'day'},'2026-10-04'),'future');
});

test('automatic and manual controllers both require verified membership',()=>{
  const calls=(source.match(/loadActiveWorkMembership\(queue\)/g)||[]).length;
  assert.ok(calls>=2,'both controller paths must load membership');
  assert.ok(source.includes("activeMembership.activeDois.has(doi)"));
  assert.ok(source.includes("r.state='retired'"));
  assert.ok(source.includes("r.state==='retired'&&coverageHasNeeds(r.job)"));
});

test('full queue remains authoritative membership and only inventory/new jobs are filtered',()=>{
  assert.ok(source.includes("pairedJobs(queue,{items:{}})"));
  assert.ok(source.includes("var currentDois=new Set(queue.articles.map"));
  assert.ok(source.includes("filter(function(doi){return run.activeMembership.activeDois.has(doi);})"));
  assert.ok(!source.includes("queue.articles=queue.articles.filter"));
});

test('architecture source is hash-bound to v2 delivery and acquisition basis',()=>{
  assert.ok(source.includes("delivery.files&&delivery.files['architecture-v1/release.json']"));
  assert.ok(source.includes("activeWorkVerifiedObject(release.membership"));
  assert.ok(source.includes("activeWorkVerifiedObject(release.acquisitionBasis"));
  assert.ok(source.includes("active_work_basis_member_mismatch"));
  assert.ok(source.includes("active_work_server_date_missing"));
});

test('installation update changes metadata only, capture protocol remains server-compatible',()=>{
  assert.ok(source.includes('// @version      6.2.21'));
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.39';"));
});
