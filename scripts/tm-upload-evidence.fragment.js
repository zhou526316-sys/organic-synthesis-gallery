  // BEGIN OSG_UPLOAD_EVIDENCE_V1 -- never logs auth or raw response documents.
  function uploadResponseError(status, body, raw, getHeader, transport) {
    body = body && typeof body === 'object' ? body : {};
    var code = autoReportText(body.code || body.detail || body.error || '').slice(0, 240);
    var type = String(getHeader('content-type') || '').split(';')[0].slice(0, 80);
    var ray = String(getHeader('cf-ray') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
    var requestId = String(body.requestId || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
    var responseFormat = /^\s*[\[{]/.test(String(raw || '')) ? 'json' : /^\s*</.test(String(raw || '')) ? 'markup' : 'other';
    var seconds = Number(getHeader('retry-after'));
    var retryAfterMs = seconds > 0 ? seconds * 1000 : 0;
    if (!retryAfterMs && getHeader('retry-after')) retryAfterMs = Math.max(0, Date.parse(getHeader('retry-after')) - Date.now()) || 0;
    var evidence = {transport: transport, responseContentType: type, responseFormat: responseFormat, responseCharacters: String(raw || '').length,
      cfRay: ray || null, workerRequestId: requestId || null, workerCode: code || null,
      storageOperation: String(body.operation || '').replace(/[^a-z_]/gi, '').slice(0, 80),
      objectStored: body.objectStored === true, retryable: typeof body.retryable === 'boolean' ? body.retryable : null,
      retryAfterMs: Math.max(retryAfterMs, Number(body.retryAfterMs || 0))};
    var error = new Error('upload_http_' + String(status || 0) + ':' + (code || 'response_without_worker_error_code') + ';' + JSON.stringify(evidence));
    error.httpStatus = Number(status || 0); error.responseError = code;
    error.uploadEvidence = evidence; error.retryable = evidence.retryable; error.retryAfterMs = evidence.retryAfterMs;
    return error;
  }

  async function fetchPostJson(url, payload, token) {
    var abort = new AbortController();
    var timer = setTimeout(function () { abort.abort(); }, 45000);
    try {
      var response = await fetch(url, {method:'POST',mode:'cors',credentials:'omit',cache:'no-store',signal:abort.signal,
        headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(payload)});
      var raw = await response.text(); var body = {};
      try { body = JSON.parse(raw || '{}'); } catch (_) {}
      if (!response.ok) throw uploadResponseError(response.status, body, raw, function (h) { return response.headers.get(h) || ''; }, 'page_fetch');
      return body;
    } finally { clearTimeout(timer); }
  }

  async function postJson(url, payload, token) {
    var response;
    try {
      response = await gmRequest({method:'POST',url:url,timeout:45000,
        headers:{'content-type':'application/json',authorization:'Bearer '+token},data:JSON.stringify(payload)});
    } catch (gmError) {
      // Do not route around an explicit extension permission denial.
      if (/Request was blocked by the user|Refused to connect.*blocked/i.test(String(gmError && gmError.message || ''))) throw gmError;
      try { return await fetchPostJson(url, payload, token); }
      catch (fetchError) {
        var combined = new Error('gm_then_fetch_failed:' + autoReportText(gmError && gmError.message || gmError) + ';' + autoReportText(fetchError && fetchError.message || fetchError));
        combined.httpStatus = Number(fetchError && fetchError.httpStatus || gmError && gmError.httpStatus || 0);
        combined.responseError = String(fetchError && fetchError.responseError || '');
        combined.uploadEvidence = fetchError && fetchError.uploadEvidence;
        combined.retryable = fetchError && fetchError.retryable;
        combined.retryAfterMs = Number(fetchError && fetchError.retryAfterMs || 0);
        throw combined;
      }
    }
    var raw = String(response.responseText || ''); var body = {};
    try { body = JSON.parse(raw || '{}'); } catch (_) {}
    var status = Number(response.status || 0);
    if (status < 200 || status >= 300) throw uploadResponseError(status, body, raw, function (h) { return headerValue(response.responseHeaders, h); }, 'gm_request');
    return body;
  }

  function retryableImageUpload(error) {
    var message = String(error && error.message || '');
    if (/doi_mismatch|receipt_invalid|stale|unbound|user_aborted|Request was blocked by the user|Refused to connect|upgrade_required|binding_missing/i.test(message) || error && error.retryable === false) return false;
    var status = Number(error && error.httpStatus || 0);
    if ([408,425,429,500,502,503,504].indexOf(status) >= 0) return true;
    return !status && /gm_then_fetch_failed|gm_request_error|Failed to fetch|NetworkError|timeout|AbortError/i.test(message);
  }

  async function postAcquiredImage(job, candidate, image, trace, endpoint, payload, token, stage) {
    for (var attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) assertBoundCaptureJob(job, candidate.url);
      try { return await postJson(endpoint, payload, token); }
      catch (error) {
        pushTrace(trace,{stage:stage,event:'failed',status:'failed',url:endpoint,httpStatus:Number(error && error.httpStatus || 0),
          byteLength:image.byteLength,message:'label='+String(payload.label || payload.kind || '')+';uploadAttempt='+(attempt+1)+';'+String(error && error.message || error)});
        if (attempt >= 2 || !retryableImageUpload(error)) throw error;
        var delay = Math.max(1500 * Math.pow(2, attempt), Number(error.retryAfterMs || 0));
        // Do not violate Retry-After or silently outlive the task; leave the failure queued for later.
        if (delay > 30000 || job.captureDeadline && Date.now() + delay + 1000 >= job.captureDeadline) throw error;
        pushTrace(trace,{stage:stage,event:'upload_retry_wait',status:'retrying',url:endpoint,httpStatus:Number(error.httpStatus || 0),
          message:'same_acquired_image;nextAttempt='+(attempt+2)+';delayMs='+delay+';publisherDownloads=0'});
        captureLiveUpdate(job,'uploading',{label:payload.label || 'TOC',error:'上传暂时失败，保留已下载图片，'+Math.ceil(delay/1000)+'秒后仅重试上传'});
        await sleep(delay);
      }
    }
    throw new Error('image_upload_attempts_exhausted');
  }
  // END OSG_UPLOAD_EVIDENCE_V1
