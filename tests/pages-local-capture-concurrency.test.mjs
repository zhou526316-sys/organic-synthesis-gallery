import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {boundedImageDownloads, captureBelongsToDoi} from '../cloudflare/scripts/merge-local-captures.mjs';

test('870 captures use no more than eight concurrent downloads and retain source order',async()=>{
  let peak=0,active=0,started=0;
  const items=Array.from({length:870},(_,i)=>({doi:'10.1021/jacs.6c'+String(i).padStart(5,'0'),ordinal:i}));
  const result=await boundedImageDownloads(items,async item=>{
    started++;active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,(item.ordinal%7)+1));
    active--;
    return item.ordinal;
  });
  assert.equal(started,870);
  assert.ok(peak>=2&&peak<=8,'peak='+peak);
  assert.equal(result.length,870);
  assert.ok(result.every((x,i)=>x.ok===true&&x.value===i));
});

test('one failed image never discards successful images and errors remain keyed to original ordinal',async()=>{
  const items=Array.from({length:17},(_,i)=>i);
  const result=await boundedImageDownloads(items,async i=>{
    await new Promise(resolve=>setTimeout(resolve,(i%4)+1));
    if(i===3||i===14)throw Error('source_timeout_'+i);
    return 'saved_'+i;
  },4);
  assert.equal(result.filter(x=>!x.ok).length,2);
  assert.match(result[3].error.message,/source_timeout_3/);
  assert.match(result[14].error.message,/source_timeout_14/);
  assert.equal(result[16].value,'saved_16');
  assert.equal(result[0].value,'saved_0');
});

test('missing and invalid catalog image rows are not downloaded',async()=>{
  let count=0;
  const result=await boundedImageDownloads([null,{doi:'10.1021/jacs.6c00001'},null],async item=>{
    count++;return item.doi;
  });
  assert.equal(count,1);
  assert.equal(result[0].value,null);
  assert.equal(result[1].value,'10.1021/jacs.6c00001');
  assert.equal(result[2].value,null);
});

test('excessive requested concurrency remains hard capped and original DOI bound checks stay active',async()=>{
  let peak=0,active=0;
  const items=Array.from({length:35},(_,i)=>i);
  await boundedImageDownloads(items,async i=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,2));
    active--;return i;
  },5000);
  assert.ok(peak<=8,'peak='+peak);
  assert.equal(captureBelongsToDoi({
    articleUrl:'https://pubs.acs.org/doi/10.1021/jacs.6c00001',
    sourceUrl:'https://acs.silverchair-cdn.com/10.1021_jacs.6c00001/ga.png'
  },'10.1021/jacs.6c00001'),true);
  assert.equal(captureBelongsToDoi({
    articleUrl:'https://pubs.acs.org/doi/10.1021/jacs.6c00002',
    sourceUrl:'https://acs.silverchair-cdn.com/10.1021_jacs.6c00001/ga.png'
  },'10.1021/jacs.6c00001'),false);
});

test('Pages manifest still serializes verified records after bounded downloads, unchanged media semantics',()=>{
  const code=fs.readFileSync('cloudflare/scripts/merge-local-captures.mjs','utf8');
  assert.match(code,/const transfers = await boundedImageDownloads\(admissible, downloadCapture\)/);
  assert.match(code,/for \(let index = 0; index < admissible\.length; index \+= 1\)/);
  assert.match(code,/if \(!captureBelongsToDoi\(capture, doi\)\)/);
  assert.match(code,/if \(!transfer\?\.ok\) throw transfer\?\.error/);
  assert.match(code,/await writeFile\(MEDIA_INDEX, JSON\.stringify\(manifest\)\)/);
  assert.match(code,/if \(failures && merged === 0\) process\.exitCode = 2/);
});
