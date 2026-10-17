import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateHistoricalApproval} from './lib/historical-admission.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const source=read('audit/historical-reviewed/q3-natcomm-five-source-proof-20261015.json');
const reviewed=read('audit/historical-scope-assessments/2026-10-15-natcomm-five-original-two-pass.json');
const manifest=read('audit/historical-reviewed/approved-admissions.json');
const formal=read('public/toc-demand-live.json');
const excluded=read('audit/literature-scope-corrections.json');
const byId=new Map(source.rows.map(x=>[x.doi,x]));
const science=new Map(reviewed.assessments.map(x=>[x.doi,x]));
const approved=['10.1038/s41467-026-76347-0','10.1038/s41467-026-77616-8','10.1038/s41467-026-77718-3'];
const published=new Set(formal.articles.map(x=>x.doi));
const owner=new Set(excluded.items.map(x=>x.doi));
test('five exact Q3 Nature Communications Original Articles retain original DOI, publisher day, sources, authors and article citation',()=>{
  assert.equal(source.schemaVersion,'gallery-natcomm-q3-five-original-source-provenance-v1');
  assert.equal(byId.size,5);
  for(const x of source.rows){
    assert.equal(x.publisherType,'Article');
    assert.equal(x.journal,'Nature Communications');
    assert.match(x.firstOnline,/^2026-(07|08|09)-\d\d$/);
    assert.equal(x.officialPage,'https://www.nature.com/articles/'+x.doi.split('/')[1]);
    assert.match(x.sourceBatchSha256,/^[0-9a-f]{64}$/);
    assert.match(x.rawSourceGitBlobSha,/^[0-9a-f]{40}$/);
    assert.match(x.reviewQueueGitBlobSha,/^[0-9a-f]{40}$/);
    assert.deepEqual(new Set(x.sourceFamilies),new Set(['crossref','openalex']));
    assert.equal(x.citation.doi,x.doi);
    assert.equal(String(x.citation.articleNumber),x.publisherArticleNumber);
    assert.ok(x.authors.length>=3);
    // After the sole 08:00 writer has lawfully admitted a previously
    // scope-reviewed original, verify the historical card instead of
    // pretending the DOI is permanently unpublished.
    if(published.has(x.doi)){
      assert.equal(science.get(x.doi)?.decision,'include',x.doi);
      const card=formal.articles.find(v=>v.doi===x.doi);
      assert.equal(card?.ingestionChannel,'historical_backfill',x.doi);
      assert.equal(card?.mediaPolicy,'toc_only',x.doi);
      assert.equal(card?.addedDate,'',x.doi);
      assert.notEqual(card?.new,true,x.doi);
      assert.equal(card?.date,x.firstOnline,x.doi);
    }
    assert.ok(!owner.has(x.doi));
  }
});
test('paper-specific two-pass science identifies 3 true preparative methods, one biochemical-route hold and one engineering exclusion',()=>{
  assert.equal(science.size,5);
  assert.deepEqual([reviewed.accounting.include,reviewed.accounting.exclude,reviewed.accounting.evidencePending],[3,1,1]);
  assert.equal(reviewed.accounting.integratedIntoQuarterReconciliation,false);
  for(const x of reviewed.assessments){
    const p=byId.get(x.doi);assert.ok(p);
    assert.equal(x.publisherArticleType,'Article');
    assert.equal(x.date,p.firstOnline);
    assert.equal(x.reviewEvidence.stageBatchSha,p.rawSourceGitBlobSha);
    assert.equal(x.reviewEvidence.sourceReviewQueueGitBlobSha,p.reviewQueueGitBlobSha);
    assert.equal(x.reviewEvidence.publisherPage,p.officialPage);
    assert.equal(x.reviewPasses,2);
    assert.equal(x.firstPassDecision,x.decision);
    assert.equal(x.challengeDecision,x.decision);
    assert.notEqual(x.firstPassReason,x.independentChallengeReason);
    assert.ok(x.firstPassReason.length>100);
    assert.ok(x.independentChallengeReason.length>65);
    for(const key of ['primaryContribution','preparativeTransformation','generalityEvidence','sourceEvidence','boundaryChallenge'])
      assert.ok(x.scopeAssessment[key].length>=35,x.doi+':'+key);
  }
  assert.deepEqual(reviewed.assessments.filter(x=>x.decision==='include').map(x=>x.doi).sort(),approved);
  const held=science.get('10.1038/s41467-026-75484-w');
  assert.equal(held.decision,'pending');
  assert.equal(held.missingEvidenceMustNotMeanNoEvidenceExists,true);
  assert.ok(held.evidenceNeeded.length>60);
  assert.equal(science.get('10.1038/s41467-026-75547-y').decision,'exclude');
});
test('three approved DOIs are cumulative, rights protected, toc-only and authoritatively admitted for sole 08 writer',()=>{
  assert.equal(manifest.summary.include,manifest.accepted.length);
  assert.ok(manifest.summary.include>=128);
  assert.equal(manifest.pending.length,2);
  assert.match(manifest.nextEligiblePublicationSlot,/^2026-10-\d{2}T08:00:00\+08:00$/);
  assert.ok(manifest.nextEligiblePublicationSlot>='2026-10-16T08:00:00+08:00');
  assert.equal(validateHistoricalApproval(manifest).length,manifest.accepted.length);
  const ids=new Set(manifest.accepted.map(x=>x.doi));assert.equal(ids.size,manifest.accepted.length);
  for(const doi of approved){
    const a=manifest.accepted.find(x=>x.doi===doi),p=byId.get(doi),s=science.get(doi);
    assert.ok(a);assert.equal(a.date,p.firstOnline);
    assert.equal(a.title,p.title);assert.equal(a.journal,p.journal);
    assert.equal(a.reviewEvidence.stageBatchSha,p.rawSourceGitBlobSha);
    assert.equal(a.reviewEvidence.publisherPage,p.officialPage);
    assert.equal(a.reviewEvidence.publisherOnlineDate,p.firstOnline);
    assert.equal(a.reviewEvidence.sourceReviewQueueGitBlobSha,p.reviewQueueGitBlobSha);
    assert.equal(a.citation.articleNumber,p.publisherArticleNumber);
    assert.equal(a.scopeAssessment.generalityEvidence,s.scopeAssessment.generalityEvidence);
    assert.equal(a.scopeAssessment.boundaryChallenge,s.scopeAssessment.boundaryChallenge);
    assert.equal(a.ingestionChannel,'historical_backfill');
    assert.equal(a.mediaPolicy,'toc_only');
    assert.equal(a.new,false);assert.equal(a.addedDate,'');
    assert.equal(a.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    assert.equal('fullText' in a,false);assert.equal('pdf' in a,false);
  }
  for(const doi of ['10.1038/s41467-026-75484-w','10.1038/s41467-026-75547-y'])
    assert.ok(!ids.has(doi),doi);
});
test('wrong publisher date, fake Git batch SHA or leaked media is rejected by the unchanged fixed-slot writer guard',()=>{
  for(const mutate of [
    x=>{x.reviewEvidence.publisherOnlineDate='2026-06-01'},
    x=>{x.reviewEvidence.stageBatchSha='not-a-real-sha'},
    x=>{x.new=true},
    x=>{x.pdf='https://example.test/protected.pdf'}
  ]){
    const x=structuredClone(manifest),record=x.accepted.find(r=>r.doi===approved[0]);mutate(record);
    assert.throws(()=>validateHistoricalApproval(x),/historical_review_/);
  }
});
