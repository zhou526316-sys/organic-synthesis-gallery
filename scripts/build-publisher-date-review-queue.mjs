import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {collectPapers,DATA_FILES} from './pages-release-delivery.mjs';
import {isExcludedDoi,beijingDate} from '../shared/literature-policy.js';
import {correctedPublisherDateForDisplay,publicationDateForDisplay} from '../shared/publisher-date-display-fix.mjs';

const sameDay = value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
export function publisherDateReviewQueue(papers,marker,asOfBeijingDay) {
  if(!Array.isArray(papers)||!Number.isSafeInteger(marker?.productionCards))
    throw new Error('publisher_date_audit_invalid_inputs');
  if(papers.length!==marker.productionCards)
    throw new Error('publisher_date_audit_catalog_cardinality_mismatch');
  const seen=new Set(),missing=[],verified=[];
  for(const raw of papers){
    const doi=String(raw?.doi||'').trim().toLowerCase();
    if(!/^10\.\d{4,9}\/\S+$/.test(doi)||seen.has(doi))
      throw new Error('publisher_date_audit_invalid_doi:'+doi);
    seen.add(doi);
    const paper=correctedPublisherDateForDisplay(raw);
    const dateClaim=publicationDateForDisplay(paper.date,asOfBeijingDay,paper.dateUnverified===true);
    if(dateClaim.date) {
      verified.push(doi);
      continue;
    }
    missing.push({
      doi,journal:String(paper.journal||''),title:String(paper.title||''),
      addedDate:paper.addedDate||null,
      proposedFirstOnlineDate:sameDay(paper.date)?paper.date:null,
      crossrefCreatedDate:sameDay(paper.createdDate)?paper.createdDate:null,
      dateEvidenceStatus:dateClaim.reason,
      status:'publisher_first_online_evidence_needed',
      sourceDataIsImmutable:true,
      nextAction:'Visit and verify the DOI-matched official publisher article page or issue table; capture first-online day and author evidence. Do not substitute Crossref created/deposited dates or a mere elapsed calendar day.',
    });
  }
  missing.sort((a,b)=>a.doi.localeCompare(b.doi));
  return {
    schemaVersion:1,
    asOfBeijingDay,
    sourcePublicationSlot:marker.publicationSlot||marker.lastFixedPublicationSlot||null,
    catalogCount:papers.length,
    dateLabelsNotMarkedProvisional:verified.length,
    unresolvedPublisherFirstOnlineDates:missing.length,
    issues:missing,
    note:'Automated DOI-identity-wide date-verification queue. Existing dates without an unresolved flag are counted only as non-provisional labels, not individually publisher-verified dates. Actual publisher-first-online evidence is required to close a provisional row. This file does not authorize new admissions or mutate protected 08:00 inputs.'
  };
}
export function generatePublisherDateReviewQueue(root=process.cwd(),date=beijingDate()){
 const json=file=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
 const marker=json('audit/publication-release-state.json');
 const files=Object.fromEntries(DATA_FILES.map(name=>[name,readFileSync(path.join(root,'public',name),'utf8')]));
 const source=collectPapers(files,isExcludedDoi);
 const data=publisherDateReviewQueue([...source.values()],marker,date);
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 data.sourceMarkerBlobSha=git('rev-parse','HEAD:audit/publication-release-state.json');
 return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const target=process.argv[2]||'audit/publisher-date-evidence/pending-latest.json';
 const result=generatePublisherDateReviewQueue();
 mkdirSync(path.dirname(target),{recursive:true});
 writeFileSync(target,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({ok:true,output:target,cards:result.catalogCount,
   dateLabelsNotMarkedProvisional:result.dateLabelsNotMarkedProvisional,unverified:result.unresolvedPublisherFirstOnlineDates,
   byJournal:Object.fromEntries([...new Set(result.issues.map(x=>x.journal))].sort().map(j=>[j,result.issues.filter(x=>x.journal===j).length]))}));
}
