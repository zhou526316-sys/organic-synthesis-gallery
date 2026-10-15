import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectPapers, DATA_FILES} from './pages-release-delivery.mjs';
import {correctedPublisherDateForDisplay, publicationDateForDisplay} from '../shared/publisher-date-display-fix.mjs';
import {isExcludedDoi,beijingDate} from '../shared/literature-policy.js';

const source=Object.fromEntries(DATA_FILES.map(name=>[name,readFileSync('public/'+name,'utf8')]));
const papers=collectPapers(source,isExcludedDoi);
const marker=JSON.parse(readFileSync('audit/publication-release-state.json','utf8'));
assert.equal(papers.size,marker.productionCards,'full_catalog_membership_count_changed');
const stamp=beijingDate();
const groups=new Map();
const unverified=[],unknown=[],invalid=[],verified=[];
for(const [doi,row] of papers){
  assert(/^10\.\d{4,9}\/\S+$/.test(doi),'invalid_canonical_doi:'+doi);
  assert(!/\s/.test(doi),'whitespace_or_newline_in_doi:'+doi);
  assert.equal(new URL('https://doi.org/'+doi).pathname.slice(1),doi,'doi_link_mismatch:'+doi);
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
  assert.equal(display.dateUnverified,true,'unconfirmed JOC date silently promoted:'+doi);
  assert.equal(publicationDateForDisplay(display.date,stamp,display.dateUnverified).date,'');
}
const summary={
  ok:true,allPublishedDoisChecked:papers.size,markerCards:marker.productionCards,
  beijingDay:stamp,validIdentifierSet:true,verifiedDisplayDates:verified.length,
  unverifiedDateClaimsSuppressed:unverified.length,missingSourceDates:unknown.length,
  invalidRawDateStrings:invalid,countsByJournal:Object.fromEntries([...groups].sort((a,b)=>a[0].localeCompare(b[0]))),
  note:'This test verifies DOI shape, marker membership, no fake published day for explicit pending dates, and exact publisher-evidenced Nature metadata. It does not claim independent publisher review of all historical first-online dates.'
};
console.log(JSON.stringify(summary,null,2));
if(invalid.length)process.exitCode=1;
