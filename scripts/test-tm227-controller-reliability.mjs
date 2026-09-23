import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
let passed=0;
function check(name,fn){fn();passed+=1;console.log('TM227_CONTROLLER_PASS '+name);}

check('controller revision advances without capture protocol migration',()=>{
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.27';"));
});

check('publisher task tabs are foreground-active for every publisher',()=>{
  assert.ok(source.includes("GM_openInTab(articleUrl(Object.assign({},job,{mediaNeed:'figures'}))+'#osg-job='+encodeURIComponent(job.jobId),{active:true,insert:true,setParent:true})"));
  assert.ok(!source.includes("active:job.publisher==='wiley'"));
});

check('publisher final result is persisted before task tab self-closes',()=>{
  const finish=source.indexOf("var finalResult=await runPublisherJob(job);");
  const heartbeat=source.indexOf("writePublisherHeartbeat(job,'publisher_job_finished');",finish);
  const close=source.indexOf("setTimeout(function(){try{window.close();}catch(_){}},250);",finish);
  assert.ok(finish>0&&heartbeat>finish&&close>heartbeat);
});

check('controller error report preserves last publisher progress',()=>{
  const trace=source.indexOf("var controllerTrace=[{at:nowIso(),stage:'controller',event:'stopped'");
  const progress=source.indexOf("event:'last_progress'",trace);
  const enqueue=source.indexOf("enqueueCaptureReport(job,controllerTrace, 'controller_error'",trace);
  assert.ok(trace>0&&progress>trace&&enqueue>progress);
});

check('publisher and controller budgets remain bounded at six and eight minutes',()=>{
  assert.ok(source.includes("job.captureDeadline=Date.now()+6*60*1000;"));
  assert.ok(source.includes("while(Date.now()-started<8*60*1000)"));
});

check('task-tab self-close happens only after bound publisher job execution',()=>{
  const boot=source.indexOf('async function publisherBoot()');
  const bind=source.indexOf('await bindPublisherCaptureJob(job);',boot);
  const run=source.indexOf('var finalResult=await runPublisherJob(job);',boot);
  const close=source.indexOf('window.close()',run);
  assert.ok(boot>0&&bind>boot&&run>bind&&close>run);
});

console.log('TM227_CONTROLLER_TEST_SUMMARY '+JSON.stringify({passed,captureProtocol:'6.2.20',controllerRevision:'2.2.27',publisherDeadlineMinutes:6,controllerBudgetMinutes:8}));
