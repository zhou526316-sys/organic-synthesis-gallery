import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const userUi=readFileSync('cloudflare/worker/src/user-ui.js','utf8');
const materialized=readFileSync('cloudflare/worker/src/site-analytics-materialized.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');
const schema=readFileSync('cloudflare/schema.sql','utf8');
const migration=readFileSync('cloudflare/site-analytics-v2.sql','utf8');
const snapshotMigration=readFileSync('cloudflare/site-analytics-snapshot-v1.sql','utf8');
const snapshot=readFileSync('cloudflare/worker/src/site-analytics-snapshot.js','utf8');

function section(source,start,end){
  const a=source.indexOf(start),b=end?source.indexOf(end,a+start.length):source.length;
  assert.ok(a>=0&&b>a,'missing section: '+start);
  return source.slice(a,b);
}

test('D4a analytics migration is isolated, canonical and applied before Worker deployment',()=>{
  for(const table of [
    'site_global_stats_v2','site_daily_stats_v2','site_dimension_daily_stats_v2',
    'site_analytics_visitors_v2','site_analytics_materialized_events_v2','site_analytics_v2_backfill',
  ]){
    assert.ok(schema.includes(table),table);
    assert.ok(migration.includes(table),table);
    assert.ok(deploy.includes(table),table);
  }
  const migrate=deploy.indexOf('Apply materialized site analytics D1 migration');
  const deployStep=deploy.indexOf('Deploy frontend assets');
  assert.ok(migrate>0&&deployStep>migrate);
  assert.ok(deploy.includes('wrangler d1 execute "$D1_NAME" --remote --file=../site-analytics-v2.sql'));
});

test('public site-stats delegates all feature-flag states to one bounded snapshot reader',()=>{
  const route=section(index,"if (request.method === 'GET' && url.pathname === '/api/user-ui/site-stats')","if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts/mark')");
  assert.ok(route.includes('publicSiteAnalyticsStats(env)'));
  for(const forbidden of ['getSiteAnalyticsMaterializedReadiness','materializedSiteAnalyticsStats','siteAnalyticsStats(env)','legacy_raw_fallback']){
    assert.ok(!route.includes(forbidden),forbidden);
  }
  const publicRead=section(snapshot,'export async function publicSiteAnalyticsStats','export async function compareSiteAnalyticsPublicSnapshot');
  assert.ok(publicRead.includes('readSiteAnalyticsPublicSnapshot(env,now,{requireEnabled:primary})'));
  assert.ok(publicRead.includes("readPath:'snapshot_fallback'"));
  assert.ok(publicRead.includes("error:'analytics_bounded_stats_unavailable'"));
  for(const forbidden of ['materializedSiteAnalyticsStats','getSiteAnalyticsMaterializedReadiness','site_analytics_visitors_v2','site_pageviews_v1','materializedSourceIntegrity']){
    assert.ok(!publicRead.includes(forbidden),forbidden);
  }
});

test('raw pageview write remains primary; active materialization is synchronous with raw fallback safety',()=>{
  const track=section(userUi,'export async function trackPageView','export async function siteAnalyticsStats');
  const rawWrite=track.indexOf('INSERT INTO site_pageviews_v1');
  const activeWrite=track.indexOf('materializeSitePageViewForActiveRead');
  assert.ok(rawWrite>=0&&activeWrite>rawWrite);
  assert.ok(track.includes('siteAnalyticsMaterializedReadEnabled(env)'));
  assert.ok(track.includes('await materializeSitePageViewForActiveRead(env, event)'));
  assert.ok(userUi.includes('SITE_ANALYTICS_MATERIALIZED_ACTIVE_WRITE_FAILED'));
  assert.ok(materialized.includes('markSiteAnalyticsMaterializedUnhealthy'));
  assert.ok(materialized.includes('complete=0'));
  assert.ok(materialized.includes("last_error=excluded.last_error"));
  assert.ok(userUi.includes('safeAnalyticsShadowTask'));
  assert.ok(userUi.includes('ctx?.waitUntil'));
});

