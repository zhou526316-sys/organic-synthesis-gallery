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
