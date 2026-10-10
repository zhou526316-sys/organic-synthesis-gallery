/*
 * OWNER-INITIATED READ-ONLY CANARY. Inspect before pasting in Gallery Console.
 * Compare CANONICAL vs TENCENT for a single owner-authorized stored DOI.
 * Never log bearer, DOI, tokens, file URLs, cookies or the PDF body.
 * Each host must independently authorize and mint its OWN short-lived ticket.
 * Two <=1MiB ranges (front + trailer) per host, with a 20s deadline each.
 * No production routing flag, permissions or PDF viewer settings are changed.
 */
(async function galleryPrivatePdfRangeComparison() {
  'use strict';
  const GALLERY = 'https://gallery.gczhouwld.com';
  const CANONICAL = 'https://api.gczhouwld.com';
  const TENCENT = 'https://pdf.gczhouwld.com';
  const SESSION_KEY = 'organic-gallery-session-v1';
  const RANGE_CHUNK_BYTES = 1024 * 1024;
  const MAX_FILE_BYTES = 60 * 1024 * 1024;
  const EXPECTED_MIME = /^application\/pdf(?:\s*;|$)/i;
  const RESULTS = [];
  const first = label => ({route:label,phase:'init',openHTTP:'not_checked',
    openMs:0,bytes:0,hashMatch:'not_checked',frontHTTP:'not_checked',
    frontHeadersMs:0,frontBodyMs:0,frontBytes:0,frontValid:false,
    tailHTTP:'not_checked',tailHeadersMs:0,tailBodyMs:0,tailBytes:0,
    tailValid:false,reason:'none'});
  const canonical = first('primary'), tencent = first('tencent');
  RESULTS.push(canonical,tencent);
  const summarize = () => console.table(RESULTS);
  if (location.origin !== GALLERY) {
    console.warn('请在已登录的 Gallery 页面运行；不能在其他网站运行。');
    return;
  }
  const doi = (prompt('输入已确认入库且之前阅读超时的 DOI') || '')
    .trim().toLowerCase();
  if (!/^10\.\d{4,9}\/\S{1,180}$/.test(doi)) {
    console.warn('DOI 无效或已取消测试。');return;
  }
  const bearer = localStorage.getItem(SESSION_KEY);
  if (!bearer) {
    console.warn('当前 Gallery 账号没有可用登录会话。');return;
  }
  const fetchTimed = async (url, init, ms, record, prefix) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('deadline'), ms);
    const started = performance.now();
    try {
      const response = await fetch(url, {
        ...init, cache:'no-store', redirect:'error', signal:controller.signal,
      });
      record[prefix+'HeadersMs'] = Math.round(performance.now()-started);
      return {response,controller,timer,started};
    } catch(error) {
      clearTimeout(timer);
      record.reason = controller.signal.aborted ? prefix+'_timeout' : prefix+'_network_or_cors';
      return null;
    }
  };
  const getTicket = async (origin, row) => {
    row.phase = 'authorize';
    const u = new URL('/api/user-ui/private-pdf/open',origin);
    u.searchParams.set('doi',doi);
    u.searchParams.set('mode','view');
    const started = performance.now();
    const call = await fetchTimed(u,{
      method:'POST',credentials:'omit',headers:{authorization:'Bearer '+bearer},
    },15000,row,'open');
    if (!call) return null;
    try {
      row.openHTTP = call.response.status;
      if (!call.response.ok) {
        row.reason = [401,403].includes(call.response.status)
          ? 'not_authenticated_or_not_entitled' : 'open_http_error';
        return null;
      }
      const data = await call.response.json();
      row.openMs = Math.round(performance.now()-started);
      if (data?.available !== true) {row.reason='pdf_not_available';return null;}
      const size = Number(data.byteLength);
      const hash = String(data.contentHash || '').toLowerCase();
      const url = new URL(data.url);
      if (!Number.isSafeInteger(size) || size < 16 || size > MAX_FILE_BYTES ||
          !/^[a-f0-9]{64}$/.test(hash) || data.headerVerified !== true ||
          url.origin !== origin ||
          url.pathname !== '/api/user-ui/private-pdf/file' ||
          url.hash || url.username || url.password ||
          [...url.searchParams.keys()].join(',') !== 'token' ||
          !url.searchParams.get('token')) {
        row.reason='ticket_or_identity_unverified';return null;
      }
      row.bytes=size;row.phase='authorized';
      return {url:url.href,size,hash};
    } catch {
      row.reason = call.controller.signal.aborted ? 'open_body_timeout' : 'open_body_invalid';
      return null;
    } finally {
      clearTimeout(call.timer);
    }
  };
  const getRange = async (ticket, label, begin, end, row) => {
    row.phase='range';
    const header = 'bytes='+begin+'-'+(end-1);
    const call = await fetchTimed(ticket.url,{
      method:'GET',credentials:'include',headers:{Range:header},
    },20000,row,label);
    if (!call) return;
    try {
      const res = call.response;
      row[label+'HTTP'] = res.status;
      if (res.status !== 206) {
        row.reason=label+'_not_206';await res.body?.cancel().catch(()=>{});return;
      }
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range')||'');
      if (!match || Number(match[1]) !== begin || Number(match[2]) !== end-1 ||
          Number(match[3]) !== ticket.size ||
          !EXPECTED_MIME.test(res.headers.get('content-type')||'')) {
        row.reason=label+'_headers_invalid';await res.body?.cancel().catch(()=>{});return;
      }
      const actual=Number(res.headers.get('content-length')||0);
      if (actual && actual !== end-begin) {
        row.reason=label+'_length_invalid';await res.body?.cancel().catch(()=>{});return;
      }
      const bytes=new Uint8Array(await res.arrayBuffer());
      row[label+'BodyMs']=Math.round(performance.now()-call.started);
      row[label+'Bytes']=bytes.length;
      const headOk=label!=='front'||new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-';
      row[label+'Valid']=bytes.length===end-begin && headOk;
      if (!row[label+'Valid']) row.reason=label+'_bytes_invalid';
    } catch {
      row.reason=call.controller.signal.aborted ? label+'_body_timeout' : label+'_body_network_error';
    } finally {clearTimeout(call.timer);}
  };
  const primaryTicket=await getTicket(CANONICAL,canonical);
  // Never attempt another host after a confirmed canonical login/rights denial.
  if (!primaryTicket || canonical.openHTTP===401 || canonical.openHTTP===403) {
    tencent.phase='skipped';tencent.reason='canonical_authorize_not_passed';
    summarize();return;
  }
  const tencentTicket=await getTicket(TENCENT,tencent);
  if (!tencentTicket) {summarize();return;}
  const matched=primaryTicket.hash===tencentTicket.hash &&
    primaryTicket.size===tencentTicket.size;
  canonical.hashMatch=tencent.hashMatch=matched;
  if (!matched) {
    canonical.reason=tencent.reason='different_pdf_identity';
    summarize();return;
  }
  const readBoundary = async (ticket,row) => {
    const frontEnd=Math.min(ticket.size,RANGE_CHUNK_BYTES);
    const tailStart=Math.floor((ticket.size-1)/RANGE_CHUNK_BYTES)*RANGE_CHUNK_BYTES;
    const ranges=[getRange(ticket,'front',0,frontEnd,row)];
    if (tailStart !== 0)
      ranges.push(getRange(ticket,'tail',tailStart,ticket.size,row));
    else {
      row.tailHTTP='same_as_front';
      row.tailValid=true;row.tailBytes=0;
    }
    await Promise.all(ranges);
    row.phase=row.frontValid&&row.tailValid?'passed':'failed';
  };
  await Promise.all([
    readBoundary(primaryTicket,canonical),
    readBoundary(tencentTicket,tencent),
  ]);
  summarize();
})();
