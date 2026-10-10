// Public, read-only query-string transport for the existing catalog-view API.
// This does not change the D1 query, DOI membership, review decisions or cursor.
// GET is a simple CORS request (no JSON content-type preflight).
const ALLOWED = new Set([
  'catalogId','query','sort','limit','cursor','dateFrom','dateTo','addedDate',
  'selectedJournal','excludedJournal',
]);
const SINGLES = [...ALLOWED].filter(name=>!['selectedJournal','excludedJournal'].includes(name));
export function parseCatalogViewGetParams(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams : new URLSearchParams(String(searchParams||''));
  if (params.toString().length > 4000)
    return {ok:false,error:'literature_catalog_view_query_url_too_long'};
  if ([...params.keys()].some(name=>!ALLOWED.has(name))
    || SINGLES.some(name=>params.getAll(name).length>1))
    return {ok:false,error:'literature_catalog_view_query_params_invalid'};
  const selectedJournals=params.getAll('selectedJournal');
  const excludedJournals=params.getAll('excludedJournal');
  if(selectedJournals.length>30||excludedJournals.length>30)
    return {ok:false,error:'literature_catalog_view_query_journals_too_many'};
  return {ok:true,query:{
    catalogId:params.get('catalogId')||'',
    query:params.get('query')||'',
    sort:params.get('sort')||'newest',
    limit:params.get('limit')||'60',
    cursor:params.get('cursor')||'',
    dateFrom:params.get('dateFrom')||'',
    dateTo:params.get('dateTo')||'',
    addedDate:params.get('addedDate')||'',
    selectedJournals,excludedJournals,
  }};
}
