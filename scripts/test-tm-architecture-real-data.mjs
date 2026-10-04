import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHash, webcrypto } from 'node:crypto';

const root=process.argv[2]||'public/architecture-v1';
const releaseText=fs.readFileSync(path.join(root,'release.json'),'utf8');
const release=JSON.parse(releaseText);
const readRef=ref=>fs.readFileSync(path.join(root,ref.path),'utf8');
const membershipText=readRef(release.membership);
const currentText=readRef(release.catalogCurrent);
const acquisitionText=readRef(release.acquisitionBasis);
const current=JSON.parse(currentText);
const lifecycleText=readRef(current.lifecycle);
const queue=JSON.parse(fs.readFileSync('public/toc-demand-live.json','utf8'));
const sha=text=>createHash('sha256').update(text).digest('hex');
const delivery={schemaVersion:2,sourceCommit:release.sourceCommit,publicationSlot:release.publicationSlot,
  productionCards:release.recordCount,datasetSha256:release.datasetSha256,architectureCatalogId:release.catalogId,
  files:{'architecture-v1/release.json':sha(releaseText)},architectureObjects:{}};

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
const begin=source.indexOf('// BEGIN ARCHITECTURE MEMBERSHIP CORE v1');
const end=source.indexOf('// END ARCHITECTURE MEMBERSHIP CORE v1');
assert.ok(begin>0&&end>begin);
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,URL,Set,Map,JSON,Number,String,Array,Object,Boolean,Error,Date,
  ARCHITECTURE_MEMBERSHIP_REVISION:'fixture-production-v2',
  normalizeDoi(value){let s=String(value||'').trim().toLowerCase();try{s=decodeURIComponent(s)}catch{}
    s=s.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
    return /^10\.\d{4,9}\/\S+$/i.test(s)?s:'';}
});
vm.runInContext(source.slice(begin,end),ctx);
const verify=vm.runInContext('verifyArchitectureMembershipPayload',ctx);
const result=await verify(queue,delivery,releaseText,membershipText,currentText,lifecycleText,acquisitionText,release.asOfDate);
assert.equal(result.ok,true);
assert.equal(result.memberCount,release.recordCount);
assert.equal(result.activeCount+result.inactiveCount,release.recordCount);
assert.equal(new Set(result.memberDois).size,release.recordCount);
assert.equal(result.hotCount,JSON.parse(lifecycleText).partitions.hot.length);

const broken=acquisitionText.slice(0,-2)+' }\n';
await assert.rejects(
  verify(queue,delivery,releaseText,membershipText,currentText,lifecycleText,broken,release.asOfDate),
  /architecture_acquisition_hash_mismatch/
);
console.log('ARCHITECTURE_ACTIVE_REAL_DATA_PASS '+JSON.stringify({
  records:result.memberCount,hot:result.hotCount,archive:result.archiveCount,
  recentHistoricalAdditions:result.recentAdditionCount,active:result.activeCount,
  cutoff:result.cutoff,catalogId:result.catalogId,tamperRejected:true
}));
