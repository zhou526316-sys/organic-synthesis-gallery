  // BEGIN OSG_ACQUISITION_V224 -- no new publisher URLs, privileges or storage permissions.
  function inspectCaptureBytes(buffer, declared) {
    var bytes;
    try { bytes = ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength) : new Uint8Array(buffer || new ArrayBuffer(0)); }
    catch (_) { bytes = new Uint8Array(0); }
    var type = String(declared || '').split(';')[0].trim().toLowerCase().replace('image/jpg','image/jpeg');
    var out = {declaredType:type,detectedType:'application/octet-stream',format:'unknown_binary',bytes:bytes.length};
    function found(mime,format) {out.detectedType=mime;out.format=format;return out;}
    if (bytes.length>=8 && [137,80,78,71,13,10,26,10].every(function(v,i){return bytes[i]===v;})) return found('image/png','png');
    if (bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return found('image/jpeg','jpeg');
    if (bytes.length>=12 && String.fromCharCode.apply(null,bytes.slice(0,4))==='RIFF' && String.fromCharCode.apply(null,bytes.slice(8,12))==='WEBP') return found('image/webp','webp');
    var sig=String.fromCharCode.apply(null,bytes.slice(0,6));
    if (sig==='GIF87a'||sig==='GIF89a') return found('image/gif','gif');
    if (bytes.length>=4 && (bytes[0]===73&&bytes[1]===73&&bytes[2]===42&&bytes[3]===0 || bytes[0]===77&&bytes[1]===77&&bytes[2]===0&&bytes[3]===42)) return found('image/tiff','tiff');
    if (bytes.length>=2 && bytes[0]===31&&bytes[1]===139) return found('application/gzip','compressed_response');
    var head='';
    try {head=new TextDecoder('utf-8').decode(bytes.slice(0,16384)).replace(/^\uFEFF/,'').trimStart();}catch(_){}
    // Only an actual SVG root qualifies. XML declarations or nested SVG in HTML do not.
    var prolog=head.replace(/^(?:\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->)+/i,'').trimStart();
    if (/^<svg(?:\s|>)/i.test(prolog)) return found('image/svg+xml','svg');
    if (/^<!doctype\s+html|^<(?:html|head|body)(?:\s|>)/i.test(prolog)) return found('text/html','html_response');
    if (/^<(?:\?|!|[a-z])/i.test(prolog)) return found('application/xml','non_svg_markup');
    if (/^[\[{]/.test(prolog)) return found('application/json','json_response');
    // Do not trust a misleading image/* header. Unknown bytes cannot become a stored image.
    return out;
  }

  function sniffContentType(buffer, declared) {return inspectCaptureBytes(buffer,declared).detectedType;}

  function captureByteEvidence(buffer, declared, trace, stage, url, status) {
    var info=inspectCaptureBytes(buffer,declared);
    pushTrace(trace,{stage:stage,event:'byte_signature',status:info.format,httpStatus:Number(status||0),url:url,
      contentType:info.detectedType,byteLength:info.bytes,
      message:'declared='+info.declaredType+';detected='+info.detectedType+';format='+info.format+';bytes='+info.bytes});
    return info.detectedType;
  }

  function captureEdgeEvidence(raw) {
    // Export allowlisted identifiers only, never HTML text, URLs or cookies.
    var text=String(raw||'').slice(0,65536);
    var match=text.match(/(?:error\s*(?:code)?\s*[:#]?\s*|error-code[^>]*>\s*)(1\d{3})\b/i);
    return {edgeErrorCode:match?match[1]:null,edgeMarkers:[
      ['resource_limit','Worker exceeded resource limits'],['worker_exception','Worker threw exception'],
      ['service_unavailable','Service Unavailable'],['challenge','challenge-platform'],['human_verification','Verify you are human']
    ].filter(function(p){return text.toLowerCase().indexOf(p[1].toLowerCase())>=0;}).map(function(p){return p[0];})};
  }

  function prioritizeBoundVisuals(job,candidates) {
    if (job.publisher!=='acs') return candidates.slice();
    function rank(c) {
      try {
        var u=new URL(c.url),ds=embeddedJobDois(c.url),bound=ds.length===1&&ds[0]===normalizeDoi(job.doi);
        if (u.hostname==='acs.silverchair-cdn.com' && bound && /\/acs\/content_public\//i.test(u.pathname)) {
          return /\.svg$/i.test(u.pathname)?0:/\.(?:png|jpe?g|webp)$/i.test(u.pathname)?1:3;
        }
        if (u.hostname==='pubs.acs.org' && /^\/view-large\//i.test(u.pathname)) return 6;
        return 3;
      }catch(_){return 9;}
    }
    return candidates.map(function(c,i){return {c:c,i:i,r:rank(c)};}).sort(function(a,b){return a.r-b.r||a.i-b.i;}).map(function(x){return x.c;});
  }

  function preferGrantedImageTransport(candidate) {
    try {return new URL(candidate.url).hostname==='acs.silverchair-cdn.com';}catch(_){return false;}
  }

  function pairedPageIncomplete(state,figures) {
    return !figures.length && (state.shell || Number(state.textLength||0)<500);
  }
  // END OSG_ACQUISITION_V224
