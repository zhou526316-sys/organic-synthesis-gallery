import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  backfillSiteAnalyticsMaterializedPage,
  compareSiteAnalyticsBodies,
  getSiteAnalyticsMaterializedReadiness,
  getSiteAnalyticsMaterializedStatus,
  markMaterializedVisitorPaperOpen,
  materializeSitePageViewEvent,
  materializeSitePageViewForActiveRead,
  materializedSiteAnalyticsStats,
} from '../src/site-analytics-materialized.js';
import {
  compareSiteAnalyticsPublicSnapshot,
  getSiteAnalyticsPublicSnapshotStatus,
  readSiteAnalyticsPublicSnapshot,
  refreshSiteAnalyticsPublicSnapshot,
} from '../src/site-analytics-snapshot.js';
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
      CREATE TABLE site_analytics_public_snapshot_v1 (
        id INTEGER PRIMARY KEY CHECK(id=1),snapshot_json TEXT NOT NULL,
        source_raw_max_event_id INTEGER NOT NULL DEFAULT 0,
        source_materialized_max_event_id INTEGER NOT NULL DEFAULT 0,
        source_global_pv INTEGER NOT NULL DEFAULT 0,
        source_reader_rows INTEGER NOT NULL DEFAULT 0,
        source_reader_max_opened_at INTEGER NOT NULL DEFAULT 0,
        generated_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
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
const envFor=(db,read=false)=>({DB:db,SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED:'1',...(read?{SITE_ANALYTICS_MATERIALIZED_READ_ENABLED:'1'}:{})});

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


test('active materialized read readiness follows the raw watermark and realtime writes close the gap',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db,true);
  const first=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:00:00Z')});
  const backfill=await backfillSiteAnalyticsMaterializedPage(env,100);
  assert.equal(backfill.body.complete,true);

  let readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,true);
  let status=await getSiteAnalyticsMaterializedStatus(env);
  assert.equal(status.body.readPathActive,true);

  const second=insertRaw(db,{ip:'b',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:05:00Z')});
  readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,false);

  const materialized=await materializeSitePageViewForActiveRead(env,row(db,second));
  assert.equal(materialized.materialized,true);
  readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,true);
  assert.equal(readiness.rawMaxEventId,second);
  assert.equal(readiness.materializedMaxEventId,second);
  assert.equal(readiness.scannedEvents,second);
  assert.equal(readiness.materializedEvents,second);

  status=await getSiteAnalyticsMaterializedStatus(env);
  assert.equal(status.body.readPathActive,true);
  assert.equal(status.body.rawEvents,2);
  assert.equal(status.body.materializedEvents,2);
  assert.equal(Number(first),1);
});

test('D4b catch-up advances a stale D4a shadow watermark through already-materialized duplicates',async t=>{
  const db=new D1();t.after(()=>db.close());
  const shadowEnv=envFor(db);
  const readEnv=envFor(db,true);

  const first=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:00:00Z')});
  const initial=await backfillSiteAnalyticsMaterializedPage(shadowEnv,100);
  assert.equal(initial.body.complete,true);
  assert.equal(initial.body.lastEventId,first);

  const second=insertRaw(db,{ip:'b',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:05:00Z')});
  const shadowWrite=await materializeSitePageViewEvent(shadowEnv,row(db,second));
  assert.equal(shadowWrite.materialized,true);

  const beforeStatus=await getSiteAnalyticsMaterializedStatus(readEnv);
  assert.equal(beforeStatus.body.rawEvents,2);
  assert.equal(beforeStatus.body.materializedEvents,2);
  assert.equal(beforeStatus.body.globalPv,2);
  assert.equal(beforeStatus.body.backfill.lastEventId,first);
  assert.equal(beforeStatus.body.readPathActive,false);
  assert.equal((await getSiteAnalyticsMaterializedReadiness(readEnv)).ready,false);

  const catchup=await backfillSiteAnalyticsMaterializedPage(readEnv,100);
  assert.equal(catchup.status,200);
  assert.equal(catchup.body.complete,true);
  assert.equal(catchup.body.lastEventId,second);
  assert.equal(catchup.body.pageDuplicates,1);

  const after=await getSiteAnalyticsMaterializedReadiness(readEnv);
  assert.equal(after.ready,true);
  assert.equal(after.backfillLastEventId,second);
  assert.equal(after.rawMaxEventId,second);
  assert.equal(after.materializedMaxEventId,second);
  assert.equal(after.scannedEvents,2);
  assert.equal(after.materializedEvents,1);
  assert.equal(after.duplicateEvents,1);
});

test('readiness does not assume autoincrement ids are dense',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db,true);
  const first=insertRaw(db,{ip:'discarded',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T00:50:00Z')});
  db.sqlite.prepare('DELETE FROM site_pageviews_v1 WHERE id=?').run(first);
  const kept=insertRaw(db,{ip:'kept',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:00:00Z')});
  assert.ok(kept>1);
  const backfill=await backfillSiteAnalyticsMaterializedPage(env,100);
  assert.equal(backfill.body.complete,true);
  const readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,true);
  assert.equal(readiness.rawMaxEventId,kept);
  assert.equal(readiness.scannedEvents,1);
  assert.equal(readiness.globalPv,1);
});

test('active materialization failure disables fast reads until backfill repair',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env=envFor(db,true);
  const id=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:Date.parse('2026-10-05T01:00:00Z')});
  await backfillSiteAnalyticsMaterializedPage(env,100);
  assert.equal((await getSiteAnalyticsMaterializedReadiness(env)).ready,true);

  await assert.rejects(
    materializeSitePageViewForActiveRead(env,{
      id:id+1,ip_hash:'b',referrer_host:'',device_type:'invalid',
      beijing_date:'2026-10-05',viewed_at:Date.parse('2026-10-05T01:10:00Z'),
    }),
    /analytics_materialized_event_invalid/,
  );
  const readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,false);
  const state=db.sqlite.prepare('SELECT complete,failed_events,last_error FROM site_analytics_v2_backfill WHERE id=1').get();
  assert.equal(Number(state.complete),0);
  assert.equal(Number(state.failed_events),1);
  assert.match(String(state.last_error),/analytics_materialized_event_invalid/);

  const repaired=await backfillSiteAnalyticsMaterializedPage(env,100);
  assert.equal(repaired.status,200);
  assert.equal(repaired.body.complete,true);
  const recovered=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(recovered.ready,true);
  assert.equal(recovered.lastError,'');
  assert.equal(recovered.failedEvents,1);
});

