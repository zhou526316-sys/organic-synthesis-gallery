/** Bounded, read-only Nature Synthesis July/August 2026 publisher Research receipt verifier.
 * An issue's July/August cover date does not imply July/August first publication.
 * This receipt only verifies issue TOC's per-Article Published labels; independent
 * article-level First published dates remain explicitly unverified.
 */
import {readFileSync} from 'node:fs';
const schema='gallery-publisher-research-issue-receipts-v1';
const validDate=s=>{if(!/^2026-\d{2}-\d{2}$/.test(s||''))return false;
 const d=new Date(s+'T00:00:00.000Z');return !Number.isNaN(d.getTime())&&d.toISOString().startsWith(s);};
const ensure=(v,msg)=>{if(!v)throw Error('publisher_early_issue_'+msg)};
export function verifyEarlyNatsynthIssueReceipt(data){
  ensure(data?.schemaVersion===schema&&data.journal==='Nature Synthesis','schema');
  ensure(data.scope==='official_Nature_Synthesis_publisher_issue_Research_TOC_date_parity_NOT_academic_admission','scope');
  ensure(data.guards?.dateNotCoverMonth&&data.guards?.independentArticleFirstPublishedNotVerified&&
    data.guards?.noQ3FullPeriodClaim&&data.guards?.noScopeAutoApproval&&
    data.guards?.noProductionD1&&data.guards?.noMediaPdfCapture&&data.guards?.noFormalAdmission,'guards');
  ensure(Array.isArray(data.issues)&&data.issues.length===2,'issues');
  const snap=data.formalCatalogSnapshot,approvedSnap=data.historicalManifestSnapshot;
  ensure(snap?.source==='public/toc-demand-live.json'&&/^[a-f0-9]{40}$/.test(snap.sha||'')
    &&snap.total===1091&&snap.readMode==='github_main_read_only_no_production_D1'
    &&approvedSnap?.source==='audit/historical-reviewed/approved-admissions.json'
    &&/^[a-f0-9]{40}$/.test(approvedSnap.sha||'')
    &&approvedSnap.acceptedTotal===101&&approvedSnap.pendingTotal===2,
    'current_readback_snapshot');
  const expectedFormal=['10.1038/s44160-026-01023-6','10.1038/s44160-026-01036-1'];
  const unique=new Set(),actualFormal=[];let n=0,approvedCount=0;
  for(const [j,issue] of data.issues.entries()){
    const mon=String(j+7).padStart(2,'0');
    ensure(issue.issue==='2026-'+mon&&issue.issueCoverMonth===mon
      &&issue.issueUrl==='https://www.nature.com/natsynth/volumes/5/issues/'+(j+7)
      &&issue.sourceStatus==='official_issue_Research_TOC_read'
      &&issue.tocArticleDatesNotIndependentArticleHistory===true
      &&issue.publisherResearchRows===13&&issue.articleRows?.length===13,'issue_'+mon);
    for(const [i,row] of issue.articleRows.entries()){
      const doi=row.doi?.toLowerCase()||'';
      ensure(row.order===i+1&&/^10\.1038\/s44160-026-[0-9a-z-]+$/.test(doi)
        &&!unique.has(doi)&&row.articleUrl==='https://www.nature.com/articles/'+doi.split('/')[1]
        &&row.publisherArticleType==='Article'
        &&validDate(row.issueTocArticlePublishedDate)
        &&row.issueTocArticlePublishedDate<'2026-07-01'
        &&row.issueTocArticlePublishedDate>='2026-02-01'
        &&row.sourcePrecision==='publisher_issue_research_row_published_label'
        &&row.independentArticleLandingFirstOnlineVerified===false
        &&row.quarterFromPublisherIssueArticleDate==='2026-Q2_or_earlier'
        &&row.issueCoverMonthNotOnlineDate===true,'doi_date_'+doi);
      const shouldBeFormal=expectedFormal.includes(doi);
      ensure(row.formalCatalogReadback?.present===shouldBeFormal
        &&row.formalCatalogReadback?.storedDate===(shouldBeFormal?row.issueTocArticlePublishedDate:null)
        &&row.historicalAcademicManifestReadback?.approved===shouldBeFormal,
        'current_catalog_membership:'+doi);
      if(shouldBeFormal){actualFormal.push(doi);approvedCount++;}
      unique.add(doi);n++;
    }
  }
  ensure(n===26&&unique.size===26
    &&data.counters?.issuesChecked===2
    &&data.counters.ResearchDOIs===26
    &&data.counters.Q3BasedOnTOCArticlePublishedDates===0
    &&data.counters.preQ3BasedOnTOCArticleDates===26
    &&data.counters.formalDOIsOfTheseResearchRows===actualFormal.length
    &&actualFormal.length===2&&approvedCount===2
    &&data.counters.historicallyApprovedOfTheseResearchRows===approvedCount
    &&JSON.stringify([...(data.counters.exactFormalDOIs||[])].sort())===JSON.stringify(expectedFormal)
    &&data.counters.distinctDOIs===26,'counters');
  return {source:'Nature Synthesis',issues:2,ResearchDOIs:26,Q3FromIssuePublishedLabels:0,
    allPreJuly2026ByIssuePublishedLabels:true,formalCatalogMemberResearchDOIs:actualFormal.length,
    individualLandingDatesIndependentlyVerified:false,
    publisherQ3CompletenessEstablished:false};
}
export function verifySavedEarlyNatsynthReceipt(path='audit/historical-publisher-issues/2026/nature-synthesis-issues-07-08-research.json'){
 return verifyEarlyNatsynthIssueReceipt(JSON.parse(readFileSync(path,'utf8')));
}
if(process.argv[1]?.endsWith('verify-historical-publisher-early-issues.mjs'))
 console.log('EARLY_NATSYNTH_ISSUE '+JSON.stringify(verifySavedEarlyNatsynthReceipt()));
