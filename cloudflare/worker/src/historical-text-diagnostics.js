// Owner-only diagnostic metadata for historical fulltext local capture.
// No article text, images, PDFs, raw URLs, access tokens or cookies.
export const REPORT_SCHEMA='historical-text-diagnostic-v1';
const TABLE='historical_text_capture_reports_v1';
const DOI=/^10\.\d{4,9}\/[^\s?#]{1,220}$/;
const ID=/^[a-z0-9][a-z0-9:_-]{10,127}$/i;
const TYPES=new Set(['failure_checkpoint','final_result']);
const STAGES=new Set(['catalog','queued','publisher_open','publisher_page','publisher_doi',
  'license','body_extract','hash_verify','local_store','publisher_wait','finished','report_upload']);
const REASONS=new Set(['started','publisher_unreachable','publisher_no_response','doi_unverified',
  'license_not_verified','body_missing','page_unavailable','page_access_blocked','page_http_error',
  'too_large','timeout','invalid_response','capture_failed','unsupported_publisher',
  'response_hash_mismatch','storage_failure','local_storage_failed',
  'publisher_script_not_confirmed','report_upload_failed','saved_local','other']);
const STATES=new Set(['progress','failed','blocked','success']);
const PUBLISHERS=new Set(['acs','wiley','nature','science','rsc','elsevier','ccs','unknown']);
const safeStr=(v,max=80)=>String(v??'').slice(0,max);
export function normalizeHistoricDoi(v){
  const s=String(v||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
  return DOI.test(s)?s:'';
}
function parseReport(input){
  const allowed=new Set(['schemaVersion','eventId','doi','runId','jobId','kind','status',
    'stage','reasonCode','httpStatus','publisher','pageDoiVerified',
    'sectionCount','evidenceChars','scriptVersion','occurredAt']);
  // Reject unexpected fields rather than retaining (even clipped) raw fulltext.
  if(!input||typeof input!=='object'||Array.isArray(input)
    ||Object.keys(input).some(k=>!allowed.has(k)))return null;
  if(input.schemaVersion!==REPORT_SCHEMA)return null;
  const doi=normalizeHistoricDoi(input.doi);
  const eventId=safeStr(input.eventId,128),runId=safeStr(input.runId,128),
    jobId=safeStr(input.jobId,128);
  if(!doi||!ID.test(eventId)||!ID.test(runId)||!ID.test(jobId))return null;
  if(!TYPES.has(input.kind)||!STATES.has(input.status)
    ||!STAGES.has(input.stage)||!REASONS.has(input.reasonCode)
    ||!PUBLISHERS.has(input.publisher))return null;
  const httpStatus=input.httpStatus===null||input.httpStatus===undefined?null:Number(input.httpStatus);
  if(httpStatus!==null&&(!Number.isInteger(httpStatus)||httpStatus<100||httpStatus>599))return null;
  const sectionCount=Number(input.sectionCount??0),evidenceChars=Number(input.evidenceChars??0);
  if(!Number.isSafeInteger(sectionCount)||sectionCount<0||sectionCount>300
    ||!Number.isSafeInteger(evidenceChars)||evidenceChars<0||evidenceChars>400000)return null;
  const when=Date.parse(String(input.occurredAt||''));
  if(!Number.isFinite(when)||Math.abs(when-Date.now())>7*24*3600*1000)return null;
  if(typeof input.pageDoiVerified!=='boolean')return null;
  const scriptVersion=safeStr(input.scriptVersion,24);
  if(!/^0\.2\.\d{1,3}$/.test(scriptVersion))return null;
  return {doi,eventId,runId,jobId,kind:input.kind,status:input.status,
    stage:input.stage,reasonCode:input.reasonCode,httpStatus,
    publisher:input.publisher,pageDoiVerified:input.pageDoiVerified?1:0,
    sectionCount,evidenceChars,scriptVersion,occurredAt:new Date(when).toISOString()};
}
export async function ensureHistoricalDiagnosticSchema(env){
  const db=env?.DB;
  if(!db)return false;
  const statements=[
    'CREATE TABLE IF NOT EXISTS '+TABLE+' ('+
    'event_id TEXT PRIMARY KEY NOT NULL,doi TEXT NOT NULL,run_id TEXT NOT NULL,'+
    'job_id TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL,'+
    'reason_code TEXT NOT NULL,http_status INTEGER,publisher TEXT NOT NULL,'+
    'page_doi_verified INTEGER NOT NULL,section_count INTEGER NOT NULL,'+
    'evidence_chars INTEGER NOT NULL,script_version TEXT NOT NULL,'+
    'occurred_at TEXT NOT NULL,received_at INTEGER NOT NULL)',
    'CREATE INDEX IF NOT EXISTS hist_text_diag_doi_received ON '+TABLE+'(doi,received_at DESC)',
    'CREATE INDEX IF NOT EXISTS hist_text_diag_status_received ON '+TABLE+'(status,received_at DESC)'
  ];
  for(const sql of statements)await db.prepare(sql).run();
  return true;
}
function resultRow(r){
  return {eventId:r.event_id,doi:r.doi,runId:r.run_id,jobId:r.job_id,
    kind:r.kind,status:r.status,stage:r.stage,reasonCode:r.reason_code,
    httpStatus:r.http_status===null?null:Number(r.http_status),
    publisher:r.publisher,pageDoiVerified:r.page_doi_verified===1,
    sectionCount:Number(r.section_count),evidenceChars:Number(r.evidence_chars),
    scriptVersion:r.script_version,occurredAt:r.occurred_at,
    receivedAt:Number(r.received_at)};
}
export async function importHistoricalDiagnostic(env,payload){
  if(!env?.DB)return {status:503,body:{stored:false,error:'historical_diagnostics_db_unavailable'}};
  const row=parseReport(payload);
  if(!row)return {status:400,body:{stored:false,error:'invalid_historical_diagnostic'}};
  await ensureHistoricalDiagnosticSchema(env);
  const now=Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO '+TABLE+
    ' (event_id,doi,run_id,job_id,kind,status,stage,reason_code,http_status,publisher,'+
    'page_doi_verified,section_count,evidence_chars,script_version,occurred_at,received_at)'+
    ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(row.eventId,row.doi,row.runId,row.jobId,row.kind,row.status,row.stage,
      row.reasonCode,row.httpStatus,row.publisher,row.pageDoiVerified,row.sectionCount,
      row.evidenceChars,row.scriptVersion,row.occurredAt,now).run();
  const saved=await env.DB.prepare('SELECT event_id,doi,kind,status,stage,reason_code FROM '+TABLE+
    ' WHERE event_id=?').bind(row.eventId).first();
  if(!saved||saved.doi!==row.doi||saved.kind!==row.kind||saved.status!==row.status
    ||saved.stage!==row.stage||saved.reason_code!==row.reasonCode)
    return {status:409,body:{stored:false,error:'historical_event_id_conflict'}};
  return {status:200,body:{stored:true,eventId:row.eventId,doi:row.doi,
    attemptId:row.jobId,status:saved.status,kind:saved.kind}};
}
export async function listHistoricalDiagnostics(env,{doi='',status='',limit=50,before=0,beforeEventId=''}={}){
  if(!env?.DB)return {status:503,body:{error:'historical_diagnostics_db_unavailable'}};
  await ensureHistoricalDiagnosticSchema(env);
  const exactDoi=doi?normalizeHistoricDoi(doi):'';
  if(doi&&!exactDoi)return {status:400,body:{error:'invalid_doi'}};
  const filter=String(status||'').trim();
  if(filter&&!STATES.has(filter))return {status:400,body:{error:'invalid_status'}};
  const bound=Math.max(1,Math.min(100,Math.floor(Number(limit||50))));
  const until=Number(before||0);
  if(!Number.isSafeInteger(until)||until<0)return {status:400,body:{error:'invalid_cursor'}};
  const conditions=['1=1'],args=[];
  if(exactDoi){conditions.push('doi=?');args.push(exactDoi);}
  if(filter){conditions.push('status=?');args.push(filter);}
  if(until&&beforeEventId){
    if(!ID.test(String(beforeEventId)))return {status:400,body:{error:'invalid_cursor_event'}};
    conditions.push('(received_at<? OR (received_at=? AND event_id<?))');
    args.push(until,until,String(beforeEventId));
  }else if(until){conditions.push('received_at<?');args.push(until);}
  const rows=await env.DB.prepare('SELECT * FROM '+TABLE+
    ' WHERE '+conditions.join(' AND ')+' ORDER BY received_at DESC,event_id DESC LIMIT ?')
    .bind(...args,bound+1).all();
  const all=rows.results||[],listed=all.slice(0,bound);
  return {status:200,body:{schemaVersion:REPORT_SCHEMA,
    count:listed.length,hasMore:all.length>bound,
    nextBefore:all.length>bound&&listed.length?Number(listed.at(-1).received_at):null,
    nextBeforeEventId:all.length>bound&&listed.length?String(listed.at(-1).event_id):null,
    items:listed.map(resultRow)}};
}