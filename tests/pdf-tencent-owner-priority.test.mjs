import assert from 'node:assert/strict';
import {cachedOwnerHint,liveOwnerTencentPriority,OWNER_ROLE_CHECK_TIMEOUT_MS}
  from '../src/pdf-tencent-owner-priority.mjs';
import {TENCENT_PDF_ORIGIN} from '../src/pdf-tencent-file-failover.mjs';

const owner=['private_pdf_owner','private_pdf_read'];
const valid={authenticated:true,user:{capabilities:owner}};
const ordinary={authenticated:true,user:{capabilities:['private_pdf_read']}};
const seen=[];
function fixture(data,status=200){
 return async (url,opts)=>{
  seen.push({url,opts});
  return {status,ok:status===200,json:async()=>data};
 };
}
assert.equal(await liveOwnerTencentPriority('fixture-owner',fixture(valid)),true);
assert.equal(seen[0].url,TENCENT_PDF_ORIGIN+'/api/user-ui/auth/session');
assert.equal(seen[0].opts.headers.authorization,'Bearer fixture-owner');
assert.equal(seen[0].opts.method,'GET');
assert.equal(seen[0].opts.credentials,'omit');
assert.equal(seen[0].opts.redirect,'error');
assert.equal(seen[0].opts.cache,'no-store');
assert(seen[0].opts.signal instanceof AbortSignal);
for (const [data,status] of [
 [ordinary,200],[{authenticated:false,user:{capabilities:owner}},200],
 [{authenticated:true,user:{capabilities:['private_pdf_owner']}},200],
 [{authenticated:true,user:null},200],[{authenticated:true,user:{capabilities:'owner'}},200],
 [valid,401],[valid,403],[valid,429],[valid,503],
]){
 assert.equal(await liveOwnerTencentPriority('fixture-owner',fixture(data,status)),false);
}
assert.equal(await liveOwnerTencentPriority(''),false);
assert.equal(await liveOwnerTencentPriority('A'.repeat(1025)),false);
assert.equal(await liveOwnerTencentPriority('valid',async()=>{throw new TypeError('network')}),false);
assert.equal(OWNER_ROLE_CHECK_TIMEOUT_MS,4000);
assert.equal(cachedOwnerHint(JSON.stringify({capabilities:owner})),true);
assert.equal(cachedOwnerHint(JSON.stringify({capabilities:['private_pdf_read']})),false);
assert.equal(cachedOwnerHint('{}'),null);
assert.equal(cachedOwnerHint(''),null);
assert.equal(cachedOwnerHint('invalid-json'),null);
console.log('PDF_TENCENT_OWNER_PRIORITY_PASS: server-verified owner+read only, no cached privilege');
