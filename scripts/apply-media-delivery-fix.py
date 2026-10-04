"""Narrow runtime repair. Never modifies policy, schedules, literature or stored media."""
from pathlib import Path
r=Path(__file__).resolve().parents[1]
def change(name,before,after):
 p=r/name;s=p.read_text()
 if before not in s and after in s:return
 if s.count(before)!=1:raise RuntimeError(f'{name}: expected one anchor {s.count(before)}: {before[:90]}')
 p.write_text(s.replace(before,after,1))
for name in ['cloudflare/scripts/build-pages-mirror.mjs','cloudflare/scripts/merge-worker-media.mjs']:
 change(name,"  if (type === 'image/png') return 'png';","  if (type === 'image/svg+xml') return 'svg';\n  if (type === 'image/png') return 'png';")
 change(name,"if (['png', 'webp', 'gif', 'avif', 'jpg', 'jpeg'].includes(ext || ''))", "if (['svg', 'png', 'webp', 'gif', 'avif', 'jpg', 'jpeg'].includes(ext || ''))")
name='cloudflare/worker/src/local-captures.js'
change(name,"import { storeVerifiedStage }", "import { publicationPage } from './publication-pagination.js';\nimport { storeVerifiedStage }")
helper="""// A successful body packet survives later TOC-only/failed diagnostics. It is
// evidence only: existing per-image marker/hash/DOI/TOC/atomic gates still decide.
function completedFigurePacket(row) {
  return Boolean(row && normalizeDoi(row.doi) && row.captureVersion==='6.2.20'
    && row.final===true && row.status==='success' && String(row.mediaNeed||'').includes('figures')
    && /^[a-z0-9-]{16,80}$/i.test(String(row.jobId||''))
    && Number(row.updatedAt)>=MEDIA_REBUILD_EPOCH
    && Number(row.figuresDiscovered)>0 && Number(row.figuresStored)===Number(row.figuresDiscovered)
    && captureBelongsToDoi(row,normalizeDoi(row.doi)));
}
function latestCompletedFigurePacket(item) {
  return [item?.completedFigurePacket,item,...(item?.attempts||[])]
    .filter(completedFigurePacket).sort((a,b)=>Number(b.updatedAt)-Number(a.updatedAt))[0]||null;
}
function publicationReportRows(index) {
  return Object.values(index.items||{}).map(latestCompletedFigurePacket).filter(Boolean)
    .map(p=>({doi:p.doi,jobId:p.jobId,captureVersion:p.captureVersion,controllerRevision:p.controllerRevision,
      mediaNeed:p.mediaNeed,final:p.final,status:p.status,tocStatus:p.tocStatus,
      figuresDiscovered:p.figuresDiscovered,figuresStored:p.figuresStored,figureLabels:p.figureLabels||[],
      articleUrl:p.articleUrl,sourceUrl:p.sourceUrl,updatedAt:p.updatedAt,finishedAt:p.finishedAt}))
    .sort((a,b)=>a.doi.localeCompare(b.doi));
}

"""
change(name,'function reportAttemptSummary(report, reportKey, attemptId) {',helper+'function reportAttemptSummary(report, reportKey, attemptId) {')
change(name,'    attempts: recentAttempts,\n    updatedAt: now,','    attempts: recentAttempts,\n    completedFigurePacket: latestCompletedFigurePacket({...previous,attempts}),\n    updatedAt: now,')
change(name,"export async function getTampermonkeyReports(request, env) {", "export async function getTampermonkeyReports(request, env) {\n  if(new URL(request.url).searchParams.get('publication')==='1')\n    return publicationPage(request,env,TAMPERMONKEY_REPORT_INDEX_KEY,'reports',publicationReportRows);")
change(name,"export async function getStagedArticleFigures(request, env) {", """export async function getStagedArticleFigures(request, env) {
  if(new URL(request.url).searchParams.get('publication')==='1')
    return publicationPage(request,env,ARTICLE_FIGURE_STAGE_INDEX_KEY,'stage',index=>Object.values(index.items||{})
      .filter(item=>{const doi=normalizeDoi(item?.doi);return doi&&Number(item.updatedAt)>=MEDIA_REBUILD_EPOCH&&captureBelongsToDoi(item,doi);})
      .sort((a,b)=>String(a.doi).localeCompare(String(b.doi))||String(a.id).localeCompare(String(b.id))));""")
name='cloudflare/scripts/merge-new-body-auto.mjs'
change(name,"import {readFile,writeFile,mkdir}", "import {readPublicationPages} from './read-publication-pages.mjs';\nimport {readFile,writeFile,mkdir}")
change(name,"try{stage=JSON.parse(await fetchStored(WORKER+'/api/article-figures/staged'));requireBody(Array.isArray(stage.items)&&stage.count===stage.items.length&&stage.count<=2000,'auto_stage_truncated_or_invalid');}","try{stage=await readPublicationPages(WORKER+'/api/article-figures/staged','stage',fetchStored);}")
change(name,"try{reports=JSON.parse(await fetchStored(WORKER+'/api/media/tampermonkey-reports?limit=200'));requireBody(Array.isArray(reports.items)&&reports.items.length<=200,'auto_report_index_invalid');}","try{reports=await readPublicationPages(WORKER+'/api/media/tampermonkey-reports','reports',fetchStored);}")
change(name,"    const gate=adaptiveBatchGate(rows,policy,Date.now());", """    const gate=adaptiveBatchGate(rows,policy,Date.now());
    const inputError=inputs.stageError||inputs.localCaptureError||inputs.reportError;
    if(inputError){
      console.error('NEW_BODY_AUTO_INPUT_ERROR '+JSON.stringify({ready:false,mode:'input_error',count:null,articles:null,stageError:inputs.stageError,localCaptureError:inputs.localCaptureError,reportError:inputs.reportError}));
      if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,'changed=false\\nmode=input_error\\n',{flag:'a'});
      process.exitCode=1;
    }else{""")
change(name,"  }else await mergeNewBodyAuto();", "    }\n  }else await mergeNewBodyAuto();")
print('Applied media delivery repair; policy, schedules, corpus and collector remain unchanged.')
