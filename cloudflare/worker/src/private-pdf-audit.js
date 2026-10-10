import { authenticatedSessionUserId } from './integrations.js';

// Only private_pdf_owner can see per-DOI results. Maintenance writes require
// the existing server-side BRIDGE_WRITE_TOKEN in the top-level Worker router.
// No token, signed URL, private file bytes, R2 key or personal ID is returned.
const MAX_BATCH = 24;
const MAX_PROBE = 6;
const MAX_PAGE = 60;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const DOI = /^10\.\d{4,9}\/\S{1,220}$/;
const STATUS = new Set(['ready','pending','failed','missing']);
const reply = (status,body) => ({status,body});
const str = (v,n=100) => typeof v==='string' ? v.slice(0,n) : '';
const safeInt = (v,min,max) => Number.isSafeInteger(v)&&v>=min&&v<=max;
const doiOf = v => {
  const s = str(v,250).trim().toLowerCase();
  return DOI.test(s) && !/[\s?#]/.test(s) ? s : '';
};
function safeBatch(data) {
  if (!data || !Array.isArray(data.items) ||
      data.items.length<1 || data.items.length>MAX_BATCH) return null;
  const result=[],unique=new Set();
  for(const item of data.items) {
    const doi=doiOf(item?.doi),journal=str(item?.journal,100).trim();
    const date=str(item?.addedDate,10).trim();
    if(!doi||unique.has(doi)||!journal||journal.length>100||
      (date!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    unique.add(doi);result.push({doi,journal,addedDate:date});
  }
  return result;
}
async function generation(env,id){
  return env.DB.prepare('SELECT catalog_id, expected_count, completed_at FROM private_pdf_audit_generations WHERE catalog_id=?')
    .bind(id).first();
}
async function latest(env) {
  return env.DB.prepare('SELECT catalog_id,source_commit,expected_count,completed_at FROM private_pdf_audit_generations WHERE completed_at>0 ORDER BY completed_at DESC,catalog_id DESC LIMIT 1').first();
}

export async function beginPrivatePdfAudit(env,data) {
  if(!env?.DB) return reply(503,{error:'audit_database_unavailable'});
  const id=str(data?.catalogId,70),sha=str(data?.sourceCommit,45);
  const expected=Number(data?.expectedCount);
  if(!HASH.test(id)||!COMMIT.test(sha)||!safeInt(expected,1,200000))
    return reply(400,{error:'audit_generation_invalid'});
  try {
    const existing=await generation(env,id);
    if(existing && existing.expected_count!==expected)
      return reply(409,{error:'audit_catalog_identity_conflict'});
    if(!existing) await env.DB.prepare(
      'INSERT INTO private_pdf_audit_generations(catalog_id,source_commit,expected_count,created_at,completed_at) VALUES(?,?,?,?,0)'
    ).bind(id,sha,expected,Date.now()).run();
    return reply(200,{ok:true,catalogId:id,expectedCount:expected,alreadyComplete:Boolean(existing?.completed_at)});
  } catch {return reply(503,{error:'audit_generation_write_failed'});}
}

export async function ingestPrivatePdfAudit(env,data) {
  if(!env?.DB) return reply(503,{error:'audit_database_unavailable'});
  const id=str(data?.catalogId,70),items=safeBatch(data);
  if(!HASH.test(id)||!items) return reply(400,{error:'audit_batch_invalid'});
  try {
    const gen=await generation(env,id);
    if(!gen) return reply(409,{error:'audit_generation_missing'});
    const params=items.map(()=>'?').join(',');
    const docs=await env.DB.prepare(
      `SELECT d.id,d.doi,d.version_kind,d.content_hash,d.byte_length,d.processing_state,d.active,d.captured_at,
        v.status AS verification_status,v.page_count AS verified_pages
       FROM private_pdf_documents d
       LEFT JOIN private_pdf_verifications v ON v.document_id=d.id AND v.content_hash=d.content_hash
       WHERE d.doi IN (${params})
       ORDER BY d.captured_at DESC`
    ).bind(...items.map(i=>i.doi)).all();
    if(docs?.success===false || !Array.isArray(docs?.results)) throw Error('db_results_invalid');
    const versions=new Map(items.map(i=>[i.doi,[]]));
    for(const doc of docs.results) versions.get(String(doc.doi))?.push(doc);
    const versionScore={version_of_record:4,accepted_manuscript:3,preprint:2,unknown:1};
    const writes=[];
    for(const item of items) {
      const rows=versions.get(item.doi)||[];
      const eligible=rows.filter(r=>r.processing_state==='ready' && Number(r.active)===1);
      eligible.sort((a,b)=>(versionScore[b.version_kind]||0)-(versionScore[a.version_kind]||0)
        || Number(b.captured_at||0)-Number(a.captured_at||0));
      const doc=eligible[0]||null;
      const inv=doc?'ready':rows.some(r=>r.processing_state==='failed')?'failed':
        rows.length?'pending':'missing';
      const pages=doc&&doc.verification_status==='verified'?
        Number(doc.verified_pages||0):0;
      const identity=Boolean(doc && HASH.test(String(doc.content_hash||'')) &&
        pages>0 && safeInt(Number(doc.byte_length),16,60*1024*1024));
      const row=[item.doi,item.journal,item.addedDate,inv,String(doc?.id||''),
        String(doc?.content_hash||''),Number(doc?.byte_length||0),Number(identity),
        pages,Date.now()];
      writes.push(env.DB.prepare(
        `INSERT INTO private_pdf_audit_rows
          (doi,journal,added_date,inventory_status,document_id,content_hash,byte_length,
          identity_verified,pdf_pages,inventory_checked_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(doi) DO UPDATE SET
         journal=excluded.journal,added_date=excluded.added_date,
         inventory_status=excluded.inventory_status,
         backend_probe=CASE WHEN private_pdf_audit_rows.document_id=excluded.document_id
           AND private_pdf_audit_rows.content_hash=excluded.content_hash
           AND private_pdf_audit_rows.byte_length=excluded.byte_length
           AND excluded.inventory_status='ready'
           THEN private_pdf_audit_rows.backend_probe ELSE 'untested' END,
         probe_reason=CASE WHEN private_pdf_audit_rows.document_id=excluded.document_id
           AND private_pdf_audit_rows.content_hash=excluded.content_hash
           AND private_pdf_audit_rows.byte_length=excluded.byte_length
           AND excluded.inventory_status='ready'
           THEN private_pdf_audit_rows.probe_reason ELSE '' END,
         probed_at=CASE WHEN private_pdf_audit_rows.document_id=excluded.document_id
           AND private_pdf_audit_rows.content_hash=excluded.content_hash
           AND private_pdf_audit_rows.byte_length=excluded.byte_length
           AND excluded.inventory_status='ready'
           THEN private_pdf_audit_rows.probed_at ELSE 0 END,
         browser_status=CASE WHEN private_pdf_audit_rows.document_id=excluded.document_id
           AND private_pdf_audit_rows.content_hash=excluded.content_hash
           AND private_pdf_audit_rows.byte_length=excluded.byte_length
           THEN private_pdf_audit_rows.browser_status ELSE 'untested' END,
         browser_checked_at=CASE WHEN private_pdf_audit_rows.document_id=excluded.document_id
           AND private_pdf_audit_rows.content_hash=excluded.content_hash
           AND private_pdf_audit_rows.byte_length=excluded.byte_length
           THEN private_pdf_audit_rows.browser_checked_at ELSE 0 END,
         document_id=excluded.document_id,content_hash=excluded.content_hash,
         byte_length=excluded.byte_length,identity_verified=excluded.identity_verified,
         pdf_pages=excluded.pdf_pages,inventory_checked_at=excluded.inventory_checked_at`
      ).bind(...row));
      writes.push(env.DB.prepare(
        'INSERT OR IGNORE INTO private_pdf_audit_members(catalog_id,doi) VALUES(?,?)'
      ).bind(id,item.doi));
    }
    await env.DB.batch(writes);
    return reply(200,{ok:true,accepted:items.length});
  } catch {return reply(503,{error:'audit_batch_write_failed'});}
}

export async function finishPrivatePdfAudit(env,data){
  if(!env?.DB) return reply(503,{error:'audit_database_unavailable'});
  const id=str(data?.catalogId,70);
  if(!HASH.test(id)) return reply(400,{error:'audit_catalog_invalid'});
  try{
    const gen=await generation(env,id);
    if(!gen) return reply(409,{error:'audit_generation_missing'});
    const row=await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM private_pdf_audit_members WHERE catalog_id=?'
    ).bind(id).first();
    const count=Number(row?.count||0);
    if(count!==Number(gen.expected_count))
      return reply(409,{error:'audit_catalog_incomplete',expected:gen.expected_count,observed:count});
    await env.DB.prepare(
      'UPDATE private_pdf_audit_generations SET completed_at=? WHERE catalog_id=?'
    ).bind(Date.now(),id).run();
    return reply(200,{ok:true,catalogId:id,checkedCount:count});
  }catch{return reply(503,{error:'audit_catalog_commit_failed'});}
}

function pdfEndsWithEof(tail) {
  const end=new TextDecoder('latin1').decode(tail);
  return /%%EOF[\s\x00]*$/.test(end);
}
async function probeDocument(bucket,doc) {
  const length=Number(doc.byte_length||0),hash=String(doc.content_hash||'');
  if(!safeInt(length,16,60*1024*1024)||!HASH.test(hash)||!doc.r2_key)
    return {status:'fail',reason:'identity_invalid'};
  try{
    const head=await bucket.head(doc.r2_key);
    if(!head) return {status:'fail',reason:'r2_missing'};
    if(Number(head.size)!==length) return {status:'fail',reason:'r2_length_mismatch'};
    const storedHash=String(head.customMetadata?.contentHash||'').toLowerCase();
    if(storedHash && storedHash!==hash) return {status:'fail',reason:'r2_hash_metadata_mismatch'};
    const tailSize=Math.min(length,1024);
    const parts=await Promise.all([
      bucket.get(doc.r2_key,{range:{offset:0,length:16}}),
      bucket.get(doc.r2_key,{range:{offset:length-tailSize,length:tailSize}}),
    ]);
    if(!parts[0]||!parts[1]) return {status:'fail',reason:'r2_range_missing'};
    const chunks=await Promise.all(parts.map(p=>p.arrayBuffer()));
    const first=new Uint8Array(chunks[0]),last=new Uint8Array(chunks[1]);
    if(first.byteLength!==16||last.byteLength!==tailSize)
      return {status:'fail',reason:'r2_range_incomplete'};
    if(new TextDecoder().decode(first.subarray(0,5))!=='%PDF-')
      return {status:'fail',reason:'pdf_header_invalid'};
    if(!pdfEndsWithEof(last)) return {status:'fail',reason:'pdf_trailer_unverified'};
    return {status:'pass',reason:'r2_head_tail_verified'};
  }catch{return {status:'fail',reason:'r2_range_error'};}
}
export async function probePrivatePdfAudit(env,data={}){
  if(!env?.DB||!env?.PDF_PRIVATE) return reply(503,{error:'audit_storage_unavailable'});
  const limit=Number(data.limit||4);
  if(!safeInt(limit,1,MAX_PROBE)) return reply(400,{error:'audit_probe_limit_invalid'});
  try{
    const g=await latest(env);
    if(!g) return reply(409,{error:'audit_catalog_not_ready'});
    const stale=Date.now()-30*86400000;
    const result=await env.DB.prepare(
      `SELECT a.doi,a.document_id,a.content_hash,a.byte_length,
           d.r2_key,d.processing_state,d.active
         FROM private_pdf_audit_members m
         JOIN private_pdf_audit_rows a ON a.doi=m.doi
         JOIN private_pdf_documents d ON d.id=a.document_id AND d.content_hash=a.content_hash
         WHERE m.catalog_id=? AND a.inventory_status='ready'
           AND d.processing_state='ready' AND d.active=1
           AND (a.backend_probe='untested' OR a.probed_at<?)
         ORDER BY CASE WHEN a.backend_probe='untested' THEN 0 ELSE 1 END,
           CASE WHEN a.added_date>='2026-10-01' THEN 0 ELSE 1 END,
           a.probed_at ASC,a.added_date DESC,a.doi ASC LIMIT ?`
    ).bind(g.catalog_id,stale,limit).all();
    if(result?.success===false||!Array.isArray(result?.results)) throw Error('probe_query');
    const outcomes=[],writes=[];
    for(const row of result.results) {
      const probe=await probeDocument(env.PDF_PRIVATE,row);
      outcomes.push({status:probe.status,reason:probe.reason});
      writes.push(env.DB.prepare(
        `UPDATE private_pdf_audit_rows SET backend_probe=?,probe_reason=?,probed_at=?
         WHERE doi=? AND document_id=? AND content_hash=? AND byte_length=? AND inventory_status='ready'`
      ).bind(probe.status,probe.reason,Date.now(),row.doi,row.document_id,row.content_hash,row.byte_length));
    }
    if(writes.length) await env.DB.batch(writes);
    return reply(200,{ok:true,probed:outcomes.length,passed:outcomes.filter(o=>o.status==='pass').length,
      failed:outcomes.filter(o=>o.status!=='pass').length,
      // Aggregate only, no R2 key, signed ticket, raw bytes or per-document private inventory in CI logs.
      moreLikely:outcomes.length===limit});
  }catch{return reply(503,{error:'audit_probe_failed'});}
}

async function ownerAuthorized(request,env) {
  const userId=await authenticatedSessionUserId(request,env);
  if(!userId) return {status:401};
  const grant=await env.DB.prepare(
    "SELECT 1 AS ok FROM user_capabilities WHERE user_id=? AND capability='private_pdf_owner' LIMIT 1"
  ).bind(userId).first();
  return {status:grant?.ok?200:403};
}

export async function readOwnerPdfAudit(request,env){
  if(!env?.DB) return reply(503,{error:'audit_database_unavailable'});
  try{
    const access=await ownerAuthorized(request,env);
    if(access.status!==200) return reply(access.status,{error:access.status===401?'not_authenticated':'owner_required'});
    const gen=await latest(env);
    if(!gen) return reply(200,{schemaVersion:1,ready:false,reason:'audit_not_completed',items:[]});
    const u=new URL(request.url),rawLimit=u.searchParams.get('limit');
    const limit=rawLimit===null?30:Number(rawLimit);
    const after=u.searchParams.get('after')||'',q=(u.searchParams.get('q')||'').trim().toLowerCase();
    const filter=u.searchParams.get('status')||'all';
    if([...u.searchParams.keys()].some(k=>!['limit','after','q','status'].includes(k))||
       !safeInt(limit,1,MAX_PAGE)||(after&&!doiOf(after))||q.length>80||
       !['all','ready','pending','failed','missing','probe_pass','probe_failed','unprobed','browser_pass'].includes(filter))
      return reply(400,{error:'audit_filter_invalid'});
    const summary=await env.DB.prepare(
      `SELECT COUNT(*) AS total,
       SUM(CASE WHEN a.inventory_status='ready' THEN 1 ELSE 0 END) AS ready,
       SUM(CASE WHEN a.inventory_status='pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN a.inventory_status='failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN a.inventory_status='missing' THEN 1 ELSE 0 END) AS missing,
       SUM(CASE WHEN a.identity_verified=1 THEN 1 ELSE 0 END) AS identity_verified,
       SUM(CASE WHEN a.backend_probe='pass' THEN 1 ELSE 0 END) AS r2_head_tail_pass,
       SUM(CASE WHEN a.backend_probe='fail' THEN 1 ELSE 0 END) AS r2_head_tail_failed,
       SUM(CASE WHEN a.browser_status='owner_reported_pass' THEN 1 ELSE 0 END) AS owner_reported_browser_pass
       FROM private_pdf_audit_members m JOIN private_pdf_audit_rows a ON a.doi=m.doi WHERE m.catalog_id=?`
    ).bind(gen.catalog_id).first();
    const filters={
      ready:"a.inventory_status='ready'",pending:"a.inventory_status='pending'",
      failed:"a.inventory_status='failed'",missing:"a.inventory_status='missing'",
      probe_pass:"a.backend_probe='pass'",probe_failed:"a.backend_probe='fail'",
      unprobed:"a.inventory_status='ready' AND a.backend_probe='untested'",
      browser_pass:"a.browser_status='owner_reported_pass'",
    };
    const args=[gen.catalog_id];
    let where="m.catalog_id=?";
    if(after){where+=" AND a.doi>?";args.push(after);}
    if(q){where+=" AND (instr(lower(a.doi),?)>0 OR instr(lower(a.journal),?)>0)";args.push(q,q);}
    if(filters[filter])where+=" AND "+filters[filter];
    const rows=await env.DB.prepare(
      `SELECT a.doi,a.journal,a.added_date,a.inventory_status,a.byte_length,
        a.identity_verified,a.pdf_pages,a.backend_probe,a.probe_reason,a.probed_at,
        a.browser_status,a.browser_checked_at,a.inventory_checked_at
        FROM private_pdf_audit_members m JOIN private_pdf_audit_rows a ON a.doi=m.doi
        WHERE ${where} ORDER BY a.doi ASC LIMIT ?`
    ).bind(...args,limit+1).all();
    if(rows?.success===false||!Array.isArray(rows?.results)) throw Error('audit_list');
    const hasMore=rows.results.length>limit;
    const items=rows.results.slice(0,limit).map(row=>({
      doi:row.doi,journal:row.journal,addedDate:row.added_date,
      inventory:row.inventory_status,byteLength:Number(row.byte_length||0),
      identityVerified:row.identity_verified===1,pdfPages:Number(row.pdf_pages||0),
      storageProbe:row.backend_probe,probeReason:row.probe_reason,
      probedAt:Number(row.probed_at||0),browser:row.browser_status,
      browserCheckedAt:Number(row.browser_checked_at||0),
      inventoryCheckedAt:Number(row.inventory_checked_at||0),
    }));
    return reply(200,{schemaVersion:1,ready:true,catalogId:gen.catalog_id,
      sourceCommit:gen.source_commit,completedAt:gen.completed_at,
      expectedCount:gen.expected_count,summary,items,hasMore,
      nextAfter:hasMore?items.at(-1).doi:null});
  }catch{return reply(503,{error:'audit_report_unavailable'});}
}

export async function recordOwnerPdfBrowserCheck(request,env,data) {
  if(!env?.DB) return reply(503,{error:'audit_database_unavailable'});
  try{
    const access=await ownerAuthorized(request,env);
    if(access.status!==200) return reply(access.status,{error:access.status===401?'not_authenticated':'owner_required'});
    const doi=doiOf(data?.doi);
    if(!doi||data?.result!=='two_pages_rendered'||Object.keys(data||{}).some(k=>!['doi','result'].includes(k)))
      return reply(400,{error:'audit_browser_evidence_invalid'});
    const gen=await latest(env);
    if(!gen) return reply(409,{error:'audit_catalog_not_ready'});
    const row=await env.DB.prepare(
      `SELECT a.doi FROM private_pdf_audit_members m JOIN private_pdf_audit_rows a ON a.doi=m.doi
       WHERE m.catalog_id=? AND a.doi=? AND a.inventory_status='ready'`
    ).bind(gen.catalog_id,doi).first();
    if(!row) return reply(409,{error:'audit_document_not_ready'});
    // Owner-attested UX result, not cryptographic proof or a global guarantee.
    await env.DB.prepare(
      "UPDATE private_pdf_audit_rows SET browser_status='owner_reported_pass',browser_checked_at=? WHERE doi=?"
    ).bind(Date.now(),doi).run();
    return reply(200,{ok:true,doi,classification:'owner_reported_not_independent'});
  }catch{return reply(503,{error:'audit_browser_record_unavailable'});}
}
