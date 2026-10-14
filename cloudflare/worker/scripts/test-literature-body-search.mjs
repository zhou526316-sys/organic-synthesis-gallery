import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {
  beginLiteratureCatalogGeneration,importLiteratureCatalogIndexBatch,
  finalizeLiteratureCatalogGeneration,queryLiteratureCatalogView
} from '../src/literature-catalog-index.js';
import {
  BODY_SECTION_SCHEMA,importReviewedPublicBodySections,publicBodyReadReady,
  getPublicBodyCoverage,findPublicBodyMatches
} from '../src/literature-body-search.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){let v=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(v.changes||0)}};}
  async first(){return this.db.prepare(this.sql).get(...this.args)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.args)};}
}
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  prepare(sql){return new Statement(this.sqlite,sql);}
  async batch(stmts){
    this.sqlite.exec('BEGIN');
    try{for(const s of stmts)this.sqlite.prepare(s.sql).run(...s.args);this.sqlite.exec('COMMIT');}
    catch(e){this.sqlite.exec('ROLLBACK');throw e;}
  }
  close(){this.sqlite.close();}
}
const sha=s=>createHash('sha256').update(s).digest('hex');
const GEN={catalogId:'a'.repeat(64),doiSetHash:'b'.repeat(64),sourceCommit:'c'.repeat(40),
  markerBlobSha:'d'.repeat(40),publicationSlot:'2026-10-13T08:00:00+08:00',recordCount:2};
