import assert from 'node:assert/strict';
import { rscTocNeedsRevalidation } from '../cloudflare/worker/src/media.js';
import { rscPdfPreviewCapture } from '../cloudflare/worker/src/local-captures.js';

const oldRsc={
  available:1,
  r2_key:'toc-cache/images/legacy.gif',
  reason:'imported',
  updated_at:1791290000000,
  checked_at:1791290000000,
};
const freshRsc={...oldRsc,updated_at:1791301000000,checked_at:1791301000000};
const confirmedFreshPreview={...freshRsc,content_hash:'da1fc0b53216c2a1c1e1311fc39711b0'};
const nonImported={...oldRsc,reason:'verified_official'};
const unavailable={...oldRsc,available:0};

assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',oldRsc),true);
assert.equal(rscTocNeedsRevalidation('10.1039/d6gc03161g',oldRsc),true);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',freshRsc),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',confirmedFreshPreview),true);
assert.equal(rscTocNeedsRevalidation('10.1021/jacs.6c12345',oldRsc),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',nonImported),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',unavailable),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',null),false);

assert.equal(rscPdfPreviewCapture({
  doi:'10.1039/d6sc06421c',
  sourceUrl:'https://pubs.rsc.org/image/article/2026/d6sc06421c/d6sc06421c.pdf.gif'
}),true);
assert.equal(rscPdfPreviewCapture({
  doi:'10.1039/d6sc06421c',
  sourceUrl:'https://pubs.rsc.org/image/article/2026/d6sc06421c/d6sc06421c-toc.gif'
}),false);
assert.equal(rscPdfPreviewCapture({
  doi:'10.1021/jacs.6c12345',
  sourceUrl:'https://pubs.rsc.org/image/article/2026/d6sc06421c/d6sc06421c.pdf.gif'
}),false);

console.log('RSC_MEDIA_REVALIDATION_PASS '+JSON.stringify({
  legacyRscReopens:true,
  freshRscPreserved:true,
  nonRscPreserved:true,
  confirmedPreviewHashStaysQuarantined:true,
  rscPdfPreviewPromotionBlocked:true,
  productionWrites:0
}));
