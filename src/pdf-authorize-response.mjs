// Authorized PDF /open is a small JSON document. Some HTTP intermediaries
// deliver all JSON bytes but keep the response stream open indefinitely.
// Use exactly the complete advertised Content-Length (when present), or a
// syntactically complete object if the Worker/proxy omits Content-Length.
// Never accept a truncated JSON object, oversized response or foreign origin.
export async function readBoundedPdfOpenJson(response, {maxBytes = 8192} = {}) {
  const max = Math.max(512, Math.min(16384, Number(maxBytes) || 8192));
  if (!response?.body?.getReader) {
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('pdf_authorize_invalid_body');
    return data;
  }
  const declaredHeader = response.headers?.get('content-length') || '';
  const declared = /^\d+$/.test(declaredHeader) ? Number(declaredHeader) : null;
  if (declared !== null && (!Number.isSafeInteger(declared) || declared > max || declared < 2))
    throw new Error('pdf_authorize_invalid_body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let total = 0, serialized = '', atEnd = false;
  try {
    for (;;) {
      const piece = await reader.read();
      if (piece.done) {
        atEnd = true;
        serialized += decoder.decode();
        let obj;
        try {obj=JSON.parse(serialized);} catch {throw new Error('pdf_authorize_invalid_body');}
        if (!obj || typeof obj !== 'object' || Array.isArray(obj) ||
            (declared !== null && total !== declared))
          throw new Error('pdf_authorize_invalid_body');
        return obj;
      }
      const chunk = piece.value || new Uint8Array();
      total += chunk.byteLength;
      if (total > max || (declared !== null && total > declared))
        throw new Error('pdf_authorize_invalid_body');
      try {serialized += decoder.decode(chunk, {stream:true});}
      catch {throw new Error('pdf_authorize_invalid_body');}
      if (declared !== null && total !== declared) continue;
      let obj;
      try {obj=JSON.parse(serialized);} catch {continue;}
      if (!obj || typeof obj !== 'object' || Array.isArray(obj))
        throw new Error('pdf_authorize_invalid_body');
      return obj;
    }
  } finally {
    // Do not await cancel: a bad intermediary may keep cancellation pending
    // just as it kept stream completion pending. Abort controller remains owned
    // by caller and will be cancelled after the verified open result is used.
    if (!atEnd) void reader.cancel('pdf_open_json_parsed').catch(()=>{});
  }
}
