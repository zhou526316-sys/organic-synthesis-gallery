import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  beginLiteratureCatalogGeneration,
  finalizeLiteratureCatalogGeneration,
  getLiteratureCatalogIndexStatus,
  importLiteratureCatalogIndexBatch,
  queryLiteratureCatalogIndex,
} from '../src/literature-catalog-index.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){
    const result=this.db.sqlite.prepare(this.sql).run(...this.args);
    return {success:true,meta:{changes:Number(result.changes||0)},results:[]};
  }
  async first(){
    const row=this.db.sqlite.prepare(this.sql).get(...this.args);
    return row===undefined?null:row;
  }
  async all(){
    return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args),meta:{}};
  }
}
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){return new Statement(this,sql);}
  close(){this.sqlite.close();}
}
const generation=(overrides={})=>({
  catalogId:'a'.repeat(64),
  doiSetHash:'b'.repeat(64),
  publicationSlot:'2026-10-05T08:00:00+08:00',
  sourceCommit:'c'.repeat(40),
  markerBlobSha:'d'.repeat(40),
  recordCount:3,
  ...overrides,
});
const row=(doi,title,extra={})=>({
  doi,
  revision:(doi.includes('archive')?'1':doi.includes('hot')?'2':'3').repeat(64),
  title,
  titleZh:'',
  authors:['Alice Example','Bob Example'],
  journal:'JACS',
  firstOnlineDate:'2026-10-03',
  datePrecision:'day',
  addedDate:'2026-10-05',
  synthesisType:'methodology',
  ...extra,
});
const rows=()=>[
  row('10.1234/archive','Archive nickel chemistry',{firstOnlineDate:'2026-07-01',addedDate:'2026-07-01'}),
  row('10.1234/hot','Hot photoredox chemistry',{titleZh:'光氧化还原催化'}),
  row('10.1234/organic','Organocatalysis chemistry',{journal:'Angew'}),
];

test('standalone migration SQL creates the generation, metadata and trigram FTS tables',t=>{
  const db=new D1();t.after(()=>db.close());
  db.sqlite.exec(readFileSync(new URL('../../literature-catalog-index-v1.sql',import.meta.url),'utf8'));
  const names=db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'literature_catalog_%' ORDER BY name").all().map(row=>row.name);
  assert.ok(names.includes('literature_catalog_generations'));
  assert.ok(names.includes('literature_catalog_index'));
  assert.ok(names.includes('literature_catalog_fts'));
  db.sqlite.prepare("INSERT INTO literature_catalog_fts(catalog_id,doi,searchable_text) VALUES(?,?,?)")
    .run('a'.repeat(64),'10.1234/probe','nickel 光氧化 chemistry');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM literature_catalog_fts WHERE literature_catalog_fts MATCH ?").get('"kel"').c,1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM literature_catalog_fts WHERE literature_catalog_fts MATCH ?").get('"光氧化"').c,1);
});

test('literature catalog index is disabled by default and never activates reads',async()=>{
  const status=await getLiteratureCatalogIndexStatus({});
  assert.equal(status.status,200);
  assert.equal(status.body.enabled,false);
  assert.equal(status.body.readPathActive,false);
  assert.equal(status.body.readConfigured,false);
  const begin=await beginLiteratureCatalogGeneration({},generation());
  assert.equal(begin.status,409);
  assert.equal(begin.body.error,'literature_catalog_index_shadow_disabled');
});

test('primary DB is never accepted as the literature search index binding',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const begin=await beginLiteratureCatalogGeneration(env,generation());
  assert.equal(begin.status,503);
  assert.equal(begin.body.error,'literature_catalog_index_db_missing');
  const status=await getLiteratureCatalogIndexStatus(env);
  assert.equal(status.status,503);
});

