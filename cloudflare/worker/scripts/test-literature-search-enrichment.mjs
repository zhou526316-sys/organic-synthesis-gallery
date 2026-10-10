import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {
  beginLiteratureCatalogGeneration,importLiteratureCatalogIndexBatch,
  finalizeLiteratureCatalogGeneration,queryLiteratureCatalogView,
} from '../src/literature-catalog-index.js';
import {
  beginSearchEnrichment,importSearchEnrichment,finalizeSearchEnrichment,
  getSearchAbstract,searchEnrichmentReady,searchFtsExpression,
  getSearchEnrichmentCoverage,refreshSearchEnrichmentAbstracts,
} from '../src/literature-search-enrichment.js';
import {getBasicAbstractCoverage,importBasicAbstractReviews,
  listBasicAbstractReviewCandidates} from '../src/literature-basic-abstracts.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){const result=this.db.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes||0)}};}
  async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args)};}
}
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    this.sqlite.exec('BEGIN');
    try{
      for(const statement of statements)this.sqlite.prepare(statement.sql).run(...statement.args);
      this.sqlite.exec('COMMIT');
      return statements.map(()=>({success:true}));
    }catch(error){this.sqlite.exec('ROLLBACK');throw error;}
  }
  close(){this.sqlite.close();}
}
const GEN={
  catalogId:'a'.repeat(64),doiSetHash:'b'.repeat(64),sourceCommit:'c'.repeat(40),
  markerBlobSha:'d'.repeat(40),publicationSlot:'2026-10-10T08:00:00+08:00',recordCount:3,
};
const sh='f'.repeat(64);
const papers=[
  {doi:'10.1234/a',revision:'1'.repeat(64),title:'Photocatalytic carboxylic acid functionalization',titleZh:'',
    authors:['Alice'],journal:'JACS',firstOnlineDate:'2026-10-08',datePrecision:'day',addedDate:'2026-10-10',synthesisType:'methodology'},
  {doi:'10.1234/b',revision:'2'.repeat(64),title:'A metal mediated ring opening protocol',titleZh:'',
    authors:['Bob'],journal:'Angew',firstOnlineDate:'2026-10-07',datePrecision:'day',addedDate:'2026-10-10',synthesisType:'methodology'},
  {doi:'10.1234/c',revision:'3'.repeat(64),title:'Enantioselective radical coupling',titleZh:'',
    authors:['Carol'],journal:'Chem',firstOnlineDate:'2026-10-06',datePrecision:'day',addedDate:'2026-10-09',synthesisType:'methodology'},
];
async function fixture(t){
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1',LITERATURE_CATALOG_INDEX_READ_ENABLED:'1'};
  assert.equal((await beginLiteratureCatalogGeneration(env,GEN)).status,200);
  assert.equal((await importLiteratureCatalogIndexBatch(env,{generation:GEN,rows:papers})).status,200);
  assert.equal((await finalizeLiteratureCatalogGeneration(env,GEN.catalogId)).body.ready,true);
  return env;
}
const enr=[
  {doi:papers[0].doi,revision:papers[0].revision,
    abstract:'An iron complex promotes ligand-to-metal charge transfer through carboxylate photoactivation.',
    abstractSource:'openalex',summaryEn:'',summaryZh:''},
  {doi:papers[1].doi,revision:papers[1].revision,
    abstract:'',abstractSource:'',summaryEn:'A verified LMCT route yields substituted organic products.',summaryZh:''},
  {doi:papers[2].doi,revision:papers[2].revision,
    abstract:'An enantioselective organocatalyst for chiral phosphoric acid catalysis.',
    abstractSource:'crossref',summaryEn:'',summaryZh:'轴手性定向合成。'},
];
const begin=env=>beginSearchEnrichment(env,{catalogId:GEN.catalogId,sourceHash:sh});
const insert=(env,rows)=>importSearchEnrichment(env,{catalogId:GEN.catalogId,sourceHash:sh,rows});
const finalize=env=>finalizeSearchEnrichment(env,{catalogId:GEN.catalogId,sourceHash:sh});
const query=(env,q,extra={})=>queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:q,...extra});

