  // Private PDF capture is an optional owner-only side channel. It never
  // determines TOC/body/fulltext task success and can be disabled independently.
  var PRIVATE_PDF_CAPTURE_REVISION = '20261004-private-pdf-capture-v2';
  var PRIVATE_PDF_ADDED_DATE_CUTOFF = '2026-10-01';
  var PRIVATE_PDF_CAPTURE_ENDPOINT = WORKER + '/api/private-pdf/import';
  var PRIVATE_PDF_LEASE_KEY = P + 'private-pdf-capture-lease-v1';
  var PRIVATE_PDF_ATTEMPT_PREFIX = P + 'private-pdf-attempt-v1:';
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

  function installPrivatePdfLeaseReceiver() {
    if(!isGalleryPage()||typeof window==='undefined'||typeof window.addEventListener!=='function')return;
    window.addEventListener('message',function(event){
      try{
        if(event.source!==window||event.origin!==location.origin)return;
        var data=event.data||{};
        if(data.type!=='osg-private-pdf-capture-lease-v1'||data.scope!=='private_pdf_capture')return;
        var token=String(data.token||''),expiresAt=Number(data.expiresAt||0);
        if(!/^[A-Za-z0-9_-]{32,160}$/.test(token)||expiresAt<=Date.now()+60000)return;
        GM_setValue(PRIVATE_PDF_LEASE_KEY,{token:token,expiresAt:expiresAt,scope:'private_pdf_capture',receivedAt:Date.now(),revision:PRIVATE_PDF_CAPTURE_REVISION});
        window.postMessage({type:'osg-private-pdf-capture-lease-ack-v1',expiresAt:expiresAt},location.origin);
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
    function add(raw,node,meta){
      var url=normalizeUrl(raw,location.href);
      if(!url||seen.has(url)||!privatePdfHostAllowed(publisher,url))return;
      if(node&&node.closest&&node.closest('aside,nav,header,footer,[class*="related" i],[class*="recommend" i],[class*="reference" i]'))return;
      var score=privatePdfCandidateScore(node,url,meta);
      if(score<30)return;
      seen.add(url);rows.push({url:url,score:score,source:meta?'citation_pdf_url':'explicit_pdf_link'});
    }
    Array.from(document.querySelectorAll('meta[name="citation_pdf_url" i],meta[property="citation_pdf_url" i]')).forEach(function(m){add(m.getAttribute('content'),m,true);});
    Array.from(document.querySelectorAll('link[type="application/pdf" i][href],a[href]')).forEach(function(a){
      var href=a.getAttribute('href')||'',text=String(a.textContent||'')+' '+String(a.getAttribute('title')||'')+' '+String(a.getAttribute('aria-label')||'');
      if(a.tagName==='LINK'||/\.pdf(?:[?#]|$)|\/doi\/(?:pdf|epdf)\/|\/pdfdirect\/|\bpdf\b/i.test(href+' '+text))add(href,a,false);
    });
    return rows.sort(function(a,b){return b.score-a.score;}).slice(0,4);
  }

  function privatePdfBytesValid(buffer) {
    var bytes=new Uint8Array(buffer||new ArrayBuffer(0));
    if(bytes.length<1024||bytes.length>PRIVATE_PDF_MAX_BYTES)return false;
    if(String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')return false;
    try{return new TextDecoder('latin1').decode(bytes.slice(Math.max(0,bytes.length-4096))).indexOf('%%EOF')>=0;}catch(_){return false;}
  }

  async function fetchExplicitPdf(job,candidate,trace) {
    assertBoundCaptureJob(job);
    var started=Date.now();
    try{
      var response=await gmRequest({method:'GET',url:candidate.url,responseType:'arraybuffer',timeout:45000,
        headers:{Accept:'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1',Referer:location.href}});
      var status=Number(response.status||0),buffer=response.response,finalUrl=response.finalUrl||candidate.url;
      pushTrace(trace,{stage:'private_pdf_fetch',event:'response',status:status>=200&&status<300?'ok':'http_error',
        httpStatus:status,url:finalUrl,byteLength:buffer&&buffer.byteLength||0,message:'durationMs='+(Date.now()-started)});
      if(status<200||status>=300){var e=new Error('private_pdf_http_'+status);e.httpStatus=status;throw e;}
      if(!privatePdfHostAllowed(job.publisher||publisherForDoi(job.doi),finalUrl))throw new Error('private_pdf_redirect_host_mismatch');
      if(!privatePdfBytesValid(buffer))throw new Error('private_pdf_invalid_bytes');
      return {buffer:buffer,sourceUrl:finalUrl,byteLength:buffer.byteLength};
    }catch(error){
      pushTrace(trace,{stage:'private_pdf_fetch',event:'failed',status:'failed',httpStatus:Number(error&&error.httpStatus||0),
        url:candidate.url,message:captureLiveError(error&&error.message||error)});
      throw error;
    }
  }

  async function uploadPrivatePdf(job,pdf,lease,trace) {
    assertBoundCaptureJob(job);
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
    return body;
  }

  async function maybeCapturePrivatePdf(job,trace) {
    if(!job||!currentCaptureJob(job)||!privatePdfCaptureEligibleByAddedDate(job))return null;
    var lease=privatePdfLease();
    if(!lease)return null;
    var doi=normalizeDoi(job.doi),key=PRIVATE_PDF_ATTEMPT_PREFIX+doi,prior=GM_getValue(key,null),now=Date.now();
    if(prior&&prior.status==='stored'&&now-Number(prior.at||0)<30*24*60*60*1000)return {status:'already_stored',documentId:prior.documentId||''};
    if(prior&&prior.status==='not_found'&&now-Number(prior.at||0)<6*60*60*1000)return {status:'not_found_cached'};
    var candidates=discoverExplicitPdfCandidates(job);
    if(!candidates.length){
      GM_setValue(key,{status:'not_found',at:now,revision:PRIVATE_PDF_CAPTURE_REVISION});
      pushTrace(trace,{stage:'private_pdf_discovery',event:'complete',status:'none',message:'explicit_candidates=0'});
      return {status:'not_found'};
    }
    pushTrace(trace,{stage:'private_pdf_discovery',event:'complete',status:'found',message:'explicit_candidates='+candidates.length});
    var lastError=null;
    for(var i=0;i<Math.min(3,candidates.length);i+=1){
      try{
        var pdf=await fetchExplicitPdf(job,candidates[i],trace);
        var receipt=await uploadPrivatePdf(job,pdf,lease,trace);
        var saved={status:'stored',at:Date.now(),documentId:String(receipt.documentId||''),contentHash:String(receipt.contentHash||''),byteLength:Number(receipt.byteLength||0),active:Boolean(receipt.active),revision:PRIVATE_PDF_CAPTURE_REVISION};
        GM_setValue(key,saved);return saved;
      }catch(error){
        lastError=error;
        var code=Number(error&&error.httpStatus||0);
        if(code===401){GM_deleteValue(PRIVATE_PDF_LEASE_KEY);break;}
        if(code===429||code===403)break;
      }
    }
    var failed={status:'failed',at:Date.now(),reason:captureLiveError(lastError&&lastError.message||lastError||'unknown'),revision:PRIVATE_PDF_CAPTURE_REVISION};
    GM_setValue(key,failed);return failed;
  }
