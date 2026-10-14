// DOI-bound, independently reviewed public sections only. Never import
// local Tampermonkey/paid-page packets. Public search is disabled by default.
import {searchFtsExpression} from './literature-search-enrichment.js';
export const BODY_SECTION_SCHEMA='reviewed-public-body-section-v1';
const SHA=/^[a-f0-9]{64}$/,DOI=/^10\.\d{4,9}\/[^\s?#]{1,220}$/;
const RIGHTS={'cc-by-4.0':'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-3.0':'https://creativecommons.org/licenses/by/3.0/',
  'cc0-1.0':'https://creativecommons.org/publicdomain/zero/1.0/'};
const TYPES=new Set(['results','scope','mechanism','experimental','introduction',
  'conclusion','figure_caption','table','other']);
const MAX_SCIENCE_SECTIONS=64;
// 5 x 16 columns = 80 bound parameters, below the D1 100-parameter limit.
// At most 26 insert queries (13 content + 13 FTS) per atomic 64-unit import.
const D1_ROWS_PER_INSERT=5;
const D1_MAX_IMPORT_STATEMENTS=26;
const MAX_SCIENCE_BYTES=240000;
const FORBIDDEN=/^(?:references?|bibliography|acknowledgements?|rights and permissions|open access|license|copyright|associated content|author information)\b/i;
const ready=new WeakSet();
const resp=(status,body)=>({status,body});
const norm=s=>String(s||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
function articleUrlMatches(doi,value){
  try{
    const u=new URL(value),host=u.hostname.toLowerCase(),path=decodeURIComponent(u.pathname).toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return false;
    const suffix=doi.slice(doi.indexOf('/')+1);
    if(doi.startsWith('10.1021/'))return host==='pubs.acs.org'&&path.includes(doi);
    if(doi.startsWith('10.1002/'))return (host==='onlinelibrary.wiley.com'||host.endsWith('.onlinelibrary.wiley.com'))&&path.includes(doi);
    if(doi.startsWith('10.1038/'))return (host==='www.nature.com'||host==='nature.com')&&path.includes(suffix);
    if(doi.startsWith('10.1126/'))return host==='www.science.org'&&path.includes(doi);
    if(doi.startsWith('10.1039/'))return host==='pubs.rsc.org'&&path.includes(suffix);
    if(doi.startsWith('10.31635/'))return ['www.ccspublishing.org.cn','www.chinesechemsoc.org','chinesechemsoc.org'].includes(host)&&path.includes(suffix);
    // Elsevier PII paths need separate publisher-specific DOI evidence review.
    return false;
  }catch{return false;}
}
export async function ensurePublicBodySchema(env){
  if(!env?.LITERATURE_INDEX_DB)throw Error('body_index_db_unavailable');
  const db=env.LITERATURE_INDEX_DB;if(ready.has(db))return;
  await db.prepare('CREATE TABLE IF NOT EXISTS literature_body_sections_reviewed ('+
    'catalog_id TEXT NOT NULL,doi TEXT NOT NULL,revision TEXT NOT NULL,'+
    'section_id TEXT NOT NULL,section_type TEXT NOT NULL,heading TEXT NOT NULL,'+
    'body_text TEXT NOT NULL,section_sha TEXT NOT NULL,source_sha TEXT NOT NULL,'+
    'license_kind TEXT NOT NULL,license_url TEXT NOT NULL,article_url TEXT NOT NULL,'+
    'reviewer TEXT NOT NULL,reviewed_at TEXT NOT NULL,completeness TEXT NOT NULL,indexed_at INTEGER NOT NULL,'+
    'PRIMARY KEY(catalog_id,doi,section_id))').run();
  await db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS literature_body_sections_fts USING fts5('+
    'catalog_id UNINDEXED,doi UNINDEXED,section_id UNINDEXED,searchable_text,tokenize="trigram")').run();
  ready.add(db);
}
export async function publicBodyReadReady(env,catalogId){
  if(env?.LITERATURE_BODY_SEARCH_READ_ENABLED!=='1'||!env?.LITERATURE_INDEX_DB||!SHA.test(String(catalogId||'')))return false;
  try{
    const db=env.LITERATURE_INDEX_DB;
    const gen=await db.prepare('SELECT ready FROM literature_catalog_generations WHERE catalog_id=?').bind(catalogId).first();
    if(Number(gen?.ready)!==1)return false;
    const a=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='literature_body_sections_reviewed'").first();
    const b=await db.prepare("SELECT name FROM sqlite_master WHERE name='literature_body_sections_fts'").first();
    return Boolean(a&&b);
  }catch{return false;}
}
async function normalizeInput(input){
  const id=String(input?.catalogId||''),doi=norm(input?.doi),
    revision=String(input?.revision||'');
  if(input?.schemaVersion!==BODY_SECTION_SCHEMA||!SHA.test(id)
    ||!DOI.test(doi)||!SHA.test(revision))throw Error('body_member_identity_invalid');
  // Local captures are explicitly NOT eligible for this route.
  if(input.origin!=='independently_reviewed_public_text'
    ||input.publicUploadAllowed!==true)throw Error('body_private_packet_not_eligible');
  const rows=input.sections,sections=[],ids=new Set();
  if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_SCIENCE_SECTIONS)throw Error('body_batch_invalid');
  let textBytes=0;
  for(const row of rows){
    const sectionId=String(row?.sectionId||''),type=String(row?.type||''),
      heading=String(row?.heading||'').trim().slice(0,200),
      text=String(row?.text||'').trim();
    if(!/^s[0-9]{3}$/.test(sectionId)||ids.has(sectionId)||!TYPES.has(type)
      ||FORBIDDEN.test(heading)||text.length<60||text.length>16000||text.includes('\u0000'))
      throw Error('body_section_invalid');
    if(!SHA.test(row.sha256)||await hash(text)!==row.sha256)throw Error('body_section_sha_invalid');
    textBytes+=new TextEncoder().encode(text).byteLength;
    if(textBytes>MAX_SCIENCE_BYTES)throw Error('body_science_byte_budget_exceeded');
    sections.push({sectionId,type,heading,text,sha:row.sha256});ids.add(sectionId);
  }
  const canonical=sections.map(s=>s.sectionId+'\n'+s.heading+'\n'+s.text).join('\n\n');
  const sourceSha=await hash(canonical);
  if(sourceSha!==input.sourceSha256)throw Error('body_source_sha_invalid');
  const review=input.rightsReview;
  if(!review||review.decision!=='approved_public_reuse'
    ||review.itemLicenseVerified!==true
    ||review.pageDoi!==doi||review.sourceSha256!==sourceSha
    ||review.sourceKind!=='publisher_article_license'
    ||!Object.hasOwn(RIGHTS,review.licenseKind)
    ||review.licenseUrl!==RIGHTS[review.licenseKind]
    ||!articleUrlMatches(doi,review.articleUrl)
    ||String(review.reviewer||'').trim().length<3
    ||String(review.reviewNote||'').trim().length<30)
    throw Error('body_public_rights_review_missing');
  const reviewedAt=Date.parse(String(review.reviewedAt||''));
  if(!Number.isFinite(reviewedAt)||reviewedAt>Date.now()+3600000
    ||reviewedAt<Date.now()-366*86400000)throw Error('body_rights_review_date_invalid');
  return {catalogId:id,doi,revision,sections,sourceSha,
    licenseKind:review.licenseKind,licenseUrl:review.licenseUrl,
    articleUrl:review.articleUrl,reviewer:String(review.reviewer).slice(0,100),
    reviewedAt:new Date(reviewedAt).toISOString(),
    completeness:['partial','complete_candidate'].includes(input.completeness)
      ?input.completeness:'partial'};
}
export async function importReviewedPublicBodySections(env,input){
  if(!env?.LITERATURE_INDEX_DB)return resp(503,{error:'body_index_db_unavailable'});
  let n;try{n=await normalizeInput(input);}catch(e){return resp(400,{error:String(e?.message||'invalid_body')});}
  const db=env.LITERATURE_INDEX_DB;
  const gen=await db.prepare('SELECT ready FROM literature_catalog_generations WHERE catalog_id=?')
    .bind(n.catalogId).first();
  if(Number(gen?.ready)!==1)return resp(409,{error:'body_generation_not_ready'});
  const member=await db.prepare('SELECT revision FROM literature_catalog_index WHERE catalog_id=? AND doi=?')
    .bind(n.catalogId,n.doi).first();
  if(member?.revision!==n.revision)return resp(409,{error:'body_doi_revision_mismatch'});
  await ensurePublicBodySchema(env);
  const prev=await db.prepare('SELECT section_id,section_type,heading,section_sha,source_sha '+
    'FROM literature_body_sections_reviewed WHERE catalog_id=? AND doi=?')
    .bind(n.catalogId,n.doi).all();
  const existing=prev.results||[];
  if(existing.length){
    const approvedById=new Map(n.sections.map(s=>[s.sectionId,s]));
    const identical=existing.length===n.sections.length&&existing.every(row=>{
      const s=approvedById.get(row.section_id);
      return Boolean(s&&row.section_type===s.type&&row.heading===s.heading
        &&row.section_sha===s.sha&&row.source_sha===n.sourceSha);
    });
    if(identical){
      const fts=await db.prepare('SELECT COUNT(*) AS c FROM literature_body_sections_fts '+
        'WHERE catalog_id=? AND doi=?').bind(n.catalogId,n.doi).first();
      if(Number(fts?.c)===n.sections.length)
        return resp(200,{ok:true,alreadyReviewed:true,doi:n.doi,
          storedSections:0,publicEnabled:false});
    }
    // A same-SHA DOI with missing rows, changed section types or missing FTS
    // must not be silently acknowledged as a complete approved import.
    return resp(409,{error:'body_reviewed_source_conflict'});
  }
  if(typeof db.batch!=='function')return resp(503,{error:'body_atomic_transaction_required'});
  const now=Date.now(),statements=[];
  // Each SQL statement carries <=80 parameters; each whole DOI import is
  // one D1 transaction, not N separate subrequests for N science sections.
  // Avoid exceeding 50 D1 queries/Worker invocation on Workers Free.
  const sectionColumns='(catalog_id,doi,revision,section_id,section_type,heading,body_text,'+
    'section_sha,source_sha,license_kind,license_url,article_url,reviewer,reviewed_at,'+
    'completeness,indexed_at)';
  const contentTuple='('+Array(16).fill('?').join(',')+')';
  const searchTuple='(?,?,?,?)';
  for(let offset=0;offset<n.sections.length;offset+=D1_ROWS_PER_INSERT){
    const group=n.sections.slice(offset,offset+D1_ROWS_PER_INSERT);
    const contentBindings=group.flatMap(s=>[
      n.catalogId,n.doi,n.revision,s.sectionId,s.type,s.heading,s.text,s.sha,n.sourceSha,
      n.licenseKind,n.licenseUrl,n.articleUrl,n.reviewer,n.reviewedAt,n.completeness,now
    ]);
    const searchBindings=group.flatMap(s=>[
      n.catalogId,n.doi,s.sectionId,(s.heading+' '+s.text).toLowerCase()
    ]);
    statements.push(db.prepare('INSERT INTO literature_body_sections_reviewed '+sectionColumns+
      ' VALUES '+group.map(()=>contentTuple).join(',')).bind(...contentBindings));
    statements.push(db.prepare('INSERT INTO literature_body_sections_fts '+
      '(catalog_id,doi,section_id,searchable_text) VALUES '+
      group.map(()=>searchTuple).join(',')).bind(...searchBindings));
  }
  if(statements.length>D1_MAX_IMPORT_STATEMENTS)
    return resp(400,{error:'body_d1_query_budget_exceeded'});
  try{await db.batch(statements);}catch{return resp(500,{error:'body_atomic_import_failed'});}
  return resp(200,{ok:true,doi:n.doi,storedSections:n.sections.length,
    sourceSha256:n.sourceSha,licenseKind:n.licenseKind,publicEnabled:false});
}
export async function getPublicBodyCoverage(env,catalogId){
  if(!SHA.test(String(catalogId||'')))return resp(400,{error:'body_invalid_catalog'});
  if(!env?.LITERATURE_INDEX_DB)return resp(503,{error:'body_index_db_unavailable'});
  await ensurePublicBodySchema(env);
  const q=await env.LITERATURE_INDEX_DB.prepare(
    'SELECT COUNT(DISTINCT s.doi) AS dois,COUNT(*) AS sections '+
    'FROM literature_body_sections_reviewed s JOIN literature_catalog_index i '+
    'ON i.catalog_id=s.catalog_id AND i.doi=s.doi AND i.revision=s.revision '+
    'WHERE s.catalog_id=?').bind(catalogId).first();
  return resp(200,{catalogId,verifiedDoi:Number(q?.dois||0),
    verifiedSections:Number(q?.sections||0),publicEnabled:await publicBodyReadReady(env,catalogId)});
}
export async function findPublicBodyMatches(env,{catalogId,query,limit=24,afterDoi='',afterSectionId=''}={}){
  if(!await publicBodyReadReady(env,catalogId))
    return resp(503,{error:'body_public_search_disabled_or_unready'});
  const expr=searchFtsExpression(query);
  if(!expr)return resp(422,{error:'body_query_too_short'});
  const cursorDoi=afterDoi?norm(afterDoi):'';
  if((afterDoi&&(!DOI.test(cursorDoi)||!/^s[0-9]{3}$/.test(afterSectionId)))
    ||(!afterDoi&&afterSectionId))return resp(400,{error:'body_cursor_invalid'});
  const n=Math.max(1,Math.min(24,Math.floor(Number(limit)||24))),db=env.LITERATURE_INDEX_DB;
  const join=' FROM literature_body_sections_fts f JOIN literature_body_sections_reviewed s '+
    'ON s.catalog_id=f.catalog_id AND s.doi=f.doi AND s.section_id=f.section_id '+
    'JOIN literature_catalog_index i ON i.catalog_id=s.catalog_id AND i.doi=s.doi AND i.revision=s.revision '+
    'WHERE f.catalog_id=? AND literature_body_sections_fts MATCH ?';
  const count=await db.prepare('SELECT COUNT(*) AS c'+join).bind(catalogId,expr).first();
  const cursorSql=cursorDoi?' AND (s.doi>? OR (s.doi=? AND s.section_id>?))':'';
  const binds=cursorDoi?[cursorDoi,cursorDoi,afterSectionId]:[];
  const all=await db.prepare('SELECT s.doi,s.section_id,s.section_type,s.heading,s.license_kind,'+
    's.license_url,s.article_url,s.completeness'+join+cursorSql+
    ' ORDER BY s.doi,s.section_id LIMIT ?').bind(catalogId,expr,...binds,n+1).all();
  const page=(all.results||[]).slice(0,n),more=(all.results||[]).length>n;
  const last=page.at(-1);
  return resp(200,{catalogId,matchedSections:Number(count?.c||0),
    count:page.length,hasMore:more,
    nextAfterDoi:more&&last?last.doi:null,
    nextAfterSectionId:more&&last?last.section_id:null,
    items:page.map(r=>({doi:r.doi,sectionId:r.section_id,
      evidenceType:r.section_type,heading:r.heading,source:'reviewed_public_body',
      licenseKind:r.license_kind,licenseUrl:r.license_url,
      originalArticleUrl:r.article_url,completeness:r.completeness}))});
}
