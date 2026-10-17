import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const first=source.indexOf('  function manualHeartbeatCircuitBreaker(');
const last=source.indexOf('  async function runManualFromHead(',first);
assert.ok(first>0&&last>first,'exact circuit-breaker helper must exist');
let observedHeartbeat=null;
const ctx=vm.createContext({normalizeDoi:x=>String(x||'').toLowerCase(),publisherForDoi:()=> 'unknown',currentPublisherHeartbeat:()=>observedHeartbeat,Date});
vm.runInContext(source.slice(first,last)+'\n globalThis.observe=manualHeartbeatCircuitBreaker;globalThis.probePriority=recoveryProbePriority;',ctx);
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

test('three independent uninitialized DOIs isolate only one publisher and reserve exactly one recovery DOI',()=>{
 const rows=[
  {doi:'10.1039/a',publisher:'rsc'},{doi:'10.1039/b',publisher:'rsc'},
  {doi:'10.1039/c',publisher:'rsc'},{doi:'10.1039/d',publisher:'rsc'},
  {doi:'10.1039/e',publisher:'rsc'},{doi:'10.1021/jacs.x',publisher:'acs'}
 ];
 const run=state(rows);
 for(let i=0;i<2;i++)assert.equal(ctx.observe(run,rows[i],missing),false);
 assert.equal(ctx.observe(run,rows[2],missing),true);
 assert.equal(run.publisherHeartbeatQuarantine.rsc.dois.length,3);
 assert.equal(run.publisherHeartbeatQuarantine.rsc.probeDoi,'10.1039/d');
 assert.equal(run.coverage.get('10.1039/d').state,'pending');
 assert.equal(run.coverage.get('10.1039/e').state,'blocked');
 assert.equal(run.coverage.get('10.1021/jacs.x').state,'pending');
 assert.match(source,/quarantined&&quarantined.probeDoi!==normalizeDoi\(job.doi\)/);
 assert.match(source,/foregroundRetry=/);
});

test('serial dispatcher puts one bounded recovery probe behind ordinary publisher jobs',()=>{
 const rows=[
  {doi:'10.1039/a',publisher:'rsc'},{doi:'10.1039/b',publisher:'rsc'},
  {doi:'10.1039/c',publisher:'rsc'},{doi:'10.1039/d',publisher:'rsc'},
  {doi:'10.1021/jacs.x',publisher:'acs'},{doi:'10.1002/anie.x',publisher:'wiley'}
 ];
 const run=state(rows);
 for(let i=0;i<3;i++)ctx.observe(run,rows[i],missing);
 const original=[rows[3],rows[4],rows[5]].map(job=>({job}));
 assert.equal(ctx.probePriority(run,original[0]),1);
 assert.equal(ctx.probePriority(run,original[1]),0);
 assert.equal(ctx.probePriority(run,original[2]),0);
 original.sort((a,b)=>ctx.probePriority(run,a)-ctx.probePriority(run,b));
 assert.deepEqual(original.map(r=>r.job.doi),['10.1021/jacs.x','10.1002/anie.x','10.1039/d']);
 assert.match(source,/candidates\.sort\(function\(a,b\)\{return recoveryProbePriority\(run,a\)-recoveryProbePriority\(run,b\);\}\)/);
});

test('real DOI- and job-bound publisher startup recovers pending publisher coverage once',()=>{
 observedHeartbeat=null;
 const rows=[
  {doi:'10.1039/a',publisher:'rsc'},{doi:'10.1039/b',publisher:'rsc'},
  {doi:'10.1039/c',publisher:'rsc'},{doi:'10.1039/d',publisher:'rsc'},
  {doi:'10.1039/e',publisher:'rsc'},{doi:'10.1021/jacs.x',publisher:'acs'}
 ];
 const run=state(rows);
 for(let i=0;i<3;i++)ctx.observe(run,rows[i],missing);
 assert.equal(run.coverage.get('10.1039/e').state,'blocked');
 const job={...rows[3],jobId:'exact-bound-job'};
 observedHeartbeat={jobId:'exact-bound-job',doi:rows[3].doi,state:'publisher_script_started'};
 assert.equal(ctx.observe(run,job,{doi:job.doi,jobId:job.jobId,finishedAt:new Date().toISOString(),status:'failed',reason:'combined_capture;toc=not_found'}),true);
 assert.equal(run.publisherHeartbeatQuarantine.rsc,undefined);
 assert.equal(run.coverage.get('10.1039/e').state,'pending');
 assert.equal(run.coverage.get('10.1021/jacs.x').state,'pending');
 assert.equal(Object.hasOwn(run.publisherHeartbeatFailures,'rsc'),false);
 observedHeartbeat=null;
});

test('startup heartbeat with timeout or absent terminal capture NEVER re-enables publisher queue',()=>{
 const rows=[
  {doi:'10.1039/a',publisher:'rsc'},{doi:'10.1039/b',publisher:'rsc'},
  {doi:'10.1039/c',publisher:'rsc'},{doi:'10.1039/d',publisher:'rsc'},
  {doi:'10.1039/e',publisher:'rsc'}
 ];
 observedHeartbeat=null;
 const run=state(rows);
 for(let i=0;i<3;i++)ctx.observe(run,rows[i],missing);
 const probe={...rows[3],jobId:'exact-bound-job'};
 observedHeartbeat={jobId:probe.jobId,doi:probe.doi,state:'publisher_script_started'};
 assert.equal(ctx.observe(run,probe,{doi:probe.doi,jobId:probe.jobId,status:'failed',reason:'controller_timeout'}),true);
 assert.ok(run.publisherHeartbeatQuarantine.rsc);
 assert.equal(run.coverage.get('10.1039/e').state,'blocked');
 observedHeartbeat=null;
});

test('wrong-job or mere binding-wait heartbeat cannot re-enable isolated DOI work',()=>{
 const rows=[
  {doi:'10.1039/a',publisher:'rsc'},{doi:'10.1039/b',publisher:'rsc'},
  {doi:'10.1039/c',publisher:'rsc'},{doi:'10.1039/d',publisher:'rsc'},
  {doi:'10.1039/e',publisher:'rsc'},{doi:'10.1021/jacs.x',publisher:'acs'}
 ];
 for (const hbState of ['publisher_binding_wait','publisher_script_started']){
  observedHeartbeat=null;
  const run=state(rows);
  for(let i=0;i<3;i++)ctx.observe(run,rows[i],missing);
  observedHeartbeat={jobId:hbState==='publisher_binding_wait'?'exact-bound-job':'wrong-job',
    doi:rows[3].doi,state:hbState};
  assert.equal(ctx.observe(run,{...rows[3],jobId:'exact-bound-job'},missing),true);
  assert.equal(run.publisherHeartbeatQuarantine.rsc.probeDoi,'');
  assert.equal(run.coverage.get('10.1039/e').state,'blocked');
  assert.equal(run.coverage.get('10.1021/jacs.x').state,'pending');
  assert.equal(ctx.observe(run,rows[4],missing),false,'a failed probe must not schedule an unbounded second probe');
 }
 observedHeartbeat=null;
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
