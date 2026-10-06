import assert from 'node:assert/strict';
import { rscTocNeedsRevalidation } from '../cloudflare/worker/src/media.js';

const oldRsc={
  available:1,
  r2_key:'toc-cache/images/legacy.gif',
  reason:'imported',
  updated_at:1791290000000,
  checked_at:1791290000000,
};
const freshRsc={...oldRsc,updated_at:1791301000000,checked_at:1791301000000};
const nonImported={...oldRsc,reason:'verified_official'};
const unavailable={...oldRsc,available:0};

assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',oldRsc),true);
assert.equal(rscTocNeedsRevalidation('10.1039/d6gc03161g',oldRsc),true);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',freshRsc),false);
assert.equal(rscTocNeedsRevalidation('10.1021/jacs.6c12345',oldRsc),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',nonImported),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',unavailable),false);
assert.equal(rscTocNeedsRevalidation('10.1039/d6sc06421c',null),false);

console.log('RSC_MEDIA_REVALIDATION_PASS '+JSON.stringify({
  legacyRscReopens:true,
  freshRscPreserved:true,
  nonRscPreserved:true,
  productionWrites:0
}));
