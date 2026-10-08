import {spawnSync} from 'node:child_process';
import {TARGET_JOURNALS} from '../shared/literature-journals.js';

const batch=Number(process.env.JOURNAL_BATCH);
const run=String(process.env.GITHUB_RUN_ID||'');
if(!Number.isInteger(batch)||batch<0||batch>3||!/^\d{7,18}$/.test(run))
 throw Error('invalid_test_batch');
const started=performance.now();
const report={schemaVersion:1,suite:'live-journal-pdf-matrix',
  batch,journals:[],networkVantage:'github-actions-not-user-China-network',
  selectionSource:'current-official-catalog-index+active-private-pdf-D1',
  allSamplesChecked:false,readyPdfFailures:0,absentPdfCount:0,
  cleanupVerified:false};
const clip=s=>String(s||'').replace(/[^a-z0-9_]/gi,'_').slice(0,75);
const readJsonLine=(value,prefix)=>{
 const line=String(value||'').split('\n').find(x=>x.startsWith(prefix+' '));
 return line?JSON.parse(line.slice(prefix.length+1)):null;
};
function runSmoke(doi,ready){
 const c=spawnSync(process.execPath,['scripts/diagnose-owner-private-pdf-authorized-smoke.mjs'],
  {env:{...process.env,PDF_TEST_DOI:doi,PDF_EXPECT_MISSING:ready?'0':'1',
       RUN_GALLERY_BROWSER:ready?'1':'0'},
   encoding:'utf8',timeout:115000,maxBuffer:2*1024*1024,
   stdio:['ignore','pipe','pipe']});
 let out=null;
 try{out=readJsonLine(c.stdout,'PRIVATE_PDF_AUTHORIZED_RESULT')}catch{}
 if(!out)return {ok:false,failure:c.error?.code==='ETIMEDOUT'?'smoke_timeout':'smoke_report_missing'};
 const result={ok:c.status===0&&out.ok===true&&out.cleanupVerified===true,
   cleanupVerified:out.cleanupVerified===true,tests:out.tests||[],
   failure:out.failure?clip(out.failure):null};
 if(!result.ok && !result.failure)result.failure='smoke_failed';
 return result;
}
function cleanup(){
 const c=spawnSync(process.execPath,
  ['scripts/diagnose-owner-private-pdf-authorized-smoke.mjs','--cleanup'],
  {env:process.env,encoding:'utf8',timeout:45000,maxBuffer:100000,
   stdio:['ignore','pipe','pipe']});
 try{
  return c.status===0&&readJsonLine(c.stdout,'PRIVATE_PDF_AUTH_CLEANUP')?.ok===true;
 }catch{return false;}
}
try{
 const d=spawnSync(process.execPath,['scripts/diagnose-pdf-journal-discovery.mjs'],
  {env:process.env,encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024,
   stdio:['ignore','pipe','pipe']});
 if(d.status!==0)throw Error('discovery_failed');
 const inventory=readJsonLine(d.stdout,'PDF_JOURNAL_DISCOVERY');
 if(!inventory?.ok||inventory.journals?.length!==TARGET_JOURNALS.length)
   throw Error('catalog_inventory_invalid');
 report.catalogGeneration=inventory.catalogGeneration;
 report.catalogCount=inventory.catalogCount;
 const subset=inventory.journals.slice(batch*4,batch*4+4);
 if(subset.length!==4)throw Error('batch_not_full');
 for(const item of subset){
   const entry={journal:item.journal,publishedCards:item.publishedCards,
     readyInCatalog:item.ready,missingInCatalog:item.missing,samples:[]};
   for(const sample of item.selection){
     const smoke=runSmoke(sample.doi,sample.ready);
     const tests=smoke.tests||[];
     const authorization=tests.find(x=>x.name==='canonical_authenticated_open');
     const alternative=tests.find(x=>x.name==='alternate_authenticated_open');
     const browser=tests.find(x=>x.name==='real_gallery_chromium_page');
     const download=tests.find(x=>x.name==='canonical_full_download');
     const pdfjs=tests.find(x=>x.name==='pdfjs_first_page');
     const missing=tests.find(x=>x.name==='expected_missing_pdf_not_stored');
     const state=smoke.ok ?
       (sample.ready && browser?.status==='ready'&&browser.firstPageRendered===true&&
        Number.isInteger(pdfjs?.pageCount)&&pdfjs.pageCount>=1&&
        Number.isInteger(download?.bytes)&&download.bytes===sample.fileBytes?
          'readable':(!sample.ready&&missing?.available===false?'not_stored':'failed'))
       :'failed';
     const record={doi:sample.doi,addedDate:sample.addedDate,
       expectedReady:sample.ready,fileBytes:sample.fileBytes,status:state,
       authorizeMs:authorization?.responseMs??null,
       alternateAuthorizeMs:alternative?.responseMs??null,
       browserReadyMs:browser?.readyMs??null,
       browserRenderedPageOne:browser?.firstPageRendered===true,
       fullDownloadMs:download?.totalMs??null,
       pdfJsPages:pdfjs?.pageCount??null,
       cleanupVerified:smoke.cleanupVerified,
       ...((state==='failed')?{failure:smoke.failure||'verification_inconsistent'}:{})
     };
     entry.samples.push(record);
     console.log('PDF_JOURNAL_SAMPLE '+JSON.stringify({batch,journal:item.journal,...record}));
     if(state==='not_stored')report.absentPdfCount++;
     if(state==='failed')report.readyPdfFailures++;
   }
   entry.tested=entry.samples.length;
   entry.readable=entry.samples.filter(x=>x.status==='readable').length;
   entry.notStored=entry.samples.filter(x=>x.status==='not_stored').length;
   entry.failed=entry.samples.filter(x=>x.status==='failed').length;
   report.journals.push(entry);
   console.log('PDF_JOURNAL_PROGRESS '+JSON.stringify({
     batch,journal:entry.journal,tested:entry.tested,
     readable:entry.readable,notStored:entry.notStored,failed:entry.failed}));
 }
}catch(e){
 report.runtimeFailure=clip(e?.message);
}
finally{
 report.cleanupVerified=cleanup();
 report.allSamplesChecked=report.journals.length===4&&
   report.journals.every(x=>x.samples.length>0)&&report.readyPdfFailures===0&&
   report.cleanupVerified&&!report.runtimeFailure;
 report.durationMs=Math.round(performance.now()-started);
 console.log('PDF_JOURNAL_BATCH_RESULT '+JSON.stringify(report));
 if(!report.allSamplesChecked)process.exitCode=1;
}
