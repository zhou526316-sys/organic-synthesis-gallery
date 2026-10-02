  // Acquisition inventory, never a publication receipt or a count of the whole corpus.
  function captureNeedText(job) {
    if(!job)return '—';
    var parts=[];
    if(job.captureToc)parts.push(job.existingTocKind==='figure1'?'官方 TOC（已有 Figure 1）':'TOC');
    if(job.captureFigures)parts.push('正文图'+(job.missingFigureCount>0?'（缺 '+job.missingFigureCount+' 张）':''));
    if(job.captureEvidence)parts.push('文本（全文／摘要）');
    return parts.length?parts.join('＋'):'已齐全';
  }
  function captureEvidenceLevelText(level) {
    return ({complete:'完整正文',partial:'部分正文',abstract_only:'仅摘要'})[level]||'已有文本，完整度未确认';
  }
  function captureBatchDate(job) {
    // Site addition date first; original publication date is only the legacy fallback.
    return String(job.addedDate||job.date||'');
  }
  function compareMissingCaptureJobs(a,b) {
    return captureBatchDate(b).localeCompare(captureBatchDate(a))
      ||journalPriority(a)-journalPriority(b)
      ||String(b.date||'').localeCompare(String(a.date||''))
      ||String(a.doi).localeCompare(String(b.doi));
  }
  function validCapturedFigure(f) {
    if(!f||!f.label||!f.contentHash||!f.sourceUrl)return false;
    if(/^(?:high|usable|vector|vector_mixed)$/.test(String(f.quality||'')))return true;
    return articleFigureResolution(Number(f.width),Number(f.height)).usable;
  }
  function validReceiptForDoi(f,doi) {
    return validCapturedFigure(f)&&embeddedJobDois(f.sourceUrl).every(function(d){return d===doi;});
  }
  function mapCaptureRows(payload) {
    var out=new Map();
    if(payload&&Array.isArray(payload.items))payload.items.forEach(function(r){var d=normalizeDoi(r&&r.doi);if(d)out.set(d,r);});
    return out;
  }
  async function readMissingCaptureInventory(queue,run) {
    // These are metadata reads to select work, not a scan of publisher pages or old locks.
    var errors=[],mediaRows=[];
    function safe(name,p,valid){return p.then(function(x){if(!valid(x))throw new Error('invalid_inventory_shape');return x;}).catch(function(e){errors.push(name+':'+captureLiveError(e.message||e));return null;});}
    var dois=queue.articles.map(function(x){return normalizeDoi(x.doi);});
    var chunks=[];for(var i=0;i<dois.length;i+=250)chunks.push(dois.slice(i,i+250));
    async function readMedia(){
      // Bound concurrency and never exceed the Worker's 1200-DOI cap.
      for(var i=0;i<chunks.length;i+=2){
        if(run&&!manualExecutionCurrent(run))return null;
        var batches=await Promise.all(chunks.slice(i,i+2).map(function(ds){return safe('媒体库存',postReadJson(MEDIA_INVENTORY_ENDPOINT+'?ts='+Date.now(),{dois:ds,readOnly:true}),function(x){return x&&Array.isArray(x.items)&&x.items.length===ds.length&&new Set(x.items.map(function(r){return normalizeDoi(r.doi);})).size===ds.length&&x.items.every(function(r){return ds.indexOf(normalizeDoi(r.doi))>=0;});});}));
        batches.forEach(function(x){if(x)mediaRows=mediaRows.concat(x.items);});
      }
      return {items:mediaRows};
    }
    var all=await Promise.all([
      readMedia(),
      safe('TOC库存',getJson(CAPTURE_INDEX_URL+'?ts='+Date.now()),function(x){return x&&Array.isArray(x.items)&&x.items.length===Number(x.count);}),
      safe('正文图库存',getJson(WORKER+'/api/article-figures/staged?inventory=1&ts='+Date.now()),function(x){return x&&x.schemaVersion==='capture-inventory-v1'&&x.complete===true&&Array.isArray(x.items)&&x.items.length===Number(x.count);}),
      safe('文本库存',getPrivateJson(EVIDENCE_INVENTORY_ENDPOINT+'?ts='+Date.now(),writeToken()),function(x){return x&&Array.isArray(x.items)&&x.items.length===Number(x.count)&&x.truncated!==true;})
    ]);
    return {media:all[0],tocs:all[1],figures:all[2],evidence:all[3],errors:errors,readAt:nowIso()};
  }
  function missingCaptureDecision(raw,inventory) {
    var doi=normalizeDoi(raw.doi),media=inventory.mediaMap.get(doi),stage=inventory.figureMap.get(doi)||{};
    var cp=readCheckpoint(doi),figs={},unknown=[];
    var latestLocal=GM_getValue(resultKey(doi),null);
    var prior=GM_getValue(attemptKey(doi,VERSION+':paired:1790082000000','figures'),null);
    [cp.figures||{},stage.figures||{},media&&media.capturedFigures||[]].forEach(function(group){Object.keys(group).forEach(function(k){var f=group[k];if(validReceiptForDoi(f,doi))figs[f.label]=f;});});
    var localResults=[latestLocal,prior].filter(function(r){return r&&r.version===VERSION&&r.doi===doi&&Date.parse(r.finishedAt||'')>=1790082000000;});
    var expected=Math.max(0,Number(stage.expectedFigureCount||0),Number(cp.figureCoverage&&cp.figureCoverage.expected||0));
    localResults.forEach(function(r){expected=Math.max(expected,Number(r.figures&&r.figures.discovered||0));});
    var stagedCount=Object.keys(figs).length;
    var productionCount=media?Math.max(0,Number(media.figureCount||0)):0;
    var usableProduction=media?Math.max(0,productionCount-Number(media.lowQualityFigureCount||0)-Number(media.unknownQualityFigureCount||0)):0;
    var knownCount=stagedCount; // Per-label union, not an invalid sum/max of disjoint inventories.
    if(!media||!Array.isArray(media.capturedFigures))knownCount=Math.max(knownCount,usableProduction);
    var tocRows=inventory.tocMap.get(doi)||[];
    var official=tocRows.some(function(t){return t.kind==='official'&&t.imageUrl&&t.contentHash;})||Boolean(media&&((media.tocStored&&!/fallback/i.test(media.tocReason||''))||media.primaryKind==='official_visual'));
    var fallback=tocRows.some(function(t){return t.kind==='figure1'&&t.imageUrl;})||Boolean(media&&(media.primaryKind==='figure1'||media.figureOneStored));
    var tocKnown=official||Boolean(media&&inventory.tocsKnown);
    var figureKnown=(expected>0&&knownCount>=expected)||Boolean(media&&inventory.figuresKnown&&(expected>0||(productionCount===0&&stagedCount===0)));
    // A nonzero figure count alone is NOT proof that all body figures were captured.
    var needFigures=figureKnown&&(expected>0?knownCount<expected:knownCount===0);
    var text=inventory.evidenceMap.get(doi);
    var textLevel=text&&text.available!==false?String(text.evidenceLevel||'unknown'):'';
    if(!textLevel){
      var localText=localResults.find(function(r){return r.fulltext&&r.fulltext.status==='stored'&&r.fulltext.evidencePacketHash;});
      if(localText)textLevel=String(localText.fulltext.evidenceLevel||'unknown');
    }
    if(!tocKnown)unknown.push('TOC');if(!figureKnown)unknown.push('正文图完整度');if(!inventory.evidenceKnown&&!textLevel)unknown.push('文本');
    var job=Object.assign({},raw,{doi:doi,publisher:publisherForDoi(doi),missingOnly:true,recaptureFromHead:false,
      captureToc:tocKnown&&!official,captureFigures:needFigures,captureEvidence:inventory.evidenceKnown&&!textLevel,
      expectedFigureCount:expected,missingFigureCount:expected>0?Math.max(0,expected-knownCount):0,
      capturedFigures:figs,existingEvidenceLevel:textLevel,existingTocKind:official?'official':fallback?'figure1':'',
      unknownNeeds:unknown,allowFigureOne:!official&&!fallback&&isNatureScienceFamilyJob(raw)});
    job.mediaNeed=[job.captureToc?'toc':'',job.captureFigures?'figures':'',job.captureEvidence?'evidence':''].filter(Boolean).join('+');
    job.state=job.captureToc?'no_visual':job.captureFigures?'figure_gap':'evidence_gap';
    return job;
  }
  function buildMissingCaptureJobs(queue,run,rawInventory) {
    // Reuse complete registry validation, but don't reuse its historical TOC-first tiers.
    var rows=pairedJobs(queue,{items:{}}), inv=rawInventory||{};
    var inventory={mediaMap:mapCaptureRows(inv.media),tocMap:new Map(),figureMap:mapCaptureRows(inv.figures),evidenceMap:mapCaptureRows(inv.evidence),
      tocsKnown:Boolean(inv.tocs),figuresKnown:Boolean(inv.figures&&inv.figures.complete),evidenceKnown:Boolean(inv.evidence)};
    ((inv.tocs||{}).items||[]).forEach(function(t){var d=normalizeDoi(t.doi);if(!d||Number(t.mediaGeneration)!==1790082000000)return;var a=inventory.tocMap.get(d)||[];a.push(t);inventory.tocMap.set(d,a);});
    var jobs=[],unknownDois=0,unknownLayers={toc:0,figures:0,evidence:0};
    rows.forEach(function(raw){var job=missingCaptureDecision(raw,inventory);if(job.unknownNeeds.length)unknownDois++;
      job.unknownNeeds.forEach(function(n){unknownLayers[n==='TOC'?'toc':n==='文本'?'evidence':'figures']++;});
      if(job.mediaNeed){job.manualRunId=run.id;jobs.push(job);}
    });
    jobs.sort(compareMissingCaptureJobs);
    if(run.summary){run.summary.inventoryUnknown=unknownDois;run.summary.inventoryUnknownLayers=unknownLayers;run.summary.inventoryErrors=(inv.errors||[]).slice();run.summary.inventoryReadAt=inv.readAt||'';}
    return jobs;
  }
  function updateMissingQueueSummary(run,pending) {
    var s=run.summary;
    s.total=s.results.length+pending.length;
    s.pendingMissing=pending.length;
    s.remainingNeeds={toc:0,figures:0,evidence:0};
    pending.forEach(function(j){if(j.captureToc)s.remainingNeeds.toc++;if(j.captureFigures)s.remainingNeeds.figures++;if(j.captureEvidence)s.remainingNeeds.evidence++;});
    s.pendingPreview=pending.slice(0,12).map(function(j){return {doi:j.doi,journal:j.journal,addedDate:captureBatchDate(j),need:captureNeedText(j)};});
  }
