import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectPapers, DATA_FILES} from './pages-release-delivery.mjs';
import {correctedPublisherDateForDisplay, publicationDateForDisplay} from '../shared/publisher-date-display-fix.mjs';
import {isExcludedDoi,beijingDate} from '../shared/literature-policy.js';
import {publisherArticleHref} from '../shared/publisher-article-link.mjs';
import {execFileSync} from 'node:child_process';

const source=Object.fromEntries(DATA_FILES.map(name=>[name,readFileSync('public/'+name,'utf8')]));
const papers=collectPapers(source,isExcludedDoi);
const marker=JSON.parse(readFileSync('audit/publication-release-state.json','utf8'));
assert.equal(papers.size,marker.productionCards,'full_catalog_membership_count_changed');
const expectedProtected=marker.protectedBlobs || {};
assert.equal(Object.keys(expectedProtected).length,8,'expected_eight_protected_publication_sources');
for(const [file,expectedBlob] of Object.entries(expectedProtected)){
  const actualBlob=execFileSync('git',['hash-object','--',file],{encoding:'utf8'}).trim();
  assert.equal(actualBlob,expectedBlob,'unapproved_protected_paper_mutation:'+file);
}

const stamp=beijingDate();
const groups=new Map();
const unverified=[],unknown=[],invalid=[],verified=[];
for(const [doi,row] of papers){
  assert(/^10\.\d{4,9}\/\S+$/.test(doi),'invalid_canonical_doi:'+doi);
  assert(!/\s/.test(doi),'whitespace_or_newline_in_doi:'+doi);
  assert.equal(new URL('https://doi.org/'+doi).pathname.slice(1),doi,'doi_link_mismatch:'+doi);
  const officialHref=publisherArticleHref(doi,row.journal);
  assert(officialHref && /^https:\/\//.test(officialHref),'unresolvable_display_link:'+doi);
  const parsed=new URL(officialHref);
  assert(['doi.org','www.nature.com'].includes(parsed.hostname),'unexpected_publisher_link_host:'+doi);
  if(parsed.hostname==='doi.org')assert.equal(parsed.pathname.slice(1),doi,'publisher_doi_identity_mismatch:'+doi);
  else assert(doi.startsWith('10.1038/'),'non_nature_publisher_link:'+doi);

  const paper=correctedPublisherDateForDisplay(row);
  const visible=publicationDateForDisplay(paper.date,stamp,paper.dateUnverified===true);
  if(paper.dateUnverified===true){
    assert.equal(visible.date,'','unverified_calendar_day_masquerading_as_published:'+doi);
    unverified.push(doi);
  }
  if(visible.date){
    assert.equal(visible.unverified,false,'visible_date_not_evidenced:'+doi);
    assert(visible.date<=stamp,'future_published_date_claim:'+doi);
    verified.push(doi);
  }else if(!paper.date)unknown.push(doi);
  if(paper.date && !/^\d{4}-\d{2}-\d{2}$/.test(paper.date))invalid.push(doi);
  groups.set(paper.journal,(groups.get(paper.journal)||0)+1);
}
const nature=papers.get('10.1038/s41586-026-11242-8');
if(nature){
  assert.equal(nature.title,'Catalytic transfer of carbon atoms enables spirofusion of C–C σ-bonds');
  const resolved=correctedPublisherDateForDisplay(nature);
  assert.equal(resolved.date,'2026-10-14');
  assert.equal(resolved.dateUnverified,false);
  assert.equal(resolved.authors.length,6);
  assert.equal(publicationDateForDisplay(resolved.date,stamp,resolved.dateUnverified).date,'2026-10-14');
}
for(const doi of ['10.1021/acs.joc.6c01792','10.1021/acs.joc.6c01506','10.1021/acs.joc.6c01769','10.1021/acs.joc.6c01159','10.1021/acs.joc.6c01796']){
  const row=papers.get(doi);
  if(!row)continue;
  const display=correctedPublisherDateForDisplay(row);
  assert.equal(display.dateUnverified,false,'ACS publisher-verified JOC date not recognized:'+doi);
  assert.equal(display.date,'2026-10-15');
  assert.equal(publicationDateForDisplay(display.date,stamp,display.dateUnverified).date,'2026-10-15');
}
const rscEvidence=JSON.parse(readFileSync(
  'audit/publisher-date-evidence/2026-10-15-rsc-ten-first-online.json','utf8'));
assert.equal(rscEvidence.records.length,10,'RSC publisher-evidence count changed');
for(const proof of rscEvidence.records){
  const row=papers.get(proof.doi);
  assert(row,'RSC publisher-verified DOI missing from full corpus:'+proof.doi);
  assert.equal(row.title,proof.title,'RSC DOI/title evidence mismatch:'+proof.doi);
  assert.equal(row.journal,proof.journal,'RSC DOI/journal evidence mismatch:'+proof.doi);
  assert.equal(row.addedDate,proof.addedDate,'RSC admission-date evidence mismatch:'+proof.doi);
  const display=correctedPublisherDateForDisplay(row);
  assert.equal(display.date,proof.verifiedFirstOnlineDate,'RSC first-online still missing:'+proof.doi);
  assert.equal(display.dateUnverified,false,'RSC publisher date still provisional:'+proof.doi);
  assert.equal(publicationDateForDisplay(display.date,stamp,display.dateUnverified).date,
    proof.verifiedFirstOnlineDate);
}

const summary={
  ok:true,allPublishedDoisChecked:papers.size,markerCards:marker.productionCards,
  beijingDay:stamp,validIdentifierSet:true,protectedInputBlobsVerified:Object.keys(expectedProtected).length,externalDoiLinksValidated:papers.size,nonProvisionalDateLabels:verified.length,
  unverifiedDateClaimsSuppressed:unverified.length,missingSourceDates:unknown.length,
  invalidRawDateStrings:invalid,countsByJournal:Object.fromEntries([...groups].sort((a,b)=>a[0].localeCompare(b[0]))),
  note:'This test validates DOI shape, marker membership, and publication-day display safety. A date without an unresolved flag is NOT independently publisher-verified by this test. The Nature and five JOC cases have exact official publisher evidence. It does not claim independent publisher review of all historical first-online dates.'
};
console.log(JSON.stringify(summary,null,2));
if(invalid.length)process.exitCode=1;
