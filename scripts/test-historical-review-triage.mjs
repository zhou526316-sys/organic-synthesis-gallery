import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HISTORICAL_FOUNDATIONS,historicalFoundation,historicalIssnsForRange,
  historicalPeriodApplicable} from '../shared/historical-journal-founding.mjs';
import {rankHistoricalCandidate,buildReviewShard,TRIAGE_SCHEMA}
  from './historical-review-triage.mjs';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';
test('16 separate edition founding bounds, no prospective activeFrom rewrite',()=>{
  assert.equal(Object.keys(HISTORICAL_FOUNDATIONS).length,16);
  assert.equal(TARGET_JOURNALS.length,16);
  assert.equal(historicalFoundation('JOC').year,1936);
  assert.equal(historicalFoundation('Angew').year,1962);
  assert.equal(historicalFoundation('Nature').year,1869);
  assert.ok(TARGET_JOURNALS.every(j=>historicalFoundation(j.name).year<=2026));
  assert.equal(TARGET_JOURNALS.find(j=>j.name==='JOC').activeFrom,'2026-09-22');
  assert.equal(historicalPeriodApplicable({name:'Nature Synthesis'},{to:'2021-12-31'}),false);
  assert.equal(historicalPeriodApplicable({name:'Nature Synthesis'},{to:'2022-01-01'}),true);
});
test('legacy Angew English edition ISSN is added only in its actual era',()=>{
  const a=TARGET_JOURNALS.find(j=>j.name==='Angew');
  assert.deepEqual(historicalIssnsForRange(a,{from:'1962-01-01',to:'1997-12-31'}),['0570-0833']);
  assert.deepEqual(historicalIssnsForRange(a,{from:'1998-01-01',to:'1998-12-31'}),a.issns);
  assert.equal(historicalIssnsForRange(a,{from:'1997-10-01',to:'1998-03-31'}).length,3);
  assert.throws(()=>historicalIssnsForRange(a,{from:'1999-02-01',to:'1998-02-01'}));
});
const source=(rows)=>({
  recordType:'historical_discovery_candidate_only',journal:'JOC',
  status:'source_enumeration_complete',candidateCount:rows.length,
  consistency:{complete:true},checkedAt:'2026-10-12T10:00:00Z',
  range:{from:'2026-09-08',to:'2026-09-14'},records:rows,
});
const row=(suffix,title,other={})=>({
  doi:'10.1021/acs.joc.'+suffix,title,date:'2026-09-12',
  authors:['Example Author'],citation:{year:2026},
  sources:['crossref','openalex'],...other
});
test('high recall: no keyword means review queue, not exclusion',()=>{
  const src=source([
    row('6c01580','Electricity-Driven Halogenation of α-Oxo Ketene Dithioacetals'),
    row('6c01772','Visible-Light-Promoted Phosphonylation Enabling the Use of Alkyl Thianthrenium Salts'),
    row('6c01111','A strange chemical result without the expected terms'),
    row('6c01112','Issue Editorial Masthead',{date:'',needsPublisherDateVerification:true})]);
  const shard=buildReviewShard(src,{
    published:new Set(['10.1021/acs.joc.6c01580']),
    pending:new Set(['10.1021/acs.joc.6c01772']),
    sourceSha256:'abc',sourceId:'2026-09-08_2026-09-14_joc'});
  assert.equal(shard.schemaVersion,TRIAGE_SCHEMA);
  assert.equal(shard.records.length,4);
  assert.equal(shard.stats.alreadyPublished,1);
  assert.equal(shard.stats.evidencePending,1);
  assert.equal(shard.stats.requiresTwoPassReview,2);
  assert.equal(shard.stats.unverifiedDate,1);
  assert.equal(shard.stats.suspectedNonresearch,1);
  assert.ok(shard.records.some(x=>x.priority==='P3'&&x.status==='requires_two_pass_review'));
  assert.ok(shard.records.every(x=>x.articleEvidenceReview==='not_performed_by_triage'));
  assert.equal(shard.zeroAutomaticExclusions,true);
  assert.equal(shard.publisherIssueReconciled,false);
});
test('source completeness and duplicate evidence are fail closed',()=>{
  const opts={sourceId:'2026-09-08_2026-09-14_joc',sourceSha256:'abc'};
  assert.throws(()=>buildReviewShard({...source([]),status:'incomplete_sources'},opts));
  assert.throws(()=>buildReviewShard(source([row('6c00000','A'),row('6c00000','B')]),opts));
  assert.throws(()=>buildReviewShard({...source([]),candidateCount:2},opts));
});
test('suspicious identity metadata remains visible for DOI-specific review',()=>{
  const v=rankHistoricalCandidate({title:'Issue Publication Information',date:'2026-09-10'});
  assert.ok(v.flags.includes('suspected_nonresearch_record_verify_at_publisher'));
  assert.equal(v.priority,'P3');
});

test('unqualified asymmetric in neuroscience/materials does not crowd high-synthesis review priority',()=>{
  for(const title of [
    'Asymmetric prefrontal representations for leader–follower dynamics',
    'Dynamic asymmetric strain imprinted into substrates by an oxide thin film',
    'Asymmetric flagellar rotation related to neural behavior'
  ])assert.equal(rankHistoricalCandidate({title,date:'2026-09-01'}).priority,'P3');
  for(const title of [
    'Cobalt-Catalyzed Enantioselective Hydroalkylation of Cyclohexenes',
    'Asymmetric Catalytic Synthesis of New Chiral Heterocycles',
    'Enantioselective Cross-Coupling through Nickel Catalysis',
    'Asymmetric Copper-Catalyzed Propargylation of Aminopyrazoles',
    'Asymmetric vicinal C(sp3)–H difunctionalization of cyclic amines via photoredox',
    'Enantiodivergent Synthesis of 2-phosphoryl-chromanones via Asymmetric Hydrophosphinylation'
  ])assert.equal(rankHistoricalCandidate({title,date:'2026-09-01'}).priority,'P0');
});
test('rank shifts never delete DOI or perform a scope include/exclude',()=>{
  const src=source([row('6c22222','Asymmetric prefrontal representations for leader–follower dynamics')]);
  const shard=buildReviewShard(src,{sourceSha256:'abc',sourceId:'2026-09-08_2026-09-14_joc'});
  assert.equal(shard.records.length,1);
  assert.equal(shard.records[0].status,'requires_two_pass_review');
  assert.equal(shard.records[0].priority,'P3');
  assert.equal(shard.zeroAutomaticExclusions,true);
});
