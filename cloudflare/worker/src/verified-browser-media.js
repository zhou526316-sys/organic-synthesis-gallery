// Only the authenticated, DOI-bound browser intake calls this module.
// Old quarantined indexes are never made fresh, and R2 objects are never overwritten/deleted.
export const CAPTURE_VERSION = '6.2.20';
export const CAPTURE_EPOCH = 1790082000000;
export async function fullDigest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function inspectBrowserImage(bytes, type) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > 4000000) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width=0,height=0,quality='raster';
  if (type==='image/svg+xml') {
    const text=new TextDecoder().decode(bytes);
    if (!/<svg[\s>]/i.test(text) || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|animate|set)\b|\son[a-z]+\s*=/i.test(text)) return null;
    for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
      if (!m[2].startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(m[2])) return null;
    }
    if (/@import|url\(\s*["']?\s*(?:https?:|\/\/|data:)|javascript:/i.test(text)) return null;
    const svg=text.match(/<svg\b[^>]*>/i)?.[0]||'';
    const view=svg.match(/\bviewBox\s*=\s*["']\s*([-+\d.e]+)[,\s]+([-+\d.e]+)[,\s]+([-+\d.e]+)[,\s]+([-+\d.e]+)/i);
    width=Number(svg.match(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i)?.[1])||Number(view?.[3]);
    height=Number(svg.match(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i)?.[1])||Number(view?.[4]);
    const vectors=/<(?:path|polygon|polyline|line|text)\b/i.test(text);
    if (!vectors) return null; // Raster-only wrappers require explicit conversion, not a vector exemption.
    quality=/<image\b/i.test(text)?'mixed_vector_raster':'vector';
  } else if (type==='image/png' && [137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)) {
    width=v.getUint32(16);height=v.getUint32(20);
  } else if (type==='image/gif' && /^GIF8[79]a$/.test(new TextDecoder().decode(bytes.slice(0,6)))) {
    width=v.getUint16(6,true);height=v.getUint16(8,true);
  } else if (type==='image/webp' && new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP') {
    const format=new TextDecoder().decode(bytes.slice(12,16));
    if (format==='VP8X') {width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
    else if (format==='VP8L' && bytes[20]===47) {width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10);}
    else if (format==='VP8 ' && bytes[23]===157 && bytes[24]===1 && bytes[25]===42) {width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
  } else if (type==='image/jpeg' && bytes[0]===255 && bytes[1]===216) {
    let p=2;
    while(p+9<bytes.length) {
      if(bytes[p]!==255){p++;continue;}
      const marker=bytes[p+1];
      if(marker===216||marker===217||marker===1||(marker>=208&&marker<=215)){p+=2;continue;}
      const len=v.getUint16(p+2);if(len<2||p+2+len>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=v.getUint16(p+5);width=v.getUint16(p+7);break;}
      p+=2+len;
    }
  }
  if (!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>50000||height>50000||width*height>160000000) return null;
  return {width:Math.round(width),height:Math.round(height),quality};
}
function proofValid(item) {
  if(item.captureVersion!==CAPTURE_VERSION || item.pageDoi!==item.doi || item.mediaGeneration!==CAPTURE_EPOCH || !/^[a-z0-9-]{16,80}$/i.test(item.jobId||'') || !/^[a-f0-9]{64}$/.test(item.sha256||'')) return false;
  if(!/^local-captures\/(?:images|article-figures\/images)\//.test(item.r2Key||''))return false;
  for(const value of [item.articleUrl,item.sourceUrl]) {
    let url;try{url=new URL(value);}catch{return false;}if(url.protocol!=='https:')return false;
    let s=url.origin+url.pathname;
    for(let i=0;i<3;i++){try{const d=decodeURIComponent(s);if(d===s)break;s=d;}catch{break;}}
    const ids=[...s.matchAll(/10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig)].map(m=>'10.'+m[1]+'/'+m[2].toLowerCase());
    const n=s.match(/https:\/\/(?:www\.)?nature\.com\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);if(n)ids.push('10.1038/'+n[1].toLowerCase());
    if(ids.some(d=>d!==item.doi))return false;
  }
  return true;
}
export async function publishVerifiedBrowserMedia(env,item,bytes=null) {
  if(!env?.DB||!env?.MEDIA)return {apiAvailable:false,publicationState:'pending_database'};
  if(!proofValid(item))return {apiAvailable:false,publicationState:'unverified_legacy_capture'};
  try {
    if(!bytes){const o=await env.MEDIA.get(item.r2Key);if(!o)throw new Error('capture_object_missing');bytes=new Uint8Array(await o.arrayBuffer());}
    if(await fullDigest(bytes)!==item.sha256)throw new Error('capture_object_digest_mismatch');
    const dimensions=inspectBrowserImage(bytes,item.contentType);if(!dimensions)throw new Error('capture_image_invalid');
    const hash=item.sha256.slice(0,32),now=Date.now();
    if(item.kind==='official') {
      await env.DB.prepare(`INSERT INTO toc_assets (doi,article_url,r2_key,content_hash,reason,available,checked_at,updated_at)
        VALUES (?,?,?,?,'verified_browser_official_toc',1,?,?)
        ON CONFLICT(doi) DO UPDATE SET article_url=excluded.article_url,r2_key=excluded.r2_key,content_hash=excluded.content_hash,reason=excluded.reason,available=1,checked_at=excluded.checked_at,updated_at=excluded.updated_at`)
        .bind(item.doi,item.articleUrl,item.r2Key,hash,now,now).run();
      const row=await env.DB.prepare('SELECT r2_key,content_hash,available FROM toc_assets WHERE doi=? LIMIT 1').bind(item.doi).first();
      const ok=row?.r2_key===item.r2Key&&row.content_hash===hash&&Number(row.available)===1;
      return {apiAvailable:ok,imported:ok,publicationState:ok?'api_available':'pending_database_receipt'};
    }
    const id=item.kind==='figure1'?'figure-1':String(item.id||'');
    const label=item.kind==='figure1'?'Figure 1':String(item.label||'');
    if(!/^(figure|scheme|chart)-\d+[a-z]?$/.test(id) || label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')!==id)throw new Error('capture_figure_identity_invalid');
    await env.DB.prepare(`INSERT INTO figure_assets (doi,semantic_key,source_id,label,caption,article_url,r2_key,content_hash,width,height,sort_order,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(doi,semantic_key) DO UPDATE SET source_id=excluded.source_id,label=excluded.label,caption=excluded.caption,article_url=excluded.article_url,r2_key=excluded.r2_key,content_hash=excluded.content_hash,width=excluded.width,height=excluded.height,sort_order=excluded.sort_order,updated_at=excluded.updated_at
      WHERE figure_assets.updated_at < 1790082000000 OR figure_assets.content_hash=excluded.content_hash
       OR (excluded.r2_key LIKE '%.svg' AND figure_assets.r2_key NOT LIKE '%.svg')
       OR ((figure_assets.r2_key NOT LIKE '%.svg' OR excluded.r2_key LIKE '%.svg') AND COALESCE(excluded.width,0)*COALESCE(excluded.height,0)>=COALESCE(figure_assets.width,0)*COALESCE(figure_assets.height,0))`)
      .bind(item.doi,id,id,label,String(item.caption||'').slice(0,600),item.articleUrl,item.r2Key,hash,dimensions.width,dimensions.height,Number(item.sortOrder||0),now).run();
    const row=await env.DB.prepare('SELECT r2_key,content_hash,updated_at FROM figure_assets WHERE doi=? AND semantic_key=? LIMIT 1').bind(item.doi,id).first();
    const exact=row?.r2_key===item.r2Key&&row.content_hash===hash&&Number(row.updated_at)>=CAPTURE_EPOCH;
    return {apiAvailable:exact,imported:exact,publicationState:exact?'api_available':'preserved_existing_quality',sourceSha256:item.sha256};
  } catch(error) {
    return {apiAvailable:false,imported:false,publicationState:'pending_verified_promotion',publicationError:String(error?.message||error).replace(/[A-Za-z0-9+/_=-]{40,}/g,'[redacted]').slice(0,160)};
  }
}
