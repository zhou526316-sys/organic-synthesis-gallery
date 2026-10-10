import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  SCHEMA,normDoi,previousPeriod,orderedJournals,nextCursor,mediaPolicy,
  bisectDateRange,isTruncationOnly,
  fromCrossref,fromOpenAlex,mergeCandidates,completeStatus,runNightly
} from './historical-nightly-discovery.mjs';

test('journal order starts with JACS/Angew but keeps the full registry',()=>{
  const names=orderedJournals().map(x=>x.name);
  assert.deepEqual(names.slice(0,2),['JACS','Angew']);
  assert.equal(names.length,16);
  assert.equal(new Set(names).size,16);
});
test('decremented history windows preserve calendar week, month, quarter, half-year and year',()=>{
  assert.deepEqual(previousPeriod({from:'2026-09-22'}),{from:'2026-09-15',to:'2026-09-21'});
  assert.deepEqual(previousPeriod({from:'2026-09-01'}),{from:'2026-08-22',to:'2026-08-31'});
  assert.deepEqual(previousPeriod({from:'2026-07-01'}),{from:'2026-06-01',to:'2026-06-30'});
  assert.deepEqual(previousPeriod({from:'2015-01-01'}),{from:'2014-10-01',to:'2014-12-31'});
  assert.deepEqual(previousPeriod({from:'2000-01-01'}),{from:'1999-07-01',to:'1999-12-31'});
  assert.deepEqual(previousPeriod({from:'1900-01-01'}),{from:'1899-01-01',to:'1899-12-31'});
  assert.equal(previousPeriod({from:'1850-01-01'}),null);
});
test('cursor advances first between journals, then rolls back one date partition',()=>{
  const journals=orderedJournals();
  const first={range:{from:'2026-09-22',to:'2026-09-30'},journalIndex:0};
  assert.deepEqual(nextCursor(first,journals),{range:first.range,journalIndex:1});
  assert.deepEqual(nextCursor({...first,journalIndex:15},journals),
    {range:{from:'2026-09-15',to:'2026-09-21'},journalIndex:0});
  assert.throws(()=>nextCursor({...first,journalIndex:16},journals),/invalid_history_cursor/);
});
test('DOI uniqueness and source/title/citation identity',()=>{
  assert.equal(normDoi('HTTPS://DOI.ORG/10.1021/JACS.6C12345'),'10.1021/jacs.6c12345');
  assert.equal(normDoi('not-a-doi'),null);
  const cr=fromCrossref({DOI:'10.1021/jacs.6c12345',title:['Light-Catalyzed Coupling'],author:[{given:'A',family:'Li'}],
    published:{'date-parts':[[2026,9,25]]},'container-title':['Journal of the American Chemical Society'],
    volume:'148',issue:'40',page:'100-112',abstract:'Publisher copyrighted abstract text'});
  assert.equal(cr.doi,'10.1021/jacs.6c12345');
  assert.equal(cr.title,'Light-Catalyzed Coupling');
  assert.deepEqual(cr.authors,['A Li']);
  assert.equal(cr.citation.volume,'148');
  assert.equal(cr.abstract.available,true);
  assert.equal(cr.abstract.storedText,false);
  assert.equal('abstractText' in cr,false);
  const oa=fromOpenAlex({doi:'https://doi.org/10.1021/JACS.6C12345',
    display_name:'Light-Catalyzed Coupling',publication_date:'2026-09-25',
    authorships:[{author:{display_name:'A Li'}}],has_abstract:true,
    biblio:{volume:'148',issue:'40',first_page:'100',last_page:'112'}});
  const merged=mergeCandidates([cr],[oa],new Set(['10.1021/jacs.6c12345']),{from:'2026-09-22',to:'2026-09-30'});
  assert.equal(merged.length,1);
  assert.equal(merged[0].reviewStatus,'already_published');
  assert.equal(merged[0].mediaPolicy,'toc_only');
  assert.equal(merged[0].sources.length,2);
  assert.equal(merged[0].abstract.displayPermission,'not_verified');
  assert.equal('abstractText' in merged[0],false);
});
test('source errors never become proof of complete historical coverage',()=>{
  assert.equal(completeStatus({rows:[],issues:[]},{rows:[],issues:[]}).complete,true);
  const failed=completeStatus({rows:[],issues:['issn_http_429']},{rows:[],issues:[]});
  assert.equal(failed.complete,false);
  assert.match(failed.issues[0],/429/);
  assert.equal(mediaPolicy('2026-06-30'),'metadata_only');
  assert.equal(mediaPolicy('2026-07-01'),'toc_only');
  assert.equal(mediaPolicy('2026-09-30'),'toc_only');
  assert.equal(mediaPolicy('2026-10-01'),'metadata_only');
});
test('read-only mocked network stages DOI candidates and advances without formal production writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gallery-historical-'));
  const originalCwd=process.cwd(),originalFetch=global.fetch;
  const env={HISTORICAL_STAGING_ONLY:process.env.HISTORICAL_STAGING_ONLY,
    GITHUB_REF_NAME:process.env.GITHUB_REF_NAME,
    HISTORICAL_STAGING_BRANCH:process.env.HISTORICAL_STAGING_BRANCH,
    MAX_UNITS:process.env.MAX_UNITS,API_REQUEST_LIMIT:process.env.API_REQUEST_LIMIT};
  try{
    await mkdir(join(root,'public'),{recursive:true});
    await mkdir(join(root,'audit'),{recursive:true});
    const published={webpageDoiCount:1,articles:[{doi:'10.1021/jacs.6c00001'}]};
    const release={productionCards:1};
    await writeFile(join(root,'public/toc-demand-live.json'),JSON.stringify(published));
    await writeFile(join(root,'audit/publication-release-state.json'),JSON.stringify(release));
    process.chdir(root);
    process.env.HISTORICAL_STAGING_ONLY='1';
    process.env.GITHUB_REF_NAME='pull_request';
    process.env.HISTORICAL_STAGING_BRANCH='1';
    process.env.MAX_UNITS='1';
    process.env.API_REQUEST_LIMIT='7';
    const called=[];
    global.fetch=async url=>{
      const u=new URL(url);called.push(u);
      if(u.hostname==='api.crossref.org')return {
        ok:true,json:async()=>({message:{'total-results':1,items:[{
          DOI:'10.1021/jacs.6c00002',title:['Electrochemical test coupling'],
          'container-title':['JACS'],published:{'date-parts':[[2026,9,25]]},
          author:[{given:'B',family:'Liu'}],abstract:'source abstract must never be saved'
        }]}})
      };
      if(u.hostname==='api.openalex.org')return{
        ok:true,json:async()=>({meta:{count:1},results:[{
          doi:'https://doi.org/10.1021/jacs.6c00002',display_name:'Electrochemical test coupling',
          publication_date:'2026-09-25',authorships:[{author:{display_name:'B Liu'}}],
          has_abstract:true
        }]})
      };
      throw Error('unexpected host');
    };
    const result=await runNightly();
    assert.equal(result.processed,1);
    assert.equal(result.blocked,false);
    assert.equal(result.noPublication,true);
    assert.equal(result.noPdf,true);
    assert.deepEqual(result.next.journalIndex,1);
    assert.equal(called.length,3);
    assert.ok(called.every(x=>x.searchParams.get('filter')?.includes('2026-09-22')));
    assert.equal(called.filter(x=>x.hostname==='api.crossref.org').length,2);
    const snapshot=JSON.parse(await readFile(join(root,'audit/historical-staging/batches/2026-09-22_2026-09-30_jacs.json')));
    assert.equal(snapshot.recordType,'historical_discovery_candidate_only');
    assert.equal(snapshot.records.length,1);
    assert.equal(snapshot.records[0].reviewStatus,'unfinished');
    assert.equal(snapshot.records[0].mediaPolicy,'toc_only');
    assert.equal(JSON.stringify(snapshot).includes('source abstract must never be saved'),false);
    const state=JSON.parse(await readFile(join(root,'audit/historical-staging/state.json')));
    assert.equal(state.schema,SCHEMA);
    assert.equal(state.completed.length,1);
    assert.deepEqual(JSON.parse(await readFile(join(root,'public/toc-demand-live.json'))),published);
    assert.deepEqual(JSON.parse(await readFile(join(root,'audit/publication-release-state.json'))),release);
  } finally {
    global.fetch=originalFetch;process.chdir(originalCwd);
    for(const [key,value] of Object.entries(env)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    await rm(root,{recursive:true,force:true});
  }
});


