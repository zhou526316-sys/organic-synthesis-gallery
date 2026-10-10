import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
function extract(name) {
 const start=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));
 assert.ok(start>=0,'Missing source '+name);
 const tail=source.slice(start),end=tail.indexOf('\n  }\n');
 assert.ok(end>0,'Truncated source '+name);
 return tail.slice(0,end+5);
}
const doi='10.1021/acs.joc.6c01847';
function simulate({figure1=true,officialAvailable=false,permission=false}={}) {
 const calls=[],receipts=[],checkpoints=[];
 const official={url:'https://pubs.acs.org/doi/10.1021/acs.joc.6c01847/official.svg',kind:'official'};
 const fallback={url:'https://pubs.acs.org/doi/10.1021/acs.joc.6c01847/figure1.svg',kind:'figure1',label:'Figure 1'};
 let job;
 const ctx=vm.createContext({
   URL,Date,Math,Map,Set,Number,String,Boolean,Promise,Error,console,
   VERSION:'6.2.20',CONTROLLER_REVISION:'2.2.41',autoReportJob:null,
   location:{href:'https://pubs.acs.org/doi/10.1021/acs.joc.6c01847'},
   assertBoundCaptureJob:j=>assert.equal(j.doi,doi),
   writeToken:()=> '测试授权占位符',
   readCheckpoint:()=>({figures:{},updatedAt:0}),
   saveCheckpoint:(d,checkpoint)=>{assert.equal(d,doi);checkpoints.push(checkpoint)},
   captureLiveUpdate:()=>{},pushTrace:(_t,row)=>calls.push(['trace',row.stage,row.event]),
   evidenceCaptureEligible:()=>false,
   publisherForDoi:()=> 'acs',
   nowIso:()=>new Date().toISOString(),
   waitForPairedVisuals:async j=>{
     job=j;
     return {toc:figure1?[official,fallback]:[official],figures:[]};
   },
   acquireBestVisual:async(_job,rows,_trace,_cache,role)=>{
     assert.equal(role,'toc');
     calls.push(['acquire',rows[0].kind]);
     if(rows[0].kind==='official')return officialAvailable?{
       candidate:official,quality:{quality:'vector'},image:{width:1200,height:600}
     }:null;
     if(!figure1)return null;
     return {candidate:fallback,quality:{quality:'high'},image:{width:1200,height:600}};
   },
   uploadCapture:async(_job,c,image)=>{
     calls.push(['upload',c.kind]);assert.ok(image.width>=1200);
     const r={productionTocStored:c.kind==='official',
       productionFallbackStored:c.kind==='figure1',
       imageUrl:'https://api.gczhouwld.com/media/verified/'+c.kind+'.svg'};
     receipts.push(r);return r;
   },
   tryCaptureArticleEvidence:async()=>({status:'not_requested'}),
   captureResultHasUsefulLayer:()=>true,
   finishPairedJob:async(_j,result)=>result,
   GM_getValue:()=>null
 });
 vm.runInContext(extract('runPublisherJob'),ctx);
 return {run:()=>ctx.runPublisherJob({doi,publisher:'acs',captureToc:true,
      captureFigures:false,capturePrivatePdf:false,allowFigureOne:!permission,
      mediaNeed:'toc',startedAt:new Date().toISOString()}),
   calls,receipts,checkpoints,get job(){return job;}};
}
test('unusable official TOC falls back to a genuine DOI-bound Figure 1 and requires production fallback receipt',async()=>{
 const h=simulate();
 const result=await h.run();
 assert.equal(result.toc.status,'stored');
 assert.equal(result.toc.kind,'figure1');
 assert.equal(result.toc.productionFallbackStored,true);
 assert.equal(result.status,'success');
 assert.deepEqual(h.calls.filter(x=>x[0]==='acquire').map(x=>x[1]),['official','figure1']);
 assert.equal(h.receipts.length,1);
});
test('usable official TOC remains first priority, no redundant Figure 1 download',async()=>{
 const h=simulate({officialAvailable:true});
 const r=await h.run();
 assert.equal(r.toc.kind,'official');
 assert.deepEqual(h.calls.filter(x=>x[0]==='acquire').map(x=>x[1]),['official']);
});
test('when Figure 1 is disabled or absent, failed official TOC does not become a false success',async()=>{
 const h=simulate({figure1:false});
 const r=await h.run();
 assert.equal(r.toc.status,'not_found');
 assert.equal(h.receipts.length,0);
});
test('blocked reason categories separate publisher gates, PDF 403, missing images and upload timeouts',()=>{
 const ctx=vm.createContext({String,RegExp});
 vm.runInContext(extract('captureBlockCategory'),ctx);
 assert.match(ctx.captureBlockCategory('publisher_access_gate'),/出版社访问验证/);
 assert.match(ctx.captureBlockCategory('pdf=private_pdf_http_403'),/PDF 权限/);
 assert.match(ctx.captureBlockCategory('combined_capture;toc=not_found;figures=0/0'),/主图未获取/);
 assert.doesNotMatch(ctx.captureBlockCategory('combined_capture;toc=not_found;figures=0/0'),/出版社访问验证/);
 assert.match(ctx.captureBlockCategory('gm_request_timeout'),/媒体传输/);
});
console.log('TM_OCT10_JOC_FIGURE1',JSON.stringify({tests:4,publisherRequests:0,productionWrites:0}));
