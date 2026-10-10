import assert from 'node:assert/strict';
import {
  TENCENT_PDF_ORIGIN, CANONICAL_PDF_ORIGIN, BACKUP_PDF_ORIGIN,
  tencentPdfRouteEnabled, nextOwnerPdfFileOrigin,
  isMatchingOwnerPdfFileSource, isMatchingOwnerPdfFileIdentity, ownerPdfRouteLabel,
} from '../src/pdf-tencent-file-failover.mjs';

const config = {schemaVersion:1,enabled:true,origin:TENCENT_PDF_ORIGIN};
let calls=[];
const fixture = async (url, options) => {
  calls.push({url, options});
  return {ok:true,status:200,json:async()=>config};
};
assert.equal(await tencentPdfRouteEnabled(fixture),true);
assert.equal(await tencentPdfRouteEnabled(async()=>({
  ok:true,status:200,json:async()=>({...config,enabled:false,manualCanary:true}),
})),false,'automatic Tencent routing must remain closed');
assert.equal(await tencentPdfRouteEnabled(async()=>({
  ok:true,status:200,json:async()=>({...config,enabled:false,manualCanary:true}),
}),1200,{manual:true}),true,'explicit owner canary allowed only when configured');
assert.equal(await tencentPdfRouteEnabled(async()=>({
  ok:true,status:200,json:async()=>({...config,enabled:false,manualCanary:false}),
}),1200,{manual:true}),false,'unconfigured manual canary stays closed');
assert.equal(await tencentPdfRouteEnabled(async()=>({
  ok:true,status:200,json:async()=>({...config,enabled:false,manualCanary:true,origin:'https://evil.example'}),
}),1200,{manual:true}),false,'untrusted origin never allowed');

assert.equal(calls.length,1);
assert.equal(calls[0].url,'/pdf-gateway-routing.json');
assert.equal(calls[0].options.credentials,'same-origin');
assert.equal(calls[0].options.redirect,'error');
assert.equal(calls[0].options.cache,'no-store');
assert.equal(calls[0].options.method,'GET');
assert.equal(Object.keys(calls[0].options).includes('headers'),false,'no session token in config check');
for(const partial of [
  {schemaVersion:1,enabled:false,origin:TENCENT_PDF_ORIGIN},
  {schemaVersion:1,enabled:true,origin:'https://evil.example'},
  {schemaVersion:2,enabled:true,origin:TENCENT_PDF_ORIGIN},
  {schemaVersion:1,enabled:'true',origin:TENCENT_PDF_ORIGIN},
  null, [], {}, 'enabled',
]){
  assert.equal(await tencentPdfRouteEnabled(async()=>({ok:true,status:200,json:async()=>partial})),false);
}
assert.equal(await tencentPdfRouteEnabled(async()=>({ok:false,status:503,json:async()=>config})),false);
assert.equal(await tencentPdfRouteEnabled(async()=>{throw Error('offline')}),false);
// A server that ignores abort still cannot activate the route after the budget.
assert.equal(await tencentPdfRouteEnabled(async(_, options)=>{
  await new Promise((_, reject)=>{
    options.signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true});
  });
},200),false);
assert.equal(nextOwnerPdfFileOrigin(CANONICAL_PDF_ORIGIN),BACKUP_PDF_ORIGIN);
assert.equal(nextOwnerPdfFileOrigin(BACKUP_PDF_ORIGIN),CANONICAL_PDF_ORIGIN);
assert.equal(nextOwnerPdfFileOrigin(CANONICAL_PDF_ORIGIN,true),TENCENT_PDF_ORIGIN);
assert.equal(nextOwnerPdfFileOrigin(BACKUP_PDF_ORIGIN,true),TENCENT_PDF_ORIGIN);
assert.equal(nextOwnerPdfFileOrigin(TENCENT_PDF_ORIGIN,true),CANONICAL_PDF_ORIGIN);
assert.equal(nextOwnerPdfFileOrigin('https://evil.example',true),'');
assert.equal(ownerPdfRouteLabel(TENCENT_PDF_ORIGIN),'tencent');
assert.equal(ownerPdfRouteLabel(CANONICAL_PDF_ORIGIN),'primary');
assert.equal(ownerPdfRouteLabel(BACKUP_PDF_ORIGIN),'backup');
assert.equal(ownerPdfRouteLabel('https://evil.example'),'unknown');

const hash='a'.repeat(64);
const url=TENCENT_PDF_ORIGIN+'/api/user-ui/private-pdf/file?token='+('A'.repeat(64));
const source={url,headerVerified:true,contentHash:hash,byteLength:4321123};
assert.equal(isMatchingOwnerPdfFileSource(source,TENCENT_PDF_ORIGIN,hash,4321123),true);
assert.equal(isMatchingOwnerPdfFileIdentity({...source,headerVerified:false},TENCENT_PDF_ORIGIN,hash,4321123),true,
  'identity alone permits only an independent browser 206 verification, not Range stitching');
assert.equal(isMatchingOwnerPdfFileSource({...source,headerVerified:false},TENCENT_PDF_ORIGIN,hash,4321123),false,
  'unverified edge prefix cannot be promoted to Range stitching');
for(const modified of [
  {...source,headerVerified:false},
  {...source,contentHash:'b'.repeat(64)},
  {...source,byteLength:4321122},
  {...source,url:CANONICAL_PDF_ORIGIN+'/api/user-ui/private-pdf/file?token='+('A'.repeat(64))},
  {...source,url:url+'&download=1'},
  {...source,url:TENCENT_PDF_ORIGIN+'/api/user-ui/private-pdf/open?token='+('A'.repeat(64))},
  {...source,url:url+'&token=duplicate'},
  {...source,url:'https://evil.example/api/user-ui/private-pdf/file?token='+('A'.repeat(64))},
  {...source,url:url+'#fragment'},
]){
  assert.equal(isMatchingOwnerPdfFileSource(modified,TENCENT_PDF_ORIGIN,hash,4321123),false);
}
assert.equal(isMatchingOwnerPdfFileSource(source,TENCENT_PDF_ORIGIN,'',4321123),false);
assert.equal(isMatchingOwnerPdfFileSource(source,TENCENT_PDF_ORIGIN,hash,0),false);
for(const invalid of [
 {...source,headerVerified:false,contentHash:'b'.repeat(64)},
 {...source,headerVerified:false,url:url+'&download=1'},
 {...source,headerVerified:false,url:url+'#fragment'},
 {...source,headerVerified:false,url:'https://evil.example/api/user-ui/private-pdf/file?token='+('A'.repeat(64))},
]){
 assert.equal(isMatchingOwnerPdfFileIdentity(invalid,TENCENT_PDF_ORIGIN,hash,4321123),false);
}
console.log('PDF_TENCENT_FILE_FAILOVER_CONTRACT_PASS: disabled by default, exact identity/ticket host, no entitlement bypass');