test('date bisection exactly partitions an inclusive window and never masks source 429',()=>{
  const [a,b]=bisectDateRange({from:'2026-09-22',to:'2026-09-30'});
  assert.deepEqual(a,{from:'2026-09-22',to:'2026-09-25'});
  assert.deepEqual(b,{from:'2026-09-26',to:'2026-09-30'});
  assert.equal(bisectDateRange({from:'2026-09-22',to:'2026-09-22'}),null);
  assert.throws(()=>bisectDateRange({from:'2026-02-30',to:'2026-03-02'}),/invalid_history_slice_range/);
  assert.equal(isTruncationOnly({complete:false,issues:['issn_0002-7863:crossref:truncated_or_inconsistent']}),true);
  assert.equal(isTruncationOnly({complete:false,issues:['openalex:truncated_or_inconsistent']}),true);
  assert.equal(isTruncationOnly({complete:false,issues:['crossref:http_429']}),false);
  assert.equal(isTruncationOnly({complete:false,issues:['openalex:truncated_or_inconsistent','crossref:http_429']}),false);
});

test('truncated root persists resumable split leaves and only closes on all source-complete leaves',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gallery-history-split-'));
  const cwd=process.cwd(),oldFetch=global.fetch,oldExit=process.exitCode;
  const env={HISTORICAL_STAGING_ONLY:process.env.HISTORICAL_STAGING_ONLY,
    GITHUB_REF_NAME:process.env.GITHUB_REF_NAME,
    HISTORICAL_STAGING_BRANCH:process.env.HISTORICAL_STAGING_BRANCH,
    MAX_UNITS:process.env.MAX_UNITS,API_REQUEST_LIMIT:process.env.API_REQUEST_LIMIT};
  try{
    await mkdir(join(root,'public'),{recursive:true});
    await mkdir(join(root,'audit'),{recursive:true});
    const published={webpageDoiCount:1,articles:[{doi:'10.1021/jacs.6c00001'}]};
    const marker={productionCards:1};
    await writeFile(join(root,'public/toc-demand-live.json'),JSON.stringify(published));
    await writeFile(join(root,'audit/publication-release-state.json'),JSON.stringify(marker));
    process.chdir(root);
    Object.assign(process.env,{HISTORICAL_STAGING_ONLY:'1',GITHUB_REF_NAME:'pull_request',
      HISTORICAL_STAGING_BRANCH:'1',MAX_UNITS:'2',API_REQUEST_LIMIT:'80'});
    const requests=[];
    global.fetch=async url=>{
      const u=new URL(url);requests.push(u);
      const filter=u.searchParams.get('filter')||'';
      const parent=filter.includes('from-pub-date:2026-09-22,until-pub-date:2026-09-30')
        ||filter.includes('from_publication_date:2026-09-22,to_publication_date:2026-09-30');
      if(u.hostname==='api.crossref.org'){
        const firstIssn=u.pathname.includes('0002-7863');
        if(parent&&firstIssn){
          const cursor=u.searchParams.get('cursor'),page=cursor==='*'?0:Number(cursor.slice(1));
          assert.ok(page>=0&&page<10);
          return {ok:true,json:async()=>({message:{'total-results':1001,
            items:Array.from({length:100},(_,i)=>({DOI:'10.1021/jacs.6c'+String(page*100+i).padStart(5,'0'),
              title:['Truncated parent'] })), 'next-cursor':'p'+(page+1)}})};
        }
        const doi=filter.includes('from-pub-date:2026-09-22,until-pub-date:2026-09-25')
          ?'10.1021/jacs.6c11111':'10.1021/jacs.6c22222';
        return {ok:true,json:async()=>({message:{
          'total-results':firstIssn?1:0,items:firstIssn?[{DOI:doi,title:['Split leaf verified'],
            published:{'date-parts':[[2026,9,25]]}}]:[]}})};
      }
      if(u.hostname==='api.openalex.org'){
        const empty=parent;
        const left=filter.includes('from_publication_date:2026-09-22,to_publication_date:2026-09-25');
        return {ok:true,json:async()=>({meta:{count:empty?0:1},
          results:empty?[]:[{doi:'https://doi.org/'+(left?'10.1021/jacs.6c11111':'10.1021/jacs.6c22222'),
            display_name:'Split leaf verified',publication_date:'2026-09-25'}]})};
      }
      throw Error('unexpected_source');
    };
    const first=await runNightly();
    assert.equal(first.processed,2);
    assert.equal(first.blocked,false);
    assert.equal(first.completeWindows,0);
    assert.equal(first.activeSplit.completedSegments,1);
    assert.equal(first.activeSplit.pendingSegments,1);
    let state=JSON.parse(await readFile(join(root,'audit/historical-staging/state.json')));
    assert.equal(state.completed.length,0);
    assert.equal(state.cursor.journalIndex,0);
    assert.deepEqual(state.activeSplit.pending,[{from:'2026-09-26',to:'2026-09-30'}]);
    process.env.MAX_UNITS='1';
    const second=await runNightly();
    assert.equal(second.blocked,false);
    assert.equal(second.completeWindows,1);
    assert.equal(second.activeSplit,null);
    assert.equal(second.next.journalIndex,1);
    state=JSON.parse(await readFile(join(root,'audit/historical-staging/state.json')));
    assert.equal(state.activeSplit,undefined);
    assert.equal(state.completed.length,1);
    const rootBatch=JSON.parse(await readFile(join(root,'audit/historical-staging/batches/2026-09-22_2026-09-30_jacs.json')));
    assert.equal(rootBatch.status,'source_enumeration_complete');
    assert.equal(rootBatch.recordType,'historical_discovery_candidate_only');
    assert.equal(rootBatch.completedBySubwindows,true);
    assert.equal(rootBatch.sourceStatus.splitSegments.length,2);
    assert.deepEqual(rootBatch.records.map(x=>x.doi),['10.1021/jacs.6c11111','10.1021/jacs.6c22222']);
    assert.equal(rootBatch.unreviewed,2);
    assert.equal(rootBatch.noFormalPublication,true);
    assert.equal(rootBatch.noPDFAcquisition,true);
    assert.equal(requests.filter(u=>u.hostname==='api.crossref.org').length,14);
    assert.deepEqual(JSON.parse(await readFile(join(root,'public/toc-demand-live.json'))),published);
    assert.deepEqual(JSON.parse(await readFile(join(root,'audit/publication-release-state.json'))),marker);
  } finally {
    process.exitCode=oldExit;
    global.fetch=oldFetch;process.chdir(cwd);
    for(const [key,value] of Object.entries(env)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    await rm(root,{recursive:true,force:true});
  }
});


