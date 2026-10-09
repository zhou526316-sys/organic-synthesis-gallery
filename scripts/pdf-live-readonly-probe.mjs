#!/usr/bin/env node
// Public, unauthenticated probe only. GitHub runner is NOT an on-campus or
// Mainland China test, and never receives or requests owner credentials.
import https from 'node:https';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const targets=[
  {name:'public-private-viewer-shell',url:'https://gallery.gczhouwld.com/pdf/',kind:'html',marker:'连续滚动'},
  {name:'public-local-vault-shell',url:'https://gallery.gczhouwld.com/pdf-vault/',kind:'html'},
  {name:'public-api-healthcheck',url:'https://api.gczhouwld.com/api/_healthcheck',kind:'json'},
];
const toMs=n=>Number.isFinite(n)?Math.round(n):null;
function checkOne(target){
 return new Promise(resolve=>{
  const start=performance.now(),events={};let done=false,sample='';
  const finish=patch=>{
   if(done)return;done=true;
   const result={target:target.name,host:new URL(target.url).hostname,...patch,
    totalMs:toMs(performance.now()-start),lookupMs:toMs(events.lookup),
    tcpMs:toMs(events.tcp),tlsMs:toMs(events.tls),ttfbMs:toMs(events.ttfb)};
   console.log('PDF_PUBLIC_READONLY_PROBE '+JSON.stringify(result));resolve(result);
  };
  const req=https.request(target.url,{
   method:'GET',timeout:9000,agent:false,headers:{
    'user-agent':'OrganicSynthesisGallery-PDF-public-readonly-acceptance/1.0',
    'accept':target.kind==='json'?'application/json':'text/html',
    'accept-encoding':'identity','cache-control':'no-cache',
   }
  },res=>{
   events.ttfb=performance.now()-start;
   const type=String(res.headers['content-type']||'').toLowerCase();
   const typeOk=target.kind==='json'?type.includes('json'):type.includes('text/html');
   let received=0;
   res.on('data',chunk=>{
    received+=chunk.length;
    if(sample.length<100000)sample+=chunk.toString('utf8',0,Math.min(chunk.length,100000-sample.length));
    if(received>200000)req.destroy(new Error('body_limit'));
   });
   res.on('end',()=>finish({ok:res.statusCode===200&&typeOk&&(!target.marker||sample.includes(target.marker)),
    status:res.statusCode,contentType:type.slice(0,90),typeOk,
    markerPresent:target.marker?sample.includes(target.marker):null,bytes:received}));
  });
  req.on('socket',socket=>{
   socket.once('lookup',()=>{events.lookup=performance.now()-start;});
   socket.once('connect',()=>{events.tcp=performance.now()-start;});
   socket.once('secureConnect',()=>{events.tls=performance.now()-start;});
  });
  req.on('error',error=>finish({ok:false,errorName:String(error?.code||error?.name||'network_error').slice(0,90)}));
  req.on('timeout',()=>req.destroy(new Error('public_probe_timeout')));
  req.end();
 });
}
const results=await Promise.all(targets.map(checkOne));
const summary={schemaVersion:1,source:'github-hosted-linux-runner',mainlandCampusAcceptance:false,
 ownerAuthenticatedAcceptance:false,productionMutations:false,includesPrivateBytes:false,
 completedAt:new Date().toISOString(),ok:results.every(r=>r.ok),results};
if(process.env.PDF_PUBLIC_PROBE_OUTPUT)
 await fs.writeFile(process.env.PDF_PUBLIC_PROBE_OUTPUT,JSON.stringify(summary,null,2)+'\n');
console.log('PDF_PUBLIC_READONLY_SUMMARY '+JSON.stringify({ok:summary.ok,source:summary.source,mainlandCampusAcceptance:false}));
if(!summary.ok)process.exitCode=1;
