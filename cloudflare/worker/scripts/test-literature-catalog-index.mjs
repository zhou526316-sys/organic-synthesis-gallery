import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  beginLiteratureCatalogGeneration,
  finalizeLiteratureCatalogGeneration,
  getLiteratureCatalogIndexStatus,
  importLiteratureCatalogIndexBatch,
  listLiteratureCatalogIndexRows,
  LITERATURE_INDEX_IMPORT_BATCH_MAX,
  queryLiteratureCatalogIndex,
  queryLiteratureCatalogView,
  queryPublishedLiteratureCatalogView,
} from '../src/literature-catalog-index.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){
    const result=this.db.sqlite.prepare(this.sql).run(...this.args);
    return {success:true,meta:{changes:Number(result.changes||0)},results:[]};
  }
  async first(){
    this.db.reads.push({sql:this.sql,args:[...this.args]});
    const row=this.db.sqlite.prepare(this.sql).get(...this.args);
    return row===undefined?null:row;
  }
  async all(){
    this.db.reads.push({sql:this.sql,args:[...this.args]});
    return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args),meta:{}};
  }
}
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.batchCalls=0;this.batchStatementCounts=[];this.reads=[];}
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    this.batchCalls+=1;
    this.batchStatementCounts.push(statements.length);
    this.sqlite.exec('BEGIN');
    try{
      const results=statements.map(statement=>{
        const result=this.sqlite.prepare(statement.sql).run(...statement.args);
        return {success:true,meta:{changes:Number(result.changes||0)},results:[]};
      });
      this.sqlite.exec('COMMIT');
      return results;
    }catch(error){
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
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

test('finalize rejects equal-count FTS corruption when DOI sets differ',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:2});
  const pair=rows().slice(0,2);
  const imported=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:pair});
  assert.equal(imported.status,200);
  assert.equal(imported.body.importedRows,2);

  db.sqlite.prepare('DELETE FROM literature_catalog_fts WHERE catalog_id=? AND doi=?')
    .run(g.catalogId,pair[1].doi);
  const firstSearch=db.sqlite.prepare('SELECT searchable_text FROM literature_catalog_fts WHERE catalog_id=? AND doi=?')
    .get(g.catalogId,pair[0].doi);
  db.sqlite.prepare('INSERT INTO literature_catalog_fts(catalog_id,doi,searchable_text) VALUES(?,?,?)')
    .run(g.catalogId,pair[0].doi,firstSearch.searchable_text);

  const finalized=await finalizeLiteratureCatalogGeneration(env,g.catalogId);
  assert.equal(finalized.status,409);
  assert.equal(finalized.body.error,'literature_catalog_generation_incomplete');
  assert.equal(finalized.body.indexedRows,2);
  assert.equal(finalized.body.ftsRows,2);
  assert.equal(finalized.body.ftsDistinctDois,1);
  assert.equal(finalized.body.missingFtsRows,1);
  assert.equal(finalized.body.orphanFtsRows,0);
});

