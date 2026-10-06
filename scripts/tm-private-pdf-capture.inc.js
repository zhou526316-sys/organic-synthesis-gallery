  // Private PDF capture is an optional owner-only side channel. It never
  // determines TOC/body/fulltext task success and can be disabled independently.
  var PRIVATE_PDF_CAPTURE_REVISION = '20261006-private-pdf-live-v5';
  var PRIVATE_PDF_ADDED_DATE_CUTOFF = '2026-10-01';
  var PRIVATE_PDF_CAPTURE_ENDPOINT = WORKER + '/api/private-pdf/import';
  var PRIVATE_PDF_LEASE_KEY = P + 'private-pdf-capture-lease-v1';
  var PRIVATE_PDF_ATTEMPT_PREFIX = P + 'private-pdf-attempt-v2:';
  var PRIVATE_PDF_MAX_BYTES = 60 * 1024 * 1024;

  function privatePdfCaptureEligibleByAddedDate(job) {
    var addedDate=String(job&&job.addedDate||'').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(addedDate)&&addedDate>=PRIVATE_PDF_ADDED_DATE_CUTOFF;
  }

  function privatePdfLease() {
    var lease=GM_getValue(PRIVATE_PDF_LEASE_KEY,null);
    if(!lease||lease.scope!=='private_pdf_capture'||!lease.token||Number(lease.expiresAt||0)<=Date.now()+60000){
      if(lease)GM_deleteValue(PRIVATE_PDF_LEASE_KEY);
      return null;
    }
    return lease;
  }

  function privatePdfLeaseDiagnostics() {
    var raw=GM_getValue(PRIVATE_PDF_LEASE_KEY,null),valid=privatePdfLease();
    return {
      state:valid?'active':raw?'expired_or_invalid':'missing',
      present:Boolean(valid),
      expiresAt:Number(valid&&valid.expiresAt||raw&&raw.expiresAt||0),
      receivedAt:Number(valid&&valid.receivedAt||raw&&raw.receivedAt||0),
      revision:String(valid&&valid.revision||raw&&raw.revision||'')
    };
  }

  function installPrivatePdfLeaseReceiver() {
    if(!isGalleryPage()||typeof window==='undefined'||typeof window.addEventListener!=='function')return;
    window.addEventListener('message',function(event){
      try{
        if(event.origin!==location.origin)return;
        var data=event.data||{};
        if(data.type!=='osg-private-pdf-capture-lease-v1'||data.scope!=='private_pdf_capture')return;
        var token=String(data.token||''),expiresAt=Number(data.expiresAt||0),receivedAt=Date.now();
        if(!/^[A-Za-z0-9_-]{32,160}$/.test(token)||expiresAt<=receivedAt+60000)return;
        GM_setValue(PRIVATE_PDF_LEASE_KEY,{token:token,expiresAt:expiresAt,scope:'private_pdf_capture',receivedAt:receivedAt,revision:PRIVATE_PDF_CAPTURE_REVISION});
        window.postMessage({type:'osg-private-pdf-capture-lease-ack-v1',expiresAt:expiresAt,receivedAt:receivedAt,revision:PRIVATE_PDF_CAPTURE_REVISION},location.origin);
      }catch(_){}
    });
  }

  function privatePdfHostAllowed(publisher,value) {
    try{
      var h=new URL(value,location.href).hostname.toLowerCase();
      var sub=function(base){return h===base||h.endsWith('.'+base);};
      if(publisher==='acs')return sub('pubs.acs.org');
      if(publisher==='wiley')return sub('onlinelibrary.wiley.com');
      if(publisher==='nature')return sub('nature.com');
      if(publisher==='science')return sub('science.org');
      if(publisher==='rsc')return sub('pubs.rsc.org');
      if(publisher==='elsevier')return sub('sciencedirect.com')||sub('sciencedirectassets.com')||sub('cell.com');
      if(publisher==='ccs')return sub('chinesechemsoc.org')||sub('ccspublishing.org.cn');
      return false;
    }catch(_){return false;}
  }

  function privatePdfCandidateScore(node,url,meta) {
    var text=String((node&&node.textContent)||'')+' '+String(node&&node.getAttribute&&node.getAttribute('title')||'')+' '+String(node&&node.getAttribute&&node.getAttribute('aria-label')||'');
    var u=String(url||'').toLowerCase(),t=text.toLowerCase(),score=0;
    if(meta)score+=120;
    if(node&&String(node.getAttribute&&node.getAttribute('type')||'').toLowerCase()==='application/pdf')score+=80;
    if(/\b(?:download\s+)?pdf\b/i.test(text))score+=60;
    if(/\/doi\/(?:pdf|epdf)\//.test(u)||/\/pdfdirect\//.test(u)||/\.pdf(?:[?#]|$)/.test(u))score+=40;
    if(/support|supplement|supporting|si\b|esm|appendix/.test(t+' '+u))score-=100;
    return score;
  }

  function privatePdfUrlLooksStrong(value) {
    var u=String(value||'').toLowerCase();
    return /\.pdf(?:[?#]|$)/.test(u)||/\/doi\/(?:pdf|epdf)\//.test(u)||/\/pdfdirect\//.test(u)||/[?&](?:file|pdf|pdfurl|url)=[^&#]*\.pdf(?:[&#]|$)/.test(u);
  }

  function discoverExplicitPdfCandidates(job) {
    assertBoundCaptureJob(job);
    var publisher=job.publisher||publisherForDoi(job.doi),seen=new Set(),rows=[];
    function add(raw,node,meta){
      var url=normalizeUrl(raw,location.href);
      if(!url||seen.has(url)||!privatePdfHostAllowed(publisher,url))return;
      if(node&&node.closest&&node.closest('aside,nav,header,footer,[class*="related" i],[class*="recommend" i],[class*="reference" i]'))return;
      var score=privatePdfCandidateScore(node,url,meta);
      if(score<30)return;
      seen.add(url);rows.push({url:url,score:score,source:meta?'citation_pdf_url':'explicit_pdf_link'});
    }
    Array.from(document.querySelectorAll('meta[name="citation_pdf_url" i],meta[property="citation_pdf_url" i]')).forEach(function(m){add(m.getAttribute('content'),m,true);});
    Array.from(document.querySelectorAll('link[type="application/pdf" i][href],a[href],iframe[src],embed[src],object[data]')).forEach(function(a){
      var href=a.getAttribute('href')||a.getAttribute('src')||a.getAttribute('data')||'';
      var text=String(a.textContent||'')+' '+String(a.getAttribute('title')||'')+' '+String(a.getAttribute('aria-label')||'');
      if(a.tagName==='LINK'||privatePdfUrlLooksStrong(href)||/\bpdf\b/i.test(href+' '+text))add(href,a,false);
    });
    return rows.sort(function(a,b){return b.score-a.score;}).slice(0,6);
  }

  function privatePdfViewerCandidates(job,html,baseUrl) {
    var publisher=job.publisher||publisherForDoi(job.doi),seen=new Set(),rows=[];
    if(!html||String(html).length>3*1024*1024)return rows;
    function add(raw,source,score){
      raw=String(raw||'').replace(/&amp;/g,'&').replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/');
      try{raw=decodeURIComponent(raw);}catch(_){}
      var url=normalizeUrl(raw,baseUrl||location.href);
      if(!url||url===normalizeUrl(baseUrl,baseUrl)||seen.has(url)||!privatePdfHostAllowed(publisher,url)||!privatePdfUrlLooksStrong(url))return;
      if(/support|supplement|supporting|si\b|esm|appendix/i.test(url))return;
      seen.add(url);rows.push({url:url,score:Number(score||60),source:source||'pdf_viewer_asset'});
    }
    try{
      var doc=new DOMParser().parseFromString(String(html),'text/html');
      Array.from(doc.querySelectorAll('meta[name="citation_pdf_url" i],meta[property="citation_pdf_url" i]')).forEach(function(n){add(n.getAttribute('content'),'viewer_citation_pdf',140);});
      Array.from(doc.querySelectorAll('iframe[src],embed[src],object[data],link[href],a[href]')).forEach(function(n){
        var raw=n.getAttribute('src')||n.getAttribute('data')||n.getAttribute('href')||'';
        if(privatePdfUrlLooksStrong(raw))add(raw,'viewer_dom_asset',100);
      });
    }catch(_){}
    var normalized=String(html).replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/');
    var named=/(?:pdfUrl|pdf_url|fileUrl|file_url|downloadUrl|download_url|pdfPath|pdf_path|file)\s*["']?\s*[:=]\s*["']([^"']+)["']/gi,m;
    while((m=named.exec(normalized))!==null)add(m[1],'viewer_script_named',120);
    var rawUrls=/(?:https?:\/\/|\/)[^"'<>\\\s]+(?:\.pdf(?:[?#][^"'<>\\\s]*)?|\/doi\/(?:pdf|epdf)\/[^"'<>\\\s]+|\/pdfdirect\/[^"'<>\\\s]+)/gi;
    while((m=rawUrls.exec(normalized))!==null)add(m[0],'viewer_script_url',80);
    return rows.sort(function(a,b){return b.score-a.score;}).slice(0,6);
  }

  function privatePdfBytesValid(buffer) {
    var bytes=new Uint8Array(buffer||new ArrayBuffer(0));
    if(bytes.length<1024||bytes.length>PRIVATE_PDF_MAX_BYTES)return false;
    if(String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')return false;
    try{return new TextDecoder('latin1').decode(bytes.slice(Math.max(0,bytes.length-4096))).indexOf('%%EOF')>=0;}catch(_){return false;}
  }

  function privatePdfHtmlFromBuffer(buffer,contentType) {
    var bytes=new Uint8Array(buffer||new ArrayBuffer(0));
    if(!bytes.length||bytes.length>3*1024*1024)return '';
    var prefix='';try{prefix=new TextDecoder('utf-8').decode(bytes.slice(0,Math.min(bytes.length,2048)));}catch(_){}
    if(!/html|text|javascript|json/i.test(String(contentType||''))&&!/^\s*</.test(prefix))return '';
    try{return new TextDecoder('utf-8').decode(bytes);}catch(_){return '';}
  }

  function privatePdfDiscoveryWaitMs(job) {
    var publisher=job.publisher||publisherForDoi(job.doi);
    if(publisher==='ccs')return 20000;
    if(publisher==='elsevier'||publisher==='rsc')return 15000;
    return 10000;
  }

  async function waitForPrivatePdfCandidates(job,trace) {
    var started=Date.now(),waitMs=privatePdfDiscoveryWaitMs(job),rows=[];
    captureLiveUpdate(job,'private_pdf_wait',{pdfStatus:'waiting_page',pdfStage:'等待页面和动态 PDF 控件'});
    while(Date.now()-started<waitMs){
      if(isAbortRequested())throw new Error('user_aborted');
      assertBoundCaptureJob(job);
      rows=discoverExplicitPdfCandidates(job);
      if(rows.length){
        captureLiveUpdate(job,'private_pdf_discovery',{pdfStatus:'searching',pdfStage:'已发现 '+rows.length+' 个 PDF 候选'});
        pushTrace(trace,{stage:'private_pdf_discovery',event:'complete',status:'found',message:'explicit_candidates='+rows.length+';waitedMs='+(Date.now()-started)});
        return rows;
      }
      captureLiveUpdate(job,'private_pdf_discovery',{pdfStatus:'searching',pdfStage:'查找 PDF 入口'});
      await sleep(750);
    }
    pushTrace(trace,{stage:'private_pdf_discovery',event:'complete',status:'none',message:'explicit_candidates=0;waitedMs='+(Date.now()-started)});
    captureLiveUpdate(job,'private_pdf_not_found',{pdfStatus:'not_found',pdfStage:'等待后仍未找到 PDF 入口'});
    return [];
  }

  async function fetchPrivatePdfWithBrowserSession(job,candidate,trace,seen,depth) {
    assertBoundCaptureJob(job);
    var target;
    try{target=new URL(candidate.url,location.href);}catch(_){return null;}
    if(target.origin!==location.origin)return null;
    captureLiveUpdate(job,'private_pdf_browser',{pdfStatus:'browser_download',pdfStage:'浏览器会话下载'});
    var started=Date.now(),abort=new AbortController(),timer=setTimeout(function(){abort.abort();},45000);
    try{
      var response=await fetch(target.href,{method:'GET',credentials:'include',cache:'no-store',redirect:'follow',
        headers:{Accept:'application/pdf,application/octet-stream;q=0.9,text/html;q=0.5,*/*;q=0.1'},signal:abort.signal});
      var buffer=await response.arrayBuffer(),status=Number(response.status||0),finalUrl=response.url||target.href,contentType=String(response.headers&&response.headers.get&&response.headers.get('content-type')||'');
      pushTrace(trace,{stage:'private_pdf_fetch',event:'browser_response',status:status>=200&&status<300?'ok':'http_error',
        httpStatus:status,url:finalUrl,byteLength:buffer&&buffer.byteLength||0,message:'transport=browser_session;contentType='+contentType+';durationMs='+(Date.now()-started)});
      if(status<200||status>=300){var e=new Error('private_pdf_browser_http_'+status);e.httpStatus=status;throw e;}
      if(!privatePdfHostAllowed(job.publisher||publisherForDoi(job.doi),finalUrl))throw new Error('private_pdf_redirect_host_mismatch');
      captureLiveUpdate(job,'private_pdf_validation',{pdfStatus:'validating',pdfStage:'校验下载内容',pdfBytes:buffer&&buffer.byteLength||0});
      if(privatePdfBytesValid(buffer))return {buffer:buffer,sourceUrl:finalUrl,byteLength:buffer.byteLength,transport:'browser_session'};
      var html=privatePdfHtmlFromBuffer(buffer,contentType),nested=privatePdfViewerCandidates(job,html,finalUrl);
      if(nested.length&&Number(depth||0)<2){
        pushTrace(trace,{stage:'private_pdf_viewer',event:'asset_discovery',status:'found',url:finalUrl,message:'viewer_assets='+nested.length});
        for(var i=0;i<nested.length;i+=1){
          try{var resolved=await fetchExplicitPdf(job,nested[i],trace,seen,Number(depth||0)+1);if(resolved)return resolved;}catch(_){}
        }
      }
      throw new Error(html?'private_pdf_viewer_no_valid_pdf':'private_pdf_invalid_bytes');
    }catch(error){
      pushTrace(trace,{stage:'private_pdf_fetch',event:'browser_failed',status:'fallback',httpStatus:Number(error&&error.httpStatus||0),
        url:target.href,message:'transport=browser_session;'+captureLiveError(error&&error.message||error)});
      return null;
    }finally{clearTimeout(timer);}
  }

  async function fetchExplicitPdf(job,candidate,trace,seen,depth) {
    assertBoundCaptureJob(job);
    seen=seen||new Set();depth=Number(depth||0);
    var key=normalizeUrl(candidate&&candidate.url,location.href);
    if(!key||seen.has(key))throw new Error('private_pdf_viewer_loop');
    seen.add(key);
    var browserPdf=await fetchPrivatePdfWithBrowserSession(job,candidate,trace,seen,depth);
    if(browserPdf)return browserPdf;
    captureLiveUpdate(job,'private_pdf_gm',{pdfStatus:'gm_download',pdfStage:'备用下载'});
    var started=Date.now();
    try{
      var response=await gmRequest({method:'GET',url:candidate.url,responseType:'arraybuffer',timeout:45000,
        headers:{Accept:'application/pdf,application/octet-stream;q=0.9,text/html;q=0.5,*/*;q=0.1',Referer:location.href}});
      var status=Number(response.status||0),buffer=response.response,finalUrl=response.finalUrl||candidate.url;
      var headers=String(response.responseHeaders||''),contentType=(headers.match(/(?:^|\r?\n)content-type:\s*([^\r\n]+)/i)||[])[1]||'';
      pushTrace(trace,{stage:'private_pdf_fetch',event:'response',status:status>=200&&status<300?'ok':'http_error',
        httpStatus:status,url:finalUrl,byteLength:buffer&&buffer.byteLength||0,message:'transport=gm;contentType='+contentType+';durationMs='+(Date.now()-started)});
      if(status<200||status>=300){var e=new Error('private_pdf_http_'+status);e.httpStatus=status;throw e;}
      if(!privatePdfHostAllowed(job.publisher||publisherForDoi(job.doi),finalUrl))throw new Error('private_pdf_redirect_host_mismatch');
      captureLiveUpdate(job,'private_pdf_validation',{pdfStatus:'validating',pdfStage:'校验下载内容',pdfBytes:buffer&&buffer.byteLength||0});
      if(privatePdfBytesValid(buffer))return {buffer:buffer,sourceUrl:finalUrl,byteLength:buffer.byteLength,transport:'gm'};
      var html=privatePdfHtmlFromBuffer(buffer,contentType),nested=privatePdfViewerCandidates(job,html,finalUrl);
      if(nested.length&&depth<2){
        pushTrace(trace,{stage:'private_pdf_viewer',event:'asset_discovery',status:'found',url:finalUrl,message:'viewer_assets='+nested.length+';transport=gm'});
        for(var i=0;i<nested.length;i+=1){
          try{var resolved=await fetchExplicitPdf(job,nested[i],trace,seen,depth+1);if(resolved)return resolved;}catch(_){}
        }
      }
      throw new Error(html?'private_pdf_viewer_no_valid_pdf':'private_pdf_invalid_bytes');
    }catch(error){
      pushTrace(trace,{stage:'private_pdf_fetch',event:'failed',status:'failed',httpStatus:Number(error&&error.httpStatus||0),
        url:candidate.url,message:'transport=gm;'+captureLiveError(error&&error.message||error)});
      throw error;
    }
  }

  async function uploadPrivatePdf(job,pdf,lease,trace) {
    assertBoundCaptureJob(job);
    captureLiveUpdate(job,'private_pdf_upload',{pdfStatus:'uploading',pdfStage:'上传私有 PDF',pdfBytes:Number(pdf&&pdf.byteLength||0)});
    var u=new URL(PRIVATE_PDF_CAPTURE_ENDPOINT);
    u.searchParams.set('doi',normalizeDoi(job.doi));
    u.searchParams.set('publisher',job.publisher||publisherForDoi(job.doi));
    u.searchParams.set('articleUrl',location.href);
    u.searchParams.set('sourceUrl',pdf.sourceUrl);
    u.searchParams.set('versionKind','unknown');
    var response=await gmRequest({method:'POST',url:u.toString(),timeout:90000,
      headers:{'content-type':'application/pdf',authorization:'Bearer '+lease.token},data:pdf.buffer});
    var status=Number(response.status||0),raw=String(response.responseText||''),body={};
    try{body=JSON.parse(raw||'{}');}catch(_){}
    if(status<200||status>=300){
      var error=new Error('private_pdf_upload_http_'+status+':'+String(body.error||'unknown'));
      error.httpStatus=status;throw error;
    }
    if(!body||body.stored!==true||normalizeDoi(body.doi)!==normalizeDoi(job.doi)||!body.contentHash)throw new Error('private_pdf_receipt_invalid');
    pushTrace(trace,{stage:'private_pdf_upload',event:'complete',status:'ok',url:PRIVATE_PDF_CAPTURE_ENDPOINT,
      byteLength:Number(body.byteLength||pdf.byteLength||0),message:'stored=1;active='+String(Boolean(body.active))+';verification='+String(Boolean(body.requiresVerification))});
    captureLiveUpdate(job,'private_pdf_saved',{pdfStatus:'stored',pdfStage:'已收到 stored=1 回执',pdfBytes:Number(body.byteLength||pdf.byteLength||0)});
    return body;
  }

  async function maybeCapturePrivatePdf(job,trace) {
    if(!job||!currentCaptureJob(job)||!privatePdfCaptureEligibleByAddedDate(job))return null;
    var lease=privatePdfLease();
    if(!lease){
      captureLiveUpdate(job,'private_pdf_no_lease',{pdfStatus:'skipped',pdfStage:'未获得 owner PDF 授权'});
      pushTrace(trace,{stage:'private_pdf_lease',event:'missing',status:'skipped',message:'eligible_addedDate='+String(job.addedDate||'')+';revision='+PRIVATE_PDF_CAPTURE_REVISION});
      return {status:'skipped',reason:'capture_lease_missing',revision:PRIVATE_PDF_CAPTURE_REVISION};
    }
    pushTrace(trace,{stage:'private_pdf_lease',event:'active',status:'ok',message:'expiresAt='+String(Number(lease.expiresAt||0))+';revision='+String(lease.revision||PRIVATE_PDF_CAPTURE_REVISION)});
    var doi=normalizeDoi(job.doi),key=PRIVATE_PDF_ATTEMPT_PREFIX+doi,prior=GM_getValue(key,null),now=Date.now();
    if(prior&&prior.status==='stored'&&now-Number(prior.at||0)<30*24*60*60*1000){
      captureLiveUpdate(job,'private_pdf_saved',{pdfStatus:'already_stored',pdfStage:'复用已存储 PDF 回执',pdfBytes:Number(prior.byteLength||0)});
      return {status:'already_stored',documentId:prior.documentId||'',byteLength:Number(prior.byteLength||0)};
    }
    if(prior&&prior.status==='not_found'&&now-Number(prior.at||0)<6*60*60*1000&&!job.missingOnly&&!job.manualRunId){
      captureLiveUpdate(job,'private_pdf_not_found',{pdfStatus:'not_found_cached',pdfStage:'沿用自动冷却记录'});
      return {status:'not_found_cached'};
    }
    var candidates=await waitForPrivatePdfCandidates(job,trace);
    if(!candidates.length){
      GM_setValue(key,{status:'not_found',at:Date.now(),revision:PRIVATE_PDF_CAPTURE_REVISION});
      return {status:'not_found'};
    }
    var lastError=null;
    for(var i=0;i<Math.min(4,candidates.length);i+=1){
      try{
        var pdf=await fetchExplicitPdf(job,candidates[i],trace,new Set(),0);
        var receipt=await uploadPrivatePdf(job,pdf,lease,trace);
        var saved={status:'stored',at:Date.now(),documentId:String(receipt.documentId||''),contentHash:String(receipt.contentHash||''),byteLength:Number(receipt.byteLength||pdf.byteLength||0),active:Boolean(receipt.active),revision:PRIVATE_PDF_CAPTURE_REVISION};
        GM_setValue(key,saved);return saved;
      }catch(error){
        lastError=error;
        var code=Number(error&&error.httpStatus||0);
        if(code===401){GM_deleteValue(PRIVATE_PDF_LEASE_KEY);break;}
        if(code===429||code===403)break;
      }
    }
    var failed={status:'failed',at:Date.now(),reason:captureLiveError(lastError&&lastError.message||lastError||'unknown'),revision:PRIVATE_PDF_CAPTURE_REVISION};
    GM_setValue(key,failed);
    captureLiveUpdate(job,'private_pdf_failed',{pdfStatus:'failed',pdfStage:'PDF 抓取失败',pdfError:failed.reason});
    return failed;
  }