test('materialized visitor model uses exact daily and rolling uniqueness scopes plus an event idempotency ledger',()=>{
  assert.ok(migration.includes("'global','day','referrer','device','referrer_day','device_day'"));
  assert.ok(materialized.includes("scopeType:'referrer_day'"));
  assert.ok(materialized.includes("scopeType:'device_day'"));
  assert.ok(materialized.includes('first_event_id'));
  assert.ok(materialized.includes('site_analytics_materialized_events_v2'));
  assert.ok(materialized.includes("SELECT event_id FROM site_analytics_materialized_events_v2 WHERE event_id=?"));
});

test('paper-open conversion updates only materialized visitor flags and leaves reader ledger authoritative',()=>{
  const mark=section(userUi,'export async function markReader','export async function submitPaperFeedback');
  assert.ok(mark.includes('recordReaderOpen(env.DB, doi, ipHash, now)'));
  assert.ok(mark.includes('markMaterializedVisitorPaperOpen'));
  assert.ok(materialized.includes("scope_type=? AND scope_key=? AND ip_hash=? AND paper_open=0"));
});

test('D4b deployment activates materialized reads only after backfill and stable parity',()=>{
  assert.ok(deploy.includes('SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED = "1"'));
  assert.ok(deploy.includes('SITE_ANALYTICS_MATERIALIZED_READ_ENABLED = "1"'));
  const block=section(
    deploy,
    '- name: Backfill and verify materialized site analytics read path',
    '- name: Backfill and verify user library row read path',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes("phase:'D4b-site-analytics-materialized-read-live'"));
  assert.ok(block.includes('readPathActive:true'));
  assert.ok(block.includes('/api/admin/site-analytics-materialized/backfill?limit=50'));
  assert.ok(block.includes("Number(status.backfill?.lastEventId||0)!==Number(status.rawMaxEventId||0)"));
  assert.ok(block.includes("Number(after.backfill?.lastEventId||0)===Number(after.rawMaxEventId||0)"));
  assert.ok(block.includes('/api/admin/site-analytics-materialized/compare'));
  assert.ok(block.includes('passes.length<2'));
  assert.ok(block.includes('comparison.same===true'));
  assert.ok(block.includes('comparison.readPathActive===true'));
  assert.ok(block.includes('after.readPathActive===true'));
  assert.ok(block.includes('/api/user-ui/site-stats'));
  assert.ok(block.includes('publicRouteAuthoritative:false'));
  assert.ok(!block.includes("live.readPath!=='materialized'"));
  const preserve=section(
    deploy,
    '- name: Preserve materialized site analytics shadow report',
    '- name: Backfill and verify user library row read path',
  );
  assert.ok(preserve.includes('if-no-files-found: error'));
});

test('admin routes and health expose analytics materialized read activation',()=>{
  for(const path of [
    '/api/admin/site-analytics-materialized/status',
    '/api/admin/site-analytics-materialized/backfill',
    '/api/admin/site-analytics-materialized/compare',
  ]) assert.ok(index.includes(path),path);
  assert.ok(index.includes("siteAnalyticsMaterializedShadowEnabled: String(env.SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED || '') === '1'"));
  assert.ok(index.includes('siteAnalyticsMaterializedReadEnabled: siteAnalyticsMaterializedReadEnabled(env)'));
  assert.ok(deploy.includes('body?.siteAnalyticsMaterializedShadowEnabled === true'));
  assert.ok(deploy.includes('body?.siteAnalyticsMaterializedReadEnabled === true'));
  assert.ok(materialized.includes('getSiteAnalyticsMaterializedReadiness'));
  assert.ok(materialized.includes('analytics_materialized_not_fresh'));
  assert.ok(materialized.includes('reconcileMaterializedPaperOpenFlags'));
  assert.ok(materialized.includes("complete?'':lastError"));
});