test('enrichment is invisible before full DOI membership parity, never causes false partial results',async t=>{
  const env=await fixture(t);
  assert.equal((await query(env,'LMCT')).body.matched,0);
  assert.equal((await begin(env)).status,200);
  assert.equal((await insert(env,enr.slice(0,2))).status,200);
  assert.equal(await searchEnrichmentReady(env,GEN.catalogId),false);
  assert.equal((await query(env,'LMCT')).body.matched,0);
  assert.equal((await finalize(env)).status,409);
  assert.equal((await insert(env,enr.slice(2))).status,200);
  assert.equal((await finalize(env)).body.ready,true);
  assert.equal(await searchEnrichmentReady(env,GEN.catalogId),true);
});
test('LMCT expands only to reliable chemistry phrases in the abstract and reviewed description',async t=>{
  const env=await fixture(t);
  await insert(env,enr);assert.equal((await finalize(env)).status,200);
  const result=await query(env,'LMCT');
  assert.equal(result.status,200);
  assert.equal(result.body.matched,2);
  assert.deepEqual(result.body.items.map(x=>x.doi),['10.1234/a','10.1234/b']);
  assert.equal((await query(env,'配体到金属电荷转移')).body.matched,2);
  assert.equal((await query(env,'手性磷酸')).body.matched,1);
  assert.equal((await query(env,'轴手性')).body.matched,1);
  const narrowed=await query(env,'LMCT',{selectedJournals:['Angew']});
  assert.equal(narrowed.body.matched,1);
  assert.deepEqual(narrowed.body.items.map(x=>x.doi),['10.1234/b']);
  const date=await query(env,'LMCT',{dateFrom:'2026-10-08',dateTo:'2026-10-08'});
  assert.deepEqual(date.body.items.map(x=>x.doi),['10.1234/a']);
  assert.match(searchFtsExpression('LMCT'),/ligand-to-metal/);
});
test('original publisher abstract and reviewed Chinese/English interpretation remain separate',async t=>{
  const env=await fixture(t);await insert(env,enr);await finalize(env);
  const original=await getSearchAbstract(env,{catalogId:GEN.catalogId,doi:'10.1234/a'});
  assert.equal(original.status,200);
  assert.equal(original.body.abstractSource,'openalex');
  assert.equal(original.body.abstractAvailable,true);
  assert.match(original.body.abstractExcerpt,/ligand-to-metal charge transfer/);
  assert.equal(Object.hasOwn(original.body,'abstract'),false);
  assert.equal(original.body.reviewedSummaryEn,null);
  const interpreted=await getSearchAbstract(env,{catalogId:GEN.catalogId,doi:'10.1234/b'});
  assert.equal(interpreted.status,200);
  assert.equal(interpreted.body.abstractAvailable,false);
  assert.match(interpreted.body.reviewedSummaryEn,/LMCT/);
});
test('cross DOI injection, conflicting generation source and stale revisions fail closed',async t=>{
  const env=await fixture(t);
  const invalid=await insert(env,[{...enr[0],doi:'10.1234/rogue'}]);
  assert.equal(invalid.status,409);
  const wrongRev=await insert(env,[{...enr[0],revision:'9'.repeat(64)}]);
  assert.equal(wrongRev.status,409);
  const wrongSource=await beginSearchEnrichment(env,{catalogId:GEN.catalogId,sourceHash:'e'.repeat(64)});
  assert.equal(wrongSource.status,409);
  assert.equal((await getSearchAbstract(env,{catalogId:GEN.catalogId,doi:'10.1234/a'})).status,503);
  const duplicated=await insert(env,[enr[0],enr[0]]);
  assert.equal(duplicated.status,400);
});
test('metadata-only search and date filters retain legacy results when enrichment is unavailable',async t=>{
  const env=await fixture(t);
  const title=await query(env,'Photocatalytic');
  assert.deepEqual(title.body.items.map(row=>row.doi),['10.1234/a']);
  const date=await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,dateFrom:'2026-10-07',dateTo:'2026-10-07'});
  assert.equal(date.body.matched,1);
  assert.equal(date.body.items[0].doi,'10.1234/b');
});


