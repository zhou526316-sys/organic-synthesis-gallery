import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exclusionEvidenceRecheckReason} from './lib/literature-exclusion-recheck.mjs';
const DOI='10.1038/s44160-026-01189-z';
const ABSTRACT='Thiourea mediates a one-step transformation of oxetanes into thietanes. This reaction has a broad substrate scope, functional group tolerance and late-stage editing of complex molecules with distinct products.';
const before={doi:DOI,title:'One-step skeletal editing of oxetanes to thietanes using thiourea',date:'2026-10-12',journal:'Nature Synthesis',abstract:'',decision:'exclude'};
const after={...before,abstract:ABSTRACT};
test('meaningful new abstract reopens old exclusion for human two-pass challenge',()=>{
  assert.equal(exclusionEvidenceRecheckReason(after,before),'new_substantive_abstract_after_previous_exclusion');
  assert.equal(exclusionEvidenceRecheckReason({...before,abstract:''},before),'');
});
test('explicit user confirmed DOI exclusion takes precedence over new metadata',()=>{
  assert.equal(exclusionEvidenceRecheckReason(after,before,{confirmedExcluded:true}),'');
});
test('a previous pending or include is not re-labelled by exclusion-recheck mechanism',()=>{
  assert.equal(exclusionEvidenceRecheckReason(after,{...before,decision:'pending'}),'');
  assert.equal(exclusionEvidenceRecheckReason(after,{...before,decision:'include'}),'');
});
test('new article title or verified publication date reopens for review, without auto-accepting',()=>{
  assert.equal(exclusionEvidenceRecheckReason({...before,title:'Updated research article title'},before),'changed_article_title');
  assert.equal(exclusionEvidenceRecheckReason({...before,date:'2026-10-13'},before),'changed_publication_date');
});
test('non-substantive metadata remains unchanged and does not re-review all old exclusions',()=>{
  const orig={...before,abstract:'A'.repeat(250)};
  assert.equal(exclusionEvidenceRecheckReason({...orig,abstract:'A'.repeat(250)},orig),'');
});
