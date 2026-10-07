import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourceFile=process.env.TM_SOURCE_FILE||'public/toc-mainline.user.js';
const source=fs.readFileSync(sourceFile,'utf8');
const API='https://api.gczhouwld.com';
const INVENTORY=API+'/api/media/inventory';
const GALLERY='https://gallery.gczhouwld.com/';
let passed=0;

// Let the JS parser find the complete declaration; braces in strings, comments,
// regexes and nested callbacks cannot truncate the extracted real function.
function extract(name){
  const pattern=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
  const match=pattern.exec(source);
  assert.ok(match,'missing real source function: '+name);
  const start=match.index;
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
    const text=source.slice(start,end+1);
    try{new vm.Script('('+text+')');return text;}catch{}
  }
  throw new Error('cannot extract complete function: '+name);
}
// Include neighboring read helpers without duplicating their implementation.
const blockStart=source.indexOf('  function controllerTransportUrl(');
const blockEnd=source.indexOf('  // BEGIN ARCHITECTURE MEMBERSHIP CORE',blockStart);
assert.ok(blockStart>=0&&blockEnd>blockStart,'real controller transport block must exist');
let functions=source.slice(blockStart,blockEnd);
for(const name of ['controllerReadMetadataJson','parseMetadataJson','getPrivateJson','postReadJson','headerValue','shouldNativeRetryUpload']){
  if(!new RegExp('function\\s+'+name+'\\s*\\(').test(functions)) functions+='\n'+extract(name);
}

function response(status=200,body={ok:true},headers={}){
  return {status,statusText:String(status),responseText:typeof body==='string'?body:JSON.stringify(body),
    responseHeaders:Object.entries(headers).map(([key,value])=>key+': '+value).join('\r\n')};
}
function harness({native=[response()],gm=[response()],gallery=true}={}){
  const calls={native:[],gm:[]};
  const timers=new Set();
  const env={URL,Date,AbortController,AbortSignal,Promise,console,
    location:{href:gallery?GALLERY:'https://pubs.rsc.org/en/content/articlehtml/2026/gc/fixture',hostname:gallery?'gallery.gczhouwld.com':'pubs.rsc.org'},
    isGalleryPage:()=>gallery,MEDIA_INVENTORY_ENDPOINT:INVENTORY,WORKER:API,GALLERY_HOST:'gallery.gczhouwld.com',
    setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);},
    fetch:async(url,init)=>{
      calls.native.push({url:String(url),method:init.method,body:init.body,headers:{...init.headers}});
      const item=native[calls.native.length-1];
      if(!item)throw new Error('unexpected extra native request');
      if(item instanceof Error)throw item;
      const pairs=String(item.responseHeaders||'').split(/\r?\n/).filter(Boolean).map(line=>{const n=line.indexOf(':');return [line.slice(0,n),line.slice(n+1).trim()];});
      return {status:item.status,statusText:item.statusText,ok:item.status>=200&&item.status<300,url:String(url),
        text:async()=>item.responseText,headers:{forEach:fn=>pairs.forEach(([key,value])=>fn(value,key))}};
    },
    GM_xmlhttpRequest:options=>{
      calls.gm.push({url:options.url,method:options.method,data:options.data,skipNativeFallback:options.skipNativeFallback});
      const item=gm[calls.gm.length-1];
      if(!item)throw new Error('unexpected extra GM request');
      queueMicrotask(()=>{
        if(item instanceof Error)options.onerror({error:item.message});
        else options.onload({...item,finalUrl:options.url});
      });
      return {abort(){}};
    }
  };
  const context=vm.createContext(env);
  vm.runInContext(functions,context,{filename:sourceFile});
  return {T:context,calls,cleanup(){for(const id of timers)clearTimeout(id);}};
}
async function test(name,fn){await fn();passed++;console.log('CONTROLLER_READ_PASS '+name);}
async function withHarness(options,fn){const h=harness(options);try{await fn(h);}finally{h.cleanup();}}
function counts(h,native,gm){assert.equal(h.calls.native.length,native,'native request count');assert.equal(h.calls.gm.length,gm,'GM request count');}
const htmlError=status=>response(status,'<!doctype html><html><body>Upstream unavailable</body></html>');

