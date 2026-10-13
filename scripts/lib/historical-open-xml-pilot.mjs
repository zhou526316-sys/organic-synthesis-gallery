// Official Europe PMC OA JATS source evaluation. No raw article persistence.
import {createHash} from 'node:crypto';
const DOI=/^10\.\d{4,9}\/[^\s?#]{1,220}$/,PMCID=/^PMC\d{4,12}$/;
export function doi(value){const x=String(value||'').toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').trim();return DOI.test(x)?x:'';}
const quota=[['Nature Communications',7],['Nature Synthesis',2],['Nature Chemistry',2],['Nature Catalysis',1],['Science Advances',1],['JACS',3],['ACS Catalysis',2],['Organic Letters',2]];
export function sample(registry,release,limit=20){
 if(!Array.isArray(registry?.articles)||!Array.isArray(release?.dois)||release.dois.length!==release.productionCards||!/^[a-f0-9]{64}$/.test(String(release.architectureCatalogId||'')))throw Error('formal_release_invalid');
 const allowed=new Set(release.dois.map(doi));if(allowed.size!==release.dois.length)throw Error('formal_doi_duplicate');
 const g=new Map(),seen=new Set();
 for(const a of registry.articles){const id=doi(a.doi),date=String(a.date||''),journal=String(a.journal||'');if(!allowed.has(id)||seen.has(id)||!journal||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>='2026-10-01')continue;seen.add(id);if(!g.has(journal))g.set(journal,[]);g.get(journal).push({doi:id,journal,date});}
 for(const rows of g.values())rows.sort((a,b)=>b.date.localeCompare(a.date)||a.doi.localeCompare(b.doi));
 const selected=[],cap=Math.min(20,Math.max(1,Number(limit)||20));
 for(const [j,count] of quota){const rows=g.get(j)||[];for(let i=0;i<count&&rows.length&&selected.length<cap;i++)selected.push(rows.shift());}
 while(selected.length<cap){let changed=false;for(const j of [...g.keys()].sort()){const rows=g.get(j);if(rows.length&&selected.length<cap){selected.push(rows.shift());changed=true;}}if(!changed)break;}
 return selected;
}
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&#\d+;/g,' ').replace(/&\w+;/g,' ').replace(/\s+/g,' ').trim();
export function parseJats(xml,expected){
 if(typeof xml!=='string'||xml.length<200||xml.length>2600000)return {state:'invalid_xml'};
 const meta=/<article-meta(?:\s[^>]*)?>([\s\S]*?)<\/article-meta>/i.exec(xml)?.[1]||'';
 const ids=[...meta.matchAll(/<article-id\b([^>]*)>([\s\S]*?)<\/article-id>/gi)].filter(x=>/pub-id-type=["']doi["']/i.test(x[1])).map(x=>doi(clean(x[2]))).filter(Boolean);
 if(new Set(ids).size!==1||ids[0]!==expected)return {state:'xml_doi_mismatch'};
 const licenses=[...meta.matchAll(/<license\b[^>]*>([\s\S]*?)<\/license>/gi)].map(x=>x[0]);
 if(!licenses.length)return {state:'license_unknown'};
 const permissions=new Set();
 for(const x of licenses){
   if(/by-nc|by-nd|noncommercial|no.derivative|all rights reserved/i.test(x))return {state:'reuse_restricted'};
   for(const m of x.matchAll(/https?:\/\/creativecommons\.org\/(licenses\/by\/(?:3\.0|4\.0)|publicdomain\/zero\/1\.0)\/?/gi)){
     permissions.add(m[1].toLowerCase().replace('licenses/',''));
   }
 }
 if(permissions.size!==1)return {state:'license_unknown'};
 const license=[...permissions][0];
 const body=/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i.exec(xml)?.[1]||'';
 if(!body)return {state:'body_unavailable',license};
 const headings=[...body.matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/gi)].map(x=>clean(x[1]).toLowerCase());
 const kinds={
   results:headings.some(x=>/result|discussion|synthes|synthetic|substrate|scope|optimization/.test(x)),
   mechanism:headings.some(x=>/mechanis|kinetic|control experiment|spectroscop/.test(x)),
   methods:headings.some(x=>/experimental|methods|procedure/.test(x)),
   conclusion:headings.some(x=>/conclusion|outlook|summary/.test(x))
 };
 const sections=(body.match(/<sec(?:\s[^>]*)?>/gi)||[]).length;
 const paragraphs=(body.match(/<p(?:\s[^>]*)?>/gi)||[]).length;
 const figures=(body.match(/<fig(?:\s[^>]*)?>/gi)||[]).length;
 const tables=(body.match(/<table-wrap(?:\s[^>]*)?>/gi)||[]).length;
 const chars=clean(body).length;
 if(!(kinds.results||kinds.mechanism||kinds.methods)||sections<1||paragraphs<2||chars<450)return {state:'science_incomplete',license,sections,paragraphs,figures,tables,chars,kinds};
 const grade=kinds.results&&kinds.conclusion&&chars>=2400&&sections>=3?'complete_candidate':'partial';
 return{state:'needs_independent_review',license,grade,sections,paragraphs,figures,tables,chars,kinds,xmlSha256:createHash('sha256').update(xml).digest('hex')};
}
export function matchMeta(input,id){
 const list=Array.isArray(input?.resultList?.result)?input.resultList.result:[];
 const matches=list.filter(x=>doi(x.doi)===id);
 if(matches.length!==1)return {state:'metadata_doi_missing'};
 const row=matches[0];
 if(row.isOpenAccess!=='Y'||!PMCID.test(String(row.pmcid||'')))return {state:'pmc_oa_missing'};
 return {state:'pmc_oa_candidate',pmcid:row.pmcid};
}
export async function limitedGet(url,kind='json',max=2800000){
 const u=new URL(url);
 if(u.protocol!=='https:'||!['www.ebi.ac.uk','gallery.gczhouwld.com'].includes(u.hostname)||u.username||u.password)throw Error('invalid_origin');
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(16000)});
 if(r.status===429)throw Error('source_rate_limited');
 if(r.status===404)return '';
 if(!r.ok)throw Error('source_http_'+r.status);
 const type=String(r.headers.get('content-type')||'');
 if(kind==='json'&&!/json/.test(type)||kind==='xml'&&!/(xml|text\/plain)/.test(type))throw Error('source_mime');
 const s=await r.text();if(s.length>max)throw Error('source_too_large');return s;
}
export async function inspect(row){
 const uri=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
 uri.search=new URLSearchParams({query:'DOI:'+row.doi,format:'json',resultType:'core',pageSize:'3'}).toString();
 const result=await limitedGet(uri.toString(),'json',750000);
 if(!result)return {state:'metadata_doi_missing'};
 const meta=matchMeta(JSON.parse(result),row.doi);
 if(meta.state!=='pmc_oa_candidate')return meta;
 const xml=await limitedGet('https://www.ebi.ac.uk/europepmc/webservices/rest/'+meta.pmcid+'/fullTextXML','xml');
 if(!xml)return {pmcid:meta.pmcid,state:'xml_unavailable'};
 return {pmcid:meta.pmcid,...parseJats(xml,row.doi)};
}
