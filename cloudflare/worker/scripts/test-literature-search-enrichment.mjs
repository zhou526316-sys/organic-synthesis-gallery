import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {
  beginLiteratureCatalogGeneration,importLiteratureCatalogIndexBatch,
  finalizeLiteratureCatalogGeneration,queryLiteratureCatalogView,
} from '../src/literature-catalog-index.js';
import {
  beginSearchEnrichment,importSearchEnrichment,finalizeSearchEnrichment,
  getSearchAbstract,searchEnrichmentReady,searchFtsExpression,
} from '../src/literature-search-enrichment.js';

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
  assert.equal(original.body.reviewedSummaryEn,null);
  const interpreted=await getSearchAbstract(env,{catalogId:GEN.catalogId,doi:'10.1234/b'});
  assert.equal(interpreted.status,200);
  assert.equal(interpreted.body.abstract,null);
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