test('missing abstracts can be recovered after ready without changing DOI count or approved descriptions',async t=>{
  const env=await fixture(t);await insert(env,enr);await finalize(env);
  const before=await getSearchEnrichmentCoverage(env,{catalogId:GEN.catalogId,limit:1});
  assert.equal(before.status,200);
  assert.equal(before.body.total,3);
  assert.equal(before.body.originalAbstracts,2);
  assert.equal(before.body.missingOriginalAbstracts,1);
  assert.equal(before.body.hasMore,false);
  assert.deepEqual(before.body.items.map(x=>x.doi),['10.1234/b']);
  assert.equal((await query(env,'carbonyl hydrosilylation')).body.matched,0);
  const recovered={doi:'10.1234/b',revision:papers[1].revision,
    abstract:'A novel electrochemical carbonyl hydrosilylation reaction allows direct organic synthesis.',
    abstractSource:'crossref',summaryEn:'',summaryZh:''};
  const result=await refreshSearchEnrichmentAbstracts(env,{
    catalogId:GEN.catalogId,sourceHash:sh,rows:[recovered]
  });
  assert.equal(result.status,200);
  assert.equal(result.body.refreshed,1);
  const after=await getSearchEnrichmentCoverage(env,{catalogId:GEN.catalogId});
  assert.equal(after.body.total,3);
  assert.equal(after.body.originalAbstracts,3);
  assert.equal(after.body.missingOriginalAbstracts,0);
  assert.equal(await searchEnrichmentReady(env,GEN.catalogId),true);
  assert.equal((await query(env,'carbonyl hydrosilylation')).body.matched,1);
  assert.equal((await query(env,'LMCT')).body.matched,2);
  const source=await getSearchAbstract(env,{catalogId:GEN.catalogId,doi:'10.1234/b'});
  assert.equal(source.body.abstractSource,'crossref');
  assert.match(source.body.reviewedSummaryEn,/verified LMCT/);
  const retry=await refreshSearchEnrichmentAbstracts(env,{
    catalogId:GEN.catalogId,sourceHash:sh,rows:[{...recovered,abstract:'a different unreviewed replacement'}]
  });
  assert.equal(retry.status,200);
  assert.equal(retry.body.refreshed,0);
  assert.equal((await query(env,'unreviewed replacement')).body.matched,0);
});
test('no unauthorized abstract refresh: reject foreign DOI, wrong revision, summary substitution and wrong source hash',async t=>{
  const env=await fixture(t);await insert(env,enr);await finalize(env);
  const row={doi:'10.1234/b',revision:papers[1].revision,
    abstract:'Valid original manuscript description with enough textual content.',
    abstractSource:'openalex',summaryEn:'',summaryZh:''};
  const refresh=rows=>refreshSearchEnrichmentAbstracts(env,{catalogId:GEN.catalogId,sourceHash:sh,rows});
  assert.equal((await refresh([{...row,doi:'10.1234/foreign'}])).status,409);
  assert.equal((await refresh([{...row,revision:'9'.repeat(64)}])).status,409);
  assert.equal((await refresh([{...row,summaryZh:'伪造的审核摘要'}])).status,400);
  assert.equal((await refresh([{...row,abstractSource:'unsafe'}])).status,400);
  assert.equal((await refresh([row,row])).status,400);
  assert.equal((await refreshSearchEnrichmentAbstracts(env,{catalogId:GEN.catalogId,sourceHash:'1'.repeat(64),rows:[row]})).status,409);
  assert.equal((await getSearchEnrichmentCoverage(env,{catalogId:GEN.catalogId,afterDoi:'not-a-doi'})).status,400);
  assert.equal((await getSearchEnrichmentCoverage(env,{catalogId:'b'.repeat(64)})).status,409);
  assert.equal((await getSearchEnrichmentCoverage(env,{catalogId:GEN.catalogId})).body.originalAbstracts,2);
});