test('generation import is resumable, finalize is fenced, and FTS trigram matches substrings and Chinese',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation();

  const begun=await beginLiteratureCatalogGeneration(env,g);
  assert.equal(begun.status,200);
  assert.equal(begun.body.importedRows,0);
  assert.equal(begun.body.ready,false);

  const partial=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:rows().slice(0,2)});
  assert.equal(partial.status,200);
  assert.equal(partial.body.importedRows,2);

  const premature=await finalizeLiteratureCatalogGeneration(env,g.catalogId);
  assert.equal(premature.status,409);
  assert.equal(premature.body.error,'literature_catalog_generation_incomplete');
  assert.equal(premature.body.indexedRows,2);

  const retry=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:rows().slice(0,2)});
  assert.equal(retry.status,200);
  assert.equal(retry.body.importedRows,2);

  const finalBatch=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:rows().slice(2)});
  assert.equal(finalBatch.body.importedRows,3);

  const finalized=await finalizeLiteratureCatalogGeneration(env,g.catalogId);
  assert.equal(finalized.status,200);
  assert.equal(finalized.body.ready,true);
  assert.equal(finalized.body.indexedRows,3);
  assert.equal(finalized.body.ftsRows,3);

  const nickel=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'nickel'});
  assert.equal(nickel.status,200);
  assert.equal(nickel.body.matched,1);
  assert.equal(nickel.body.items[0].doi,'10.1234/archive');

  const substring=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'kel'});
  assert.equal(substring.body.matched,1);
  assert.equal(substring.body.items[0].doi,'10.1234/archive');

  const chinese=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'光氧化'});
  assert.equal(chinese.body.matched,1);
  assert.equal(chinese.body.items[0].doi,'10.1234/hot');

  const addedDateOnly=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'2026-10-05'});
  assert.equal(addedDateOnly.body.matched,0);

  const publicationDate=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'2026-10-03'});
  assert.equal(publicationDate.body.matched,2);

  const common=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'chem',limit:1});
  assert.equal(common.body.matched,3);
  assert.equal(common.body.count,1);
  assert.equal(common.body.hasMore,true);
  assert.ok(common.body.nextCursor);
  const second=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'chem',limit:1,cursor:common.body.nextCursor});
  assert.equal(second.body.matched,3);
  assert.equal(second.body.count,1);
  assert.equal(second.body.hasMore,true);
  assert.ok(second.body.nextCursor);
  assert.notEqual(second.body.items[0].doi,common.body.items[0].doi);
  const third=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'chem',limit:1,cursor:second.body.nextCursor});
  assert.equal(third.body.count,1);
  assert.equal(third.body.hasMore,false);
  assert.equal(third.body.nextCursor,null);
  assert.equal(new Set([common.body.items[0].doi,second.body.items[0].doi,third.body.items[0].doi]).size,3);

  const scopedWrongQuery=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'nickel',cursor:common.body.nextCursor});
  assert.equal(scopedWrongQuery.status,400);
  assert.equal(scopedWrongQuery.body.error,'literature_catalog_cursor_scope_mismatch');

  const invalidCursor=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'chem',cursor:'not-a-valid-cursor'});
  assert.equal(invalidCursor.status,400);
  assert.equal(invalidCursor.body.error,'literature_catalog_cursor_invalid');
});

test('two-character chemistry queries explicitly stay on the compatibility path for now',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:1});
  await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[rows()[0]]});
  await finalizeLiteratureCatalogGeneration(env,g.catalogId);
  const result=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'Ni'});
  assert.equal(result.status,422);
  assert.equal(result.body.error,'literature_catalog_short_query_requires_compatibility');
  assert.equal(result.body.minimumIndexedCharacters,3);
});

test('same catalog id cannot drift generation identity or paper revision',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation();
  await beginLiteratureCatalogGeneration(env,g);
  const conflict=await beginLiteratureCatalogGeneration(env,{...g,recordCount:4});
  assert.equal(conflict.status,409);
  assert.equal(conflict.body.error,'literature_catalog_generation_identity_conflict');

  const first=rows()[0];
  await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[first]});
  const changed={...first,revision:'f'.repeat(64),title:'Changed payload under same catalog'};
  const changedResult=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[changed]});
  assert.equal(changedResult.status,409);
  assert.equal(changedResult.body.error,'literature_catalog_index_batch_rejected');
  assert.match(changedResult.body.detail,/revision_conflict/);
});

