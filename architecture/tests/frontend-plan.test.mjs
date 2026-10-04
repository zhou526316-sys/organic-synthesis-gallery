import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLandingPlan, resolveDoisPlan, globalSearchPlan } from '../frontend-plan.mjs';

const rec=(doi,lifecycle='hot')=>({doi,revision:'a'.repeat(64),paper:{doi,title:doi},lifecycle});
function reader({hot=[],get={},search}={}){
  return {
    async hot(){return {status:'ready',complete:true,records:hot};},
    async get(doi){return get[doi]||{status:'absent',doi};},
    async search(q,opts){return search?search(q,opts):{results:[],matched:0,complete:true,failures:[],scanned:1,total:1};},
  };
}

test('landing returns Hot only when no deep link is present',async()=>{
  const r=reader({hot:[rec('10.1234/hot')]});
  const x=await loadLandingPlan(r,{asOfDate:'2026-10-04'});
  assert.deepEqual(x.records.map(v=>v.doi),['10.1234/hot']);
});
test('Archive deep link is injected first without changing Hot count',async()=>{
  const archive=rec('10.1234/archive','archive');
  const r=reader({hot:[rec('10.1234/hot')],get:{'10.1234/archive':{status:'published',lifecycle:'archive',record:archive}}});
  const x=await loadLandingPlan(r,{asOfDate:'2026-10-04',sharedDoi:'https://doi.org/10.1234/ARCHIVE'});
  assert.deepEqual(x.records.map(v=>v.doi),['10.1234/archive','10.1234/hot']);
  assert.equal(x.hotCount,1); assert.equal(x.shared.lifecycle,'archive');
});
test('withdrawn shared DOI is never rendered from a stale catalog',async()=>{
  const r=reader({hot:[rec('10.1234/hot')],get:{'10.1234/archive':{status:'withdrawn',doi:'10.1234/archive'}}});
  const x=await loadLandingPlan(r,{asOfDate:'2026-10-04',sharedDoi:'10.1234/archive'});
  assert.deepEqual(x.records.map(v=>v.doi),['10.1234/hot']); assert.equal(x.shared.status,'withdrawn');
});
test('verification failure returns no authoritative landing records',async()=>{
  const r={hot:async()=>({status:'verification-unavailable',complete:false,records:[]}),get:async()=>{throw Error('should not call')}};
  const x=await loadLandingPlan(r,{asOfDate:'2026-10-04'});assert.equal(x.complete,false);assert.equal(x.records.length,0);
});
test('favorite/status DOI resolution keeps Archive records available',async()=>{
  const r=reader({get:{
    '10.1234/a':{status:'published',lifecycle:'archive',record:rec('10.1234/a','archive')},
    '10.1234/b':{status:'published',lifecycle:'hot',record:rec('10.1234/b')},
    '10.1234/x':{status:'withdrawn',doi:'10.1234/x'},
  }});
  const x=await resolveDoisPlan(r,['10.1234/a','10.1234/b','10.1234/a','10.1234/x'],{asOfDate:'2026-10-04'});
  assert.deepEqual(x.records.map(v=>v.doi),['10.1234/a','10.1234/b']); assert.deepEqual(x.withdrawn,['10.1234/x']);
});
test('global search never calls an incomplete result definitive zero',async()=>{
  const r=reader({search:async()=>({results:[],matched:0,complete:false,failures:[{path:'search/x'}],scanned:1,total:2})});
  const x=await globalSearchPlan(r,'nickel',{asOfDate:'2026-10-04'});
  assert.equal(x.definitive,false); assert.equal(x.noMatches,false);
});
test('complete global zero is explicit',async()=>{
  const x=await globalSearchPlan(reader(),'nope',{asOfDate:'2026-10-04'});
  assert.equal(x.definitive,true); assert.equal(x.noMatches,true);
});