test('authenticated baseline view parity excludes only enrichment, while public LMCT search expands',async t=>{
  const env=await fixture(t);
  await insert(env,enr);
  assert.equal((await finalize(env)).status,200);
  const publicView=await query(env,'LMCT');
  assert.equal(publicView.body.matched,2);
  const originalOnly=await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:'LMCT'},
    {baseOnly:true});
  assert.equal(originalOnly.status,200);
  assert.equal(originalOnly.body.matched,0);
  const baselineTitle=await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:'photocatalytic'},
    {baseOnly:true});
  assert.equal(baselineTitle.body.matched,1);
  assert.deepEqual(baselineTitle.body.items.map(x=>x.doi),['10.1234/a']);
  // A non-search baseline date audit retains the same approved DOI membership.
  const date=await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,
    dateFrom:'2026-10-07',dateTo:'2026-10-07'},{baseOnly:true});
  assert.equal(date.body.matched,1);
});

const abstractHash=txt=>createHash('sha256').update(String(txt)).digest('hex');
test('the current published catalog serves attributed historical excerpts without R2 Evidence',async t=>{
  const env=await fixture(t);
  await insert(env,enr);
  await finalize(env);
  const result=await getSearchAbstract(env,{doi:'10.1234/a'});
  assert.equal(result.status,200);
  assert.equal(result.body.catalogId,GEN.catalogId);
  assert.equal(result.body.abstractAvailable,true);
  assert.equal(result.body.abstractExcerptOnly,true);
  assert.equal(Object.hasOwn(result.body,'abstract'),false);
  assert.equal(result.body.basicSummaryZh,null);
  const missing=await getSearchAbstract(env,{doi:'10.1234/not-in-gallery'});
  assert.equal(missing.status,404);
  const history=await getSearchAbstract(env,{doi:'10.1234/b'});
  assert.equal(history.body.abstractAvailable,false);
});
test('privileged metadata reviewer imports only double-reviewed DOI+revision+source-hash summaries',async t=>{
  const env=await fixture(t);
  await insert(env,enr);await finalize(env);
  const first=await listBasicAbstractReviewCandidates(env,{catalogId:GEN.catalogId,limit:2});
  assert.equal(first.status,200);
  assert.equal(first.body.count,2);
  assert.deepEqual(first.body.items.map(x=>x.doi),['10.1234/a','10.1234/c']);
  assert.equal(first.body.items[0].reviewState,'pending');
  const item={doi:'10.1234/a',revision:papers[0].revision,
    abstractSource:'openalex',abstractSha256:abstractHash(enr[0].abstract),
    zh:'基于原始英文摘要：该研究采用金属络合物促进羧酸盐光活化，涉及配体到金属电荷转移过程。',
    en:'Abstract-based: an iron complex enables carboxylate photoactivation through a ligand-to-metal charge transfer pathway.',
    status:'approved',reviewPasses:2,reviewedAt:'2026-10-10T11:00:00.000Z'};
  const write=payload=>importBasicAbstractReviews(env,{catalogId:GEN.catalogId,rows:payload});
  assert.equal((await write([{...item,reviewPasses:1}])).status,400);
  assert.equal((await write([{...item,doi:'10.1234/foreign'}])).status,409);
  assert.equal((await write([{...item,revision:'b'.repeat(64)}])).status,409);
  assert.equal((await write([{...item,abstractSha256:'f'.repeat(64)}])).status,409);
  assert.equal((await write([item,item])).status,400);
  const inserted=await write([item]);
  assert.equal(inserted.status,200);
  assert.deepEqual(inserted.body.dois,['10.1234/a']);
  const publicView=await getSearchAbstract(env,{doi:item.doi});
  assert.equal(publicView.body.basicSummaryZh,item.zh);
  assert.equal(publicView.body.basicSummaryEn,item.en);
  assert.equal(publicView.body.basicSummaryBasis,'abstract_metadata_reviewed_v1');
  assert.equal(Object.hasOwn(publicView.body,'abstract'),false);
  const reviewed=await listBasicAbstractReviewCandidates(env,{catalogId:GEN.catalogId,limit:1});
  assert.equal(reviewed.body.items[0].reviewState,'approved_current');
  const coverage=await getBasicAbstractCoverage(env,{catalogId:GEN.catalogId});
  assert.equal(coverage.body.total,3);
  assert.equal(coverage.body.originalAbstracts,2);
  assert.equal(coverage.body.reviewedBilingualCandidates,1);
  assert.equal(coverage.body.reviewedCountRequiresPerDoiHashCheck,true);
  // Changing deposited text without a re-review invalidates only the basic
  // synopsis. Deep Evidence protection and official DOI membership are intact.
  env.LITERATURE_INDEX_DB.sqlite.prepare(
    'UPDATE literature_search_enrichment SET abstract_text=? WHERE catalog_id=? AND doi=?'
  ).run(enr[0].abstract+' A changed conclusion.',GEN.catalogId,item.doi);
  const stale=await getSearchAbstract(env,{doi:item.doi});
  assert.equal(stale.body.basicSummaryZh,null);
  assert.equal(stale.body.abstractAvailable,true);
});
test('newer catalog prevents stale previous-generation abstracts leaking after DOI deletion',async t=>{
  const env=await fixture(t);
  await insert(env,enr);await finalize(env);
  assert.equal((await getSearchAbstract(env,{doi:'10.1234/a'})).status,200);
  const next={...GEN,catalogId:'b'.repeat(64),doiSetHash:'c'.repeat(64),
    publicationSlot:'2026-10-11T08:00:00+08:00',recordCount:1};
  const retained=[papers[1]];
  assert.equal((await beginLiteratureCatalogGeneration(env,next)).status,200);
  assert.equal((await importLiteratureCatalogIndexBatch(env,{generation:next,rows:retained})).status,200);
  assert.equal((await finalizeLiteratureCatalogGeneration(env,next.catalogId)).body.ready,true);
  // No complete new abstract index yet: never resurrect the old generation.
  assert.equal((await getSearchAbstract(env,{doi:'10.1234/a'})).status,503);
  assert.equal((await getSearchAbstract(env,{doi:'10.1234/b'})).status,503);
});