test('Unicode search terms paginate without btoa errors and preserve cursor scope',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:3});
  const axial=[
    row('10.1234/axial-a','Axial asymmetric catalysis A',
      {titleZh:'轴手性不对称催化 A',firstOnlineDate:'2026-10-07'}),
    row('10.1234/axial-b','Axial asymmetric catalysis B',
      {titleZh:'轴手性不对称催化 B',firstOnlineDate:'2026-10-06'}),
    row('10.1234/axial-c','Axial asymmetric catalysis C',
      {titleZh:'轴手性不对称催化 C',firstOnlineDate:'2026-10-05'}),
  ];
  await importLiteratureCatalogIndexBatch(env,{generation:g,rows:axial});
  const finalized=await finalizeLiteratureCatalogGeneration(env,g.catalogId);
  assert.equal(finalized.body.ready,true);

  const view={catalogId:g.catalogId,query:'轴手性',limit:1,sort:'newest'};
  const a=await queryLiteratureCatalogView(env,view);
  assert.equal(a.status,200);assert.equal(a.body.matched,3);
  assert.equal(a.body.hasMore,true);
  assert.equal(a.body.items.length,1);
  assert.ok(a.body.nextCursor);
  const b=await queryLiteratureCatalogView(env,{...view,cursor:a.body.nextCursor});
  assert.equal(b.status,200);assert.equal(b.body.matched,3);
  assert.notEqual(a.body.items[0].doi,b.body.items[0].doi);
  const c=await queryLiteratureCatalogView(env,{...view,cursor:b.body.nextCursor});
  assert.equal(c.status,200);assert.equal(c.body.hasMore,false);
  assert.deepEqual([a,b,c].map(value=>value.body.items[0].doi),
    axial.map(value=>value.doi));
  const wrong=await queryLiteratureCatalogView(env,{
    ...view,query:'手性磷酸',cursor:a.body.nextCursor,
  });
  assert.equal(wrong.status,400);
  assert.equal(wrong.body.error,'literature_catalog_view_cursor_scope_mismatch');
  const invalid=await queryLiteratureCatalogView(env,{...view,cursor:'not-base64url'});
  assert.equal(invalid.status,400);
  assert.equal(invalid.body.error,'literature_catalog_view_cursor_invalid');

  const legacyA=await queryLiteratureCatalogIndex(env,{
    catalogId:g.catalogId,query:'轴手性',limit:1,
  });
  assert.equal(legacyA.status,200);
  assert.equal(legacyA.body.hasMore,true);
  const legacyB=await queryLiteratureCatalogIndex(env,{
    catalogId:g.catalogId,query:'轴手性',limit:1,cursor:legacyA.body.nextCursor,
  });
  assert.equal(legacyB.status,200);
  assert.notEqual(legacyA.body.items[0].doi,legacyB.body.items[0].doi);
});

test('filtered view shadow preserves current frontend filters and bounded keyset paging',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const viewRows=[
    row('10.1234/view-a','Nickel chemistry A',{journal:'JACS',firstOnlineDate:'2026-10-05',addedDate:'2026-10-05'}),
    row('10.1234/view-b','Nickel chemistry B',{journal:'Angew',firstOnlineDate:'2026-10-04',addedDate:'2026-10-05'}),
    row('10.1234/view-c','Photoredox chemistry C',{journal:'JACS',firstOnlineDate:'2026-10-03',addedDate:'2026-10-04'}),
    row('10.1234/view-d','Organic chemistry D',{journal:'Chem',firstOnlineDate:'2026-10-02',addedDate:'2026-10-03'}),
    row('10.1234/view-e','Catalysis chemistry E',{journal:'Nature Chemistry',firstOnlineDate:'2026-10-01',addedDate:'2026-10-02'}),
    row('10.1234/view-f','Archive chemistry F',{journal:'Angew',firstOnlineDate:'2026-09-30',addedDate:'2026-09-30'}),
    row('10.1234/view-g','Plain reaction G',{journal:'JACS',firstOnlineDate:'2026-09-29',addedDate:'2026-09-29',synthesisType:'formal'}),
    row('10.1234/view-h','Old chemistry H',{journal:'Chem',firstOnlineDate:'2026-09-28',addedDate:'2026-09-28'}),
  ];
  const g=generation({recordCount:viewRows.length});
  await importLiteratureCatalogIndexBatch(env,{generation:g,rows:viewRows});
  await finalizeLiteratureCatalogGeneration(env,g.catalogId);

  const jacs=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,selectedJournals:['JACS'],sort:'newest',limit:2,
  });
  assert.equal(jacs.status,200);
  assert.equal(jacs.body.matched,3);
  assert.deepEqual(jacs.body.items.map(item=>item.doi),['10.1234/view-a','10.1234/view-c']);
  assert.equal(jacs.body.hasMore,true);
  assert.ok(jacs.body.nextCursor);

  const jacsSecond=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,selectedJournals:['JACS'],sort:'newest',limit:2,cursor:jacs.body.nextCursor,
  });
  assert.deepEqual(jacsSecond.body.items.map(item=>item.doi),['10.1234/view-g']);
  assert.equal(jacsSecond.body.hasMore,false);

  const wrongScope=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,selectedJournals:['Angew'],sort:'newest',limit:2,cursor:jacs.body.nextCursor,
  });
  assert.equal(wrongScope.status,400);
  assert.equal(wrongScope.body.error,'literature_catalog_view_cursor_scope_mismatch');

  const dateRange=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,dateFrom:'2026-10-01',dateTo:'2026-10-04',sort:'oldest',limit:10,
  });
  assert.deepEqual(dateRange.body.items.map(item=>item.doi),[
    '10.1234/view-e','10.1234/view-d','10.1234/view-c','10.1234/view-b',
  ]);

  const today=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,addedDate:'2026-10-05',sort:'newest',limit:10,
  });
  assert.deepEqual(today.body.items.map(item=>item.doi),['10.1234/view-a','10.1234/view-b']);

  const includeExclude=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,selectedJournals:['JACS','Angew'],excludedJournals:['JACS'],sort:'newest',limit:10,
  });
  assert.deepEqual(includeExclude.body.items.map(item=>item.doi),['10.1234/view-b','10.1234/view-f']);

  const nickel=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,query:'nickel',sort:'newest',limit:10,
  });
  assert.deepEqual(nickel.body.items.map(item=>item.doi),['10.1234/view-a','10.1234/view-b']);

  const synthesisTypeOnly=await queryLiteratureCatalogView(env,{
    catalogId:g.catalogId,query:'formal',sort:'newest',limit:10,
  });
  assert.equal(synthesisTypeOnly.body.matched,0);
  assert.deepEqual(synthesisTypeOnly.body.items,[]);

  const shortQuery=await queryLiteratureCatalogView(env,{catalogId:g.catalogId,query:'Ni'});
  assert.equal(shortQuery.status,422);
  assert.equal(shortQuery.body.error,'literature_catalog_short_query_requires_compatibility');

  const readersSort=await queryLiteratureCatalogView(env,{catalogId:g.catalogId,sort:'readers'});
  assert.equal(readersSort.status,422);
  assert.equal(readersSort.body.error,'literature_catalog_reader_sort_requires_compatibility');
});

