/**
 * Proof for an ephemeral review-queue file after a new approved historical DOI.
 *
 * A review-queue shard embeds current status and status counters, so its
 * whole-file Git blob necessarily changes when a valid DOI becomes approved.
 * Historical academic decisions must still be anchored to the unchanged raw
 * Crossref/OpenAlex source batch, original DOI fields and the exact freshly
 * regenerated queue. Never accept an arbitrary alternate reviewer Git SHA.
 */
import {createHash} from 'node:crypto';
import {buildReviewShard} from './historical-review-triage.mjs';

const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
const verify=(ok,message)=>{if(!ok)throw Error(message);};
const gitBlobSha=(bytes)=>createHash('sha1').update('blob '+bytes.length)
  .update(Buffer.from([0])).update(bytes).digest('hex');

export function verifyHistoricalReviewerStatusRefresh({
  rawBatchText,reviewerShard,rootId,expectedRawSha256,expectedRawGitBlobSha,
  previousReviewerGitBlobSha,published,approved,pending
}={}){
  verify(typeof rawBatchText==='string'&&rawBatchText.length>0
    &&typeof rootId==='string'&&/^\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d_[a-z][a-z-]+$/.test(rootId)
    &&sha64.test(expectedRawSha256||'')
    &&sha40.test(expectedRawGitBlobSha||'')
    &&sha40.test(previousReviewerGitBlobSha||'')
    &&published instanceof Set&&approved instanceof Set&&pending instanceof Set,
    'historical_queue_status_refresh_untrusted_authority');
  const bytes=Buffer.from(rawBatchText,'utf8');
  const actualSha256=createHash('sha256').update(bytes).digest('hex');
  verify(actualSha256===expectedRawSha256
    &&gitBlobSha(bytes)===expectedRawGitBlobSha,
    'historical_queue_status_refresh_raw_source_changed:'+rootId);
  let raw;
  try{raw=JSON.parse(rawBatchText)}catch{
    throw Error('historical_queue_status_refresh_invalid_source_json:'+rootId);
  }
  // The 08:00 writer can legitimately publish an already-approved DOI
  // after this staging reviewer shard was generated. A separate historical
  // approval can also arrive before the next reviewer-shard refresh.
  // Reconstruct the *persisted* old shard from the same immutable raw batch,
  // allowing only the specifically proven transitions
  // unreviewed -> approved -> formally published. Do not ignore status, stats,
  // DOI identity, title, source hash or any other record fields.
  const authoritative=buildReviewShard(raw,{
    published,approved,pending,sourceSha256:actualSha256,sourceId:rootId
  });
  verify(reviewerShard&&reviewerShard.rootId===rootId
    &&reviewerShard.sourceSha256===actualSha256
    &&Array.isArray(reviewerShard.records)
    &&reviewerShard.records.length===authoritative.records.length,
    'historical_queue_status_refresh_not_deterministic:'+rootId);
  const byDoi=new Map(authoritative.records.map(r=>[r.doi,r]));
  const replayPublished=new Set(published),replayApproved=new Set(approved);
  for(const old of reviewerShard.records){
    const now=byDoi.get(old.doi);
    verify(now,'historical_queue_status_refresh_doi_identity_changed:'+rootId);
    if(old.status===now.status)continue;
    const publishedAfterApproval=
      now.status==='already_published'&&
      old.status==='two_pass_approved_awaiting_08'&&
      published.has(old.doi)&&approved.has(old.doi);
    const approvedAfterReview=
      now.status==='two_pass_approved_awaiting_08'&&
      old.status==='requires_two_pass_review'&&
      approved.has(old.doi)&&!published.has(old.doi);
    const publishedAfterBoth=
      now.status==='already_published'&&
      old.status==='requires_two_pass_review'&&
      published.has(old.doi)&&approved.has(old.doi);
    verify(publishedAfterApproval||approvedAfterReview||publishedAfterBoth,
      'historical_queue_status_refresh_unauthorized_transition:'+rootId+':'+old.doi);
    if(publishedAfterApproval||publishedAfterBoth)replayPublished.delete(old.doi);
    if(approvedAfterReview||publishedAfterBoth)replayApproved.delete(old.doi);
  }
  const historical=buildReviewShard(raw,{
    published:replayPublished,approved:replayApproved,pending,
    sourceSha256:actualSha256,sourceId:rootId
  });
  verify(JSON.stringify(reviewerShard)===JSON.stringify(historical),
    'historical_queue_status_refresh_not_deterministic:'+rootId);
  return previousReviewerGitBlobSha;
}
