import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogViewGetParams } from '../src/literature-catalog-get-query.js';

test('preflight-free GET preserves DOI generation, Unicode search and filters',()=>{
  const q=new URLSearchParams();
  q.set('catalogId','a'.repeat(64));
  q.set('query','轴手性');
  q.set('sort','oldest');
  q.set('limit','12');
  q.set('cursor','opaque+key=123');
  q.set('dateFrom','2020-01-01');
  q.set('dateTo','2026-10-10');
  q.set('addedDate','2026-10-10');
  for(const name of ['Angew','JACS'])q.append('selectedJournal',name);
  q.append('excludedJournal','Nature');
  const result=parseCatalogViewGetParams(q);
  assert.equal(result.ok,true);
  assert.deepEqual(result.query,{
    catalogId:'a'.repeat(64),query:'轴手性',sort:'oldest',limit:'12',
    cursor:'opaque+key=123',dateFrom:'2020-01-01',dateTo:'2026-10-10',
    addedDate:'2026-10-10',selectedJournals:['Angew','JACS'],excludedJournals:['Nature']
  });
});
test('GET without filters supplies identical all-time defaults to existing POST view',()=>{
  const params=new URLSearchParams({catalogId:'a'.repeat(64),query:'LMCT',sort:'newest',limit:'24'});
  const value=parseCatalogViewGetParams(params);
  assert.equal(value.ok,true);
  assert.equal(value.query.query,'LMCT');
  assert.equal(value.query.dateFrom,'');
  assert.equal(value.query.dateTo,'');
  assert.deepEqual(value.query.selectedJournals,[]);
  assert.deepEqual(value.query.excludedJournals,[]);
});
test('reject overlong and unrecognized query data rather than attempting D1 work',()=>{
  const base='catalogId='+('a'.repeat(64));
  const bad=[
    base+'&catalogId='+('b'.repeat(64)),
    base+'&secret=something',
    base+'&query='+encodeURIComponent('x'.repeat(4100)),
    base+'&'+Array.from({length:31},()=> 'selectedJournal=JACS').join('&'),
  ];
  bad.forEach(value=>assert.equal(parseCatalogViewGetParams(value).ok,false));
});
