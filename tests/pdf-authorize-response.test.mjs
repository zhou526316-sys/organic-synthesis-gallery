import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedPdfOpenJson } from '../src/pdf-authorize-response.mjs';

const fixture = Object.freeze({
  available:true,
  url:'https://api.gczhouwld.com/api/user-ui/private-pdf/file?token=synthetic_non_secret_fixture',
  byteLength:2345678,
  headerVerified:true,
  contentHash:'a'.repeat(64),
});
function response(chunks,{length=null,close=false}={}) {
  const stream=new ReadableStream({
    start(c) {
      for(const chunk of chunks)c.enqueue(new TextEncoder().encode(chunk));
      if(close)c.close();
    },
    cancel(){/* browser may terminate a completed partial response */}
  });
  return new Response(stream,{headers:length===null?{}:{'content-length':String(length)}});
}
test('content-length complete JSON returns without waiting for proxy EOF',async()=>{
 const body=JSON.stringify(fixture),r=response([body],{length:Buffer.byteLength(body)});
 const data=await Promise.race([
   readBoundedPdfOpenJson(r),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('blocked_waiting_for_EOF')),250)),
 ]);
 assert.deepEqual(data,fixture);
});
test('no content-length complete JSON returns without waiting for proxy EOF',async()=>{
 const body=JSON.stringify(fixture);
 const data=await Promise.race([
   readBoundedPdfOpenJson(response([body])),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('blocked_waiting_for_EOF')),250)),
 ]);
 assert.deepEqual(data,fixture);
});
test('complete JSON across three chunks is parsed in order without EOF',async()=>{
 const body=JSON.stringify(fixture);
 assert.deepEqual(await readBoundedPdfOpenJson(response([
   body.slice(0,18),body.slice(18,85),body.slice(85)],{length:Buffer.byteLength(body)})),fixture);
});
test('incomplete JSON cannot be treated as an authorized open response',async()=>{
 await assert.rejects(
  readBoundedPdfOpenJson(response(['{"available":true,"url":"broken'],{close:true})),
  /pdf_authorize_invalid_body/);
});
test('truncated body with declared Content-Length must fail closed',async()=>{
 const body=JSON.stringify(fixture);
 await assert.rejects(readBoundedPdfOpenJson(response([body],{length:Buffer.byteLength(body)+2,close:true})),
  /pdf_authorize_invalid_body/);
});
test('oversized body or declared Content-Length must fail closed',async()=>{
 await assert.rejects(readBoundedPdfOpenJson(response([' '],{length:25000})),/pdf_authorize_invalid_body/);
 await assert.rejects(readBoundedPdfOpenJson(response(['x'.repeat(8193)],{close:true})),/pdf_authorize_invalid_body/);
});
test('authorization data must be a JSON object, not an array or primitive',async()=>{
 await assert.rejects(readBoundedPdfOpenJson(response(['[]'],{close:true})),/pdf_authorize_invalid_body/);
 await assert.rejects(readBoundedPdfOpenJson(response(['123'],{close:true})),/pdf_authorize_invalid_body/);
});
test('extra bytes cannot be interpreted as a complete declared response',async()=>{
 const body=JSON.stringify(fixture);
 await assert.rejects(readBoundedPdfOpenJson(response([body+'malicious'],{length:Buffer.byteLength(body)})),
   /pdf_authorize_invalid_body/);
});