test('D4c snapshot schema remains installed for the D4d public read cutover',()=>{
  assert.ok(snapshotMigration.includes('site_analytics_public_snapshot_v1'));
  assert.ok(schema.includes('site_analytics_public_snapshot_v1'));
  assert.ok(deploy.includes('Apply public analytics snapshot D1 migration'));
  assert.ok(deploy.includes('SITE_ANALYTICS_PUBLIC_SNAPSHOT_SHADOW_ENABLED = "1"'));
  assert.ok(deploy.includes('SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED = "1"'));
  assert.ok(deploy.includes('SITE_ANALYTICS_PUBLIC_SNAPSHOT_MAX_AGE_MS = "1200000"'));
  assert.ok(deploy.includes('crons = ["*/15 * * * *"]'));
  assert.ok(snapshot.includes('refreshSiteAnalyticsPublicSnapshot'));
  assert.ok(snapshot.includes('analytics_public_snapshot_source_changed'));
  assert.ok(snapshot.includes('source_reader_rows'));
  assert.ok(snapshot.includes('source_advanced_since_snapshot'));
  assert.ok(snapshot.includes('pendingRawEvents'));
});

test('D4c deployment proves stable snapshot parity independently of D4d activation state',()=>{
  const block=section(deploy,'- name: Refresh and verify public analytics snapshot shadow','- name: Backfill and verify user library row read path');
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes('/api/admin/site-analytics-snapshot/refresh'));
  assert.ok(block.includes('report.attempts.push'));
  assert.ok(block.includes("stage:'refresh'"));
  assert.ok(block.includes("stage:'live-proof'"));
  assert.ok(block.includes('/api/admin/site-analytics-snapshot/compare'));
  assert.ok(block.includes('/api/admin/site-analytics-snapshot/status'));
  assert.ok(block.includes("comparison.body?.same===true"));
  assert.ok(block.includes("comparison.body?.sourceStable===true"));
  assert.ok(!block.includes("status.body?.readConfigured===true") || block.includes('passed.status.readConfigured'));
  const route=section(index,"if (request.method === 'GET' && url.pathname === '/api/user-ui/site-stats')","if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts/mark')");
  assert.ok(route.includes('publicSiteAnalyticsStats(env)'));
});

test('D4c snapshot public read is bounded to the singleton snapshot row',()=>{
  const start=snapshot.indexOf('export async function readSiteAnalyticsPublicSnapshot');
  const end=snapshot.indexOf('export async function compareSiteAnalyticsPublicSnapshot',start);
  assert.ok(start>=0&&end>start);
  const block=snapshot.slice(start,end);
  assert.ok(block.includes('snapshotRow(env)'));
  assert.ok(!block.includes('site_analytics_visitors_v2'));
  assert.ok(!block.includes('site_pageviews_v1'));
  assert.ok(!block.includes('materializedSiteAnalyticsStats'));
});

test('D4d primary snapshot failure cannot fall through to another read model',()=>{
  const publicRead=section(snapshot,'export async function publicSiteAnalyticsStats','export async function compareSiteAnalyticsPublicSnapshot');
  assert.ok(publicRead.includes('const primary=siteAnalyticsPublicSnapshotReadEnabled(env)'));
  assert.ok(publicRead.includes('if(primary) return result;'));
  assert.ok(publicRead.indexOf('if(primary) return result;')<publicRead.indexOf("readPath:'snapshot_fallback'"));
  assert.ok(publicRead.includes("error:'analytics_public_snapshot_read_error'"));
  assert.ok(!publicRead.includes('materializedSiteAnalyticsStats'));
  assert.ok(deploy.includes('SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED = "1"'));
});

