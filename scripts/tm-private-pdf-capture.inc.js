  // Private PDF capture is an optional owner-only side channel. It never
  // determines TOC/body/fulltext task success and can be disabled independently.
  var PRIVATE_PDF_CAPTURE_REVISION = '20261005-private-pdf-session-v5';
  var PRIVATE_PDF_ADDED_DATE_CUTOFF = '2026-10-01';
  var PRIVATE_PDF_CAPTURE_ENDPOINT = WORKER + '/api/private-pdf/import';
  var PRIVATE_PDF_LEASE_KEY = P + 'private-pdf-capture-lease-v1';
  var PRIVATE_PDF_ATTEMPT_PREFIX = P + 'private-pdf-attempt-v3:';
  var PRIVATE_PDF_LEGACY_ATTEMPT_PREFIXES = [P + 'private-pdf-attempt-v2:', P + 'private-pdf-attempt-v1:'];
  var PRIVATE_PDF_MAX_BYTES = 60 * 1024 * 1024;

  function privatePdfCaptureEligibleByAddedDate(job) {
    var addedDate=String(job&&job.addedDate||'').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(addedDate)&&addedDate>=PRIVATE_PDF_ADDED_DATE_CUTOFF;
  }

  function privatePdfAttemptState(doi) {
    doi=normalizeDoi(doi);if(!doi)return null;
    var current=GM_getValue(PRIVATE_PDF_ATTEMPT_PREFIX+doi,null);
    if(current)return current;
    for(var i=0;i<PRIVATE_PDF_LEGACY_ATTEMPT_PREFIXES.length;i+=1){
      var legacy=GM_getValue(PRIVATE_PDF_LEGACY_ATTEMPT_PREFIXES[i]+doi,null);
      // Preserve only proven stored receipts across the retry-generation reset.
      if(legacy&&legacy.status==='stored')return legacy;
    }
    return null;
  }

  function privatePdfLive(job,phase,status,detail) {
    try{
      if(typeof captureLiveUpdate!=='function'||!job)return;
      detail=detail||{};
      captureLiveUpdate(job,phase||'discovering',{
        pdfStatus:String(status||'').slice(0,40),
        pdfBytes:Math.max(0,Number(detail.pdfBytes||0)),
        pdfError:detail.pdfError?captureLiveError(detail.pdfError):'',
        pdfCandidate:String(detail.pdfCandidate||'').slice(0,160)
      });
    }catch(_){}
  }

  async function waitForPrivatePdfPageReady(job,trace) {
    if(String(job&&job.mediaNeed||'')!=='pdf')return;
    var publisher=job.publisher||publisherForDoi(job.doi);
    var deadline=Date.now()+(publisher==='ccs'?12000:7000),stable=0;
    privatePdfLive(job,'page_loading','waiting_page');
    while(Date.now()<deadline&&currentCaptureJob(job)){
      var textLength=0;try{textLength=String(document.body&&document.body.innerText||'').length;}catch(_){}
      if(document.readyState==='complete'&&textLength>1000)stable+=1;else stable=0;
      if(stable>=2)break;
      await sleep(650);
    }
    pushTrace(trace,{stage:'private_pdf_page',event:'ready_wait_complete',status:'ok',url:location.href,
      message:'publisher='+publisher+';readyState='+String(document.readyState)});
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

  function discoverExplicitPdfCandidates(job) {
    assertBoundCaptureJob(job);
    var publisher=job.publisher||publisherForDoi(job.doi),seen=new Set(),rows=[];
    function add(raw,node,meta,source,boost){
      var url=normalizeUrl(raw,location.href);
      if(!url||seen.has(url)||!privatePdfHostAllowed(publisher,url))return;
      if(node&&node.closest&&node.closest('aside,nav,header,footer,[class*="related" i],[class*="recommend" i],[class*="reference" i]'))return;
      var score=privatePdfCandidateScore(node,url,meta)+Number(boost||0);
      if(score<30)return;
      seen.add(url);rows.push({url:url,score:score,source:source||(meta?'citation_pdf_url':'explicit_pdf_link')});
    }
    Array.from(document.querySelectorAll('meta[name="citation_pdf_url" i],meta[property="citation_pdf_url" i]')).forEach(function(m){add(m.getAttribute('content'),m,true,'citation_pdf_url',0);});
    Array.from(document.querySelectorAll('link[type="application/pdf" i][href],a[href]')).forEach(function(a){
      var href=a.getAttribute('href')||'',text=String(a.textContent||'')+' '+String(a.getAttribute('title')||'')+' '+String(a.getAttribute('aria-label')||'');
      if(a.tagName==='LINK'||/\.pdf(?:[?#]|$)|\/doi\/(?:pdf|epdf)\/|\/pdfdirect\/|\bpdf\b/i.test(href+' '+text))add(href,a,false,'explicit_pdf_link',0);
    });
    if(publisher==='ccs'){
      var doi=normalizeDoi(job.doi),origin=location.origin;
      add(origin+'/doi/pdfdirect/'+doi,null,false,'ccs_pdfdirect',220);
      add(origin+'/doi/pdf/'+doi,null,false,'ccs_pdf',200);
      add(origin+'/doi/epdf/'+doi,null,false,'ccs_epdf',20);
    }
    return rows.sort(function(a,b){return b.score-a.score;}).slice(0,6);
  }

  function privatePdfBytesValid(buffer) {
    var bytes=new Uint8Array(buffer||new ArrayBuffer(0));
    if(bytes.length<1024||bytes.length>PRIVATE_PDF_MAX_BYTES)return false;
    if(String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')return false;
    try{return new TextDecoder('latin1').decode(bytes.slice(Math.max(0,bytes.length-4096))).indexOf('%%EOF')>=0;}catch(_){return false;}
  }

  function privatePdfNestedCandidates(buffer,baseUrl,job) {
    var bytes=new Uint8Array(buffer||new ArrayBuffer(0));
    if(!bytes.length||bytes.length>2*1024*1024)return [];
    var text='';try{text=new TextDecoder('utf-8').decode(bytes);}catch(_){return [];}
    if(!/<(?:html|head|body|meta|iframe|embed|object|a)\b/i.test(text))return [];
    var publisher=job.publisher||publisherForDoi(job.doi),seen=new Set(),rows=[];
    function add(raw){
      raw=String(raw||'').replace(/\\\//g,'/');
      var url=normalizeUrl(raw,baseUrl||location.href);
      if(!url||url===baseUrl||seen.has(url)||!privatePdfHostAllowed(publisher,url))return;
      if(!/\.pdf(?:[?#]|$)|\/doi\/(?:pdf|epdf)\/|\/pdfdirect\//i.test(url))return;
      seen.add(url);rows.push(url);
    }
    try{
      var doc=new DOMParser().parseFromString(text,'text/html');
      Array.from(doc.querySelectorAll('meta[name="citation_pdf_url" i],meta[property="citation_pdf_url" i]')).forEach(function(n){add(n.getAttribute('content'));});
      Array.from(doc.querySelectorAll('iframe[src],embed[src],object[data],a[href],link[href]')).forEach(function(n){add(n.getAttribute('src')||n.getAttribute('data')||n.getAttribute('href'));});
    }catch(_){}
    (text.match(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)||[]).forEach(add);
    return rows.slice(0,4);
  }

  async function fetchPrivatePdfWithBrowserSession(job,candidate,trace) {
    assertBoundCaptureJob(job);
    var target;
    try{target=new URL(candidate.url,location.href);}catch(_){return null;}
    if(target.origin!==location.origin)return null;
    var started=Date.now(),abort=new AbortController(),timer=setTimeout(function(){abort.abort();},45000);
    privatePdfLive(job,'downloading','browser_download',{pdfCandidate:candidate.source||candidate.url});
    try{
      var response=await fetch(target.href,{method:'GET',credentials:'include',cache:'no-store',redirect:'follow',
        headers:{Accept:'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1'},signal:abort.signal});
      var buffer=await response.arrayBuffer(),status=Number(response.status||0),finalUrl=response.url||target.href;
      pushTrace(trace,{stage:'private_pdf_fetch',event:'browser_response',status:status>=200&&status<300?'ok':'http_error',
        httpStatus:status,contentType:String(response.headers&&response.headers.get&&response.headers.get('content-type')||''),url:finalUrl,
        byteLength:buffer&&buffer.byteLength||0,message:'transport=browser_session;durationMs='+(Date.now()-started)});
      if(status<200||status>=300){var e=new Error('private_pdf_browser_http_'+status);e.httpStatus=status;throw e;}
      if(!privatePdfHostAllowed(job.publisher||publisherForDoi(job.doi),finalUrl))throw new Error('private_pdf_redirect_host_mismatch');
      if(!privatePdfBytesValid(buffer)){
        var nested=privatePdfNestedCandidates(buffer,finalUrl,job);
        pushTrace(trace,{stage:'private_pdf_fetch',event:'viewer_candidates',status:nested.length?'found':'none',url:finalUrl,
          byteLength:buffer.byteLength,message:'nested_candidates='+nested.length});
        return {wrapper:true,nestedCandidates:nested,sourceUrl:finalUrl,byteLength:buffer.byteLength};
      }
      privatePdfLive(job,'downloading','validated',{pdfBytes:buffer.byteLength,pdfCandidate:candidate.source||candidate.url});
      return {buffer:buffer,sourceUrl:finalUrl,byteLength:buffer.byteLength,transport:'browser_session'};
    }catch(error){
      pushTrace(trace,{stage:'private_pdf_fetch',event:'browser_failed',status:'fallback',httpStatus:Number(error&&error.httpStatus||0),
        url:target.href,message:'transport=browser_session;'+captureLiveError(error&&error.message||error)});
      return null;
    }finally{clearTimeout(timer);}
  }

  async function fetchExplicitPdf(job,candidate,trace) {
    assertBoundCaptureJob(job);
    var browserPdf=await fetchPrivatePdfWithBrowserSession(job,candidate,trace);
    if(browserPdf&&browserPdf.buffer)return browserPdf;
    if(browserPdf&&browserPdf.nestedCandidates&&browserPdf.nestedCandidates.length){
      for(var n=0;n<browserPdf.nestedCandidates.length;n+=1){
        var nested=await fetchPrivatePdfWithBrowserSession(job,{url:browserPdf.nestedCandidates[n],source:'viewer_embedded_pdf'},trace);
        if(nested&&nested.buffer)return nested;
      }
    }
    var started=Date.now();
    privatePdfLive(job,'downloading','gm_fallback',{pdfCandidate:candidate.source||candidate.url});
    try{
      var response=await gmRequest({method:'GET',url:candidate.url,responseType:'arraybuffer',timeout:45000,
        headers:{Accept:'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1',Referer:location.href}});
      var status=Number(response.status||0),buffer=response.response,finalUrl=response.finalUrl||candidate.url;
      pushTrace(trace,{stage:'private_pdf_fetch',event:'response',status:status>=200&&status<300?'ok':'http_error',
        httpStatus:status,url:finalUrl,byteLength:buffer&&buffer.byteLength||0,message:'transport=gm;durationMs='+(Date.now()-started)});
      if(status<200||status>=300){var e=new Error('private_pdf_http_'+status);e.httpStatus=status;throw e;}
      if(!privatePdfHostAllowed(job.publisher||publisherForDoi(job.doi),finalUrl))throw new Error('private_pdf_redirect_host_mismatch');
      if(!privatePdfBytesValid(buffer))throw new Error('private_pdf_invalid_bytes');
      privatePdfLive(job,'downloading','validated',{pdfBytes:buffer.byteLength,pdfCandidate:candidate.source||candidate.url});
      return {buffer:buffer,sourceUrl:finalUrl,byteLength:buffer.byteLength,transport:'gm'};
    }catch(error){
      pushTrace(trace,{stage:'private_pdf_fetch',event:'failed',status:'failed',httpStatus:Number(error&&error.httpStatus||0),
        url:candidate.url,message:'transport=gm;'+captureLiveError(error&&error.message||error)});
      throw error;
    }
  }

  async function uploadPrivatePdf(job,pdf,lease,trace) {
    assertBoundCaptureJob(job);
    privatePdfLive(job,'uploading','uploading',{pdfBytes:pdf&&pdf.byteLength||0});
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
    var bytes=Number(body.byteLength||pdf.byteLength||0);
    pushTrace(trace,{stage:'private_pdf_upload',event:'complete',status:'ok',url:PRIVATE_PDF_CAPTURE_ENDPOINT,
      byteLength:bytes,message:'stored=1;active='+String(Boolean(body.active))+';verification='+String(Boolean(body.requiresVerification))});
    privatePdfLive(job,'finished','stored',{pdfBytes:bytes});
    return body;
  }

  async function maybeCapturePrivatePdf(job,trace) {
    if(!job||!currentCaptureJob(job)||!privatePdfCaptureEligibleByAddedDate(job))return null;
    privatePdfLive(job,'discovering','checking_lease');
    var lease=privatePdfLease();
    if(!lease){
      pushTrace(trace,{stage:'private_pdf_lease',event:'missing',status:'skipped',message:'eligible_addedDate='+String(job.addedDate||'')+';revision='+PRIVATE_PDF_CAPTURE_REVISION});
      privatePdfLive(job,'finished','lease_missing',{pdfError:'capture_lease_missing'});
      return {status:'skipped',reason:'capture_lease_missing',revision:PRIVATE_PDF_CAPTURE_REVISION};
    }
    pushTrace(trace,{stage:'private_pdf_lease',event:'active',status:'ok',message:'expiresAt='+String(Number(lease.expiresAt||0))+';revision='+String(lease.revision||PRIVATE_PDF_CAPTURE_REVISION)});
    var doi=normalizeDoi(job.doi),key=PRIVATE_PDF_ATTEMPT_PREFIX+doi,prior=privatePdfAttemptState(doi),now=Date.now();
    if(prior&&prior.status==='stored'&&now-Number(prior.at||0)<30*24*60*60*1000){
      privatePdfLive(job,'finished','already_stored',{pdfBytes:Number(prior.byteLength||0)});
      return {status:'already_stored',documentId:prior.documentId||'',byteLength:Number(prior.byteLength||0)};
    }
    if(prior&&prior.status==='not_found'&&now-Number(prior.at||0)<6*60*60*1000){
      privatePdfLive(job,'finished','not_found',{pdfError:'not_found_cached'});
      return {status:'not_found_cached',reason:'not_found_cached'};
    }
    if(prior&&prior.status==='failed'&&now-Number(prior.at||0)<30*60*1000){
      privatePdfLive(job,'finished','failed',{pdfError:prior.reason||'failed_cached'});
      return {status:'failed_cached',reason:prior.reason||'failed_cached'};
    }
    await waitForPrivatePdfPageReady(job,trace);
    privatePdfLive(job,'discovering','discovering');
    var candidates=discoverExplicitPdfCandidates(job);
    if(!candidates.length){
      GM_setValue(key,{status:'not_found',at:now,revision:PRIVATE_PDF_CAPTURE_REVISION});
      pushTrace(trace,{stage:'private_pdf_discovery',event:'complete',status:'none',message:'explicit_candidates=0'});
      privatePdfLive(job,'finished','not_found',{pdfError:'explicit_candidates=0'});
      return {status:'not_found',reason:'explicit_candidates=0'};
    }
    pushTrace(trace,{stage:'private_pdf_discovery',event:'complete',status:'found',message:'explicit_candidates='+candidates.length});
    privatePdfLive(job,'discovering','candidate_found',{pdfCandidate:candidates[0].source||''});
    var lastError=null;
    for(var i=0;i<Math.min(6,candidates.length);i+=1){
      try{
        var pdf=await fetchExplicitPdf(job,candidates[i],trace);
        var receipt=await uploadPrivatePdf(job,pdf,lease,trace);
        var saved={status:'stored',at:Date.now(),documentId:String(receipt.documentId||''),contentHash:String(receipt.contentHash||''),byteLength:Number(receipt.byteLength||0),active:Boolean(receipt.active),revision:PRIVATE_PDF_CAPTURE_REVISION};
        GM_setValue(key,saved);return saved;
      }catch(error){
        lastError=error;
        var code=Number(error&&error.httpStatus||0);
        if(code===401){GM_deleteValue(PRIVATE_PDF_LEASE_KEY);break;}
        if(code===429)break;
      }
    }
    var failed={status:'failed',at:Date.now(),reason:captureLiveError(lastError&&lastError.message||lastError||'unknown'),revision:PRIVATE_PDF_CAPTURE_REVISION};
    GM_setValue(key,failed);
    privatePdfLive(job,'finished','failed',{pdfError:failed.reason});
    return failed;
  }

