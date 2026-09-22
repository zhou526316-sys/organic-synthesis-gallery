"""Combine inspected main window protection with tested paired capture/publication. No production media writes."""
from pathlib import Path
import subprocess,json,re
MAIN='b00b03aa03d3dccb7a46ac6bd54d51392029de34'
def show(ref,path):return subprocess.check_output(['git','show',ref+':'+path]).decode()
def once(s,a,b):
 assert s.count(a)==1,'Patch anchor: '+a[:90]
 return s.replace(a,b,1)
source=Path('public/toc-mainline.user.js').read_text()
if "var VERSION = '6.2.22';" in source:raise SystemExit('Already integrated; no silent reapplication')
assert "var VERSION = '6.2.21';" in source
oldloader=Path('cloudflare/scripts/build-bridge-loader.mjs').read_text()
subprocess.run(['git','merge','--no-commit','--no-ff',MAIN],check=False)
conflicts=set(subprocess.check_output(['git','diff','--name-only','--diff-filter=U']).decode().splitlines())
expected={'public/toc-mainline.user.js','cloudflare/scripts/build-bridge-loader.mjs'}
assert conflicts.issubset(expected),'Unexpected merge conflict: '+str(conflicts)
main=show(MAIN,'public/toc-mainline.user.js')
# Carry main's proven ownership/close-confirmation state machine, but retain the full
# verified-publication handshake, persistent launcher, per-image checkpoint and retry policy.
a=main.index('  function clearOwnedJob(');b=main.index('  async function publisherBoot()',a)
controller=main[a:b]
controller=controller.replace("var caps=await getJson(WORKER+'/api/media/capture-capabilities');", "var caps=await getJson(CAPTURE_INDEX_URL+'?capabilities=1&ts='+Date.now());")
controller=controller.replace("caps.mode!=='verified-staging'", "caps.verifiedPublication!==true")
controller=controller.replace("var generation=VERSION+':paired:'+String(queue.mediaGeneration);", "var generation=stableCaptureGeneration(queue);")
controller=controller.replace("if (prior && !overnightRetryEligible(prior,Date.now())) return false;", "if (!nightRetryState(job,generation).eligible) return false;")
controller=controller.replace('GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));', "var saved=readCaptureCheckpoint(job.doi);if(saved.toc?.kind==='official')job.captureToc=false;\n        GM_deleteValue(resultKey(job.doi));GM_deleteValue(progressKey(job.doi));")
controller=once(controller,"articleUrl(Object.assign({},job,{mediaNeed:'figures'}))+'#osg-job='", "'https://'+GALLERY_HOST+GALLERY_PATH+'capture-launch.html#osg-job='")
controller=controller.replace("active:job.publisher==='wiley'", "active:GM_getValue(P+'night-mode',false)===true||job.publisher==='wiley'")
controller=controller.replace("figuresStaged:0,published:0,results:[]", "figuresStaged:0,apiAvailableFigures:0,published:0,results:[]")
controller=controller.replace("summary.figuresStaged+=Number(result.figuresStaged||0);", "summary.figuresStaged+=Number(result.figuresStaged||0);\n          summary.apiAvailableFigures+=Number(result.figuresImported||0);")
controller=once(controller,"GM_setValue(attemptKey(job.doi,generation,'figures'),result);", "storeNightOutcome(job,generation,result);")
controller=controller.replace("正文图已暂存 '+summary.figuresStaged", "正文图已保存 '+summary.figuresStaged+'，API可读 '+summary.apiAvailableFigures")
controller=controller.replace('（暂存不等于发布）','（以API回执区分存储与发布）')
start=controller.index('      if(!stopReason&&jobs.some(eligible)');end=controller.index('    } catch(error)',start)
controller=controller[:start]+'''      if(!stopReason&&!isAbortRequested()&&GM_getValue(ENABLED_KEY,true)!==false) {
        var pending=jobs.map(function(j){return nightRetryState(j,generation);});
        var waits=pending.filter(function(p){return p.nextAt;}).map(function(p){return p.nextAt-Date.now();});
        scheduleNightContinuation(jobs.some(eligible)?NEXT_BATCH_DELAY_MS:waits.length?Math.min.apply(null,waits):30*60*1000);
      }
''' +controller[end:]
a=source.index('  async function controllerRun() {');b=source.index('  async function publisherBoot()',a)
source=source[:a]+controller+source[b:]
a=main.index('  async function acquireLease()');b=main.index('  function renewLease()',a)
x=source.index('  function acquireLease()');y=source.index('  function renewLease()',x)
source=source[:x]+main[a:b]+source[y:]
source=once(source,"  var VERSION = '6.2.21';", "  var VERSION = '6.2.21';\n  var CONTROLLER_REVISION = '2.2.22';\n  var CONTROLLER_STOP_REASON = '';")
# Menus from the same main patch never steal or erase a live controller lease.
a=main.index('  function installMenu()');b=main.index('  function visualScope(',a)
menus=main[a:b]
menus=once(menus,'  function installMenu() {', "  function installMenu() {\n    GM_registerMenuCommand('启动夜间连续抓取（TOC＋正文图）',function(){GM_setValue(P+'night-mode',true);requestControllerStart();});")
x=source.index('  function installMenu()');y=source.index('  function visualScope(',x)
source=source[:x]+menus+source[y:]
# Starting timers cannot re-enter a stopped infrastructure-failure loop.
source=once(source,'  function scheduleNightContinuation(delay,message) {', "  function scheduleNightContinuation(delay,message) {\n    if(CONTROLLER_STOP_REASON)return;")
source=source.replace("var now=Date.now();\n    if(pub", "var now=Date.now();\n    if(prior&&prior.reason==='controller_lease_lost')return {eligible:true};\n    if(pub")
Path('public/toc-mainline.user.js').write_text(source)
# Retain main's legacy collector disable, independently from our paired engine.
if 'legacy_runtime_media_disabled' not in oldloader:
 s=show(MAIN,'cloudflare/scripts/build-bridge-loader.mjs');a=s.index('// legacy_runtime_media_disabled:');b=s.index("await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');",a)
 oldloader=once(oldloader,"await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');",s[a:b]+"await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');")