async function exactOnlineDayFixture(t){
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1',LITERATURE_CATALOG_INDEX_READ_ENABLED:'1'};
  const day='2026-10-04';
  const dayRows=Array.from({length:6},(_,index)=>row(`10.1234/day-${index}`,index===3?'Photoredox transformation':'Nickel transformation',{
    firstOnlineDate:day,journal:index===1?'Angew':index===5?'Chem':'JACS',
    addedDate:index===4?'2026-10-06':'2026-10-05',revision:String(index+1).repeat(64),
  }));
  const allRows=[
    row('10.1234/day-before','Nickel before',{firstOnlineDate:'2026-10-03'}),
    ...dayRows,
    row('10.1234/day-after','Nickel after',{firstOnlineDate:'2026-10-05'}),
    row('10.1234/day-unknown','Nickel without date',{firstOnlineDate:null,datePrecision:'unknown'}),
    row('10.1234/leap-before','Nickel before leap day',{firstOnlineDate:'2024-02-28'}),
    row('10.1234/leap-day','Nickel on leap day',{firstOnlineDate:'2024-02-29'}),
    row('10.1234/leap-after','Nickel after leap day',{firstOnlineDate:'2024-03-01'}),
  ];
  const g=generation({recordCount:allRows.length});
  for(let start=0;start<allRows.length;start+=LITERATURE_INDEX_IMPORT_BATCH_MAX){
    const result=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:allRows.slice(start,start+LITERATURE_INDEX_IMPORT_BATCH_MAX)});
    assert.equal(result.status,200);
  }
  assert.equal((await finalizeLiteratureCatalogGeneration(env,g.catalogId)).status,200);
  const other=generation({catalogId:'e'.repeat(64),recordCount:1});
  assert.equal((await importLiteratureCatalogIndexBatch(env,{generation:other,rows:[{...dayRows[0],revision:'f'.repeat(64)}]})).status,200);
  assert.equal((await finalizeLiteratureCatalogGeneration(env,other.catalogId)).status,200);
  db.reads.length=0;
  return {db,env,g,day,dayRows};
}

test('exact online day keeps all same-day papers reachable through bounded cursors and both sort directions',async t=>{
  const {env,g,day,dayRows}=await exactOnlineDayFixture(t);
  for(const sort of ['newest','oldest']){
    let cursor='';
    const found=[];
    for(let page=0;page<3;page+=1){
      const result=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:day,dateTo:day,sort,limit:2,cursor});
      assert.equal(result.status,200);assert.equal(result.body.readPathActive,true);
      assert.equal(result.body.catalogId,g.catalogId);assert.equal(result.body.sort,sort);
      assert.equal(result.body.matched,6);assert.equal(result.body.count,2);assert.equal(result.body.limit,2);
      assert.ok(result.body.items.every(item=>item.firstOnlineDate===day));
      found.push(...result.body.items);
      assert.equal(result.body.hasMore,page<2);
      cursor=result.body.nextCursor;
      assert.equal(Boolean(cursor),page<2);
    }
    assert.deepEqual(found.map(item=>[item.doi,item.revision]),dayRows.map(item=>[item.doi,item.revision]));
    assert.equal(new Set(found.map(item=>item.doi)).size,dayRows.length);
  }
});

