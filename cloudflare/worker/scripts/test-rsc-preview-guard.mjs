import assert from 'node:assert/strict';
import { isRejectedRscPreviewCapture } from '../src/local-captures.js';

const doi='10.1039/d6sc06421c';

assert.equal(isRejectedRscPreviewCapture({
  doi,
  kind:'official',
  sourceUrl:'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/jam/10.1039_d6sc06421c/1/d6sc06421c.pdf.gif?Expires=123',
  caption:'First page of article · Article PDF first page preview · firstPagePreviewImage'
},doi),true);

assert.equal(isRejectedRscPreviewCapture({
  doi,
  kind:'official',
  sourceUrl:'https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/jam/10.1039_d6sc06421c/1/d6sc06421c-ga.png',
  caption:'Graphical abstract'
},doi),false);

assert.equal(isRejectedRscPreviewCapture({
  doi:'10.1021/jacs.6c10000',
  kind:'official',
  sourceUrl:'https://example.test/jacs.6c10000.pdf.gif',
  caption:'first page preview'
},'10.1021/jacs.6c10000'),false);

console.log('RSC_PREVIEW_GUARD_PASS');
