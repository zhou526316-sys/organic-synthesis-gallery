import fs from 'node:fs';

const mode=String(process.argv[2]||'').trim();
const base=String(process.env.WORKER_URL||'').replace(/\/$/,'');
const reportPath=process.env.REPORT_PATH||'/tmp/user-library-v3-write-activation.json';

if(!base) throw new Error('WORKER_URL is required');
if(!['preflight','canary'].includes(mode)) throw new Error('mode must be preflight or canary');

const report={
  schemaVersion:1,
  phase:'D3c4b-user-library-v3-write-activation',
  mode,
  ok:false,
  startedAt:new Date().toISOString(),
};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
save();

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function call(path,{method='GET',headers={},body}={},attempts=5){
  let last=null;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{
      const response=await fetch(base+path,{
        method,
        headers:{'cache-control':'no-cache',pragma:'no-cache',...headers},
        body,
        signal:AbortSignal.timeout(30000),
      });
      const text=await response.text();
      let parsed={};try{parsed=text?JSON.parse(text):{};}catch{}
      last={ok:response.ok,status:response.status,body:parsed,text:text.slice(0,1200)};
      if(response.status<500)return last;
    }catch(error){
      last={ok:false,status:0,body:{},text:String(error?.message||error)};
    }
    await sleep(750*attempt);
  }
  return last;
}

function assert(condition,message,context){
  if(condition)return;
  const suffix=context===undefined?'':' '+JSON.stringify(context);
  throw new Error(message+suffix);
}

async function admin(path,method='GET'){
  const token=String(process.env.BRIDGE_WRITE_TOKEN||'');
  assert(token,'BRIDGE_WRITE_TOKEN is required');
  const result=await call(path,{method,headers:{authorization:`Bearer ${token}`}});
  assert(result?.ok,path+' failed',result);
  return result.body;
}

async function fullCompare(path,total){
  let offset=0;
  let checked=0;
  let mismatched=0;
  const reasons={};
  for(let pageNo=0;pageNo<500;pageNo+=1){
    const page=await admin(`${path}?offset=${offset}&limit=50`);
    checked+=Number(page.checked||0);
    mismatched+=Number(page.mismatched||0);
    for(const [key,value] of Object.entries(page.reasons||{})){
      reasons[key]=Number(reasons[key]||0)+Number(value||0);
    }
    if(page.complete===true)break;
    const next=Number(page.nextOffset);
    assert(Number.isSafeInteger(next)&&next>offset,'compare cursor stalled',page);
    offset=next;
  }
  assert(checked===Number(total||0),'compare did not cover all accounts',{checked,total});
  assert(mismatched===0,'semantic mismatch',{mismatched,reasons});
  return {checked,mismatched,reasons};
}

async function preflight(){
  const v3=await admin('/api/admin/user-library-v3/status');
  assert(v3.configured===true,'V3 shadow must stay configured for rollback',v3);
  assert(v3.enabled===true,'V3 shadow must be active before write cutover',v3);
  assert(v3.readEnabled===true,'V3 bounded read must be active before cutover',v3);
  assert(v3.writeEnabled===false,'V3 write must still be disabled before cutover',v3);
  assert(Number(v3.revisionMismatches||0)===0,'V3 revision mismatch before cutover',v3);
  assert(Number(v3.legacyUsers||0)===Number(v3.v3Heads||0),'V3 head coverage incomplete',v3);
  assert(v3.backfill?.complete===true,'V3 historical backfill incomplete',v3);
  const v3Compare=await fullCompare('/api/admin/user-library-v3/compare',v3.legacyUsers);

  const rows=await admin('/api/admin/user-library-shadow/status');
  assert(rows.configured===true,'D3b compatibility shadow must stay configured for rollback',rows);
  assert(rows.enabled===true,'D3b legacy shadow must be active before cutover',rows);
  assert(rows.readConfigured===true&&rows.readPathActive===true,'D3b row reads must be active before cutover',rows);
  assert(Number(rows.revisionMismatches||0)===0,'D3b revision mismatch before cutover',rows);
  const rowCompare=await fullCompare('/api/admin/user-library-shadow/compare',rows.legacyUsers);

  report.ok=true;
  report.writeBefore=false;
  report.v3={legacyUsers:Number(v3.legacyUsers||0),v3Heads:Number(v3.v3Heads||0),compare:v3Compare};
  report.rows={legacyUsers:Number(rows.legacyUsers||0),shadowHeads:Number(rows.shadowHeads||0),compare:rowCompare};
  report.completedAt=new Date().toISOString();
}

