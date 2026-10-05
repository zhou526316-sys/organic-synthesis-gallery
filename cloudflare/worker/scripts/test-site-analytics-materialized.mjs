import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillSiteAnalyticsMaterializedPage,
  compareSiteAnalyticsBodies,
  getSiteAnalyticsMaterializedStatus,
  markMaterializedVisitorPaperOpen,
  materializeSitePageViewEvent,
  materializedSiteAnalyticsStats,
} from '../src/site-analytics-materialized.js';
import { siteAnalyticsStats } from '../src/user-ui.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){const r=this.db.sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes||0),last_row_id:Number(r.lastInsertRowid||0)},results:[]};}
  async first(){const row=this.db.sqlite.prepare(this.sql).get(...this.args);return row===undefined?null:row;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.args),meta:{}};}
}
class D1 {
  constructor(){
    this.sqlite=new DatabaseSync(':memory:');
    this.sqlite.exec(`
      CREATE TABLE site_pageviews_v1 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_hash TEXT NOT NULL,
        page_path TEXT NOT NULL,
        referrer_host TEXT NOT NULL DEFAULT '',
        device_type TEXT NOT NULL,
        beijing_date TEXT NOT NULL,
        viewed_at INTEGER NOT NULL
      );
      CREATE TABLE paper_open_readers_v3 (
        doi TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        first_opened_at INTEGER NOT NULL,
        PRIMARY KEY (doi,ip_hash)
      );
      CREATE TABLE site_global_stats_v2 (
        id INTEGER PRIMARY KEY CHECK(id=1),pv INTEGER NOT NULL DEFAULT 0,uv INTEGER NOT NULL DEFAULT 0,
        first_viewed_at INTEGER,last_viewed_at INTEGER,updated_at INTEGER NOT NULL
      );
      CREATE TABLE site_daily_stats_v2 (
        beijing_date TEXT PRIMARY KEY,pv INTEGER NOT NULL DEFAULT 0,uv INTEGER NOT NULL DEFAULT 0,
        first_viewed_at INTEGER,last_viewed_at INTEGER,updated_at INTEGER NOT NULL
      );
      CREATE TABLE site_dimension_daily_stats_v2 (
        dimension_type TEXT NOT NULL,beijing_date TEXT NOT NULL,dimension_value TEXT NOT NULL,
        pv INTEGER NOT NULL DEFAULT 0,uv INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,
        PRIMARY KEY(dimension_type,beijing_date,dimension_value)
      );
      CREATE TABLE site_analytics_visitors_v2 (
        scope_type TEXT NOT NULL,scope_key TEXT NOT NULL,ip_hash TEXT NOT NULL,first_event_id INTEGER NOT NULL,
        first_viewed_at INTEGER NOT NULL,last_viewed_at INTEGER NOT NULL,last_seen_date TEXT NOT NULL,
        pageviews INTEGER NOT NULL DEFAULT 1,paper_open INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(scope_type,scope_key,ip_hash)
      );
      CREATE TABLE site_analytics_materialized_events_v2 (
        event_id INTEGER PRIMARY KEY,materialized_at INTEGER NOT NULL
      );
      CREATE TABLE site_analytics_v2_backfill (
        id INTEGER PRIMARY KEY CHECK(id=1),last_event_id INTEGER NOT NULL DEFAULT 0,complete INTEGER NOT NULL DEFAULT 0,
        scanned_events INTEGER NOT NULL DEFAULT 0,materialized_events INTEGER NOT NULL DEFAULT 0,
        duplicate_events INTEGER NOT NULL DEFAULT 0,failed_events INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,last_error TEXT NOT NULL DEFAULT ''
      );
    `);
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    this.sqlite.exec('BEGIN');
    try{
      const out=[];
      for(const statement of statements) out.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return out;
    }catch(error){
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close(){this.sqlite.close();}
}
const envFor=db=>({DB:db,SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED:'1'});

function insertRaw(db,{ip,ref='',device='desktop',date,viewedAt,path='/'}){
  const r=db.sqlite.prepare(`
    INSERT INTO site_pageviews_v1(ip_hash,page_path,referrer_host,device_type,beijing_date,viewed_at)
    VALUES(?,?,?,?,?,?)
  `).run(ip,path,ref,device,date,viewedAt);
  return Number(r.lastInsertRowid);
}
function row(db,id){
  return db.sqlite.prepare(`
    SELECT id,ip_hash,referrer_host,device_type,beijing_date,viewed_at FROM site_pageviews_v1 WHERE id=?
  `).get(id);
}

test('materialized analytics keeps PV/UV exact across repeat visits, days, referrers and devices',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  const day1='2026-10-04',day2='2026-10-05';
  const t1=Date.parse('2026-10-04T01:00:00Z'),t2=Date.parse('2026-10-04T02:00:00Z');
  const t3=Date.parse('2026-10-04T03:00:00Z'),t4=Date.parse('2026-10-05T01:00:00Z');
  const ids=[
    insertRaw(db,{ip:'a',ref:'google.com',device:'desktop',date:day1,viewedAt:t1}),
    insertRaw(db,{ip:'a',ref:'google.com',device:'desktop',date:day1,viewedAt:t2}),
    insertRaw(db,{ip:'b',ref:'',device:'mobile',date:day1,viewedAt:t3}),
    insertRaw(db,{ip:'a',ref:'google.com',device:'desktop',date:day2,viewedAt:t4}),
  ];
  for(const id of ids) assert.equal((await materializeSitePageViewEvent(env,row(db,id))).materialized,true);
  const duplicate=await materializeSitePageViewEvent(env,row(db,ids[0]));
  assert.equal(duplicate.duplicate,true);

  const global=db.sqlite.prepare('SELECT pv,uv FROM site_global_stats_v2 WHERE id=1').get();
  assert.deepEqual([Number(global.pv),Number(global.uv)],[4,2]);
  const firstDay=db.sqlite.prepare('SELECT pv,uv FROM site_daily_stats_v2 WHERE beijing_date=?').get(day1);
  assert.deepEqual([Number(firstDay.pv),Number(firstDay.uv)],[3,2]);
  const refDay=db.sqlite.prepare(`
    SELECT pv,uv FROM site_dimension_daily_stats_v2
    WHERE dimension_type='referrer' AND beijing_date=? AND dimension_value='google.com'
  `).get(day1);
  assert.deepEqual([Number(refDay.pv),Number(refDay.uv)],[2,1]);
});

test('materialized output matches legacy raw analytics including paper-open conversion',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  const fixedNow=Date.parse('2026-10-05T02:00:00Z');
  const oldNow=Date.now; Date.now=()=>fixedNow; t.after(()=>{Date.now=oldNow;});
  const events=[
    {ip:'a',ref:'google.com',device:'desktop',date:'2026-10-04',viewedAt:Date.parse('2026-10-04T01:00:00Z')},
    {ip:'a',ref:'google.com',device:'desktop',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:00:00Z')},
    {ip:'b',ref:'',device:'mobile',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:20:00Z')},
  ];
  for(const e of events){
    const id=insertRaw(db,e);
    await materializeSitePageViewEvent(env,row(db,id));
  }
  db.sqlite.prepare('INSERT INTO paper_open_readers_v3(doi,ip_hash,first_opened_at) VALUES(?,?,?)')
    .run('10.1234/a','a',fixedNow);
  db.sqlite.prepare('INSERT INTO paper_open_readers_v3(doi,ip_hash,first_opened_at) VALUES(?,?,?)')
    .run('10.1234/b','b',fixedNow);
  await markMaterializedVisitorPaperOpen(env,'a','2026-10-05');
  await markMaterializedVisitorPaperOpen(env,'b','2026-10-05');

  const legacy=await siteAnalyticsStats(env);
  const materialized=await materializedSiteAnalyticsStats(env,fixedNow);
  const comparison=compareSiteAnalyticsBodies(legacy.body,materialized.body);
  assert.equal(comparison.same,true,JSON.stringify(comparison,null,2));
});

test('historical backfill is cursor-based, idempotent and reaches raw event parity',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  for(let i=0;i<5;i+=1){
    insertRaw(db,{
      ip:i%2?'a':'b',ref:i%2?'x.example':'',device:i%2?'desktop':'mobile',
      date:'2026-10-05',viewedAt:Date.parse('2026-10-05T00:00:00Z')+i*1000,
    });
  }
  let result=await backfillSiteAnalyticsMaterializedPage(env,2);
  assert.equal(result.body.complete,false);
  result=await backfillSiteAnalyticsMaterializedPage(env,2);
  assert.equal(result.body.complete,false);
  result=await backfillSiteAnalyticsMaterializedPage(env,2);
  assert.equal(result.body.complete,true);

  const status=await getSiteAnalyticsMaterializedStatus(env);
  assert.equal(status.body.rawEvents,5);
  assert.equal(status.body.materializedEvents,5);
  assert.equal(status.body.globalPv,5);
  assert.equal(status.body.globalUv,2);
  assert.equal(status.body.backfill.complete,true);

  const again=await backfillSiteAnalyticsMaterializedPage(env,2);
  assert.equal(again.body.complete,true);
  const after=await getSiteAnalyticsMaterializedStatus(env);
  assert.equal(after.body.materializedEvents,5);
  assert.equal(after.body.globalPv,5);
});

test('paper-open marking is idempotent and only affects visitor scopes that already exist',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db);
  const id=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:00:00Z')});
  await materializeSitePageViewEvent(env,row(db,id));
  const first=await markMaterializedVisitorPaperOpen(env,'a','2026-10-05');
  const second=await markMaterializedVisitorPaperOpen(env,'a','2026-10-05');
  assert.equal(first.updated,2);
  assert.equal(second.updated,0);
  const missing=await markMaterializedVisitorPaperOpen(env,'never-seen','2026-10-05');
  assert.equal(missing.updated,0);
});

console.log('SITE_ANALYTICS_MATERIALIZED_SHADOW_TESTS_READY');
