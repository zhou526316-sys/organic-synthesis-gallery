// Publisher HEAD metadata only: no browser cookies, paywall bypass, PDF, SI,
// body figures or full-text storage. Accept only publisher DOI-verified abstract
// fields; generic page descriptions are never accepted as scientific abstracts.
const DOI=/^10\.\d{4,9}\/\S+$/i;
const ORIGIN=/^(?:www\.)?(?:nature\.com|science\.org|pubs\.acs\.org|onlinelibrary\.wiley\.com|rsc\.org|pubs\.rsc\.org|sciencedirect\.com|cell\.com|ccschemistry\.org)$/i;
function doi(value){
  const v=String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'');
  return DOI.test(v)?v:'';
}
function decodeEntities(value){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value||'').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(original,x)=>{
    const t=x.toLowerCase();
    if(t.startsWith('#')){
      const v=t.startsWith('#x')?parseInt(t.slice(2),16):parseInt(t.slice(1),10);
      return Number.isInteger(v)&&v>=32&&v<=0x10ffff?String.fromCodePoint(v):' ';
    }
    return entities[t]??original;
  });
}
function metaAttributes(tag){
  const obj={};
  const re=/([a-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match;
  while((match=re.exec(tag))!==null){
    obj[match[1].toLowerCase()]=decodeEntities(match[2]??match[3]??match[4]??'').trim();
  }
  return obj;
}
export function publisherMetadataAbstract(html,expectedDoi){
  const target=doi(expectedDoi);
  if(!target||typeof html!=='string')return '';
  // Restrict to <head>, so the article body and unrelated sidebars cannot
  // be accidentally turned into an "abstract".
  const head=html.slice(0,900000).split(/<\/head\s*>/i)[0];
  const tags=[...head.matchAll(/<meta\b[^>]*>/gi)].map(match=>metaAttributes(match[0]));
  const references=tags.filter(meta=>['citation_doi','dc.identifier','prism.doi'].includes(
    String(meta.name||meta.property||'').toLowerCase())).map(meta=>doi(meta.content));
  if(!references.includes(target))return '';
  const priority=['citation_abstract','dc.description'];
  for(const name of priority){
    for(const tag of tags){
      if(String(tag.name||tag.property||'').toLowerCase()!==name)continue;
      const content=String(tag.content||'').replace(/<[^>]*>/g,' ')
        .replace(/\s+/g,' ').trim();
      if(content.length>=140&&content.length<=16000
        &&content.split(/\s+/).length>=25
        &&!/^https?:\/\//i.test(content))return content;
    }
  }
  return '';
}
export async function fetchPublisherMetadataAbstract(inputDoi,{timeout=9000,maxHeadBytes=900000}={}){
  const normalized=doi(inputDoi);
  if(!normalized)throw Error('publisher_abstract_invalid_doi');
  const url='https://doi.org/'+normalized.split('/').map(encodeURIComponent).join('/');
  const response=await fetch(url,{redirect:'follow',headers:{
    accept:'text/html,application/xhtml+xml;q=0.9',
    'user-agent':'OrganicSynthesisGallery-PublisherAbstractMetadata/1.0 (DOI-head-only)'
  },signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw Error('publisher_metadata_http_'+response.status);
  const host=new URL(response.url).hostname;
  if(!ORIGIN.test(host))throw Error('publisher_metadata_unrecognized_host');
  const type=response.headers.get('content-type')||'';
  if(!/text\/html|application\/xhtml\+xml/i.test(type))
    throw Error('publisher_metadata_not_html');
  if(!response.body)return '';
  const reader=response.body.getReader();
  const chunks=[];let length=0;let closed=false;
  try{
    while(length<maxHeadBytes){
      const {value,done}=await reader.read();
      if(done)break;
      chunks.push(value);length+=value.byteLength;
      const tail=new TextDecoder().decode(value);
      if(/<\/head\s*>/i.test(tail)){closed=true;break;}
    }
  }finally{
    await reader.cancel().catch(()=>{});
  }
  if(!closed&&length>=maxHeadBytes)throw Error('publisher_metadata_head_too_large');
  const html=new TextDecoder().decode(Buffer.concat(chunks.map(v=>Buffer.from(v))));
  return publisherMetadataAbstract(html,normalized);
}
