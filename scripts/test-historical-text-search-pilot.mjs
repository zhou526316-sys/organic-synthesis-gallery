import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {selectHistoricalSample,classifyOpenAlex,normalizedDoi,runPilot} from './historical-text-source-audit.mjs';
import {validateLocalPacket,runLocal,evaluatePackets} from './historical-text-local-evaluator.mjs';

const historicDoi='10.1021/jacs.6c08636';
const registry={pairedCaptureRegistry:true,webpageDoiCount:3,generatedAt:'2026-10-12T00:00:00Z',
  articles:[
    {doi:historicDoi,date:'2026-09-14',title:'A catalytic cross coupling study',journal:'JACS',mediaPolicy:'toc_only'},
    {doi:'10.1038/s44160-026-02000-0',date:'2024-06-01',title:'Other historical paper',journal:'Nature Synthesis',mediaPolicy:'metadata_only'},
    {doi:'10.1021/jacs.6c09999',date:'2026-10-09',journal:'JACS',mediaPolicy:'standard'}
  ]};
const metaWork={doi:'https://doi.org/'+historicDoi,has_content:{grobid_xml:true},
  content_urls:{grobid_xml:'https://content.openalex.org/works/W123456.grobid-xml'},
  open_access:{is_oa:true},best_oa_location:{license:'cc-by'}};

test('source sample selects only formally listed older DOI, different journals',()=>{
  const sample=selectHistoricalSample(registry,100);
  assert.equal(sample.length,2);
  assert.equal(new Set(sample.map(p=>p.journal)).size,2);
  assert.ok(sample.every(x=>x.publication<'2026-10-01'));
  assert.equal(normalizedDoi('https://doi.org/'+historicDoi),historicDoi);
  assert.equal(normalizedDoi('invalid'), '');
});

test('OpenAlex document needs matching DOI and license review even for CC BY',()=>{
  const row={doi:historicDoi};
  assert.deepEqual(classifyOpenAlex(row,{...metaWork,doi:'10.1234/different'}),
    {state:'doi_mismatch',tei:false,oa:false,license:null});
  const accepted=classifyOpenAlex(row,metaWork);
  assert.equal(accepted.tei,true);
  assert.equal(accepted.license,'cc-by');
  assert.equal(accepted.rights,'requires_item_license_review');
  assert.equal(classifyOpenAlex(row,{...metaWork,content_urls:{grobid_xml:'http://unsafe.test/abc'}}).tei,false);
});

test('bounded source audit dry-run never makes network calls or publisher requests',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gallery-historical-source-'));
  try{
    const path=join(dir,'registry.json'),output=join(dir,'sources.json');
    await writeFile(path,JSON.stringify(registry));
    const prior=globalThis.fetch;
    globalThis.fetch=()=>{throw Error('Unexpected network request');};
    try{
      const audit=await runPilot({registryPath:path,output,limit:50,offline:true});
      assert.equal(audit.historicalCandidates,2);
      assert.equal(audit.pdfRequests,0);
      assert.equal(audit.articleTextRequests,0);
      assert.equal(audit.productionWrites,0);
      assert.equal(audit.verifiedTei,0);
      assert.equal(audit.entries.length,2);
    }finally{globalThis.fetch=prior;}
  }finally{await rm(dir,{force:true,recursive:true});}
});

