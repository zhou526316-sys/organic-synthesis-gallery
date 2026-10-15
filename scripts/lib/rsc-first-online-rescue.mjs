// Metadata-only, DOI-bound first-online date rescue for RSC Chemical Science.
// Never fetches article body, figures, PDFs, SI, or authentication data.
const norm=s=>String(s||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'');
const rscDoi=s=>/^10\.1039\/[a-z]\d{1,2}sc[a-z0-9]+$/.test(norm(s));
export function exactDay(value) {
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const [y,m,d]=s.split('-').map(Number),v=new Date(Date.UTC(y,m-1,d));
  return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d?s:'';
}
export function crossrefFirstOnline(payload,doi) {
  const row=payload?.message||payload,p=row?.['published-online']?.['date-parts']?.[0];
  return norm(row?.DOI)===norm(doi)&&Array.isArray(p)&&p.length>=3
    ?exactDay([String(p[0]).padStart(4,'0'),String(p[1]).padStart(2,'0'),String(p[2]).padStart(2,'0')].join('-')):'';
}
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function explicitDate(raw){
  const s=String(raw||'').trim();
  let m=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T[\d:.+\-Z]*)?$/.exec(s);
  if(m)return exactDay(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));
  m=/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})$/i.exec(s);
  const index=m?months.indexOf(m[2].toLowerCase().slice(0,3)):-1;
  return index<0?'':exactDay(m[3]+'-'+String(index+1).padStart(2,'0')+'-'+m[1].padStart(2,'0'));
}
const attr=(tag,key)=>new RegExp('(?:^|\\s)'+key+'\\s*=\\s*["\\x27]([^"\\x27]+)["\\x27]','i').exec(tag)?.[1]||'';
export function rscFirstPublishedHtml(html,doi){
  if(!rscDoi(doi)||typeof html!=='string'||html.length>5_000_000)return '';
  const tags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
  if(!tags.some(x=>/^(citation_doi|dc.identifier)$/i.test(attr(x,'name'))&&norm(attr(x,'content'))===norm(doi)))return '';
  for(const tag of tags){
    if(!/^(citation_online_date|citation_first_online_date)$/i.test(attr(tag,'name')))continue;
    const d=explicitDate(attr(tag,'content'));if(d)return d;
  }
  const text=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const match=/First\s+published(?:\s+(?:online|on))?\s*:?\s*(\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+\d{4})/i.exec(text);
  return match?explicitDate(match[1]):'';
}
export function europePmcFirstOnline(data,doi){
  for(const row of data?.resultList?.result||[]){
    if(norm(row.doi)!==norm(doi)||!['MED','PMC'].includes(String(row.source||'').toUpperCase()))continue;
    const journal=String(row.journalTitle||row.journalInfo?.journal?.title||'').trim();
    if(!/^(chemical science|chem\.?\s*sci\.?)$/i.test(journal))continue;
    const date=exactDay(row.firstPublicationDate);if(date)return date;
  }
  return '';
}
async function retrieve(url,fetcher,timeoutMs){
  try{
    const resp=await fetcher(url,{signal:AbortSignal.timeout(timeoutMs),
      headers:{Accept:'application/json,text/html;q=0.9'}});
    if(!resp?.ok)return {status:'http_'+String(resp?.status||'unknown')};
    const body=await resp.text();
    if(/captcha|cf-challenge|Just a moment\.\.\./i.test(body.slice(0,4000)))return {status:'bot_blocked'};
    return {status:'ok',body};
  }catch(e){return {status:e?.name==='TimeoutError'||e?.name==='AbortError'?'timeout':'unavailable'};}
}
export async function resolveRscFirstOnline(doi,{fetcher=fetch,timeoutMs=5500,endDate='9999-12-31'}={}){
  if(!rscDoi(doi))throw Error('invalid_rsc_chemical_science_doi');
  const key=norm(doi),code=key.split('/')[1],year=String(endDate).slice(0,4),attemptedSources=[];
  let found='',evidenceSource='';
  const routes=[
    {source:'crossref_published_online',url:'https://api.crossref.org/works/'+encodeURIComponent(key),
      parse:text=>crossrefFirstOnline(JSON.parse(text),key)},
    {source:'rsc_first_published',url:'https://pubs.rsc.org/en/content/articlelanding/'+year+'/sc/'+code,
      parse:text=>rscFirstPublishedHtml(text,key)},
    {source:'europe_pmc_first_publication',url:'https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+
      new URLSearchParams({query:'DOI:'+key,format:'json',resultType:'core'}),
      parse:text=>europePmcFirstOnline(JSON.parse(text),key)}
  ];
  for(const route of routes){
    const result=await retrieve(route.url,fetcher,timeoutMs);
    let status=result.status;
    if(status==='ok')try{found=route.parse(result.body);status=found?'exact_day':'no_verified_first_online_day';}
      catch{status='invalid_metadata';}
    attemptedSources.push({source:route.source,status,url:route.url});
    if(found){evidenceSource=route.source;break;}
  }
  if(found&&found>endDate)return {doi:key,status:'future_publication_hold',
    firstOnlineDate:null,observedFutureDate:found,evidenceSource,attemptedSources};
  return {doi:key,status:found?'verified':'first_online_date_unavailable',
    firstOnlineDate:found||null,evidenceSource:evidenceSource||null,attemptedSources};
}
