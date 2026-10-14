import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFullPlan} from './full-formal-body-source-coverage.mjs';
import {SCHEMA,selectMetadata,aggregateOpenAlex} from './full-formal-openalex-availability.mjs';

const catalogId='a'.repeat(64),rev='b'.repeat(64);
function plan(n=1087,size=100){
 const rows=Array.from({length:n},(_,i)=>({doi:'10.9000/test-'+String(i).padStart(5,'0'),
   journal:'JACS',date:i%19===0?'':'2026-10-10',revision:rev}));
 return makeFullPlan({architectureCatalogId:catalogId,productionCards:n,dois:rows.map(x=>x.doi)},rows,size);
}
function reports(p){
 return p.shards.map(s=>({schemaVersion:SCHEMA,catalogId:p.catalogId,planSha256:p.planSha256,
   offset:s.offset,count:s.count,entries:p.rows.slice(s.offset,s.offset+s.count)
   .map(r=>({doi:r.doi,revision:r.revision,state:'verified',tei:true,oa:true,oaLicenseSignal:'cc-by',
    openalexId:'https://openalex.org/W12345',locationLicenses:['cc-by']}))}));
}
test('full 1087 DOI ledger is complete across eleven dynamic shards',()=>{
 const p=plan(),s=aggregateOpenAlex(p,reports(p));
 assert.equal(p.shards.length,11);
 assert.equal(s.reportedDois,1087);
 assert.equal(s.teiAvailableDois,1087);
 assert.equal(s.sourceAuditComplete,true);
 assert.equal(s.doiLedger.length,1087);
 assert.equal(s.fullTextDownloads,0);
 assert.equal(s.publicBodyImports,0);
 assert.equal(s.doiLedger.some(x=>x.articleRightsApproved),false);
});
test('only DOI matched work may advertise TEI and license signal',()=>{
 const row={doi:'10.9000/match'};
 const work={doi:'https://doi.org/10.9000/match',id:'https://openalex.org/W12345',
   has_content:{grobid_xml:true},
   content_urls:{grobid_xml:'https://content.openalex.org/works/W12345.grobid-xml'},
   open_access:{is_oa:true},best_oa_location:{license:'cc-by'},
   locations:[{license:'cc-by'},{license:'cc-by-nc'}],is_retracted:false};
 const result=selectMetadata(row,work);
 assert.equal(result.state,'verified');
 assert.equal(result.tei,true);
 assert.equal(result.oa,true);
 assert.equal(result.rightsReviewRequired,true);
 assert.equal(result.xmlDownloaded,false);
 assert.deepEqual(result.locationLicenses,['cc-by','cc-by-nc']);
 assert.equal(selectMetadata(row,{...work,doi:'https://doi.org/10.9000/wrong'}).state,'metadata_doi_mismatch');
 assert.equal(selectMetadata(row,{...work,content_urls:{grobid_xml:'https://evil.example/a'}}).tei,false);
});
test('missing shards, source pauses, and revised DOI cannot claim success',()=>{
 const p=plan(205),r=reports(p);
 assert.equal(aggregateOpenAlex(p,r.slice(0,2)).sourceAuditComplete,false);
 assert.equal(aggregateOpenAlex(p,r.slice(0,2)).retryDois.length,5);
 r[1].entries[0].state='provider_paused';
 assert.equal(aggregateOpenAlex(p,r).sourceAuditComplete,false);
 r[1].entries[0].state='verified';
 r[1].entries[0].revision='invalid';
 const output=aggregateOpenAlex(p,r);
 assert.equal(output.sourceAuditComplete,false);
 assert.deepEqual(output.badShardOffsets,[100]);
});