function fakeParagraph(text){
  return {tagName:'P',textContent:text,id:'',className:'',
    parentElement:null,closest(){return null;}};
}
function fakeHeading(text){
  return {tagName:'H2',textContent:text,id:'',className:'',
    parentElement:null,closest(){return null;}};
}
async function simulateTampermonkey({confirm=true,doiTags=[historicDoi],actualDate='2026-09-14'}={}){
  let menu,downloadBlob,clicked=0,network=0;
  const messages=[];
  const nodes=[
    fakeHeading('Abstract'),
    fakeParagraph('Ligand-to-metal charge transfer initiates the transformation. '.repeat(5)),
    fakeHeading('Results and Discussion'),
    fakeParagraph('LMCT enables a cross coupling through controlled electron transfer. '.repeat(5)),
    fakeHeading('Mechanistic Studies'),
    fakeParagraph('Electrochemical controls provide mechanistic evidence for radical intermediates. '.repeat(5))
  ];
  const figure={tagName:'FIGCAPTION',textContent:'Scheme 1. Ligand-to-metal charge transfer strategy',
    id:'',className:'',parentElement:null,closest(){return null;}};
  const table={tagName:'TABLE',textContent:'Table 1. Optimization 78% 12 mmol Ni',
    id:'',className:'',parentElement:null,closest(){return null;}};
  const root={querySelectorAll(s){
    if(s==='h2,h3,p')return nodes;
    if(s.startsWith('figure figcaption'))return [figure];
    if(s==='table')return [table];
    throw Error('Unknown selector '+s);
  }};
  const body={append(){}};
  for(const node of [...nodes,figure,table])node.parentElement=body;
  const document={body,
    querySelectorAll(s){if(!s.includes('meta[name="citation_doi"'))throw Error('Unknown query '+s);
      return doiTags.map(doi=>({content:doi}));},
    querySelector(s){if(!s.startsWith('main article'))throw Error('Unexpected query '+s);return root;},
    createElement(tag){assert.equal(tag,'a');return {style:{},
      click(){clicked++;},remove(){}};}
  };
  const localRegistry={...registry,articles:registry.articles.map(x=>
    x.doi===historicDoi?{...x,date:actualDate}:x)};
  const context={
    document,crypto:webcrypto,TextEncoder,Blob,
    location:{hostname:'pubs.acs.org',origin:'https://pubs.acs.org',pathname:'/doi/'+historicDoi},
    window:{
      confirm:()=>confirm,
      alert:msg=>messages.push(String(msg))
    },
    GM_registerMenuCommand(name,fn){assert.ok(name.includes('本地'));menu=fn;},
    GM_xmlhttpRequest(options){
      network++;
      assert.equal(options.method,'GET');
      assert.equal(options.url,'https://gallery.gczhouwld.com/toc-demand-live.json');
      queueMicrotask(()=>options.onload({status:200,responseText:JSON.stringify(localRegistry)}));
    },
    URL:{createObjectURL(blob){downloadBlob=blob;return 'blob:test';},revokeObjectURL(){}},
    setTimeout(){},
    console,
  };
  const source=await readFile('public/gallery-historical-text-pilot.user.js','utf8');
  assert.ok(!source.includes('/api/article-summary/fulltext/import'));
  assert.ok(!source.includes('private-pdf/import'));
  vm.runInNewContext(source,context,{timeout:3000});
  assert.equal(typeof menu,'function');
  menu();
  for(let i=0;i<12&&messages.length===0;i++)await new Promise(r=>setTimeout(r,20));
  const packet=downloadBlob?JSON.parse(await downloadBlob.text()):null;
  return {packet,clicked,network,messages};
}

test('Tampermonkey manually exports DOI-bound structured text locally without upload',async()=>{
  const {packet,clicked,network,messages}=await simulateTampermonkey();
  assert.equal(clicked,1);
  assert.equal(network,1);
  assert.ok(messages[0].includes('本地'));
  assert.equal(packet.doi,historicDoi);
  assert.equal(packet.rightsStatus,'local_only_permission_to_be_verified');
  assert.equal(packet.indexEligibility,'local_pilot_only');
  assert.equal(packet.publicUploadAllowed,false);
  assert.equal(packet.pdfDownloaded,false);
  assert.equal(packet.mediaDownloaded,false);
  assert.equal(packet.sections.length,3);
  assert.equal(packet.captions.length,1);
  assert.equal(packet.tables.length,1);
  assert.equal(packet.publication,'2026-09-14');
  const checked=validateLocalPacket(packet,registry);
  assert.equal(checked.doi,historicDoi);
  assert.ok(checked.text.includes('Ligand-to-metal charge transfer'));
  const term=evaluatePackets([checked],['lmct'])[0];
  assert.equal(term.titleHits,0);
  assert.equal(term.bodyHits,1);
  assert.equal(term.bodyOnly,1);
  const local=await mkdtemp(join(tmpdir(),'gallery-text-eval-'));
  try{
    await writeFile(join(local,'gallery-historical-test.json'),JSON.stringify(packet));
    const catalog=join(local,'catalog.json');
    await writeFile(catalog,JSON.stringify(registry));
    const output=join(local,'report.json');
    const report=await runLocal({dir:local,registryPath:catalog,output});
    assert.equal(report.validDocuments,1);
    assert.equal(report.queries.find(x=>x.term==='lmct').bodyOnly,1);
    assert.equal(report.remoteUploads,0);
    assert.ok(report.rawTextBytes>0);
    assert.ok(!(await readFile(output,'utf8')).includes('Ligand-to-metal charge transfer'));
  }finally{await rm(local,{recursive:true,force:true});}
});

test('manual consent and DOI gates fail closed',async()=>{
  assert.equal((await simulateTampermonkey({confirm:false})).clicked,0);
  assert.equal((await simulateTampermonkey({doiTags:[historicDoi,'10.1038/other']})).clicked,0);
  assert.equal((await simulateTampermonkey({actualDate:'2026-10-03'})).clicked,0);
});

test('local evaluator refuses version, rights and source hash tampering',async()=>{
  const {packet}=await simulateTampermonkey();
  assert.throws(()=>validateLocalPacket({...packet,publicUploadAllowed:true},registry),/rights/);
  assert.throws(()=>validateLocalPacket({...packet,publication:'2026-10-03'},registry),/historical/);
  assert.throws(()=>validateLocalPacket({...packet,sourceSha256:'a'.repeat(64)},registry),/hash/);
  assert.throws(()=>validateLocalPacket({...packet,doi:'10.1234/foreign'},registry),/member/);
});
