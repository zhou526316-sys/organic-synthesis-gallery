import {writeFile} from 'node:fs/promises';
const base='https://organic-synthesis-gallery.zhou526316.workers.dev';
function url(v){try{const u=new URL(v);u.username='';u.password='';u.search='';u.hash='';return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}}
function text(v){return String(v||'').replace(/https?:\/\/[^\s"'<>]+/gi,url).replace(/Bearer\s+\S+|(?:token|secret|password|cookie|authorization)\s*[:=]\s*[^\s;,]+/gi,'[redacted]').slice(0,450);}
async function get(p){const r=await fetch(base+p,{headers:{origin:'https://zhou526316-sys.github.io','cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('http_'+r.status);return r.json();}
const report={readAt:new Date().toISOString(),readOnly:true,errors:[],failures:[]};
try{
 const local=await get('/api/media/local-diagnostics?read='+Date.now());
 const s=local.summary||{};
 report.uploadedAt=local.uploadedAt;report.version=local.version;report.summary={controllerRevision:s.controllerRevision,startedAt:s.startedAt,finishedAt:s.finishedAt,total:s.total,success:s.success,partial:s.partial,failed:s.failed,tocStored:s.tocStored,figuresStaged:s.figuresStaged,stopReason:s.stopReason};
 report.completed=(s.results||[]).map(x=>({doi:x.doi,status:x.status,reason:text(x.reason),finishedAt:x.finishedAt}));
 for(const trace of (local.traces||[]).slice().sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0,12)){
   const selected=(trace.trace||[]).filter(e=>e.event==='failed'||Number(e.httpStatus)>=400||e.status==='low'||e.stage==='paired_result');
   if(selected.length)report.failures.push({doi:trace.doi,finishedAt:trace.finishedAt,status:trace.status,reason:text(trace.reason),events:selected.slice(-30).map(e=>({at:e.at,stage:e.stage,event:e.event,status:e.status,httpStatus:e.httpStatus,url:url(e.url),message:text(e.message),imageWidth:e.imageWidth,imageHeight:e.imageHeight,byteLength:e.byteLength}))});
 }
}catch(e){report.errors.push(text(e.message));}
await writeFile(process.env.RUNNER_TEMP+'/tm222-current-failure-evidence.json',JSON.stringify(report,null,2));
console.log('TM222_CURRENT_FAILURES '+JSON.stringify(report));
// Unavailable live diagnostics are not an application test failure; report coverage explicitly.
