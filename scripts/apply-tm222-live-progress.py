from pathlib import Path

def once(s, a, b):
    if s.count(a) != 1:
        raise RuntimeError('Expected one anchor: ' + a[:100])
    return s.replace(a, b, 1)

p = Path('public/toc-mainline.user.js')
s = p.read_text()
if 'BEGIN OSG_LIVE_PROGRESS_V1' in s:
    assert any("var CONTROLLER_REVISION = '"+v+"';" in s for v in ('2.2.22','2.2.23','2.2.24','2.2.25'))
    print('TM222_ALREADY_APPLIED')
    raise SystemExit(0)
assert "var CONTROLLER_REVISION = '2.2.21';" in s
s = once(s, "var CONTROLLER_REVISION = '2.2.21';", "var CONTROLLER_REVISION = '2.2.22';")
fragment_path = Path('scripts/tm-live-progress.fragment.js')
fragment = fragment_path.read_text()
# Do not present the previous image's quality while downloading a different image.
fragment = once(fragment, "      detail = detail || {};", "      detail = detail || {};\n      var sameImage = same && prev.label === String(detail.label || job._liveLabel || '');")
fragment = once(fragment, "String(detail.quality || (same && prev.quality) || '')", "String(detail.quality || (sameImage && prev.quality) || '')")
fragment = once(fragment, "Number(detail.width || 0)", "Number(detail.width || (sameImage && prev.width) || 0)")
fragment = once(fragment, "Number(detail.height || 0)", "Number(detail.height || (sameImage && prev.height) || 0)")
fragment_path.write_text(fragment)
s = once(s, '  function nowIso()', fragment + '\n  function nowIso()')
s = once(s, "    pushTrace(trace,{stage:'job',event:'start',status:'running',url:location.href,message:'v'+VERSION+';paired_capture=1;need='+String(job.mediaNeed)});", "    job._liveResult=result;\n    captureLiveUpdate(job,'discovering');\n    pushTrace(trace,{stage:'job',event:'start',status:'running',url:location.href,message:'v'+VERSION+';paired_capture=1;need='+String(job.mediaNeed)});")
s = once(s, '      var discovered=await waitForPairedVisuals(job,trace);', "      var discovered=await waitForPairedVisuals(job,trace);\n      job._liveDiscoveryDone=true;\n      result.figures.discovered=new Set(discovered.figures.map(function(c){return c.label;})).size;\n      captureLiveUpdate(job,'discovering');")
s = once(s, "            checkpoint.toc=result.toc;saveCheckpoint(job.doi,checkpoint);", "            checkpoint.toc=result.toc;saveCheckpoint(job.doi,checkpoint);\n            captureLiveUpdate(job,'saved',{label:best.candidate.kind==='figure1'?'Figure 1 替代图':'TOC'});")
s = once(s, "          result.toc={status:'failed',reason:String(error.message)};", "          result.toc={status:'failed',reason:String(error.message)};\n          captureLiveUpdate(job,'image_failed',{label:'TOC',error:error.message});")
s = once(s, '        var label=labels[i];', "        var label=labels[i];job._liveLabel=label;")
s = once(s, "result.figures.stored+=1;continue;", "result.figures.stored+=1;captureLiveUpdate(job,'reused',{label:label});continue;")
s = once(s, '          checkpoint.figures[label]=result.figures.items[result.figures.items.length-1];saveCheckpoint(job.doi,checkpoint);', "          checkpoint.figures[label]=result.figures.items[result.figures.items.length-1];saveCheckpoint(job.doi,checkpoint);\n          captureLiveUpdate(job,'saved',{label:label,quality:chosen.quality.quality,width:chosen.image.width,height:chosen.image.height});")
s = once(s, "          result.figures.items.push({label:label,status:'failed',reason:String(error.message)});", "          result.figures.items.push({label:label,status:'failed',reason:String(error.message)});\n          captureLiveUpdate(job,'image_failed',{label:label,error:error.message});")
s = once(s, '    return finishPairedJob(job,result,trace,token);', "    captureLiveUpdate(job,'finished',{error:result.status==='failed'?result.reason:''});\n    return finishPairedJob(job,result,trace,token);")
s = once(s, '    var pageDoi = assertBoundCaptureJob(job, candidate.url);', "    var pageDoi = assertBoundCaptureJob(job, candidate.url);\n    captureLiveUpdate(job,'uploading',{label:candidate.label});")
s = once(s, '  async function uploadCapture(job, candidate, image, trace, token) {\n    assertBoundCaptureJob(job, candidate.url);', "  async function uploadCapture(job, candidate, image, trace, token) {\n    assertBoundCaptureJob(job, candidate.url);\n    captureLiveUpdate(job,'uploading',{label:candidate.kind==='figure1'?'Figure 1 替代图':'TOC'});")
s = once(s, '      assertBoundCaptureJob(job,candidate.url);\n      try {', "      assertBoundCaptureJob(job,candidate.url);\n      captureLiveUpdate(job,'downloading',{label:role==='toc'?'TOC':candidate.label});\n      try {")
s = once(s, '        var quality=measuredQuality(image,role);', "        var quality=measuredQuality(image,role);\n        captureLiveUpdate(job,'comparing',{label:role==='toc'?'TOC':candidate.label,quality:quality.quality,width:image.width,height:image.height});")
s = once(s, "      if (state.auth || state.challenge) {", "      if (state.auth || state.challenge) {\n        captureLiveUpdate(job,state.auth?'auth_wait':'challenge_wait');")
s = once(s, '  function installMenu() {', "  function installMenu() {\n    GM_registerMenuCommand('查看实时抓取进度', function () {\n      if(isGalleryPage()){mountCaptureLivePanel();globalThis.__OSG_CAPTURE_LIVE_PANEL__.show();}\n    });")
s = once(s, '  if (isGalleryPage()) {\n    setTimeout(controllerRun, 1500);', '  if (isGalleryPage()) {\n    mountCaptureLivePanel();\n    setTimeout(controllerRun, 1500);')
p.write_text(s)
p = Path('cloudflare/scripts/build-bridge-loader.mjs')
s = p.read_text();s = once(s, "const loaderVersion = '2.2.21';", "const loaderVersion = '2.2.22';");p.write_text(s)
for name in ['scripts/test-tm221-window-guard.mjs', 'scripts/validate-tm220-artifacts.mjs']:
    p=Path(name);s=p.read_text();assert '2.2.21' in s;p.write_text(s.replace('2.2.21','2.2.22'))
p=Path('scripts/test-tm-stage-first.mjs');s=p.read_text()
s=once(s,"    VERSION: '6.2.20', location:","    captureLiveUpdate: () => {}, // The observer has independent ownership/count/privacy tests.\n    VERSION: '6.2.20', location:")
p.write_text(s)
print('TM222_PATCH_APPLIED: protocol=6.2.20; controller=2.2.22; scheduler/order/Worker unchanged')
