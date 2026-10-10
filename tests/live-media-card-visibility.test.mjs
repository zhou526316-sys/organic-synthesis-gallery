import assert from 'node:assert/strict';
import {test} from 'node:test';
import {liveCardArticleByDoi,liveCardMediaMode,liveCardModeForDoi}
  from '../shared/live-media-card-visibility.mjs';

const ordinarySep={doi:'10.1021/acs.joc.6c01206',date:'2026-09-24',
  addedDate:'2026-09-25',mediaPolicy:'toc_only'};
const lateSep={doi:'10.1021/acs.joc.6c01824',date:'2026-09-30',
  addedDate:'2026-10-01',mediaPolicy:'toc_only'};
const newOct={doi:'10.1016/j.chempr.2026.103043',date:'2026-10-08',
  addedDate:'2026-10-09',mediaPolicy:'standard'};
const archive={doi:'10.1000/1800paper',date:'1952-01-15',
  addedDate:'2026-10-10',mediaPolicy:'metadata_only',ingestionChannel:'historical_backfill'};
const queue={webpageDoiCount:4,articles:[ordinarySep,lateSep,newOct,archive]};
test('existing September media remains visible, late September is TOC-only and pre-July archive is metadata-only',()=>{
 const map=liveCardArticleByDoi(queue);
 assert.equal(liveCardModeForDoi(map,ordinarySep.doi),'standard');
 assert.equal(liveCardModeForDoi(map,lateSep.doi),'toc_only');
 assert.equal(liveCardModeForDoi(map,newOct.doi),'standard');
 assert.equal(liveCardModeForDoi(map,archive.doi),'metadata_only');
});
test('public queue DOI and media policy mismatch fails closed',()=>{
 assert.throws(()=>liveCardArticleByDoi({...queue,webpageDoiCount:5}),/incomplete/);
 assert.throws(()=>liveCardArticleByDoi({...queue,articles:[...queue.articles,lateSep],webpageDoiCount:5}),/duplicate/);
 assert.throws(()=>liveCardMediaMode({...newOct,mediaPolicy:'metadata_only'}),/policy_conflict/);
 assert.throws(()=>liveCardModeForDoi(new Map(),'10.1021/jacs.6c99999'),/doi_not_in/);
});
test('media verification sources preserve read-only byte receipts for all published files',async()=>{
 const {readFile}=await import('node:fs/promises');
 const auto=await readFile('scripts/verify-new-body-auto-live.mjs','utf8');
 const reviewed=await readFile('scripts/verify-reviewed-body-live.mjs','utf8');
 const older=await readFile('.github/workflows/new-body31-live.yml','utf8');
 for(const text of [auto,reviewed,older]) {
   assert.match(text,/liveCardModeForDoi/);
   assert.match(text,/media\-mirror|sha256|hash\(bytes/);
   assert.doesNotMatch(text,/page\.locator\('#search'\)\.press\('Escape'\)/);
 }
});
