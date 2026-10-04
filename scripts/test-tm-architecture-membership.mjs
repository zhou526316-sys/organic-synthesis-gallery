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
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
const hash=text=>createHash('sha256').update(text).digest('hex');
const ref=(path,text)=>({path,sha256:hash(text),bytes:Buffer.byteLength(text)});
const trusted=Date.parse('2026-10-04T06:00:00Z');

function fixture(){
  const a='10.1234/a',b='10.1234/b',catalogId='a'.repeat(64),doiSetHash='b'.repeat(64),sourceCommit='c'.repeat(40);
  const lifecycle={schema:'gallery-shadow-catalog-v1',catalog:'releases/catalog.fixture.json',asOfDate:'2026-10-04',cutoff:'2026-07-04',
    partitions:{hot:[a],archive:[b],date_unknown:[],date_invalid:[],future:[]}};
  const lifecycleText=stable(lifecycle)+'\n';
  const current={schema:'gallery-shadow-catalog-v1',mode:'shadow',productionActivation:false,
    catalog:{path:lifecycle.catalog,sha256:'d'.repeat(64),bytes:1},lifecycle:ref('lifecycle/snapshot.fixture.json',lifecycleText),
    work:{path:'work/preview.fixture.json',sha256:'e'.repeat(64),bytes:1}};
  const currentText=stable(current)+'\n';
  const membership={schema:'gallery-published-membership-v1',scope:'all-time',complete:true,publicationSlot:'2026-10-04T08:00:00+08:00',
    sourceCommit,markerBlobSha:'f'.repeat(40),catalogId,doiSetHash,serial:Date.parse('2026-10-04T00:00:00Z'),count:2,
    members:{[a]:'1'.repeat(64),[b]:'2'.repeat(64)},withdrawn:[]};
  const membershipText=stable(membership)+'\n';
  const acquisition={schema:'gallery-acquisition-basis-v1',catalogId,doiSetHash,publicationSlot:membership.publicationSlot,count:2,
    records:[
      {doi:a,revision:membership.members[a],firstOnlineDate:'2026-07-04',datePrecision:'day',addedDate:'2026-07-04'},
      {doi:b,revision:membership.members[b],firstOnlineDate:'2026-07-01',datePrecision:'day',addedDate:'2026-10-04'}
    ]};
  const acquisitionText=stable(acquisition)+'\n';
  const release={schema:'gallery-architecture-public-v1',productionActivation:false,publicationSlot:membership.publicationSlot,
    sourceCommit,markerBlobSha:membership.markerBlobSha,datasetSha256:'3'.repeat(64),asOfDate:'2026-10-04',recordCount:2,catalogId,doiSetHash,
    catalogCurrent:ref('current.json',currentText),membership:ref('membership.fixture.json',membershipText),
    acquisitionBasis:ref('acquisition.fixture.json',acquisitionText),titlePresentation:{path:'title.json',sha256:'4'.repeat(64),bytes:1},objects:[]};
  const releaseText=stable(release)+'\n';
  const delivery={schemaVersion:2,sourceCommit,publicationSlot:membership.publicationSlot,productionCards:2,datasetSha256:release.datasetSha256,
    architectureCatalogId:catalogId,files:{'architecture-v1/release.json':hash(releaseText)},architectureObjects:{}};
  const queue={webpageDoiCount:2,articles:[{doi:a},{doi:b}]};
  return {a,b,queue,delivery,releaseText,membershipText,currentText,lifecycleText,acquisitionText};
}
const args=f=>[f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,trusted];

