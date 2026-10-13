import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validChineseTitle} from '../shared/chinese-title-overrides.js';
import {test} from 'node:test';
import {validateHistoricalApproval,selectHistoricalAdmissions,historicCard,HISTORICAL_APPROVED_PATH,historicalPublisherPageMatchesDoi}
  from './lib/historical-admission.mjs';
const root=JSON.parse(readFileSync(HISTORICAL_APPROVED_PATH,'utf8'));
const clone=()=>structuredClone(root);
test('all source-fingerprinted historic scope approvals are valid and cumulatively extensible',()=>{
  assert.equal(validateHistoricalApproval(root).length,root.summary.include);
  assert.ok(root.summary.include>=10);
  assert.equal(root.summary.checked,root.accepted.length+root.pending.length);
  assert.equal(root.summary.pending,2);
  assert.equal(new Set(root.accepted.map(x=>x.doi)).size,root.accepted.length);
});
test('pilot has distinct pending publication-date conflicts, never included',()=>{
  assert.equal(root.pending.length,2);
  assert.ok(root.pending.every(x=>x.decision==='pending'&&x.challengeDecision==='pending'));
  const selected=selectHistoricalAdmissions(root);
  assert.equal(selected.length,root.accepted.length);
  assert.ok(root.pending.every(x=>!selected.some(y=>y.doi===x.doi)));
});
test('already-published source DOI is not re-added to formal release',()=>{
  const published=new Set(root.accepted.slice(0,2).map(x=>x.doi));
  const selected=selectHistoricalAdmissions(root,{published});
  assert.equal(selected.length,root.accepted.length-2);
  assert.ok(selected.every(x=>!published.has(x.doi)));
});
test('cross-scope and daily-DOI collision hard block',()=>{
  for(const name of ['excluded','dailyDois']){
    assert.throws(()=>selectHistoricalAdmissions(root,{[name]:new Set([root.accepted[0].doi])}),
      name==='excluded'?/historical_review_excluded_doi/:/historical_review_daily_overlap/);
  }
});
test('card projection excludes historic from daily new/hot and PDF capture',()=>{
  for(const x of root.accepted){
    const card=historicCard(x);
    assert.equal(card.new,false);
    assert.equal(card.addedDate,'');
    assert.equal(card.ingestionChannel,'historical_backfill');
    assert.equal(card.mediaPolicy,x.date<'2026-07-01'?'metadata_only':'toc_only');
    assert.equal(card.doi,x.doi);
    assert.equal(card.titleZh,x.titleZh);
    assert.equal('abstract' in card,false);
    assert.equal('pdf' in card,false);
  }
});
test('an explicitly pre-July approved historical DOI is metadata-only',()=>{
  const x={...root.accepted[0],date:'1967-05-11'};
  assert.equal(historicCard(x).mediaPolicy,'metadata_only');
});
test('fake one-pass scope approval is rejected even if title resembles chemistry',()=>{
  const m=clone();m.accepted[0].reviewPasses=1;
  assert.throws(()=>validateHistoricalApproval(m),/historical_review_two_pass_missing/);
});
test('publisher-date mismatch and malformed source receipt both fail closed',()=>{
  const m=clone();m.accepted[0].reviewEvidence.publisherOnlineDate='2026-09-09';
  assert.throws(()=>validateHistoricalApproval(m),/historical_review_source_identity_missing/);
  const n=clone();n.accepted[1].reviewEvidence.stageBatchSha='000';
  assert.throws(()=>validateHistoricalApproval(n),/historical_review_source_identity_missing/);
});
test('rights or PDF leakage in review cannot enter historical archive',()=>{
  const x=clone();x.accepted[0].publisherAbstractRights='free';
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_rights_not_verified/);
  const y=clone();y.accepted[0].pdf='https://example.com/protected.pdf';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_rights_not_verified/);
});
test('historic DOI admission cannot pretend to be new or fetch body media',()=>{
  const x=clone();x.accepted[0].new=true;
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_wrong_capture_or_newness/);
  const y=clone();y.accepted[0].mediaPolicy='standard';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_wrong_capture_or_newness/);
});
test('two DOI groups cannot overlap and a pending record cannot silently flip to include',()=>{
  const x=clone();x.pending[0].doi=x.accepted[0].doi;
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_doi_invalid_or_duplicate/);
  const y=clone();y.pending[0].decision='include';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_pending_conflated_with_include/);
});
test('review scope SHA and evidence are mandatory',()=>{
  const x=clone();x.scopeCorrectionsBlobSha='';
  assert.throws(()=>validateHistoricalApproval(x),/historical_review_scope_fingerprint_missing/);
  const y=clone();y.accepted[0].scopeAssessment.generalityEvidence='';
  assert.throws(()=>validateHistoricalApproval(y),/historical_review_scope_evidence_missing/);
});


