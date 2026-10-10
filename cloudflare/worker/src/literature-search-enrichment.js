// DOI-fenced supplementary search evidence. No literature admission, withdrawal,
// media acquisition or primary-D1 writes occur through this module.
export const SEARCH_ENRICHMENT_BATCH_MAX = 8;
const schemaBindings = new WeakSet();
const HASH = /^[a-f0-9]{64}$/;
const DOI = /^10\.\d{4,9}\/\S+$/;
const normalizeDoi = value => {
  const doi = String(value || '').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
  return DOI.test(doi) ? doi : '';
};
const safeError = error => String(error?.message || error || 'unknown').slice(0, 200);
const bytes = value => new TextEncoder().encode(value).byteLength;
function textField(value, limit, name) {
  const text = String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim();
  if (bytes(text) > limit) throw new Error('search_enrichment_field_over_budget:' + name);
  return text;
}
export async function ensureSearchEnrichmentSchema(env) {
  const db = env?.LITERATURE_INDEX_DB;
  if (!db) throw new Error('literature_catalog_index_db_missing');
  if (schemaBindings.has(db)) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS literature_search_enrichment_generations (
      catalog_id TEXT PRIMARY KEY, source_hash TEXT NOT NULL, expected_rows INTEGER NOT NULL,
      imported_rows INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS literature_search_enrichment (
      catalog_id TEXT NOT NULL, doi TEXT NOT NULL, revision TEXT NOT NULL,
      abstract_text TEXT NOT NULL DEFAULT '', abstract_source TEXT NOT NULL DEFAULT '',
      reviewed_summary_en TEXT NOT NULL DEFAULT '', reviewed_summary_zh TEXT NOT NULL DEFAULT '',
      searchable_text TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
      PRIMARY KEY (catalog_id,doi))`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS literature_search_enrichment_fts USING fts5(
      catalog_id UNINDEXED,doi UNINDEXED,searchable_text,tokenize='trigram')`,
  ]) await db.prepare(sql).run();
  schemaBindings.add(db);
}
async function baseGeneration(db, catalogId) {
  return db.prepare('SELECT record_count,ready FROM literature_catalog_generations WHERE catalog_id=?')
    .bind(catalogId).first();
}
async function enrichmentGeneration(db, catalogId) {
  return db.prepare('SELECT * FROM literature_search_enrichment_generations WHERE catalog_id=?')
    .bind(catalogId).first();
}
export async function searchEnrichmentReady(env, catalogId) {
  if (!env?.LITERATURE_INDEX_DB || !HASH.test(String(catalogId || ''))) return false;
  // Public search is strictly read-only; schema creation is confined to the
  // authenticated importer. An old pre-enrichment deployment is non-fatal.
  try {
    const row = await enrichmentGeneration(env.LITERATURE_INDEX_DB, catalogId);
    return Boolean(row && Number(row.ready) === 1 && Number(row.expected_rows) === Number(row.imported_rows));
  } catch (error) {
    if (/no such table|D1_ERROR/i.test(String(error?.message || ''))) return false;
    throw error;
  }
}
export async function beginSearchEnrichment(env, payload = {}) {
  if (!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  const catalogId = String(payload.catalogId || '').toLowerCase();
  const sourceHash = String(payload.sourceHash || '').toLowerCase();
  if (!HASH.test(catalogId) || !HASH.test(sourceHash)) return {status:400,body:{error:'search_enrichment_identity_invalid'}};
  await ensureSearchEnrichmentSchema(env);
  const db = env.LITERATURE_INDEX_DB;
  const base = await baseGeneration(db, catalogId);
  if (!base || Number(base.ready) !== 1) return {status:409,body:{error:'search_enrichment_base_generation_not_ready'}};
  const expected = Number(base.record_count);
  const previous = await enrichmentGeneration(db, catalogId);
  if (previous && (previous.source_hash !== sourceHash || Number(previous.expected_rows) !== expected)) {
    return {status:409,body:{error:'search_enrichment_source_conflict'}};
  }
  if (!previous) {
    const now = Date.now();
    await db.prepare(`INSERT INTO literature_search_enrichment_generations
      (catalog_id,source_hash,expected_rows,imported_rows,ready,created_at,updated_at)
      VALUES (?,?,?,0,0,?,?)`).bind(catalogId,sourceHash,expected,now,now).run();
  }
  const row = await enrichmentGeneration(db,catalogId);
  return {status:200,body:{ok:true,catalogId,expectedRows:expected,
    importedRows:Number(row.imported_rows),ready:Number(row.ready)===1}};
}
function normalizeEnrichmentRow(input) {
  const doi = normalizeDoi(input?.doi);
  const revision = String(input?.revision || '').toLowerCase();
  if (!doi || !HASH.test(revision)) throw new Error('search_enrichment_doi_revision_invalid');
  const abstract = textField(input.abstract,24000,'abstract');
  const summaryEn = textField(input.summaryEn,12000,'summaryEn');
  const summaryZh = textField(input.summaryZh,12000,'summaryZh');
  const source = String(input.abstractSource || '');
  if (!['','crossref','openalex'].includes(source) || (source && !abstract)) {
    throw new Error('search_enrichment_abstract_source_invalid');
  }
  const searchable = [abstract,summaryEn,summaryZh].filter(Boolean).join(' ').toLowerCase();
  if (bytes(searchable) > 48000) throw new Error('search_enrichment_searchable_over_budget');
  return {doi,revision,abstract,source,summaryEn,summaryZh,searchable};
}
export async function importSearchEnrichment(env, payload = {}) {
  const rows = payload.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > SEARCH_ENRICHMENT_BATCH_MAX)
    return {status:400,body:{error:'search_enrichment_batch_invalid'}};
  const begin = await beginSearchEnrichment(env,payload);
  if (begin.status !== 200) return begin;
  if (begin.body.ready) return {status:409,body:{error:'search_enrichment_already_ready'}};
  let normalized;
  try { normalized = rows.map(normalizeEnrichmentRow); }
  catch (error) { return {status:400,body:{error:safeError(error)}}; }
  if (new Set(normalized.map(row => row.doi)).size !== normalized.length)
    return {status:400,body:{error:'search_enrichment_batch_duplicate_doi'}};
  const db = env.LITERATURE_INDEX_DB,catalogId = begin.body.catalogId;
  const placeholders = normalized.map(() => '?').join(',');
  const baseline = await db.prepare(`SELECT doi,revision FROM literature_catalog_index
    WHERE catalog_id=? AND doi IN (${placeholders})`).bind(catalogId,...normalized.map(row=>row.doi)).all();
  const valid = new Map((baseline.results || []).map(row => [row.doi,row.revision]));
  if (normalized.some(row => valid.get(row.doi) !== row.revision))
    return {status:409,body:{error:'search_enrichment_member_revision_mismatch'}};
  const before = await db.prepare('SELECT doi,revision FROM literature_search_enrichment WHERE catalog_id=?')
    .bind(catalogId).all();
  const existing = new Map((before.results || []).map(row => [row.doi,row.revision]));
  if (normalized.some(row => existing.has(row.doi) && existing.get(row.doi) !== row.revision))
    return {status:409,body:{error:'search_enrichment_conflicting_revision'}};
  const incoming = normalized.filter(row => !existing.has(row.doi)).length;
  if (existing.size + incoming > begin.body.expectedRows)
    return {status:409,body:{error:'search_enrichment_row_overflow'}};
  const now = Date.now();
  try {
    const statements = normalized.flatMap(row => [
      db.prepare(`INSERT INTO literature_search_enrichment
        (catalog_id,doi,revision,abstract_text,abstract_source,reviewed_summary_en,
         reviewed_summary_zh,searchable_text,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(catalog_id,doi) DO UPDATE SET
           abstract_text=excluded.abstract_text,abstract_source=excluded.abstract_source,
           reviewed_summary_en=excluded.reviewed_summary_en,reviewed_summary_zh=excluded.reviewed_summary_zh,
           searchable_text=excluded.searchable_text,updated_at=excluded.updated_at
         WHERE literature_search_enrichment.revision=excluded.revision`).bind(
         catalogId,row.doi,row.revision,row.abstract,row.source,row.summaryEn,row.summaryZh,row.searchable,now),
      db.prepare('DELETE FROM literature_search_enrichment_fts WHERE catalog_id=? AND doi=?').bind(catalogId,row.doi),
      db.prepare('INSERT INTO literature_search_enrichment_fts(catalog_id,doi,searchable_text) VALUES(?,?,?)')
        .bind(catalogId,row.doi,row.searchable),
    ]);
    await db.batch(statements);
    const count = await db.prepare('SELECT COUNT(*) AS c FROM literature_search_enrichment WHERE catalog_id=?')
      .bind(catalogId).first();
    await db.prepare('UPDATE literature_search_enrichment_generations SET imported_rows=?,updated_at=? WHERE catalog_id=?')
      .bind(Number(count.c),now,catalogId).run();
    return {status:200,body:{ok:true,catalogId,importedRows:Number(count.c),
      expectedRows:begin.body.expectedRows,ready:false}};
  } catch (error) {
    return {status:500,body:{error:'search_enrichment_import_failed',detail:safeError(error)}};
  }
}
export async function finalizeSearchEnrichment(env,payload={}) {
  const catalogId=String(payload.catalogId || '').toLowerCase();
  const sourceHash=String(payload.sourceHash || '').toLowerCase();
  if (!HASH.test(catalogId) || !HASH.test(sourceHash))
    return {status:400,body:{error:'search_enrichment_identity_invalid'}};
  if (!env?.LITERATURE_INDEX_DB) return {status:503,body:{error:'literature_catalog_index_db_missing'}};
  await ensureSearchEnrichmentSchema(env);
  const db=env.LITERATURE_INDEX_DB,gen=await enrichmentGeneration(db,catalogId);
  if (!gen || gen.source_hash !== sourceHash) return {status:409,body:{error:'search_enrichment_generation_missing_or_conflict'}};
  const checks=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM literature_search_enrichment WHERE catalog_id=?) AS indexed,
    (SELECT COUNT(*) FROM literature_search_enrichment_fts WHERE catalog_id=?) AS fts,
    (SELECT COUNT(DISTINCT doi) FROM literature_search_enrichment_fts WHERE catalog_id=?) AS unique_fts,
    (SELECT COUNT(*) FROM literature_catalog_index i LEFT JOIN literature_search_enrichment e
      ON i.catalog_id=e.catalog_id AND i.doi=e.doi AND i.revision=e.revision
      WHERE i.catalog_id=? AND e.doi IS NULL) AS missing,
    (SELECT COUNT(*) FROM literature_search_enrichment e LEFT JOIN literature_catalog_index i
      ON e.catalog_id=i.catalog_id AND e.doi=i.doi AND e.revision=i.revision
      WHERE e.catalog_id=? AND i.doi IS NULL) AS orphans
    `).bind(catalogId,catalogId,catalogId,catalogId,catalogId).first();
  const count=Number(gen.expected_rows);
  if (Number(checks.indexed)!==count||Number(checks.fts)!==count||Number(checks.unique_fts)!==count
      ||Number(checks.missing)!==0||Number(checks.orphans)!==0) {
    return {status:409,body:{error:'search_enrichment_incomplete',expected:count,checks}};
  }
  await db.prepare('UPDATE literature_search_enrichment_generations SET imported_rows=?,ready=1,updated_at=? WHERE catalog_id=?')
    .bind(count,Date.now(),catalogId).run();
  return {status:200,body:{ok:true,ready:true,catalogId,recordCount:count}};
}
// Metadata coverage is distinct from DOI membership coverage.
export async function getSearchEnrichmentCoverage(env,payload={}) {
  const catalogId=String(payload.catalogId||'').toLowerCase();
  const afterDoi=payload.afterDoi?normalizeDoi(payload.afterDoi):'';
  if(!HASH.test(catalogId)||(payload.afterDoi&&!afterDoi))
    return {status:400,body:{error:'search_enrichment_coverage_request_invalid'}};
  if(!await searchEnrichmentReady(env,catalogId))
    return {status:409,body:{error:'search_enrichment_generation_not_ready'}};
  const db=env.LITERATURE_INDEX_DB;
  const totals=await db.prepare('SELECT COUNT(*) AS total,'
      +' SUM(CASE WHEN length(e.abstract_text)>0 THEN 1 ELSE 0 END) AS originals,'
      +' SUM(CASE WHEN length(e.reviewed_summary_en)>0 OR length(e.reviewed_summary_zh)>0 THEN 1 ELSE 0 END) AS reviewed,'
      +' SUM(CASE WHEN length(e.abstract_text)=0 THEN 1 ELSE 0 END) AS missing'
      +' FROM literature_search_enrichment e'
      +' JOIN literature_catalog_index i ON i.catalog_id=e.catalog_id'
      +' AND i.doi=e.doi AND i.revision=e.revision WHERE e.catalog_id=?')
    .bind(catalogId).first();
  const limit=Math.max(1,Math.min(200,Math.floor(Number(payload.limit||100))));
  const rows=await db.prepare('SELECT e.doi,e.revision FROM literature_search_enrichment e'
      +' JOIN literature_catalog_index i ON i.catalog_id=e.catalog_id AND i.doi=e.doi AND i.revision=e.revision'
      +' WHERE e.catalog_id=? AND length(e.abstract_text)=0 AND e.doi>? ORDER BY e.doi ASC LIMIT ?')
    .bind(catalogId,afterDoi,limit+1).all();
  const hasMore=(rows.results||[]).length>limit;
  const selected=(rows.results||[]).slice(0,limit);
  return {status:200,body:{ok:true,catalogId,ready:true,
    total:Number(totals?.total||0),originalAbstracts:Number(totals?.originals||0),
    approvedDescriptions:Number(totals?.reviewed||0),
    missingOriginalAbstracts:Number(totals?.missing||0),count:selected.length,
    hasMore,nextAfterDoi:hasMore?selected.at(-1)?.doi:null,
    items:selected.map(row=>({doi:row.doi,revision:row.revision}))}};
}
// Replenish only genuinely empty abstracts under the exact reviewed DOI/revision.
// The atomic D1 batch preserves existing author, title, reviews and membership.
export async function refreshSearchEnrichmentAbstracts(env,payload={}) {
  const catalogId=String(payload.catalogId||'').toLowerCase();
  const sourceHash=String(payload.sourceHash||'').toLowerCase();
  if(!HASH.test(catalogId)||!HASH.test(sourceHash))
    return {status:400,body:{error:'search_enrichment_identity_invalid'}};
  const rows=payload.rows;
  if(!Array.isArray(rows)||rows.length<1||rows.length>SEARCH_ENRICHMENT_BATCH_MAX)
    return {status:400,body:{error:'search_enrichment_refresh_batch_invalid'}};
  if(!await searchEnrichmentReady(env,catalogId))
    return {status:409,body:{error:'search_enrichment_not_ready_for_refresh'}};
  const db=env.LITERATURE_INDEX_DB,gen=await enrichmentGeneration(db,catalogId);
  if(gen?.source_hash!==sourceHash)
    return {status:409,body:{error:'search_enrichment_refresh_source_conflict'}};
  let normalized;
  try{normalized=rows.map(normalizeEnrichmentRow);}
  catch(error){return {status:400,body:{error:safeError(error)}};}
  if(new Set(normalized.map(row=>row.doi)).size!==normalized.length
    ||normalized.some(row=>!row.abstract||!['openalex','crossref'].includes(row.source)
      ||row.summaryEn||row.summaryZh))
    return {status:400,body:{error:'search_enrichment_refresh_original_only_required'}};
  const placeholders=normalized.map(()=>'?').join(',');
  const current=await db.prepare('SELECT e.doi,e.revision,e.abstract_text,e.reviewed_summary_en,e.reviewed_summary_zh'
    +' FROM literature_search_enrichment e JOIN literature_catalog_index i'
    +' ON i.catalog_id=e.catalog_id AND i.doi=e.doi AND i.revision=e.revision'
    +' WHERE e.catalog_id=? AND e.doi IN ('+placeholders+')')
    .bind(catalogId,...normalized.map(row=>row.doi)).all();
  const existing=new Map((current.results||[]).map(row=>[row.doi,row]));
  if(normalized.some(row=>!existing.has(row.doi)
    ||existing.get(row.doi).revision!==row.revision))
    return {status:409,body:{error:'search_enrichment_refresh_member_revision_mismatch'}};
  const changes=normalized.filter(row=>!String(existing.get(row.doi).abstract_text||''));
  if(!changes.length)return {status:200,body:{ok:true,catalogId,refreshed:0,skipped:rows.length,ready:true}};
  const now=Date.now(),statements=[];
  for(const row of changes){
    const old=existing.get(row.doi);
    const searchable=[row.abstract,old.reviewed_summary_en,old.reviewed_summary_zh]
      .filter(Boolean).join(' ').toLowerCase();
    if(bytes(searchable)>48000)return {status:400,body:{error:'search_enrichment_refresh_searchable_over_budget'}};
    statements.push(
      db.prepare('UPDATE literature_search_enrichment SET abstract_text=?,abstract_source=?,'
        +' searchable_text=?,updated_at=? WHERE catalog_id=? AND doi=? AND revision=? AND length(abstract_text)=0')
        .bind(row.abstract,row.source,searchable,now,catalogId,row.doi,row.revision),
      db.prepare('DELETE FROM literature_search_enrichment_fts WHERE catalog_id=? AND doi=?')
        .bind(catalogId,row.doi),
      db.prepare('INSERT INTO literature_search_enrichment_fts(catalog_id,doi,searchable_text) VALUES(?,?,?)')
        .bind(catalogId,row.doi,searchable)
    );
  }
  try{
    await db.batch(statements);
    return {status:200,body:{ok:true,catalogId,ready:true,
      refreshed:changes.length,skipped:rows.length-changes.length,
      dois:changes.map(row=>row.doi)}};
  }catch(error){
    return {status:500,body:{error:'search_enrichment_refresh_failed',detail:safeError(error)}};
  }
}

export async function getSearchAbstract(env,payload={}) {
  const catalogId=String(payload.catalogId || '').toLowerCase();
  const doi=normalizeDoi(payload.doi);
  if(!HASH.test(catalogId)||!doi) return {status:400,body:{error:'search_abstract_invalid_request'}};
  if(!await searchEnrichmentReady(env,catalogId))
    return {status:503,body:{error:'search_abstract_not_ready'}};
  const row=await env.LITERATURE_INDEX_DB.prepare(`SELECT e.abstract_text,e.abstract_source,e.reviewed_summary_en,e.reviewed_summary_zh
    FROM literature_search_enrichment e
    JOIN literature_catalog_index i ON i.catalog_id=e.catalog_id AND i.doi=e.doi AND i.revision=e.revision
    WHERE e.catalog_id=? AND e.doi=?`).bind(catalogId,doi).first();
  if(!row) return {status:404,body:{error:'search_abstract_unavailable'}};
  // The scholarly abstract can carry publisher copyright; index it for
  // discovery, but return only a bounded excerpt and DOI attribution publicly.
  const abstract=String(row.abstract_text||'');
  const abstractExcerpt=abstract?([...abstract].slice(0,200).join('')+( [...abstract].length>200?'…':'')):null;
  return {status:200,body:{doi,abstractAvailable:Boolean(abstract),abstractExcerpt,
    abstractSource:row.abstract_source||null,originalArticleUrl:'https://doi.org/'+doi,
    reviewedSummaryEn:row.reviewed_summary_en||null,reviewedSummaryZh:row.reviewed_summary_zh||null,
    sourceSeparation:true}};
}
// Conservative, chemistry-specific terminology expansion; synonyms do not
// broaden 'LMCT' to every Ce, Fe or radical reaction.
const synonyms = {
  lmct:['ligand-to-metal charge transfer','ligand-to-metal charge-transfer',
    'ligand to metal charge transfer','配体到金属电荷转移','配体向金属电荷转移'],
  'ligand-to-metal charge transfer':['lmct','配体到金属电荷转移'],
  '配体到金属电荷转移':['lmct','ligand-to-metal charge transfer'],
  '配体向金属电荷转移':['lmct','ligand-to-metal charge transfer'],
  '手性磷酸':['chiral phosphoric acid','chiral phosphoric acids','cpa catalysis'],
  '轴手性':['axial chirality','atroposelective','atropisomeric','atropisomer'],
  '氧化环化':['oxidative cyclization','oxidative cyclisation','oxidative annulation'],
  '铈催化':['cerium catalyzed','cerium-catalyzed','cerium catalysis'],
};
function phrase(value){return '"'+String(value).replaceAll('"','""')+'"';}
export function searchFtsExpression(query) {
  const raw=String(query||'').trim().toLowerCase();
  if(!raw||[...raw].length<3) return '';
  // Preserve legacy exact-substring behavior for every unregistered query,
  // including multiword titles and author names. Only vetted chemical terms
  // broaden into a small, explicitly reviewed OR group.
  const alternatives=[raw,...(synonyms[raw]||[])];
  const unique=[...new Set(alternatives.filter(term=>[...term].length>=3))];
  return unique.length>1?'('+unique.map(phrase).join(' OR ')+')':phrase(raw);
}
