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
