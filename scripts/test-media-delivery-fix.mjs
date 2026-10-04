import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {getStagedArticleFigures,getTampermonkeyReports,importTampermonkeyReport} from '../cloudflare/worker/src/local-captures.js';
import {readPublicationPages} from '../cloudflare/scripts/read-publication-pages.mjs';
import {completedPacketMap,fetchStored} from '../cloudflare/scripts/merge-new-body-auto.mjs';
const E=1790082000000,stageKey='local-captures/article-figures/stage-index.json',reportKey='local-captures/tampermonkey/report-index.json';
let passed=0;async function test(n,f){await f();passed++;console.log('MEDIA_DELIVERY_PASS '+n);}
function env(items={},reports={}){
 const values=new Map([[stageKey,JSON.stringify({items})],[reportKey,JSON.stringify({items:reports})]]);
 return {values,MEDIA:{get:async k=>values.has(k)?{text:async()=>values.get(k)}:null,put:async(k,v)=>values.set(k,String(v))}};
}
function row(n){const doi='10.1021/jacs.6c'+String(n).padStart(5,'0');return {doi,id:'figure-1',label:'Figure 1',captureVersion:'6.2.20',pageDoi:doi,mediaGeneration:E,updatedAt:E+n+1000,sourceUrl:'https://pubs.acs.org/doi/full/'+doi,articleUrl:'https://pubs.acs.org/doi/full/'+doi,sha256:'a'.repeat(64),reviewMarker:{state:'pending_review',evidenceSha256:'b'.repeat(64)},caption:'Figure 1. Full immutable evidence',r2Key:'fixture-'+n};}
const items=Object.fromEntries(Array.from({length:2349},(_,i)=>[String(i),row(i)]));
const environment=env(items);
async function transport(url,environment=env()){
 const r=await (url.includes('tampermonkey-reports')?getTampermonkeyReports:getStagedArticleFigures)(new Request(url),environment);
 if(r.status!==200)throw Error('auto_read_http_'+r.status);return Buffer.from(JSON.stringify(r.body));
}
const stageUrl='https://api.gczhouwld.com/api/article-figures/staged',reportsUrl='https://api.gczhouwld.com/api/media/tampermonkey-reports';
await test('complete2349 rows traverse all pages without losing evidence fields',async()=>{
 const p=await readPublicationPages(stageUrl,'stage',u=>transport(u,environment));assert.equal(p.count,2349);assert.equal(p.items.length,2349);assert.ok(p.items.every(r=>r.reviewMarker.evidenceSha256==='b'.repeat(64)&&r.caption&&r.sha256));
});
await test('old list and compact inventory response contracts are untouched',async()=>{
 const p=await getStagedArticleFigures(new Request(stageUrl),environment);assert.equal(p.body.count,2349);assert.equal(p.body.items.length,2000);
 const q=await getStagedArticleFigures(new Request(stageUrl+'?inventory=1'),environment);assert.equal(q.body.schemaVersion,'capture-inventory-v1');assert.equal(q.body.complete,true);
});
await test('changed snapshot409 is explicit and never returns a mixed second page',async()=>{
 const e=env(items);const a=await getStagedArticleFigures(new Request(stageUrl+'?publication=1'),e);e.values.set(stageKey,JSON.stringify({items:{...items,new:row(9999)}}));
 const b=await getStagedArticleFigures(new Request(stageUrl+'?publication=1&offset=250&snapshot='+a.body.snapshot),e);assert.equal(b.status,409);
});
await test('client restarts whole snapshot after one409, then reads all2349',async()=>{
 let failed=false;const p=await readPublicationPages(stageUrl,'stage',async u=>{if(!failed&&new URL(u).searchParams.get('offset')==='250'){failed=true;throw Error('auto_read_http_409');}return transport(u,environment)});assert.equal(p.items.length,2349);assert.ok(failed);
});
await test('permanent snapshot changes terminate after bounded attempts',async()=>{
 let starts=0;await assert.rejects(()=>readPublicationPages(stageUrl,'stage',async u=>{if(new URL(u).searchParams.get('offset')==='0'){starts++;return transport(u,environment)}throw Error('auto_read_http_409')}),/409/);assert.equal(starts,3);
});
await test('duplicate identity or truncated page cannot be published',async()=>{
 await assert.rejects(()=>readPublicationPages(stageUrl,'stage',async u=>{const p=JSON.parse(await transport(u,environment));if(p.offset===250)p.items[0]=p.items[1];return Buffer.from(JSON.stringify(p))}),/duplicate/);
 await assert.rejects(()=>readPublicationPages(stageUrl,'stage',async u=>{const p=JSON.parse(await transport(u,environment));p.items.pop();return Buffer.from(JSON.stringify(p))}),/truncated/);
});
await test('corrupt indexes are503, not fabricated empty ready lists',async()=>{
 const e=env();e.values.set(stageKey,'broken-json');const p=await getStagedArticleFigures(new Request(stageUrl+'?publication=1'),e);assert.equal(p.status,503);
});
await test('unsafe offset, unbounded page limit and missing snapshot are400',async()=>{
 for(const q of ['offset=-1','limit=500000','offset=250','snapshot=not-a-hash'])assert.equal((await getStagedArticleFigures(new Request(stageUrl+'?publication=1&'+q),environment)).status,400);
});
await test('foreign DOI remains excluded from publication listing',async()=>{
 const r={...row(1),sourceUrl:row(2).sourceUrl};const e=env({r});const p=await readPublicationPages(stageUrl,'stage',u=>transport(u,e));assert.equal(p.count,0);
});
const d=row(1).doi;
const success={doi:d,jobId:'capture-fixture-123456789',captureVersion:'6.2.20',controllerRevision:'2.2.39',final:true,status:'success',mediaNeed:'figures',figuresStored:2,figuresDiscovered:2,figureLabels:['Figure 1','Figure 2'],articleUrl:row(1).articleUrl,sourceUrl:row(1).sourceUrl,updatedAt:E+6000};
await test('valid older complete packet survives a newer TOC-only report',async()=>{
 const e=env({}, {[d]:{...success,status:'partial',mediaNeed:'toc',updatedAt:E+9000,attempts:[success]}});
 const p=await readPublicationPages(reportsUrl,'reports',u=>transport(u,e));assert.equal(p.count,1);assert.equal(p.items[0].mediaNeed,'figures');assert.ok(completedPacketMap({reports:p}).has(d));
});
await test('incomplete, old-client or nonfinal evidence never authorizes body publication',async()=>{
 for(const patch of [{status:'partial'},{final:false},{captureVersion:'6.2.19'},{figuresStored:1},{updatedAt:E-1}]){
  const e=env({}, {[d]:{...success,...patch}});const p=await readPublicationPages(reportsUrl,'reports',u=>transport(u,e));assert.equal(p.count,0);
 }
});
await test('public complete-packet view has no trace or raw-text fields',async()=>{
 const e=env({}, {[d]:{...success,trace:[{text:'private fixture'}],bodyText:'private text'}});const p=await readPublicationPages(reportsUrl,'reports',u=>transport(u,e));assert.ok(!('trace'in p.items[0]));assert.ok(!('bodyText'in p.items[0]));
});
await test('saved complete packet survives more than12 subsequent diagnostics',async()=>{
 const e=env();await importTampermonkeyReport(new Request(reportsUrl),e,success);
 for(let n=0;n<15;n++)await importTampermonkeyReport(new Request(reportsUrl),e,{...success,jobId:'toc-only-fixture-'+n,status:'partial',mediaNeed:'toc',figuresDiscovered:0,figuresStored:0,figureLabels:[]});
 const p=await readPublicationPages(reportsUrl,'reports',u=>transport(u,e));assert.equal(p.count,1);assert.equal(p.items[0].figuresStored,2);
});
await test('publication storage helper still refuses direct publisher downloads',async()=>{
 await assert.rejects(()=>fetchStored('https://pubs.acs.org/image.svg'),/not_stored/);await assert.rejects(()=>fetchStored('https://evil.example/image.png'),/not_stored/);
});
function extensionFunction(s){const a=s.indexOf('function extensionFor('),b=s.indexOf('\n}',a)+2;assert.ok(a>0);return vm.runInNewContext(s.slice(a,b)+';extensionFor',{URL,FALLBACK_SITE:'https://gallery.gczhouwld.com'});}
const svg='<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="900" height="450"><path d="M1 1L899 449"/><text x="20" y="40">Graphical Abstract fixture</text></svg>';
await test('both mirror programs preserve actual SVG extension',async()=>{
 for(const f of ['build-pages-mirror','merge-worker-media']){const ext=extensionFunction(await readFile('cloudflare/scripts/'+f+'.mjs','utf8'));assert.equal(ext('image/svg+xml; charset=utf-8','https://api.gczhouwld.com/file.svg'),'svg');assert.equal(ext('application/octet-stream','https://api.gczhouwld.com/file.svg'),'svg');assert.equal(ext('image/png','https://api.gczhouwld.com/file.png'),'png');}
});
await test('unchanged sanitizer rejects old JPG-mislabelling but retains identical SVG bytes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'media-delivery-'));try{
 await mkdir(path.join(root,'public/media-mirror'),{recursive:true});await writeFile(path.join(root,'public/media-mirror/old.jpg'),svg);await writeFile(path.join(root,'public/media-mirror/fixed.svg'),svg);
 await writeFile(path.join(root,'public/media-index.json'),JSON.stringify({items:{old:{toc:{available:true,imageUrl:'media-mirror/old.jpg'}},fixed:{toc:{available:true,imageUrl:'media-mirror/fixed.svg'}}}}));
 const run=spawnSync(process.execPath,[path.resolve('cloudflare/scripts/sanitize-static-media.mjs')],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const out=JSON.parse(await readFile(path.join(root,'public/media-index.json'),'utf8'));assert.equal(out.items.old.toc.reason,'invalid_static_media_pruned');assert.equal(out.items.fixed.toc.available,true);
 }finally{await rm(root,{recursive:true,force:true})}
});
await test('input errors have dedicated error mode rather than zero waiting',async()=>{
 const s=await readFile('cloudflare/scripts/merge-new-body-auto.mjs','utf8');assert.ok(s.includes("mode:'input_error',count:null,articles:null"));assert.ok(s.includes('process.exitCode=1'));
});
console.log(JSON.stringify({passed,productionWrites:0,publisherRequests:0}));
