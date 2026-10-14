import assert from 'node:assert/strict';
import { applyVerifiedTitlePresentation } from './apply-verified-title-presentation.mjs';
const a='10.1021/acs.orglett.6c00001', b='10.1021/acs.orglett.6c00002';
const base=[
  {doi:a,title:'Title Pending Verification',journal:'Organic Letters',date:'2026-08-04',authors:['A Author'],new:false},
  {doi:b,title:'标题待核验',journal:'Organic Letters',date:'2026-08-05',authors:['B Author'],new:false},
];
const record=(doi,title,source,evidence)=>({
  doi,title,source,evidence:[evidence],
  affectedFiles:['public/papers.gz.b64'],
});
const receipt={
  schema:'gallery-verified-title-backfill-v1',
  scope:'existing_approved_dois_only',
  doiMembershipUnchanged:true,publicationDatesUnchanged:true,newLiteraturePublished:false,
  originalUniqueDois:2,pendingRowsBefore:2,pendingUniqueDoisBefore:2,
  resolvedRows:2,resolvedUniqueDois:2,pendingRowsAfter:0,pendingUniqueDoisAfter:0,
  resolved:[
    record(a,'DOI-Matched Electrochemistry','crossref','crossref:verified_doi'),
    record(b,'DOI-Matched Photochemistry','openalex','openalex:verified_doi'),
  ],
};
const members=new Set([a,b]);
const supplement={papers:[{...base[1],title:'A More Recent Verified Existing Title'}],generatedAt:'fixture'};
const out=applyVerifiedTitlePresentation({baseline:base,supplement,receipt,members});
assert.equal(out.summary.baselineTitleGaps,2);
assert.equal(out.summary.addedDerivedRows,1);
assert.equal(out.summary.alreadyValidDerivedRows,1);
assert.equal(out.summary.newLiteratureAdmissions,0);
assert.equal(out.supplement.papers.length,2);
assert.equal(out.supplement.papers.find(r=>r.doi===a).title,'DOI-Matched Electrochemistry');
assert.equal(out.supplement.papers.find(r=>r.doi===b).title,'A More Recent Verified Existing Title');
assert.deepEqual(base[0],{doi:a,title:'Title Pending Verification',journal:'Organic Letters',date:'2026-08-04',authors:['A Author'],new:false});
assert.throws(()=>applyVerifiedTitlePresentation({baseline:base,supplement,receipt:{...receipt,resolved:[receipt.resolved[0],record('10.1021/jacs.new','False','crossref','crossref:verified_doi')]},members}));
assert.throws(()=>applyVerifiedTitlePresentation({baseline:base,supplement,receipt:{...receipt,resolved:[receipt.resolved[0],record(b,'False','openalex','crossref:verified_doi')]},members}));
assert.throws(()=>applyVerifiedTitlePresentation({baseline:base,supplement,receipt:{...receipt,pendingRowsAfter:1},members}));
assert.throws(()=>applyVerifiedTitlePresentation({baseline:base,supplement,receipt:{...receipt,resolved:[receipt.resolved[0],{...receipt.resolved[1],title:'Cloudflare checking your browser'}]},members}));
console.log(JSON.stringify({ok:true,tests:12,contract:'unchanged_protected_inputs_and_fixed_DOI_membership'},null,2));


import { trustedPublishedTitleBaseline } from './apply-verified-title-presentation.mjs';
const scopeMarker={
  mode:'scope-correction',releasePolicy:'deletion-only',
  previousProductionCards:1091,productionCards:1087,
  publishableDois:[],
  removedDois:[
    '10.1038/s41467-026-78512-x','10.1002/anie.2910902',
    '10.1021/acscatal.6c06095','10.1002/anie.2518487'
  ],
  lastFixedPublicationSlot:'2026-10-14T08:00:00+08:00',
  previousMarkerBlobSha:'ad43e69dd5536ee245a5f6c781c28397686defe3'
};
assert.equal(trustedPublishedTitleBaseline(scopeMarker),true);
assert.equal(trustedPublishedTitleBaseline({mode:'slot-release',productionCards:1087}),true);
assert.equal(trustedPublishedTitleBaseline({...scopeMarker,releasePolicy:'auto-admit'}),false);
assert.equal(trustedPublishedTitleBaseline({...scopeMarker,publishableDois:['10.1021/jacs.6c00001']}),false);
assert.equal(trustedPublishedTitleBaseline({...scopeMarker,productionCards:1086}),false);
assert.equal(trustedPublishedTitleBaseline({...scopeMarker,removedDois:[scopeMarker.removedDois[0],scopeMarker.removedDois[0],scopeMarker.removedDois[2],scopeMarker.removedDois[3]]}),false);
assert.equal(trustedPublishedTitleBaseline({...scopeMarker,lastFixedPublicationSlot:'2026-10-14T18:00:00+08:00'}),false);
assert.equal(trustedPublishedTitleBaseline({...scopeMarker,previousMarkerBlobSha:'x'}),false);
