/**
 * Publisher issue Research receipt verifier. Read-only local JSON; no publisher
 * scraping, D1 access, media writes, semantic admission or formal publication.
 * An issue's cover month never substitutes for its individual Article date.
 */
import {readFileSync} from 'node:fs';
export const PUBLISHER_ISSUE_SCHEMA='gallery-publisher-research-issue-receipts-v1';
const expectedQuarter=/^2026-(07|08|09)-\d{2}$/;
const parseDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(d.getTime())&&d.toISOString().startsWith(value);
};
function ensure(x,message){if(!x)throw Error('historical_publisher_issue_receipt_'+message);}
export function verifyResearchIssueReceipt(receipt){
  ensure(receipt?.schemaVersion===PUBLISHER_ISSUE_SCHEMA,'schema');
  ensure(receipt.mode==='publisher_research_toc_DOI_and_date_evidence_not_academic_admission'
    &&receipt.journal==='Nature Synthesis'&&receipt.issn==='2731-0582'
    &&receipt.periodInvestigated==='2026-07-01..2026-09-30'
    &&receipt.sourceTier==='official_nature_issues_TOClinks_and_article_date_labels','authority');
  const g=receipt.guards||{};
  ensure(g.noCloudflareD1&&g.noMediaOrPdfWrites&&g.notPublicationAuthority
    &&g.noAutoScopeDecision&&g.noQ3CompleteClaim,'release_guards');
  ensure(Array.isArray(receipt.issues)&&receipt.issues.length===2,'issue_count');
  const ids=new Set();
  let q3=0,preQ3=0,matched=0,formalMissing=0,total=0;
  for(const issue of receipt.issues){
    const month=issue.issue.slice(5);
    ensure(/^2026-(09|10)$/.test(issue.issue)
      &&issue.url==='https://www.nature.com/natsynth/volumes/5/issues/'+Number(month)
      &&issue.articleDateSemantics==='publisher_issue_article_list_published_label_not_issue_month'
      &&Array.isArray(issue.allResearchRows)
      &&issue.officialIssueResearchCount===issue.allResearchRows.length
      &&issue.allResearchRows.length===13
      &&issue.enumerationMethod.includes('Research'),'issue_receipt:'+issue.issue);
    for(const [i,row] of issue.allResearchRows.entries()){
      const doi=row.doi?.toLowerCase()||'';
      ensure(row.order===i+1
        &&/^10\.1038\/s44160-026-[a-z0-9-]+$/.test(doi)
        &&!ids.has(doi)
        &&row.articleUrl==='https://www.nature.com/articles/'+doi.split('/')[1]
        &&row.publisherArticleType==='Article'
        &&row.issueDateNotFirstOnline===true
        &&parseDate(row.publisherIssueListedPublishedDate),'doi_or_date:'+doi);
      ids.add(doi);
      const date=row.publisherIssueListedPublishedDate;
      const isQ3=expectedQuarter.test(date);
      ensure(row.discoveryQuarter===(isQ3?'2026-Q3':'2026-Q2')
        &&date>='2026-04-01'&&date<='2026-09-30','quarter_classification:'+doi);
      if(isQ3)q3++;else preQ3++;
      if(row.catalogAtAudit?.present){
        matched++;
        ensure(row.catalogAtAudit.storedDate===date,'catalog_date_mismatch:'+doi);
      } else {
        formalMissing++;
        ensure(row.catalogAtAudit?.storedDate===null,'catalog_missing_date_wrong:'+doi);
      }
      if(row.individualArticleFirstOnlinePageVerified)
        ensure(doi==='10.1038/s44160-026-01096-3'&&date==='2026-07-02'
          &&row.catalogAtAudit?.present===true,'individual_date_evidence_mismatch:'+doi);
      total++;
    }
  }
  ensure(total===26&&q3===1&&preQ3===25&&matched===1&&formalMissing===25,'partition');
  const counters=receipt.counters||{};
  ensure(counters.issuesChecked===2&&counters.publisherResearchItems===total
    &&counters.Q3OnlineBasedOnPublisherIssueDate===q3
    &&counters.preQ3OnlineBasedOnPublisherIssueDate===preQ3
    &&counters.Q3MemberAlreadyFormal===1
    &&counters.Q3MemberNotFormal===0
    &&counters.issueResearchTOCDoiDuplicates===0,'counters');
  return {issues:2,totalResearch:total,Q3Online:q3,preQ3Online:preQ3,
    q3FormalPresent:1,observedIssueResearchDOIs:ids.size,
    publisherIssueScopeComplete:true,fullQ3PeriodComplete:false,
    perArticleDatesFullyIndependentlyVerified:false};
}
export function verifyCatalysisIssueResearchReceipt(packet){
  ensure(packet?.schemaVersion==='gallery-publisher-research-issue-receipt-v1'
    &&packet.journal==='Nature Catalysis'&&packet.issn==='2520-1158'
    &&packet.journalVolume===9&&packet.journalIssue===9
    &&packet.issueMonth==='2026-09'
    &&packet.issueUrl==='https://www.nature.com/natcatal/volumes/9/issues/9'
    &&packet.sectionName==='Research'
    &&packet.sourceTier==='official_Nature_Catalysis_complete_Research_issue_TOChref_and_Published_labels',
    'natcatal_authority');
  const snapshot=packet.formalSnapshot,academic=packet.historicalAcademicSnapshot;
  ensure(snapshot?.source==='public/toc-demand-live.json'
    &&/^[a-f0-9]{40}$/.test(snapshot.sha||'')
    &&snapshot.dois===1087&&snapshot.mode==='GitHub_main_frozen_read_only_no_D1'
    &&academic?.source==='audit/historical-reviewed/approved-admissions.json'
    &&/^[a-f0-9]{40}$/.test(academic.sha||'')
    &&academic.include===101&&academic.pending===2,
    'natcatal_current_snapshot');
  const g=packet.guards||{};
  ensure(g.notGlobalQuarterPublisherComplete&&g.notPublicationAuthority
    &&g.neverTreatIssueMonthAsDate&&g.doNotAutoApproveOrExcludeFromIssue
    &&g.doNotAlterMainLiterature&&g.zeroProductionD1
    &&g.noMediaPdfBodySiAcquisition&&g.noNewTodayHotWechat,
    'natcatal_release_guards');
  ensure(Array.isArray(packet.articles)&&packet.articles.length===10
    &&packet.officialResearchEntryCount===10,'natcatal_Research_size');
  const ids=new Set();let listedQ3=0,formal=0,absent=0,priorApproved=0;
  for(const [i,row] of packet.articles.entries()){
    const doi=String(row?.doi||'').toLowerCase();
    ensure(/^10\.1038\/s41929-026-\d{5}-[0-9a-z]$/.test(doi)
      &&doi===row.doi&&!ids.has(doi)
      &&row.issueResearchOrder===i+1
      &&row.publisherArticleType==='Article'
      &&row.publisherArticleUrl==='https://www.nature.com/articles/'+doi.split('/')[1]
      &&row.academicScopeDecision==='not_made_by_issue_enumeration'
      &&row.flags?.yearMonthOfIssueMustNotReplaceArticleDate===true
      &&row.flags?.noMediaOrPdfFetch===true
      &&typeof row.title==='string'&&row.title.length>=22,
      'natcatal_DOI_or_Article:'+doi);
    ids.add(doi);
    const date=row.publisherIssueListedDate;
    ensure(parseDate(date)&&/^2026-(07|08|09)-\d\d$/.test(date),
      'natcatal_date_not_Q3:'+doi);
    listedQ3++;
    if(row.formalCatalogReadback?.present===true){
      formal++;
      ensure(row.formalCatalogReadback.storedDate===date,
        'natcatal_formal_date_mismatch:'+doi);
    }else{
      absent++;
      ensure(row.formalCatalogReadback?.present===false
        &&row.formalCatalogReadback?.storedDate===null,
        'natcatal_absent_not_verified:'+doi);
    }
    if(row.historicalAcademicManifest?.acceptedPreviously===true)priorApproved++;
    else ensure(row.historicalAcademicManifest?.acceptedPreviously===false,
      'natcatal_accepted_status_unknown:'+doi);
  }
  const c=packet.counters||{};
  ensure(listedQ3===10&&formal===3&&absent===7&&priorApproved===0
    &&c.publisherResearchArticles===10&&c.articleDatesQ3===listedQ3
    &&c.alreadyFormal===formal&&c.notFormal===absent
    &&c.previouslyHistoricallyApproved===0
    &&c.scopeEligibleAmongNotFormal==='unknown_requires_article_by_article_review',
    'natcatal_counts');
  return {originalResearch:10,Q3IssueListed:10,formal3:3,
    missingFormal7:7,academicEligibleAmongUnpublished:'unknown',
    fullQuarterPublisherComplete:false};
}

export function verifySavedReceipt(path='audit/historical-publisher-issues/2026/nature-synthesis-issues-09-10-research.json'){
  const packet=JSON.parse(readFileSync(path,'utf8'));
  return verifyResearchIssueReceipt(packet);
}
if(process.argv[1]?.endsWith('verify-historical-publisher-issues.mjs')){
  console.log('PUBLISHER_ISSUE_RECEIPT '+JSON.stringify(verifySavedReceipt()));
}
