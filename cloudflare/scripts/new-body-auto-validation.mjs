import {createHash} from 'node:crypto';
import {buildBodyReviewMarker,sourceDois,bodyFigureId,canonicalBodyEvidence} from '../../shared/body-media-evidence.js';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const requireBody = (ok,reason) => {if(!ok)throw new Error(reason);};
const exactUrl = value => {const u=new URL(String(value));requireBody(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash,'noncanonical_source_url');return u;};
export function snapshotRows(index){requireBody(index&&typeof index.items==='object'&&index.items!==null,'incomplete_inventory');const rows=Array.isArray(index.items)?index.items:Object.values(index.items);requireBody(rows.every(r=>r&&typeof r.doi==='string'),'invalid_inventory_row');return rows;}
export function scopedHolds(state,policy){requireBody(state&&state.schemaVersion>=1,'coordination_state_missing');const held=new Set(policy.heldDois||[]);for(const key of ['pendingScopeReviewBacklog','pendingReviewBacklog'])for(const r of state[key]||[])if(r.doi&&!['resolved','include','exclude','closed'].includes(r.status))held.add(r.doi.toLowerCase());return held;}
export async function checkNewBodyIdentity(row,policy,corpus,held,now=Date.now()){
 requireBody(policy.enabled===true&&policy.revision==='new-body-acs-v1'&&policy.mediaGeneration===1790082000000,'auto_policy_disabled_or_unknown');
 requireBody(corpus.has(row.doi)&&!held.has(row.doi),'not_current_or_scope_held');
 requireBody(row.mediaGeneration===policy.mediaGeneration&&row.updatedAt>=policy.mediaGeneration&&row.updatedAt<=now+300000,'not_new_generation');
 requireBody(policy.captureVersions.includes(row.captureVersion)&&row.pageDoi===row.doi&&/^[a-z0-9-]{16,80}$/i.test(row.jobId||''),'task_page_binding_missing');
 requireBody(/^10\.1021\/(?:jacs|acs\.orglett|acs\.joc|acscatal)\.[a-z0-9]+$/.test(row.doi),'publisher_profile_not_enabled');
 const page=exactUrl(row.articleUrl),image=exactUrl(row.sourceUrl);
 requireBody(page.hostname==='pubs.acs.org'&&policy.sourceHosts.includes(image.hostname),'publisher_host_not_enabled');
 for(const url of [row.articleUrl,row.sourceUrl]){const ids=sourceDois(url);requireBody(ids.length===1&&ids[0]===row.doi,'source_doi_conflict');}
 const encoded=row.doi.replace('/','_');
 requireBody(image.pathname.startsWith('/acs/content_public/journal/')&&image.pathname.includes('/pap/'+encoded+'/'),'not_article_scoped_image');
 requireBody(/\/(?:m_|l_)?[a-z]{2}[0-9a-z]+_[0-9]{4}\.(?:png|svg)$/i.test(image.pathname),'not_body_asset_role');
 requireBody(row.id===bodyFigureId(row.id)&&row.id===bodyFigureId(row.label),'figure_label_conflict');
 requireBody(String(row.caption||'').trim().length>=8&&!/^\s*(?:graphical|visual)\s*abstract/i.test(row.caption),'body_caption_missing_or_toc');
 requireBody(policy.contentTypes.includes(row.contentType)&&Number.isInteger(row.width)&&Number.isInteger(row.height)&&row.width>0&&row.height>0&&row.width*row.height<=40000000,'invalid_image_metadata');
 requireBody(Number.isInteger(row.byteLength)&&row.byteLength>=100&&row.byteLength<=policy.maxBytes&&Number.isInteger(row.sortOrder)&&row.sortOrder>=0,'invalid_size_or_order');
 requireBody(/^[a-f0-9]{64}$/.test(row.sha256||'')&&/^[a-f0-9]{32}$/.test(row.contentHash||'')&&row.sha256.startsWith(row.contentHash),'server_digest_missing');
 const ext=row.contentType==='image/png'?'png':'svg';
 requireBody(row.r2Key===`local-captures/article-figures/images/${sha256(Buffer.from(row.doi)).slice(0,24)}/${row.id}-${row.sha256.slice(0,16)}.${ext}`,'stored_object_identity_conflict');
 const marker=await buildBodyReviewMarker(row,row.sha256);
 requireBody(row.reviewMarker?.schemaVersion===1&&row.reviewMarker.revision==='1'&&row.reviewMarker.state==='pending_review'&&Array.isArray(row.reviewMarker.reasons)&&row.reviewMarker.reasons.length===0,'confirmed_new_marker_missing');
 for(const key of ['assetKey','evidenceSha256','sha256','role','byteIntegrity'])requireBody(row.reviewMarker[key]===marker[key],'marker_evidence_mismatch');
 requireBody(marker.state==='pending_review'&&marker.reasons.length===0&&row.reviewMarker.semanticReview==='not_reviewed'&&row.reviewMarker.published===false,'unexpected_marker_authority');
 requireBody(!(policy.revokedAssetKeys||[]).includes(marker.assetKey),'revoked_asset');
 return {ext,marker,evidenceSha256:sha256(Buffer.from(canonicalBodyEvidence(row,row.sha256)))};
}
export function checkRoleReport(row,reports,policy){
 for(const wrapper of reports){
  const report=wrapper.report||wrapper,events=report.trace;
  if(report.doi!==row.doi||report.articleUrl!==row.articleUrl||!Array.isArray(events))continue;
  const contexts=events.filter(e=>e.stage==='diagnostic_context').flatMap(e=>{try{return [JSON.parse(e.message)];}catch{return [];}});
  const context=contexts.find(c=>c.jobId===row.jobId&&c.captureVersion===row.captureVersion&&policy.controllerRevisions.includes(c.controllerRevision)&&Array.isArray(c.pageDois)&&c.pageDois.length===1&&c.pageDois[0]===row.doi);
  if(!context)continue;
  const found=events.find(e=>e.event==='request_start'&&e.url===row.sourceUrl&&e.candidateKind==='article_figure'&&e.candidateSource==='isolated_figure_caption');
  const start=events.find(e=>e.stage==='figure_stage'&&e.event==='start'&&e.url===row.sourceUrl&&e.message==='recovery_direct_stage:'+row.label&&e.byteLength===row.byteLength);
  const finish=events.find(e=>e.stage==='figure_stage'&&e.event==='complete'&&e.status==='ok'&&e.url==='https://organic-synthesis-gallery.zhou526316.workers.dev/media/'+row.r2Key&&e.message===row.label+';stored=1;published=0'&&e.byteLength===row.byteLength);
  if(found&&start&&finish&&Number(start.seq)<Number(finish.seq))return {reportKey:wrapper.key||'',controllerRevision:context.controllerRevision,jobId:context.jobId,sourceRole:'isolated_figure_caption',sourceUrl:row.sourceUrl,storedObject:row.r2Key,label:row.label,byteLength:row.byteLength,reportUpdatedAt:report.updatedAt};
 }
 throw new Error('exact_figure_capture_report_pending');
}
export function conflictKeys(rows,publicMedia){
 const byHash=new Map(),bySource=new Map(),bad=new Set();
 function add(r){const hash=r.sha256||r.verifiedSha256||r.contentHash;for(const [map,value] of [[byHash,hash],[bySource,r.sourceUrl]]){if(!value)continue;const first=map.get(value);if(first&&(first.doi!==r.doi||(map===bySource&&first.id!==r.id))){bad.add(first.doi+'|'+first.id);bad.add(r.doi+'|'+r.id);}else map.set(value,r);}}
 for(const r of rows)add(r);for(const [doi,item] of Object.entries(publicMedia.items||{}))for(const f of item.figures?.figures||[])add({...f,doi});return bad;
}
export function verifyNewBodyBytes(row,bytes){requireBody(bytes.length===row.byteLength&&sha256(bytes)===row.sha256,'stored_bytes_mismatch');if(row.contentType==='image/png'){requireBody(bytes.length>24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'not_png');requireBody(bytes.readUInt32BE(16)===row.width&&bytes.readUInt32BE(20)===row.height,'raster_dimensions_mismatch');requireBody(Math.max(row.width,row.height)>=500&&row.width*row.height>=150000,'insufficient_raster_resolution');}else requireBody(bytes.toString('utf8').includes('<svg'),'not_svg');}
