import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {isExcludedDoi} from '../../shared/literature-policy.js';
import {TARGET_JOURNALS} from '../../shared/literature-journals.js';
const pub=new URL('../../public/',import.meta.url);
const read=async n=>JSON.parse(await readFile(new URL(n,pub),'utf8'));
const normalize=v=>String(v||'').toLowerCase().trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/[?#].*$/,'');
export async function writeRecoveryQueue(){
 const encoded=await readFile(new URL('papers.gz.b64',pub),'utf8');
 const base=JSON.parse(gunzipSync(Buffer.from(encoded.trim(),'base64')).toString('utf8'));
 if(!Array.isArray(base))throw new Error('published_corpus_invalid');
 const rows=base.slice();
 for(const n of ['total-synthesis','manual-supplement','final-audit-supplement','curated-supplement','automation-supplement','rolling-supplement','literature-supplement']){
  const p=await read(n+'.json');if(!Array.isArray(p.papers))throw new Error('published_papers_missing:'+n);rows.push(...p.papers);
 }
 const map=new Map(),journals=new Set(TARGET_JOURNALS.map(j=>j.name));
 for(const p of rows){
  const doi=normalize(p.doi||p.url);let journal=p.journal||'';if(/^Angew/i.test(journal))journal='Angew';
  if(!/^10\.\d{4,9}\/\S+$/.test(doi)||isExcludedDoi(doi)||!journals.has(journal))continue;
  map.set(doi,{doi,journal,date:p.date||'',title:p.title||'',publisher:doi.startsWith('10.1021/')?'acs':doi.startsWith('10.1002/')?'wiley':doi.startsWith('10.1038/')?'nature':doi.startsWith('10.1126/')?'science':doi.startsWith('10.1039/')?'rsc':doi.startsWith('10.1016/')?'elsevier':'ccs'});
 }
 if(map.size<100)throw new Error('published_corpus_incomplete');
 const allPapers=[...map.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.doi.localeCompare(b.doi));
 const manifest=await read('media-index.json');if(!manifest.items)throw new Error('published_media_manifest_missing');
 const visibleGaps=[],officialUpgrades=[],figureGaps=[];
 for(const p of allPapers){const r=manifest.items[p.doi]||{},toc=r.toc||{},figs=r.figures?.figures||[];const official=!!(toc.available&&toc.imageUrl&&!/fallback/i.test(toc.reason||''));
  if(!official)(toc.available||figs.length?officialUpgrades:visibleGaps).push({...p,state:toc.available||figs.length?'fallback_only':'no_visual',mediaNeed:'toc+figures'});
  // A couple of figures is not proof that a paper's complete figure set was collected.
  figureGaps.push({...p,figureCount:figs.length,mediaNeed:'figures',state:'figure_gap'});
 }
 const corpusVersion=createHash('sha256').update(allPapers.map(p=>p.doi).sort().join('\n')).digest('hex').slice(0,24);
 const queue={version:3,mediaGeneration:1790082000000,captureVersion:'6.2.20',generatedAt:new Date().toISOString(),corpusVersion,webpageDoiCount:allPapers.length,visibleGapTotal:visibleGaps.length,officialUpgradeTotal:officialUpgrades.length,missingOfficialTotal:visibleGaps.length+officialUpgrades.length,figureGapTotal:figureGaps.length,allPapers,visibleGaps,officialUpgrades,figureGaps};
 await writeFile(new URL('toc-demand-live.json',pub),JSON.stringify(queue));
 console.log('TM_RECOVERY_QUEUE '+JSON.stringify({corpusVersion,papers:allPapers.length,missingToc:queue.missingOfficialTotal,remainingNoVisual:visibleGaps.length,figureScanCandidates:figureGaps.length,literatureMutations:0}));
 return queue;
}
