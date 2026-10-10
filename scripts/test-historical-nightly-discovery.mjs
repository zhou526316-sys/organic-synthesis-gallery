import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  SCHEMA,normDoi,previousPeriod,orderedJournals,nextCursor,mediaPolicy,
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
