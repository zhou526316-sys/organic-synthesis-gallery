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

test('2026-Q3 ACS eight late-evening source-verified synthesis reviews stay DOI-specific and fixed-slot only',()=>{
  const expected=new Map([
    ['10.1021/jacs.6c02262',['2026-07-30','1e3a285d37a0cba1db6fafc15b07af8e3833137f']],
    ['10.1021/acscatal.6c04393',['2026-07-20','e53414018aac39faa8ff9f6cbae508d8783e963d']],
    ['10.1021/acs.orglett.6c02929',['2026-08-27','3eb3448b8f413701aed67f8e3f29d518400d7827']],
    ['10.1021/acs.joc.6c00772',['2026-07-27','9181de94c2f59b0fb77a470f802a143699524037']],
    ['10.1021/jacs.6c08775',['2026-07-27','1e3a285d37a0cba1db6fafc15b07af8e3833137f']],
    ['10.1021/acscatal.6c05226',['2026-08-20','ddeadf49303e5cb9524c42d1f63e28006ed4ce82']],
    ['10.1021/acscatal.6c04677',['2026-08-19','ddeadf49303e5cb9524c42d1f63e28006ed4ce82']],
    ['10.1021/acs.orglett.6c02954',['2026-09-03','80aca4837373541c9ba22bdcae30cd0bd2f64511']]
  ]);
  const titleZh=new Set(),scopeClaims=new Set(),challengeClaims=new Set(),sourceRoots=new Set();
  for(const [doi,[online,sourceSha]] of expected){
    const rec=root.accepted.find(x=>x.doi===doi);
    assert.ok(rec,'missing double-approved original: '+doi);
    assert.equal(rec.date,online,'article online date is not print issue date');
    assert.equal(rec.reviewEvidence.publisherOnlineDate,online);
    assert.equal(rec.reviewEvidence.stageBatchSha,sourceSha);
    assert.deepEqual(rec.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
    assert.match(rec.reviewEvidence.publisherPage,/^https:\/\/pubs\.acs\.org\/doi\/10\.1021\//);
    assert.equal(rec.reviewPasses,2);
    assert.deepEqual(rec.independentPasses.map(p=>p.decision),['include','include']);
    assert.ok(rec.independentPasses[0].reason.length>85);
    assert.ok(rec.independentPasses[1].reason.length>65);
    assert.ok(rec.scopeAssessment.primaryContribution.length>65);
    assert.ok(rec.scopeAssessment.preparativeTransformation.length>55);
    assert.equal(rec.citation.doi,doi);
    assert.ok(rec.authors.length>=2);
    assert.equal(rec.ingestionChannel,'historical_backfill');
    assert.equal(rec.mediaPolicy,'toc_only');
    assert.equal(rec.addedDate,'');
    assert.equal(rec.new,false);
    assert.equal(rec.reviewEvidence.abstractCopied,false);
    assert.equal(rec.reviewEvidence.figureFetched,false);
    assert.equal(rec.reviewEvidence.pdfFetched,false);
    assert.equal(rec.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    titleZh.add(rec.titleZh);scopeClaims.add(rec.scopeAssessment.primaryContribution);
    challengeClaims.add(rec.independentPasses[1].reason);
    sourceRoots.add(rec.reviewEvidence.stageBatchId);
  }
  assert.equal(titleZh.size,8,'titles must be translated separately');
  assert.equal(scopeClaims.size,8,'primary chemical contributions must be independently evaluated');
  assert.equal(challengeClaims.size,8,'second pass must address each article rather than reuse a template');
  assert.ok(sourceRoots.size>=6);
  const enzyme=root.accepted.find(x=>x.doi==='10.1021/jacs.6c08775');
  assert.match(enzyme.scopeAssessment.generalityEvidence,/氨基酸/);
  assert.match(enzyme.scopeAssessment.boundaryChallenge,/蛋白/);
  const sulfenate=root.accepted.find(x=>x.doi==='10.1021/acs.orglett.6c02954');
  assert.match(sulfenate.titleZh,/次磺酸根/);
  assert.doesNotMatch(sulfenate.titleZh,/原位亚磺酸根/);
  assert.equal(root.pending.length,2,'unchanged two prior date disputes remain pending');
  for(const doi of [
    '10.1021/acs.orglett.6c03028',
    '10.1021/acs.joc.6c00852',
    '10.1021/acs.orglett.6c02707'
    // sciadv.aeh8194 is now independently dated by NLM Epub on Aug 12,
    // unlike these ACS DOI, whose first-online dates remain unresolved.
  ])assert.equal(root.accepted.some(x=>x.doi===doi),false,
    'online-first provenance disagreement must not be silently admitted');
});

test('five Chemical Science 2026-Q3 NLM electronic dates, original research and adversarial synthesis scope stay exact',()=>{
  const expected=new Map([
    ['10.1039/d6sc04876e',['2026-07-20','23ac5a9257123c4e7dabb2aba825d51241a02701','42499571','PMC13398419']],
    ['10.1039/d6sc03931f',['2026-09-09','e65d5e91e6207110df14ce67755882749e965abe','42746267','PMC13575756']],
    ['10.1039/d6sc04627d',['2026-07-16','23ac5a9257123c4e7dabb2aba825d51241a02701','42483152','PMC13387387']],
    ['10.1039/d6sc04786f',['2026-08-14','224567f8d5dce6264260ce196db5bad6fe0da63b','42630940','PMC13494953']],
    ['10.1039/d6sc04861g',['2026-08-17','5c83c1766a593fc8fd856e02a941e8f09340b319','42639426','PMC13501473']]
  ]);
  const titles=new Set(),transforms=new Set(),challenges=new Set();
  for(const [doi,[date,blobSha,pmid,pmc]] of expected){
    const x=root.accepted.find(r=>r.doi===doi);
    assert.ok(x,'Q3 NLM-dated original not approved: '+doi);
    assert.equal(x.journal,'Chemical Science');
    assert.equal(x.date,date);
    assert.equal(x.reviewEvidence.publisherOnlineDate,date);
    assert.equal(x.reviewEvidence.stageBatchSha,blobSha);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.journalSuppliedDate,date);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.pubmedUrl,'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/');
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.pmcUrl,'https://pmc.ncbi.nlm.nih.gov/articles/'+pmc+'/');
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.recordCrossrefDate,'unverified_year_only');
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.directPublisherFirstPublishedNotRead,true);
    assert.match(x.reviewEvidence.firstOnlineDateEvidence.tier,/^NLM_journal_supplied_electronic_date/);
    assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref'],'do not fabricate second provenance');
    assert.equal(x.reviewPasses,2);
    assert.deepEqual(x.independentPasses.map(r=>r.decision),['include','include']);
    assert.ok(x.independentPasses.every(r=>r.reason.length>=85));
    assert.ok(x.scopeAssessment.generalityEvidence.length>=65);
    assert.ok(x.scopeAssessment.boundaryChallenge.length>=65);
    assert.equal(x.mediaPolicy,'toc_only');
    assert.equal(x.ingestionChannel,'historical_backfill');
    assert.equal(x.addedDate,'');
    assert.equal(x.new,false);
    assert.equal(x.reviewEvidence.abstractCopied,false);
    assert.equal(x.reviewEvidence.figureFetched,false);
    assert.equal(x.reviewEvidence.pdfFetched,false);
    assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    titles.add(x.titleZh);
    transforms.add(x.scopeAssessment.preparativeTransformation);
    challenges.add(x.independentPasses[1].reason);
  }
  assert.equal(titles.size,5,'separate real translation for all articles');
  assert.equal(transforms.size,5,'not a generic synthetic scope template');
  assert.equal(challenges.size,5,'distinct adversarial academic second pass');
  const ang=root.accepted.find(x=>x.doi==='10.1039/d6sc04876e');
  assert.match(ang.scopeAssessment.boundaryChallenge,/16/);
  assert.match(ang.scopeAssessment.preparativeTransformation,/Ru/);
  const adam=root.accepted.find(x=>x.doi==='10.1039/d6sc04786f');
  assert.match(adam.scopeAssessment.boundaryChallenge,/砌块/);
  assert.match(adam.scopeAssessment.preparativeTransformation,/LMCT/);
  const carborane=root.accepted.find(x=>x.doi==='10.1039/d6sc04861g');
  assert.match(carborane.scopeAssessment.boundaryChallenge,/器件/);
  assert.match(carborane.scopeAssessment.generalityEvidence,/Zn/);
  assert.equal(root.pending.length,2,'prior ACS date conflicts not automatically resolved');
});

