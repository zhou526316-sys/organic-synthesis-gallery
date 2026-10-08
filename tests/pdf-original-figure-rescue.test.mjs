import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {
 PDF_RESCUE_SCAN_LIMIT,normalizePdfRescueDoi,inspectPdfDoiIdentity,
 scanPdfFigureRescue,preparePdfOriginalCropManifest,
} from '../src/pdf-vault/figure-rescue.mjs';
const DOI='10.1021/acscatal.6c06279';

const item=(str,x=45,y=600)=>({str,height:10,transform:[1,0,0,1,x,y]});
function pdfFixture({pages=3,doi=DOI,figureOnlyOn=2}={}){
 let visited=0;
 const pdf={
   numPages:pages,
   getMetadata:async()=>({info:{Title:'Synthetic PDF figure audit',Keywords:''}}),
   getPage:async n=>{
     visited++;
     return {getTextContent:async()=>{
       if(n===1)return {items:[item('Publisher manuscript',40,730),item('doi: '+doi,45,700)]};
       if(n===figureOnlyOn)return {items:[
         item('Figure',45,700),item('1. Catalytic reaction',85,700),
         item('Scheme 2. Substrate scope',45,550),
         item('Catalyst ligand discussion',45,340),
         item('Graphical Abstract',45,200),
       ]};
       return {items:[item('Ordinary body text without image caption',45,500)]};
     }};
   }};
 };
 return {pdf,visited:()=>visited};
}

test('finds only original caption hints on the correct PDF pages; does not auto-publish',async()=>{
 const x=pdfFixture(),out=await scanPdfFigureRescue(x.pdf,{doi:DOI});
 assert.equal(out.identity,'match');
 assert.equal(out.scannedPages,3);
 assert.equal(out.publishableAutomatically,false);
 assert.equal(out.requiresManualCrop,true);
 assert.deepEqual(out.candidates.map(x=>x.label),['Figure 1','Scheme 2','Graphical Abstract']);
 assert.ok(out.candidates.every(x=>x.page===2&&x.reviewStatus==='needs_manual_crop_and_verification'));
});

test('PDF with different DOI has no eligible image candidates',async()=>{
 const x=pdfFixture({doi:'10.1021/acscatal.6c00001'});
 const result=await scanPdfFigureRescue(x.pdf,{doi:DOI});
 assert.equal(result.identity,'mismatch');
 assert.equal(result.candidates.length,0);
});

test('no PDF DOI remains unverified, never creates a trusted production record',async()=>{
 const v={numPages:2,getMetadata:async()=>({info:{}}),
   getPage:async i=>({getTextContent:async()=>({items:[item(i===1?'Article title':'Figure 1. Demonstration')]} )})};
 const out=await scanPdfFigureRescue(v,{doi:DOI});
 assert.equal(out.identity,'unverified');
 assert.equal(out.candidates.length,1);
 assert.equal(out.publishableAutomatically,false);
});

test('page bounds protect performance and use no other publisher-network requests',async()=>{
 const x=pdfFixture({pages:110,figureOnlyOn:108});
 const out=await scanPdfFigureRescue(x.pdf,{doi:DOI,limit:999});
 assert.equal(x.visited(),PDF_RESCUE_SCAN_LIMIT);
 assert.equal(out.candidates.length,0);
 assert.equal(out.completeScan,false);
 const progress=[];
 const y=pdfFixture({pages:4});
 await scanPdfFigureRescue(y.pdf,{doi:DOI,onProgress:r=>progress.push(r.scannedPages)});
 assert.deepEqual(progress,[1,2,3,4]);
});

test('normalization handles canonical publisher DOIs but rejects invalid filenames',()=>{
 assert.equal(normalizePdfRescueDoi('https://doi.org/10.1021/acscatal.6c06279'),DOI);
 assert.equal(inspectPdfDoiIdentity(DOI,'doi: '+DOI,{}),'match');
 assert.equal(inspectPdfDoiIdentity(DOI,'Figure 1. Catalytic cycle',{}),'unverified');
 assert.equal(normalizePdfRescueDoi('pdf-id-without-doi'),'');
});

test('crop manifest records real-page provenance and forbids automatic public publishing',()=>{
 const m=preparePdfOriginalCropManifest({
  doi:DOI,identity:'match',candidate:{page:2,kind:'figure1',label:'Figure 1',caption:'Figure 1. Catalytic cycle'},
  crop:{x:0.12,y:0.21,width:0.72,height:0.41},
  canvasWidth:1150,canvasHeight:645,sha256:'a'.repeat(64)});
 assert.equal(m.sourcePage,2);
 assert.equal(m.automaticallyPublishable,false);
 assert.equal(m.publisherReusePermissionVerified,false);
 assert.equal(m.sourcePdfBytesExported,false);
 assert.equal(m.reviewStatus,'requires_scientific_visual_review');
 assert.equal(m.sha256,'a'.repeat(64));
});

test('invalid crop geometry and misidentified candidate are hard rejected',()=>{
 const valid={doi:DOI,candidate:{page:1,kind:'figure1',label:'Figure 1',caption:'x'},
   crop:{x:.2,y:.2,width:.5,height:.4},canvasWidth:200,canvasHeight:200,sha256:'b'.repeat(64)};
 assert.throws(()=>preparePdfOriginalCropManifest({...valid,crop:{...valid.crop,width:1.2}}),/out_of_bounds/);
 assert.throws(()=>preparePdfOriginalCropManifest({...valid,candidate:{page:0,kind:'figure1'}}),/invalid_candidate/);
 assert.throws(()=>preparePdfOriginalCropManifest({...valid,sha256:'short'}),/hash_invalid/);
});

test('PDF reader UI enables exact raster crop export but never direct public import',()=>{
 const html=fs.readFileSync('pdf/index.html','utf8');
 const script=fs.readFileSync('src/private-pdf-reader.mjs','utf8');
 assert.ok(html.includes('id="pdf-figure-rescue"')&&html.includes('id="pdf-crop-select"'));
 assert.ok(script.includes('scanPdfFigureRescue('));
 assert.ok(script.includes('preparePdfOriginalCropManifest('));
 assert.ok(script.includes("drawImage(canvas,rect.x,rect.y,rect.width,rect.height"));
 assert.ok(fs.readFileSync('src/pdf-vault/figure-rescue.mjs','utf8').includes('sourcePdfBytesExported:false'));
 assert.ok(!script.includes('/api/media/local-capture/import'));
 assert.ok(!script.includes('/api/article-figures/stage'));
});
