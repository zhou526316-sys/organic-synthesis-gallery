#!/usr/bin/env node
// Read-only, owner-free Graphical CI probe. Never use real user tokens,
// signed PDF URLs, user DOI or private file bytes.
// Overseas GitHub runner RTT is NOT the user's China/campus RTT.
import https from 'node:https';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs/promises';

const SERVERS=[
 {name:'canonical',host:'api.gczhouwld.com'},
 {name:'backup',host:'organic-synthesis-gallery.zhou526316.workers.dev'},
];
const paths=[
 {name:'health',method:'GET',path:'/api/_healthcheck',expected:[200]},
 {name:'invalid-session-index-lookup',method:'GET',path:'/api/user-ui/auth/session',expected:[200,401],bearer:true},
 {name:'unauthorized-pdf-open',method:'POST',path:'/api/user-ui/private-pdf/open?doi=10.9999%2Fsynthetic-latency-diagnostic&mode=view',expected:[401],bearer:true},
];
function safeCode(err){return String(err?.code || err?.name || 'REQUEST_FAILED').slice(0,60);}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function request(host,spec) {
 return new Promise(resolve=>{
  const start=performance.now();
  let finished=false;
  let timing={};
  const done=x=>{if(finished)return;finished=true;
   resolve({host,case:spec.name,method:spec.method,expected:spec.expected,
     status:x.status??null,error:x.error||null,ttfbMs:timing.ttfbMs??null,
     totalMs:Math.round(performance.now()-start),dnsMs:timing.dnsMs??null,
     tlsMs:timing.tlsMs??null,
     ok:spec.expected.includes(x.status)});
  };
  const req=https.request({hostname:host,port:443,method:spec.method,
   path:spec.path,timeout:9500,rejectUnauthorized:true,
   headers:{'user-agent':'Gallery-PDF-readonly-latency-audit/20261009',
    'origin':'https://gallery.gczhouwld.com',
    ...(spec.bearer?{'authorization':'Bearer invalid-synthetic-diagnostic-no-user-20261009'}:{})}
  },res=>{
    timing.ttfbMs=Math.round(performance.now()-start);
    let length=0;
    res.on('data',bytes=>{
      length+=bytes.length;
      if(length>2048)req.destroy(Object.assign(new Error('bounded_body'),{code:'BODY_LIMIT'}));
    });
    res.on('end',()=>done({status:res.statusCode}));
  });
  req.on('socket',socket=>{
    socket.on('lookup',()=>{timing.dnsMs=Math.round(performance.now()-start);});
    socket.on('secureConnect',()=>{timing.tlsMs=Math.round(performance.now()-start);});
  });
  req.on('error',err=>done({error:safeCode(err)}));
  req.on('timeout',()=>req.destroy(Object.assign(new Error('network_timeout'),{code:'TIMEOUT'})));
  req.end();
 });
}
const rows=[];
for(const service of SERVERS){
 for(let i=0;i<3;i++){
  for(const testCase of paths) {
   const row=await request(service.host,testCase);
   rows.push({route:service.name,sample:i+1,...row});
   await wait(130);
  }
 }
}
const aggregate={};
for(const service of SERVERS){
 aggregate[service.name]={};
 for(const test of paths){
  const matches=rows.filter(r=>r.route===service.name&&r.case===test.name);
  const values=matches.filter(x=>x.ok&&x.ttfbMs!==null).map(x=>x.ttfbMs).sort((a,b)=>a-b);
  aggregate[service.name][test.name]={
   attempts:matches.length,successes:matches.filter(x=>x.ok).length,
   medianTtfbMs:values.length?values[Math.floor(values.length/2)]:null,
   minTtfbMs:values.at(0)??null,maxTtfbMs:values.at(-1)??null,
   errors:matches.filter(x=>!x.ok).map(x=>x.error||('HTTP_'+x.status)).slice(0,3)
  };
 }
}
const summary={schemaVersion:1,createdAt:new Date().toISOString(),
 source:'GitHub-hosted overseas runner',mainlandChinaMeasurement:false,
 actualOwnerAuthorization:false,publisherPDFBytesRead:false,
 privateDataAccess:false,productionMutations:false,rows,aggregate};
const overall=rows.every(row=>row.ok);
summary.allExpectedStatuses=overall;
console.log('PDF_PUBLIC_LATENCY_DIAGNOSTIC '+JSON.stringify(summary));
if(process.env.PDF_LATENCY_OUTPUT){
 await fs.writeFile(process.env.PDF_LATENCY_OUTPUT,JSON.stringify(summary,null,2)+'\n');
}
if(!overall)process.exitCode=1;
