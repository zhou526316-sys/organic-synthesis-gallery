import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const HASH_A='a'.repeat(64),HASH_B='b'.repeat(64),MARKER='c'.repeat(64),COMMIT='d'.repeat(40);
const rows=[
  {doi:'10.1234/one',revision:'1'.repeat(64),firstOnlineDate:'2026-10-03',datePrecision:'day',addedDate:'2026-10-05',
    paper:{title:'Nickel photoredox chemistry',titleZh:'镍光氧化还原化学',authors:['Alice Example'],journal:'JACS',synthesisType:'methodology'}},
  {doi:'10.1234/two',revision:'2'.repeat(64),firstOnlineDate:'2026-09-20',datePrecision:'day',addedDate:'2026-10-05',
    paper:{title:'Organocatalysis chemistry',authors:['Bob Example'],journal:'Angew',synthesisType:'methodology'}},
  {doi:'10.1234/three',revision:'3'.repeat(64),firstOnlineDate:'2026-08-15',datePrecision:'day',addedDate:'2026-10-05',
    paper:{title:'Copper catalysis',authors:['Carol Example'],journal:'Chemical Science',synthesisType:'formal'}},
];
const searchRow=row=>({
  doi:row.doi,revision:row.revision,title:row.paper.title??row.paper.titleEn??'',titleZh:row.paper.titleZh??'',
  authors:row.paper.authors??[],journal:row.paper.journal??'',firstOnlineDate:row.firstOnlineDate,
  datePrecision:row.datePrecision,addedDate:row.addedDate,synthesisType:row.paper.synthesisType??null,
});
const matches=(items,query)=>{
  const q=String(query).trim().toLowerCase();
  return items.filter(row=>[
    row.doi,row.title,row.titleZh,...row.authors,row.journal,row.firstOnlineDate||'',row.synthesisType||''
  ].join(' ').toLowerCase().includes(q));
};

test('shadow sync imports a verified generation and completes two parity passes without activating reads',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'gallery-search-shadow-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'releases'),{recursive:true});await mkdir(path.join(root,'shards'),{recursive:true});
  const catalogPath='releases/catalog.fixture.json',shardPath='shards/2026-10.fixture.json';
  await writeFile(path.join(root,'current.json'),JSON.stringify({schema:'gallery-shadow-catalog-v1',catalog:{path:catalogPath}}));
  await writeFile(path.join(root,catalogPath),JSON.stringify({
    schema:'gallery-shadow-catalog-v1',recordSetHash:HASH_A,doiSetHash:HASH_B,recordCount:rows.length,
    source:{publicationSlot:'2026-10-05T08:00:00+08:00',markerBlobSha:MARKER,commit:'e'.repeat(40)},
    shards:[{path:shardPath,count:rows.length}],
  }));
  await writeFile(path.join(root,shardPath),JSON.stringify({schema:'gallery-shadow-catalog-v1',records:rows}));
  await writeFile(path.join(root,'report.json'),JSON.stringify({
    liveVerification:{ok:true,sourceCommit:COMMIT},publicationSlot:'2026-10-05T08:00:00+08:00',
  }));

  const state={generation:null,items:[],ready:false,begin:0,imports:0,finalize:0,queries:0};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(req.headers.authorization!=='Bearer fixture-token') return send(401,{error:'unauthorized'});
    if(url.pathname==='/api/admin/literature-catalog-index/status'){
      return send(200,{readPathActive:false,generations:state.generation?[{
        catalogId:state.generation.catalogId,doiSetHash:state.generation.doiSetHash,publicationSlot:state.generation.publicationSlot,
        sourceCommit:state.generation.sourceCommit,markerBlobSha:state.generation.markerBlobSha,
        recordCount:state.generation.recordCount,importedRows:state.items.length,ready:state.ready,
      }]:[]});
    }
    if(url.pathname==='/api/admin/literature-catalog-index/begin'){
      state.begin+=1;state.generation=body;return send(200,{ok:true,ready:false});
    }
    if(url.pathname==='/api/admin/literature-catalog-index/import'){
      state.imports+=1;state.generation=body.generation;
      const map=new Map(state.items.map(row=>[row.doi,row]));for(const row of body.rows||[])map.set(row.doi,row);state.items=[...map.values()];
      return send(200,{ok:true,importedRows:state.items.length,recordCount:state.generation.recordCount});
    }
    if(url.pathname==='/api/admin/literature-catalog-index/finalize'){
      state.finalize+=1;state.ready=true;return send(200,{ready:true,indexedRows:state.items.length,ftsRows:state.items.length});
    }
    if(url.pathname==='/api/admin/literature-catalog-index/query'){
      state.queries+=1;
      const q=url.searchParams.get('q')||'';
      if(q==='Ni') return send(422,{error:'literature_catalog_short_query_requires_compatibility'});
      const found=matches(state.items,q).sort((a,b)=>(b.firstOnlineDate||'').localeCompare(a.firstOnlineDate||'')||a.doi.localeCompare(b.doi));
      return send(200,{readPathActive:false,matched:found.length,count:found.length,hasMore:false,nextCursor:null,items:found});
    }
    return send(404,{error:'not_found'});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const port=server.address().port,reportPath=path.join(root,'sync-report.json');
  const result=await execFileAsync(process.execPath,['scripts/sync-literature-catalog-index-shadow.mjs',root],{
    cwd:path.resolve('.'),
    env:{...process.env,WORKER_URL:'http://127.0.0.1:'+port,BRIDGE_WRITE_TOKEN:'fixture-token',LITERATURE_INDEX_SHADOW_REPORT:reportPath},
  });
  assert.match(result.stdout,/LITERATURE_CATALOG_INDEX_SHADOW/);
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  assert.equal(report.ok,true);
  assert.equal(report.generation.catalogId,HASH_A);
  assert.equal(report.generation.sourceCommit,COMMIT);
  assert.equal(report.imported,true);
  assert.equal(report.importBatches,1);
  assert.equal(report.parityPasses.length,2);
  assert.ok(report.parityPasses.every(pass=>pass.mismatches.length===0));
  assert.equal(report.shortQueryCompatibility,true);
  assert.equal(report.readPathActive,false);
  assert.equal(report.frontendCutover,false);
  assert.equal(state.begin,1);assert.equal(state.imports,1);assert.equal(state.finalize,1);
  assert.ok(state.queries>0);
});

console.log('LITERATURE_INDEX_SHADOW_SYNC_TEST_READY');
