/**
 * Exceptional repair of ONE post-publication author-overlay write.
 * This test does NOT grant an additional release or admit papers.
 * Target-journal CI otherwise forbids all protected literature changes.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const baseline=String(process.argv[2]||'').trim();
assert.match(baseline,/^[0-9a-f]{40}$/,'require Git merge-base SHA');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const file='public/rolling-supplement.json';
const markerFile='audit/publication-release-state.json';
const releaseCommit='aed08cccbe4b0135e7677e2c9d862afe70a2dd05';
const protectedSha='f0e4b18a3be71e52fb07e84e291f51f652cd03ae';
const unauthorizedSha='28f3238f45b380855f68fc7ab79da03ba4c9f181';
const doi='10.1038/s41586-026-11242-8';
const preservedAuthors=[
  'Hayato Fujimoto','Masayuki Mizutani','Kazuya Imachi',
  'Teruki Nishioka','Reona Ikeda','Mamoru Tobisu'
];
const beforeSha=git('rev-parse',baseline+':'+file);
const currentSha=git('hash-object','--',file);
assert.equal(beforeSha,unauthorizedSha,'not the specifically identified post-release author-overlay drift');
assert.equal(currentSha,protectedSha,'restore must produce the EXACT authenticated 08:00 release blob');
assert.equal(git('rev-parse',releaseCommit+':'+file),protectedSha,'source does not match original authorized release');
assert.equal(git('rev-parse',baseline+':'+markerFile),git('rev-parse','HEAD:'+markerFile),
  'release marker changed during a display-layer repair');
const marker=JSON.parse(readFileSync(markerFile,'utf8'));
assert.equal(marker.mode,'slot-release');
assert.equal(marker.publicationSlot,'2026-10-15T08:00:00+08:00');
assert.equal(marker.productionCards,1151);
assert.equal(marker.protectedBlobs[file],protectedSha);
const old=JSON.parse(git('show',baseline+':'+file));
const now=JSON.parse(readFileSync(file,'utf8'));
assert(Array.isArray(old.papers)&&Array.isArray(now.papers),'rolling paper array missing');
assert.equal(old.papers.length,now.papers.length);
let changes=0;
for(let i=0;i<old.papers.length;i++){
  const a=old.papers[i],b=now.papers[i];
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  changes++;
  assert.equal(a.doi,doi,'unapproved original paper modification');
  assert.equal(b.doi,doi,'unapproved restored paper modification');
  assert.deepEqual(a.authors,preservedAuthors,'unexpected original author records');
  assert.deepEqual(b.authors,[],'authorized frozen card must retain source blank authors');
  assert.deepEqual({...a,authors:[]},b,'only six authors may be rolled back');
}
assert.equal(changes,1,'exactly one author-only repair');
const oldDois=old.papers.map(x=>x.doi),newDois=now.papers.map(x=>x.doi);
assert.deepEqual(oldDois,newDois,'DOI identities and order must be unchanged');
for(const [path,sha] of Object.entries(marker.protectedBlobs)){
  assert.equal(git('hash-object','--',path),sha,'some other protected source does not match release:'+path);
}
console.log(JSON.stringify({ok:true,oneTimeOnly:true,reason:'restore exact Oct 15 protected corpus after unrelated WeChat author write',
  sourceRelease:releaseCommit,DOICount:marker.productionCards,changedRows:changes,targetDoi:doi,
  beforeBlob:beforeSha,afterBlob:currentSha,publicationMarkerUnchanged:true,
  newDois:0,removedDois:0,releaseScheduleUnchanged:true}));