test('each historic Chinese title passes actual 08:00 writer input validation',()=>{
  for(const row of root.accepted)
    assert.equal(validChineseTitle(row.titleZh),true,row.doi);
});

test('new three scope-approved historical DOI are uniquely staged and frozen for the next 08:00 slot',()=>{
  const expected=["10.1021/acs.joc.6c00602","10.1021/acscatal.6c05426","10.1021/acs.orglett.6c03154"];
  for(const doi of expected){
    const row=root.accepted.find(x=>x.doi===doi);
    assert.ok(row,doi);
    assert.equal(row.reviewStatus,'two_pass_scope_include_awaiting_fixed_slot');
    assert.equal(row.reviewEvidence.publisherOnlineDate,row.date);
    assert.equal(row.reviewEvidence.abstractCopied,false);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.addedDate,'');
    assert.equal(row.new,false);
  }
  assert.equal(root.summary.checked,root.accepted.length+root.pending.length);
});

test('newly verified missed September JOC chemistry has independent evidence passes',()=>{
  for(const doi of ['10.1021/acs.joc.6c01580','10.1021/acs.joc.6c01772']){
    const row=root.accepted.find(x=>x.doi===doi);
    assert.ok(row,'missing newly reviewed DOI '+doi);
    assert.equal(row.reviewPasses,2);
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewEvidence.stageBatchSha,'c5604566a1a9763ce4fbbd2233b424db5c960517');
    assert.equal(row.mediaPolicy,'toc_only');
    assert.equal(row.addedDate,'');
  }
});

test('multi-journal old synthesis admission requires official Nature publisher URLs and no old media',()=>{
  assert.ok(root.accepted.length>=23);
  for(const id of [
    '10.1021/acs.joc.6c00818','10.1021/acs.joc.6c01133',
    '10.1021/acs.joc.6c01465','10.1021/acs.joc.6c01523',
    '10.1038/s44160-026-01023-6','10.1038/s44160-026-01036-1',
    '10.1021/jacs.5c13553','10.1021/jacs.5c14490',
    '10.1021/acs.joc.5c02749','10.1021/acs.joc.6c00214']){
    const row=root.accepted.find(x=>x.doi===id);
    assert.ok(row,'missing approved source-reviewed DOI '+id);
    assert.equal(row.reviewPasses,2);
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewEvidence.publisherOnlineDate,row.date);
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.mediaPolicy,row.date<'2026-07-01'?'metadata_only':'toc_only');
    assert.equal(row.addedDate,'');
    assert.equal(row.new,false);
  }
  const names=root.accepted.filter(x=>x.doi.startsWith('10.1038/'));
  assert.ok(names.length>=2);
  for(const x of names){
    assert.ok(x.reviewEvidence.publisherPage.startsWith('https://www.nature.com/articles/'));
    assert.ok(historicalPublisherPageMatchesDoi(x.doi,x.reviewEvidence.publisherPage));
  }
  assert.equal(historicalPublisherPageMatchesDoi(
    '10.1038/s44160-026-01023-6','https://www.nature.com/articles/s44160-026-01234-0'),false);
  assert.equal(historicalPublisherPageMatchesDoi(
    '10.1038/s44160-026-01023-6','http://www.nature.com/articles/s44160-026-01023-6'),false);
});

