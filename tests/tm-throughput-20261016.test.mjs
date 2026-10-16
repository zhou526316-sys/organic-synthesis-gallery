import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=readFileSync('public/toc-mainline.user.js','utf8');
const loader=readFileSync('cloudflare/scripts/build-bridge-loader.mjs','utf8');
const start=source.indexOf('  async function uploadArticleFigure(');
const end=source.indexOf('  function rasterizeVerifiedFigureOne(',start);
assert.ok(start>0&&end>start,'bounded article-figure upload helper');
const code=source.slice(start,end);

function fixture(retained=true){
  const activity={direct:0,queued:0,trace:[]};
  const doi='10.1021/jacs.6c16000',job={doi,addedDate:'2026-10-16',
    jobId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',_imageOutboxDeferFigures:true};
  const candidate={label:'Figure 4',text:'Source scientific figure',url:'https://pubs.acs.org/doi/'+doi};
  const image={imageData:'data:image/png;base64,'+'a'.repeat(1024),width:900,height:800,byteLength:768};
  const ctx={
    Number,String,Boolean,Object,Error,VERSION:'6.2.20',
    location:{href:'https://pubs.acs.org/doi/'+doi},
    FIGURE_STAGE_ENDPOINT:'https://api.gczhouwld.com/api/article-figures/stage',
    assertBoundCaptureJob:()=>doi,normalizeDoi:x=>String(x||'').toLowerCase(),
    captureLiveUpdate:()=>{},pushTrace:(trace,entry)=>{trace.push(entry);},
    retainImageForGalleryUpload:(job,endpoint,payload,stage,error)=>{
      activity.queued++;
      assert.equal(job.doi,doi);assert.equal(payload.id,'figure-4');
      assert.equal(stage,'figure_stage');
      assert.equal(String(error.message),'image_upload_deferred_to_gallery');
      return retained;
    },
    postAcquiredImage:async()=>{
      activity.direct++;
      return {stored:true,staged:true,doi,id:'figure-4',
        contentHash:'a'.repeat(32),width:900,height:800,imageUrl:'https://api.gczhouwld.com/media/fixture'};
    }
  };
  vm.createContext(ctx);
  vm.runInContext(code+'\n globalThis.upload=uploadArticleFigure;',ctx);
  return {ctx,activity,job,candidate,image};
}

test('publisher Figure 4 saved to durable outbox never claims remote staging',async()=>{
  const h=fixture(true);
  await assert.rejects(()=>h.ctx.upload(h.job,h.candidate,h.image,h.activity.trace,'测试授权占位符',3),
    /figure_upload_locally_deferred/);
  assert.equal(h.activity.queued,1);assert.equal(h.activity.direct,0);
  assert.ok(h.activity.trace.some(r=>r.event==='persisted_for_gallery'&&r.status==='deferred'));
  assert.equal(h.activity.trace.some(r=>r.event==='complete'&&r.status==='ok'),false);
});

test('local outbox capacity refusal uses prior direct stage fallback',async()=>{
  const h=fixture(false);
  const r=await h.ctx.upload(h.job,h.candidate,h.image,h.activity.trace,'测试授权占位符',3);
  assert.equal(h.activity.queued,1);assert.equal(h.activity.direct,1);
  assert.equal(r.staged,true);assert.equal(r.published,false);
});

test('source preserves only cloud verified figures in saved counts',()=>{
  assert.match(source,/result\.figures\.deferred=Number\(result\.figures\.deferred\|\|0\)\+1/);
  assert.match(source,/status:'deferred',reason:'figure_gallery_replay_pending'/);
  assert.match(source,/result\.figures\.stored\+=1;result\.figuresStaged\+=1;/);
  assert.match(source,/figures\.stored>=figures\.discovered/);
  assert.match(source,/replayOneDeferredImage\(\)\.catch/);
  assert.match(source,/if\(!isGalleryPage\(\)\|\|imageOutboxBusy\|\|!writeToken\(\)\)return false/);
});

test('early userscript injection does not weaken job, page or owner authorization',()=>{
  assert.ok(source.includes('// @run-at       document-end'));
  assert.ok(loader.includes('// @run-at       document-end'));
  assert.ok(!source.includes('// @run-at       document-start'));
  assert.ok(source.includes("var INSTALL_REVISION = '6.2.71';"));
  assert.ok(loader.includes("const loaderVersion = '2.2.90';"));
  for(const marker of ['assertBoundCaptureJob(job, candidate.url)',
    'page_doi_unverified','capture_job_stale_or_unbound',
    'privatePdfLease()','ownerPdfReplayBackpressure()'])assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/\beval\s*\(/);
});

console.log('TM_20261016_THROUGHPUT_TEST',{tests:4,actualPublisherRequests:0,mediaWrites:0,ownerPdfReads:0});
