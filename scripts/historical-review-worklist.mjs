/**
 * Bounded, journal-balanced REVIEW WORKLIST for historical candidate DOI.
 * It never makes a scientific scope decision or permits a production write.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {orderedJournals} from './historical-nightly-discovery.mjs';
import {TRIAGE_SCHEMA} from './historical-review-triage.mjs';
export const WORKLIST_SCHEMA='gallery-history-review-worklist-v1';
const norm=s=>String(s||'').trim().toLowerCase();
const rank=s=>Number(String(s||'P3').replace(/^P/,''))||0;
const validDoi=s=>/^10\.\d{4,9}\/\S+$/.test(s);
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const fmtDate=d=>/^\d{4}-\d\d-\d\d$/.test(d||'')?d:'';
const prefer=(a,b)=>{
  const evidence=x=>[
    Boolean(fmtDate(x.date)),Array.isArray(x.sourceFamilies)?x.sourceFamilies.length:0,
    Boolean(x.title),Number(Array.isArray(x.authors)?x.authors.length:0)
  ];
  const x=evidence(a),y=evidence(b);
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i]?a:b;
  return String(a.sourceBatchId).localeCompare(String(b.sourceBatchId))<=0?a:b;
};
export function prepareWorklist(shards,{
  published=new Set(),approved=new Set(),pending=new Set(),excluded=new Set(),
  limit=320,journals=orderedJournals()}={}){
  assert(Number.isInteger(limit)&&limit>0&&limit<=400,'invalid_worklist_size');
  for(const set of [published,approved,pending,excluded])
    assert(set instanceof Set,'worklist_authoritative_sets_required');
  assert(Array.isArray(shards)&&shards.length>0,'worklist_requires_verified_shards');
  const byDoi=new Map(),sourceRoots=new Set();
  for(const shard of shards){
    assert(shard?.schemaVersion===TRIAGE_SCHEMA
      &&shard.mode==='review_queue_only_not_publication'
      &&Array.isArray(shard.records)
      &&shard.records.length===shard.stats?.candidateOccurrences
      &&typeof shard.rootId==='string'&&!sourceRoots.has(shard.rootId),
      'worklist_bad_review_shard');
    sourceRoots.add(shard.rootId);
    for(const paper of shard.records){
      const doi=norm(paper.doi);
      assert(validDoi(doi),'worklist_bad_doi:'+doi);
      if(!byDoi.has(doi))byDoi.set(doi,{...paper,doi,
        sourceBatchIds:[paper.sourceBatchId],sourceFingerprints:[paper.sourceBatchSha256],
        conflicts:[]});
      else{
        const prev=byDoi.get(doi);
        const best=prefer(prev,paper);
        const shared={
          sourceBatchIds:[...new Set([...prev.sourceBatchIds,paper.sourceBatchId])],
          sourceFingerprints:[...new Set([...prev.sourceFingerprints,paper.sourceBatchSha256])]
        };
        const conflict=[
          ...(prev.conflicts||[]),
          ...(prev.journal!==paper.journal?['source_journal_disagreement']:[]),
          ...(prev.date&&paper.date&&prev.date!==paper.date?['source_publication_date_disagreement']:[]),
          ...(prev.title&&paper.title&&prev.title.trim().toLowerCase()!==paper.title.trim().toLowerCase()?['source_title_disagreement']:[])
        ];
        byDoi.set(doi,{...best,...shared,conflicts:[...new Set(conflict)]});
      }
    }
  }
  const recognized=new Set(journals.map(x=>x.name));
  const allNeeds=[],statusCounts={alreadyPublished:0,approvedAwaiting08:0,sourcePending:0,explicitlyExcluded:0,needsReview:0};
  for(const x of byDoi.values()){
    if(published.has(x.doi)){statusCounts.alreadyPublished++;continue}
    if(approved.has(x.doi)){statusCounts.approvedAwaiting08++;continue}
    if(pending.has(x.doi)){statusCounts.sourcePending++;continue}
    if(excluded.has(x.doi)){statusCounts.explicitlyExcluded++;continue}
    assert(recognized.has(x.journal),'unknown_worklist_journal:'+x.journal);
    statusCounts.needsReview++;
    allNeeds.push(x);
  }
  const order=new Map(journals.map((j,i)=>[j.name,i]));
  const bins=new Map(journals.map(j=>[j.name,{normal:[],low:[]}]));
  for(const x of allNeeds){
    const b=bins.get(x.journal);
    (rank(x.priority)>=3?b.low:b.normal).push(x);
  }
  const sortPool=(a,b)=>rank(a.priority)-rank(b.priority)||
    (fmtDate(b.date)||'').localeCompare(fmtDate(a.date)||'')||
    a.doi.localeCompare(b.doi);
  for(const b of bins.values()){b.normal.sort(sortPool);b.low.sort(sortPool)}
  const chosen=[],ids=new Set(),byJournal={},byPriority={},byYear={};
  let round=0;
  while(chosen.length<limit&&bins.size){
    let advance=false;
    for(const journal of journals){
      if(chosen.length>=limit)break;
      const b=bins.get(journal.name);if(!b)continue;
      const chooseLow=round%9===8&&b.low.length>0;
      const pick=chooseLow?b.low.shift():(b.normal.shift()||b.low.shift());
      if(!pick){bins.delete(journal.name);continue}
      advance=true;
      assert(!ids.has(pick.doi),'duplicate_worklist_doi');ids.add(pick.doi);
      const year=String(pick.date||pick.year||'unknown').slice(0,4);
      const flags=[...new Set([...(pick.flags||[]),...(pick.conflicts||[])])];
      const row={
        doi:pick.doi,journal:journal.name,title:pick.title,date:pick.date||'',
        year,firstAuthor:pick.authors?.[0]||'',priority:pick.priority||'P3',
        sourceBatchIds:pick.sourceBatchIds,sourceFingerprints:pick.sourceFingerprints,
        flags,reviewTask:'independent_first_and_adversarial_second_scope_review_required',
        articleEvidence:'publisher_title_abstract_or_article_needed',
        scopeDecision:'not_performed',issueReconciliation:'not_guaranteed',
        publisherFirstOnlineVerification:'required'
      };
      chosen.push(row);
      byJournal[journal.name]=(byJournal[journal.name]||0)+1;
      byPriority[row.priority]=(byPriority[row.priority]||0)+1;
      byYear[year]=(byYear[year]||0)+1;
    }
    round++;
    if(!advance)break;
  }
  return {schemaVersion:WORKLIST_SCHEMA,mode:'scientific_review_worklist_only_not_scope_decision',
    producedAt:new Date().toISOString(),
    sourceCompletedRoots:sourceRoots.size,uniqueCandidateDois:byDoi.size,
    statusCounts,maximumRows:limit,selected:chosen.length,
    distinctReviewDois:ids.size,remainingUnselectedRequiresReview:statusCounts.needsReview-chosen.length,
    byJournal,byPriority,byYear,
    diversityPolicy:'round_robin_across_all_16_journals_plus_every_9th_round_low_keyword_sample',
    rankingDoesNotExclude:true,noAutomatedIncludesOrExcludes:true,
    noFormalPublication:true,noMediaOrPdfAcquisition:true,worklist:chosen};
}
export async function runHistoricalWorklist({
  root='audit/historical-staging',
  maxItems=Number(process.env.MAX_HISTORICAL_WORKLIST_ITEMS||320)}={}){
  assert(process.env.HISTORICAL_STAGING_ONLY==='1'
    &&process.env.HISTORICAL_STAGING_BRANCH==='1',
    'worklist_staging_only_required');
  const [state,ledger,queue,manifest,corrections]=await Promise.all([
    readFile(root+'/state.json','utf8').then(JSON.parse),
    readFile(root+'/review-triage-ledger.json','utf8').then(JSON.parse),
    readFile('public/toc-demand-live.json','utf8').then(JSON.parse),
    readFile('audit/historical-reviewed/approved-admissions.json','utf8').then(JSON.parse),
    readFile('audit/literature-scope-corrections.json','utf8').then(JSON.parse)
  ]);
  assert(state?.mode==='candidate_discovery_only'&&Array.isArray(state.completed)
    &&ledger?.schemaVersion===TRIAGE_SCHEMA
    &&queue?.articles?.length===queue.webpageDoiCount
    &&Array.isArray(manifest?.accepted)&&Array.isArray(manifest?.pending)
    &&Array.isArray(corrections?.items),'worklist_authority_missing');
  const shards=[];
  for(const rootId of state.completed){
    const json=await readFile(root+'/review-queue/'+rootId+'.json','utf8').then(JSON.parse);
    assert(ledger.rootSummaries[rootId]?.sourceSha256===json.sourceSha256,
      'worklist_source_fingerprint_mismatch:'+rootId);
    shards.push(json);
  }
  const output=prepareWorklist(shards,{
    published:new Set(queue.articles.map(x=>norm(x.doi))),
    approved:new Set(manifest.accepted.map(x=>norm(x.doi))),
    pending:new Set(manifest.pending.map(x=>norm(x.doi))),
    excluded:new Set(corrections.items.filter(x=>/exclude|remove/i.test(String(x.decision||x.status||''))
      ).map(x=>norm(x.doi))),
    limit:maxItems
  });
  assert(shards.length===ledger.coverageRootsProcessed,
    'worklist_did_not_cover_all_review_shards');
  const out=root+'/reviewer-worklist.json';
  await mkdir(dirname(out),{recursive:true});
  const tmp=out+'.tmp.'+process.pid;
  await writeFile(tmp,JSON.stringify(output,null,2)+'\n','utf8');
  await rename(tmp,out);
  console.log('HISTORICAL_REVIEWER_WORKLIST '+JSON.stringify({
    roots:shards.length,unique:output.uniqueCandidateDois,
    selected:output.selected,remaining:output.remainingUnselectedRequiresReview,
    lowPrioritySample:output.byPriority.P3||0,byJournal:output.byJournal,noPublication:true
  }));
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runHistoricalWorklist().catch(e=>{console.error('HISTORICAL_WORKLIST_BLOCKED',String(e?.message||e));process.exitCode=1});