test('Crossref HTTP 429 blocks the historical root without splitting or touching publication files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gallery-history-429-'));
  const cwd=process.cwd(),oldFetch=global.fetch,oldExit=process.exitCode;
  const env={HISTORICAL_STAGING_ONLY:process.env.HISTORICAL_STAGING_ONLY,
    GITHUB_REF_NAME:process.env.GITHUB_REF_NAME,
    HISTORICAL_STAGING_BRANCH:process.env.HISTORICAL_STAGING_BRANCH,
    MAX_UNITS:process.env.MAX_UNITS,API_REQUEST_LIMIT:process.env.API_REQUEST_LIMIT};
  try{
    await mkdir(join(root,'public'),{recursive:true});
    await mkdir(join(root,'audit'),{recursive:true});
    const published={webpageDoiCount:1,articles:[{doi:'10.1021/jacs.6c00001'}]};
    const marker={productionCards:1};
    await writeFile(join(root,'public/toc-demand-live.json'),JSON.stringify(published));
    await writeFile(join(root,'audit/publication-release-state.json'),JSON.stringify(marker));
    process.chdir(root);
    Object.assign(process.env,{HISTORICAL_STAGING_ONLY:'1',GITHUB_REF_NAME:'pull_request',
      HISTORICAL_STAGING_BRANCH:'1',MAX_UNITS:'1',API_REQUEST_LIMIT:'8'});
    global.fetch=async url=>{
      const u=new URL(url);
      if(u.hostname==='api.crossref.org')return {ok:false,status:429};
      if(u.hostname==='api.openalex.org')return {ok:true,json:async()=>({meta:{count:0},results:[]})};
      throw Error('unexpected_source');
    };
    const result=await runNightly();
    assert.equal(result.blocked,true);
    assert.equal(result.completeWindows,0);
    assert.equal(result.activeSplit,null);
    assert.equal(result.next.journalIndex,0);
    const state=JSON.parse(await readFile(join(root,'audit/historical-staging/state.json')));
    assert.equal(state.completed.length,0);
    assert.equal(state.activeSplit,undefined);
    const parent=JSON.parse(await readFile(join(root,'audit/historical-staging/batches/2026-09-22_2026-09-30_jacs.json')));
    assert.equal(parent.status,'incomplete_sources');
    assert.equal(parent.consistency.complete,false);
    assert.match(parent.consistency.issues.join('|'),/429/);
    assert.equal(parent.noFormalPublication,true);
    assert.equal(parent.noPDFAcquisition,true);
    assert.deepEqual(JSON.parse(await readFile(join(root,'public/toc-demand-live.json'))),published);
    assert.deepEqual(JSON.parse(await readFile(join(root,'audit/publication-release-state.json'))),marker);
  } finally {
    process.exitCode=oldExit;global.fetch=oldFetch;process.chdir(cwd);
    for(const [key,value] of Object.entries(env)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    await rm(root,{recursive:true,force:true});
  }
});