test('2026-Q3 three independently assessed JOC methods are never marked daily new',()=>{
  const expected=[
    ['10.1021/acs.joc.6c00587','2026-07-02','158a2415687e4a0ecf0c588356f417cc1679d70a'],
    ['10.1021/acs.joc.6c00860','2026-08-05','fdbac4c465d92dcc0817d7507348d985349331f3'],
    ['10.1021/acs.joc.5c03271','2026-08-01','fdbac4c465d92dcc0817d7507348d985349331f3']
  ];
  for(const [doi,date,sourceSha] of expected){
    const row=root.accepted.find(x=>x.doi===doi);
    assert.ok(row,'missing source-reviewed DOI '+doi);
    assert.equal(row.date,date);
    assert.equal(row.reviewEvidence.publisherOnlineDate,date);
    assert.equal(row.reviewEvidence.stageBatchSha,sourceSha);
    assert.ok(row.reviewEvidence.publisherPage.includes('/'+doi));
    assert.equal(row.firstPassDecision,'include');
    assert.equal(row.challengeDecision,'include');
    assert.equal(row.reviewPasses,2);
    assert.equal(row.new,false);
    assert.equal(row.addedDate,'');
    assert.equal(row.ingestionChannel,'historical_backfill');
    assert.equal(row.mediaPolicy,'toc_only');
    assert.equal(row.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    assert.ok(Object.keys(row.scopeAssessment).includes('boundaryChallenge'));
    assert.equal('pdf' in row,false);
  }
});

test('Q3 ACS online-first reconciliation admits only four independently reviewed synthetic articles',()=>{
  const expected=new Map([
    ['10.1021/acscatal.6c02698',['2026-07-27','4f5e8cbdce63f5488856ee08a27a183611d7905d']],
    ['10.1021/acs.orglett.6c03391',['2026-08-31','3eb3448b8f413701aed67f8e3f29d518400d7827']],
    ['10.1021/acs.joc.6c01089',['2026-07-31','9181de94c2f59b0fb77a470f802a143699524037']],
    ['10.1021/acs.joc.6c01163',['2026-07-30','9181de94c2f59b0fb77a470f802a143699524037']]
  ]);
  const firstPassReasons=[];
  for(const [doi,[online,sourceSha]] of expected){
    const record=root.accepted.find(row=>row.doi===doi);
    assert.ok(record,'not approved: '+doi);
    assert.equal(record.date,online,'first-online, not print-issue date: '+doi);
    assert.equal(record.reviewEvidence.publisherOnlineDate,online);
    assert.equal(record.reviewEvidence.stageBatchSha,sourceSha);
    assert.equal(record.firstPassDecision,'include');
    assert.equal(record.challengeDecision,'include');
    assert.equal(record.reviewPasses,2);
    assert.deepEqual(record.independentPasses.map(pass=>pass.decision),['include','include']);
    assert.ok(record.independentPasses[0].assessment.length>60);
    firstPassReasons.push(record.independentPasses[0].assessment);
    assert.equal(record.mediaPolicy,'toc_only');
    assert.equal(record.new,false);
    assert.equal(record.addedDate,'');
    assert.equal(record.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    assert.equal(record.reviewEvidence.pdfFetched,false);
  }
  assert.equal(new Set(firstPassReasons).size,expected.size);
});

test('eight RSC Q3 NLM electronic dates are not substituted with created or issue dates',()=>{
  const expected=new Map([
    ['10.1039/d6sc02716d','2026-07-15'],
    ['10.1039/d6sc02777f','2026-07-08'],
    ['10.1039/d6sc03998g','2026-07-29'],
    ['10.1039/d6sc04572c','2026-07-27'],
    ['10.1039/d6sc05207j','2026-08-05'],
    ['10.1039/d6sc05589c','2026-08-31'],
    ['10.1039/d6sc05410b','2026-09-04'],
    ['10.1039/d6sc06200h','2026-09-22']
  ]);
  const firstPasses=new Set(),sourceRoots=new Set();
  for(const [doi,firstOnline] of expected){
    const x=root.accepted.find(row=>row.doi===doi);
    assert.ok(x,'missing Chemical Science DOI '+doi);
    assert.equal(x.journal,'Chemical Science');
    assert.equal(x.date,firstOnline,'the NLM electronic date must override unknown Crossref created year');
    assert.equal(x.reviewEvidence.publisherOnlineDate,firstOnline);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.journalSuppliedDate,firstOnline);
    assert.match(x.reviewEvidence.firstOnlineDateEvidence.tier,/^NLM_journal_supplied_electronic_date/);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.directPublisherFirstPublishedNotRead,true);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.recordCrossrefDate,'unverified_year_only');
    assert.equal(x.reviewEvidence.publisherDirectPageStatus,'bot_blocked');
    assert.match(x.reviewEvidence.firstOnlineDateEvidence.pubmedUrl,/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
    assert.match(x.reviewEvidence.firstOnlineDateEvidence.pmcUrl,/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/$/);
    assert.ok(x.reviewEvidence.publisherPage.includes('/'+doi));
    assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref']);
    assert.equal(x.reviewPasses,2);
    assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
    assert.ok(x.independentPasses.every(p=>p.reason.length>60));
    firstPasses.add(x.independentPasses[0].reason);
    sourceRoots.add(x.reviewEvidence.stageBatchId);
    assert.equal(x.ingestionChannel,'historical_backfill');
    assert.equal(x.mediaPolicy,'toc_only');
    assert.equal(x.new,false);
    assert.equal(x.addedDate,'');
    assert.equal(x.reviewEvidence.pdfFetched,false);
    assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  }
  assert.equal(firstPasses.size,8,'first passes must be DOI-specific');
  assert.ok(sourceRoots.size>=6,'batch provenance must not be a single fabricated source');
  assert.equal(root.pending.length,2,'old date conflicts remain unresolved, not silently accepted');
});