test('Science Advances paper Epub or ArticleDate prevails over distinct issue publication date without suppressing synthesis admission',()=>{
  const expected=new Map([
    ['10.1126/sciadv.aeh8194',['2026-08-12','2026-08-14','b3333a0b72bdf78820f68bfeeb3c273029f9524a']],
    ['10.1126/sciadv.aeg0999',['2026-07-17','2026-07-17','022c24c12dfb71cfe3703352b13822e90ea2f2f5']],
    ['10.1126/sciadv.aeh2073',['2026-07-23','2026-07-24','d871cc041a63ae8b1724ed8c6115de79616d1fac']]
  ]);
  const scope=new Set(),challenge=new Set(),zhtitles=new Set();
  for(const [doi,[online,issueDate,sha]] of expected){
    const x=root.accepted.find(r=>r.doi===doi);
    assert.ok(x,'DOI not passed scientific review: '+doi);
    assert.equal(x.journal,'Science Advances');
    assert.equal(x.date,online,'use Epub/ArticleDate, never unverified Crossref issue date');
    assert.equal(x.reviewEvidence.publisherOnlineDate,online);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.sourcePublicationDate,issueDate);
    assert.equal(x.reviewEvidence.firstOnlineDateEvidence.journalSuppliedElectronicDate,online);
    assert.equal(x.reviewEvidence.stageBatchSha,sha);
    assert.match(x.reviewEvidence.publisherPage,/^https:\/\/www\.science\.org\/doi\/10\.1126\/sciadv\./);
    assert.match(x.reviewEvidence.firstOnlineDateEvidence.pubmedUrl,/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
    assert.equal(x.reviewEvidence.publisherLiveArticlePageRead,false);
    assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
    assert.equal(x.reviewPasses,2);
    assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
    assert.ok(x.independentPasses.every(p=>p.reason.length>85));
    assert.ok(x.scopeAssessment.generalityEvidence.length>65);
    assert.ok(x.scopeAssessment.boundaryChallenge.length>65);
    assert.equal(x.mediaPolicy,'toc_only');
    assert.equal(x.new,false);assert.equal(x.addedDate,'');
    assert.equal(x.reviewEvidence.pdfFetched,false);
    assert.equal(x.reviewEvidence.figureFetched,false);
    assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
    scope.add(x.scopeAssessment.primaryContribution);
    challenge.add(x.independentPasses[1].reason);
    zhtitles.add(x.titleZh);
  }
  assert.equal(scope.size,3);
  assert.equal(challenge.size,3);
  assert.equal(zhtitles.size,3);
  assert.equal(root.pending.length,2);
  const heck=root.accepted.find(x=>x.doi==='10.1126/sciadv.aeh8194');
  assert.match(heck.scopeAssessment.preparativeTransformation,/β-H/);
  const nhc=root.accepted.find(x=>x.doi==='10.1126/sciadv.aeg0999');
  assert.match(nhc.scopeAssessment.generalityEvidence,/70/);
  const telenzepine=root.accepted.find(x=>x.doi==='10.1126/sciadv.aeh2073');
  assert.match(telenzepine.scopeAssessment.generalityEvidence,/全合成/);
  assert.match(telenzepine.scopeAssessment.boundaryChallenge,/固有手性/);
  assert.equal(root.accepted.filter(x=>expected.has(x.doi)).length,3);
});

