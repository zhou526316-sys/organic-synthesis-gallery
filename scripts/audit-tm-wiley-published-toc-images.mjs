import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const SITE='https://gallery.gczhouwld.com';
const API='https://api.gczhouwld.com';
const report={schemaVersion:'wiley-public-ga-image-pixel-readback-v1',
  readAt:new Date().toISOString(),readOnly:true,productionWrites:0,publisherRequests:0,
  privatePdfRequests:0,items:[],errors:[]};
const out=path.join(process.env.RUNNER_TEMP||'/tmp','tm-wiley-public-toc-images');
await mkdir(out,{recursive:true});

async function jsonGet(url) {
  const response=await fetch(url,{headers:{'cache-control':'no-cache'},
    signal:AbortSignal.timeout(16000)});
  assert.equal(response.status,200,'GET '+new URL(url).pathname+' HTTP '+response.status);
  return response.json();
}
const queue=await jsonGet(SITE+'/toc-demand-live.json?readback='+Date.now());
const eligible=(queue.articles||[]).filter(r=>
  /^10\.1002\/anie\./.test(String(r.doi||'').toLowerCase())&&
  String(r.addedDate||'')>='2026-10-01').slice(0,45);
async function readImage(entry){
  const doi=String(entry.doi||'').toLowerCase();
  const row={doi,title:String(entry.title||'').slice(0,200)};
  try{
    const toc=await jsonGet(API+'/api/toc?doi='+encodeURIComponent(doi));
    row.reason=String(toc.reason||'');
    row.available=toc.available===true;
    row.hash=String(toc.contentHash||'');
    if(!row.available||!toc.imageUrl){row.state='no_published_visual';return row;}
    const u=new URL(toc.imageUrl);
    assert.ok(u.protocol==='https:'&&u.hostname==='api.gczhouwld.com'&&u.pathname.startsWith('/media/'),
      'published media URL must stay in public Gallery API');
    const res=await fetch(u.href,{headers:{'cache-control':'no-cache'},
      redirect:'error',signal:AbortSignal.timeout(16000)});
    assert.equal(res.status,200,'published image GET status');
    const len=Number(res.headers.get('content-length')||0);
    assert.ok(!len||len<=4_000_000,'file exceeds bounded public-image size');
    const bytes=Buffer.from(await res.arrayBuffer());
    assert.ok(bytes.length>=100&&bytes.length<=4_000_000,'invalid public image size');
    const fullHash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(fullHash.slice(0,32),row.hash,'public published hash mismatch');
    let ext='';
    if(bytes.subarray(0,4).equals(Buffer.from([0x89,0x50,0x4e,0x47])))ext='png';
    else if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)ext='jpg';
    else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')ext='webp';
    else if(bytes.toString('utf8',0,250).includes('<svg'))ext='svg';
    else throw Error('unknown image signature');
    const name=doi.replace(/[^a-z0-9]+/gi,'_')+'.'+ext;
    await writeFile(path.join(out,name),bytes);
    row.file=name;row.bytes=bytes.length;row.sourceUrl=u.origin+u.pathname;
    row.state='exact_published_bytes_verified';
    return row;
  }catch(error){row.state='read_or_digest_failed';row.error=String(error?.message||error).slice(0,240);return row;}
}
for(let i=0;i<eligible.length;i+=5){
  const rows=await Promise.all(eligible.slice(i,i+5).map(readImage));
  report.items.push(...rows);
}
report.targetCount=eligible.length;
report.saved=report.items.filter(x=>x.state==='exact_published_bytes_verified').length;
report.unavailable=report.items.filter(x=>x.state==='no_published_visual').length;
report.failed=report.items.filter(x=>x.state==='read_or_digest_failed').length;
report.completedAt=new Date().toISOString();
await writeFile(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log('WILEY_PUBLIC_GA_IMAGE_READBACK '+JSON.stringify({readOnly:true,
  targetCount:report.targetCount,saved:report.saved,unavailable:report.unavailable,
  failed:report.failed,failures:report.items.filter(x=>x.error).slice(0,8)}));
if(report.failed)process.exitCode=1;
