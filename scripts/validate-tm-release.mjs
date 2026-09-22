import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const directory=process.argv[2]||'public';
const core=fs.readFileSync(path.join(directory,'toc-mainline.user.js'),'utf8');
const expect=(text,needle)=>assert.ok(text.includes(needle),'Missing release contract: '+needle);
for(const needle of ['// @version      6.2.20',"var VERSION = '6.2.20';",'GM_getTab','GM_saveTab','GM_listValues','启动夜间连续抓取（TOC＋正文图）','中止当前媒体抓取批次','上传本地 TOC 日志','function stableCaptureGeneration','function readCaptureCheckpoint','function nightRetryState','function launchBoundPublisherTab','function bindPublisherCaptureJob','function pairedJobs','function acquireBestVisual','function visualScope','function svgQuality','sourceUrl: candidate.url','apiAvailableFigures','worker_capture_release_not_ready'])expect(core,needle);
for(const forbidden of ['readRealtimeMediaPreflight','gallery-literature-doi-registry','MEDIA_INVENTORY_ENDPOINT'])assert.ok(!core.includes(forbidden),'Unsafe old capture mechanism present: '+forbidden);
const upload=core.slice(core.indexOf('  async function uploadArticleFigure('),core.indexOf('  async function uploadCapture('));
expect(upload,'postJson(FIGURE_STAGE_ENDPOINT');expect(upload,'assertBoundCaptureJob');expect(upload,'figure_stage_receipt_invalid');
assert.ok(!upload.includes('postJson(FIGURE_IMPORT_ENDPOINT'),'Night capture must not request locked direct import');
const generation=core.match(/function stableCaptureGeneration\([^]*?\n  \}/)?.[0]||'';
expect(generation,'mediaGeneration');assert.ok(!generation.includes('generatedAt'),'Success must survive mere queue refresh');
assert.ok(!/\beval\s*\(/.test(core),'No eval allowed');
assert.ok(!/Bearer [A-Za-z0-9_-]{20,}|BRIDGE_WRITE_TOKEN\s*=/.test(core),'Embedded credentials forbidden');
const queue=JSON.parse(fs.readFileSync(path.join(directory,'toc-demand-live.json'),'utf8'));
assert.equal(queue.mediaGeneration,1790082000000);
assert.ok(Array.isArray(queue.articles)&&queue.articles.length>=100);
assert.equal(queue.articles.length,queue.webpageDoiCount);
assert.equal(new Set(queue.articles.map(x=>x.doi)).size,queue.articles.length);
assert.ok(fs.existsSync(path.join(directory,'capture-launch.html')),'Bound launcher required');
if(directory==='dist'){
 const packed=fs.readFileSync(path.join(directory,'gallery-vpn-bridge.user.js'),'utf8');
 for(const needle of ['// @version      2.2.20',"var VERSION = '6.2.20';",'// @grant        GM_getTab','// @grant        GM_saveTab','// @grant        GM_listValues','organicGalleryCloudflareBridgeWriteToken','__OSG_TOC_BROWSER_MAINLINE__','启动夜间连续抓取（TOC＋正文图）','// @updateURL    https://zhou526316-sys.github.io/organic-synthesis-gallery/gallery-vpn-bridge.user.js'])expect(packed,needle);
 assert.ok(!/\beval\s*\(/.test(packed));
}else{
 const loader=fs.readFileSync('cloudflare/scripts/build-bridge-loader.mjs','utf8');expect(loader,"loaderVersion = '2.2.20'");expect(loader,'GM_getTab');
 const server=fs.readFileSync('cloudflare/worker/src/verified-browser-media.js','utf8');expect(server,'publishVerifiedBrowserMedia');expect(server,'capture_object_digest_mismatch');
}
console.log('TM_RELEASE_CONTRACT '+JSON.stringify({bridge:'2.2.20',core:'6.2.20',directory,articles:queue.articles.length,paired:true,nightResume:true,quarantineEpoch:queue.mediaGeneration}));