test('D4d canonical deploy has snapshot activation canary and automatic rollback',()=>{
  const block=section(
    deploy,
    '- name: Verify public analytics snapshot activation',
    '- name: Backfill and verify user library row read path',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes('snapshot_read_flag_disabled'));
  assert.ok(block.includes('D4c snapshot parity proof missing'));
  assert.ok(block.includes("proof.ok!==true||proof.generationFenced!==true||proof.same!==true"));
  assert.ok(block.includes('sameGeneration'));
  assert.ok(!block.includes("const refresh=await call('/api/admin/site-analytics-snapshot/refresh'"));
  assert.ok(!block.includes("const comparison=await call('/api/admin/site-analytics-snapshot/compare'"));
  assert.ok(block.includes('/api/user-ui/site-stats'));
  assert.ok(block.includes("live.body?.readPath==='snapshot'"));
  assert.ok(block.includes("live.body?.generation==='site-pageview-v3-snapshot'"));
  assert.ok(block.includes("siteAnalyticsPublicSnapshotReadEnabled===true"));
  assert.ok(block.includes('- name: Roll back public analytics snapshot read on activation failure'));
  assert.ok(block.includes("SITE_ANALYTICS_PUBLIC_SNAPSHOT_READ_ENABLED = \"0\""));
  assert.ok(!block.includes("live.body?.readPath==='materialized'"));
  assert.ok(block.includes("['legacy_raw_fallback','materialized']"));
  assert.ok(block.includes("live.body?.readPath==='snapshot_fallback'"));
  assert.ok(block.includes("live.body?.readPath==='bounded_unavailable'"));
  assert.ok(block.includes("unsafeRaw"));
  assert.ok(block.includes('/api/admin/site-analytics-materialized/backfill?limit=100'));
  assert.ok(!block.includes('/api/admin/site-analytics-materialized/compare'));
  assert.ok(block.includes('rolledBack=true'));
  assert.ok(block.includes('- name: Preserve public analytics snapshot activation report'));
});

test('D4e snapshot cron repairs materialized source in bounded pages before refresh',()=>{
  const scheduled=section(index,'async scheduled(controller, env, ctx)','ARTICLE_FIGURE_STAGE_PROMOTION_CRON_SKIPPED');
  assert.ok(scheduled.includes('readiness.ready!==true'));
  assert.ok(scheduled.includes('repairPages<4'));
  assert.ok(scheduled.includes('backfillSiteAnalyticsMaterializedPage(env,100)'));
  assert.ok(scheduled.includes('refreshSiteAnalyticsPublicSnapshot'));
});

test('D4c shadow and D4d activation can self-heal and wait for edge propagation',()=>{
  const block=section(deploy,'- name: Refresh and verify public analytics snapshot shadow','- name: Backfill and verify user library row read path');
  assert.ok(block.includes('/api/admin/site-analytics-materialized/backfill?limit=50'));
  assert.ok(block.includes('siteAnalyticsSnapshotRepairAttempt'));
  assert.ok(block.includes("stage:'source-not-ready'"));
  assert.ok(block.includes('postRepairStatus'));
  assert.ok(block.includes('propagationPasses<2'));
  assert.ok(block.includes('probe<=20'));
  assert.ok(block.includes("stage:'propagation'"));
  assert.ok(block.includes('d4d-propagation='));
});

test('analytics behavioral regression runs before any canonical remote mutation',()=>{
  const gate=deploy.indexOf('- name: Verify analytics source integrity and bounded public reads');
  const remote=deploy.indexOf('- name: Resolve existing Cloudflare bindings');
  assert.ok(gate>0&&remote>gate);
  const block=section(deploy,'- name: Verify analytics source integrity and bounded public reads','- name: Install frontend dependencies');
  assert.ok(block.includes('node --test cloudflare/worker/scripts/test-site-analytics-materialized.mjs'));
  assert.ok(block.includes('node --test scripts/test-site-analytics-materialized-deployment-contract.mjs'));
  assert.ok(!block.includes('continue-on-error'));
});

console.log('SITE_ANALYTICS_MATERIALIZED_DEPLOYMENT_CONTRACT_PASS');