// Extended adversarial/regression matrix — production remains staging-only.
async function isolatedHistoricalRun(fn,{queue=null,release=null,priorState=null}={}){
  const root=await mkdtemp(join(tmpdir(),'gallery-history-adversarial-'));
  const cwd=process.cwd(),originalFetch=global.fetch,originalExit=process.exitCode;
  const keys=['HISTORICAL_STAGING_ONLY','HISTORICAL_STAGING_BRANCH','GITHUB_REF_NAME','MAX_UNITS','API_REQUEST_LIMIT'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const baseQueue=queue||{webpageDoiCount:1,articles:[{doi:'10.1021/jacs.6c00001'}]};
  const baseMarker=release||{productionCards:baseQueue.webpageDoiCount};
  try{
    await mkdir(join(root,'public'),{recursive:true});
    await mkdir(join(root,'audit'),{recursive:true});
    await writeFile(join(root,'public/toc-demand-live.json'),JSON.stringify(baseQueue));
    await writeFile(join(root,'audit/publication-release-state.json'),JSON.stringify(baseMarker));
    if(priorState){
      await mkdir(join(root,'audit/historical-staging'),{recursive:true});
      await writeFile(join(root,'audit/historical-staging/state.json'),JSON.stringify(priorState));
    }
    process.chdir(root);
    Object.assign(process.env,{HISTORICAL_STAGING_ONLY:'1',
      HISTORICAL_STAGING_BRANCH:'1',GITHUB_REF_NAME:'pull_request',
      MAX_UNITS:'1',API_REQUEST_LIMIT:'80'});
    return await fn({root,queue:baseQueue,release:baseMarker,
      readState:async()=>JSON.parse(await readFile(join(root,'audit/historical-staging/state.json'))),
      readBatch:async id=>JSON.parse(await readFile(join(root,'audit/historical-staging/batches/'+id+'.json'))),
      write:async(path,value)=>{
        await mkdir(join(root,path.split('/').slice(0,-1).join('/')),{recursive:true});
        await writeFile(join(root,path),JSON.stringify(value));
      }
    });
  }finally{
    process.exitCode=originalExit;global.fetch=originalFetch;process.chdir(cwd);
    for(const k of keys){
      if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];
    }
    await rm(root,{recursive:true,force:true});
  }
}
const emptyCrossref=()=>({ok:true,json:async()=>({message:{'total-results':0,items:[]}})});
const emptyOpenAlex=()=>({ok:true,json:async()=>({meta:{count:0},results:[]})});
const stage0=()=>({schema:SCHEMA,mode:'candidate_discovery_only',
  cursor:{range:{from:'2026-09-22',to:'2026-09-30'},journalIndex:0},
  completed:[],attempts:[],publishedMembershipSnapshot:1});
const completeCrossref=(items=[])=>({ok:true,json:async()=>({message:{'total-results':items.length,items}})});
const completeOpenalex=(items=[])=>({ok:true,json:async()=>({meta:{count:items.length},results:items})});
function saturatedCrossref(u){
  const cursor=u.searchParams.get('cursor');
  const page=cursor==='*'?0:Number(cursor.slice(1));
  if(!Number.isInteger(page)||page<0||page>9)throw Error('unbounded_page');
  return {ok:true,json:async()=>({message:{'total-results':1001,
    items:Array.from({length:100},(_,i)=>({
      DOI:'10.1021/jacs.6c'+String(page*100+i).padStart(5,'0'),
      title:['Batch exceeded pagination ceiling']
    })), 'next-cursor':'p'+(page+1)}})};
}
const crRow=(doi,title='Historical electrochemical coupling')=>({
  DOI:doi,title:[title],published:{'date-parts':[[2026,9,23]]}});
const oaRow=(doi)=>({doi:'https://doi.org/'+doi,
  display_name:'Historical electrochemical coupling',publication_date:'2026-09-23'});

