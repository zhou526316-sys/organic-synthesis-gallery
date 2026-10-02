function compactStageCaptureInventory(index, reports) {
  const byDoi=new Map();
  function row(doi){if(!byDoi.has(doi))byDoi.set(doi,{doi,figures:{},expectedFigureCount:0,observedAt:0});return byDoi.get(doi);}
  for(const entry of Object.values(index.items||{})){
    const doi=normalizeDoi(entry?.doi);
    if(!doi||entry.captureVersion!=='6.2.20'||Number(entry.mediaGeneration)!==MEDIA_REBUILD_EPOCH||Number(entry.updatedAt)<MEDIA_REBUILD_EPOCH||entry.pageDoi!==doi||!entry.r2Key||!entry.contentHash||!entry.sourceUrl||!captureBelongsToDoi(entry,doi))continue;
    const w=Number(entry.width||0),h=Number(entry.height||0);
    const usable=w>0&&h>0&&(entry.contentType==='image/svg+xml'||(Math.max(w,h)>=600&&Math.min(w,h)>=140&&w*h>=120000));
    if(!usable)continue;
    const label=safeText(entry.label,80);if(!label)continue;
    const target=row(doi),old=target.figures[label];
    if(!old||Number(entry.updatedAt)>old.updatedAt)target.figures[label]={label,sourceUrl:safeUrl(entry.sourceUrl),contentHash:entry.contentHash,width:w,height:h,quality:entry.contentType==='image/svg+xml'?'vector':'usable',updatedAt:Number(entry.updatedAt)};
  }
  for(const report of Object.values(reports.items||{})){
    const doi=normalizeDoi(report?.doi);if(!doi)continue;
    for(const attempt of [report,...(report.attempts||[])]){
      if(attempt.captureVersion!=='6.2.20'||attempt.final!==true||Number(attempt.updatedAt)<MEDIA_REBUILD_EPOCH||!/(?:figures)/.test(String(attempt.mediaNeed||''))||!captureBelongsToDoi(attempt,doi))continue;
      const count=Math.max(0,Number(attempt.figuresDiscovered||0));
      if(count){const target=row(doi);target.expectedFigureCount=Math.max(target.expectedFigureCount,count);target.observedAt=Math.max(target.observedAt,Number(attempt.updatedAt));}
    }
  }
  const items=[...byDoi.values()].sort((a,b)=>a.doi.localeCompare(b.doi));
  return {schemaVersion:'capture-inventory-v1',mediaGeneration:MEDIA_REBUILD_EPOCH,generatedAt:Date.now(),complete:true,count:items.length,items};
}

async function readStrictCaptureIndex(env,key) {
  const object=await env.MEDIA.get(key);
  if(!object)return {items:{}};
  const data=JSON.parse(await object.text());
  if(!data||!data.items||typeof data.items!=='object'||Array.isArray(data.items))throw new Error('invalid_capture_inventory_index');
  return data;
}

