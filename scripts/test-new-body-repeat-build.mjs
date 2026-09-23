import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateR2ReadKey,loadNewBodyContext,mergeNewBodyAuto} from '../cloudflare/scripts/merge-new-body-auto.mjs';
const dir=process.env.NEW_BODY_FIXTURE,ev=JSON.parse(await readFile(path.join(dir,'evidence.json'))),stage=JSON.parse(await readFile(path.join(dir,'stage-index.json'))),reports=JSON.parse(await readFile(path.join(dir,'report-index.json'))),live=JSON.parse(await readFile(path.join(dir,'public-media-index.json')));
let passed=0;const test=async(name,f)=>{await f();passed++;console.log('NEW_BODY_REPEAT_PASS '+name);};
await test('actual immutable report keys use the accepted 32-hex DOI namespace',()=>{assert.ok(ev.reports.length);for(const r of ev.reports)assert.equal(validateR2ReadKey(r.key),r.key);});
await test('traversal and alternate object families stay forbidden',()=>{for(const k of ['../../secrets','local-captures/tampermonkey/reports/../a.json','local-captures/other/index.json'])assert.throws(()=>validateR2ReadKey(k),/forbidden/);});
const root=await mkdtemp(path.join(tmpdir(),'body-repeat-'));
try{
 for(const f of ['shared/new-body-auto-policy.json','audit/literature-update-state.json','scripts/decode-new-body-image.py',...['papers.gz.b64','total-synthesis.json','manual-supplement.json','final-audit-supplement.json','curated-supplement.json','automation-supplement.json','rolling-supplement.json'].map(n=>'public/'+n)]){await mkdir(path.dirname(path.join(root,f)),{recursive:true});await cp(f,path.join(root,f));}
 const p=path.join(root,'public/media-index.json');await writeFile(p,JSON.stringify(live));
 const imageMap=new Map(ev.images.map(r=>[r.r2Key,r])),reportMap=new Map(ev.reports.map(r=>[r.key,r.report]));
 const io={r2:async key=>{validateR2ReadKey(key);if(key.endsWith('article-figures/stage-index.json'))return Buffer.from(JSON.stringify(stage));if(key.endsWith('tampermonkey/report-index.json'))return Buffer.from(JSON.stringify(reports));if(imageMap.has(key))return readFile(path.join(dir,imageMap.get(key).file));if(reportMap.has(key))return Buffer.from(JSON.stringify(reportMap.get(key)));throw new Error('fixture_not_selected');},siteJson:async n=>n==='media-index.json'?live:null};
 const c=await loadNewBodyContext(root,io),first=await mergeNewBodyAuto(c);assert.ok(first.ledger.count>0);
 const repeat=await mergeNewBodyAuto({...c,eligible:[],previous:first.ledger});
 await test('same-directory repeated build retains every ledger item',()=>{assert.equal(repeat.ledger.count,first.ledger.count);assert.equal(repeat.summary.added.length,0);assert.equal(repeat.summary.carried.length,first.ledger.count);});
 await writeFile(p,JSON.stringify(live));
 const bounded=await mergeNewBodyAuto({...c,policy:{...c.policy,maxNewPapers:1}});
 await test('one-paper bound defers remaining papers and saves continuation',()=>{assert.ok(bounded.summary.deferred>0);assert.ok(bounded.summary.nextCursor);assert.ok(bounded.summary.newPapers.length<=1);});
 const continued=await loadNewBodyContext(root,{...io,siteJson:async n=>n==='media-index.json'?live:n==='new-body-auto-status.json'?{...bounded.summary,inputFingerprint:c.inputFingerprint}:null});
 await test('unvisited queue continues even with an unchanged input fingerprint',()=>{assert.equal(continued.changed,true);assert.equal(continued.eligible[0].doi+'|'+continued.eligible[0].id,bounded.summary.nextCursor);});
 const unchanged=await loadNewBodyContext(root,{...io,siteJson:async n=>n==='media-index.json'?live:n==='new-body-auto-status.json'?{inputFingerprint:c.inputFingerprint,deferred:0}:null});
 await test('unchanged completed scan does not schedule another build',()=>assert.equal(unchanged.changed,false));
 await writeFile(p,JSON.stringify(live));
 const disabled=await mergeNewBodyAuto({...c,policy:{...c.policy,enabled:false},previous:first.ledger,io:{...io,publicBytes:async n=>readFile(path.join(root,'public',n))}});
 await test('disabling new acquisition preserves previously published exact copies',()=>{assert.equal(disabled.summary.added.length,0);assert.equal(disabled.ledger.count,first.ledger.count);});
 await writeFile(p,JSON.stringify(live));
 const changedStage=structuredClone(stage);for(const r of Object.values(changedStage.items))if(r.reviewMarker)r.sha256='0'.repeat(64);
 const changed=await mergeNewBodyAuto({...c,read:async key=>key.endsWith('article-figures/stage-index.json')?Buffer.from(JSON.stringify(changedStage)):io.r2(key)});
 await test('capture changed during actual byte validation is held before publication',()=>{assert.equal(changed.summary.added.length,0);assert.ok(changed.summary.held.some(x=>x.reason==='capture_changed_during_validation'));});
 await writeFile(process.env.RUNNER_TEMP+'/new-body-repeat-tests.json',JSON.stringify({passed,realReplayCount:first.ledger.count,productionWrites:0},null,2));
}finally{await rm(root,{recursive:true,force:true});}
console.log('NEW_BODY_REPEAT_TESTS '+JSON.stringify({passed}));