async function api(payload){
  const token=String(process.env.CANARY_TOKEN||'');
  assert(token,'CANARY_TOKEN is required');
  const result=await call('/api/user-ui/reader-counts',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({...payload,sessionToken:token}),
  });
  return result;
}

function validGlobal(hideRead=false){
  return {
    statuses:[{id:'deep',name:'Canary deep'}],
    quickTerms:[],
    collections:[],
    aliases:[],
    actionStyles:{},
    followedSearches:[],
    searchHistory:[],
    hideRead,
  };
}

async function canary(){
  const userId=String(process.env.CANARY_USER_ID||'');
  assert(userId,'CANARY_USER_ID is required');

  const health=await call('/api/_healthcheck?d3c4b='+Date.now());
  assert(health?.ok&&health.body?.ok===true,'healthcheck failed',health);
  assert(health.body.userLibraryV3ReadEnabled===true,'V3 read not enabled',health.body);
  assert(health.body.userLibraryV3WriteEnabled===true,'V3 write not enabled',health.body);
  assert(health.body.userLibraryV3ShadowEnabled===false,'legacy-to-V3 shadow must be disabled under V3 authority',health.body);
  assert(health.body.userLibraryRowReadEnabled===true,'D3b compatibility reader must stay enabled',health.body);
  assert(health.body.userLibraryRowShadowEnabled===false,'legacy-to-D3b shadow must be disabled under V3 authority',health.body);

  const head0=await api({mode:'account-v3-head'});
  assert(head0.ok,'initial V3 head failed',head0);
  assert(head0.body?.account?.userId===userId,'initial head user mismatch',head0.body);
  assert(head0.body?.account?.writeEnabled===true,'initial head did not expose write authority',head0.body);
  assert(Number(head0.body?.account?.revision||0)===0,'initial revision is not zero',head0.body);

  const keyA='10.9999/d3c4b-canary-a';
  const keyB='10.9999/d3c4b-canary-b';
  const first=await api({
    mode:'account-v3-mutate',
    expectedRevision:0,
    globalState:validGlobal(false),
    operations:[
      {
        paperKey:keyA,
        paperState:{favorite:true,collections:[],note:'before',quickTerms:[],tags:[],updatedAt:1},
        metadata:{id:keyA,doi:keyA,title:'Canary A',journal:'JACS'},
      },
      {
        paperKey:keyB,
        paperState:{favorite:true,collections:[],note:'delete-me',quickTerms:[],tags:[],updatedAt:1},
        metadata:{id:keyB,doi:keyB,title:'Canary B',journal:'Angew'},
      },
    ],
  });
  assert(first.ok,'initial mutation failed',first);
  assert(first.body?.account?.readPath==='v3-mutate','initial mutation wrong path',first.body);
  assert(first.body?.account?.writeEnabled===true,'initial mutation write flag false',first.body);
  assert(Number(first.body?.account?.revision)===1,'initial mutation revision invalid',first.body);
  assert(Number(first.body?.account?.paperCount)===2&&Number(first.body?.account?.metadataCount)===2,'initial counts invalid',first.body);

  const page1=await api({mode:'account-v3-page',afterKey:'',limit:1});
  assert(page1.ok,'V3 first page failed',page1);
  assert(page1.body?.account?.writeEnabled===true,'page write authority missing',page1.body);
  assert(Number(page1.body?.account?.count)===1&&page1.body?.account?.hasMore===true,'first page pagination invalid',page1.body);
  const nextKey=String(page1.body?.account?.nextKey||'');
  assert(nextKey,'first page cursor missing',page1.body);
  const page2=await api({mode:'account-v3-page',afterKey:nextKey,limit:1});
  assert(page2.ok,'V3 second page failed',page2);
  assert(Number(page2.body?.account?.count)===1&&page2.body?.account?.hasMore===false,'second page pagination invalid',page2.body);

  const delta0=await api({mode:'account-v3-delta',sinceRevision:0,limit:10});
  assert(delta0.ok,'initial delta failed',delta0);
  assert(delta0.body?.account?.resetRequired===false,'initial delta unexpectedly reset',delta0.body);
  assert(Number(delta0.body?.account?.targetRevision)===1,'initial delta target invalid',delta0.body);
  assert((delta0.body?.account?.changes||[]).length===2,'initial delta change count invalid',delta0.body);
  assert(delta0.body?.account?.globalState?.hideRead===false,'initial delta global state missing',delta0.body);

  const compat1=await api({mode:'account-pull'});
  assert(compat1.ok,'compatibility pull after first mutation failed',compat1);
  assert(compat1.body?.account?.readPath==='rows-v3-compat','compatibility pull did not use D3b rows',compat1.body);
  assert(Number(compat1.body?.account?.revision)===1,'compatibility revision invalid',compat1.body);
  assert(Object.keys(compat1.body?.account?.state?.papers||{}).length===2,'compatibility paper count invalid',compat1.body);

  const conflict=await api({
    mode:'account-v3-mutate',
    expectedRevision:0,
    operations:[{paperKey:keyA,paperState:{favorite:true,note:'stale'},metadata:{id:keyA,title:'Stale'}}],
  });
  assert(conflict.status===409,'stale mutation did not conflict',conflict);
  assert(conflict.body?.error==='user_library_v3_revision_conflict','stale mutation error invalid',conflict.body);
  assert(Number(conflict.body?.currentRevision)===1,'stale conflict revision invalid',conflict.body);

  const second=await api({
    mode:'account-v3-mutate',
    expectedRevision:1,
    globalState:validGlobal(true),
    operations:[
      {
        paperKey:keyA,
        paperState:{favorite:true,collections:[],note:'after',quickTerms:[],tags:[],updatedAt:2},
        metadata:{id:keyA,doi:keyA,title:'Canary A',journal:'JACS'},
      },
      {paperKey:keyB,delete:true},
    ],
  });
  assert(second.ok,'second mutation failed',second);
  assert(Number(second.body?.account?.revision)===2,'second mutation revision invalid',second.body);
  assert(Number(second.body?.account?.paperCount)===1&&Number(second.body?.account?.metadataCount)===1,'second counts invalid',second.body);

  const delta1=await api({mode:'account-v3-delta',sinceRevision:1,limit:10});
  assert(delta1.ok,'second delta failed',delta1);
  assert(Number(delta1.body?.account?.targetRevision)===2,'second delta target invalid',delta1.body);
  const changes=delta1.body?.account?.changes||[];
  assert(changes.length===2,'second delta change count invalid',delta1.body);
  assert(changes.some(row=>row.paperKey===keyB&&row.op==='delete'),'delete tombstone absent from delta',delta1.body);
  assert(delta1.body?.account?.globalState?.hideRead===true,'second delta global state invalid',delta1.body);

  const compat2=await api({mode:'account-pull'});
  assert(compat2.ok,'compatibility pull after delete failed',compat2);
  assert(compat2.body?.account?.readPath==='rows-v3-compat','second compatibility pull wrong path',compat2.body);
  assert(Number(compat2.body?.account?.revision)===2,'second compatibility revision invalid',compat2.body);
  assert(Object.keys(compat2.body?.account?.state?.papers||{}).length===1,'deleted paper remained in compatibility state',compat2.body);
  assert(compat2.body?.account?.state?.papers?.[keyA]?.note==='after','updated paper missing in compatibility state',compat2.body);
  assert(compat2.body?.account?.state?.hideRead===true,'global state missing from compatibility state',compat2.body);

  const legacySave=await api({
    mode:'account-save',
    revision:2,
    state:compat2.body.account.state,
  });
  assert(legacySave.status===409,'legacy save was not rejected after V3 activation',legacySave);
  assert(legacySave.body?.error==='user_library_client_upgrade_required','legacy save rejection invalid',legacySave.body);

  report.ok=true;
  report.userId=userId;
  report.health={
    rowShadow:health.body.userLibraryRowShadowEnabled,
    rowRead:health.body.userLibraryRowReadEnabled,
    v3Shadow:health.body.userLibraryV3ShadowEnabled,
    v3Read:health.body.userLibraryV3ReadEnabled,
    v3Write:health.body.userLibraryV3WriteEnabled,
  };
  report.revisions=[0,1,2];
  report.compatibilityReadPath=compat2.body.account.readPath;
  report.deltaDeleteObserved=true;
  report.legacySaveRejected=true;
  report.completedAt=new Date().toISOString();
}

try{
  if(mode==='preflight')await preflight();
  else await canary();
  save();
  console.log('USER_LIBRARY_V3_WRITE_ACTIVATION '+JSON.stringify(report));
}catch(error){
  report.error=String(error?.message||error).slice(0,2000);
  report.failedAt=new Date().toISOString();
  save();
  throw error;
}
