// Publisher HEAD metadata only: no browser cookies, paywall bypass, PDF, SI,
// body figures or full-text storage. Accept only publisher DOI-verified abstract
// fields; generic page descriptions are never accepted as scientific abstracts.
const DOI=/^10\.\d{4,9}\/\S+$/i;
// Explicit scholarly publisher and DOI intermediary host allowlist.
// No wildcard subdomains or arbitrary URL destinations.
const ORIGIN=/^(?:www\.)?(?:nature\.com|science\.org|pubs\.acs\.org|onlinelibrary\.wiley\.com|rsc\.org|pubs\.rsc\.org|sciencedirect\.com|cell\.com|ccschemistry\.org|chinesechemsoc\.org|link\.springer\.com|linkinghub\.elsevier\.com|linkinghub\.sdcontent\.elsevier\.com)$/i;
function doi(value){
  const v=String(value||'').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'');
  return DOI.test(v)?v:'';
}
// Crossref/OpenAlex can lack abstracts even when the official abstract-only
// landing page exists. Bypass noncanonical DOI intermediaries for exactly
// identifiable publishers while staying in metadata/abstract-only scope.
export function publisherMetadataEntryUrl(value){
  const id=doi(value);
  if(!id)return '';
  if(id.startsWith('10.31635/ccschem.'))
    return 'https://www.chinesechemsoc.org/doi/abs/'+id;
  if(id.startsWith('10.1038/'))
    return 'https://www.nature.com/articles/'+encodeURIComponent(id.slice(8));
  return 'https://doi.org/'+id.split('/').map(encodeURIComponent).join('/');
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

// Nature's openly displayed Abstract may be absent from <head> metadata.
// Accept only the labelled abstract section, never sections titled Main,
// Methods, Results or an arbitrary paragraph from the article body.
// The exact DOI is checked independently against publisher <head> metadata.
function natureAbstractHeading(html){
  return /<h2\b[^>]*\bid\s*=\s*["']Abs1["'][^>]*>\s*(?:<[^>]*>\s*)*Abstract\s*(?:<\/[^>]*>\s*)*<\/h2>/i.exec(html);
}
export function extractNaturePublicAbstract(html){
  const heading=natureAbstractHeading(html);
  if(!heading)return '';
  const after=html.slice(heading.index+heading[0].length,
    heading.index+heading[0].length+16000);
  const boundary=/<\/section\s*>|<h2\b[^>]*>/i.exec(after);
  if(!boundary)return '';
  const content=after.slice(0,boundary.index);
  const paragraphs=[...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)]
    .map(match=>decodeEntities(match[1].replace(/<[^>]*>/g,' '))
      .replace(/\s+/g,' ').trim()).filter(Boolean);
  const abstract=paragraphs.join(' ').trim();
  if(abstract.length<140||abstract.length>16000||abstract.split(/\s+/).length<25
    ||/(?:verify you are human|access denied|this is a preview of subscription content)/i.test(abstract))
    return '';
  return abstract;
}
// Operational envelope only: no raw publisher text, head content, or headers
// are logged. Diagnoses empty public Nature abstracts without bypassing auth.
export function inspectPublisherAbstractEnvelope(html,expectedDoi){
  const target=doi(expectedDoi),raw=typeof html==='string'?html:'';
  const prefix=raw.slice(0,900000),start=/<head(?:\s[^>]*)?>/i.exec(prefix);
  if(!target||!start)return {validHead:false,doiMetadataMatches:false,
    hasAbstractHeading:false,hasAbs1Heading:false,hasSectionBoundary:false,bodyLength:raw.length};
  const remainder=prefix.slice(start.index+start[0].length);
  const end=/<\/head\s*>|<body\b/i.exec(remainder);
  const head=end?remainder.slice(0,end.index):'';
  const tags=[...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>metaAttributes(m[0]));
  const references=tags.filter(tag=>['citation_doi','dc.identifier','prism.doi']
    .includes(String(tag.name||tag.property||'').toLowerCase()))
    .map(tag=>doi(tag.content));
  const heading=natureAbstractHeading(prefix);
  const after=heading?prefix.slice(heading.index+heading[0].length):'';
  return {
    validHead:Boolean(end),
    doiMetadataMatches:references.includes(target),
    matchedReferenceCount:references.filter(value=>value===target).length,
    hasAbstractHeading:/<h[1-6]\b[^>]*>\s*(?:<[^>]*>\s*)*Abstract\s*(?:<\/[^>]*>\s*)*<\/h[1-6]>/i.test(prefix),
    hasAbs1Heading:Boolean(heading),
    hasSectionBoundary:Boolean(heading&&/<\/section\s*>|<h2\b[^>]*>/i.test(after)),
    paragraphTagCountInFirstSection:heading
      ? (after.split(/<\/section\s*>|<h2\b[^>]*>/i,1)[0].match(/<p\b/gi)||[]).length:0,
    bodyLength:raw.length,
    challengeMarker:Boolean(/(?:verify you are human|access denied|checking your browser|captcha)/i.test(prefix))
  };
}
export function publisherMetadataAbstract(html,expectedDoi){
  const target=doi(expectedDoi);
  if(!target||typeof html!=='string')return '';
  // Restrict to <head>, so the article body and unrelated sidebars cannot
  // be accidentally turned into an "abstract".
  const prefix=html.slice(0,900000);
  const start=/<head(?:\s[^>]*)?>/i.exec(prefix);
  if(!start)return '';
  const remainder=prefix.slice(start.index+start[0].length);
  const end=/<\/head\s*>|<body\b/i.exec(remainder);
  if(!end)return '';
  const head=remainder.slice(0,end.index);
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
  // Preserve access controls: this fallback uses only Nature's explicitly
  // labelled *public* Abstract, not the article's Main/Methods or PDF.
  if(target.startsWith('10.1038/'))return extractNaturePublicAbstract(prefix);
  return '';
}
export async function fetchPublisherMetadataAbstract(inputDoi,{
  timeout=9000,maxHeadBytes=900000,fetchImpl=fetch,onDiagnostic=null
}={}){
  const normalized=doi(inputDoi);
  if(!normalized)throw Error('publisher_abstract_invalid_doi');
  const headers={
    accept:'text/html,application/xhtml+xml;q=0.9',
    'user-agent':'OrganicSynthesisGallery-PublisherAbstractMetadata/1.0 (DOI-head-only)'
  };
  let address=publisherMetadataEntryUrl(normalized);
  const signal=AbortSignal.timeout(timeout);
  for(let hop=0;hop<6;hop++){
    const current=new URL(address);
    const publisher=ORIGIN.test(current.hostname);
    const resolver=current.hostname==='doi.org'||current.hostname==='dx.doi.org';
    // Do not follow DOI-mediated redirects into arbitrary hosts/networks;
    // private/local IP and authenticated bypass routes are never fetched.
    if(current.protocol!=='https:'||current.port||current.username||current.password
      ||(!resolver&&!publisher))throw Error('publisher_metadata_redirect_host_unrecognized:'+current.hostname.slice(0,120));
    const response=await fetchImpl(address,{redirect:'manual',headers,signal});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location)throw Error('publisher_metadata_redirect_location_missing');
      address=new URL(location,address).href;
      await response.body?.cancel().catch(()=>{});
      continue;
    }
    if(!response.ok)throw Error('publisher_metadata_http_'+response.status);
    if(!publisher)throw Error('publisher_metadata_resolution_unfinished');
    const type=response.headers.get('content-type')||'';
    if(!/text\/html|application\/xhtml\+xml/i.test(type))
      throw Error('publisher_metadata_not_html');
    if(!response.body)return '';
    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let html='',bytes=0,closed=false;
    const nature=normalized.startsWith('10.1038/');
    try{
      while(bytes<maxHeadBytes){
        const {value,done}=await reader.read();
        if(done)break;
        bytes+=value.byteLength;
        if(bytes>maxHeadBytes)throw Error('publisher_metadata_head_too_large');
        html+=decoder.decode(value,{stream:true});
        // For standard sources retain head-only acquisition. Nature may
        // expose the public Abstract only as an explicitly labelled section.
        // Stop as soon as the Abstract section closes; no full-body traversal.
        const headDone=/<\/head\s*>|<body\b/i.test(html);
        if(!nature&&headDone){closed=true;break;}
        if(nature&&headDone){
          if(publisherMetadataAbstract(html,normalized)){closed=true;break;}
          const heading=natureAbstractHeading(html);
          if(heading){
            const after=html.slice(heading.index+heading[0].length);
            if(/<\/section\s*>|<h2\b[^>]*>/i.test(after)){
              closed=true;break;
            }
          }
        }
      }
    }finally{
      await reader.cancel().catch(()=>{});
    }
    if(!closed&&bytes>=maxHeadBytes)throw Error('publisher_metadata_head_too_large');
    const parsed=publisherMetadataAbstract(html,normalized);
    if(!parsed&&nature&&typeof onDiagnostic==='function')
      onDiagnostic({finalHost:current.hostname,status:response.status,
        ...inspectPublisherAbstractEnvelope(html,normalized)});
    return parsed;
  }
  throw Error('publisher_metadata_redirect_limit');
}
