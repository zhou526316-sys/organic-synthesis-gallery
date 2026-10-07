import fs from 'node:fs';
import { userLibraryV3RolloutBucket } from '../src/user-library-v3.js';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('usage: forecast-user-library-v3-rollout <d1-json> <output-json>');

const seed=String(process.env.ROLLOUT_SEED||'').trim();
const canary=String(process.env.CANARY_USER_ID||'').trim();
const currentBps=Number(process.env.CURRENT_ROLLOUT_BPS||0);
if(!seed) throw new Error('ROLLOUT_SEED is required');
if(!Number.isSafeInteger(currentBps)||currentBps<0||currentBps>10000) throw new Error('CURRENT_ROLLOUT_BPS invalid');

const raw=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const rows=Array.isArray(raw)?raw.flatMap(x=>x.results||[]):(raw.results||[]);
const ids=[...new Set(rows.map(row=>String(row?.id||'').trim()).filter(Boolean))];
const normalIds=ids.filter(id=>id!==canary);
const thresholds=[50,100,500,1000,2500,5000,10000];

const counts={};
for(const threshold of thresholds){
  let count=0;
  for(const id of normalIds){
    const bucket=userLibraryV3RolloutBucket(seed,id);
    if(bucket!==null&&bucket<threshold) count+=1;
  }
  counts[String(threshold)]=count;
}

const firstNonEmptyBps=thresholds.find(threshold=>counts[String(threshold)]>0)??null;
const report={
  schemaVersion:1,
  phase:'D3c4c-rollout-cohort-forecast',
  seedConfigured:true,
  currentRolloutBps:currentBps,
  totalAccounts:ids.length,
  normalAccounts:normalIds.length,
  reservedCanaryPresent:Boolean(canary&&ids.includes(canary)),
  thresholds:counts,
  firstNonEmptyBps,
  currentCohortAccounts:currentBps===10000
    ? normalIds.length
    : normalIds.filter(id=>{
        const bucket=userLibraryV3RolloutBucket(seed,id);
        return bucket!==null&&bucket<currentBps;
      }).length,
  generatedAt:new Date().toISOString(),
};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log('USER_LIBRARY_V3_ROLLOUT_FORECAST '+JSON.stringify(report));
