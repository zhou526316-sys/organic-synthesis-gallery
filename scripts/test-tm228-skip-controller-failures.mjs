import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
let passed=0;
function test(name,fn){fn();passed+=1;console.log('TM228_SKIP_PASS '+name);}

const start=source.indexOf('  function controllerFailureDisposition(');
const end=source.indexOf('\n\n  async function waitForResult(',start);
assert.ok(start>0&&end>start,'controllerFailureDisposition missing');
const context=vm.createContext({});
vm.runInContext(source.slice(start,end),context);
const disposition=vm.runInContext('controllerFailureDisposition',context);

test('per-DOI controller failures are skippable',()=>{
  for(const reason of ['task_tab_handle_unavailable','previous_task_tab_not_closed','bound_publisher_heartbeat_missing','controller_timeout']){
    assert.equal(disposition(reason),'skip',reason);
  }
});

test('controller integrity failures still stop the mainline',()=>{
  for(const reason of ['controller_lease_lost','another_task_still_active','capture_server_upgrade_pending']){
    assert.equal(disposition(reason),'stop',reason);
  }
});

test('ordinary article failures remain record-only and continue',()=>{
  for(const reason of ['no_usable_figure_variant','paired_capture;toc=not_found;figures=0/0;published=0','image_http_403']){
    assert.equal(disposition(reason),'record',reason);
  }
});

test('task tab handle failure becomes a failed DOI result rather than global stop',()=>{
  assert.ok(source.includes("if(controllerFailureDisposition(controllerReason)==='stop')stopReason=controllerReason;"));
  assert.ok(source.includes("if(controllerFailureDisposition(controllerReason)==='skip')skipReason=controllerReason;"));
  assert.ok(!source.includes("if(/controller_lease_lost|task_tab_handle_unavailable/.test(String(error.message)))stopReason"));
});

test('heartbeat missing and timeout are classified as skip before stop evaluation',()=>{
  assert.ok(source.includes("if(result && controllerFailureDisposition(result.reason)==='skip')skipReason=skipReason||result.reason;"));
  assert.ok(!source.includes("if(result && result.reason==='bound_publisher_heartbeat_missing')stopReason=result.reason;"));
});

test('failed skipped DOI is persisted into attempt history before continuation',()=>{
  const save=source.indexOf("GM_setValue(attemptKey(job.doi,generation,'figures'),result);");
  const skip=source.indexOf("if(skipReason) {",save);
  const stop=source.indexOf("if(stopReason){summary.stopReason=stopReason",skip);
  assert.ok(save>0&&skip>save&&stop>skip);
});

test('unclosed stale tab is a warning or skip, never a global stop',()=>{
  assert.ok(source.includes("if(!closed)skipReason=skipReason||'previous_task_tab_not_closed';"));
  const final=source.match(/if\(\/([^/]+)\/\.test\(stopReason\)\)\{CONTROLLER_STOP_REASON/);
  assert.ok(final,'final hard-stop regex missing');
  for(const reason of ['task_tab_handle_unavailable','previous_task_tab_not_closed','bound_publisher_heartbeat_missing']){
    assert.ok(!final[1].includes(reason),reason);
  }
});

test('hard stops remain sticky',()=>{
  const final=source.match(/if\(\/([^/]+)\/\.test\(stopReason\)\)\{CONTROLLER_STOP_REASON/);
  for(const reason of ['controller_lease_lost','another_task_still_active','capture_server_upgrade_pending']){
    assert.ok(final[1].includes(reason),reason);
  }
});

test('summary and live progress expose skipped DOI count',()=>{
  assert.ok(source.includes('skipped:0,lifecycleWarnings:0'));
  assert.ok(source.includes("batchSkipped: Math.max(0, Number(summary.skipped || 0))"));
  assert.ok(source.includes("' · 跳过 ' + s.batchSkipped"));
});

test('user abort remains an explicit stop request',()=>{
  assert.ok(source.includes("if(result && result.status==='aborted')break;"));
  assert.ok(source.includes("GM_setValue(ENABLED_KEY,false)"));
});

test('Bridge version advances without capture protocol migration',()=>{
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.28';"));
});

console.log('TM228_SKIP_TEST_SUMMARY '+JSON.stringify({passed,captureProtocol:'6.2.20',controllerRevision:'2.2.28'}));
