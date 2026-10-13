import assert from 'node:assert/strict';import {test} from 'node:test';
import {prepareWorklist,WORKLIST_SCHEMA} from './historical-review-worklist.mjs';
const make=(journal,rows,id)=>({schemaVersion:'gallery-history-review-triage-v1',
mode:'review_queue_only_not_publication',rootId:id,stats:{candidateOccurrences:rows.length},
records:rows.map((x,i)=>({
  doi:x.doi,title:x.title,journal,date:x.date||'',year:x.year||2026,priority:x.priority||'P0',
  sourceBatchId:id,sourceBatchSha256:'a'.repeat(64),authors:['A Author'],
  sourceFamilies:['crossref','openalex'],flags:x.flags||[]
}))});
const a=make('JACS',[
 {doi:'10.1021/jacs.6c00001',title:'Enantioselective coupling',priority:'P0',date:'2026-09-10'},
 {doi:'10.1021/jacs.6c00002',title:'Title that lacks synthesis keywords',priority:'P3',date:'2026-09-09'},
 {doi:'10.1021/jacs.6c00003',title:'Research article',priority:'P2',date:'2026-08-01'}
],'2026-09-08_2026-09-14_jacs');
const b=make('JOC',[
 {doi:'10.1021/acs.joc.6c00004',title:'Photoredox reaction',priority:'P0',date:'2026-08-22'},
 {doi:'10.1021/jacs.6c00001',title:'Enantioselective coupling',priority:'P0',date:'2026-09-10'}
],'2026-08-22_2026-08-31_joc');
test('DOIs deduplicate and sources are preserved without automatic academic decisions',()=>{
  // This synthetic fixture intentionally disagrees on the journal for DOI 1.
  const out=prepareWorklist([a,b],{limit:10,published:new Set(),
    approved:new Set(),pending:new Set(),excluded:new Set()});
  assert.equal(out.schemaVersion,WORKLIST_SCHEMA);
  assert.equal(out.uniqueCandidateDois,4);
  assert.equal(out.selected,4);
  assert.equal(out.distinctReviewDois,4);
  assert.ok(out.worklist.every(x=>x.scopeDecision==='not_performed'));
  assert.ok(out.worklist.some(x=>x.priority==='P3'));
  assert.equal(out.noAutomatedIncludesOrExcludes,true);
  const duplicate=out.worklist.find(x=>x.doi==='10.1021/jacs.6c00001');
  assert.equal(duplicate.sourceBatchIds.length,2);
  assert.ok(duplicate.flags.includes('source_journal_disagreement'));
});
test('authoritative published, approved, pending and explicitly excluded are omitted only from worklist',()=>{
  const out=prepareWorklist([a,b],{
    published:new Set(['10.1021/jacs.6c00001']),
    approved:new Set(['10.1021/jacs.6c00002']),
    pending:new Set(['10.1021/jacs.6c00003']),
    excluded:new Set(['10.1021/acs.joc.6c00004'])});
  assert.equal(out.selected,0);
  assert.equal(out.uniqueCandidateDois,4);
  assert.equal(out.statusCounts.alreadyPublished,1);
  assert.equal(out.statusCounts.approvedAwaiting08,1);
  assert.equal(out.statusCounts.sourcePending,1);
  assert.equal(out.statusCounts.explicitlyExcluded,1);
});
test('source flags and uncertain dates never silently turn into exclusion',()=>{
  const c=make('JACS',[{doi:'10.1021/jacs.6c00005',title:'Unknown chemistry',
    priority:'P3',flags:['publisher_first_online_date_unverified']}],
    '2025-10-01_2025-10-31_jacs');
  const out=prepareWorklist([c],{limit:10});
  assert.equal(out.selected,1);
  assert.equal(out.worklist[0].date,'');
  assert.ok(out.worklist[0].flags.includes('publisher_first_online_date_unverified'));
});
test('unsafe record shapes, absent authority, invalid limit fail closed',()=>{
  assert.throws(()=>prepareWorklist([a],{limit:500}),/invalid_worklist_size/);
  assert.throws(()=>prepareWorklist([{...a,stats:{candidateOccurrences:500}}]),/worklist_bad_review_shard/);
  assert.throws(()=>prepareWorklist([a],{published:null}),/worklist_authoritative_sets_required/);
});
