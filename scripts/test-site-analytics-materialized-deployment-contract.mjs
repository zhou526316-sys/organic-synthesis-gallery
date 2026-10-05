import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy=readFileSync('.github/workflows/deploy-worker-frontend.yml','utf8');
const userUi=readFileSync('cloudflare/worker/src/user-ui.js','utf8');
const materialized=readFileSync('cloudflare/worker/src/site-analytics-materialized.js','utf8');
const index=readFileSync('cloudflare/worker/src/index.js','utf8');
const schema=readFileSync('cloudflare/schema.sql','utf8');
const migration=readFileSync('cloudflare/site-analytics-v2.sql','utf8');

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

test('legacy raw site_pageviews_v1 remains the only public site-stats read path in D4a',()=>{
  const stats=section(userUi,'export async function siteAnalyticsStats','export async function markReader');
  assert.ok(stats.includes('FROM site_pageviews_v1'));
  assert.ok(!stats.includes('site_global_stats_v2'));
  assert.ok(!stats.includes('materializedSiteAnalyticsStats'));
  const route=section(index,"if (request.method === 'GET' && url.pathname === '/api/user-ui/site-stats')","if (request.method === 'POST' && url.pathname === '/api/user-ui/reader-counts/mark')");
  assert.ok(route.includes('siteAnalyticsStats(env)'));
  assert.ok(!route.includes('materializedSiteAnalyticsStats'));
});

test('raw pageview write remains primary and analytics materialization is fail-open',()=>{
  const track=section(userUi,'export async function trackPageView','export async function siteAnalyticsStats');
  const rawWrite=track.indexOf('INSERT INTO site_pageviews_v1');
  const shadowWrite=track.indexOf('materializeSitePageViewEvent');
  assert.ok(rawWrite>=0&&shadowWrite>rawWrite);
  assert.ok(userUi.includes('SITE_ANALYTICS_MATERIALIZED_WRITE_FAILED'));
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

test('D4a deployment backfills raw events and requires two stable full-output parity passes',()=>{
  assert.ok(deploy.includes('SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED = "1"'));
  const block=section(
    deploy,
    '- name: Backfill and compare materialized site analytics shadow',
    '- name: Backfill and compare user library row shadow',
  );
  assert.ok(block.includes('continue-on-error: true'));
  assert.ok(block.includes("phase:'D4a-site-analytics-materialized-shadow-live'"));
  assert.ok(block.includes('readPathActive:false'));
  assert.ok(block.includes('/api/admin/site-analytics-materialized/backfill?limit=50'));
  assert.ok(block.includes('/api/admin/site-analytics-materialized/compare'));
  assert.ok(block.includes('passes.length<2'));
  assert.ok(block.includes('comparison.same===true'));
  assert.ok(block.includes('after.rawEvents===after.materializedEvents'));
  const preserve=section(
    deploy,
    '- name: Preserve materialized site analytics shadow report',
    '- name: Backfill and compare user library row shadow',
  );
  assert.ok(preserve.includes('if-no-files-found: error'));
});

test('admin routes and health expose analytics shadow without activating production reads',()=>{
  for(const path of [
    '/api/admin/site-analytics-materialized/status',
    '/api/admin/site-analytics-materialized/backfill',
    '/api/admin/site-analytics-materialized/compare',
  ]) assert.ok(index.includes(path),path);
  assert.ok(index.includes("siteAnalyticsMaterializedShadowEnabled: String(env.SITE_ANALYTICS_MATERIALIZED_SHADOW_ENABLED || '') === '1'"));
  assert.ok(deploy.includes('body?.siteAnalyticsMaterializedShadowEnabled === true'));
  assert.ok(materialized.includes('readPathActive:false'));
});

console.log('SITE_ANALYTICS_MATERIALIZED_DEPLOYMENT_CONTRACT_PASS');
