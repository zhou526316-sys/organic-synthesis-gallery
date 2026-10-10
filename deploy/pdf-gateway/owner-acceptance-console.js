/*
 * Organic Synthesis Gallery — one-account, read-only Tencent PDF acceptance.
 * Run ONLY after logging into https://gallery.gczhouwld.com in DevTools Console.
 * No secret, signed URL, account ID, PDF bytes, or private document text is logged.
 * Opens one legitimate DOI and requests only bytes 0-15. No full PDF download.
 * Only first-party HTTPS hosts gallery.gczhouwld.com and pdf.gczhouwld.com.
 */
(async function galleryPdfOwnerAcceptance() {
  'use strict';
  const gallery = 'https://gallery.gczhouwld.com';
  const ingress = 'https://pdf.gczhouwld.com';
  const results = {
    network: 'browser current network',
    gatewayHealth: 'not_checked',
    session: 'not_checked',
    authorizeHTTP: 'not_checked',
    available: 'not_checked',
    fileHTTP: 'not_checked',
    range206: false,
    pdfMagic: false,
    error: 'none',
  };
  if (location.origin !== gallery) {
    console.warn('请先在 gallery.gczhouwld.com 的已登录页面打开开发者控制台。');
    return;
  }
  const doi = (prompt('输入已确认在私有库中存储的论文 DOI（不会记录登录密钥）') || '')
    .trim().toLowerCase();
  if (!/^10\.\d{4,9}\/\S+$/.test(doi) || doi.length > 200) {
    console.warn('测试已取消：需要有效 DOI。');
    return;
  }
  const session = localStorage.getItem('organic-gallery-session-v1');
  if (!session) {
    console.warn('当前页面没有登录会话。请先在 Gallery 登录，再运行测试。');
    return;
  }
  const started = performance.now();
  let phase = 'health';
  const safeCode = code => [
    'not_authenticated', 'private_pdf_not_entitled', 'pdf_not_stored',
    'private_pdf_not_stored', 'session_revoked', 'invalid_session',
    'file_ticket_invalid', 'origin_not_allowed',
  ].includes(code) ? code : 'unspecified';
  try {
    const health = await fetch(ingress + '/_pdf_gateway_health', {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(12000),
    });
    const healthBody = health.status === 200 ? await health.json() : null;
    results.gatewayHealth = health.status === 200 &&
      healthBody?.ok === true &&
      healthBody?.role === 'private-pdf-ingress' &&
      healthBody?.authenticated === false ? 'HTTP200_verified' : 'HTTP' + health.status;
    if (results.gatewayHealth !== 'HTTP200_verified') return;
    phase = 'open';
    const openUrl = new URL('/api/user-ui/private-pdf/open', ingress);
    openUrl.searchParams.set('doi', doi);
    openUrl.searchParams.set('mode', 'view');
    const opened = await fetch(openUrl, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + session },
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    });
    results.authorizeHTTP = opened.status;
    if (!opened.ok) {
      const failure = await opened.json().catch(() => ({}));
      results.error = safeCode(failure?.error);
      return;
    }
    const data = await opened.json();
    results.available = data?.available === true;
    if (!results.available) {
      results.error = safeCode(data?.reason);
      return;
    }
    phase = 'file';
    const fileUrl = new URL(data.url);
    if (fileUrl.origin !== ingress || fileUrl.pathname !== '/api/user-ui/private-pdf/file') {
      results.error = 'signed_url_origin_mismatch';
      return;
    }
    // The short-lived signed URL is never printed, persisted or copied.
    const file = await fetch(fileUrl, {
      method: 'GET',
      headers: { range: 'bytes=0-15' },
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    results.fileHTTP = file.status;
    const range = file.headers.get('content-range') || '';
    const type = file.headers.get('content-type') || '';
    results.range206 = file.status === 206 &&
      /^bytes 0-15\/\d+$/.test(range) && /^application\/pdf(?:;|$)/i.test(type);
    if (results.range206) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      results.pdfMagic = bytes.byteLength === 16 &&
        new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
    } else {
      await file.body?.cancel().catch(() => {});
    }
  } catch (error) {
    results.error = phase + '_' +
      (error?.name === 'AbortError' || error?.name === 'TimeoutError'
        ? 'timeout' : 'network_or_cors_error');
  } finally {
    results.elapsedMs = Math.round(performance.now() - started);
    // Only print allowlisted results; no credentials, DOI, cookies or signed URL.
    console.table(results);
  }
})();