test('Q3 additional six ACS syntheses have publisher first-online and paper-specific two-pass evidence',()=>{
 const cases=[
  ['10.1021/acs.orglett.6c03383','2026-09-07','80aca4837373541c9ba22bdcae30cd0bd2f64511'],
  ['10.1021/acs.joc.6c01571','2026-08-24','30ad0c3b51b48a210e90d8fe19b56412b1c94f7a'],
  ['10.1021/acs.orglett.6c02567','2026-07-29','67f6960bccfa31a1d2477390309426061dc65563'],
  ['10.1021/acs.joc.6c01578','2026-08-26','30ad0c3b51b48a210e90d8fe19b56412b1c94f7a'],
  ['10.1021/acscatal.6c03374','2026-07-16','e53414018aac39faa8ff9f6cbae508d8783e963d'],
  ['10.1021/acs.orglett.6c02816','2026-09-02','80aca4837373541c9ba22bdcae30cd0bd2f64511']
 ];
 const synth=new Set(),challenges=new Set(),names=new Set();
 for(const [doi,date,blob] of cases){
  const x=root.accepted.find(v=>v.doi===doi);
  assert.ok(x,'source-verified DOI missing '+doi);
  assert.equal(x.date,date);
  assert.equal(x.reviewEvidence.publisherOnlineDate,date);
  assert.equal(x.reviewEvidence.stageBatchSha,blob);
  assert.equal(x.reviewPasses,2);
  assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
  assert.ok(x.independentPasses[0].reason.length>90);
  assert.ok(x.independentPasses[1].reason.length>70);
  assert.equal(x.reviewEvidence.publisherPage,'https://pubs.acs.org/doi/'+doi);
  assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(x.mediaPolicy,'toc_only');
  assert.equal(x.new,false);assert.equal(x.addedDate,'');
  assert.equal(x.reviewEvidence.figureFetched,false);assert.equal(x.reviewEvidence.pdfFetched,false);
  assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  assert.ok(/JOC|Organic Letters|ACS Catalysis/.test(x.journal));
  assert.ok(x.titleZh.length>8);
  names.add(x.titleZh);
  synth.add(x.scopeAssessment.preparativeTransformation);
  challenges.add(x.independentPasses[1].reason);
 }
 assert.equal(synth.size,cases.length);
 assert.equal(challenges.size,cases.length);
 assert.equal(names.size,cases.length);
 const total=root.accepted.find(x=>x.doi==='10.1021/acs.orglett.6c03383');
 assert.match(total.scopeAssessment.generalityEvidence,/形式全合成/);
 const quinoline=root.accepted.find(x=>x.doi==='10.1021/acs.joc.6c01578');
 assert.match(quinoline.scopeAssessment.generalityEvidence,/2-苯基/);
 const rhodium=root.accepted.find(x=>x.doi==='10.1021/acscatal.6c03374');
 assert.match(rhodium.scopeAssessment.generalityEvidence,/397/);
 assert.equal(root.pending.length,2,'prior manifest date disputes preserved');
});
test('new publisher-vs-publisher online day contradiction is explicitly held, not guessed',()=>{
 const file='audit/historical-reviewed/2026-10-13-q3-orglett-6c03028-date-conflict-hold.json';
 const q=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(q.doi,'10.1021/acs.orglett.6c03028');
 assert.equal(q.status,'pending_exact_first_online_date_not_approved');
 assert.equal(q.source.sourceCandidateDate,'2026-07-30');
 assert.equal(q.source.gitBlobSha,'67f6960bccfa31a1d2477390309426061dc65563');
 assert.deepEqual(new Set(q.publisherConflictingClaims.map(x=>x.publishedOnline)),
  new Set(['2026-07-30','2026-07-31']));
 assert.ok(q.publisherConflictingClaims.every(x=>x.url.startsWith('https://pubs.acs.org/')));
 assert.equal(q.notInApprovedAdmissions,true);
 assert.equal(root.accepted.some(x=>x.doi===q.doi),false);
 assert.equal(root.pending.some(x=>x.doi===q.doi),false,'held evidence remains unresolved outside the two existing authoritative pending records');
});


