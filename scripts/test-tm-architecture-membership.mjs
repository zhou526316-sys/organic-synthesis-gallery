import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const begin=source.indexOf('// BEGIN ARCHITECTURE MEMBERSHIP CORE v1');
const end=source.indexOf('// END ARCHITECTURE MEMBERSHIP CORE v1');
assert.ok(begin>0&&end>begin,'membership core markers missing');
const core=source.slice(begin,end);
const context=vm.createContext({
  crypto:webcrypto,TextEncoder,TextDecoder,URL,Set,Map,JSON,Number,String,Array,Object,Boolean,Error,Date,
  ARCHITECTURE_MEMBERSHIP_REVISION:'fixture-v2',
  normalizeDoi(value){
    let s=String(value||'').trim().toLowerCase();
    try{s=decodeURIComponent(s);}catch{}
    s=s.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
    return /^10\.\d{4,9}\/\S+$/i.test(s)?s:'';
  }
});
vm.runInContext(core,context);
const verify=vm.runInContext('verifyArchitectureMembershipPayload',context);
const cutoff=vm.runInContext('architectureCutoff',context);
const reason=vm.runInContext('architectureWorkReason',context);
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
const hash=text=>createHash('sha256').update(text).digest('hex');
const ref=(path,text)=>({path,sha256:hash(text),bytes:Buffer.byteLength(text)});

function fixture(){
  const a='10.1234/a',b='10.1234/b',c='10.1234/c',catalogId='a'.repeat(64),doiSetHash='b'.repeat(64),sourceCommit='c'.repeat(40);
  const lifecycle={schema:'gallery-shadow-catalog-v1',catalog:'releases/catalog.fixture.json',asOfDate:'2026-10-04',cutoff:'2026-07-04',
    partitions:{hot:[a],archive:[b,c],date_unknown:[],date_invalid:[],future:[]}};
  const lifecycleText=stable(lifecycle)+'\n';
  const current={schema:'gallery-shadow-catalog-v1',mode:'shadow',productionActivation:false,
    catalog:{path:lifecycle.catalog,sha256:'d'.repeat(64),bytes:1},lifecycle:ref('lifecycle/snapshot.fixture.json',lifecycleText),
    work:{path:'work/preview.fixture.json',sha256:'e'.repeat(64),bytes:1}};
  const currentText=stable(current)+'\n';
  const membership={schema:'gallery-published-membership-v1',scope:'all-time',complete:true,publicationSlot:'2026-10-04T08:00:00+08:00',
    sourceCommit,markerBlobSha:'f'.repeat(40),catalogId,doiSetHash,serial:Date.parse('2026-10-04T00:00:00Z'),count:3,
    members:{[a]:'1'.repeat(64),[b]:'2'.repeat(64),[c]:'3'.repeat(64)},withdrawn:[]};
  const membershipText=stable(membership)+'\n';
  const acquisition={schema:'gallery-acquisition-basis-v1',catalogId,doiSetHash,publicationSlot:membership.publicationSlot,count:3,records:[
    {doi:a,revision:membership.members[a],firstOnlineDate:'2026-07-04',datePrecision:'day',addedDate:'2026-07-04'},
    {doi:b,revision:membership.members[b],firstOnlineDate:'2026-07-03',datePrecision:'day',addedDate:'2026-07-03'},
    {doi:c,revision:membership.members[c],firstOnlineDate:'2026-07-01',datePrecision:'day',addedDate:'2026-10-04'}
  ]};
  const acquisitionText=stable(acquisition)+'\n';
  const release={schema:'gallery-architecture-public-v1',productionActivation:false,publicationSlot:membership.publicationSlot,
    sourceCommit,markerBlobSha:membership.markerBlobSha,datasetSha256:'3'.repeat(64),asOfDate:'2026-10-04',recordCount:3,catalogId,doiSetHash,
    catalogCurrent:ref('current.json',currentText),membership:ref('membership.fixture.json',membershipText),
    acquisitionBasis:ref('acquisition-basis.fixture.json',acquisitionText),titlePresentation:{path:'title.json',sha256:'4'.repeat(64),bytes:1},objects:[]};
  const releaseText=stable(release)+'\n';
  const delivery={schemaVersion:2,sourceCommit,publicationSlot:membership.publicationSlot,productionCards:3,datasetSha256:release.datasetSha256,
    architectureCatalogId:catalogId,files:{'architecture-v1/release.json':hash(releaseText)},architectureObjects:{}};
  const queue={webpageDoiCount:3,articles:[{doi:a},{doi:b},{doi:c}]};
  return {a,b,c,queue,delivery,releaseText,membershipText,currentText,lifecycleText,acquisitionText};
}

