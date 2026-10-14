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
  const expected=buildReviewShard(raw,{
    published,approved,pending,sourceSha256:actualSha256,sourceId:rootId
  });
  verify(reviewerShard&&reviewerShard.rootId===rootId
    &&reviewerShard.sourceSha256===actualSha256
    &&JSON.stringify(reviewerShard)===JSON.stringify(expected),
    'historical_queue_status_refresh_not_deterministic:'+rootId);
  return previousReviewerGitBlobSha;
}