test('Green Chemistry Q3 recovered dates are the RSC original Published on imprint, never Crossref created dates',()=>{
 const pairs=[
  ['10.1039/d6gc02631a','2026-07-09','4807a9c60e560c2830552c36dc7ab703b3249349'],
  ['10.1039/d6gc02989b','2026-08-05','f5d97aab53d4fe741a09621ec1a53ca5d83e2616']
 ];
 const challengeReasons=[];
 for(const [doi,firstOnline,sourceSha] of pairs){
   const x=root.accepted.find(r=>r.doi===doi);
   assert.ok(x,doi);
   assert.equal(x.journal,'Green Chemistry');
   assert.equal(x.date,firstOnline);
   assert.equal(x.reviewEvidence.publisherOnlineDate,firstOnline);
   assert.equal(x.reviewEvidence.stageBatchSha,sourceSha);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.firstOnlineDate,firstOnline);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.publisherSiteDirectRead,false);
   assert.equal(x.reviewEvidence.firstOnlineDateEvidence.crossrefFirstPublishedDayUnknown,true);
   assert.match(x.reviewEvidence.firstOnlineDateEvidence.tier,/^RSC_publisher_typeset_original_imprint_/);
   assert.match(x.reviewEvidence.firstOnlineDateEvidence.publisherImprint,/^Published on \d\d \w+ 2026$/);
   assert.match(x.reviewEvidence.firstOnlineDateEvidence.originalPublisherTypesetCopyUrl,/^https:\/\/www\.researchgate\.net\/publication\//);
   assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref']);
   assert.equal(x.reviewPasses,2);
   assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
   assert.ok(x.independentPasses.every(p=>p.reason.length>70));
   challengeReasons.push(x.independentPasses[1].reason);
   assert.equal(x.mediaPolicy,'toc_only');
   assert.equal(x.new,false);
   assert.equal(x.addedDate,'');
   assert.equal(x.reviewEvidence.figureFetched,false);
   assert.equal(x.reviewEvidence.pdfFetched,false);
 }
 assert.equal(new Set(challengeReasons).size,2);
 assert.equal(root.pending.length,2);
});