test('exact online day count and cursor reads seek the existing catalog/date index without history scan or sort',async t=>{
  const {db,env,g,day}=await exactOnlineDayFixture(t);
  const first=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:day,dateTo:day,limit:2});
  const second=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:day,dateTo:day,limit:2,cursor:first.body.nextCursor});
  assert.equal(first.status,200);assert.equal(second.status,200);
  const reads=db.reads.filter(read=>/FROM literature_catalog_index i\b/.test(read.sql));
  assert.equal(reads.length,4);
  for(const read of reads){
    const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+read.sql).all(...read.args).map(item=>item.detail).join('\n');
    assert.match(plan,/SEARCH i USING (?:COVERING )?INDEX idx_literature_catalog_date \(catalog_id=\? AND first_online_date=\?/);
    assert.doesNotMatch(plan,/SCAN i\b|TEMP B-TREE/);
  }
  const cursorRead=reads.at(-1);
  const cursorPlan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+cursorRead.sql).all(...cursorRead.args).map(item=>item.detail).join('\n');
  assert.match(cursorPlan,/doi>\?/);
});

test('exact online day preserves journal, search, added-date, empty-day and calendar-boundary behavior',async t=>{
  const {env,g,day}=await exactOnlineDayFixture(t);
  const options={catalogId:g.catalogId,dateFrom:day,dateTo:day,query:'nickel',
    selectedJournals:['JACS','Angew'],excludedJournals:['Angew'],addedDate:'2026-10-05',limit:1};
  const first=await queryPublishedLiteratureCatalogView(env,options);
  const next=await queryPublishedLiteratureCatalogView(env,{...options,cursor:first.body.nextCursor});
  assert.equal(first.status,200);assert.equal(first.body.matched,2);
  assert.deepEqual(first.body.items.map(item=>item.doi),['10.1234/day-0']);
  assert.deepEqual(next.body.items.map(item=>item.doi),['10.1234/day-2']);
  assert.equal(next.body.hasMore,false);
  const wrongDay=await queryPublishedLiteratureCatalogView(env,{...options,dateFrom:'2026-10-05',dateTo:'2026-10-05',cursor:first.body.nextCursor});
  assert.equal(wrongDay.status,400);assert.equal(wrongDay.body.error,'literature_catalog_view_cursor_scope_mismatch');
  const empty=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:'2026-10-02',dateTo:'2026-10-02'});
  assert.equal(empty.status,200);assert.equal(empty.body.matched,0);assert.equal(empty.body.count,0);
  assert.equal(empty.body.hasMore,false);assert.equal(empty.body.nextCursor,null);
  for(const [date,doi] of [['2024-02-28','10.1234/leap-before'],['2024-02-29','10.1234/leap-day'],['2024-03-01','10.1234/leap-after']]){
    const result=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:date,dateTo:date});
    assert.equal(result.status,200);assert.deepEqual(result.body.items.map(item=>item.doi),[doi]);
  }
  const range=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:'2024-02-28',dateTo:'2024-03-01',sort:'oldest'});
  assert.deepEqual(range.body.items.map(item=>item.doi),['10.1234/leap-before','10.1234/leap-day','10.1234/leap-after']);
  const shortQuery=await queryPublishedLiteratureCatalogView(env,{catalogId:g.catalogId,dateFrom:day,dateTo:day,query:'Ni'});
  assert.equal(shortQuery.status,422);assert.equal(shortQuery.body.error,'literature_catalog_short_query_requires_compatibility');
});

