import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const loader=fs.readFileSync('cloudflare/scripts/build-bridge-loader.mjs','utf8');
const start=source.indexOf('  async function readMissingCaptureInventory(');
const end=source.indexOf('  function missingCaptureDecision(',start);
assert.ok(start>0&&end>start,'exact inventory reader boundary');

test('the long manual DOI queue no longer rereads 1180 DOI inventory every minute',()=>{
 assert.match(source,/INVENTORY_FULL_REFRESH_MIN_MS = 10 \* 60 \* 1000/);
 const manual=source.slice(source.indexOf('  async function runManualFromHead('),
    source.indexOf('\n  function completeControllerResume('));
 assert.match(manual,/Date\.now\(\)-checkedAt>=INVENTORY_FULL_REFRESH_MIN_MS/);
 assert.doesNotMatch(manual,/Date\.now\(\)-checkedAt>=60000/);
 assert.match(manual,/beginFreshInventory\(\);s\.phase='running';manualSummary\(run\)/);
});

test('exhausted 16s media transport is not immediately retried for another 16s',()=>{
 const reader=source.slice(start,end);
 assert.match(reader,/inventory_transport_failed\|inventory_deadline/);
 assert.match(reader,/!\/\(\?:inventory_transport_failed\|inventory_deadline\)/);
 assert.match(reader,/return cache\.get\(key\)\|\|null/);
 assert.match(reader,/var complete=mediaRows\.length===dois\.length/);
 assert.match(reader,/return \{items:mediaRows,complete:complete\}/);
});

test('the security and historical cohort scopes remain untouched',()=>{
 assert.ok(source.includes("var RECENT_FULL_CAPTURE_CUTOFF = '2026-10-01';"));
 assert.ok(source.includes("tocOnlyCaptureEligible(job)"));
 assert.match(source,/if\(\!controllerPaused\(\)\)/);
 assert.ok(source.includes("var VERSION = '6.2.20';"));
 assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.41';"));
 assert.ok(source.includes("var INSTALL_REVISION = '6.2.72';"));
 assert.ok(loader.includes("const loaderVersion = '2.2.91';"));
});

test('manual restart remains available without waiting for the periodic refresh slot',()=>{
 assert.ok(source.includes("function forceStartFromHead("));
 assert.ok(source.includes("function readMissingCaptureInventory(queue,run)")||
   source.includes("async function readMissingCaptureInventory(queue,run)"));
 assert.ok(source.includes("function beginFreshInventory()"));
 assert.ok(source.includes("queue=await getJson(QUEUE_URL+'?ts='+Date.now());queueIdentity();beginFreshInventory();"));
});

console.log('TM_INVENTORY_LONG_RUN_BUDGET '+JSON.stringify({checks:4,publisherRequests:0,mediaWrites:0}));
