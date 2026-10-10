// Read-only metadata evidence collection: never mutates formal production papers.
// Crossref DOI records originate from journal/publisher deposits. An article DOI,
// journal and original author surname must agree before a proposed title is eligible.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const input = JSON.parse(readFileSync('audit/historical-backfill/2026-07-to-09-title-gaps-static-20261010.json','utf8'));
if (!Array.isArray(input.records) || input.records.length !== 83) throw Error('historical_title_candidate_set_changed');
const normalize = v => String(v || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g,'');
const txt = v => String(v||'').replace(/<\/?(?:i|em|b|strong)>/gi,'')
  .replace(/<sup>([^<]+)<\/sup>/gi,'^$1').replace(/<sub>([^<]+)<\/sub>/gi,'_$1')
  .replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>').trim().replace(/\s+/g,' ');
const results = new Array(input.records.length);
let index=0;
const fetchOne=async function(row){
 const doi=String(row.doi||'').toLowerCase();
 const url='https://api.crossref.org/works/'+encodeURIComponent(doi);
 try{
   const response=await fetch(url,{headers:{'user-agent':'Organic-Synthesis-Gallery-Title-Audit/1.0 (https://gallery.gczhouwld.com)',accept:'application/json'},signal:AbortSignal.timeout(20000)});
   if(!response.ok)return {doi,verified:false,status:'http_'+response.status};
   const packet=await response.json();const m=packet.message||{};
   const title=txt(Array.isArray(m.title)?m.title[0]:m.title);
   const publishedYear=Number((m.published?.['date-parts']||[])[0]?.[0]||0);
   const firstFamily=String(m.author?.[0]?.family||'');
   const candidateFirst=String(row.authors?.[0]||'');
   const container=txt(Array.isArray(m['container-title'])?m['container-title'][0]:m['container-title']);
   const sameDoi=String(m.DOI||'').toLowerCase()===doi;
   const sameJournal=normalize(container)===normalize(row.journal);
   const sameYear=publishedYear===2026;
   const sameFirst=Boolean(firstFamily&&normalize(candidateFirst).includes(normalize(firstFamily)));
   const titleLegible=title.length>=10&&title.length<=650&&!/<[^>]+>/.test(title)
     &&!/cloudflare|access denied|checking your browser|title pending verification/i.test(title);
   return {doi,verified: Boolean(sameDoi&&sameJournal&&sameYear&&sameFirst&&titleLegible),
     title:titleLegible?title:null,journal:container,publishedYear,firstFamily,
     checks:{sameDoi,sameJournal,sameYear,sameFirst,titleLegible},
     source:url,publisherUrl:String(m.URL||''),metadataType:String(m.type||'')};
 }catch(error){return {doi,verified:false,status:String(error?.message||error).slice(0,100)};}
};
await Promise.all(Array.from({length:3},async()=>{
 while(index<input.records.length){
   const k=index++,r=await fetchOne(input.records[k]);results[k]=r;
   console.log('TITLE_EVIDENCE '+JSON.stringify(r));
   await new Promise(resolve=>setTimeout(resolve,450));
 }
}));
const summary={candidates:results.length,verified:results.filter(x=>x.verified).length,
 rejected:results.filter(x=>!x.verified).length,generatedAt:new Date().toISOString(),
 source:'Crossref deposited journal DOI metadata, article year, journal, first-author consistency',
 notPublisherPageVerified:true,doesNotModifyFormalCatalog:true};
const dir='artifacts/historical-title-evidence';mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/2026-jul-sep-crossref-evidence.json',JSON.stringify({summary,records:results},null,2)+'\n');
console.log('TITLE_EVIDENCE_SUMMARY '+JSON.stringify(summary));
