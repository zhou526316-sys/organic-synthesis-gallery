import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';

const root=process.argv[2]||'public/architecture-v1';
const releaseText=fs.readFileSync(path.join(root,'release.json'),'utf8');
const release=JSON.parse(releaseText);
assert.equal(release.schema,'gallery-architecture-public-v1');
assert.ok(release.acquisitionBasis&&release.membership);
const sha=text=>createHash('sha256').update(text).digest('hex');
const delivery={schemaVersion:2,architectureCatalogId:release.catalogId,files:{'architecture-v1/release.json':sha(releaseText)}};
const queueBasis=JSON.parse(fs.readFileSync(path.join(root,release.acquisitionBasis.path),'utf8'));
const queue={webpageDoiCount:queueBasis.count,mediaGeneration:1790082000000,articles:queueBasis.records.map(r=>({doi:r.doi,date:r.firstOnlineDate,addedDate:r.addedDate}))};

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const pure=source.match(/\/\/ BEGIN OSG_ACTIVE_WORK_MEMBERSHIP_V1([\s\S]*?)\/\/ END OSG_ACTIVE_WORK_MEMBERSHIP_V1/);
assert.ok(pure);
const start=source.indexOf('  async function activeWorkSha256(');
const end=source.indexOf('\n  function productionMediaSnapshot(',start);
assert.ok(start>0&&end>start);
const transport=source.slice(start,end);
let corruptPath='',missingDate=false;
const ctx=vm.createContext({
  console,URL,Map,Set,TextEncoder,crypto:webcrypto,
  ACQUISITION_POLICY_REVISION:'20261004-three-month-active-work-v1',
  ARCHITECTURE_RELEASE_URL:'https://gallery.gczhouwld.com/architecture-v1/release.json',
  DELIVERY_MANIFEST_URL:'https://gallery.gczhouwld.com/release-delivery.json',
  headerValue:(headers,name)=>{
    const escaped=name.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&');
    const m=String(headers||'').match(new RegExp('(?:^|\\r?\\n)'+escaped+'\\s*:\\s*([^\\r\\n]+)','i'));
    return m?m[1].trim():'';
  },
  normalizeDoi:value=>{
    let s=String(value||'').trim().toLowerCase();
    try{s=decodeURIComponent(s)}catch{}
    s=s.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
    return /^10\.\d{4,9}\/\S+$/i.test(s)?s:'';
  },
  pairedJobs:q=>{
    assert.ok(Array.isArray(q.articles)&&q.articles.length===Number(q.webpageDoiCount));
    assert.equal(new Set(q.articles.map(r=>r.doi)).size,q.articles.length);
    return q.articles;
  },
  gmRequest:async options=>{
    const u=new URL(options.url),pathname=u.pathname;
    let body;
    if(pathname==='/release-delivery.json')body=JSON.stringify(delivery);
    else if(pathname==='/architecture-v1/release.json')body=releaseText;
    else if(pathname.startsWith('/architecture-v1/')){
      const rel=pathname.slice('/architecture-v1/'.length);
      body=fs.readFileSync(path.join(root,rel),'utf8');
      if(corruptPath===rel)body=body.slice(0,-1)+' ';
    } else throw Error('unexpected_url:'+pathname);
    return {status:200,responseText:body,responseHeaders:missingDate?'':'Date: Sun, 04 Oct 2026 06:00:00 GMT\r\n'};
  }
});
vm.runInContext(pure[1]+transport+';globalThis.loadActiveWorkMembership=loadActiveWorkMembership;',ctx);

const expectedActive=queueBasis.records.filter(r=>{
  const code='activeWorkEligibility('+JSON.stringify(r)+',"2026-10-04")';
  const reason=vm.runInContext(code,ctx);
  return reason==='hot'||reason==='archive_recent_addition';
}).length;
const actual=await ctx.loadActiveWorkMembership(structuredClone(queue));
assert.equal(actual.allTimeCount,queueBasis.count);
assert.equal(actual.activeCount,expectedActive);
assert.equal(actual.asOfDate,'2026-10-04');
assert.equal(actual.cutoff,'2026-07-04');
assert.equal(actual.catalogId,release.catalogId);

corruptPath=release.acquisitionBasis.path;
await assert.rejects(()=>ctx.loadActiveWorkMembership(structuredClone(queue)),/hash_mismatch/);
corruptPath='';missingDate=true;
await assert.rejects(()=>ctx.loadActiveWorkMembership(structuredClone(queue)),/server_date_missing/);

console.log('ACTIVE_WORK_TRANSPORT_PASS '+JSON.stringify({
  records:queueBasis.count,active:actual.activeCount,archiveIdle:actual.archiveIdleCount,
  cutoff:actual.cutoff,catalogId:actual.catalogId,hashTamperRejected:true,missingServerDateRejected:true
}));
