import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const companion=fs.readFileSync('scripts/tm-private-pdf-capture.inc.js','utf8');
const page=fs.readFileSync('public/private-pdf-owner-setup.html','utf8');
function receiver(file){
  const start=file.indexOf('  function installPrivatePdfLeaseReceiver() {');
  const end=file.indexOf('\n\n  function privatePdfHostAllowed',start);
  assert.ok(start>0&&end>start,'exact owner lease receiver is present');
  return file.slice(start,end);
}
const implementation=receiver(source);
assert.equal(implementation,receiver(companion),'generator companion must match deployed collector');

function makeHarness({embedded=true,throwOnWrite=false,corruptReadback=false}={}){
  const listeners=[],messages=[],storage=new Map(),origin='https://gallery.gczhouwld.com';
  const window={
    addEventListener:(name,fn)=>{if(name==='message')listeners.push(fn);},
    postMessage:(data,target)=>{messages.push({data,target});}
  };
  const values={
    window,location:{origin},Date,Object,Number,isGalleryPage:()=>true,
    globalThis:{__OSG_TOC_BROWSER_MAINLINE__:embedded,__OSG_BRIDGE_VERSION__:embedded?'2.2.88':''},
    INSTALL_REVISION:'6.2.69',PRIVATE_PDF_CAPTURE_REVISION:'20261006-private-pdf-bundle-v6',
    PRIVATE_PDF_LEASE_KEY:'osg-toc-v6:private-pdf-capture-lease-v1',
    GM_setValue:(key,value)=>{if(throwOnWrite)throw new Error('storage failed');storage.set(key,value);},
    GM_getValue:(key,fallback)=>corruptReadback?null:storage.get(key)??fallback,
  };
  const context=vm.createContext(values);
  vm.runInContext(implementation+'\ninstallPrivatePdfLeaseReceiver();',context);
  assert.equal(listeners.length,1);
  return {
    origin,storage,messages,
    send:(data,originOverride=origin)=>listeners[0]({origin:originOverride,data}),
    last:()=>messages.at(-1)?.data,
  };
}
const uuid='123e4567-e89b-42d3-a456-426614174000';
const token='Z'.repeat(43);
const expiresAt=Date.now()+7*86400000;
const probe={type:'osg-private-pdf-capture-probe-v1',requestId:uuid};
const lease={type:'osg-private-pdf-capture-lease-v1',requestId:uuid,
  token,expiresAt,scope:'private_pdf_capture'};

test('owner setup preflights userscript before minting a private lease',()=>{
  assert.match(page,/osg-private-pdf-capture-probe-v1/);
  assert.ok(page.indexOf("await exchange({type:'osg-private-pdf-capture-probe-v1'") <
    page.indexOf("await json('/api/user-ui/private-pdf/capture-lease'"));
  assert.match(page,/tampermonkey_not_running_on_page/);
  assert.match(page,/tampermonkey_ack_timeout/);
  assert.match(page,/event\.data\?\.requestId!==message\.requestId/);
});

test('live embedded Bridge responds to same-origin probe without touching storage',()=>{
  const h=makeHarness();h.send(probe);
  assert.equal(h.last().type,'osg-private-pdf-capture-ready-v1');
  assert.equal(h.last().ok,true);
  assert.equal(h.last().requestId,uuid);
  assert.equal(h.storage.size,0);
});

test('acknowledge owner lease only after local GM readback',()=>{
  const h=makeHarness();h.send(lease);
  assert.equal(h.last().type,'osg-private-pdf-capture-lease-ack-v1');
  assert.equal(h.last().requestId,uuid);
  assert.equal(h.last().expiresAt,expiresAt);
  assert.equal(h.storage.get('osg-toc-v6:private-pdf-capture-lease-v1').token,token);
  assert.equal(JSON.stringify(h.messages).includes(token),false,'bearer must not leak in replies');
});

test('storage failure returns NACK instead of untrue success',()=>{
  for(const broken of [{throwOnWrite:true},{corruptReadback:true}]){
    const h=makeHarness(broken);h.send(lease);
    assert.equal(h.last().type,'osg-private-pdf-capture-lease-nack-v1');
    assert.equal(h.last().reason,'lease_storage_unavailable');
    assert.equal(h.messages.some(m=>m.data.type==='osg-private-pdf-capture-lease-ack-v1'),false);
  }
});

test('invalid scope, token or expiration cannot be persisted',()=>{
  for(const changed of [{scope:'private_pdf_read'},{token:'short'},{expiresAt:Date.now()-1000}]){
    const h=makeHarness();h.send({...lease,...changed});
    assert.equal(h.last().reason,'invalid_lease_payload');
    assert.equal(h.storage.size,0);
  }
});

test('foreign origin, missing request identifier and standalone collector cannot capture lease',()=>{
  const h=makeHarness();
  h.send(lease,'https://untrusted.example.invalid');
  h.send({...lease,requestId:''});
  assert.equal(h.messages.length,0);
  const standalone=makeHarness({embedded:false});
  standalone.send(probe);
  assert.equal(standalone.last().ok,false);
  standalone.send(lease);
  assert.equal(standalone.last().reason,'embedded_bridge_required');
  assert.equal(standalone.storage.size,0);
});

test('owner setup page runs lease listener but never its main capture controller',()=>{
  assert.ok(source.includes(String.raw`/\/private-pdf-owner-setup\.html$/.test(location.pathname)`));
  assert.match(source,/installPrivatePdfLeaseReceiver\(\);/);
});
