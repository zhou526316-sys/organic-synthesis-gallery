// Independent scholarly abstract-only metadata. No PDF, figures or body
// retrieval. Every accepted abstract must match the requested DOI exactly.
export const normalizeMetadataDoi=value=>{
  const doi=String(value||'').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'');
  return /^10\.\d{4,9}\/\S+$/.test(doi)?doi:'';
};
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function cleanScholarlyAbstract(value){
  if(typeof value!=='string')return '';
  const cleaned=value.replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (original,code)=>{
      const item=code.toLowerCase();
      if(item.startsWith('#')){
        const cp=item.startsWith('#x')?parseInt(item.slice(2),16):parseInt(item.slice(1),10);
        return Number.isInteger(cp)&&cp>=32&&cp<=0x10ffff?String.fromCodePoint(cp):' ';
      }
      return entities[item]??original;
    }).replace(/\s+/g,' ').trim();
  return cleaned.length>=100&&cleaned.length<=16000
    &&!/(?:please enable javascript|verify you are human|access denied|login required)/i.test(cleaned)
    ? cleaned : '';
}
export function matchSemanticScholarAbstracts(requested,records){
  const allowed=new Set(requested.map(normalizeMetadataDoi).filter(Boolean)),out=new Map();
  for(const row of Array.isArray(records)?records:[]){
    const doi=normalizeMetadataDoi(row?.externalIds?.DOI);
    if(!doi||!allowed.has(doi))continue;
    const abstract=cleanScholarlyAbstract(row?.abstract);
    if(abstract&&!out.has(doi))out.set(doi,abstract);
  }
  return out;
}
export function matchEuropePmcAbstracts(requested,payload){
  const allowed=new Set(requested.map(normalizeMetadataDoi).filter(Boolean)),out=new Map();
  for(const row of payload?.resultList?.result||[]){
    const doi=normalizeMetadataDoi(row?.doi);
    if(!doi||!allowed.has(doi))continue;
    const abstract=cleanScholarlyAbstract(row?.abstractText);
    if(abstract&&!out.has(doi))out.set(doi,abstract);
  }
  return out;
}
export function boundedMetadataWindow(dois,max,epochDay,outerWindows=1){
  const width=Math.max(1,Math.min(100,Math.floor(Number(max)||50)));
  const windows=Math.ceil(dois.length/width);
  const index=windows?Math.floor(Math.floor(epochDay)/Math.max(1,Math.floor(outerWindows)))%windows:0;
  return {number:index+1,windows,selected:dois.slice(index*width,(index+1)*width)};
}