test('two healthy zero-result sources close one root, retain 16-journal cursor and zero admissions',async()=>{
  await isolatedHistoricalRun(async({readState,readBatch,queue,release,root})=>{
    const seen=[];
    global.fetch=async url=>{const u=new URL(url);seen.push(u);return u.hostname==='api.crossref.org'
      ?emptyCrossref():emptyOpenAlex()};
    const report=await runNightly(),state=await readState();
    assert.equal(report.completeWindows,1);
    assert.equal(report.blocked,false);
    assert.equal(report.noPublication,true);
    assert.equal(report.noPdf,true);
    assert.equal(state.cursor.journalIndex,1);
    const batch=await readBatch('2026-09-22_2026-09-30_jacs');
    assert.equal(batch.candidateCount,0);
    assert.equal(batch.status,'source_enumeration_complete');
    assert.equal(batch.consistency.complete,true);
    assert.equal(seen.length,3);
    assert.deepEqual(JSON.parse(await readFile(join(root,'public/toc-demand-live.json'))),queue);
    assert.deepEqual(JSON.parse(await readFile(join(root,'audit/publication-release-state.json'))),release);
  });
});

test('source fault matrix: OpenAlex 429, Crossref 403, and transport failure never close or split',async()=>{
  for(const fault of ['openalex_429','crossref_403','transport_error']){
    await isolatedHistoricalRun(async({readState,readBatch})=>{
      global.fetch=async url=>{
        const u=new URL(url),isCr=u.hostname==='api.crossref.org';
        if(fault==='openalex_429'&&!isCr)return{ok:false,status:429};
        if(fault==='crossref_403'&&isCr)return{ok:false,status:403};
        if(fault==='transport_error'&&isCr)throw Error('simulated abort');
        return isCr?emptyCrossref():emptyOpenAlex();
      };
      const x=await runNightly(),state=await readState();
      assert.equal(x.blocked,true, fault);
      assert.equal(x.completeWindows,0,fault);
      assert.equal(x.activeSplit,null,fault);
      assert.equal(state.cursor.journalIndex,0,fault);
      assert.equal(state.completed.length,0,fault);
      const batch=await readBatch('2026-09-22_2026-09-30_jacs');
      assert.equal(batch.status,'incomplete_sources',fault);
      assert.equal(batch.consistency.complete,false,fault);
      assert.ok(batch.consistency.issues.length,fault);
    });
  }
});

test('malformed Crossref cursor and changing total-results remain incomplete instead of splitting',async()=>{
  for(const fault of ['missing_cursor','changing_total']){
    await isolatedHistoricalRun(async({readState,readBatch})=>{
      global.fetch=async url=>{
        const u=new URL(url);
        if(u.hostname==='api.openalex.org')return emptyOpenAlex();
        const page=u.searchParams.get('cursor')==='*'?0:1;
        const total=fault==='changing_total'&&page===1?999:1001;
        return {ok:true,json:async()=>({message:{'total-results':total,
          items:Array.from({length:100},(_,i)=>crRow('10.1021/jacs.6c'+String(page*100+i).padStart(5,'0'))),
          ...(fault==='missing_cursor'?{}:{'next-cursor':'p1'})}})};
      };
      const x=await runNightly();
      assert.equal(x.blocked,true,fault);
      assert.equal(x.completeWindows,0,fault);
      assert.equal(x.activeSplit,null,fault);
      assert.equal((await readState()).cursor.journalIndex,0,fault);
      const batch=await readBatch('2026-09-22_2026-09-30_jacs');
      assert.match(batch.consistency.issues.join('|'),fault==='missing_cursor'?/missing_next_cursor/:/total_changed/);
    });
  }
});

test('one-day saturated publisher results cannot bisect and never become falsely complete',async()=>{
  const state=stage0();
  state.cursor.range={from:'2026-09-23',to:'2026-09-23'};
  await isolatedHistoricalRun(async({readBatch,readState})=>{
    global.fetch=async url=>{
      const u=new URL(url);
      return u.hostname==='api.crossref.org'?saturatedCrossref(u):emptyOpenAlex();
    };
    const x=await runNightly();
    assert.equal(x.blocked,true);
    assert.equal(x.completeWindows,0);
    assert.equal(x.activeSplit,null);
    assert.deepEqual((await readState()).cursor.range,{from:'2026-09-23',to:'2026-09-23'});
    const root=await readBatch('2026-09-23_2026-09-23_jacs');
    assert.equal(root.status,'incomplete_sources');
    assert.match(root.consistency.issues.join('|'),/truncated_or_inconsistent/);
  },{priorState:state});
});

test('nested truncations resume across three rounds and close root only after all leaves complete',async()=>{
  await isolatedHistoricalRun(async({readState,readBatch})=>{
    process.env.MAX_UNITS='2';
    const seen=[];
    global.fetch=async url=>{
      const u=new URL(url);seen.push(u);
      const filter=u.searchParams.get('filter')||'';
      const root=filter.includes('2026-09-22,until-pub-date:2026-09-30');
      const left=filter.includes('2026-09-22,until-pub-date:2026-09-25');
      if(u.hostname==='api.openalex.org')return emptyOpenAlex();
      if((root||left)&&u.pathname.includes('0002-7863'))return saturatedCrossref(u);
      const doi=filter.includes('2026-09-22,until-pub-date:2026-09-23')
        ?'10.1021/jacs.6c11111':filter.includes('2026-09-24,until-pub-date:2026-09-25')
          ?'10.1021/jacs.6c22222':'10.1021/jacs.6c33333';
      return completeCrossref(u.pathname.includes('0002-7863')?[crRow(doi)]:[]);
    };
    const first=await runNightly();
    assert.equal(first.processed,2);
    assert.equal(first.completeWindows,0);
    assert.equal(first.activeSplit.pendingSegments,3);
    assert.equal((await readState()).cursor.journalIndex,0);
    process.env.MAX_UNITS='1';
    const second=await runNightly();
    assert.equal(second.completeWindows,0);
    assert.equal(second.activeSplit.pendingSegments,2);
    process.env.MAX_UNITS='2';
    const third=await runNightly();
    assert.equal(third.completeWindows,1);
    assert.equal(third.activeSplit,null);
    assert.equal(third.next.journalIndex,1);
    const root=await readBatch('2026-09-22_2026-09-30_jacs');
    assert.equal(root.status,'source_enumeration_complete');
    assert.equal(root.completedBySubwindows,true);
    assert.deepEqual(root.records.map(x=>x.doi),
      ['10.1021/jacs.6c11111','10.1021/jacs.6c22222','10.1021/jacs.6c33333']);
    assert.equal(root.sourceStatus.splitSegments.length,3);
    assert.ok(seen.length>=20);
  });
});