test('installer advances while capture protocol remains compatible',()=>{
  assert.match(source,/^\/\/ @version\\s+6\\.2\\.23$/m);
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.39';"));
  assert.ok(source.includes("ARCHITECTURE_MEMBERSHIP_REVISION = '20261004-membership-active-v2'"));
});
test('C2b filters new work but never truncates canonical queue',()=>{
  assert.ok(source.includes('activeDois.has'));
  assert.ok(source.includes("row.state='retired'"));
  assert.ok(!source.includes('queue.articles=queue.articles.filter'));
});
test('verified registry yields Hot plus recent historical addition',async()=>{
  const f=fixture(),r=await verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,'2026-10-04');
  assert.equal(r.ok,true);assert.equal(r.memberCount,3);assert.equal(r.hotCount,1);assert.equal(r.archiveCount,2);
  assert.equal(r.activeCount,2);assert.deepEqual([...r.activeDois].sort(),[f.a,f.c].sort());assert.deepEqual(r.recentAdditionDois,[f.c]);
  assert.equal(r.cutoff,'2026-07-04');
});
test('crossing Beijing day retires prior cutoff without literature release',async()=>{
  const f=fixture(),r=await verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,'2026-10-05');
  assert.equal(r.cutoff,'2026-07-05');assert.equal(r.hotCount,0);assert.deepEqual(r.activeDois,[f.c]);
});
for(const [date,expected] of [['2026-10-31','2026-07-31'],['2027-05-31','2027-02-28'],['2028-05-31','2028-02-29'],['2026-01-31','2025-10-31']]){
  test('calendar-month cutoff '+date,()=>assert.equal(cutoff(date),expected));
}
test('late historical addition has seven Beijing dates of acquisition eligibility',()=>{
  const row={firstOnlineDate:'2026-07-01',datePrecision:'day',addedDate:'2026-10-04'};
  assert.equal(reason(row,'2026-10-10'),'archive_recent_addition');
  assert.equal(reason(row,'2026-10-11'),'archive_idle');
});
test('unknown invalid and future dates never silently enter work',()=>{
  assert.equal(reason({firstOnlineDate:'2026-07',datePrecision:'unknown'},'2026-10-04'),'date_unknown');
  assert.equal(reason({firstOnlineDate:'2026-02-31',datePrecision:'day'},'2026-10-04'),'date_invalid');
  assert.equal(reason({firstOnlineDate:'2026-10-05',datePrecision:'day'},'2026-10-04'),'future');
});
test('Hot-only queue cannot masquerade as all-time membership',async()=>{
  const f=fixture();f.queue={webpageDoiCount:1,articles:[{doi:f.a}]};
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,'2026-10-04'),/membership_queue_mismatch/);
});
test('release hash and acquisition bytes are fail-closed',async()=>{
  const f=fixture();f.delivery.files['architecture-v1/release.json']='0'.repeat(64);
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,'2026-10-04'),/release_delivery_hash_mismatch/);
  const g=fixture(),broken=g.acquisitionText.replace('"count":3','"count":4');
  await assert.rejects(verify(g.queue,g.delivery,g.releaseText,g.membershipText,g.currentText,g.lifecycleText,broken,'2026-10-04'),/acquisition_hash_mismatch/);
});
test('acquisition revision must match membership',async()=>{
  const f=fixture(),a=JSON.parse(f.acquisitionText);a.records[0].revision='9'.repeat(64);
  const acq=stable(a)+'\n',rel=JSON.parse(f.releaseText);rel.acquisitionBasis=ref('acquisition-basis.fixture.json',acq);
  const relText=stable(rel)+'\n';f.delivery.files['architecture-v1/release.json']=hash(relText);
  await assert.rejects(verify(f.queue,f.delivery,relText,f.membershipText,f.currentText,f.lifecycleText,acq,'2026-10-04'),/acquisition_member_mismatch/);
});
test('release-time lifecycle must agree with acquisition facts',async()=>{
  const f=fixture(),life=JSON.parse(f.lifecycleText);life.partitions.hot=[];life.partitions.archive=[f.a,f.b,f.c];
  const lifeText=stable(life)+'\n',cur=JSON.parse(f.currentText);cur.lifecycle=ref('lifecycle/snapshot.fixture.json',lifeText);
  const curText=stable(cur)+'\n',rel=JSON.parse(f.releaseText);rel.catalogCurrent=ref('current.json',curText);
  const relText=stable(rel)+'\n';f.delivery.files['architecture-v1/release.json']=hash(relText);
  await assert.rejects(verify(f.queue,f.delivery,relText,f.membershipText,curText,lifeText,f.acquisitionText,'2026-10-04'),/acquisition_lifecycle_mismatch/);
});
test('legacy v1 delivery cannot authorize active work',async()=>{
  const f=fixture();f.delivery.schemaVersion=1;
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,'2026-10-04'),/delivery_v2_required/);
});
test('C2A1 diagnostic trace remains attached to existing report schema',()=>{
  assert.ok(source.includes("stage:'architecture_membership'"));
  assert.ok(source.includes("event:'verified_snapshot'"));
  assert.ok(source.includes("architectureState.cutoff"));
  assert.ok(source.includes("trace:[context].concat(events).concat(architectureEvent?[architectureEvent]:[])"));
});
test('self-contained Bridge stays 2.2.41 while capture protocol stays fixed',()=>{
  const loader=fs.readFileSync('cloudflare/scripts/build-bridge-loader.mjs','utf8');
  assert.ok(loader.includes("const loaderVersion = '2.2.41';"));
  assert.ok(source.includes("var VERSION = '6.2.20';"));
});
