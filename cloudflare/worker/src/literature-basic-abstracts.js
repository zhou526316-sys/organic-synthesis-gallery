// DOI-bound, source-hash-verified basic bilingual abstracts.
// Independent from private article Evidence and the 12:00 deep-review pipeline.
// Public callers may read approved paraphrases, never the deposited full abstract.
const HASH=/^[a-f0-9]{64}$/;
const DOI=/^10\.\d{4,9}\/\S+$/i;
const SOURCE=new Set(['openalex','crossref']);
const normalizeDoi=value=>{
  const doi=String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
  return DOI.test(doi)?doi:'';
};
const line=(value,max=10000)=>String(value??'').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,max);
async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function ensureBasicAbstractSchema(env){
  if(!env?.LITERATURE_INDEX_DB)throw Error('basic_abstract_db_unavailable');
  await env.LITERATURE_INDEX_DB.prepare(`CREATE TABLE IF NOT EXISTS literature_basic_abstract_reviews (
    doi TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    abstract_sha256 TEXT NOT NULL,
    abstract_source TEXT NOT NULL,
    summary_zh TEXT NOT NULL,
    summary_en TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    catalog_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
}
export async function findBasicAbstractReview(env,row){
  if(!env?.LITERATURE_INDEX_DB||!row?.doi||!row?.abstract_text)return null;
  let record;
  try{
    record=await env.LITERATURE_INDEX_DB.prepare(`SELECT revision,abstract_sha256,abstract_source,
      summary_zh,summary_en,reviewed_at
      FROM literature_basic_abstract_reviews WHERE doi=?`).bind(row.doi).first();
  }catch(error){
    if(/no such table/i.test(String(error?.message||'')))return null;
    throw error;
  }
  if(!record||record.revision!==row.revision
    ||record.abstract_source!==row.abstract_source
    ||!record.summary_zh||!record.summary_en
    ||!HASH.test(record.abstract_sha256))return null;
  if(await sha256(row.abstract_text)!==record.abstract_sha256)return null;
  return {zh:record.summary_zh,en:record.summary_en,
    reviewedAt:record.reviewed_at,abstractSha256:record.abstract_sha256};
}
// Privileged reviewers read bounded complete metadata abstracts; the public
// /api/literature/abstract response deliberately exposes only a short excerpt.
export async function listBasicAbstractReviewCandidates(env,payload={}){
  const catalogId=String(payload.catalogId||'').toLowerCase();
  const after=payload.afterDoi?normalizeDoi(payload.afterDoi):'';
  if(!HASH.test(catalogId)||(payload.afterDoi&&!after))
    return {status:400,body:{error:'basic_abstract_invalid_cursor'}};
  if(!env?.LITERATURE_INDEX_DB)return {status:503,body:{error:'basic_abstract_db_unavailable'}};
  const limit=Math.min(10,Math.max(1,Math.floor(Number(payload.limit)||8)));
  // List only exact catalog members from a complete, ready enrichment generation.
  const generation=await env.LITERATURE_INDEX_DB.prepare(`SELECT e.ready AS enriched,g.ready AS published
    FROM literature_search_enrichment_generations e JOIN literature_catalog_generations g
    ON g.catalog_id=e.catalog_id WHERE e.catalog_id=?`).bind(catalogId).first();
  if(!generation||Number(generation.enriched)!==1||Number(generation.published)!==1)
    return {status:409,body:{error:'basic_abstract_catalog_not_ready'}};
  await ensureBasicAbstractSchema(env);
  const rows=await env.LITERATURE_INDEX_DB.prepare(`SELECT e.doi,e.revision,e.abstract_text,e.abstract_source
    FROM literature_search_enrichment e JOIN literature_catalog_index i
    ON i.catalog_id=e.catalog_id AND i.doi=e.doi AND i.revision=e.revision
    WHERE e.catalog_id=? AND e.doi>? AND length(e.abstract_text)>0
    ORDER BY e.doi ASC LIMIT ?`).bind(catalogId,after,limit+1).all();
  const all=rows.results||[],hasMore=all.length>limit;
  const items=[];
  for(const row of all.slice(0,limit)){
    const current=await findBasicAbstractReview(env,row);
    items.push({doi:row.doi,revision:row.revision,
      abstract:row.abstract_text,abstractSource:row.abstract_source,
      abstractSha256:await sha256(row.abstract_text),
      reviewState:current?'approved_current':'pending'});
  }
  return {status:200,body:{ok:true,catalogId,count:items.length,items,
    hasMore,nextAfterDoi:hasMore&&items.length?items.at(-1).doi:null,
    notice:'Authorized metadata review only; publisher abstracts are not public output.'}};
}
// Manual/two-pass reviewer imports may never generate factual content here.
// Each approved row must refer to the exact DOI, revision and source abstract hash.
export async function importBasicAbstractReviews(env,payload={}){
  const catalogId=String(payload.catalogId||'').toLowerCase(),rows=payload.rows;
  if(!HASH.test(catalogId)||!Array.isArray(rows)||!rows.length||rows.length>8)
    return {status:400,body:{error:'basic_abstract_invalid_batch'}};
  if(!env?.LITERATURE_INDEX_DB)return {status:503,body:{error:'basic_abstract_db_unavailable'}};
  const normalized=[];
  for(const item of rows){
    const doi=normalizeDoi(item.doi),revision=String(item.revision||'').toLowerCase();
    const abstractSha256=String(item.abstractSha256||'').toLowerCase();
    const source=String(item.abstractSource||'');
    const zh=line(item.zh,6000),en=line(item.en,6000);
    const reviewedAt=String(item.reviewedAt||'');
    if(!doi||!HASH.test(revision)||!HASH.test(abstractSha256)
      ||!SOURCE.has(source)||zh.length<15||en.length<30
      ||item.status!=='approved'||item.reviewPasses!==2
      ||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(reviewedAt)
      ||!Number.isFinite(Date.parse(reviewedAt)))
      return {status:400,body:{error:'basic_abstract_review_unverified'}};
    normalized.push({doi,revision,abstractSha256,source,zh,en,reviewedAt});
  }
  if(new Set(normalized.map(r=>r.doi)).size!==normalized.length)
    return {status:400,body:{error:'basic_abstract_duplicate_doi'}};
  await ensureBasicAbstractSchema(env);
  const db=env.LITERATURE_INDEX_DB;
  const generation=await db.prepare(`SELECT e.ready AS enriched,g.ready AS published
    FROM literature_search_enrichment_generations e JOIN literature_catalog_generations g
    ON g.catalog_id=e.catalog_id WHERE e.catalog_id=?`).bind(catalogId).first();
  if(!generation||Number(generation.enriched)!==1||Number(generation.published)!==1)
    return {status:409,body:{error:'basic_abstract_catalog_not_ready'}};
  const statements=[],now=Date.now();
  for(const row of normalized){
    const source=await db.prepare(`SELECT e.doi,e.revision,e.abstract_text,e.abstract_source
      FROM literature_search_enrichment e JOIN literature_catalog_index i
      ON i.catalog_id=e.catalog_id AND i.doi=e.doi AND i.revision=e.revision
      WHERE e.catalog_id=? AND e.doi=?`).bind(catalogId,row.doi).first();
    if(!source||source.revision!==row.revision
      ||source.abstract_source!==row.source
      ||!source.abstract_text||await sha256(source.abstract_text)!==row.abstractSha256)
      return {status:409,body:{error:'basic_abstract_source_changed',doi:row.doi}};
    statements.push(db.prepare(`INSERT INTO literature_basic_abstract_reviews
      (doi,revision,abstract_sha256,abstract_source,summary_zh,summary_en,
       reviewed_at,catalog_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(doi) DO UPDATE SET revision=excluded.revision,
       abstract_sha256=excluded.abstract_sha256,abstract_source=excluded.abstract_source,
       summary_zh=excluded.summary_zh,summary_en=excluded.summary_en,
       reviewed_at=excluded.reviewed_at,catalog_id=excluded.catalog_id,
       updated_at=excluded.updated_at`)
      .bind(row.doi,row.revision,row.abstractSha256,row.source,row.zh,row.en,
        row.reviewedAt,catalogId,now));
  }
  await db.batch(statements);
  return {status:200,body:{ok:true,catalogId,approved:normalized.length,
    dois:normalized.map(row=>row.doi)}};
}

export async function getBasicAbstractCoverage(env,payload={}){
  const catalogId=String(payload.catalogId||'').toLowerCase();
  if(!HASH.test(catalogId))return {status:400,body:{error:'basic_abstract_catalog_invalid'}};
  if(!env?.LITERATURE_INDEX_DB)return {status:503,body:{error:'basic_abstract_db_unavailable'}};
  const generation=await env.LITERATURE_INDEX_DB.prepare(`SELECT e.ready AS enriched,g.ready AS published
    FROM literature_search_enrichment_generations e JOIN literature_catalog_generations g
    ON g.catalog_id=e.catalog_id WHERE e.catalog_id=?`).bind(catalogId).first();
  if(!generation||Number(generation.enriched)!==1||Number(generation.published)!==1)
    return {status:409,body:{error:'basic_abstract_catalog_not_ready'}};
  await ensureBasicAbstractSchema(env);
  const row=await env.LITERATURE_INDEX_DB.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN length(e.abstract_text)>0 THEN 1 ELSE 0 END) AS original_count,
    SUM(CASE WHEN b.doi IS NOT NULL AND b.revision=e.revision
      AND b.abstract_source=e.abstract_source AND length(b.summary_zh)>0
      AND length(b.summary_en)>0 THEN 1 ELSE 0 END) AS reviewed_candidates
    FROM literature_search_enrichment e
    JOIN literature_catalog_index i ON i.catalog_id=e.catalog_id
      AND i.doi=e.doi AND i.revision=e.revision
    LEFT JOIN literature_basic_abstract_reviews b ON b.doi=e.doi
    WHERE e.catalog_id=?`).bind(catalogId).first();
  const total=Number(row?.total||0);
  return {status:200,body:{ok:true,catalogId,total,
    originalAbstracts:Number(row?.original_count||0),
    missingOriginalAbstracts:total-Number(row?.original_count||0),
    reviewedBilingualCandidates:Number(row?.reviewed_candidates||0),
    // Aggregation does not recompute SHA-256. The per-DOI public read does.
    reviewedCountRequiresPerDoiHashCheck:true,
    allPapersHaveVerifiedAbstract:false}};
}
