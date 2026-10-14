import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFullPlan,validateFullPlan,aggregateFullReports,SCHEMA} from './full-formal-body-source-coverage.mjs';

const cat='a'.repeat(64),rev='b'.repeat(64);
function fixture(n=1087){
  const rows=Array.from({length:n},(_,i)=>({
    doi:'10.9000/synthetic-'+String(i).padStart(5,'0'),
    journal:i%3===0?'Nature Chemistry':'JACS',
    date:i%19===0?'':i%2===0?'2026-06-20':'2026-10-13',
    revision:rev
  }));
  const release={architectureCatalogId:cat,productionCards:n,dois:rows.map(x=>x.doi)};
  return {rows,release};
}
function reportsFor(plan){
  return plan.shards.map(s=>({
    schemaVersion:SCHEMA,catalogId:plan.catalogId,planSha256:plan.planSha256,
    offset:s.offset,count:s.count,
    entries:plan.rows.slice(s.offset,s.offset+s.count).map((r,i)=>({
      doi:r.doi,journal:r.journal,publication:r.date,revision:r.revision,
      state:i===0?'needs_independent_review':'pmc_oa_missing',
      ...(i===0?{license:'by/4.0',grade:'complete_candidate',sections:5}: {})
    }))
  }));
}
test('one request covers all 1087 formal DOIs; 100 is only a technical shard size',()=>{
  const {rows,release}=fixture(),p=makeFullPlan(release,rows,100);
  assert.equal(p.totalFormalDois,1087);
  assert.equal(p.shards.length,11);
  assert.equal(p.shards.at(-1).count,87);
  assert.equal(p.scopeCounts.date_unverified>0,true);
  assert.equal(p.scopeCounts.october_plus>0,true);
  assert.equal(p.scopeCounts.pre_july>0,true);
  assert.equal(validateFullPlan(p),p);
  const report=aggregateFullReports(p,reportsFor(p));
  assert.equal(report.enumeratedDois,1087);
  assert.equal(report.sourceCheckedDois,1087);
  assert.equal(report.sourceAuditComplete,true);
  assert.equal(report.rightsCandidateCount,11);
  assert.equal(report.publicBodyImports,0);
});
test('reject DOI missing from formal catalog, duplicates, or revision drift',()=>{
  const {release,rows}=fixture(25);
  assert.throws(()=>makeFullPlan(release,rows.slice(0,-1),100));
  assert.throws(()=>makeFullPlan(release,[...rows.slice(0,-1),rows[0]],100));
  assert.throws(()=>makeFullPlan(release,rows.map((r,i)=>i? r:{...r,revision:'bad'}),100));
  const p=makeFullPlan(release,rows,100);
  assert.throws(()=>validateFullPlan({...p,planSha256:'f'.repeat(64)}));
});
test('do not claim all-source completion when any shard is missing, rejected or throttled',()=>{
  const {release,rows}=fixture(205),p=makeFullPlan(release,rows,100);
  const reports=reportsFor(p);
  assert.equal(aggregateFullReports(p,reports.slice(0,-1)).sourceAuditComplete,false);
  assert.equal(aggregateFullReports(p,reports.slice(0,-1)).missingDois.length,5);
  reports[1].entries[0].state='provider_paused';
  let summary=aggregateFullReports(p,reports);
  assert.equal(summary.sourceAuditComplete,false);
  assert.equal(summary.retryDois.length,1);
  assert.equal(summary.sourceCheckedDois,204);
  reports[1].entries[0].state='pmc_oa_missing';
  reports[1].entries[0].doi='10.9000/not-formal';
  summary=aggregateFullReports(p,reports);
  assert.equal(summary.sourceAuditComplete,false);
  assert.deepEqual(summary.badShardOffsets,[100]);
});
test('do not accept duplicate or out-of-order shard result',()=>{
  const {release,rows}=fixture(120),p=makeFullPlan(release,rows,100);
  const reports=reportsFor(p);
  assert.equal(aggregateFullReports(p,[reports[0],reports[0],reports[1]]).sourceAuditComplete,false);
  assert.equal(aggregateFullReports(p,[reports[1],reports[0]]).sourceAuditComplete,true);
});
