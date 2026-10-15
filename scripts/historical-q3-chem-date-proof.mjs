/**
 * Validate a bounded DOI-exact Chem publisher first-online correction ledger.
 * Source shards are immutable; the first day of a print issue is NOT verified
 * as online-first, and a publisher date outside Q3 does not mean scope exclude.
 */
export const CHEM_DATE_SCHEMA='gallery-q3-chem-online-first-date-disagreement-v1';
const fail=(ok,msg)=>{if(!ok)throw Error(msg)};
const sha40=v=>/^[a-f0-9]{40}$/.test(v||'');
const sha64=v=>/^[a-f0-9]{64}$/.test(v||'');
const date=v=>/^2026-\d\d-\d\d$/.test(v||'')&&Number.isFinite(Date.parse(v+'T00:00:00Z'));
export function bindChemQ3DateAudit({audit,sourceByDoi,sourceGitBlobByRoot,acceptedManifest}={}){
  if(!audit)return {provisional:new Set(),officialDate:new Map(),officialOutsideQ3:new Set(),
    officialWithinQ3:new Set(),sourceConflict:new Set(),summary:null};
  fail(audit.schemaVersion===CHEM_DATE_SCHEMA
    &&audit.mode==='source-date-provenance-and-official-online-evidence_only_not_academic_admission'
    &&audit.period==='2026-07-01..2026-09-30'
    &&audit.journal==='Chem'&&audit.sourceBranch==='staging/historical-archive-nightly'
    &&audit.sourceRootCount===12
    &&audit.guards?.sourceShardsImmutable===true
    &&audit.guards?.doNotAutoTreatMonthFirstAsQ3===true
    &&Array.isArray(audit.provisionalFirstOfMonthDoi)
    &&Array.isArray(audit.nonProvisionalSourceDois)
    &&Array.isArray(audit.conflictingSourceDateDois)
    &&Array.isArray(audit.publisherEvidence)
    &&Array.isArray(audit.sourceRootSnapshots),
    'q3_chem_date_audit_schema_invalid');
  const roots=new Map(audit.sourceRootSnapshots.map(x=>[x.rootId,x]));
  fail(roots.size===12&&[...roots.values()].every(x=>
    sha40(x.reviewQueueGitBlobSha)&&sha64(x.stageSourceSha256)
    &&sourceGitBlobByRoot.get(x.rootId)===x.reviewQueueGitBlobSha),
    'q3_chem_date_audit_source_root_sha_mismatch');
  const sourceChem=[...sourceByDoi.values()].filter(x=>x.journal==='Chem');
  fail(sourceChem.length===audit.summary?.sourceUniqueDois
    &&sourceChem.length===147,'q3_chem_date_audit_source_census_mismatch');
  const provisional=new Set();
  for(const row of audit.provisionalFirstOfMonthDoi){
    const source=sourceByDoi.get(row.doi);
    fail(source?.journal==='Chem'&&!provisional.has(row.doi)
      &&Array.isArray(row.sourceOccurrences)&&row.sourceOccurrences.length>0
      &&row.sourceOccurrences.some(x=>/^2026-(07|08|09)-01$/.test(x.date)),
      'q3_chem_date_provisional_missing:'+row.doi);
    for(const x of row.sourceOccurrences){
      const root=roots.get(x.sourceRootId);
      fail(root&&root.stageSourceSha256===x.stageSourceSha256
        &&root.reviewQueueGitBlobSha===x.reviewQueueGitBlobSha
        &&source.sourceRoots.includes(x.sourceRootId)
        &&source.sourceHashes.includes(x.stageSourceSha256),
        'q3_chem_date_provisional_source_conflict:'+row.doi);
    }
    provisional.add(row.doi);
  }
  fail(provisional.size===143&&audit.summary.firstOfMonthProvisionalUnique===143,
    'q3_chem_date_provisional_count_mismatch');
  const rest=new Set();
  for(const row of audit.nonProvisionalSourceDois){
    const source=sourceByDoi.get(row.doi);
    fail(source?.journal==='Chem'&&!provisional.has(row.doi)&&!rest.has(row.doi)
      &&Array.isArray(row.occurrences)&&row.occurrences.length>0
      &&row.occurrences.every(x=>!/^2026-(07|08|09)-01$/.test(x.date)),
      'q3_chem_date_nonprovisional_missing:'+row.doi);
    for(const x of row.occurrences){
      const root=roots.get(x.sourceRootId);
      fail(root&&root.stageSourceSha256===x.stageSourceSha256
        &&root.reviewQueueGitBlobSha===x.reviewQueueGitBlobSha
        &&source.sourceRoots.includes(x.sourceRootId)
        &&source.sourceHashes.includes(x.stageSourceSha256),
        'q3_chem_date_nonprovisional_source_conflict:'+row.doi);
    }
    rest.add(row.doi);
  }
  fail(rest.size===4&&audit.summary.otherNonProvisionalUnique===4
    &&provisional.size+rest.size===sourceChem.length,
    'q3_chem_date_full_source_partition_invalid');
  const sourceConflict=new Set();
  for(const x of audit.conflictingSourceDateDois){
    const original=sourceByDoi.get(x.doi);
    fail(original?.dateConflict&&!sourceConflict.has(x.doi)
      &&Array.isArray(x.sourceDates)&&new Set(x.sourceDates).size>1,
      'q3_chem_date_conflict_missing:'+x.doi);
    sourceConflict.add(x.doi);
  }
  fail(sourceConflict.size===13&&audit.summary.sourceDateConflictUnique===13,
    'q3_chem_date_conflict_count_mismatch');
  const officialDate=new Map(),officialOutsideQ3=new Set(),officialWithinQ3=new Set();
  for(const row of audit.publisherEvidence){
    const src=sourceByDoi.get(row.doi);
    fail(src?.journal==='Chem'&&!officialDate.has(row.doi)
      &&row.publisherPage?.startsWith('https://www.sciencedirect.com/science/article/pii/')
      &&Array.isArray(row.sourceOccurrences)&&row.sourceOccurrences.length>0
      &&['pre_Q3_original','Q3_original_science_qualified','secondary_commentary_not_Article'].includes(row.classification),
      'q3_chem_date_official_evidence_invalid:'+row.doi);
    for(const x of row.sourceOccurrences)
      fail(src.sourceRoots.includes(x.sourceRootId)
        &&sourceGitBlobByRoot.get(x.sourceRootId)===x.reviewQueueGitBlobSha
        &&src.sourceHashes.includes(x.stageSourceSha256),
        'q3_chem_date_official_source_conflict:'+row.doi);
    if(row.publisherFirstOnlineDate===null){
      fail(row.classification==='secondary_commentary_not_Article'
        &&row.dateEvidenceTier?.startsWith('official_issue_only_'),
        'q3_chem_date_commentary_not_online:'+row.doi);
      officialDate.set(row.doi,null);continue;
    }
    fail(date(row.publisherFirstOnlineDate)
      &&row.dateEvidenceTier==='official_available_online'
      &&row.publisherArticleType==='Article'
      &&row.publisherFirstOnlineDate!==null,
      'q3_chem_date_online_missing:'+row.doi);
    const within=row.publisherFirstOnlineDate>='2026-07-01'
      &&row.publisherFirstOnlineDate<='2026-09-30';
    fail(row.classification===(within?'Q3_original_science_qualified':'pre_Q3_original'),
      'q3_chem_date_quarter_misassigned:'+row.doi);
    if(within){
      const a=acceptedManifest.find(x=>x.doi===row.doi);
      fail(a?.date===row.publisherFirstOnlineDate
        &&a.reviewEvidence?.firstOnlineDateEvidence?.officialPublisherFirstOnline===row.publisherFirstOnlineDate
        &&a.reviewEvidence?.firstOnlineDateEvidence?.frozenSourceUnmodified===true,
        'q3_chem_date_online_not_admitted_by_exact_authority:'+row.doi);
      officialWithinQ3.add(row.doi);
    }else{
      fail(!acceptedManifest.some(x=>x.doi===row.doi),
        'q3_chem_date_outside_quarter_admitted:'+row.doi);
      officialOutsideQ3.add(row.doi);
    }
    officialDate.set(row.doi,row.publisherFirstOnlineDate);
  }
  fail(officialDate.size===8&&officialWithinQ3.size===3&&officialOutsideQ3.size===3,
    'q3_chem_date_publisher_category_counters_invalid');
  return {provisional,officialDate,officialOutsideQ3,officialWithinQ3,sourceConflict,
    summary:audit.summary};
}