test('install metadata advances while capture protocol/controller stay compatible',()=>{
  assert.match(source,/^\/\/ @version\s+6\.2\.22$/m);
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.39';"));
});
test('manual and automatic controllers fail closed then filter only new acquisition work',()=>{
  assert.ok(source.includes("throw new Error('architecture_active_work_unverified:'"));
  assert.ok(source.includes("run.activeDois=architectureActiveSet(architectureMembership)"));
  assert.ok(source.includes("filter(function(job){return activeDois.has(normalizeDoi(job.doi));})"));
  assert.ok(source.includes("r.state='retired'"));
  assert.ok(!source.includes('queue.articles=queue.articles.filter'));
});
test('verified full registry returns Hot plus recent historical addition as active',async()=>{
  const f=fixture(),r=await verify(...args(f));
  assert.equal(r.ok,true);assert.equal(r.memberCount,2);assert.equal(r.hotCount,1);assert.equal(r.archiveCount,1);
  assert.deepEqual([...r.hotDois],[f.a]);assert.deepEqual([...r.archiveDois],[f.b]);
  assert.equal(r.liveAsOfDate,'2026-10-04');assert.equal(r.liveCutoff,'2026-07-04');
  assert.deepEqual([...r.activeDois].sort(),[f.a,f.b].sort());assert.deepEqual(r.recentAdditionDois,[f.b]);
});
test('ordinary Archive is retained in membership but excluded from active work',async()=>{
  const f=fixture(),acq=JSON.parse(f.acquisitionText);acq.records[1].addedDate='2026-07-01';
  f.acquisitionText=stable(acq)+'\n';
  const release=JSON.parse(f.releaseText);release.acquisitionBasis=ref('acquisition.fixture.json',f.acquisitionText);
  f.releaseText=stable(release)+'\n';f.delivery.files['architecture-v1/release.json']=hash(f.releaseText);
  const r=await verify(...args(f));
  assert.deepEqual(r.activeDois,[f.a]);assert.deepEqual(r.archiveIdleDois,[f.b]);assert.equal(r.memberCount,2);
});
test('seven Beijing dates are inclusive for late historical additions',async()=>{
  const f=fixture(),acq=JSON.parse(f.acquisitionText);acq.records[1].addedDate='2026-09-28';
  f.acquisitionText=stable(acq)+'\n';
  const release=JSON.parse(f.releaseText);release.acquisitionBasis=ref('acquisition.fixture.json',f.acquisitionText);
  f.releaseText=stable(release)+'\n';f.delivery.files['architecture-v1/release.json']=hash(f.releaseText);
  const r=await verify(...args(f));assert.ok(r.activeDois.includes(f.b));
  const later=Date.parse('2026-10-05T06:00:00Z');
  const r2=await verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText,f.acquisitionText,later);
  assert.ok(!r2.activeDois.includes(f.b));
});
test('Hot-only/truncated queue cannot masquerade as all-time membership',async()=>{
  const f=fixture();f.queue={webpageDoiCount:1,articles:[{doi:f.a}]};
  await assert.rejects(verify(...args(f)),/membership_queue_mismatch/);
});
test('release must be bound to deployed v2 delivery hash',async()=>{
  const f=fixture();f.delivery.files['architecture-v1/release.json']='0'.repeat(64);
  await assert.rejects(verify(...args(f)),/release_delivery_hash_mismatch/);
});
test('membership object corruption fails closed',async()=>{
  const f=fixture();const broken=f.membershipText.replace('"count":2','"count":3');
  const a=args(f);a[3]=broken;await assert.rejects(verify(...a),/membership_hash_mismatch/);
});
test('acquisition basis corruption fails closed',async()=>{
  const f=fixture();const broken=f.acquisitionText.replace('"addedDate":"2026-10-04"','"addedDate":"2026-10-03"');
  const a=args(f);a[6]=broken;await assert.rejects(verify(...a),/acquisition_hash_mismatch/);
});
test('acquisition revision must match current membership revision',async()=>{
  const f=fixture(),acq=JSON.parse(f.acquisitionText);acq.records[0].revision='9'.repeat(64);
  f.acquisitionText=stable(acq)+'\n';
  const release=JSON.parse(f.releaseText);release.acquisitionBasis=ref('acquisition.fixture.json',f.acquisitionText);
  f.releaseText=stable(release)+'\n';f.delivery.files['architecture-v1/release.json']=hash(f.releaseText);
  await assert.rejects(verify(...args(f)),/acquisition_member_mismatch/);
});
test('lifecycle partitions must cover the exact all-time membership',async()=>{
  const f=fixture();const life=JSON.parse(f.lifecycleText);life.partitions.archive=[];
  f.lifecycleText=stable(life)+'\n';
  const current=JSON.parse(f.currentText);current.lifecycle=ref('lifecycle/snapshot.fixture.json',f.lifecycleText);
  f.currentText=stable(current)+'\n';
  const release=JSON.parse(f.releaseText);release.catalogCurrent=ref('current.json',f.currentText);
  f.releaseText=stable(release)+'\n';f.delivery.files['architecture-v1/release.json']=hash(f.releaseText);
  await assert.rejects(verify(...args(f)),/lifecycle_partition_mismatch/);
});
test('stale lifecycle snapshot may be observed but live active work uses trusted current date',async()=>{
  const f=fixture();const life=JSON.parse(f.lifecycleText);life.asOfDate='2026-10-03';life.cutoff='2026-07-03';
  f.lifecycleText=stable(life)+'\n';
  const current=JSON.parse(f.currentText);current.lifecycle=ref('lifecycle/snapshot.fixture.json',f.lifecycleText);
  f.currentText=stable(current)+'\n';
  const release=JSON.parse(f.releaseText);release.catalogCurrent=ref('current.json',f.currentText);
  f.releaseText=stable(release)+'\n';f.delivery.files['architecture-v1/release.json']=hash(f.releaseText);
  const r=await verify(...args(f));assert.equal(r.liveCutoff,'2026-07-04');
});
test('missing trusted server time cannot authorize dispatch',async()=>{
  const f=fixture();const a=args(f);a[7]=NaN;await assert.rejects(verify(...a),/trusted_time/);
});
test('legacy v1 delivery cannot authorize active work',async()=>{
  const f=fixture();f.delivery.schemaVersion=1;
  await assert.rejects(verify(...args(f)),/delivery_v2_required/);
});

console.log(JSON.stringify({c2b:true,productionWrites:0,tests:'membership-active-work'}));
