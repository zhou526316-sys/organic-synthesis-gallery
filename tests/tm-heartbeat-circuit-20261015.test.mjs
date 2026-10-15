import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const first=source.indexOf('  function manualHeartbeatCircuitBreaker(');
const last=source.indexOf('  async function runManualFromHead(',first);
assert.ok(first>0&&last>first,'exact circuit-breaker helper must exist');
const ctx=vm.createContext({});
vm.runInContext(source.slice(first,last)+'\n globalThis.observe=manualHeartbeatCircuitBreaker;',ctx);

test('three consecutive missing publisher injections stop this pass, without marking queued DOI complete',()=>{
 const state={consecutiveHeartbeatFailures:0};
 const missing={status:'failed',reason:'bound_publisher_heartbeat_missing'};
 assert.equal(ctx.observe(state,missing),false);
 assert.equal(ctx.observe(state,missing),false);
 assert.equal(ctx.observe(state,missing),true);
 assert.equal(state.consecutiveHeartbeatFailures,3);
 assert.match(source,/s\.stopReason='publisher_script_missing_3_consecutive'/);
 assert.match(source,/s\.phase='capture_environment_blocked'/);
 assert.match(source,/if\(manualHeartbeatCircuitBreaker\(run,result\)\)/);
 assert.match(source,/if\(manualExecutionCurrent\(run\)\)\{\s*coverageStats\(run\)/);
});

test('any real publisher progress resets the consecutive missing-script streak',()=>{
 const state={consecutiveHeartbeatFailures:2};
 assert.equal(ctx.observe(state,{status:'partial',reason:'combined_capture'}),false);
 assert.equal(state.consecutiveHeartbeatFailures,0);
 assert.equal(ctx.observe(state,{status:'failed',reason:'bound_publisher_heartbeat_missing'}),false);
 assert.equal(ctx.observe(state,{status:'success',reason:'combined_capture'}),false);
 assert.equal(state.consecutiveHeartbeatFailures,0);
});

const start=source.indexOf('  async function waitManualResult(');
const finish=source.indexOf('\n  // Queue coverage is per DOI',start);
assert.ok(start>0&&finish>start,'manual publisher-wait boundary');
function waitHarness(progressStatus=''){
 let now=Date.parse('2026-10-15T07:00:00Z'),checks=0;
 class MockDate extends Date{static now(){return now;}}
 const state={Date:MockDate,GM_getValue:()=>progressStatus?{status:progressStatus}:null,
   progressKey:()=>'',currentPublisherHeartbeat:()=>null,
   manualExecutionCurrent:()=>true,controllerPaused:()=>false,renewManualLease:()=>true,
   completedPublisherResult:()=>null,nowIso:()=>new Date(now).toISOString(),
   sleep:async ms=>{checks++;now+=ms;},console};
 vm.createContext(state);
 vm.runInContext(source.slice(start,finish)+'\n globalThis.wait=waitManualResult;',state);
 return {state,clock:()=>now,checks:()=>checks};
}

test('real manual controller skips a noninjecting publisher tab near 45 seconds, not eight minutes',async()=>{
 const h=waitHarness();
 const started=h.clock();
 const result=await h.state.wait({doi:'10.1021/jacs.fixture',jobId:'fixture',startedAt:new Date(started).toISOString()},{closed:false},{});
 assert.equal(result.reason,'bound_publisher_heartbeat_missing');
 assert.ok(h.clock()-started>=45000);
 assert.ok(h.clock()-started<49000);
 assert.ok(h.checks()<100);
});

test('authentication waiting is never turned into a missing-script result or bypass',async()=>{
 const h=waitHarness('auth_wait');
 const started=h.clock();
 const result=await h.state.wait({doi:'10.1021/jacs.fixture',jobId:'fixture',startedAt:new Date(started).toISOString()},{closed:false},{});
 assert.equal(result.reason,'controller_timeout');
 assert.ok(h.clock()-started>=8*60*1000);
});
console.log('TM_HEARTBEAT_CIRCUIT_PASS');
