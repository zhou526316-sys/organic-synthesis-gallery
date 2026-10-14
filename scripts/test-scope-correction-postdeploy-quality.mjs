import assert from 'node:assert/strict';
import {classifyScopeCorrectionQuality} from './classify-scope-correction-postdeploy-quality.mjs';
const removed=['10.1021/a','10.1002/b','10.1038/c','10.1021/d'],pending=['10.1021/p1','10.1021/p2'];
const extra=['10.1021/new1','10.1038/new2'];
const marker={mode:'scope-correction',schemaVersion:3,releasePolicy:'deletion-only',
  correctionId:'scope-correction-20261014012549272',lastFixedPublicationSlot:'2026-10-14T08:00:00+08:00',
  previousProductionCards:1091,productionCards:1087,removedDois:removed,publishableDois:[]};
const audit={generatedAt:'2026-10-14T01:28:45.691Z',summary:{galleryDois:1091,unresolved:8},
  missingCandidates:[
    ...removed.map(doi=>({doi,scopeCorrection:{decision:'exclude'}})),
    ...pending.map(doi=>({doi})),
    ...extra.map(doi=>({doi,title:'Actual undisposed candidate',journal:'ACS Catalysis',date:'2026-10-13'}))
  ]};
const compact={generatedAt:audit.generatedAt,summary:{unresolved:8},unresolved:audit.missingCandidates.map(x=>({doi:x.doi}))};
const state={lastWebsiteSync:{verification:{galleryDois:1087}},
  lastScopeCorrection:{id:marker.correctionId,status:'verified'},
  pendingReviewBacklog:pending.map(doi=>({doi}))};
const registry={items:removed.map(doi=>({doi,decision:'exclude'}))};
const quality={ok:false,failures:['discovery: unresolved DOI is neither formal pending nor reviewed next-slot carryover'],warnings:['closure source lag remains']};
const input={quality,marker,registry,audit,compact,state};
const ok=classifyScopeCorrectionQuality(input);
assert.equal(ok.deliveryVerified,true);
assert.equal(ok.repoAndDeployedCards,1087);
assert.equal(ok.globalQualityGateOk,undefined);
assert.equal(ok.qualityGateOk,false);
assert.equal(ok.qualityGateStatus,'unreviewed_discovery_not_closed');
assert.deepEqual(ok.unreviewedDois,extra.sort());
assert.deepEqual(ok.originalPendingDois,pending.sort());
assert.equal(ok.auditFreshForDeletion,false);
function reject(transform){
  assert.throws(()=>classifyScopeCorrectionQuality(transform({...input,
    quality:{...quality,failures:[...quality.failures]},
    marker:{...marker,removedDois:[...removed]},state:{...state},
    audit:{...audit,summary:{...audit.summary},missingCandidates:audit.missingCandidates.map(x=>({...x}))},
    compact:{...compact,unresolved:compact.unresolved.map(x=>({...x}))},
    registry:{items:registry.items.map(x=>({...x}))}
  })));
}
reject(v=>({...v,quality:{ok:false,failures:['production: retained DOI missing from live']}}));
reject(v=>({...v,marker:{...v.marker,productionCards:1088}}));
reject(v=>({...v,marker:{...v.marker,publishableDois:['10.1021/new-admission']}}));
reject(v=>({...v,registry:{items:v.registry.items.filter(x=>x.doi!==removed[0])}}));
reject(v=>({...v,audit:{...v.audit,missingCandidates:v.audit.missingCandidates.filter(x=>x.doi!==removed[0])}}));
reject(v=>({...v,compact:{...v.compact,generatedAt:'2026-10-13T00:00:00Z'}}));
reject(v=>({...v,state:{...v.state,lastScopeCorrection:{id:v.marker.correctionId,status:'awaiting_deployment'}}}));
reject(v=>({...v,quality:{ok:true,failures:[]}}));
console.log(JSON.stringify({ok:true,caseCount:9,contract:'Deletions exact, missing DOI review not disguised as complete quality gate'}));