test('eight new Q3 ACS syntheses have independently dated, full DOI, bibliography and challenged preparative evidence',()=>{
 const cases=[
  ['10.1021/jacs.6c06565','2026-07-08','61e868f071a0bcb14496af0828937e0ab903f134'],
  ['10.1021/jacs.6c08998','2026-08-12','8c61c23c75f16b59480d3381d78ca036ea3e6cf5'],
  ['10.1021/jacs.6c10775','2026-08-08','8c61c23c75f16b59480d3381d78ca036ea3e6cf5'],
  ['10.1021/acs.orglett.6c02441','2026-07-27','67f6960bccfa31a1d2477390309426061dc65563'],
  ['10.1021/acs.orglett.6c03102','2026-09-01','80aca4837373541c9ba22bdcae30cd0bd2f64511'],
  ['10.1021/acs.joc.6c01369','2026-08-20','3d4d816718e709f3b0a87a056039c32689cba701'],
  ['10.1021/acs.joc.6c01375','2026-08-18','3d4d816718e709f3b0a87a056039c32689cba701'],
  ['10.1021/acscatal.6c04411','2026-08-03','8170ee7aca54bb199f18c0d0e91bfff4527e0874']
 ];
 const firstReasons=new Set(),secondReasons=new Set(),challenges=new Set();
 for(const [doi,date,blob] of cases){
  const matched=root.accepted.filter(x=>x.doi===doi);
  assert.equal(matched.length,1,'one approved identity per DOI: '+doi);
  const x=matched[0];
  assert.equal(x.date,date);
  assert.equal(x.reviewEvidence.publisherOnlineDate,date);
  assert.equal(x.reviewEvidence.stageBatchSha,blob);
  assert.equal(x.reviewEvidence.publisherPage,'https://pubs.acs.org/doi/'+doi);
  assert.deepEqual(x.reviewEvidence.crossrefOpenalexSources,['crossref','openalex']);
  assert.equal(x.reviewPasses,2);
  assert.deepEqual(x.independentPasses.map(p=>p.decision),['include','include']);
  assert.ok(x.independentPasses[0].reason.length>100);
  assert.ok(x.independentPasses[1].reason.length>75);
  assert.equal(x.addedDate,'');
  assert.equal(x.new,false);
  assert.equal(x.ingestionChannel,'historical_backfill');
  assert.equal(x.mediaPolicy,'toc_only');
  assert.equal(x.reviewEvidence.abstractCopied,false);
  assert.equal(x.reviewEvidence.figureFetched,false);
  assert.equal(x.reviewEvidence.pdfFetched,false);
  assert.equal(x.publisherAbstractRights,'not_verified_do_not_republish_full_text');
  assert.ok(x.titleZh.length>8);
  assert.ok(x.authors.length>=2);
  assert.ok(Number(x.citation.volume)>0&&Number(x.citation.issue)>0);
  assert.ok(/^\d+-\d+$/.test(x.citation.pages));
  assert.ok(x.scopeAssessment.primaryContribution.length>45);
  assert.ok(x.scopeAssessment.preparativeTransformation.length>40);
  assert.ok(x.scopeAssessment.generalityEvidence.length>40);
  assert.ok(x.scopeAssessment.sourceEvidence.includes(blob));
  assert.ok(x.scopeAssessment.boundaryChallenge.length>40);
  firstReasons.add(x.independentPasses[0].reason);
  secondReasons.add(x.independentPasses[1].reason);
  challenges.add(x.scopeAssessment.boundaryChallenge);
 }
 assert.equal(firstReasons.size,8);assert.equal(secondReasons.size,8);assert.equal(challenges.size,8);
 assert.match(root.accepted.find(x=>x.doi==='10.1021/jacs.6c10775').scopeAssessment.boundaryChallenge,/终产物/);
 assert.match(root.accepted.find(x=>x.doi==='10.1021/jacs.6c08998').challengeReason,/DFT/);
 assert.match(root.accepted.find(x=>x.doi==='10.1021/acscatal.6c04411').challengeReason,/98%/);
 assert.equal(root.pending.length,2,'only earlier manifest date conflicts remain pending');
 const dateHold='10.1021/acs.orglett.6c03028';
 assert.ok(!root.accepted.some(x=>x.doi===dateHold),'conflicting publisher online days must remain held');
});