test('D4c public snapshot refresh preserves materialized semantics and reads one bounded row',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={...envFor(db,true),SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED:'1',SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED:'0'};
  const fixedNow=Date.parse('2026-10-05T02:00:00Z');
  for(const event of [
    {ip:'a',ref:'google.com',device:'desktop',date:'2026-10-05',viewedAt:fixedNow-3000},
    {ip:'b',ref:'',device:'mobile',date:'2026-10-05',viewedAt:fixedNow-2000},
  ]){
    const id=insertRaw(db,event);
    await materializeSitePageViewEvent(env,row(db,id));
  }
  const backfill=await backfillSiteAnalyticsMaterializedPage(env,100);
  assert.equal(backfill.body.complete,true);
  const refreshed=await refreshSiteAnalyticsPublicSnapshot(env,fixedNow);
  assert.equal(refreshed.status,200);
  const status=await getSiteAnalyticsPublicSnapshotStatus(env,fixedNow+1000);
  assert.equal(status.body.exists,true);assert.equal(status.body.valid,true);assert.equal(status.body.fresh,true);
  assert.equal(status.body.readConfigured,false);
  const shadowRead=await readSiteAnalyticsPublicSnapshot(env,fixedNow+1000,{requireEnabled:false});
  assert.equal(shadowRead.status,200);assert.equal(shadowRead.body.readPath,'snapshot');
  assert.equal(shadowRead.body.generation,'site-pageview-v3-snapshot');assert.equal(shadowRead.body.allTime.pv,2);
  const compare=await compareSiteAnalyticsPublicSnapshot(env,fixedNow);
  assert.equal(compare.status,200);assert.equal(compare.body.same,true);assert.equal(compare.body.sourceStable,true);
});

test('D4c snapshot public read fails closed while disabled and when stale',async t=>{
  const db=new D1();t.after(()=>db.close());
  const fixedNow=Date.parse('2026-10-05T02:00:00Z');
  const env={...envFor(db,true),SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED:'1',
    SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED:'0',SITE_ANALYTICS_PUBLIC_SNAPSHOT_MAX_AGE_MS:'60000'};
  const id=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:fixedNow-1000});
  await materializeSitePageViewEvent(env,row(db,id));
  await backfillSiteAnalyticsMaterializedPage(env,100);
  assert.equal((await refreshSiteAnalyticsPublicSnapshot(env,fixedNow)).status,200);
  const disabled=await readSiteAnalyticsPublicSnapshot(env,fixedNow+1000);
  assert.equal(disabled.status,503);assert.equal(disabled.body.error,'analytics_public_snapshot_read_disabled');
  const enabled={...env,SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED:'1'};
  const stale=await readSiteAnalyticsPublicSnapshot(enabled,fixedNow+61001);
  assert.equal(stale.status,503);assert.equal(stale.body.error,'analytics_public_snapshot_stale');
});

test('D4e snapshot source can remain coherent while backfill complete flag is false',async t=>{
  const db=new D1();t.after(()=>db.close());
  const env={...envFor(db,true),SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED:'1'};
  const now=Date.parse('2026-10-05T02:00:00Z');
  const first=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:now-2000});
  await materializeSitePageViewEvent(env,row(db,first));
  await backfillSiteAnalyticsMaterializedPage(env,100);
  db.sqlite.prepare("UPDATE site_analytics_v2_backfill SET complete=0,last_error='' WHERE id=1").run();
  const readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,false);
  assert.equal(readiness.snapshotSourceReady,true);
  assert.equal((await refreshSiteAnalyticsPublicSnapshot(env,now)).status,200);
});

test('D4e snapshot source stays valid across one in-flight raw event',async t=>{
  const db=new D1();t.after(()=>db.close());
  const fixedNow=Date.parse('2026-10-05T02:00:00Z');
  const env={...envFor(db,true),SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED:'1',SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED:'0'};
  const first=insertRaw(db,{ip:'a',date:'2026-10-05',viewedAt:fixedNow-2000});
  await materializeSitePageViewEvent(env,row(db,first));
  await backfillSiteAnalyticsMaterializedPage(env,100);
  insertRaw(db,{ip:'b',date:'2026-10-05',viewedAt:fixedNow-1000});
  const readiness=await getSiteAnalyticsMaterializedReadiness(env);
  assert.equal(readiness.ready,false);
  assert.equal(readiness.snapshotSourceReady,true);
  assert.equal(readiness.lagEvents,1);
  assert.equal(readiness.reason,'analytics_materialized_realtime_lag');
  assert.equal((await refreshSiteAnalyticsPublicSnapshot(env,fixedNow)).status,200);
  const read=await readSiteAnalyticsPublicSnapshot(env,fixedNow+100,{requireEnabled:false});
  assert.equal(read.status,200);assert.equal(read.body.allTime.pv,1);
});

console.log('SITE_ANALYTICS_MATERIALIZED_SHADOW_TESTS_READY');
