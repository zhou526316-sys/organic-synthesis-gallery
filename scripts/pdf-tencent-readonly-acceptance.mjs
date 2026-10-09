#!/usr/bin/env node
// Owner-free, read-only, zero-credential gate for a potential Tencent PDF HTTPS ingress.
// A GitHub-hosted runner is NOT a mainland user connection, cannot validate owner PDFs,
// and MUST NOT turn on the Gallery route manifest.
import dns from 'node:dns/promises';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const PDF_HOST='pdf.gczhouwld.com';
const RELAY_HOST='relay.gczhouwld.com';
const ORIGIN='https://gallery.gczhouwld.com';
const OUTPUT=process.env.PDF_TENCENT_PUBLIC_REPORT||'';
function errorCode(err) { return String(err?.code || err?.name || 'unknown_error').slice(0,80); }
function round(x) { return Number.isFinite(x) ? Math.round(x) : null; }
async function resolve(host) {
  const began=performance.now();
  try {
    const items=await dns.resolve4(host);
    return {ok:items.length>0,ips:[...new Set(items)].sort(),lookupMs:round(performance.now()-began)};
  } catch(err) { return {ok:false,ips:[],lookupMs:round(performance.now()-began),error:errorCode(err)}; }
}
function request(method,path) {
  const start=performance.now();
  return new Promise(resolve=>{
    let closed=false,count=0,body='';
    const done=result=>{
      if(closed)return;closed=true;
      resolve({method,path,status:result.status||0,ok:!!result.ok,
        contentType:result.contentType||null,role:result.role||null,authenticated:result.authenticated??null,
        cors:result.cors??null,remoteIp:result.remoteIp||null,error:result.error||null,
        ttfbMs:round(result.ttfbMs),totalMs:round(performance.now()-start),
        tlsVerified:result.tlsVerified===true});
    };
    const req=https.request({hostname:PDF_HOST,port:443,path,method,
      rejectUnauthorized:true,servername:PDF_HOST,timeout:7000,headers:{
        'accept':'application/json','origin':ORIGIN,
        'cache-control':'no-cache','user-agent':'Gallery-PDF-owner-free-readonly-diagnostic/1'
      }},res=>{
      const ttfbMs=performance.now()-start;
      res.on('data',chunk=>{
        count+=chunk.length;if(body.length<1200)body+=chunk.toString('utf8',0,Math.min(chunk.length,1200-body.length));
        if(count>2048)req.destroy(new Error('body_limit'));
      });
      res.on('end',()=>{
        let result={};try{result=JSON.parse(body);}catch{}
        const tlsVerified=res.socket?.authorized===true;
        const role=result?.role==='private-pdf-ingress'?result.role:null;
        const isHealth=path==='/_pdf_gateway_health';
        const noPdfResponse=!String(res.headers['content-type']||'').toLowerCase().includes('application/pdf');
        const cors=res.headers['access-control-allow-origin']||null;
        const ok=isHealth
          ? res.statusCode===200&&role==='private-pdf-ingress'&&result?.ok===true&&result.authenticated===false
          : path==='/api/user-ui/private-pdf/file'
            ? res.statusCode===401&&noPdfResponse
            : res.statusCode===204&&cors===ORIGIN;
        done({status:res.statusCode,ok,contentType:String(res.headers['content-type']||'').slice(0,70),
          role,authenticated:typeof result?.authenticated==='boolean'?result.authenticated:null,
          cors,remoteIp:res.socket?.remoteAddress||null,ttfbMs,tlsVerified});
      });
    });
    req.on('error',err=>done({error:errorCode(err),ok:false}));
    req.on('timeout',()=>req.destroy(Object.assign(new Error('socket_timeout'),{code:'SOCKET_TIMEOUT'})));
    req.end();
  });
}

function inspectPresentedCertificate() {
  // Diagnostic TLS handshake only: intentionally skips trust validation to
  // inspect the broken certificate's public DNS names. No HTTP, credentials,
  // cookies or private URLs are sent. Never use this socket for document access.
  return new Promise(resolve=>{
    let finished=false;
    const done=value=>{if(finished)return;finished=true;resolve(value);};
    const socket=tls.connect({host:PDF_HOST,port:443,servername:PDF_HOST,
      rejectUnauthorized:false,timeout:6000},()=>{
      const cert=socket.getPeerCertificate();
      const dnsNames=String(cert?.subjectaltname||'').split(', ')
        .filter(name=>name.startsWith('DNS:')).map(name=>name.slice(4)).slice(0,12);
      done({handshakeOk:true,untrustedInspectionOnly:true,
        presentedCommonName:String(cert?.subject?.CN||'').slice(0,140),
        presentedDnsNames:dnsNames,validTo:String(cert?.valid_to||'').slice(0,70),
        hostnamePresent:dnsNames.some(name=>name===PDF_HOST || name==='*.gczhouwld.com')});
      socket.end();
    });
    socket.on('error',err=>done({handshakeOk:false,error:errorCode(err)}));
    socket.on('timeout',()=>{socket.destroy();done({handshakeOk:false,error:'SOCKET_TIMEOUT'});});
  });
}

const results={schemaVersion:1,runAt:new Date().toISOString(),
  source:'GitHub hosted Linux runner (not mainland China)',
  authenticatingUser:false,ownerAccessTested:false,privatePdfDownloaded:false,
  networkProviderAcceptance:false,productionMutations:false,gateEnabled:false};
const [pdf,relay]=await Promise.all([resolve(PDF_HOST),resolve(RELAY_HOST)]);
const match=pdf.ok&&relay.ok&&pdf.ips.some(ip=>relay.ips.includes(ip));
results.dns={pdf,relay,sharesExistingHost:match};
if(match) {
  results.health=await request('GET','/_pdf_gateway_health');
  if(!results.health.ok) results.presentedCertificate=await inspectPresentedCertificate();
  if(results.health.ok) {
    results.anonymousDenial=await request('GET','/api/user-ui/private-pdf/file');
    results.preflight=await request('OPTIONS','/api/user-ui/private-pdf/open');
  }
}
results.ok=!!(match&&results.health?.ok&&results.anonymousDenial?.ok&&results.preflight?.ok);
results.reason=!pdf.ok?'pdf_dns_unavailable':
  !relay.ok?'relay_dns_unavailable':
  !match?'pdf_relay_dns_mismatch':
  !results.health?.ok?'https_gateway_health_not_confirmed':
  !results.anonymousDenial?.ok?'anonymous_file_access_check_failed':
  !results.preflight?.ok?'cors_preflight_check_failed':'public_transport_preflight_passed';
console.log('PDF_TENCENT_READONLY_REPORT '+JSON.stringify(results));
if(OUTPUT)await fs.writeFile(OUTPUT,JSON.stringify(results,null,2)+'\n');
if(!results.ok)process.exitCode=1;