test('search metadata keeps internal whitespace exact instead of normalizing user-visible text',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:1});
  const exact=row('10.1234/space','Nickel   chemistry');
  await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[exact]});
  await finalizeLiteratureCatalogGeneration(env,g.catalogId);

  const exactQuery=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'Nickel   chemistry'});
  assert.equal(exactQuery.status,200);
  assert.equal(exactQuery.body.matched,1);
  assert.equal(exactQuery.body.items[0].title,'Nickel   chemistry');

  const normalizedQuery=await queryLiteratureCatalogIndex(env,{catalogId:g.catalogId,query:'Nickel chemistry'});
  assert.equal(normalizedQuery.status,200);
  assert.equal(normalizedQuery.body.matched,0);
});

test('oversized search metadata fails closed instead of being silently truncated',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:1});
  await beginLiteratureCatalogGeneration(env,g);
  const oversized={...rows()[0],title:'x'.repeat(21000)};
  const result=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[oversized]});
  assert.equal(result.status,400);
  assert.equal(result.body.error,'literature_catalog_index_batch_invalid');
  assert.match(result.body.detail,/text_over_budget:title/);
  const status=await getLiteratureCatalogIndexStatus(env);
  assert.equal(status.body.generations[0].importedRows,0);
});

test('batch preflight rejects duplicate and overflow rows before changing generation counts',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:1});
  await beginLiteratureCatalogGeneration(env,g);

  const duplicate=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[rows()[0],rows()[0]]});
  assert.equal(duplicate.status,400);
  assert.equal(duplicate.body.error,'literature_catalog_index_batch_duplicate_doi');

  const statusAfterDuplicate=await getLiteratureCatalogIndexStatus(env);
  assert.equal(statusAfterDuplicate.body.generations[0].importedRows,0);

  const overflow=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:[rows()[0],rows()[1]]});
  assert.equal(overflow.status,409);
  assert.equal(overflow.body.error,'literature_catalog_index_row_overflow');

  const statusAfterOverflow=await getLiteratureCatalogIndexStatus(env);
  assert.equal(statusAfterOverflow.body.generations[0].importedRows,0);
});

test('read flag is independently visible but cannot activate the dormant read path',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1',LITERATURE_CATALOG_INDEX_READ_ENABLED:'1'};
  await beginLiteratureCatalogGeneration(env,generation());
  const status=await getLiteratureCatalogIndexStatus(env);
  assert.equal(status.status,200);
  assert.equal(status.body.enabled,true);
  assert.equal(status.body.readConfigured,true);
  assert.equal(status.body.readPathActive,false);
});

test('only authenticated admin routes exist in the foundation; public search is not cut over',()=>{
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.ok(source.includes('/api/admin/literature-catalog-index/query'));
  assert.ok(!source.includes('/api/literature/catalog-search'));
  assert.ok(!source.includes('/api/user-ui/literature-search'));

  const wrangler=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  const deploy=readFileSync(new URL('../../../.github/workflows/deploy-worker-frontend.yml',import.meta.url),'utf8');
  for(const token of ['LITERATURE_CATALOG_INDEX_SHADOW_ENABLED','LITERATURE_CATALOG_INDEX_READ_ENABLED']){
    assert.ok(!wrangler.includes(token),token+' must remain unset in wrangler');
    assert.ok(!deploy.includes(token),token+' must remain unset in production deploy');
  }
  assert.ok(!wrangler.includes('LITERATURE_INDEX_DB'),'dedicated search DB binding must remain unconfigured in foundation');
  assert.ok(!deploy.includes('literature-catalog-index-v1.sql'),'search DB migration must not run in production foundation');
  const primarySchema=readFileSync(new URL('../../schema.sql',import.meta.url),'utf8');
  assert.ok(!primarySchema.includes('literature_catalog_fts'),'primary D1 schema must stay free of FTS virtual tables');
});

console.log('LITERATURE_CATALOG_INDEX_FOUNDATION_TESTS_READY');