test('admin row reader covers a ready generation with bounded DOI-keyset pages',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation();
  await importLiteratureCatalogIndexBatch(env,{generation:g,rows:rows()});
  await finalizeLiteratureCatalogGeneration(env,g.catalogId);

  const first=await listLiteratureCatalogIndexRows(env,{catalogId:g.catalogId,limit:2});
  assert.equal(first.status,200);
  assert.equal(first.body.count,2);
  assert.equal(first.body.hasMore,true);
  assert.ok(first.body.nextAfterDoi);
  const second=await listLiteratureCatalogIndexRows(env,{
    catalogId:g.catalogId,limit:2,afterDoi:first.body.nextAfterDoi,
  });
  assert.equal(second.status,200);
  assert.equal(second.body.count,1);
  assert.equal(second.body.hasMore,false);
  const all=[...first.body.items,...second.body.items];
  assert.deepEqual(all.map(item=>item.doi),rows().map(item=>item.doi).sort());
  assert.equal(new Set(all.map(item=>item.revision)).size,3);
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

test('same content catalog can be reused across deployment commits while content drift still fails closed',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation();
  const firstBegin=await beginLiteratureCatalogGeneration(env,g);
  assert.equal(firstBegin.status,200);
  assert.equal(firstBegin.body.contentReused,false);

  const uiOnlyRedeploy=await beginLiteratureCatalogGeneration(env,{
    ...g,
    sourceCommit:'e'.repeat(40),
    markerBlobSha:'f'.repeat(40),
    publicationSlot:'2026-10-05T18:00:00+08:00',
  });
  assert.equal(uiOnlyRedeploy.status,200);
  assert.equal(uiOnlyRedeploy.body.contentReused,true);

  const countConflict=await beginLiteratureCatalogGeneration(env,{...g,recordCount:4});
  assert.equal(countConflict.status,409);
  assert.equal(countConflict.body.error,'literature_catalog_generation_identity_conflict');
  const doiSetConflict=await beginLiteratureCatalogGeneration(env,{...g,doiSetHash:'9'.repeat(64)});
  assert.equal(doiSetConflict.status,409);
  assert.equal(doiSetConflict.body.error,'literature_catalog_generation_identity_conflict');

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

test('import batch is hard-bounded to eight rows per Worker invocation',async t=>{
  assert.equal(LITERATURE_INDEX_IMPORT_BATCH_MAX,8);
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const g=generation({recordCount:8});
  const eight=Array.from({length:8},(_,index)=>row(
    '10.1234/batch-'+String(index+1),
    'Batch chemistry '+String(index+1),
    {revision:String((index%8)+1).repeat(64)}
  ));
  const accepted=await importLiteratureCatalogIndexBatch(env,{generation:g,rows:eight});
  assert.equal(accepted.status,200);
  assert.equal(accepted.body.batchRows,8);
  assert.equal(accepted.body.writeStatements,24);
  assert.equal(accepted.body.importedRows,8);
  assert.equal(db.batchCalls,1);
  assert.deepEqual(db.batchStatementCounts,[24]);

  const db2=new D1();t.after(()=>db2.close());
  const env2={LITERATURE_INDEX_DB:db2,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  const nine=[...eight,row('10.1234/batch-9','Batch chemistry 9',{revision:'9'.repeat(64)})];
  const rejected=await importLiteratureCatalogIndexBatch(env2,{generation:generation({recordCount:9}),rows:nine});
  assert.equal(rejected.status,400);
  assert.equal(rejected.body.error,'literature_catalog_index_batch_size_invalid');
  assert.equal(rejected.body.maxRows,8);
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

test('public literature view is hard-gated by read flag and ready catalog generation',async t=>{
  const db=new D1();t.after(()=>db.close());
  const g=generation();
  const shadowEnv={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1'};
  await importLiteratureCatalogIndexBatch(shadowEnv,{generation:g,rows:rows()});
  await finalizeLiteratureCatalogGeneration(shadowEnv,g.catalogId);

  const disabled=await queryPublishedLiteratureCatalogView(shadowEnv,{
    catalogId:g.catalogId,query:'nickel',limit:60,
  });
  assert.equal(disabled.status,503);
  assert.equal(disabled.body.error,'literature_catalog_index_read_disabled');
  assert.equal(disabled.body.readPathActive,false);

  const readEnv={...shadowEnv,LITERATURE_CATALOG_INDEX_READ_ENABLED:'1'};
  const enabled=await queryPublishedLiteratureCatalogView(readEnv,{
    catalogId:g.catalogId,query:'nickel',limit:60,
  });
  assert.equal(enabled.status,200);
  assert.equal(enabled.body.readPathActive,true);
  assert.equal(enabled.body.matched,1);
  assert.equal(enabled.body.items[0].doi,'10.1234/archive');
  const status=await getLiteratureCatalogIndexStatus(readEnv);
  assert.equal(status.status,200);
  assert.equal(status.body.readConfigured,true);
  assert.equal(status.body.readPathActive,true);

  const short=await queryPublishedLiteratureCatalogView(readEnv,{
    catalogId:g.catalogId,query:'Ni',limit:60,
  });
  assert.equal(short.status,422);
  assert.equal(short.body.error,'literature_catalog_short_query_requires_compatibility');
  assert.equal(short.body.readPathActive,false);

  const readers=await queryPublishedLiteratureCatalogView(readEnv,{
    catalogId:g.catalogId,sort:'readers',limit:60,
  });
  assert.equal(readers.status,422);
  assert.equal(readers.body.error,'literature_catalog_reader_sort_requires_compatibility');
  assert.equal(readers.body.readPathActive,false);

  const wrongGeneration=await queryPublishedLiteratureCatalogView(readEnv,{
    catalogId:'9'.repeat(64),query:'nickel',limit:60,
  });
  assert.equal(wrongGeneration.status,409);
  assert.equal(wrongGeneration.body.error,'literature_catalog_generation_not_ready');
  assert.equal(wrongGeneration.body.readPathActive,false);
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

test('public read route is production-enabled only with live canary and automatic rollback',()=>{
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.ok(source.includes('/api/admin/literature-catalog-index/query'));
  assert.ok(source.includes('/api/admin/literature-catalog-index/rows'));
  assert.ok(source.includes('/api/admin/literature-catalog-index/view'));
  assert.ok(source.includes('/api/literature/catalog-view'));
  assert.ok(source.split('/api/literature/catalog-view').length - 1 >= 2,'public path must be both CORS-readable and routed');
  assert.ok(source.split('/api/_healthcheck').length - 1 >= 2,'healthcheck must be both CORS-readable and routed for capability discovery');
  const healthBlock=source.split("url.pathname === '/api/_healthcheck'")[1]?.split("url.pathname === '/api/wechat/js-sdk-signature'")[0]||'';
  assert.ok(healthBlock.includes("{ headers: cors }"),'healthcheck GET must attach browser CORS headers');
  assert.ok(!source.includes('/api/literature/catalog-search'));
  assert.ok(!source.includes('/api/user-ui/literature-search'));

  const wrangler=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  const deploy=readFileSync(new URL('../../../.github/workflows/deploy-worker-frontend.yml',import.meta.url),'utf8');
  assert.ok(!wrangler.includes('LITERATURE_INDEX_DB'),'repository wrangler stays resource-neutral; production binding is generated');
  assert.ok(deploy.includes('binding = "LITERATURE_INDEX_DB"'));
  assert.ok(deploy.includes('LITERATURE_CATALOG_INDEX_SHADOW_ENABLED = "1"'));
  const config=deploy.split('- name: Generate frontend deployment configuration')[1]?.split('- name: Dry-run frontend Worker bundle')[0]||'';
  assert.ok(config.includes('LITERATURE_CATALOG_INDEX_READ_ENABLED = "1"'));
  assert.ok(!config.includes('LITERATURE_CATALOG_INDEX_READ_ENABLED = "0"'));
  assert.ok(deploy.includes('- name: Verify literature indexed read activation'));
  assert.ok(deploy.includes('architecture-v1/release.json?indexed-canary='));
  assert.ok(deploy.includes('- name: Roll back literature indexed read on canary failure'));
  assert.ok(deploy.includes('s/LITERATURE_CATALOG_INDEX_READ_ENABLED = "1"/LITERATURE_CATALOG_INDEX_READ_ENABLED = "0"/'));
  assert.ok(deploy.includes('literatureCatalogIndexReadEnabled===false'));
  assert.ok(deploy.includes('literatureCatalogIndexReadPathActive===false'));
  assert.ok(deploy.includes('literature-catalog-index-v1.sql'));
  const primarySchema=readFileSync(new URL('../../schema.sql',import.meta.url),'utf8');
  assert.ok(!primarySchema.includes('literature_catalog_fts'),'primary D1 schema must stay free of FTS virtual tables');
});

console.log('LITERATURE_CATALOG_INDEX_SHADOW_TESTS_READY');
