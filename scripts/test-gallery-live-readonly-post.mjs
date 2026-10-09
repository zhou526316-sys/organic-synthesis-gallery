import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { safeLiveVerificationRequest as safe } from './gallery-live-readonly-post.mjs';

test('public GET, HEAD and OPTIONS remain usable',()=>{
  for(const verb of ['GET','HEAD','OPTIONS'])assert.equal(
    safe(verb,'https://gallery.gczhouwld.com/media-index.json'),true);
});
test('archived D1 catalogue query is allowed on existing verified Worker and canonical API',()=>{
  for(const domain of ['https://organic-synthesis-gallery.zhou526316.workers.dev',
                       'https://api.gczhouwld.com'])
    assert.equal(safe('POST',domain+'/api/literature/catalog-view'),true);
});
test('bounded media-batch and read-only inventory are allowed',()=>{
  for(const route of ['/api/media/batch','/api/media/inventory'])
    assert.equal(safe('POST','https://api.gczhouwld.com'+route),true);
});
test('write, auth, publication and unknown routes remain forbidden',()=>{
  const urls=[
    'https://gallery.gczhouwld.com/api/literature/catalog-view',
    'https://api.gczhouwld.com/api/admin/literature-catalog-index/begin',
    'https://api.gczhouwld.com/api/media/article-figure/import',
    'https://api.gczhouwld.com/api/media/local-capture/import',
    'https://api.gczhouwld.com/api/user-ui/signin',
    'https://api.gczhouwld.com/api/private-pdf/download',
    'https://evil.example/api/literature/catalog-view',
    'https://api.gczhouwld.com/api/literature/catalog-view?mode=write',
    'http://api.gczhouwld.com/api/media/batch',
    'https://api.gczhouwld.com@evil.example/api/media/batch',
  ];
  for(const url of urls)assert.equal(safe('POST',url),false,url);
  assert.equal(safe('PUT','https://api.gczhouwld.com/api/literature/catalog-view'),false);
  assert.equal(safe('PATCH','https://api.gczhouwld.com/api/media/batch'),false);
  assert.equal(safe('DELETE','https://api.gczhouwld.com/api/media/inventory'),false);
});

test('live browser verification retains the requested DOI in native search input',()=>{
  const code=readFileSync(new URL('./verify-new-body-auto-live.mjs',import.meta.url),'utf8');
  assert.match(code,/page\.locator\('#search'\)\.fill\(doi\)/);
  assert.match(code,/dataset\.catalogRead==='architecture-v1'/);
  assert.doesNotMatch(code,/\.press\(['"]Escape['"]\)/,
    'Escape on type=search clears the DOI and falls back to the Hot list');
});