test('parent closure must reject a checkpoint omitting earlier calendar days',async()=>{
  const state=stage0(),rootId='2026-09-22_2026-09-30_jacs';
  state.activeSplit={rootId,rootRange:state.cursor.range,journalName:'JACS',
    completed:[],pending:[{from:'2026-09-26',to:'2026-09-30'}]};
  await isolatedHistoricalRun(async({readState})=>{
    global.fetch=async url=>new URL(url).hostname==='api.crossref.org'
      ?emptyCrossref():emptyOpenAlex();
    await assert.rejects(runNightly(),/split_segment_coverage_gap_or_overlap/);
    assert.equal((await readState()).completed.length,0);
    assert.equal((await readState()).cursor.journalIndex,0);
  },{priorState:state});
});

test('root aggregation must reject a completed segment outside the root and preserve the cursor',async()=>{
  const state=stage0(),rootId='2026-09-22_2026-09-30_jacs';
  state.activeSplit={rootId,rootRange:state.cursor.range,journalName:'JACS',
    completed:[],pending:[{from:'2026-09-22',to:'2026-09-21'}]};
  await isolatedHistoricalRun(async()=>{
    global.fetch=async()=>{throw Error('should_not_fetch')};
    await assert.rejects(runNightly(),/invalid_pending_split_range|invalid_existing_split_state/);
  },{priorState:state});
});

test('finished split candidates must recheck DOI membership after an intervening 08:00 publication',async()=>{
  await isolatedHistoricalRun(async({readBatch,write})=>{
    process.env.MAX_UNITS='2';
    global.fetch=async url=>{
      const u=new URL(url),filter=u.searchParams.get('filter')||'';
      if(u.hostname==='api.openalex.org')return emptyOpenAlex();
      if(filter.includes('from-pub-date:2026-09-22,until-pub-date:2026-09-30')
        &&u.pathname.includes('0002-7863'))return saturatedCrossref(u);
      const first=filter.includes('from-pub-date:2026-09-22,until-pub-date:2026-09-25');
      return completeCrossref(u.pathname.includes('0002-7863')
        ?[crRow(first?'10.1021/jacs.6c11111':'10.1021/jacs.6c22222')]:[]);
    };
    const one=await runNightly();
    assert.equal(one.completeWindows,0);
    await write('public/toc-demand-live.json',{webpageDoiCount:2,
      articles:[{doi:'10.1021/jacs.6c00001'},{doi:'10.1021/jacs.6c11111'}]});
    await write('audit/publication-release-state.json',{productionCards:2});
    process.env.MAX_UNITS='1';
    const two=await runNightly();
    assert.equal(two.completeWindows,1);
    const batch=await readBatch('2026-09-22_2026-09-30_jacs');
    assert.equal(batch.candidateCount,2);
    assert.equal(batch.alreadyPublished,1);
    assert.equal(batch.unreviewed,1);
    assert.equal(batch.records.find(x=>x.doi==='10.1021/jacs.6c11111').reviewStatus,'already_published');
  });
});

test('duplicate live DOI registry rejects preflight before any Crossref/OpenAlex requests',async()=>{
  const duplicate={webpageDoiCount:2,articles:[{doi:'10.1021/jacs.6c00001'},{doi:'10.1021/jacs.6c00001'}]};
  await isolatedHistoricalRun(async({root})=>{
    let calls=0;global.fetch=async()=>{calls++;return emptyCrossref()};
    await assert.rejects(runNightly(),/published_registry_invalid_or_duplicate/);
    assert.equal(calls,0);
    assert.equal(await readFile(join(root,'audit/publication-release-state.json'),'utf8'),
      JSON.stringify({productionCards:2}));
    await assert.rejects(readFile(join(root,'audit/historical-staging/state.json')),/ENOENT/);
  },{queue:duplicate,release:{productionCards:2}});
});

test('saved completed leaf missing on disk prevents false root promotion',async()=>{
  const state=stage0(),rootId='2026-09-22_2026-09-30_jacs';
  state.activeSplit={rootId,rootRange:state.cursor.range,journalName:'JACS',
    completed:[rootId+'__2026-09-22_2026-09-25'],
    pending:[{from:'2026-09-26',to:'2026-09-30'}]};
  await isolatedHistoricalRun(async({readState})=>{
    global.fetch=async url=>new URL(url).hostname==='api.crossref.org'
      ?emptyCrossref():emptyOpenAlex();
    await assert.rejects(runNightly(),/split_segment_evidence_incomplete/);
    const x=await readState();
    assert.equal(x.cursor.journalIndex,0);
    assert.equal(x.completed.length,0);
  },{priorState:state});
});



