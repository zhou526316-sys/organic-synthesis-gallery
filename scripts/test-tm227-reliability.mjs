import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
let passed=0;
function test(name,fn){fn();passed+=1;console.log('TM227_RELIABILITY_PASS '+name);}

test('revision changes without capture protocol migration',()=>{
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.27';"));
});

test('publisher deadline remains below controller wait budget',()=>{
  const pub=/job\.captureDeadline=Date\.now\(\)\+(\d+)\*60\*1000/.exec(source);
  const controller=/while\(Date\.now\(\)-started<(\d+)\*60\*1000\)/.exec(source);
  assert.ok(pub&&controller);
  assert.equal(Number(pub[1]),6);
  assert.equal(Number(controller[1]),8);
  assert.ok(Number(controller[1])>Number(pub[1]));
});

test('network acquisition uses remaining publisher deadline',()=>{
  for(const needle of [
    'function captureRemainingMs(job)',
    'function captureRequestTimeout(job, preferredMs)',
    'captureRequestTimeout(job,12000)',
    'AbortSignal.timeout(requestTimeout)',
    'timeout: requestTimeout',
    "stage:'capture_deadline'",
    'captureDeadlineNear(job,1500)'
  ])assert.ok(source.includes(needle),needle);
  const a=source.indexOf('  function captureRemainingMs(job)'),b=source.indexOf('  async function pageFetchCandidate(',a);
  assert.ok(a>0&&b>a);
  const fn=new Function(source.slice(a,b)+'; return {captureRemainingMs,captureRequestTimeout,captureDeadlineNear};')();
  const future={captureDeadline:Date.now()+6000};
  const timeout=fn.captureRequestTimeout(future,12000);
  assert.ok(timeout>=3000&&timeout<=5500);
  assert.equal(fn.captureRequestTimeout({captureDeadline:Date.now()+1000},12000),0);
  assert.equal(fn.captureDeadlineNear({captureDeadline:Date.now()+1000},1500),true);
});

test('controller timeout retries are transient and foregrounded',()=>{
  assert.ok(source.includes("if (prior.reason==='controller_timeout') return elapsed>=10*60*1000;"));
  assert.ok(source.includes("forceForeground:Boolean(priorAttempt&&priorAttempt.reason==='controller_timeout')"));
  assert.ok(source.includes("active:job.publisher==='wiley'||job.forceForeground===true"));
  assert.ok(source.includes("stopReason='controller_timeout_transient_pause'"));
  assert.ok(source.includes("resumeDelay=stopReason==='controller_timeout_transient_pause'?120000:NEXT_BATCH_DELAY_MS"));
  const a=source.indexOf('  function overnightRetryEligible(prior, now)'),b=source.indexOf('  function checkpointKey(',a);
  assert.ok(a>0&&b>a);
  const eligible=new Function(source.slice(a,b)+'; return overnightRetryEligible;')();
  const now=Date.now();
  const prior={status:'failed',reason:'controller_timeout',finishedAt:new Date(now-9*60*1000).toISOString(),retryCount:8};
  assert.equal(eligible(prior,now),false);
  prior.finishedAt=new Date(now-11*60*1000).toISOString();
  assert.equal(eligible(prior,now),true);
});

test('controller reports retain last progress and heartbeat',()=>{
  for(const needle of [
    "event:'last_progress'",
    "event:'last_heartbeat'",
    "last publisher-page progress visible to Gallery controller",
    "last bound publisher heartbeat"
  ])assert.ok(source.includes(needle),needle);
});

test('Wiley paired fallback can discover TOC and article figures together',()=>{
  for(const needle of [
    "async function iframeCandidates(job, trace, mode)",
    "mode === 'paired'",
    "collectArticleFigureCandidates(job, trace, doc, current, 'iframe_body')",
    "job.publisher==='wiley'&&!pairedIframeAttempted",
    "iframeCandidates(job,trace,'paired')",
    "stage:'paired_iframe_fallback'"
  ])assert.ok(source.includes(needle),needle);
});

test('image quality gates remain unchanged',()=>{
  assert.ok(source.includes("if (maxSide >= 900 && minSide >= 180 && pixels >= 220000)"));
  assert.ok(source.includes("if (maxSide >= 600 && minSide >= 140 && pixels >= 120000)"));
  assert.ok(source.includes("return 'image/tiff'"));
});

console.log('TM227_RELIABILITY_TEST_SUMMARY '+JSON.stringify({passed,captureProtocol:'6.2.20',controllerRevision:'2.2.27',productionWrites:0,publisherRequests:0}));
