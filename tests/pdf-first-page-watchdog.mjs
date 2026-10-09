import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPdfFirstPage} from '../src/pdf-first-page-watchdog.mjs';

test('buffered PDF success clears the first-page deadline',async()=>{
  assert.equal(await waitForPdfFirstPage(Promise.resolve('rendered'),null,150),'rendered');
});
test('a stalled buffered PDF has a finite timeout after bytes arrive',async()=>{
  const start=Date.now();
  await assert.rejects(
    waitForPdfFirstPage(new Promise(()=>{}),null,28),
    error=>error instanceof Error&&error.message==='pdf_first_page_timeout');
  assert.ok(Date.now()-start<750,'small files cannot wait forever');
});
test('a stalled range-backed PDF has the same timeout',async()=>{
  await assert.rejects(
    waitForPdfFirstPage(new Promise(()=>{}),new Promise(()=>{}),28),
    /pdf_first_page_timeout/);
});
test('an explicit Range failure is propagated instead of waiting for timeout',async()=>{
  await assert.rejects(
    waitForPdfFirstPage(new Promise(()=>{}),Promise.reject(new Error('file_http_503')),200),
    /file_http_503/);
});
test('first-page deadline rejects malformed arguments without scheduling work',async()=>{
  await assert.rejects(waitForPdfFirstPage(null,null,30),/pdf_first_page_invalid_job/);
  await assert.rejects(waitForPdfFirstPage(Promise.resolve(),null,0),/pdf_first_page_invalid_deadline/);
  await assert.rejects(waitForPdfFirstPage(Promise.resolve(),false,20),/pdf_first_page_invalid_failure_signal/);
});
