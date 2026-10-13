import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePublisherIssueResearch,ISSUE_SCHEMA} from './historical-publisher-issue-audit.mjs';
const evidence={
  schemaVersion:ISSUE_SCHEMA,mode:'publisher_issue_review_source_only',
  publisherSection:'Research',journal:'Nature Synthesis',
  publisherIssuePage:'https://www.nature.com/natsynth/volumes/5/issues/8',
  publisherIssue:{volume:'5',issue:'8',displayMonth:'2026-08'},
  issuePublisherResearchTitlesCaptured:true,publisherHtmlCryptographicSnapshotAvailable:false,
  articleCountOnPublisherPage:2,
  sourceSnapshots:[{path:'audit/historical-staging/batches/2026-03-01_2026-03-31_nature-synthesis.json',
    gitBlobSha:'a'.repeat(40)}],
  researchArticles:[
    {doi:'10.1038/example-a',title:'Pyridine aryl transposition',firstOnlineDate:'2026-03-04',
      sourceBatchId:'2026-03-01_2026-03-31_nature-synthesis',sourceBatchSha:'a'.repeat(40)},
    {doi:'10.1038/example-b',title:'Electrochemical C–N coupling',firstOnlineDate:'2026-03-19',
      sourceBatchId:'2026-03-01_2026-03-31_nature-synthesis',sourceBatchSha:'a'.repeat(40)}
  ],
  excludedOtherIssueContent:[{doi:'10.1038/example-c',publisherSection:'Amendments & Corrections'}],
  policy:{productionChanges:false,noAutomaticScopeInclusion:true,noRawAbstractBodyImagesOrPdfCopied:true}
};
const source={recordType:'historical_discovery_candidate_only',
  status:'source_enumeration_complete',consistency:{complete:true},
  journal:'Nature Synthesis',candidateCount:3,records:[
    {doi:'10.1038/example-a',title:'Pyridine aryl transposition',date:'2026-03-04',citation:{volume:'5',issue:'8'}},
    {doi:'10.1038/example-b',title:'Electrochemical C–N coupling',date:'2026-03-19',citation:{volume:'5',issue:'8'}},
    {doi:'10.1038/example-c',title:'Publisher Correction',date:'2026-04-02',citation:{volume:'5',issue:'8'}}
  ]};
test('issue August is reconciled against spring first-online publication dates, not issue month',()=>{
  const r=reconcilePublisherIssueResearch(evidence,[source]);
  assert.equal(r.publisherResearchCount,2);
  assert.equal(r.publisherNonResearchStageRows,1);
  assert.equal(r.onlineDatesOutsideIssueMonth,2);
  assert.equal(r.allPublisherSectionsAudited,false);
});
test('source loss and wrong DOI identity must remain an explicit coverage gap',()=>{
  const changed={...source,records:source.records.slice(1),candidateCount:2};
  assert.throws(()=>reconcilePublisherIssueResearch(evidence,[changed]),/coverage_not_closed/);
  const bad={...evidence,researchArticles:evidence.researchArticles.map(x=>({...x}))};
  bad.researchArticles[0].firstOnlineDate='2026-08-01';
  assert.throws(()=>reconcilePublisherIssueResearch(bad,[source]),/identity_or_online_date_mismatch/);
});
test('a research paper must never be silently classified as correction',()=>{
  const bad={...evidence,excludedOtherIssueContent:[
    ...evidence.excludedOtherIssueContent,{doi:'10.1038/example-b',publisherSection:'Research Briefings'}]};
  assert.throws(()=>reconcilePublisherIssueResearch(bad,[source]),/unverified_issue_nonresearch_exclusion/);
});
test('unlisted stage issue research is a detectable discrepancy',()=>{
  const more={...source,records:[...source.records,
    {doi:'10.1038/example-d',title:'New synthesis',date:'2026-04-01',citation:{volume:'5',issue:'8'}}],
    candidateCount:4};
  assert.throws(()=>reconcilePublisherIssueResearch(evidence,[more]),/coverage_not_closed/);
});
