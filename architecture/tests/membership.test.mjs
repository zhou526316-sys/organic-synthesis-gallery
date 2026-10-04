import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMembership, membershipDigest, MembershipFence } from '../membership.mjs';
import { FencedCatalogReader } from '../fenced-reader.mjs';
import { buildCatalog } from '../catalog.mjs';
import { filterAcquisitionJobs, coverageMembership, captureReceiptDisposition } from '../queue-membership.mjs';
const now = 1791084600000;
const p = (n, date = '2026-10-01') => ({ doi: `10.1234/p.${n}`, date, title: `Paper ${n}`, authors: [], journal:'JACS' });
const bundle = rows => buildCatalog(rows, { asOfDate:'2026-10-04', source:{ commit:'a'.repeat(40), datasetSha256:'b'.repeat(64) } });
const snap = (b, extra={}) => makeMembership({ catalogId:b.catalog.recordSetHash, serial:1, issuedAt:now, validUntil:now+30000,
  records:b.records, ...extra });
async function setup(rows=[p(1),p(2,'2026-07-01')]) {
  const b=bundle(rows); let time=now, snapshot=await snap(b), error=null, calls=0, intercept;
  const fence=new MembershipFence({ now:()=>time, fetchSnapshot:async()=>{ calls++; if(error)throw error; return snapshot; } });
  await fence.ready();
  const reader=new FencedCatalogReader('https://example.invalid/catalog/',{fence,fetcher:async url=>{
    const pathname=url.pathname.slice('/catalog/'.length); if(intercept)await intercept(pathname);
    return new Response(b.files[pathname] || '{}',{status:b.files[pathname]?200:404});
  }});
  return { b, fence, reader, setTime:t=>time=t, setSnapshot:s=>snapshot=s, setError:e=>error=e,
    calls:()=>calls, intercept:f=>intercept=f };
}
test('all-time snapshot validates and Archive stays present',async()=>{
  const s=await setup(); assert.equal(s.fence.status(p(2).doi),'present');
  const r=await s.reader.get(p(2).doi,'2026-10-04'); assert.equal(r.lifecycle,'archive');
});
test('partial/active/DOM memberships never establish authority',async()=>{
  const s=await setup(), original=await snap(s.b);
  for(const patch of [{scope:'active-work'}, {complete:false}, {count:0}]) {
    s.setSnapshot({...original,...patch}); assert.equal(await s.fence.refresh(),false);
    assert.equal(s.fence.status(p(1).doi),'unknown');
  }
});
test('bad content hash blocks positive reads',async()=>{
  const s=await setup(), next=await snap(s.b,{serial:2}); next.members[p(1).doi]='c'.repeat(64);
  s.setSnapshot(next); assert.equal(await s.fence.refresh(),false);
  assert.equal((await s.reader.get(p(1).doi,'2026-10-04')).status,'verification-unavailable');
});
test('duplicate normalized DOI and member/withdrawal overlap are rejected',async()=>{
  const b=bundle([p(1)]); await assert.rejects(snap(b,{records:[...b.records,...b.records]}),/duplicate/);
  await assert.rejects(snap(b,{withdrawn:[p(1).doi]}),/overlap/);
});
test('older serial cannot restore stale generation',async()=>{
  const s=await setup(); s.setSnapshot(await snap(s.b,{serial:0}));
  assert.equal(await s.fence.refresh(),false); assert.match(s.fence.error,/rollback/);
});
test('same serial cannot contain different bytes',async()=>{
  const s=await setup(); s.setSnapshot(await snap(s.b,{validUntil:now+20000}));
  assert.equal(await s.fence.refresh(),false); assert.match(s.fence.error,/conflict/);
});
test('known withdrawal survives failed refresh and old cache',async()=>{
  const s=await setup(), removed=bundle([p(2,'2026-07-01')]);
  s.setSnapshot(await snap(removed,{serial:2,withdrawn:[p(1).doi]})); assert.equal(await s.fence.refresh(),true);
  s.setError(new Error('offline')); s.setTime(now+60000); await s.fence.refresh();
  assert.equal((await s.reader.get(p(1).doi,'2026-10-04')).status,'withdrawn');
  assert.equal((await s.reader.get(p(2).doi,'2026-10-04')).status,'verification-unavailable');
});
test('higher serial cannot accidentally resurrect withdrawn DOI',async()=>{
  const s=await setup(), removed=bundle([p(2,'2026-07-01')]);
  s.setSnapshot(await snap(removed,{serial:2,withdrawn:[p(1).doi]})); await s.fence.refresh();
  s.setSnapshot(await snap(s.b,{serial:3})); assert.equal(await s.fence.refresh(),false);
  assert.equal(s.fence.status(p(1).doi),'withdrawn');
});
test('withdrawal checkpoint does not preserve positive read authorization',async()=>{
  const s=await setup(), removed=bundle([]);
  s.setSnapshot(await snap(removed,{serial:2,withdrawn:[p(1).doi]})); await s.fence.refresh();
  const restored=new MembershipFence({now:()=>now,initialState:s.fence.checkpoint(),fetchSnapshot:async()=>{throw Error('offline');}});
  assert.equal(restored.status(p(1).doi),'withdrawn'); assert.equal(restored.status(p(2).doi),'unknown');
});
test('new revision blocks old paper payload even under a valid membership',async()=>{
  const s=await setup(), updated=bundle([{...p(1),title:'Corrected title'},p(2,'2026-07-01')]);
  s.setSnapshot(await snap(updated,{serial:2})); await s.fence.refresh();
  assert.equal((await s.reader.get(p(1).doi,'2026-10-04')).status,'record-update-required');
});
test('new DOI is catalog-update-required, not absent in all-time catalog',async()=>{
  const s=await setup(), updated=bundle([p(1),p(2,'2026-07-01'),p(3)]);
  s.setSnapshot(await snap(updated,{serial:2})); await s.fence.refresh();
  assert.equal((await s.reader.get(p(3).doi,'2026-10-04')).status,'catalog-update-required');
});
test('in-flight shard reply is rechecked after withdrawal arrives',async()=>{
  const s=await setup(); let begin, finish;
  const entered=new Promise(r=>begin=r), wait=new Promise(r=>finish=r);
  s.intercept(async name=>{if(name.startsWith('shards/')){begin();await wait;}});
  const reading=s.reader.get(p(1).doi,'2026-10-04'); await entered;
  const removed=bundle([p(2,'2026-07-01')]); s.setSnapshot(await snap(removed,{serial:2,withdrawn:[p(1).doi]})); await s.fence.refresh();
  finish(); assert.equal((await reading).status,'withdrawn');
});
test('expired snapshot blocks a new decision until fresh source returns',async()=>{
  const s=await setup(); s.setTime(now+30000);
  assert.equal(s.fence.status(p(1).doi),'unknown');
  assert.equal(await s.fence.ready(),false);
});
test('future-issued and excessive TTL snapshots fail closed',async()=>{
  const s=await setup();
  s.setSnapshot(await snap(s.b,{serial:2,issuedAt:now+1})); assert.equal(await s.fence.refresh(),false);
  s.setSnapshot(await snap(s.b,{serial:2,validUntil:now+3600000})); assert.equal(await s.fence.refresh(),false);
});
test('duplicate concurrent readiness checks use one transport request',async()=>{
  const b=bundle([p(1)]), snapshot=await snap(b); let calls=0;
  const fence=new MembershipFence({now:()=>now,fetchSnapshot:async()=>{calls++;return snapshot;}});
  await Promise.all([fence.ready(),fence.ready(),fence.ready()]); assert.equal(calls,1);
});
test('membership notifies subscribers so open views can drop revoked cards',async()=>{
  const s=await setup(); let events=0; const stop=s.fence.onChange(()=>events++);
  s.setSnapshot(await snap(s.b,{serial:2})); await s.fence.refresh(); assert.equal(events,1); stop();
});
test('global search never returns withdrawn DOI from old segment',async()=>{
  const s=await setup(), updated=bundle([p(2,'2026-07-01')]);
  s.setSnapshot(await snap(updated,{serial:2,withdrawn:[p(1).doi]})); await s.fence.refresh();
  const r=await s.reader.search('Paper',{asOfDate:'2026-10-04'});
  assert.deepEqual(r.results.map(x=>x.doi),[p(2).doi]); assert.equal(r.complete,false); assert.equal(r.matched,null);
});
test('Hot partial generation is marked incomplete rather than globally current',async()=>{
  const s=await setup(), updated=bundle([p(1),p(2,'2026-07-01'),p(3)]);
  s.setSnapshot(await snap(updated,{serial:2})); await s.fence.refresh();
  const r=await s.reader.hot('2026-10-04'); assert.equal(r.complete,false); assert.equal(r.records.length,1);
});
test('same generation Hot and global search remain complete',async()=>{
  const s=await setup(); assert.equal((await s.reader.hot('2026-10-04')).complete,true);
  assert.equal((await s.reader.search('Paper',{asOfDate:'2026-10-04'})).matched,2);
});
test('queue adapter preserves full registry and layer progress, filters only new selection',async()=>{
  const s=await setup(), queue={articles:[p(1),p(2,'2026-07-01')],webpageDoiCount:2}, original=structuredClone(queue);
  const jobs=[{doi:p(2).doi,captureFigures:true},{doi:p(1).doi,captureToc:false,captureEvidence:true,checkpoint:{figureCount:4}}];
  const plan=filterAcquisitionJobs({queue,jobs,records:s.b.records,fence:s.fence,asOfDate:'2026-10-04'});
  assert.deepEqual(queue,original); assert.deepEqual(plan.executable,[jobs[1]]); assert.deepEqual(plan.removed,[]);
  assert.equal(plan.allTimeCount,2); assert.equal(plan.held[0].preserveProgress,true);
});
test('truncating queue articles to Hot is rejected rather than treated as withdrawal',async()=>{
  const s=await setup(); assert.throws(()=>filterAcquisitionJobs({queue:{articles:[p(1)],webpageDoiCount:1},jobs:[],records:s.b.records,fence:s.fence,asOfDate:'2026-10-04'}),/generation_mismatch/);
});
test('adapter preserves input scheduling order among eligible jobs',async()=>{
  const s=await setup([p(1),p(2),p(3)]), jobs=[{doi:p(3).doi},{doi:p(1).doi},{doi:p(2).doi}];
  const r=filterAcquisitionJobs({queue:{articles:[p(1),p(2),p(3)],webpageDoiCount:3},jobs,records:s.b.records,fence:s.fence,asOfDate:'2026-10-04'});
  assert.deepEqual(r.executable,jobs);
});
test('archived coverage row retains partial figures and is not removed',async()=>{
  const s=await setup(), row={doi:p(2).doi,status:'partial',figures:{stored:3},attempts:7};
  const r=coverageMembership(row,s.fence,new Set([p(1).doi]));
  assert.equal(r.membership,'present');assert.equal(r.eligible,false);assert.deepEqual(r.figures,row.figures);assert.equal(r.attempts,7);
});
test('absent or unknown member never erases previous progress',async()=>{
  const s=await setup(), r=coverageMembership({doi:p(3).doi,stored:4},s.fence,new Set());
  assert.equal(r.membership,'absent');assert.equal(r.disposition,'hold-preserve-progress');assert.equal(r.stored,4);
});
test('explicit removal quarantines coverage without deleting it',async()=>{
  const s=await setup(); s.setSnapshot(await snap(bundle([]),{serial:2,withdrawn:[p(1).doi]}));await s.fence.refresh();
  const r=coverageMembership({doi:p(1).doi,stored:4},s.fence,new Set());assert.equal(r.disposition,'quarantine-no-delete');
});
test('in-flight valid receipt survives retirement, stale job does not',async()=>{
  const s=await setup();
  assert.equal(captureReceiptDisposition({doi:p(2).doi,jobId:'a',currentJobId:'a',fence:s.fence}),'retain-validated-receipt');
  assert.equal(captureReceiptDisposition({doi:p(2).doi,jobId:'a',currentJobId:'b',fence:s.fence}),'reject-stale-job');
});