test('academic metadata alternatives may fill source gaps only for the exact original DOI revision',async t=>{
  const env=await fixture(t);
  await insert(env,enr);await finalize(env);
  const text='A verified DOI-bound electrochemical hydrocarbon coupling abstract reports a highly selective reaction strategy for preparing synthetically useful organic compounds from common feedstocks.';
  const base={doi:papers[1].doi,revision:papers[1].revision,
    abstract:text,summaryEn:'',summaryZh:''};
  const fill=(source,rows)=>refreshSearchEnrichmentAbstracts(env,{
    catalogId:GEN.catalogId,sourceHash:sh,rows:rows??[{...base,abstractSource:source}]
  });
  assert.equal((await fill('semantic_scholar',[
    {...base,abstractSource:'semantic_scholar',doi:'10.1234/foreign'}
  ])).status,409);
  const done=await fill('semantic_scholar');
  assert.equal(done.status,200);
  assert.equal(done.body.refreshed,1);
  const visible=await getSearchAbstract(env,{doi:papers[1].doi});
  assert.equal(visible.body.abstractSource,'semantic_scholar');
  assert.match(visible.body.abstractExcerpt,/electrochemical hydrocarbon coupling/);
  assert.equal(Object.hasOwn(visible.body,'abstract'),false);
  assert.equal((await query(env,'hydrocarbon coupling')).body.matched,1);
  const duplicate=await fill('europe_pmc');
  assert.equal(duplicate.body.refreshed,0);
});
test('Europe PMC alone can independently repair a missing current DOI without changing approved text',async t=>{
  const env=await fixture(t);await insert(env,enr);await finalize(env);
  const fill=await refreshSearchEnrichmentAbstracts(env,{
    catalogId:GEN.catalogId,sourceHash:sh,rows:[{
      doi:papers[1].doi,revision:papers[1].revision,
      abstract:'A novel catalytic selective carbon–carbon formation approach provides practical access to functionalized organic intermediates across multiple substrate families.',
      abstractSource:'europe_pmc',summaryZh:'',summaryEn:''
    }]
  });
  assert.equal(fill.status,200);
  assert.equal(fill.body.refreshed,1);
  assert.equal((await getSearchAbstract(env,{doi:papers[1].doi})).body.abstractSource,'europe_pmc');
  const coverage=await getSearchEnrichmentCoverage(env,{catalogId:GEN.catalogId});
  assert.equal(coverage.body.originalAbstracts,3);
});