await test('native success for public GET bypasses GM',()=>withHarness({},async h=>{
  const result=await h.T.getJson(GALLERY+'toc-demand-live.json');
  assert.equal(result.ok,true);counts(h,1,0);
}));
await test('private GET keeps supplied authorization and uses native first',()=>withHarness({},async h=>{
  await h.T.getPrivateJson(API+'/api/article-summary/evidence-inventory','fixture-only');
  counts(h,1,0);assert.equal(h.calls.native[0].headers.authorization,'Bearer fixture-only');
}));
await test('native network failure makes exactly one successful GM backup',()=>withHarness({native:[new TypeError('Failed to fetch')]},async h=>{
  const result=await h.T.getJson(API+'/api/media/capture-capabilities');assert.equal(result.ok,true);counts(h,1,1);
}));
await test('GM network failure after native failure cannot fall back to native again',()=>withHarness({native:[new TypeError('Failed to fetch')],gm:[new Error('fixture GM failed')]},async h=>{
  await assert.rejects(h.T.getJson(API+'/api/media/capture-capabilities'));counts(h,1,1);
}));
await test('GM retryable HTML response after native failure cannot cause a second native request',()=>withHarness({native:[new TypeError('Failed to fetch')],gm:[htmlError(502)]},async h=>{
  await assert.rejects(h.T.getJson(API+'/api/media/capture-capabilities'),error=>error.httpStatus===502);counts(h,1,1);
}));
await test('retryable native gateway response permits one GM backup',()=>withHarness({native:[htmlError(502)]},async h=>{
  assert.equal((await h.T.getJson(API+'/api/media/capture-capabilities')).ok,true);counts(h,1,1);
}));
for(const status of [401,403,429])await test('native '+status+' fails closed without a GM downgrade',()=>withHarness({native:[response(status,{error:'denied'},status===429?{'retry-after':'120'}:{})]},async h=>{
  await assert.rejects(h.T.getJson(API+'/api/media/capture-capabilities'),error=>{
    assert.equal(error.httpStatus,status);
    if(status===429)assert.equal(error.retryAfterMs,120000);
    return true;
  });counts(h,1,0);
}));
await test('native retry-after on 503 is retained and not bypassed',()=>withHarness({native:[response(503,'<!doctype html><html>Back off</html>',{'retry-after':'60'})]},async h=>{
  await assert.rejects(h.T.getJson(API+'/api/media/capture-capabilities'),error=>error.httpStatus===503&&error.retryAfterMs===60000);counts(h,1,0);
}));
await test('publisher URL stays on legacy GM metadata path',()=>withHarness({},async h=>{
  await h.T.getJson('https://pubs.rsc.org/en/content/articlehtml/2026/gc/fixture');counts(h,0,1);
}));
await test('publisher page reading an owned API stays on legacy GM metadata path',()=>withHarness({gallery:false},async h=>{
  await h.T.getJson(API+'/api/media/capture-capabilities');counts(h,0,1);
}));
await test('ordinary write POST stays on legacy metadata path even with readOnly true',()=>withHarness({},async h=>{
  await h.T.postReadJson(API+'/api/media/local-capture/import',{readOnly:true,dois:['fixture']});counts(h,0,1);
}));
await test('exact inventory POST with readOnly true and cache query uses native',()=>withHarness({},async h=>{
  const payload={dois:['fixture'],readOnly:true};await h.T.postReadJson(INVENTORY+'?ts=123',payload);counts(h,1,0);
  assert.equal(h.calls.native[0].method,'POST');assert.deepEqual(JSON.parse(h.calls.native[0].body),payload);
}));
for(const payload of [{dois:[]},{readOnly:false},{readOnly:'true'},[]])await test('inventory POST requires a strict boolean readOnly: '+JSON.stringify(payload),()=>withHarness({},async h=>{
  await h.T.postReadJson(INVENTORY,payload);counts(h,0,1);
}));
for(const url of [INVENTORY+'/write',GALLERY+'api/media/inventory','https://unrelated.invalid/api/media/inventory'])await test('inventory POST rejects a different endpoint: '+url,()=>withHarness({},async h=>{
  await h.T.postReadJson(url,{readOnly:true});counts(h,0,1);
}));
await test('invalid inventory POST JSON cannot opt into the native fast path',()=>withHarness({},async h=>{
  await h.T.controllerReadMetadataJson({method:'POST',url:INVENTORY,data:'{broken'},'inventory');counts(h,0,1);
}));
await test('legacy direct metadataJson keeps its default GM-to-native fallback',()=>withHarness({gm:[new Error('fixture unavailable')]},async h=>{
  const result=await h.T.metadataJson({method:'GET',url:API+'/api/media/capture-capabilities'},'legacy');
  assert.equal(result.ok,true);counts(h,1,1);
}));

console.log('CONTROLLER_READ_TRANSPORT_RESULT '+JSON.stringify({passed,cases:passed,realTransportFunctions:true,externalNetworkRequests:0,sourceFile}));