test('OpenAlex cursor corruption and changing totals never become successful or split windows',async()=>{
  for(const scenario of ['missing','changed']){
    await isolatedHistoricalRun(async({readState,readBatch})=>{
      global.fetch=async url=>{
        const u=new URL(url);
        if(u.hostname==='api.crossref.org')return emptyCrossref();
        const first=u.searchParams.get('cursor')==='*';
        return {ok:true,json:async()=>({meta:{
          count:scenario==='changed'&&!first?999:1001,
          ...(scenario==='missing'?{}:{next_cursor:'p1'})
        },results:Array.from({length:100},(_,i)=>oaRow('10.1021/jacs.6c'
          +String((first?0:100)+i).padStart(5,'0')))})};
      };
      const result=await runNightly(),record=await readBatch('2026-09-22_2026-09-30_jacs');
      assert.equal(result.blocked,true,scenario);
      assert.equal(result.completeWindows,0,scenario);
      assert.equal(result.activeSplit,null,scenario);
      assert.equal((await readState()).cursor.journalIndex,0,scenario);
      assert.match(record.consistency.issues.join('|'),
        scenario==='missing'?/missing_next_cursor/:/total_changed/);
    });
  }
});

test('mixed Crossref truncation and OpenAlex 429 cannot split away a missing source',async()=>{
  await isolatedHistoricalRun(async({readBatch,readState})=>{
    global.fetch=async url=>{
      const u=new URL(url);
      if(u.hostname==='api.openalex.org')return {ok:false,status:429};
      return saturatedCrossref(u);
    };
    const result=await runNightly();
    assert.equal(result.blocked,true);
    assert.equal(result.activeSplit,null);
    assert.equal(result.completeWindows,0);
    assert.equal((await readState()).cursor.journalIndex,0);
    const batch=await readBatch('2026-09-22_2026-09-30_jacs');
    assert.match(batch.consistency.issues.join('|'),/truncated_or_inconsistent/);
    assert.match(batch.consistency.issues.join('|'),/429/);
    assert.equal(batch.status,'incomplete_sources');
  });
});

test('shared DOI across nonoverlapping split leaves is deduplicated once without losing unique rows',async()=>{
  const state=stage0(),root='2026-09-22_2026-09-30_jacs';
  state.activeSplit={rootId:root,rootRange:state.cursor.range,journalName:'JACS',completed:[],
    pending:[{from:'2026-09-22',to:'2026-09-25'},{from:'2026-09-26',to:'2026-09-30'}]};
  await isolatedHistoricalRun(async({readBatch})=>{
    process.env.MAX_UNITS='2';
    global.fetch=async url=>{
      const u=new URL(url);
      if(u.hostname==='api.openalex.org')return emptyOpenAlex();
      if(!u.pathname.includes('0002-7863'))return emptyCrossref();
      const left=(u.searchParams.get('filter')||'').includes('2026-09-22');
      return completeCrossref([crRow('10.1021/jacs.6c44444'),
        crRow(left?'10.1021/jacs.6c11111':'10.1021/jacs.6c22222')]);
    };
    const result=await runNightly();
    assert.equal(result.completeWindows,1);
    const batch=await readBatch(root);
    assert.equal(batch.candidateCount,3);
    assert.equal(batch.duplicateDoisAcrossSubwindows,1);
    assert.equal(batch.sourceStatus.splitSegments.length,2);
    assert.equal(batch.status,'source_enumeration_complete');
    assert.deepEqual(batch.records.map(x=>x.doi),
      ['10.1021/jacs.6c11111','10.1021/jacs.6c22222','10.1021/jacs.6c44444']);
    assert.ok(batch.records.every(x=>x.discoveredIn.from==='2026-09-22'
      &&x.discoveredIn.to==='2026-09-30'));
  },{priorState:state});
});

test('corrupted completed leaf journal identity cannot be used to close the root',async()=>{
  const state=stage0(),root='2026-09-22_2026-09-30_jacs';
  const prior=root+'__2026-09-22_2026-09-25';
  state.activeSplit={rootId:root,rootRange:state.cursor.range,journalName:'JACS',
    completed:[prior],pending:[{from:'2026-09-26',to:'2026-09-30'}]};
  await isolatedHistoricalRun(async({readState,write})=>{
    await write('audit/historical-staging/batches/'+prior+'.json',{
      schema:SCHEMA,recordType:'historical_discovery_segment_evidence',
      parentBatchId:root,journal:'Angew',range:{from:'2026-09-22',to:'2026-09-25'},
      status:'source_enumeration_complete',consistency:{complete:true,sourceCounts:{crossref:0,openalex:0}},
      candidateCount:0,records:[]
    });
    global.fetch=async url=>new URL(url).hostname==='api.crossref.org'
      ?emptyCrossref():emptyOpenAlex();
    await assert.rejects(runNightly(),/split_segment_evidence_incomplete/);
    const saved=await readState();
    assert.equal(saved.completed.length,0);
    assert.equal(saved.cursor.journalIndex,0);
  },{priorState:state});
});

