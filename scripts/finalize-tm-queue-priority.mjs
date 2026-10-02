import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const oldSort=".sort(function(a,b){return Number(a.attempts>0)-Number(b.attempts>0)||compareMissingCaptureJobs(a.job,b.job);});";
const newSort=".sort(function(a,b){return captureBatchDate(b.job).localeCompare(captureBatchDate(a.job))||journalPriority(a.job)-journalPriority(b.job)||Number(a.attempts>0)-Number(b.attempts>0)||compareMissingCaptureJobs(a.job,b.job);});";
const sourcePath='public/toc-mainline.user.js';
if(process.argv.includes('--apply')){
  for(const file of [sourcePath,'scripts/tm-queue-coverage.inc.js']){
    let text=fs.readFileSync(file,'utf8');
    if(!text.includes(newSort)){
      assert.equal(text.split(oldSort).length-1,1,file+' exact priority anchor');
      text=text.replace(oldSort,newSort);fs.writeFileSync(file,text);
    }
  }
  const text=fs.readFileSync(sourcePath,'utf8');
  const a=text.indexOf('  // Explicit user control.'),b=text.indexOf('  function completeControllerResume()',a);
  assert.ok(a>=0&&b>a);fs.writeFileSync('scripts/tm-immediate-restart-runtime.inc.js',text.slice(a,b).trimEnd()+'\n');
}
const source=fs.readFileSync(sourcePath,'utf8');
assert.ok(source.includes(newSort));
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);}
const ctx=vm.createContext({console,Map,String,Number,Boolean});
vm.runInContext(between('  function journalPriority(','  function isNatureScienceFamilyJob(')+between('  function captureBatchDate(','  function validCapturedFigure(')+between('  function coverageHasNeeds(','  function coverageNeedKey(')+between('  function coveragePending(','  function coverageStats(')+';globalThis.select=coveragePending;',ctx);
const row=(doi,addedDate,journal,attempts=0)=>({job:{doi,addedDate,journal,captureFigures:true},state:'pending',attempts});
const newestRetry=row('newest','2026-10-03','Chem',1),oldNew=row('older','2026-10-02','Nature');
assert.equal(ctx.select({coverage:new Map([['old',oldNew],['new',newestRetry]])})[0].job.doi,'newest');
const natureRetry=row('nature','2026-10-03','Nature',1),chemNew=row('chem','2026-10-03','Chem');
assert.equal(ctx.select({coverage:new Map([['chem',chemNew],['nature',natureRetry]])})[0].job.doi,'nature');
const sameGroupNew=row('fresh','2026-10-03','Nature');
assert.equal(ctx.select({coverage:new Map([['retry',natureRetry],['fresh',sameGroupNew]])})[0].job.doi,'fresh');
console.log(JSON.stringify({queuePriorityCases:3,passed:true,order:'site-addedDate then journal then same-priority first visits',productionWrites:0}));
