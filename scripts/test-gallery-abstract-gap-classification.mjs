import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyPublishedAbstractGap as classify} from './lib/classify-gallery-abstract-gap.mjs';
const summary={status:'approved',zh:'基于已核验正文的双语科研解读。',en:'Verified bilingual scientific review of a paper.',
  sourceHash:'a'.repeat(64),evidencePacketHash:'b'.repeat(64)};
const ui={doi:'10.1234/demo',available:false,evidenceAvailable:true,evidenceLevel:'complete',
  sourceHash:'a'.repeat(64),evidencePacketHash:'b'.repeat(64),
  reason:'scheduled_summary_pending'};
test('live reviewed summary needs no repair and no raw summaries are copied',()=>{
  const v=classify(summary,{...ui,available:true,source:'reviewed_evidence_v2'});
  assert.equal(v.category,'summary_live_available');
  assert.equal(v.remediation,'none');
  assert.equal('zh' in v,false);
  assert.equal('en' in v,false);
});
test('existing approved review with no Evidence never leaks as a valid current summary',()=>{
  const v=classify(summary,{doi:ui.doi,available:false,evidenceAvailable:false,reason:'fulltext_missing'});
  assert.equal(v.category,'approved_but_evidence_unavailable');
  assert.equal(v.remediation,'restore_original_verified_evidence');
  assert.equal(v.evidenceSourceHashMatchesApproved,null);
});
test('legacy Evidence is not mistaken for V2 current evidence',()=>{
  assert.equal(classify(summary,{available:false,evidenceAvailable:false,
    reason:'evidence_v2_required'}).category,'approved_legacy_evidence_only');
});
test('changed current Evidence hashes require independent re-review',()=>{
  const v=classify(summary,{...ui,sourceHash:'c'.repeat(64),reason:'summary_stale'});
  assert.equal(v.category,'approved_evidence_hash_mismatch');
  assert.equal(v.evidenceSourceHashMatchesApproved,false);
  assert.equal(v.evidencePacketHashMatchesApproved,true);
});
test('matching verified Evidence not served surfaces deploy/read investigation',()=>{
  const v=classify(summary,ui);
  assert.equal(v.category,'approved_hash_match_but_not_served');
  assert.equal(v.remediation,'inspect_asset_deployment_and_summary_read');
});
test('missing record and malformed records cannot be promoted automatically',()=>{
  assert.equal(classify(null,ui).category,'no_approved_summary_record');
  assert.equal(classify({...summary,en:''},ui).category,'approved_record_invalid');
});
test('restricted reason vocabulary and no full evidence information',()=>{
  const v=classify(summary,{...ui,reason:'unexpected_error_with_private_data'});
  assert.equal(v.reason,null);
  assert.equal(JSON.stringify(v).includes('Verified bilingual'),false);
});
test('transport error remains separate from absent scientific evidence',()=>{
  assert.equal(classify(summary,null,'read_http_503').category,'summary_api_unavailable');
});
