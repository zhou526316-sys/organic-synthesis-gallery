import {createHash} from 'node:crypto';
import {buildBodyReviewMarker,canonicalBodyEvidence,BODY_MEDIA_GENERATION} from '../../shared/body-media-evidence.js';
import {verifyBodyFile} from './merge-reviewed-body.mjs';
export const POLICY_ID='new-body-auto-20260923-v1';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function requireBody(ok,code){if(!ok)throw new Error(code);}
export function exactKey(row){return `${row.doi}|${row.id}|${row.sha256}`;}
export function evidenceKey(row){return sha256(canonicalBodyEvidence(row,row.sha256));}
export function publicationItem(row){
  return {...row,role:'article_figure',originalUpdatedAt:row.updatedAt,originalR2Key:row.r2Key,order:row.sortOrder};
}
function url(value){
  const u=new URL(value);
  requireBody(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search,'auto_url_must_be_plain_https');
  return u;
}
export async function validateNewBodyMetadata(row,policy,now=Date.now()){
  requireBody(policy.policyId===POLICY_ID&&policy.mediaGeneration===BODY_MEDIA_GENERATION,'auto_policy_version');
  requireBody(row?.mediaGeneration===BODY_MEDIA_GENERATION&&row.captureVersion==='6.2.20','auto_not_current_generation');
  requireBody(Number.isSafeInteger(row.updatedAt)&&row.updatedAt>=BODY_MEDIA_GENERATION&&row.updatedAt<=now+300000,'auto_capture_time');
  requireBody(row.reviewMarker?.schemaVersion===1&&row.reviewMarker.revision==='1'&&row.sha256,'auto_server_marker_missing');
  const expected=await buildBodyReviewMarker(row,row.sha256);
  requireBody(expected.state==='pending_review'&&expected.reasons.length===0,'auto_provenance_incomplete');
  for(const field of ['assetKey','evidenceSha256','sha256','role','state','byteIntegrity','semanticReview']){
    requireBody(row.reviewMarker[field]===expected[field],'auto_marker_changed:'+field);
  }
  requireBody(Array.isArray(row.reviewMarker.reasons)&&row.reviewMarker.reasons.length===0&&row.reviewMarker.published===false,'auto_marker_state');
  requireBody(/^10\.1021\/(?:jacs|acscatal|acs\.orglett|acs\.joc)\.[a-z0-9]+$/.test(row.doi),'auto_publisher_not_enabled');
  const page=url(row.articleUrl),source=url(row.sourceUrl);
  requireBody(page.hostname==='pubs.acs.org'&&/\/article\/doi\/10\.1021\//i.test(page.pathname),'auto_not_full_article_page');
  requireBody(source.hostname==='acs.silverchair-cdn.com','auto_source_host_not_enabled');
  requireBody(/\/(?:m_)?(?:ja|ol|cs|jo)\d{2}c\d{5}_\d{4}\.(?:svg|png|webp)$/i.test(source.pathname),'auto_not_numbered_body_asset');
  requireBody(!/graphical\s*abstract|visual\s*abstract|table\s+of\s+contents/i.test(String(row.caption)),'auto_toc_role_conflict');
  requireBody(String(row.caption||'').trim().length>=10,'auto_caption_incomplete');
  requireBody(Number.isInteger(row.sortOrder)&&row.sortOrder>=0&&row.sortOrder<200,'auto_order_invalid');
  requireBody(/^[a-f0-9]{64}$/.test(row.sha256)&&/^[a-f0-9]{32}$/.test(row.contentHash)&&row.sha256.startsWith(row.contentHash),'auto_hash_metadata');
  const ext=({'image/svg+xml':'svg','image/png':'png','image/webp':'webp'})[row.contentType];
  requireBody(ext,'auto_type_not_enabled');
  const path=`local-captures/article-figures/images/${sha256(row.doi).slice(0,24)}/${row.id}-${row.sha256.slice(0,16)}.${ext}`;
  requireBody(row.r2Key===path,'auto_object_identity');
  return {ext,evidenceSha256:expected.evidenceSha256,assetKey:expected.assetKey};
}
export function validateNewBodyBytes(row,bytes){
  const ext=verifyBodyFile(publicationItem(row),bytes);
  if(ext!=='svg')requireBody(Math.max(row.width,row.height)>=520&&row.width*row.height>=100000,'auto_raster_below_display_quality');
  return ext;
}
export function conflictKeys(rows){
  const owners=new Map(),identities=new Map(),sources=new Map(),conflicts=new Set();
  for(const row of rows){
    const key=row.doi+'|'+row.id;
    for(const [map,value,owner] of [[owners,String(row.sha256||row.contentHash||'').slice(0,32),key],[identities,key,(row.sha256||row.contentHash)],[sources,row.sourceUrl,key]]){
      if(!value)continue;
      const prev=map.get(value);
      if(prev&&prev.owner!==owner){conflicts.add(prev.key);conflicts.add(key);}
      else if(!prev)map.set(value,{owner,key});
    }
  }
  return conflicts;
}
export async function createImageDecoder(){
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>r.abort());
  const page=await context.newPage();
  return {
    async decode(row,bytes){
      const result=await page.evaluate(async({data,type})=>{
        if(type==='image/svg+xml'){
          const raw=new TextDecoder().decode(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));const xml=new DOMParser().parseFromString(raw,'image/svg+xml');
          if(xml.querySelector('parsererror')||xml.documentElement.localName!=='svg')throw new Error('auto_svg_parse_error');
          if(xml.getElementsByTagName('*').length>100000)throw new Error('auto_svg_too_complex');
        }
        const image=new Image();image.src='data:'+type+';base64,'+data;
        await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('auto_image_decode_timeout')),6000))]);
        if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>64000000)throw new Error('auto_image_dimensions_invalid');
        return {width:image.naturalWidth,height:image.naturalHeight};
      },{data:bytes.toString('base64'),type:row.contentType});
      if(row.contentType!=='image/svg+xml')requireBody(result.width===row.width&&result.height===row.height,'auto_decoded_dimensions_mismatch');
      return result;
    },
    async close(){await browser.close();}
  };
}