Path('cloudflare/scripts/build-bridge-loader.mjs').write_text(oldloader)
for name in conflicts:subprocess.check_call(['git','add',name])
assert not subprocess.check_output(['git','ls-files','-u']).strip()
# Adapt only fixture protocol/endpoints to the combined release, not the regression assertions.
test=show(MAIN,'scripts/test-tm221-window-guard.mjs')
test=test.replace("url.includes('capture-capabilities')?", "url.includes('capabilities')?").replace("u.includes('capture-capabilities')", "u.includes('capabilities')")
test=test.replace("mode:'verified-staging'", "mode:'verified-staging',verifiedPublication:true")
test=test.replace('6.2.20','6.2.22').replace('2.2.21','2.2.22')
Path('scripts/test-tm222-window-guard.mjs').write_text(test)
# One forward release number for code, Worker, artifact validators and capture contracts.
files=['public/toc-mainline.user.js','public/toc-demand-live.json','cloudflare/scripts/build-bridge-loader.mjs','cloudflare/scripts/build-live-toc-demand-queue.mjs','cloudflare/worker/src/index.js','cloudflare/worker/src/local-captures.js','cloudflare/worker/src/verified-browser-media.js','scripts/validate-tm-release.mjs','scripts/test-media-identity-v220.mjs','scripts/test-tm-stage-first.mjs','scripts/test-tm-night-release.mjs','scripts/test-tm-night-browser.mjs','scripts/test-tm-paired-capture.mjs']
for name in files:
 p=Path(name);p.write_text(p.read_text().replace('6.2.21','6.2.22').replace('2.2.21','2.2.22'))
# Retain the older regression fixture as a compatibility alias for main's one-time guard job.
Path('scripts/test-tm221-window-guard.mjs').write_text(test)
p=Path('scripts/validate-tm220-artifacts.mjs');t=p.read_text().replace('6.2.20','6.2.22').replace('2.2.21','2.2.22');p.write_text(t)
# Workflow changes go through the authorized connector separately, using exact tree blobs.
out=Path('audit/tm222-release-contracts');out.mkdir(parents=True,exist_ok=True)
for name in ['github-pages.yml','toc-publisher-adapters-ci.yml','tm-night-live-acceptance.yml']:
 t=Path('.github/workflows',name).read_text().replace('6.2.21','6.2.22').replace('2.2.21','2.2.22')
 (out/name).write_text(t)
(out/'main-parent.json').write_text(json.dumps({'mergedMain':MAIN,'controllerOrigin':MAIN,'fullCaptureOrigin':'c271c5280e4caf47f12ee7586d9f9e30ed8c1bb8','version':'2.2.22','productionMediaWrites':0}))
# Keep source changes; connector creates final merge-parent commit after workflow materialization.
subprocess.check_call(['git','reset','--mixed','HEAD'])
subprocess.check_call(['git','restore','--source=HEAD','--worktree','--','.github/workflows'])
print('TM222_INTEGRATED_MAIN_WINDOW_GUARDS_AND_VERIFIED_CAPTURE')
