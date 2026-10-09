import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';

const execFileAsync=promisify(execFile);
const REPO_DOI='10.1002/anie.4335022';
const BAD_HASH='35f10c5321cd43179a4c71c73e388da8';
const BAD_R2='toc-cache/images/b5f8302e67e9148b29cd7f422e73e6d3.png';
const REASON='verified_scope_art_not_toc_20261009';
const DB='organic-synthesis-gallery';
const TRIGGER_PATH='audit/automation-triggers/tm-angew-4335022-cas-quarantine.json';
const API='https://api.gczhouwld.com';
const SITE='https://gallery.gczhouwld.com';
const TARGET_BRIDGE='2.2.76';
const TARGET_ENGINE='6.2.57';

function safeSql() {
  const rowQuery="SELECT doi,available,r2_key,content_hash,reason FROM toc_assets WHERE doi='"+REPO_DOI+"' LIMIT 2";
  const updateQuery="UPDATE toc_assets SET available=0,reason='"+REASON+
    "',checked_at=CAST(strftime('%s','now') AS INTEGER)*1000,updated_at=CAST(strftime('%s','now') AS INTEGER)*1000"+
    " WHERE doi='"+REPO_DOI+"' AND available=1 AND content_hash='"+BAD_HASH+"' AND r2_key='"+BAD_R2+"'";
  return {rowQuery,updateQuery};
}
function parseD1(value) {
  const raw=JSON.parse(String(value||''));
  const blocks=Array.isArray(raw)?raw:[raw];
  assert.ok(blocks.length>0 && blocks.every(b=>b&&b.success!==false),'unexpected D1 result');
  const rows=blocks.flatMap(b=>Array.isArray(b.results)?b.results:[]);
  return rows;
}
function rowState(row) {
  if(!row)return 'missing_row';
  if(String(row.doi||'').toLowerCase()!==REPO_DOI)return 'wrong_doi';
  if(String(row.content_hash||'').toLowerCase()!==BAD_HASH || String(row.r2_key||'')!==BAD_R2)
    return 'different_media_preserved';
  if(Number(row.available)===1)return 'confirmed_bad_toc_available';
  if(Number(row.available)===0 && String(row.reason||'')===REASON)return 'already_quarantined';
  return 'unexpected_row_state';
}
function noSecrets(value) {
  return String(value||'').replace(/Bearer\s+\S+/ig,'[redacted]')
    .replace(/(?:token|secret|password|authorization)\s*[:=]\s*\S+/ig,'[redacted]').slice(0,300);
}
async function d1(sql) {
  const env={...process.env,WRANGLER_SEND_METRICS:'false'};
  const {stdout}=await execFileAsync('npx',['--yes','wrangler@4.136.2','d1','execute',DB,
    '--remote','--json','--command',sql],{env,timeout:110000,maxBuffer:3_000_000});
  return parseD1(stdout);
}
async function get(url) {
  const res=await fetch(url,{method:'GET',redirect:'error',
    headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,200,'unavailable public read '+new URL(url).pathname);
  const raw=await res.text();
  assert.ok(raw.length<1_200_000,'public read oversized');
  return raw;
}
async function checkLive() {
  for(const origin of [SITE,API]) {
    const script=await get(origin+'/gallery-vpn-bridge.user.js?toc-cas-version='+Date.now());
    const bridge=script.match(/^\/\/ @version\s+(\S+)/m)?.[1];
    const engine=script.match(/var INSTALL_REVISION = '([^']+)'/)?.[1];
    assert.equal(bridge,TARGET_BRIDGE,origin+' canonical Bridge not deployed');
    assert.equal(engine,TARGET_ENGINE,origin+' canonical engine not deployed');
    assert.ok(script.includes('verifiedWrongWileyTocSource'),origin+' exact source gate missing');
  }
}
async function apiToc() {
  const r=JSON.parse(await get(API+'/api/toc?doi='+encodeURIComponent(REPO_DOI)+'&toc-cas='+Date.now()));
  return {doi:REPO_DOI,available:r.available===true,
    reason:String(r.reason||'').slice(0,100),
    contentHash:String(r.contentHash||'').toLowerCase()};
}
async function reportWrite(report) {
  const dest=path.join(process.env.RUNNER_TEMP||'/tmp','tm-angew-4335022-cas-report.json');
  await mkdir(path.dirname(dest),{recursive:true});
  await writeFile(dest,JSON.stringify(report,null,2)+'\n');
  console.log('TM_ANGEW_4335022_CAS '+JSON.stringify(report));
}
const args=process.argv.slice(2);
if(args.includes('--contract-check')) {
  const {rowQuery,updateQuery}=safeSql();
  assert.ok(!/DELETE\s+FROM|DROP\s+TABLE|REPLACE\s+INTO/i.test(rowQuery+' '+updateQuery));
  assert.ok(updateQuery.includes("WHERE doi='"+REPO_DOI+"' AND available=1 AND content_hash='"+BAD_HASH+
    "' AND r2_key='"+BAD_R2+"'"));
  assert.equal(rowState({doi:REPO_DOI,available:1,content_hash:BAD_HASH,r2_key:BAD_R2}),
    'confirmed_bad_toc_available');
  assert.equal(rowState({doi:REPO_DOI,available:1,content_hash:'new-valid-hash',r2_key:BAD_R2}),
    'different_media_preserved');
  assert.equal(rowState({doi:REPO_DOI,available:0,content_hash:BAD_HASH,r2_key:BAD_R2,reason:REASON}),
    'already_quarantined');
  console.log('TM_ANGEW_4335022_CAS_CONTRACT '+JSON.stringify({
    passed:true,onlyDoi:REPO_DOI,expectedHash:BAD_HASH,expectedR2:BAD_R2,
    noGeneralDelete:true,requiresExactInstalledVersion:true,quarantineOnly:true}));
} else if(args.includes('--execute-production')) {
  const report={schemaVersion:'tm-angew-4335022-cas-once-v1',startedAt:new Date().toISOString(),
    productionDatabase:DB,doi:REPO_DOI,expectedHash:BAD_HASH,expectedR2Key:BAD_R2,
    r2Deletes:0,otherDoiWrites:0,publisherRequests:0,privatePdfRequests:0,d1Writes:0,
    result:'incomplete'};
  try {
    assert.ok(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID,
      'existing Cloudflare authorization not configured');
    const trigger=JSON.parse(await readFile(TRIGGER_PATH,'utf8'));
    assert.deepEqual({
      schemaVersion:trigger.schemaVersion,execute:trigger.execute,doi:trigger.doi,
      expectedHash:trigger.expectedHash,expectedR2Key:trigger.expectedR2Key,
      reason:trigger.reason
    },{
      schemaVersion:'tm-angew-4335022-cas-request-v1',execute:true,doi:REPO_DOI,
      expectedHash:BAD_HASH,expectedR2Key:BAD_R2,reason:REASON
    },'trigger authority must match exact immutable confirmed DOI, hash and R2 object');
    await checkLive();
    report.deployedVersionVerified=true;
    report.beforeApi=await apiToc();
    const before=await d1(safeSql().rowQuery);
    assert.equal(before.length,1,'expected exactly one toc_assets row');
    report.before={state:rowState(before[0]),hash:String(before[0].content_hash||''),
      available:Number(before[0].available),r2Key:String(before[0].r2_key||'')};
    if(report.before.state==='confirmed_bad_toc_available') {
      await d1(safeSql().updateQuery);
      report.d1Writes=1;
    } else if(!['already_quarantined','different_media_preserved'].includes(report.before.state)) {
      throw Error('unexpected production TOC row; no mutation permitted: '+report.before.state);
    }
    const after=await d1(safeSql().rowQuery);
    assert.equal(after.length,1,'post-quarantine toc_assets row count changed');
    report.after={state:rowState(after[0]),hash:String(after[0].content_hash||''),
      available:Number(after[0].available),r2Key:String(after[0].r2_key||''),
      reason:String(after[0].reason||'')};
    assert.ok(['already_quarantined','different_media_preserved'].includes(report.after.state),
      'bad TOC still active: '+report.after.state);
    report.afterApi=await apiToc();
    assert.notEqual(report.afterApi.contentHash,BAD_HASH,
      'public TOC still exposing confirmed bad image after guarded D1 correction');
    report.result=report.after.state==='different_media_preserved'?'new_valid_media_preserved':
      report.d1Writes?'exact_bad_toc_quarantined':'already_quarantined';
  } catch(error) {
    report.result='failed_closed';
    report.error=noSecrets(error?.message||error);
    process.exitCode=1;
  }
  report.finishedAt=new Date().toISOString();
  await reportWrite(report);
} else {
  throw Error('Explicit --contract-check or --execute-production mode required');
}
