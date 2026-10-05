export const LITERATURE_CATALOG_INDEX_SCHEMA_VERSION = 'literature-catalog-index-v1';
export const LITERATURE_INDEX_IMPORT_BATCH_MAX = 8;
const schemaReadyBindings = new WeakSet();

function safe(value,max=1000){
  return String(value ?? '').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function indexText(value,{label,maxBytes}){
  const text=String(value ?? '');
  if(/[\u0000-\u001f]/.test(text)) throw new Error('literature_catalog_text_control_character:'+label);
  if(new TextEncoder().encode(text).byteLength>maxBytes) throw new Error('literature_catalog_text_over_budget:'+label);
  return text;
}
function searchQueryText(value){
  const text=String(value ?? '').trim().toLowerCase();
  if(!text) return '';
  if(/[\u0000-\u001f]/.test(text)) throw new Error('literature_catalog_query_control_character');
  if(new TextEncoder().encode(text).byteLength>2000) throw new Error('literature_catalog_query_over_budget');
  return text;
}
function normalizeDoi(value){
  const doi=String(value||'').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
  return /^10\.\d{4,9}\/\S+$/.test(doi)?doi:'';
}
function hash64(value){const v=String(value||'').trim().toLowerCase();return /^[a-f0-9]{64}$/.test(v)?v:'';}
function sha40(value){const v=String(value||'').trim().toLowerCase();return /^[a-f0-9]{40}$/.test(v)?v:'';}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);}
function codepoints(value){return [...String(value||'')].length;}

export function literatureCatalogIndexShadowEnabled(env){
  return String(env?.LITERATURE_CATALOG_INDEX_SHADOW_ENABLED||'')==='1';
}
export function literatureCatalogIndexReadEnabled(env){
  return String(env?.LITERATURE_CATALOG_INDEX_READ_ENABLED||'')==='1';
}

