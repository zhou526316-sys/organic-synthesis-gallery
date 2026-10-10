const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const source=fs.readFileSync(path.resolve('scripts/pdf-private-range-comparison-console.js'),'utf8');
const origin='https://gallery.gczhouwld.com';
const primary='https://api.gczhouwld.com';
const tencent='https://pdf.gczhouwld.com';
const HASH='a'.repeat(64);
const SIZE=2600000;
const makeResponse=(status,body,headers={})=>({
 status,ok:status>=200&&status<300,
 json:async()=>body,
 headers:{get:k=>headers[String(k).toLowerCase()]||''},
 body:{cancel:async()=>{}},
 arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength),
});
async function run(options={}){
 const requests=[],tables=[],warnings=[];
 const forbidden='fixture-private-owner-session-must-not-leak';
 const auth={};
 const fetch=async(target,opts)=>{
  const u=new URL(target);
  const range=opts.headers?.Range||'';
  requests.push({origin:u.origin,path:u.pathname,range,method:opts.method});
  assert([primary,tencent].includes(u.origin),'no arbitrary hosts');
  assert.equal(opts.redirect,'error');
  if(u.pathname==='/api/user-ui/private-pdf/open'){
   assert.equal(opts.headers.authorization,'Bearer '+forbidden);
   assert.equal(opts.credentials,'omit');
   if(options.denied && u.origin===primary) return makeResponse(403,{error:'not_entitled'});
   const hash=u.origin===tencent&&options.badHash?'b'.repeat(64):HASH;
   auth[u.origin]=true;
   return makeResponse(200,{
    available:true,headerVerified:true,byteLength:SIZE,contentHash:hash,
    url:u.origin+'/api/user-ui/private-pdf/file?token='+('x'.repeat(64)),
   });
  }
  assert.equal(u.pathname,'/api/user-ui/private-pdf/file');
  assert.equal(auth[u.origin],true,'file cannot precede authorized /open on same host');
  assert.equal(opts.credentials,'include');
  const match=/^bytes=(\d+)-(\d+)$/.exec(range);
  assert(match,'Range header required');
  const begin=Number(match[1]),end=Number(match[2]);
  assert(end-begin+1<=1024*1024,'request must stay <=1MiB');
  const data=Buffer.alloc(end-begin+1,0);
  if(begin===0)data.write('%PDF-');
  return makeResponse(206,data,{
   'content-range':`bytes ${begin}-${end}/${SIZE}`,
   'content-type':'application/pdf',
   'content-length':String(data.length),
  });
 };
 const ctx={location:{origin},prompt:()=> '10.1021/jacs.6c17448',
  localStorage:{getItem:()=>forbidden},URL,TextDecoder,Uint8Array,
  performance,fetch,AbortController,setTimeout,clearTimeout,
  console:{table:r=>tables.push(r),warn:x=>warnings.push(x)}};
 await vm.runInNewContext(source,ctx,{timeout:2000});
 assert.equal(tables.length,1,'only one redacted terminal result');
 const serialized=JSON.stringify(tables);
 assert(!serialized.includes(forbidden));
 assert(!serialized.includes('token='));
 assert(!serialized.includes('10.1021/jacs.6c17448'));
 return{requests,tables,warnings};
}
(async()=>{
 const happy=await run();
 assert.equal(happy.requests.length,6,'two opens plus four bounded file ranges');
 assert.equal(happy.tables[0][0].phase,'passed');
 assert.equal(happy.tables[0][1].phase,'passed');
 assert.equal(happy.tables[0][0].hashMatch,true);
 assert.equal(happy.tables[0][1].hashMatch,true);
 assert.equal(happy.tables[0][0].frontBytes,1024*1024);
 assert.equal(happy.tables[0][1].frontBytes,1024*1024);
 assert.equal(happy.tables[0][0].tailValid,true);
 const mismatch=await run({badHash:true});
 assert.equal(mismatch.requests.length,2,'mismatched SHA must not read bytes');
 assert.equal(mismatch.tables[0][0].reason,'different_pdf_identity');
 const denied=await run({denied:true});
 assert.equal(denied.requests.length,1,'canonical 403 prevents contacting Tencent');
 assert.equal(denied.tables[0][1].reason,'canonical_authorize_not_passed');
 console.log('PDF_OWNER_REAL_RANGE_CANARY_TEST_PASS: independent tickets, up to 1MiB/host, SHA match, 403 denied, no log secrets');
})().catch(error=>{console.error(error);process.exitCode=1;});
