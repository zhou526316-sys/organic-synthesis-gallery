import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchSemanticScholarAbstractBatch,scholarRetryDelay}
  from './lib/semantic-scholar-abstract-client.mjs';
const DOI='10.1038/s44160-026-01128-y';
const text='Scientific metadata may describe transformations, outcomes and methods, but without DOI agreement it must not become a historical literature abstract.';
test('rate-limit response requests bounded retry; token only travels in x-api-key',async()=>{
  let calls=0;const slept=[];
  const fetchImpl=async(url,opts)=>{
    calls++;
    assert.equal(url.startsWith('https://api.semanticscholar.org/graph/v1/paper/batch'),true);
    assert.equal(opts.headers['x-api-key'],'中文占位密钥');
    assert.equal(opts.method,'POST');
    assert.deepEqual(JSON.parse(opts.body),{ids:['DOI:'+DOI]});
    if(calls===1)return new Response(null,{status:429,headers:{'retry-after':'2'}});
    return Response.json([{externalIds:{DOI},abstract:text}]);
  };
  const r=await fetchSemanticScholarAbstractBatch([DOI],{key:'中文占位密钥',fetchImpl,sleep:async ms=>slept.push(ms)});
  assert.equal(r.retries,1);
  assert.equal(r.authenticated,true);
  assert.deepEqual(slept,[2000]);
  assert.equal(r.records[0].externalIds.DOI,DOI);
});
test('anonymous repeated 429 stops after two bounded attempts without leaking source',async()=>{
  let count=0;const delays=[];
  await assert.rejects(
    ()=>fetchSemanticScholarAbstractBatch([DOI],{
      fetchImpl:async (_url,{headers})=>{
        count++;assert.equal('x-api-key' in headers,false);
        return new Response(null,{status:429});
      },
      sleep:async ms=>delays.push(ms)
    }),/semantic_scholar_http_429_after_2_attempts/
  );
  assert.equal(count,2);assert.deepEqual(delays,[4000]);
});
test('retry-after is capped and invalid DOI/duplicate batches trigger no fetch',async()=>{
  assert.equal(scholarRetryDelay('999',0),12000);
  assert.equal(scholarRetryDelay('1',0),1000);
  assert.equal(scholarRetryDelay('NaN',1),8000);
  await assert.rejects(()=>fetchSemanticScholarAbstractBatch(['10.1234/invalid','10.1234/invalid'],
    {fetchImpl:async()=>{throw Error('should not fetch')}}),/invalid_doi_batch/);
});
test('invalid upstream success response is rejected and unrelated HTTP status has no body logging',async()=>{
  await assert.rejects(()=>fetchSemanticScholarAbstractBatch([DOI],{
    fetchImpl:async()=>Response.json({message:'injected',abstract:'private body'})
  }),/invalid_batch_response/);
  await assert.rejects(()=>fetchSemanticScholarAbstractBatch([DOI],{
    fetchImpl:async()=>new Response('private vendor content',{status:403})
  }),err=>err.message==='semantic_scholar_http_403');
});
