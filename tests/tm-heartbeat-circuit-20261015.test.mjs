import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const first=source.indexOf('  function manualHeartbeatCircuitBreaker(');
const last=source.indexOf('  async function runManualFromHead(',first);
assert.ok(first>0&&last>first,'exact circuit-breaker helper must exist');
const ctx=vm.createContext({normalizeDoi:x=>String(x||'').toLowerCase(),publisherForDoi:()=> 'unknown'});
vm.runInContext(source.slice(first,last)+'\n globalThis.observe=manualHeartbeatCircuitBreaker;',ctx);
function state(rows=[]){
 return {publisherHeartbeatFailures:{},publisherHeartbeatQuarantine:{},
  coverage:new Map(rows.map(row=>[row.doi,{state:'pending',job:row,retryAt:0}]))};
}
const missing={status:'failed',reason:'bound_publisher_heartbeat_missing'};

test('repeat DOI attempts and independent publisher failures never globally terminate the queue',()=>{
 const run=state([{doi:'10.1039/d6sc06879k',publisher:'rsc'},{doi:'10.1016/j.chempr.2026.103008',publisher:'elsevier'}]);
 const rsc={doi:'10.1039/d6sc06879k',publisher:'rsc'};
 const chem={doi:'10.1016/j.chempr.2026.103008',publisher:'elsevier'};
 assert.equal(ctx.observe(run,rsc,missing),false);
 assert.equal(ctx.observe(run,rsc,missing),false);
 assert.equal(ctx.observe(run,chem,missing),false);
 assert.deepEqual([...run.publisherHeartbeatFailures.rsc.dois],['10.1039/d6sc06879k']);
 assert.deepEqual([...run.publisherHeartbeatFailures.elsevier.dois],['10.1016/j.chempr.2026.103008']);
 assert.equal(Object.keys(run.publisherHeartbeatQuarantine).length,0);
 assert.doesNotMatch(source,/s\.stopReason='publisher_script_missing_3_consecutive'/);
 assert.match(source,/manualHeartbeatCircuitBreaker\(run,job,result\)/);
});

test('three different uninitialized DOIs quarantine only their publisher and preserve remaining work',()=>{
 const rows=[
  {doi:'10.1039/a',publisher:'rsc'},{doi:'10.1039/b',publisher:'rsc'},
  {doi:'10.1039/c',publisher:'rsc'},{doi:'10.1039/d',publisher:'rsc'},
  {doi:'10.1021/jacs.x',publisher:'acs'}
 ];
 const run=state(rows);
 for(let i=0;i<2;i++)assert.equal(ctx.observe(run,rows[i],missing),false);
 assert.equal(ctx.observe(run,rows[2],missing),true);
 assert.equal(run.publisherHeartbeatQuarantine.rsc.dois.length,3);
 assert.equal(run.coverage.get('10.1039/d').state,'blocked');
 assert.equal(run.coverage.get('10.1021/jacs.x').state,'pending');
 assert.match(source,/publisher_script_quarantined_distinct_dois/);
 assert.match(source,/foregroundRetry=/);
});

test('successful publisher initialization clears only that publisher failure streak',()=>{
 const run=state(),rsc={doi:'10.1039/a',publisher:'rsc'},acs={doi:'10.1021/jacs.x',publisher:'acs'};
 assert.equal(ctx.observe(run,rsc,missing),false);
 assert.equal(ctx.observe(run,acs,missing),false);
 assert.equal(ctx.observe(run,rsc,{status:'partial',reason:'combined_capture'}),false);
 assert.equal(Object.hasOwn(run.publisherHeartbeatFailures,'rsc'),false);
 assert.equal(run.publisherHeartbeatFailures.acs.dois.length,1);
 assert.equal(ctx.observe(run,rsc,missing),false);
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