test('API call budget exhaustion reports incomplete coverage, never split or a false successful DOI window',async()=>{
  await isolatedHistoricalRun(async({readState,readBatch})=>{
    process.env.API_REQUEST_LIMIT='4';
    let remoteCalls=0;
    global.fetch=async url=>{
      remoteCalls++;
      const u=new URL(url);
      return u.hostname==='api.crossref.org'?saturatedCrossref(u):emptyOpenAlex();
    };
    const result=await runNightly();
    assert.equal(result.blocked,true);
    assert.equal(result.completeWindows,0);
    assert.equal(result.activeSplit,null);
    assert.ok(remoteCalls<=4,'no external request after the configured budget');
    assert.equal((await readState()).cursor.journalIndex,0);
    const batch=await readBatch('2026-09-22_2026-09-30_jacs');
    assert.equal(batch.status,'incomplete_sources');
    assert.match(batch.consistency.issues.join('|'),/nightly_api_budget_exceeded/);
  });
});

test('date boundaries preserve leap day and stage-only guard refuses an unapproved main-branch write',async()=>{
  assert.deepEqual(bisectDateRange({from:'2024-02-28',to:'2024-03-02'}),[
    {from:'2024-02-28',to:'2024-02-29'},
    {from:'2024-03-01',to:'2024-03-02'}
  ]);
  await isolatedHistoricalRun(async()=>{
    let remoteCalls=0;
    global.fetch=async()=>{remoteCalls++;return emptyCrossref()};
    process.env.HISTORICAL_STAGING_ONLY='0';
    await assert.rejects(runNightly(),/staging_only_guard_required/);
    process.env.HISTORICAL_STAGING_ONLY='1';
    process.env.GITHUB_REF_NAME='main';
    process.env.HISTORICAL_STAGING_BRANCH='0';
    await assert.rejects(runNightly(),/refuses_to_write_production_main/);
    assert.equal(remoteCalls,0);
  });
});



test('all 16 registered journals traverse one historical window and roll over in correct order',async()=>{
  await isolatedHistoricalRun(async({readState,readBatch,queue,release,root})=>{
    process.env.MAX_UNITS='16';
    process.env.API_REQUEST_LIMIT='80';
    const crIssns=[],oaFilters=[];
    global.fetch=async url=>{
      const u=new URL(url);
      if(u.hostname==='api.crossref.org'){
        const match=u.pathname.match(/\/journals\/([^/]+)\/works$/);
        assert.ok(match,'Crossref journal ISSN path must be canonical');
        crIssns.push(decodeURIComponent(match[1]));
        assert.match(u.searchParams.get('filter')||'',/from-pub-date:2026-09-22/);
        return emptyCrossref();
      }
      oaFilters.push(u.searchParams.get('filter')||'');
      return emptyOpenAlex();
    };
    const result=await runNightly();
    assert.equal(result.blocked,false);
    assert.equal(result.deferredBudget,false);
    assert.equal(result.processed,16);
    assert.equal(result.completeWindows,16);
    assert.deepEqual(result.next,{range:{from:'2026-09-15',to:'2026-09-21'},journalIndex:0});
    assert.equal(result.noPublication,true);
    assert.equal(result.noPdf,true);
    const names=orderedJournals(),allIssns=names.flatMap(j=>j.issns);
    assert.deepEqual(crIssns,allIssns);
    assert.equal(oaFilters.length,16);
    for(const journal of names){
      const id='2026-09-22_2026-09-30_'+journal.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      const batch=await readBatch(id);
      assert.equal(batch.status,'source_enumeration_complete',journal.name);
      assert.equal(batch.journal,journal.name);
      assert.deepEqual(batch.issns,journal.issns);
      assert.equal(batch.candidateCount,0);
      assert.equal(batch.consistency.complete,true);
      assert.equal(batch.noFormalPublication,true);
      assert.equal(batch.noPDFAcquisition,true);
      assert.equal(batch.noMediaWrites,true);
    }
    assert.equal((await readState()).completed.length,16);
    assert.deepEqual(JSON.parse(await readFile(join(root,'public/toc-demand-live.json'))),queue);
    assert.deepEqual(JSON.parse(await readFile(join(root,'audit/publication-release-state.json'))),release);
  });
});

test('before July 2026 historical DOI is metadata-only and never stores protected abstract text',async()=>{
  const state=stage0();state.cursor.range={from:'2026-06-01',to:'2026-06-30'};
  await isolatedHistoricalRun(async({readBatch})=>{
    global.fetch=async url=>{
      const u=new URL(url);
      if(u.hostname==='api.openalex.org')return emptyOpenAlex();
      return completeCrossref(u.pathname.includes('0002-7863')?[{
        DOI:'10.1021/jacs.6c77777',
        title:['An older catalyst-controlled C–C bond construction'],
        published:{'date-parts':[[2026,6,15]]},
        abstract:'PROTECTED_PUBLISHER_ABSTRACT_DO_NOT_STORE',
        author:[{given:'A',family:'Chen'}],page:'123-129',volume:'148'
      }]:[]);
    };
    const result=await runNightly();
    assert.equal(result.completeWindows,1);
    const batch=await readBatch('2026-06-01_2026-06-30_jacs');
    assert.equal(batch.records.length,1);
    const paper=batch.records[0];
    assert.equal(paper.mediaPolicy,'metadata_only');
    assert.equal(paper.ingestionChannel,'historical_backfill');
    assert.equal(paper.abstract.available,true);
    assert.equal(paper.abstract.displayPermission,'not_verified');
    assert.equal(paper.abstract.storedText,false);
    assert.equal('abstractText' in paper,false);
    assert.equal(paper.citation.pages,'123-129');
    assert.equal(JSON.stringify(batch).includes('PROTECTED_PUBLISHER_ABSTRACT_DO_NOT_STORE'),false);
    assert.equal(batch.noPDFAcquisition,true);
    assert.equal(batch.noMediaWrites,true);
  },{priorState:state});
});