export async function ensureLiteratureCatalogIndexSchema(env){
  if(!env?.LITERATURE_INDEX_DB) throw new Error('literature_catalog_index_db_missing');
  if(schemaReadyBindings.has(env.LITERATURE_INDEX_DB)) return;
  const statements=[
    `CREATE TABLE IF NOT EXISTS literature_catalog_generations (
      catalog_id TEXT PRIMARY KEY,
      doi_set_hash TEXT NOT NULL,
      publication_slot TEXT NOT NULL,
      source_commit TEXT NOT NULL,
      marker_blob_sha TEXT NOT NULL,
      record_count INTEGER NOT NULL CHECK (record_count >= 0),
      imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
      ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS literature_catalog_index (
      catalog_id TEXT NOT NULL,
      doi TEXT NOT NULL,
      revision TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      title_zh TEXT NOT NULL DEFAULT '',
      authors_text TEXT NOT NULL DEFAULT '',
      authors_json TEXT NOT NULL DEFAULT '[]',
      journal TEXT NOT NULL DEFAULT '',
      first_online_date TEXT,
      date_precision TEXT NOT NULL DEFAULT 'unknown',
      added_date TEXT,
      synthesis_type TEXT,
      searchable_text TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (catalog_id, doi)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_literature_catalog_date
      ON literature_catalog_index(catalog_id, first_online_date DESC, doi ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_literature_catalog_journal_date
      ON literature_catalog_index(catalog_id, journal, first_online_date DESC, doi ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_literature_catalog_added_date
      ON literature_catalog_index(catalog_id, added_date DESC, doi ASC)`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS literature_catalog_fts USING fts5(
      catalog_id UNINDEXED, doi UNINDEXED, searchable_text, tokenize='trigram'
    )`,
  ];
  for(const statement of statements) await env.LITERATURE_INDEX_DB.prepare(statement).run();
  schemaReadyBindings.add(env.LITERATURE_INDEX_DB);
}

function normalizeGeneration(value){
  const catalogId=hash64(value?.catalogId);
  const doiSetHash=hash64(value?.doiSetHash);
  const sourceCommit=sha40(value?.sourceCommit);
  const markerBlobSha=sha40(value?.markerBlobSha);
  const publicationSlot=safe(value?.publicationSlot,64);
  const recordCount=Number(value?.recordCount);
  if(!catalogId||!doiSetHash||!sourceCommit||!markerBlobSha
    ||!/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(publicationSlot)
    ||!Number.isSafeInteger(recordCount)||recordCount<0){
    throw new Error('literature_catalog_generation_invalid');
  }
  return {catalogId,doiSetHash,sourceCommit,markerBlobSha,publicationSlot,recordCount};
}

function normalizeRow(value){
  const doi=normalizeDoi(value?.doi);
  const revision=hash64(value?.revision);
  if(!doi||!revision) throw new Error('literature_catalog_row_identity_invalid');
  const rawAuthors=Array.isArray(value?.authors)?value.authors:[];
  if(rawAuthors.length>500) throw new Error('literature_catalog_authors_over_budget');
  const authors=rawAuthors.map((author,index)=>indexText(author,{label:'author_'+index,maxBytes:2000})).filter(Boolean);
  const title=indexText(value?.title,{label:'title',maxBytes:20000});
  const titleZh=indexText(value?.titleZh,{label:'title_zh',maxBytes:20000});
  const journal=indexText(value?.journal,{label:'journal',maxBytes:1000});
  const firstOnlineDate=validDate(value?.firstOnlineDate)?value.firstOnlineDate:null;
  const datePrecision=['day','unknown'].includes(String(value?.datePrecision||''))?String(value.datePrecision):'unknown';
  const addedDate=validDate(value?.addedDate)?value.addedDate:null;
  const synthesisType=['methodology','total','formal'].includes(String(value?.synthesisType||''))?String(value.synthesisType):null;
  // Preserve the existing static Gallery search contract exactly:
  // DOI/title/titleZh/authors/journal/first-online date/synthesis type.
  // addedDate is indexed as a filter column but is deliberately not full-text searchable.
  const searchableText=indexText([
    doi,title,titleZh,authors.join(' '),journal,firstOnlineDate||'',synthesisType||''
  ].join(' ').toLowerCase(),{label:'searchable_text',maxBytes:750000});
  const authorsJson=JSON.stringify(authors);
  if(new TextEncoder().encode(authorsJson).byteLength>500000) throw new Error('literature_catalog_authors_json_over_budget');
  return {doi,revision,title,titleZh,authors,authorsJson,journal,firstOnlineDate,datePrecision,addedDate,synthesisType,searchableText};
}

async function generationRow(env,catalogId){
  return env.LITERATURE_INDEX_DB.prepare(`SELECT catalog_id,doi_set_hash,publication_slot,source_commit,marker_blob_sha,
    record_count,imported_rows,ready,created_at,updated_at
    FROM literature_catalog_generations WHERE catalog_id=?`).bind(catalogId).first();
}
function generationContentMatches(row,g){
  return row&&row.catalog_id===g.catalogId&&row.doi_set_hash===g.doiSetHash
    &&Number(row.record_count)===g.recordCount;
}

export async function beginLiteratureCatalogGeneration(env,value){
  if(!literatureCatalogIndexShadowEnabled(env)) return {status:409,body:{error:'literature_catalog_index_shadow_disabled',enabled:false,readPathActive:false}};
  if(!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureLiteratureCatalogIndexSchema(env);
  const g=normalizeGeneration(value);
  const now=Date.now();
  const existing=await generationRow(env,g.catalogId);
  if(existing&&!generationContentMatches(existing,g)) {
    return {status:409,body:{error:'literature_catalog_generation_identity_conflict',catalogId:g.catalogId}};
  }
  if(!existing){
    await env.LITERATURE_INDEX_DB.prepare(`INSERT INTO literature_catalog_generations
      (catalog_id,doi_set_hash,publication_slot,source_commit,marker_blob_sha,record_count,imported_rows,ready,created_at,updated_at)
      VALUES (?,?,?,?,?,?,0,0,?,?)`).bind(
      g.catalogId,g.doiSetHash,g.publicationSlot,g.sourceCommit,g.markerBlobSha,g.recordCount,now,now
    ).run();
  }
  const row=await generationRow(env,g.catalogId);
  return {status:200,body:{ok:true,enabled:true,readPathActive:false,catalogId:g.catalogId,
    contentReused:Boolean(existing),recordCount:g.recordCount,importedRows:Number(row?.imported_rows||0),
    ready:Number(row?.ready||0)===1}};
}

function indexRowWriteStatements(db,catalogId,n,now){
  return [
    db.prepare(`INSERT INTO literature_catalog_index
      (catalog_id,doi,revision,title,title_zh,authors_text,authors_json,journal,first_online_date,
        date_precision,added_date,synthesis_type,searchable_text,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(catalog_id,doi) DO UPDATE SET
        title=excluded.title,title_zh=excluded.title_zh,authors_text=excluded.authors_text,
        authors_json=excluded.authors_json,journal=excluded.journal,first_online_date=excluded.first_online_date,
        date_precision=excluded.date_precision,added_date=excluded.added_date,synthesis_type=excluded.synthesis_type,
        searchable_text=excluded.searchable_text,updated_at=excluded.updated_at
      WHERE literature_catalog_index.revision=excluded.revision`).bind(
        catalogId,n.doi,n.revision,n.title,n.titleZh,n.authors.join(' '),n.authorsJson,
        n.journal,n.firstOnlineDate,n.datePrecision,n.addedDate,n.synthesisType,n.searchableText,now
      ),
    db.prepare('DELETE FROM literature_catalog_fts WHERE catalog_id=? AND doi=?').bind(catalogId,n.doi),
    db.prepare('INSERT INTO literature_catalog_fts(catalog_id,doi,searchable_text) VALUES(?,?,?)')
      .bind(catalogId,n.doi,n.searchableText),
  ];
}

export async function importLiteratureCatalogIndexBatch(env,payload){
  if(!literatureCatalogIndexShadowEnabled(env)) return {status:409,body:{error:'literature_catalog_index_shadow_disabled',enabled:false,readPathActive:false}};
  if(!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureLiteratureCatalogIndexSchema(env);
  const g=normalizeGeneration(payload?.generation);
  const rows=Array.isArray(payload?.rows)?payload.rows:[];
  if(!rows.length||rows.length>LITERATURE_INDEX_IMPORT_BATCH_MAX) {
    return {status:400,body:{error:'literature_catalog_index_batch_size_invalid',maxRows:LITERATURE_INDEX_IMPORT_BATCH_MAX}};
  }
  const begin=await beginLiteratureCatalogGeneration(env,g);
  if(begin.status!==200) return begin;
  if(begin.body.ready) return {status:409,body:{error:'literature_catalog_generation_already_ready',catalogId:g.catalogId}};
  const now=Date.now();
  let normalized;
  try{
    normalized=rows.map(normalizeRow);
  }catch(error){
    return {status:400,body:{error:'literature_catalog_index_batch_invalid',detail:safe(error?.message||error,240)}};
  }
  const batchDois=normalized.map(row=>row.doi);
  if(new Set(batchDois).size!==batchDois.length){
    return {status:400,body:{error:'literature_catalog_index_batch_duplicate_doi'}};
  }
  const placeholders=normalized.map(()=>'?').join(',');
  const existingResult=await env.LITERATURE_INDEX_DB.prepare(
    `SELECT doi,revision FROM literature_catalog_index WHERE catalog_id=? AND doi IN (${placeholders})`
  ).bind(g.catalogId,...normalized.map(row=>row.doi)).all();
  const existingByDoi=new Map((existingResult?.results||[]).map(row=>[row.doi,row.revision]));
  let newRows=0;
  for(const row of normalized){
    const existingRevision=existingByDoi.get(row.doi);
    if(existingRevision&&existingRevision!==row.revision){
      return {status:409,body:{error:'literature_catalog_index_batch_rejected',
        detail:'literature_catalog_row_revision_conflict:'+row.doi}};
    }
    if(!existingRevision) newRows+=1;
  }
  const before=await env.LITERATURE_INDEX_DB.prepare('SELECT COUNT(*) AS c FROM literature_catalog_index WHERE catalog_id=?')
    .bind(g.catalogId).first();
  const beforeRows=Number(before?.c||0);
  if(beforeRows+newRows>g.recordCount){
    return {status:409,body:{error:'literature_catalog_index_row_overflow',catalogId:g.catalogId,
      recordCount:g.recordCount,existingRows:beforeRows,newRows}};
  }
  try{
    const statements=normalized.flatMap(row=>indexRowWriteStatements(env.LITERATURE_INDEX_DB,g.catalogId,row,now));
    await env.LITERATURE_INDEX_DB.batch(statements);
  }catch(error){
    return {status:500,body:{error:'literature_catalog_index_batch_write_failed',detail:safe(error?.message||error,240)}};
  }
  const count=await env.LITERATURE_INDEX_DB.prepare('SELECT COUNT(*) AS c FROM literature_catalog_index WHERE catalog_id=?')
    .bind(g.catalogId).first();
  const importedRows=Number(count?.c||0);
  await env.LITERATURE_INDEX_DB.prepare('UPDATE literature_catalog_generations SET imported_rows=?,updated_at=? WHERE catalog_id=?')
    .bind(importedRows,now,g.catalogId).run();
  return {status:200,body:{ok:true,enabled:true,readPathActive:false,catalogId:g.catalogId,
    batchRows:rows.length,uniqueBatchRows:normalized.length,writeStatements:normalized.length*3,
    importedRows,recordCount:g.recordCount,ready:false}};
}

export async function finalizeLiteratureCatalogGeneration(env,catalogIdValue){
  if(!literatureCatalogIndexShadowEnabled(env)) return {status:409,body:{error:'literature_catalog_index_shadow_disabled',enabled:false,readPathActive:false}};
  if(!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureLiteratureCatalogIndexSchema(env);
  const catalogId=hash64(catalogIdValue);
  if(!catalogId) return {status:400,body:{error:'literature_catalog_id_invalid'}};
  const generation=await generationRow(env,catalogId);
  if(!generation) return {status:404,body:{error:'literature_catalog_generation_not_found'}};
  const parity=await env.LITERATURE_INDEX_DB.prepare(`SELECT
      (SELECT COUNT(*) FROM literature_catalog_index WHERE catalog_id=?) AS indexed_rows,
      (SELECT COUNT(*) FROM literature_catalog_fts WHERE catalog_id=?) AS fts_rows,
      (SELECT COUNT(DISTINCT doi) FROM literature_catalog_fts WHERE catalog_id=?) AS fts_distinct_dois,
      (SELECT COUNT(*) FROM literature_catalog_index i
        LEFT JOIN literature_catalog_fts f ON f.catalog_id=i.catalog_id AND f.doi=i.doi
        WHERE i.catalog_id=? AND f.doi IS NULL) AS missing_fts_rows,
      (SELECT COUNT(*) FROM literature_catalog_fts f
        LEFT JOIN literature_catalog_index i ON i.catalog_id=f.catalog_id AND i.doi=f.doi
        WHERE f.catalog_id=? AND i.doi IS NULL) AS orphan_fts_rows
    `).bind(catalogId,catalogId,catalogId,catalogId,catalogId).first();
  const indexedRows=Number(parity?.indexed_rows||0);
  const ftsRows=Number(parity?.fts_rows||0);
  const ftsDistinctDois=Number(parity?.fts_distinct_dois||0);
  const missingFtsRows=Number(parity?.missing_fts_rows||0);
  const orphanFtsRows=Number(parity?.orphan_fts_rows||0);
  const recordCount=Number(generation.record_count||0);
  if(indexedRows!==recordCount||ftsRows!==recordCount||ftsDistinctDois!==recordCount
    ||missingFtsRows!==0||orphanFtsRows!==0){
    return {status:409,body:{error:'literature_catalog_generation_incomplete',catalogId,recordCount,
      indexedRows,ftsRows,ftsDistinctDois,missingFtsRows,orphanFtsRows}};
  }
  const now=Date.now();
  await env.LITERATURE_INDEX_DB.prepare('UPDATE literature_catalog_generations SET imported_rows=?,ready=1,updated_at=? WHERE catalog_id=?')
    .bind(indexedRows,now,catalogId).run();
  return {status:200,body:{ok:true,enabled:true,readPathActive:false,catalogId,recordCount,
    indexedRows,ftsRows,ftsDistinctDois,missingFtsRows,orphanFtsRows,ready:true}};
}

function phraseQuery(value){
  const q=String(value||'');
  if(codepoints(q)<3) return '';
  return '"'+q.replaceAll('"','""')+'"';
}
function encodeCursor(row,catalogId,queryText){
  const payload=JSON.stringify({
    c:catalogId,q:queryText,d:String(row?.first_online_date||''),i:normalizeDoi(row?.doi),
  });
  return btoa(payload).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function decodeCursor(value,catalogId,queryText){
  const raw=safe(value,1000);
  if(!raw) return null;
  try{
    const normalized=raw.replaceAll('-','+').replaceAll('_','/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    const parsed=JSON.parse(atob(padded));
    const date=parsed?.d===''?'':(validDate(parsed?.d)?parsed.d:null);
    const doi=normalizeDoi(parsed?.i);
    if(date===null||!doi||hash64(parsed?.c)!==catalogId||String(parsed?.q||'')!==queryText){
      throw new Error('scope');
    }
    return {date,doi};
  }catch(error){
    if(error instanceof Error&&error.message==='scope') throw new Error('literature_catalog_cursor_scope_mismatch');
    throw new Error('literature_catalog_cursor_invalid');
  }
}

export async function queryLiteratureCatalogIndex(env,{catalogId:catalogIdValue,query,limit=60,cursor=''}={}){
  if(!literatureCatalogIndexShadowEnabled(env)) return {status:409,body:{error:'literature_catalog_index_shadow_disabled',enabled:false,readPathActive:false}};
  if(!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureLiteratureCatalogIndexSchema(env);
  const catalogId=hash64(catalogIdValue);
  if(!catalogId) return {status:400,body:{error:'literature_catalog_id_invalid'}};
  const generation=await generationRow(env,catalogId);
  if(!generation||Number(generation.ready||0)!==1) return {status:409,body:{error:'literature_catalog_generation_not_ready',catalogId}};
  let queryText='';
  try{queryText=searchQueryText(query);}catch(error){
    return {status:400,body:{error:safe(error?.message||error,120)}};
  }
  const match=phraseQuery(queryText);
  if(!match) return {status:422,body:{error:'literature_catalog_short_query_requires_compatibility',minimumIndexedCharacters:3,readPathActive:false}};
  const boundedLimit=Math.max(1,Math.min(100,Math.floor(Number(limit||60))));
  let after=null;
  try{after=decodeCursor(cursor,catalogId,queryText);}catch(error){
    return {status:400,body:{error:safe(error?.message||error,120)}};
  }
  const total=await env.LITERATURE_INDEX_DB.prepare(`SELECT COUNT(*) AS c
    FROM literature_catalog_fts f
    JOIN literature_catalog_index i ON i.catalog_id=f.catalog_id AND i.doi=f.doi
    WHERE literature_catalog_fts MATCH ? AND f.catalog_id=? AND i.catalog_id=?`)
    .bind(match,catalogId,catalogId).first();
  const cursorClause=after
    ? ` AND (COALESCE(i.first_online_date,'') < ? OR
        (COALESCE(i.first_online_date,'') = ? AND i.doi > ?))`
    : '';
  const sql=`SELECT i.doi,i.revision,i.title,i.title_zh,i.authors_json,i.journal,
      i.first_online_date,i.date_precision,i.added_date,i.synthesis_type
    FROM literature_catalog_fts f
    JOIN literature_catalog_index i ON i.catalog_id=f.catalog_id AND i.doi=f.doi
    WHERE literature_catalog_fts MATCH ? AND f.catalog_id=? AND i.catalog_id=?${cursorClause}
    ORDER BY COALESCE(i.first_online_date,'') DESC, i.doi ASC
    LIMIT ?`;
  const statement=env.LITERATURE_INDEX_DB.prepare(sql);
  const args=after
    ? [match,catalogId,catalogId,after.date,after.date,after.doi,boundedLimit+1]
    : [match,catalogId,catalogId,boundedLimit+1];
  const result=await statement.bind(...args).all();
  const raw=result?.results||[];
  const hasMore=raw.length>boundedLimit;
  const pageRows=raw.slice(0,boundedLimit);
  const items=pageRows.map(row=>({
    doi:row.doi,revision:row.revision,title:row.title,titleZh:row.title_zh,
    authors:JSON.parse(row.authors_json||'[]'),journal:row.journal,
    firstOnlineDate:row.first_online_date,datePrecision:row.date_precision,
    addedDate:row.added_date,synthesisType:row.synthesis_type,
  }));
  const matched=Number(total?.c||0);
  const nextCursor=hasMore&&pageRows.length?encodeCursor(pageRows.at(-1),catalogId,queryText):null;
  return {status:200,body:{version:1,schemaVersion:LITERATURE_CATALOG_INDEX_SCHEMA_VERSION,
    enabled:true,readPathActive:false,catalogId,query:safe(query,300),matched,
    limit:boundedLimit,count:items.length,hasMore,nextCursor,items}};
}

export async function listLiteratureCatalogIndexRows(env,{catalogId:catalogIdValue,afterDoi='',limit=200}={}){
  if(!literatureCatalogIndexShadowEnabled(env)) return {status:409,body:{error:'literature_catalog_index_shadow_disabled',enabled:false,readPathActive:false}};
  if(!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureLiteratureCatalogIndexSchema(env);
  const catalogId=hash64(catalogIdValue);
  if(!catalogId) return {status:400,body:{error:'literature_catalog_id_invalid'}};
  const generation=await generationRow(env,catalogId);
  if(!generation||Number(generation.ready||0)!==1) return {status:409,body:{error:'literature_catalog_generation_not_ready',catalogId}};
  const after=afterDoi?normalizeDoi(afterDoi):'';
  if(afterDoi&&!after) return {status:400,body:{error:'literature_catalog_after_doi_invalid'}};
  const boundedLimit=Math.max(1,Math.min(250,Math.floor(Number(limit||200))));
  const result=await env.LITERATURE_INDEX_DB.prepare(`SELECT doi,revision,title,title_zh,authors_json,journal,
      first_online_date,date_precision,added_date,synthesis_type
    FROM literature_catalog_index
    WHERE catalog_id=? AND doi>?
    ORDER BY doi ASC LIMIT ?`).bind(catalogId,after,boundedLimit+1).all();
  const raw=result?.results||[];
  const hasMore=raw.length>boundedLimit;
  const page=raw.slice(0,boundedLimit);
  const items=page.map(row=>({
    doi:row.doi,revision:row.revision,title:row.title,titleZh:row.title_zh,
    authors:JSON.parse(row.authors_json||'[]'),journal:row.journal,
    firstOnlineDate:row.first_online_date,datePrecision:row.date_precision,
    addedDate:row.added_date,synthesisType:row.synthesis_type,
  }));
  return {status:200,body:{version:1,schemaVersion:LITERATURE_CATALOG_INDEX_SCHEMA_VERSION,
    enabled:true,readPathActive:false,catalogId,count:items.length,hasMore,
    nextAfterDoi:hasMore&&items.length?items.at(-1).doi:null,items}};
}

export async function getLiteratureCatalogIndexStatus(env){
  if(!literatureCatalogIndexShadowEnabled(env)){
    return {status:200,body:{version:1,schemaVersion:LITERATURE_CATALOG_INDEX_SCHEMA_VERSION,
      enabled:false,readConfigured:literatureCatalogIndexReadEnabled(env),readPathActive:false}};
  }
  if(!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureLiteratureCatalogIndexSchema(env);
  const rows=await env.LITERATURE_INDEX_DB.prepare(`SELECT catalog_id,doi_set_hash,publication_slot,source_commit,marker_blob_sha,
    record_count,imported_rows,ready,created_at,updated_at
    FROM literature_catalog_generations ORDER BY updated_at DESC LIMIT 10`).all();
  const generations=(rows?.results||[]).map(row=>({
    catalogId:row.catalog_id,doiSetHash:row.doi_set_hash,publicationSlot:row.publication_slot,
    sourceCommit:row.source_commit,markerBlobSha:row.marker_blob_sha,recordCount:Number(row.record_count||0),
    importedRows:Number(row.imported_rows||0),ready:Number(row.ready||0)===1,
    createdAt:Number(row.created_at||0),updatedAt:Number(row.updated_at||0),
  }));
  return {status:200,body:{version:1,schemaVersion:LITERATURE_CATALOG_INDEX_SCHEMA_VERSION,
    enabled:true,readConfigured:literatureCatalogIndexReadEnabled(env),readPathActive:false,generations}};
}
