// Read-only, snapshot-bound publication metadata. Does not grant publication approval.
const SCHEMA = 'stored-publication-page-v1';
export async function publicationPage(request, env, key, kind, selectRows) {
  if (!env?.MEDIA) return {status:503, body:{error:'publication_index_unavailable'}};
  try {
    const u = new URL(request.url);
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 250);
    const requested = u.searchParams.get('snapshot') || '';
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 || (offset && !requested) || (requested && !/^[a-f0-9]{64}$/.test(requested)))
      return {status:400, body:{error:'publication_page_parameters_invalid'}};
    const object = await env.MEDIA.get(key);
    const raw = object ? await object.text() : '{"items":{}}';
    if (raw.length > 64000000) throw new Error('publication_index_too_large');
    const index = JSON.parse(raw);
    if (!index || !index.items || typeof index.items !== 'object' || Array.isArray(index.items)) throw new Error('publication_index_invalid');
    const rows = selectRows(index);
    if (!Array.isArray(rows) || rows.length > 20000) throw new Error('publication_index_too_large');
    // Hash the selected records, not unrelated latest-diagnostic timestamps.
    const snapshot = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows))))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if (requested && requested !== snapshot) return {status:409, body:{error:'publication_snapshot_changed'}};
    if (offset > rows.length) return {status:400, body:{error:'publication_offset_out_of_range'}};
    const items = rows.slice(offset, offset + limit);
    return {status:200, body:{schemaVersion:SCHEMA,kind,mediaGeneration:1790082000000,snapshot,count:rows.length,offset,limit,nextOffset:offset+items.length<rows.length?offset+items.length:null,items}};
  } catch (e) {
    return {status:503,body:{error:/^publication_/.test(String(e.message))?e.message:'publication_index_unavailable'}};
  }
}
