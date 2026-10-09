// Public unauthenticated, read-only acceptance for owner-only grant feature.
// Never send a real email, owner token, cookie, signed PDF URL or private DOI.
// Aborts before database mutations because no bearer session is provided.
import assert from 'node:assert/strict';
const base='https://api.gczhouwld.com';
const route='/api/user-ui/private-pdf/reader-grant';
const origin='https://gallery.gczhouwld.com';
const start=Date.now();
const opts=await fetch(base+route,{method:'OPTIONS',headers:{
  origin,'access-control-request-method':'POST',
  'access-control-request-headers':'authorization,content-type'
},signal:AbortSignal.timeout(9000)});
assert.equal(opts.status,204,'browser preflight needs CORS');
assert.equal(opts.headers.get('access-control-allow-origin'),origin);
const denied=await fetch(base+route,{method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({email:'synthetic-unknown@example.invalid',action:'status'}),
  signal:AbortSignal.timeout(9000)});
assert.equal(denied.status,401,'no account token must never reveal grant status');
const body=await denied.json().catch(()=>null);
assert.equal(body?.error,'not_authenticated');
const page=await fetch(origin+'/private-pdf-owner-setup.html',{signal:AbortSignal.timeout(9000)});
assert.equal(page.status,200);
const html=await page.text();
assert.match(html,/id="reader-grant-panel"/);
assert.match(html,/private-pdf\/reader-grant/);
assert.doesNotMatch(html,/@qq\.com|1592487527/);
const summary={schemaVersion:1,ok:true,
  ownerAuthenticated:false,grantPerformed:false,
  preflight:opts.status,anonymousDenied:denied.status,
  ownerPage:page.status,managementUI:true,
  elapsedMs:Date.now()-start};
console.log('PDF_READER_GRANT_PUBLIC_LIVE_OK '+JSON.stringify(summary));