const DOI='10.1021/jacs.6c08636',REV='1'.repeat(64);
const papers=[
  {doi:DOI,revision:REV,title:'Novel photochemistry',titleZh:'',
    authors:['Alice'],journal:'JACS',firstOnlineDate:'2026-09-14',datePrecision:'day',
    addedDate:'2026-10-12',synthesisType:'methodology'},
  {doi:'10.1038/s41586-026-00001-1',revision:'2'.repeat(64),title:'Other chemistry',
    titleZh:'',authors:['Bob'],journal:'Nature',firstOnlineDate:'2026-09-12',
    datePrecision:'day',addedDate:'2026-10-12',synthesisType:'methodology'}
];
async function fixture(t){
  const db=new D1();t.after(()=>db.close());
  const env={LITERATURE_INDEX_DB:db,LITERATURE_CATALOG_INDEX_SHADOW_ENABLED:'1',
    LITERATURE_CATALOG_INDEX_READ_ENABLED:'1'};
  assert.equal((await beginLiteratureCatalogGeneration(env,GEN)).status,200);
  assert.equal((await importLiteratureCatalogIndexBatch(env,{generation:GEN,rows:papers})).status,200);
  assert.equal((await finalizeLiteratureCatalogGeneration(env,GEN.catalogId)).status,200);
  return env;
}
function packet(){
  const sections=[{
    sectionId:'s001',type:'mechanism',heading:'Mechanistic Studies',
    text:'Ligand-to-metal charge transfer (LMCT) is supported by electrochemical spectroscopy and isolated control experiments.'
  },{
    sectionId:'s002',type:'results',heading:'Synthetic scope',
    text:'This organic synthesis method functionalizes a broad range of substrates with spectroscopy-confirmed carbon-carbon bond formations.'
  }].map(s=>({...s,sha256:sha(s.text)}));
  const sourceSha256=sha(sections.map(s=>s.sectionId+'\n'+s.heading+'\n'+s.text).join('\n\n'));
  return {schemaVersion:BODY_SECTION_SCHEMA,catalogId:GEN.catalogId,doi:DOI,revision:REV,
    origin:'independently_reviewed_public_text',publicUploadAllowed:true,
    sourceSha256,sections,completeness:'partial',
    rightsReview:{decision:'approved_public_reuse',pageDoi:DOI,sourceSha256,
      sourceKind:'publisher_article_license',itemLicenseVerified:true,
      licenseKind:'cc-by-4.0',
      licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
      articleUrl:'https://pubs.acs.org/doi/10.1021/jacs.6c08636',
      reviewedAt:new Date().toISOString(),reviewer:'Science editorial reviewer',
      reviewNote:'Article-specific primary publisher DOI and exact reuse licence independently verified.'}
  };
}
test('public body search is disabled by default and cannot silently match private data',async t=>{
  const env=await fixture(t);
  assert.equal(await publicBodyReadReady(env,GEN.catalogId),false);
  assert.equal((await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'LMCT'})).status,503);
  assert.equal((await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:'LMCT'})).body.matched,0);
});
test('private local packet, unverified rights, false DOI, revision and SHA fail before writes',async t=>{
  const env=await fixture(t),base=packet();
  const attempts=[
    {...base,origin:'browser_local_only',publicUploadAllowed:false},
    {...base,rightsReview:{...base.rightsReview,itemLicenseVerified:false}},
    {...base,rightsReview:{...base.rightsReview,licenseKind:'cc-by-nc-nd'}},
    {...base,rightsReview:{...base.rightsReview,articleUrl:'https://pubs.acs.org/doi/10.1021/jacs.other'}},
    {...base,sourceSha256:'e'.repeat(64)},
    {...base,sections:[{...base.sections[0],text:'Falsified text'}]}
  ];
  for(const payload of attempts)assert.equal((await importReviewedPublicBodySections(env,payload)).status,400);
  assert.equal((await importReviewedPublicBodySections(env,{...base,doi:papers[1].doi})).status,400);
  assert.equal((await importReviewedPublicBodySections(env,{...base,revision:'f'.repeat(64),
    rightsReview:{...base.rightsReview,sourceSha256:base.sourceSha256}})).status,409);
  const rows=env.LITERATURE_INDEX_DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='literature_body_sections_reviewed'").get();
  assert.equal(rows,undefined,'no body table should be created by rejected private data');
});
test('reviewed public CC by sections can be indexed but remain private until explicit switch',async t=>{
  const env=await fixture(t),data=packet();
  const first=await importReviewedPublicBodySections(env,data);
  assert.equal(first.status,200);assert.equal(first.body.storedSections,2);
  assert.equal(first.body.publicEnabled,false);
  const twice=await importReviewedPublicBodySections(env,data);
  assert.equal(twice.status,200);assert.equal(twice.body.alreadyReviewed,true);
  const coverage=await getPublicBodyCoverage(env,GEN.catalogId);
  assert.equal(coverage.body.verifiedDoi,1);assert.equal(coverage.body.verifiedSections,2);
  assert.equal((await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:'LMCT'})).body.matched,0);
  env.LITERATURE_BODY_SEARCH_READ_ENABLED='1';
  assert.equal(await publicBodyReadReady(env,GEN.catalogId),true);
  const search=await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:'LMCT'});
  assert.equal(search.status,200);assert.equal(search.body.matched,1);
  assert.equal(search.body.items[0].doi,DOI);
  assert.equal((await queryLiteratureCatalogView(env,{catalogId:GEN.catalogId,query:'LMCT',
    selectedJournals:['Nature']})).body.matched,0);
  const evidence=await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'LMCT'});
  assert.equal(evidence.status,200);assert.equal(evidence.body.matchedSections,1);
  assert.equal(evidence.body.items[0].evidenceType,'mechanism');
  assert.equal(evidence.body.items[0].source,'reviewed_public_body');
  assert.equal(Object.hasOwn(evidence.body.items[0],'text'),false);
  const p1=await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'spectroscopy',limit:1});
  assert.equal(p1.status,200);assert.equal(p1.body.matchedSections,2);
  assert.equal(p1.body.hasMore,true);assert.equal(p1.body.items.length,1);
  const p2=await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'spectroscopy',limit:1,
    afterDoi:p1.body.nextAfterDoi,afterSectionId:p1.body.nextAfterSectionId});
  assert.equal(p2.body.items.length,1);assert.equal(p2.body.hasMore,false);
  assert.notEqual(p1.body.items[0].sectionId,p2.body.items[0].sectionId);
  const firstPage=await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'LMCT',limit:1});
  assert.equal(firstPage.body.matchedSections,1);
  assert.equal(firstPage.body.hasMore,false);
  const allPage=await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'synthetic',limit:1});
  assert.equal(allPage.body.matchedSections,1);
  assert.equal((await findPublicBodyMatches(env,{catalogId:GEN.catalogId,query:'synthetic',
    afterDoi:'10.1021/jacs.invalid',afterSectionId:'bad'})).status,400);
  const conflict={...data,sections:[{...data.sections[0],text:'Changed scientific content with required minimum length and complete uncertainty.'.repeat(2)}]};
  conflict.sections[0].sha256=sha(conflict.sections[0].text);
  conflict.sourceSha256=sha(conflict.sections.map(s=>s.sectionId+'\n'+s.heading+'\n'+s.text).join('\n\n'));
  conflict.rightsReview={...conflict.rightsReview,sourceSha256:conflict.sourceSha256};
  assert.equal((await importReviewedPublicBodySections(env,conflict)).status,409);
});
test('25 real-structure scientific sections import atomically; truncated replay cannot pretend complete',async t=>{
  const env=await fixture(t),base=packet();
  const sections=Array.from({length:25},(_,i)=>{
    const sectionId='s'+String(i+1).padStart(3,'0');
    const type=i%2?'mechanism':'results';
    const heading='Research section '+(i+1);
    const text='Verified scientific original content with DOI-bound spectroscopy and synthesis examples. '.repeat(2)+' Section '+i;
    return {sectionId,type,heading,text,sha256:sha(text)};
  });
  const sourceSha256=sha(sections.map(s=>s.sectionId+'\n'+s.heading+'\n'+s.text).join('\n\n'));
  const payload={...base,sections,sourceSha256,
    rightsReview:{...base.rightsReview,sourceSha256}};
  const first=await importReviewedPublicBodySections(env,payload);
  assert.equal(first.status,200);assert.equal(first.body.storedSections,25);
  const coverage=await getPublicBodyCoverage(env,GEN.catalogId);
  assert.equal(coverage.body.verifiedDoi,1);assert.equal(coverage.body.verifiedSections,25);
  const repeated=await importReviewedPublicBodySections(env,payload);
  assert.equal(repeated.status,200);assert.equal(repeated.body.alreadyReviewed,true);
  env.LITERATURE_INDEX_DB.sqlite.prepare('DELETE FROM literature_body_sections_reviewed WHERE catalog_id=? AND doi=? AND section_id=?')
    .run(GEN.catalogId,DOI,'s025');
  const incomplete=await importReviewedPublicBodySections(env,payload);
  assert.equal(incomplete.status,409);assert.equal(incomplete.body.error,'body_reviewed_source_conflict');
});
test('source-size and section-limit constraints never become partial public science',async t=>{
  const env=await fixture(t),base=packet();
  const mk=(n,chars)=>Array.from({length:n},(_,i)=>{
    const text=('A'.repeat(chars-3))+String(i).padStart(3,'0');
    return {sectionId:'s'+String(i+1).padStart(3,'0'),type:'results',
      heading:'Experimental results '+i,text,sha256:sha(text)};
  });
  for(const sections of [mk(33,120),mk(20,15000)]){
    const sourceSha256=sha(sections.map(s=>s.sectionId+'\n'+s.heading+'\n'+s.text).join('\n\n'));
    const x={...base,sections,sourceSha256,
      rightsReview:{...base.rightsReview,sourceSha256}};
    assert.equal((await importReviewedPublicBodySections(env,x)).status,400);
  }
  const coverage=await getPublicBodyCoverage(env,GEN.catalogId);
  assert.equal(coverage.body.verifiedDoi,0);
});
test('unauthorized importer route and disabled public endpoint preserve least privilege',async t=>{
  const env=await fixture(t);env.BRIDGE_WRITE_TOKEN='test-only-local-bearer';
  const worker=(await import('../src/index.js')).default;
  const body=JSON.stringify(packet());
  const unauthorized=await worker.fetch(new Request('https://api.gczhouwld.com/api/admin/literature-body-sections/import',{
    method:'POST',headers:{'content-type':'application/json'},body
  }),env,{waitUntil(){}});
  assert.equal(unauthorized.status,401);
  const publicQuery=await worker.fetch(new Request('https://api.gczhouwld.com/api/literature/body-matches?catalogId='+
    GEN.catalogId+'&q=LMCT'),env,{waitUntil(){}});
  assert.equal(publicQuery.status,503);
});
