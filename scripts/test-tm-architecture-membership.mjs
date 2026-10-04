import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
// Installer revisions advance independently; this gate binds metadata consistency, not a stale release number.
const begin=source.indexOf('// BEGIN ARCHITECTURE MEMBERSHIP CORE v1');
const end=source.indexOf('// END ARCHITECTURE MEMBERSHIP CORE v1');
assert.ok(begin>0&&end>begin,'membership core markers missing');
const core=source.slice(begin,end);
const context=vm.createContext({
  crypto:webcrypto,TextEncoder,TextDecoder,URL,Set,Map,JSON,Number,String,Array,Object,Boolean,Error,
  ARCHITECTURE_MEMBERSHIP_REVISION:'fixture-v1',
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
  const release={schema:'gallery-architecture-public-v1',productionActivation:false,publicationSlot:membership.publicationSlot,
    sourceCommit,markerBlobSha:membership.markerBlobSha,datasetSha256:'3'.repeat(64),asOfDate:'2026-10-04',recordCount:2,catalogId,doiSetHash,
    catalogCurrent:ref('current.json',currentText),membership:ref('membership.fixture.json',membershipText),titlePresentation:{path:'title.json',sha256:'4'.repeat(64),bytes:1},objects:[]};
  const releaseText=stable(release)+'\n';
  const delivery={schemaVersion:2,sourceCommit,publicationSlot:membership.publicationSlot,productionCards:2,datasetSha256:release.datasetSha256,
    architectureCatalogId:catalogId,files:{'architecture-v1/release.json':hash(releaseText)},architectureObjects:{}};
  const queue={webpageDoiCount:2,articles:[{doi:a},{doi:b}]};
  return {a,b,queue,delivery,releaseText,membershipText,currentText,lifecycleText};
}

test('actual userscript keeps capture protocol while advancing install metadata',()=>{
  const metadataVersion=source.match(/^\/\/ @version\s+([^\s]+)$/m)?.[1]||'';
  const installRevision=source.match(/var INSTALL_REVISION = '([^']+)';/)?.[1]||'';
  assert.match(metadataVersion,/^6\.2\.\d+$/);
  assert.equal(installRevision,metadataVersion);
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.39';"));
});
test('actual userscript observes membership in manual and automatic paths without filtering',()=>{
  assert.ok(source.includes('s.architectureMembership=architectureMembership;'));
  assert.ok(source.includes('architectureMembership:architectureMembership'));
  assert.ok(!source.includes('filterArchitectureJobs('));
});
test('verified full registry produces Hot and Archive shadow sets',async()=>{
  const f=fixture(),r=await verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText);
  assert.equal(r.ok,true);assert.equal(r.memberCount,2);assert.equal(r.hotCount,1);assert.equal(r.archiveCount,1);
  assert.deepEqual([...r.hotDois],[f.a]);assert.deepEqual([...r.archiveDois],[f.b]);
});
test('Hot-only/truncated queue cannot masquerade as all-time membership',async()=>{
  const f=fixture();f.queue={webpageDoiCount:1,articles:[{doi:f.a}]};
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText),/membership_queue_mismatch/);
});
test('release must be bound to deployed v2 delivery hash',async()=>{
  const f=fixture();f.delivery.files['architecture-v1/release.json']='0'.repeat(64);
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText),/release_delivery_hash_mismatch/);
});
test('membership object corruption fails closed',async()=>{
  const f=fixture();const broken=f.membershipText.replace('"count":2','"count":3');
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,broken,f.currentText,f.lifecycleText),/membership_hash_mismatch/);
});
test('lifecycle partitions must cover the exact all-time membership',async()=>{
  const f=fixture();const life=JSON.parse(f.lifecycleText);life.partitions.archive=[];
  const lifeText=stable(life)+'\n';
  const current=JSON.parse(f.currentText);current.lifecycle=ref('lifecycle/snapshot.fixture.json',lifeText);
  const currentText=stable(current)+'\n';
  const release=JSON.parse(f.releaseText);release.catalogCurrent=ref('current.json',currentText);
  const releaseText=stable(release)+'\n';f.delivery.files['architecture-v1/release.json']=hash(releaseText);
  await assert.rejects(verify(f.queue,f.delivery,releaseText,f.membershipText,currentText,lifeText),/lifecycle_partition_mismatch/);
});
test('legacy v1 delivery cannot authorize new membership observer',async()=>{
  const f=fixture();f.delivery.schemaVersion=1;
  await assert.rejects(verify(f.queue,f.delivery,f.releaseText,f.membershipText,f.currentText,f.lifecycleText),/delivery_v2_required/);
});

test('observer result and failure reason are attached to existing diagnostic trace',()=>{
  assert.ok(source.includes("stage:'architecture_membership'"));
  assert.ok(source.includes("event:'verified_snapshot'"));
  assert.ok(source.includes("observerState.ok===true?'observer_ok':'verification_failed'"));
  assert.ok(source.includes("architecture-membership-observer-v1"));
  const metadataVersion=source.match(/^\/\/ @version\s+([^\s]+)$/m)?.[1]||'';
  assert.ok(source.includes(`var INSTALL_REVISION = '${metadataVersion}';`));
  assert.ok(source.includes("installRevision:typeof INSTALL_REVISION==='string'?INSTALL_REVISION:''"));
  assert.ok(source.includes("trace:[context].concat(events).concat(architectureEvent?[architectureEvent]:[]).concat(architectureObserverEvent?[architectureObserverEvent]:[])"));
});
test('self-contained Bridge gets a diagnostic install-version bump while capture protocol stays fixed',()=>{
  const loader=fs.readFileSync('cloudflare/scripts/build-bridge-loader.mjs','utf8');
  const loaderVersion=loader.match(/const loaderVersion = '([^']+)';/)?.[1]||'';
  assert.match(loaderVersion,/^2\.2\.\d+$/);
  assert.ok(Number(loaderVersion.split('.')[2]) >= 41);
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.39';"));
});