test('2026 Q3 eight ACS originals require exact publisher first-online dates and distinct scientific challenges',()=>{
  const pairs=[
    ['10.1021/jacs.6c08244','2026-07-31','1e3a285d37a0cba1db6fafc15b07af8e3833137f'],
    ['10.1021/jacs.6c11788','2026-07-29','1e3a285d37a0cba1db6fafc15b07af8e3833137f'],
    ['10.1021/acscatal.6c03737','2026-07-23','4f5e8cbdce63f5488856ee08a27a183611d7905d'],
    ['10.1021/acscatal.6c04804','2026-08-24','267848d5cc293c65a8c780ffcad4b043fe27cccc'],
    ['10.1021/acs.orglett.6c03121','2026-09-06','80aca4837373541c9ba22bdcae30cd0bd2f64511'],
    ['10.1021/acs.orglett.6c02892','2026-07-30','67f6960bccfa31a1d2477390309426061dc65563'],
    ['10.1021/acs.orglett.6c03201','2026-08-29','3eb3448b8f413701aed67f8e3f29d518400d7827'],
    ['10.1021/acs.joc.6c01478','2026-08-26','30ad0c3b51b48a210e90d8fe19b56412b1c94f7a']
  ];
  const challenges=new Set(),contributions=new Set();
  for(const [doi,firstOnline,sourceSha] of pairs){
    const record=root.accepted.find(x=>x.doi===doi);
    assert.ok(record,'missing Q3 DOI '+doi);
    assert.equal(record.date,firstOnline);
    assert.equal(record.reviewEvidence.publisherOnlineDate,firstOnline);
    assert.equal(record.reviewEvidence.stageBatchSha,sourceSha);
    assert.match(record.reviewEvidence.publisherPage,/^https:\/\/pubs\.acs\.org\/doi\/10\.1021\//);
    assert.equal(record.reviewPasses,2);
    assert.deepEqual(record.independentPasses.map(p=>p.decision),['include','include']);
    assert.ok(record.independentPasses[0].reason.length>85);
    assert.ok(record.independentPasses[1].reason.length>70);
    challenges.add(record.independentPasses[1].reason);
    contributions.add(record.scopeAssessment.primaryContribution);
    assert.deepEqual(record.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
    assert.equal(record.ingestionChannel,'historical_backfill');
    assert.equal(record.mediaPolicy,'toc_only');
    assert.equal(record.new,false);
    assert.equal(record.addedDate,'');
    assert.equal(record.reviewEvidence.pdfFetched,false);
    assert.equal(record.reviewEvidence.figureFetched,false);
    assert.equal(record.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  }
  assert.equal(challenges.size,pairs.length,'distinct second-pass boundaries');
  assert.equal(contributions.size,pairs.length,'distinct first-pass evidence');
  assert.equal(root.pending.length,2,'old date disputes must remain pending');
  for(const doi of [
    '10.1038/s41929-026-01597-6','10.1038/s44160-026-01160-y',
    '10.1038/s44160-026-01174-6','10.1038/s41557-026-02201-x',
    '10.1038/s41557-026-02246-y'
  ])assert.equal(root.accepted.some(x=>x.doi===doi),false,
      'Nature publisher commentary must not masquerade as an original research include');
});

test('Angew original pyrrole research is distinct from Nature Synthesis Research Highlight',()=>{
  const doi='10.1002/anie.8203203',highlight='10.1038/s44160-026-01174-6';
  const item=root.accepted.find(x=>x.doi===doi);
  assert.ok(item,'publisher-verified experimental paper absent');
  assert.equal(item.journal,'Angew');
  assert.equal(item.date,'2026-09-08');
  assert.equal(item.reviewEvidence.publisherOnlineDate,'2026-09-08');
  assert.equal(item.reviewEvidence.stageBatchId,'2026-09-08_2026-09-14_angew');
  assert.equal(item.reviewEvidence.stageBatchSha,'162e2cc6724fd2e87dd5ca5300bcbdbea06edc37');
  assert.deepEqual(item.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(item.reviewEvidence.natureSynthesisSeparateHighlight,highlight);
  assert.equal(item.reviewEvidence.publisherOfficialFirstPublishedConfirmed,true);
  assert.equal(item.reviewPasses,2);
  assert.deepEqual(item.independentPasses.map(x=>x.decision),['include','include']);
  assert.ok(item.independentPasses[0].reason.length>90);
  assert.ok(item.independentPasses[1].reason.length>80);
  assert.match(item.scopeAssessment.generalityEvidence,/30/);
  assert.match(item.scopeAssessment.boundaryChallenge,/Pt/);
  assert.equal(item.mediaPolicy,'toc_only');
  assert.equal(item.new,false);
  assert.equal(item.addedDate,'');
  assert.equal(item.reviewEvidence.figureFetched,false);
  assert.equal(item.reviewEvidence.pdfFetched,false);
  assert.equal(root.accepted.some(x=>x.doi===highlight),false);
  assert.equal(root.pending.length,2);
});

test('Q3 third ACS batch six individual two-pass syntheses pass real first-online and bibliographic guards',()=>{
  const cases=[
    ['10.1021/jacs.6c05233','2026-07-28','1e3a285d37a0cba1db6fafc15b07af8e3833137f'],
    ['10.1021/jacs.6c09931','2026-08-27','ecd439f952961b18f227a8997d7dac259cf10431'],
    ['10.1021/acscatal.6c03124','2026-07-21','e53414018aac39faa8ff9f6cbae508d8783e963d'],
    ['10.1021/acs.joc.6c01104','2026-07-28','9181de94c2f59b0fb77a470f802a143699524037'],
    ['10.1021/acs.orglett.6c03458','2026-08-30','3eb3448b8f413701aed67f8e3f29d518400d7827'],
    ['10.1021/acs.orglett.6c02691','2026-08-27','3eb3448b8f413701aed67f8e3f29d518400d7827']
  ];
  const names=new Set(),challengers=new Set(),sources=new Set();
  for(const [doi,date,sourceSha] of cases){
    const x=root.accepted.find(x=>x.doi===doi);
    assert.ok(x,'approved missing '+doi);
    assert.equal(x.date,date);
    assert.equal(x.reviewEvidence.publisherOnlineDate,date);
    assert.equal(x.reviewEvidence.stageBatchSha,sourceSha);
    assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
    assert.equal(x.reviewPasses,2);
    assert.deepEqual(x.independentPasses.map(pass=>pass.decision),['include','include']);
    assert.ok(x.independentPasses[0].reason.length>90);
    assert.ok(x.independentPasses[1].reason.length>75);
    assert.ok(x.scopeAssessment.generalityEvidence.length>70);
    assert.equal(x.citation.doi,doi);
    assert.ok(x.authors.length>=2);
    assert.equal(x.ingestionChannel,'historical_backfill');
    assert.equal(x.mediaPolicy,'toc_only');
    assert.equal(x.new,false);
    assert.equal(x.addedDate,'');
    assert.equal(x.reviewEvidence.abstractCopied,false);
    assert.equal(x.reviewEvidence.figureFetched,false);
    assert.equal(x.reviewEvidence.pdfFetched,false);
    assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    names.add(x.titleZh);challengers.add(x.independentPasses[1].reason);
    sources.add(x.reviewEvidence.stageBatchId);
  }
  assert.equal(names.size,6,'independent meaningful translated titles');
  assert.equal(challengers.size,6,'independent adversarial second pass');
  assert.ok(sources.size>=5,'independent immutable publisher/source root receipts');
  const r=root.accepted.find(x=>x.doi==='10.1021/jacs.6c05233');
  assert.match(r.scopeAssessment.primaryContribution,/Josiphos/);
  assert.match(r.challengeReason,/dppe/);
  const t=root.accepted.find(x=>x.doi==='10.1021/jacs.6c09931');
  assert.match(t.scopeAssessment.primaryContribution,/全合成/);
  const s=root.accepted.find(x=>x.doi==='10.1021/acs.orglett.6c02691');
  assert.match(s.challengeReason,/手性亚磺酰胺/);
  assert.equal(root.pending.length,2,'preserve old source-date disputes');
  for(const unresolved of ['10.1021/acs.joc.6c00852','10.1021/acs.orglett.6c02707']){
    assert.equal(root.accepted.some(x=>x.doi===unresolved),false,'ACS conflicting online date must not auto-approve');
  }
});
