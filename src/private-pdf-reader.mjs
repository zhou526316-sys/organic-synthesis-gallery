const PDF_ENGINE_LOAD_TIMEOUT_MS = 25_000;
let pdfEngine = null;
async function loadPdfEngine() {
  if (pdfEngine) return pdfEngine;
  const started = performance.now();
  let timeoutId = null;
  try {
    const [engine, worker] = await Promise.race([
      Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('pdf_engine_timeout')),
          PDF_ENGINE_LOAD_TIMEOUT_MS);
      }),
    ]);
    engine.GlobalWorkerOptions.workerSrc = worker.default;
    pdfEngine = engine;
    return engine;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    document.documentElement.dataset.privatePdfEngineMs =
      String(Math.round(performance.now() - started));
  }
}

const SESSION_KEY = 'organic-gallery-session-v1';
const API_BASE = 'https://api.gczhouwld.com';
// Same deployed owner Worker, used only if the canonical API is unusually slow.
// Never accept arbitrary redirects or a file URL from an unlisted host.
const API_BACKUP = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
const OPEN_HEDGE_DELAY_MS = 3_500;
const OPEN_TOTAL_TIMEOUT_MS = 15_000;
const ASSET_BASE = '/pdf-vault-assets/6.4.299/';
const MAX_PDF_BYTES = 60 * 1024 * 1024;
const SINGLE_TRANSFER_TIMEOUT_MS = 90_000;
const ADAPTIVE_RANGE_THRESHOLD_BYTES = 3 * 1024 * 1024;
const FIRST_PAGE_TIMEOUT_MS = 45_000;
const FIRST_PAGE_RANGE_CHUNK_BYTES = 1024 * 1024;
const RANGE_TIMEOUT_MS = 30_000;
const PREFETCH_TIMEOUT_MS = 24_000;
// Small PDFs can stall on one long China-to-edge response.
// Fetch independent bounded byte ranges concurrently; keep the full-GET
// fallback if an older endpoint or proxy does not support ranges.
const SMALL_PDF_PARALLEL_THRESHOLD_BYTES = 512 * 1024;
const SMALL_PDF_RANGE_CHUNK_BYTES = 384 * 1024;
const SMALL_PDF_MAX_PARALLEL = 4;
let privatePdfRangeNetworkCalls = 0;
let privatePdfRangeNetworkBytes = 0;


const params = new URLSearchParams(location.search);
const doi = String(params.get('doi') || '').trim().toLowerCase();
const fallback = params.get('fallback') || '';
const compatibilityMode = params.get('compat') === '1';
const nativeMode = params.get('native') === '1' && !compatibilityMode;
const forceFull = params.get('full') === '1' && !nativeMode && !compatibilityMode;
const downloadOnOpen = params.get('mode') === 'download';
const canvas = document.querySelector('#pdf-canvas');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const zoomOut = document.querySelector('#zoom-out');
const zoomIn = document.querySelector('#zoom-in');
const zoomLabel = document.querySelector('#zoom');
const pageCount = document.querySelector('#page-count');
const compatibility = document.querySelector('#compatibility');
const fullOpen = document.querySelector('#full-open');
const browserOpen = document.querySelector('#browser-open');
const download = document.querySelector('#download');
document.querySelector('#doi').textContent = doi;

let loadingTask = null;
let pdf = null;
let renderTask = null;
let pageNumber = 1;
let zoom = 1;
let renderSequence = 0;
let sourceUrl = '';
let declaredPdfBytes = 0;
let transferController = null;
let activeRangeTransport = null;
let rangeFailure = null;
let destroyed = false;
let phase = 'init';
const startedAt = performance.now();

function token() {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}
function safeFallback() {
  try {
    const url = new URL(fallback, location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function compatibilityHref() {
  const url = new URL(location.href);
  url.searchParams.set('compat', '1');
  url.searchParams.delete('native');
  url.searchParams.delete('full');
  url.searchParams.delete('mode');
  return url.toString();
}
function fullHref() {
  const url = new URL(location.href);
  url.searchParams.set('full', '1');
  url.searchParams.delete('compat');
  url.searchParams.delete('native');
  url.searchParams.delete('mode');
  return url.toString();
}
function browserHref() {
  const url = new URL(location.href);
  url.searchParams.delete('compat');
  url.searchParams.set('native', '1');
  url.searchParams.delete('mode');
  return url.toString();
}
function controls() {
  const ready = Boolean(pdf) && !destroyed;
  previous.disabled = !ready || pageNumber <= 1;
  next.disabled = !ready || pageNumber >= (pdf?.numPages || 0);
  zoomOut.disabled = !ready || zoom <= 0.5;
  zoomIn.disabled = !ready || zoom >= 3;
  pageCount.textContent = pdf ? `第 ${pageNumber} / ${pdf.numPages} 页` : '—';
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}
function setPhase(next, message = '') {
  phase = next;
  document.documentElement.dataset.privatePdfPhase = next;
  if (message && !status.hidden) status.textContent = message;
}
function safeErrorCode(error) {
  if (error?.notAvailable) return 'not_available';
  const name = String(error?.name || '');
  if (['PasswordException','InvalidPDFException','MissingPDFException','UnexpectedResponseException','UnknownErrorException'].includes(name)) return name;
  const message = String(error?.message || '');
  if (/^(?:open|file)_http_\d+$/.test(message)) return message;
  if (['pdf_source_invalid','pdf_page_tree','pdf_invalid_bytes','pdf_wrong_content_type',
       'pdf_range_unavailable','pdf_too_large','pdf_incomplete_bytes','pdf_transfer_timeout',
       'pdf_first_page_timeout','pdf_engine_timeout','pdf_authorize_timeout',
       'pdf_authorize_network_error'].includes(message)) return message;
  if (name === 'AbortError' || name === 'TimeoutError') return 'pdf_transfer_timeout';
  return 'reader_error';
}
function fallbackView(message = '该论文暂时无法读取私有 PDF。', detail = '') {
  const url = safeFallback();
  status.replaceChildren();
  const text = document.createElement('div');
  text.textContent = message;
  status.appendChild(text);
  const elapsed = Math.max(0, performance.now() - startedAt);
  const diagnostic = document.createElement('small');
  diagnostic.id = 'pdf-diagnostic';
  const timingDetails = [
    ['privatePdfAuthorizeMs', '授权', 'ms'],
    ['privatePdfEngineMs', '阅读组件', 'ms'],
    ['privatePdfTransferMs', '文件传输', 'ms'],
    ['privatePdfRangeCalls', '分段请求', '次'],
    ['privatePdfRangeHeaderMs', '分段响应', 'ms'],
    ['privatePdfRangeBytes', '已读字节', 'B'],
    ['privatePdfRangeNetworkBytes', '传输字节', 'B'],
  ].flatMap(([key, label, unit]) => {
    const value = document.documentElement.dataset[key] || '';
    return /^\d{1,12}$/.test(value) ? [`${label}:${value}${unit}`] : [];
  });
  const route = document.documentElement.dataset.privatePdfAuthorizePath || '';
  diagnostic.textContent = `阶段：${phase} · ${detail || 'unknown'} · ${(elapsed / 1000).toFixed(1)}s` +
    (timingDetails.length ? ' · ' + timingDetails.join(' · ') : '') +
    (['primary', 'backup', 'both-failed'].includes(route) ? ` · 授权线路:${route}` : '');
  status.appendChild(diagnostic);
  if (['pdf_authorize_timeout','pdf_authorize_network_error'].includes(detail)) {
    const attempts = document.documentElement.dataset.privatePdfAuthAttempts || '';
    if (attempts && attempts.length < 360) {
      const breakdown = document.createElement('small');
      breakdown.id = 'pdf-auth-attempts';
      breakdown.textContent = '授权请求：' + attempts;
      status.appendChild(breakdown);
    }
    const probe = document.createElement('small');
    probe.id = 'pdf-anonymous-network-probe';
    probe.textContent = '正在检查两条公开网络线路（不携带账号或 PDF 信息）…';
    status.appendChild(probe);
    void checkAnonymousGatewayHealth().then(result => {
      if (!destroyed && probe.isConnected) probe.textContent = result;
    }).catch(() => {
      if (!destroyed && probe.isConnected) probe.textContent = '公开网络线路检查暂时不可用';
    });
  }
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新读取';
  retry.addEventListener('click', () => location.reload());
  status.appendChild(retry);
  if (url) {
    const link = document.createElement('a');
    link.id = 'publisher-fallback';
    link.href = url;
    link.rel = 'noopener noreferrer';
    link.textContent = '打开出版社原文 ↗';
    status.appendChild(link);
  }
  status.className = 'bad';
  status.hidden = false;
  document.documentElement.dataset.privatePdfViewer = 'error';
}
function options(source) {
  return {
    ...source,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
    useWorkerFetch: false,
    useSystemFonts: true,
    isEvalSupported: false,
    enableXfa: false,
    // Prioritize time-to-first-page. Fetch only ranges that PDF.js actually
    // needs instead of filling the rest of a multi-megabyte article in the
    // background before the user can read anything.
    disableAutoFetch: true,
    disableRange: false,
    disableStream: true,
    rangeChunkSize: 512 * 1024,
    stopAtErrors: false,
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
    verbosity: 0,
  };
}
async function render() {
  if (!pdf || destroyed) return;
  const seq = ++renderSequence;
  const old = renderTask;
  old?.cancel();
  if (old) await old.promise.catch(() => {});
  if (seq !== renderSequence || destroyed) return;
  setPhase('render', pageNumber === 1 ? '正在绘制第一页…' : `正在绘制第 ${pageNumber} 页…`);
  const page = await pdf.getPage(pageNumber);
  if (seq !== renderSequence || destroyed) return;
  const base = page.getViewport({ scale: 1 });
  const available = Math.max(180, stage.clientWidth - 12);
  const displayScale = Math.min(1.6, available / base.width) * zoom;
  const cssWidth = base.width * displayScale;
  const cssHeight = base.height * displayScale;
  const outputScale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(14_000_000 / Math.max(1, cssWidth * cssHeight)), 8192 / Math.max(cssWidth, cssHeight));
  const viewport = page.getViewport({ scale: displayScale * outputScale });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${Math.round(cssWidth)}px`;
  canvas.style.height = `${Math.round(cssHeight)}px`;
  const task = page.render({ canvas, viewport, annotationMode: pdfEngine.AnnotationMode.ENABLE });
  renderTask = task;
  try {
    await task.promise;
  } finally {
    if (renderTask === task) renderTask = null;
  }
  if (seq !== renderSequence || destroyed) return;
  canvas.dataset.renderedPage = String(pageNumber);
  status.hidden = true;
  document.documentElement.dataset.privatePdfViewer = 'ready';
  document.documentElement.dataset.privatePdfReadyMs = String(Math.round(performance.now() - startedAt));
  setPhase('ready');
  stage.parentElement.scrollTop = 0;
  controls();
}

async function checkAnonymousGatewayHealth() {
  const gateways = [['主线', API_BASE], ['备用', API_BACKUP]];
  const results = await Promise.all(gateways.map(async ([label, origin]) => {
    const start = performance.now();
    try {
      const response = await fetch(origin + '/api/_healthcheck', {
        method: 'GET', credentials: 'omit', cache: 'no-store',
        signal: AbortSignal.timeout(3500),
      });
      const elapsed = Math.round(performance.now() - start);
      return label + ':' + (response.ok ? '在线' : 'HTTP' + response.status) + '/' + elapsed + 'ms';
    } catch {
      return label + ':超时或网络故障';
    }
  }));
  return '公开网络检查（不代表授权成功）：' + results.join('，');
}

function sanitizedOpenServerTiming(raw) {
  const allowed = new Set(['session','capability','document','r2_get','r2_body',
    'ticket_create','ticket_check','legacy_write','total']);
  if (typeof raw !== 'string' || raw.length > 500) return '';
  return raw.split(',').flatMap(segment => {
    const m = /^\s*([a-z0-9_]+);dur=(\d{1,6})\s*$/.exec(segment);
    return m && allowed.has(m[1]) ? [m[1] + '=' + m[2] + 'ms'] : [];
  }).join(', ');
}
async function fetchAuthorizedSource(origin, sessionToken, mode, controller, onHeaders) {
  const openUrl = new URL('/api/user-ui/private-pdf/open', origin);
  openUrl.searchParams.set('doi', doi);
  openUrl.searchParams.set('mode', mode);
  const opened = await fetch(openUrl, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + sessionToken },
    credentials: 'omit',
    cache: 'no-store',
    signal: controller.signal,
  });
  onHeaders?.(opened.status, sanitizedOpenServerTiming(opened.headers.get('server-timing')));
  if (!opened.ok) throw new Error('open_http_' + opened.status);
  const data = await opened.json();
  if (!data || data.available !== true || typeof data.url !== 'string') {
    const error = new Error('not_available');
    error.notAvailable = true;
    throw error;
  }
  const url = new URL(data.url, origin);
  if (url.origin !== origin || url.pathname !== '/api/user-ui/private-pdf/file' ||
      (mode === 'download') !== (url.searchParams.get('download') === '1')) {
    throw new Error('pdf_source_invalid');
  }
  const size = Number(data.byteLength);
  return {
    url: url.toString(),
    headerVerified: data.headerVerified === true,
    byteLength: Number.isSafeInteger(size) && size >= 0 ? size : 0,
  };
}

async function getPdfSource(sessionToken, mode = 'view') {
  const origins = [API_BASE, API_BACKUP];
  const controllers = origins.map(() => new AbortController());
  document.documentElement.dataset.privatePdfAuthorizePath = '';
  let hedgeTimer = null, deadlineTimer = null;
  let backupStarted = false, pending = 0, finished = false;
  const errors = [];
  const attempts = [
    { label: 'primary', started: 0, elapsed: 0, result: '未发起', stages: '' },
    { label: 'backup', started: 0, elapsed: 0, result: '未发起', stages: '' },
  ];
  const saveAttempts = () => {
    const at = performance.now();
    document.documentElement.dataset.privatePdfAuthAttempts = attempts.map(a => {
      const ms = a.started ? Math.round(a.elapsed || at - a.started) : 0;
      const state = a.started && a.result === '等待' ? '无响应' : a.result;
      return a.label + ':' + state + '/' + ms + 'ms' +
        (a.stages ? '[' + a.stages + ']' : '');
    }).join('；').slice(0,350);
  };

  const result = await new Promise((resolve, reject) => {
    const finish = (value, error, route = '') => {
      if (finished) return;
      finished = true;
      if (hedgeTimer !== null) clearTimeout(hedgeTimer);
      if (deadlineTimer !== null) clearTimeout(deadlineTimer);
      document.documentElement.dataset.privatePdfAuthorizePath = route ||
        (error ? 'both-failed' : '');
      saveAttempts();
      for (const controller of controllers) controller.abort('open_complete');
      if (error) reject(error);
      else resolve(value);
    };
    const launch = index => {
      if (finished || (index === 1 && backupStarted)) return;
      if (index === 1) backupStarted = true;
      const attempt = attempts[index];
      attempt.started = performance.now();
      attempt.result = '等待';
      pending++;
      void fetchAuthorizedSource(origins[index], sessionToken, mode, controllers[index],
        (status, stages) => { attempt.result = 'HTTP' + status; attempt.stages = stages; })
        .then(source => {
          attempt.elapsed = Math.round(performance.now() - attempt.started);
          attempt.result = '完成';
          finish(source, null, index === 0 ? 'primary' : 'backup');
        })
        .catch(error => {
          if (finished) return;
          attempt.elapsed = Math.round(performance.now() - attempt.started);
          if (attempt.result === '等待') attempt.result = '网络失败';
          pending--;
          // Never route around an explicit permission denial or a verified
          // absence of a private file. Both endpoints enforce the same policy.
          const explicitDenial = error?.notAvailable ||
            /^open_http_(401|403)$/.test(error?.message || '') ||
            error?.message === 'pdf_source_invalid';
          // The canonical endpoint is authoritative. A secondary gateway
          // may be temporarily out of sync: never let its denial cancel a
          // still-running canonical request. A primary denial is final.
          if (index === 0 && explicitDenial) {
            finish(null, error, 'primary');
            return;
          }
          errors.push(error);
          if (index === 0 && !backupStarted) {
            if (hedgeTimer !== null) clearTimeout(hedgeTimer);
            launch(1);
          }
          if (pending === 0 && backupStarted) {
            const status = errors.find(e => /^open_http_(5\d\d|429)$/.test(e?.message || ''));
            finish(null, new Error(status?.message || 'pdf_authorize_network_error'));
          }
        });
    };
    deadlineTimer = setTimeout(() => finish(null, new Error('pdf_authorize_timeout')),
      OPEN_TOTAL_TIMEOUT_MS);
    hedgeTimer = setTimeout(() => launch(1), OPEN_HEDGE_DELAY_MS);
    launch(0);
  });

  declaredPdfBytes = result.byteLength;
  document.documentElement.dataset.privatePdfDeclaredBytes = String(declaredPdfBytes);
  return { url: result.url, headerVerified: result.headerVerified };
}
async function checkPdfHeader(fileUrl) {
  // Check the actual PDF bytes rather than treating an iframe DOM node or a
  // header-only 200 as evidence of a readable document. Credentialed fetch
  // also establishes a secure, HttpOnly native-reading continuation cookie.
  const response = await fetch(fileUrl, {
    method: 'GET',
    headers: { range: 'bytes=0-15' },
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('file_http_' + response.status);
  if (response.status !== 206) {
    await response.body?.cancel().catch(() => {});
    throw new Error('pdf_range_unavailable');
  }
  if (!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel().catch(() => {});
    throw new Error('pdf_wrong_content_type');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  if (head !== '%PDF-') throw new Error('pdf_invalid_bytes');
}
async function fetchValidatedPdfRange(fileUrl, byteLength, begin, end, controller) {
  const requestStarted = performance.now();
  privatePdfRangeNetworkCalls += 1;
  document.documentElement.dataset.privatePdfRangeCalls = String(privatePdfRangeNetworkCalls);
  const response = await fetch(fileUrl, {
    headers: { range: `bytes=${begin}-${end - 1}` },
    credentials: 'include',
    cache: 'no-store',
    signal: controller.signal,
  });
  document.documentElement.dataset.privatePdfRangeHeaderMs =
    String(Math.round(performance.now() - requestStarted));
  if (!response.ok) throw new Error('file_http_' + response.status);
  if (response.status !== 206) throw new Error('pdf_range_unavailable');
  if (!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    throw new Error('pdf_wrong_content_type');
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!match || Number(match[1]) !== begin || Number(match[2]) !== end - 1 ||
      Number(match[3]) !== byteLength) {
    throw new Error('pdf_range_unavailable');
  }
  const chunk = new Uint8Array(await response.arrayBuffer());
  if (chunk.byteLength !== end - begin) throw new Error('pdf_incomplete_bytes');
  privatePdfRangeNetworkBytes += chunk.byteLength;
  document.documentElement.dataset.privatePdfRangeNetworkBytes = String(privatePdfRangeNetworkBytes);
  return chunk;
}
function prefetchPdfBoundaryRanges(fileUrl, byteLength) {
  // Non-linearized PDFs often need their trailer/xref before page one.
  // Issue the first and last 1 MiB requests together instead of waiting
  // through two consecutive browser-to-edge round trips. PDF.js only
  // receives validated ranges it actually requested; unused bytes are
  // bounded to at most 2 MiB, never persisted to disk or shared.
  const chunkSize = FIRST_PAGE_RANGE_CHUNK_BYTES;
  const suffixStart = Math.floor((byteLength - 1) / chunkSize) * chunkSize;
  const candidates = [[0, Math.min(chunkSize, byteLength)], [suffixStart, byteLength]];
  const pending = new Map();
  const controllers = new Set();
  for (const [begin, end] of candidates) {
    const key = `${begin}:${end}`;
    if (pending.has(key)) continue;
    const controller = new AbortController();
    controllers.add(controller);
    const timeoutId = window.setTimeout(() => controller.abort('prefetch_timeout'), PREFETCH_TIMEOUT_MS);
    const promise = fetchValidatedPdfRange(fileUrl, byteLength, begin, end, controller)
      .then(chunk => ({ chunk }), error => ({
        error: controller.signal.aborted ? new Error('pdf_transfer_timeout') : error,
      }))
      .finally(() => {
        window.clearTimeout(timeoutId);
        controllers.delete(controller);
      });
    pending.set(key, promise);
  }
  return {
    consume(begin, end) { return pending.get(`${begin}:${end}`) || null; },
    abort() {
      for (const controller of controllers) controller.abort('prefetch_cancelled');
      controllers.clear();
    },
  };
}
function makeAuthenticatedRangeTransport(engine, fileUrl, byteLength, sessionToken, warmup = null) {
  // PDF.js's URL transport always starts with a regular GET, which can
  // force a full transfer before its first Range request. The dedicated
  // transport never issues that initial unbounded request.
  class AuthenticatedRangeTransport extends engine.PDFDataRangeTransport {
    constructor() {
      super(byteLength, null, true);
      this.fileUrl = fileUrl;
      this.controllers = new Set();
      this.refreshPromise = null;
      this.totalFetched = 0;
      this.warmup = warmup;
      // PDF.js sometimes leaves loadingTask.promise unsettled after destroy().
      // Expose an independent terminal error signal to the page controller.
      this.failed = new Promise((_, reject) => { this.rejectFailure = reject; });
      this.failed.catch(() => {}); // protect errors before the reader awaits the race
    }
    async refreshUrl() {
      if (!this.refreshPromise) {
        this.refreshPromise = getPdfSource(sessionToken, 'view').then(source => {
          if (declaredPdfBytes !== byteLength) throw new Error('pdf_incomplete_bytes');
          this.fileUrl = source.url;
          return this.fileUrl;
        }).finally(() => { this.refreshPromise = null; });
      }
      return this.refreshPromise;
    }
    requestDataRange(begin, end) {
      if (destroyed || sessionToken !== token()) return;
      if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) ||
          begin < 0 || end <= begin || end > byteLength) {
        this.fail(new Error('pdf_range_unavailable'));
        return;
      }
      const controller = new AbortController();
      this.controllers.add(controller);
      void this.fetchRange(begin, end, controller).catch(error => {
        // A transport-owned 30s timeout must fail the reader immediately.
        // Only lifecycle cancellation (tab closing, navigation, teardown)
        // should suppress the error; otherwise PDF.js hangs until 45s.
        const timedOut = controller.signal.aborted && controller.signal.reason === 'range_timeout';
        if (!destroyed && (!controller.signal.aborted || timedOut)) this.fail(error);
      }).finally(() => this.controllers.delete(controller));
    }
    async fetchRange(begin, end, controller) {
      const cached = this.warmup?.consume(begin, end);
      if (cached) {
        const result = await cached;
        if (destroyed || controller.signal.aborted || sessionToken !== token()) return;
        if (result.chunk) {
          this.acceptRange(begin, result.chunk);
          return;
        }
        // An aborted warmup is a real time budget breach, not a reason
        // to wait for another 30-second attempt at the same bytes.
        if (result.error?.message === 'pdf_transfer_timeout') throw result.error;
      }
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted || destroyed || token() !== sessionToken) return;
        const kill = window.setTimeout(() => controller.abort('range_timeout'), RANGE_TIMEOUT_MS);
        try {
          const chunk = await fetchValidatedPdfRange(this.fileUrl, byteLength, begin, end, controller);
          if (controller.signal.aborted || destroyed || token() !== sessionToken) return;
          this.acceptRange(begin, chunk);
          return;
        } catch (error) {
          lastError = error;
          if (controller.signal.aborted) break;
          if (error?.message === 'file_http_401' && attempt === 0) {
            await this.refreshUrl();
            continue;
          }
          // Retry one transient transport request. A 403, 404, malformed
          // Content-Range or HTML instead of a PDF are never retried.
          if (attempt === 0 && !/^(?:file_http_(401|403|404)|pdf_range_unavailable|pdf_wrong_content_type)$/.test(error?.message || '')) {
            continue;
          }
          break;
        } finally {
          window.clearTimeout(kill);
        }
      }
      if (!controller.signal.aborted && !destroyed) throw lastError || new Error('pdf_transfer_timeout');
      if (controller.signal.aborted && !destroyed) throw new Error('pdf_transfer_timeout');
    }
    acceptRange(begin, chunk) {
      if (destroyed) return;
      this.totalFetched += chunk.byteLength;
      document.documentElement.dataset.privatePdfRangeBytes = String(this.totalFetched);
      setPhase('range', `正在按需读取第一页… 已取 ${(this.totalFetched / 1048576).toFixed(1)} MB`);
      this.onDataRange(begin, chunk);
    }
    fail(error) {
      if (rangeFailure || destroyed) return;
      rangeFailure = error;
      this.rejectFailure(error);
      void loadingTask?.destroy().catch(() => {});
      this.abort();
    }
    abort() {
      this.warmup?.abort();
      for (const controller of this.controllers) controller.abort();
      this.controllers.clear();
    }
  }
  return new AuthenticatedRangeTransport();
}
async function fetchPdfParallelTransfer(fileUrl, sessionToken, byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength < SMALL_PDF_PARALLEL_THRESHOLD_BYTES ||
      byteLength > ADAPTIVE_RANGE_THRESHOLD_BYTES) {
    throw new Error('pdf_source_invalid');
  }
  const controller = new AbortController();
  transferController = controller;
  const started = performance.now();
  const deadline = window.setTimeout(() => controller.abort('pdf_transfer_timeout'),
    SINGLE_TRANSFER_TIMEOUT_MS);
  const ranges = Math.ceil(byteLength / SMALL_PDF_RANGE_CHUNK_BYTES);
  const parts = new Array(ranges);
  let next = 0, loaded = 0;
  document.documentElement.dataset.privatePdfTransferStrategy = 'parallel-ranges';
  setPhase('transfer', '正在并行获取 PDF…');
  try {
    async function fetchPart() {
      while (!controller.signal.aborted && !destroyed && sessionToken === token()) {
        const index = next++;
        if (index >= ranges) return;
        const begin = index * SMALL_PDF_RANGE_CHUNK_BYTES;
        const end = Math.min(byteLength, begin + SMALL_PDF_RANGE_CHUNK_BYTES);
        const chunk = await fetchValidatedPdfRange(fileUrl, byteLength, begin, end, controller);
        if (controller.signal.aborted || destroyed || sessionToken !== token()) {
          throw new Error('pdf_transfer_timeout');
        }
        parts[index] = chunk;
        loaded += chunk.byteLength;
        setPhase('transfer', `正在并行获取 PDF：${(loaded / 1048576).toFixed(1)} / ${(byteLength / 1048576).toFixed(1)} MB`);
      }
      if (controller.signal.aborted || destroyed || sessionToken !== token()) {
        throw new Error('pdf_transfer_timeout');
      }
    }
    await Promise.all(Array.from({ length: Math.min(SMALL_PDF_MAX_PARALLEL, ranges) },
      () => fetchPart()));
    if (loaded !== byteLength || parts.some(part => !part)) {
      throw new Error('pdf_incomplete_bytes');
    }
    const output = new Uint8Array(byteLength);
    let cursor = 0;
    for (const part of parts) {
      output.set(part, cursor);
      cursor += part.byteLength;
    }
    if (String.fromCharCode(...output.subarray(0, 5)) !== '%PDF-') {
      throw new Error('pdf_invalid_bytes');
    }
    document.documentElement.dataset.privatePdfTransferMs =
      String(Math.round(performance.now() - started));
    document.documentElement.dataset.privatePdfTransferBytes = String(loaded);
    return output;
  } catch (error) {
    controller.abort('parallel_failed');
    if (destroyed || sessionToken !== token() ||
        controller.signal.reason === 'pdf_transfer_timeout') {
      throw new Error('pdf_transfer_timeout');
    }
    // Only fallback for protocol incompatibility, not expired permissions
    // or an extremely slow data path that would waste another full transfer.
    if (['pdf_range_unavailable', 'pdf_wrong_content_type'].includes(error?.message)) {
      document.documentElement.dataset.privatePdfTransferStrategy = 'single-fallback';
      return await fetchPdfSingleTransfer(fileUrl, sessionToken);
    }
    throw error;
  } finally {
    window.clearTimeout(deadline);
    if (transferController === controller) transferController = null;
  }
}
async function fetchPdfSingleTransfer(fileUrl, sessionToken) {
  const started = performance.now();
  const controller = new AbortController();
  transferController = controller;
  const timeout = window.setTimeout(() => controller.abort('pdf_transfer_timeout'),
    SINGLE_TRANSFER_TIMEOUT_MS);
  try {
    setPhase('transfer', '正在快速获取 PDF…');
    const response = await fetch(fileUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('file_http_' + response.status);
    if (response.status !== 200) throw new Error('pdf_range_unavailable');
    if (!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel().catch(() => {});
      throw new Error('pdf_wrong_content_type');
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_PDF_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new Error('pdf_too_large');
    }
    const parts = [];
    let loaded = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (destroyed || sessionToken !== token()) {
          await reader.cancel().catch(() => {});
          throw new Error('pdf_transfer_timeout');
        }
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        loaded += chunk.byteLength;
        if (loaded > MAX_PDF_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error('pdf_too_large');
        }
        parts.push(chunk);
        const readMb = (loaded / 1048576).toFixed(1);
        const expected = length ? ` / ${(length / 1048576).toFixed(1)} MB` : ' MB';
        setPhase('transfer', `正在快速获取 PDF：${readMb}${expected}`);
      }
    } else {
      const chunk = new Uint8Array(await response.arrayBuffer());
      parts.push(chunk);
      loaded = chunk.byteLength;
    }
    if (loaded < 8 || (length && loaded !== length)) throw new Error('pdf_incomplete_bytes');
    const output = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of parts) { output.set(chunk, offset); offset += chunk.length; }
    parts.length = 0;
    if (String.fromCharCode(...output.subarray(0, 5)) !== '%PDF-') {
      throw new Error('pdf_invalid_bytes');
    }
    document.documentElement.dataset.privatePdfTransferMs = String(Math.round(performance.now() - started));
    document.documentElement.dataset.privatePdfTransferBytes = String(loaded);
    return output;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('pdf_transfer_timeout');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    if (transferController === controller) transferController = null;
  }
}
async function verifiedPdfSource(sessionToken, mode = 'view') {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const source = await getPdfSource(sessionToken, mode);
    // The updated Worker has already checked R2 object size, the %PDF-
    // signature and a self-tested v2 ticket within the authorized POST.
    // Avoid a second China-to-edge roundtrip. An older Worker or a legacy
    // opaque ticket must still use the independent 206 file preflight.
    if (source.headerVerified) {
      document.documentElement.dataset.privatePdfPreflight = 'edge';
      return source.url;
    }
    try {
      setPhase('preflight', mode === 'download' ? '正在确认下载文件…' : '正在确认 PDF 文件响应…');
      await checkPdfHeader(source.url);
      document.documentElement.dataset.privatePdfPreflight = 'browser';
      return source.url;
    } catch (error) {
      lastError = error;
      // Refresh a rejected short-lived ticket once, but never loop on 404,
      // invalid bytes or broken Range support. No raw URL is logged or shown.
      if (attempt === 0 && /^file_http_(401|403)$/.test(String(error?.message))) continue;
      throw error;
    }
  }
  throw lastError;
}
function showReaderError(error, prefix = 'PDF 读取失败') {
  if (destroyed) return;
  const code = safeErrorCode(error);
  document.documentElement.dataset.privatePdfError = code;
  let message = prefix + '，请重试。';
  if (error?.notAvailable) message = '该论文暂无可读取的私有 PDF，请返回 Gallery 或打开出版社原文。';
  else if (/^open_http_401$|^file_http_401$/.test(code)) message = 'PDF 临时授权失败或已过期，请重新读取。';
  else if (/^open_http_403$|^file_http_403$/.test(code)) message = '当前账号没有此 PDF 的访问权限，请返回 Gallery 重新验证。';
  else if (code === 'pdf_invalid_bytes' || code === 'pdf_wrong_content_type') message = '文件响应并非有效 PDF，已阻止打开错误页面。';
  else if (code === 'pdf_range_unavailable') message = 'PDF 文件服务不支持分段读取，暂时无法可靠打开。';
  else if (code === 'file_http_404') message = '私有 PDF 文件未找到，下载记录可能需要修复。';
  else if (code === 'pdf_authorize_timeout') message = 'PDF 授权接口在15秒内未响应，尚未开始传输文件。请稍后重新读取。';
  else if (code === 'pdf_authorize_network_error') message = 'PDF 授权接口连接失败，尚未开始传输文件。请检查网络或稍后重试。';
  else if (code === 'pdf_transfer_timeout') message = '文件传输超时。可试用上方“整份下载后阅读”或下载 PDF；请记录阶段及耗时。';
  else if (code === 'pdf_too_large') message = '文件较大，建议点击上方“浏览器阅读”以原生模式打开。';
  else if (code === 'pdf_incomplete_bytes') message = '文件传输不完整，请重新读取或尝试浏览器阅读。';
  else if (code === 'pdf_first_page_timeout') message = '按需读取第一页超过45秒。可点击“整份下载后阅读”尝试另一条路径，或使用下载 PDF。';
  else if (code === 'pdf_engine_timeout') message = 'PDF 阅读组件加载超过25秒，请重新读取或检查网络；也可尝试浏览器阅读。';
  fallbackView(message, code);
}
let downloadBusy = false;
async function beginDownload() {
  if (downloadBusy || destroyed) return;
  const sessionToken = token();
  if (!sessionToken) { fallbackView('请先登录 Gallery 账号后下载 PDF。', 'signed_out'); return; }
  downloadBusy = true;
  download.disabled = true;
  download.textContent = '正在准备下载…';
  try {
    const downloadUrl = await verifiedPdfSource(sessionToken, 'download');
    if (destroyed || sessionToken !== token()) return;
    document.documentElement.dataset.privatePdfDownload = 'started';
    // The endpoint now sends Content-Disposition: attachment. Navigate rather
    // than opening an empty target=_blank tab and calling inline PDF "download".
    location.assign(downloadUrl);
  } catch (error) {
    showReaderError(error, 'PDF 下载失败');
  } finally {
    downloadBusy = false;
    download.disabled = false;
    download.textContent = '下载 PDF';
  }
}
async function start() {
  if (!/^10\.\d{4,9}\/.+/.test(doi)) { fallbackView('DOI 无效。'); return; }
  const sessionToken = token();
  if (!sessionToken) { fallbackView('请先在 Gallery 登录后再读取私有 PDF。'); return; }
  compatibility.href = compatibilityHref();
  compatibility.hidden = compatibilityMode || downloadOnOpen;
  fullOpen.href = fullHref();
  fullOpen.hidden = true;
  browserOpen.href = browserHref();
  browserOpen.hidden = nativeMode || downloadOnOpen;
  browserOpen.textContent = '浏览器阅读';
  download.hidden = false;
  if (downloadOnOpen) { await beginDownload(); return; }
  let rangeWarmup = null;
  // Importing the public PDF.js reader can overlap with private authorization,
  // avoiding a second serial request on high-latency networks.
  const enginePromise = nativeMode ? null : loadPdfEngine();
  enginePromise?.catch(() => {}); // authorization might fail before we await it
  try {
    setPhase('authorize', '正在确认 PDF 权限…');
    const authorizeStarted = performance.now();
    try {
      sourceUrl = await verifiedPdfSource(sessionToken, 'view');
    } finally {
      document.documentElement.dataset.privatePdfAuthorizeMs =
        String(Math.round(performance.now() - authorizeStarted));
    }
    if (destroyed || token() !== sessionToken) return;
    if (nativeMode) {
      document.documentElement.dataset.privatePdfMode = 'native';
      document.documentElement.dataset.privatePdfViewer = 'handoff';
      setPhase('native-handoff', '正在打开浏览器 PDF 阅读器…');
      location.replace(sourceUrl + '#page=1&zoom=page-width');
      return;
    }
    // Small documents are more reliable with one full fetch. Large PDFs
    // must NOT block the first page on a complete China-to-Cloudflare transfer.
    const rangeMode = declaredPdfBytes > 0 && (compatibilityMode ||
      (!forceFull && declaredPdfBytes > ADAPTIVE_RANGE_THRESHOLD_BYTES));
    const buffered = !rangeMode;
    const parallelSmall = buffered && !forceFull &&
      declaredPdfBytes >= SMALL_PDF_PARALLEL_THRESHOLD_BYTES &&
      declaredPdfBytes <= ADAPTIVE_RANGE_THRESHOLD_BYTES;
    // Warm up the first and last chunks as soon as the edge authorizes the
    // document; PDF.js parsing then uses these bytes without waiting for a
    // second serial cross-border round trip.
    rangeWarmup = rangeMode ? prefetchPdfBoundaryRanges(sourceUrl, declaredPdfBytes) : null;
    fullOpen.hidden = forceFull || !(rangeMode || parallelSmall);
    compatibility.hidden = rangeMode || downloadOnOpen;
    document.documentElement.dataset.privatePdfMode = buffered ? 'single-transfer' : 'range-first';
    const loaded = buffered
      ? await Promise.all([enginePromise, parallelSmall
          ? fetchPdfParallelTransfer(sourceUrl, sessionToken, declaredPdfBytes)
          : fetchPdfSingleTransfer(sourceUrl, sessionToken)])
      : [await enginePromise, null];
    const [engine, bytes] = loaded;
    if (destroyed || token() !== sessionToken) return;
    rangeFailure = null;
    activeRangeTransport = buffered ? null :
      makeAuthenticatedRangeTransport(engine, sourceUrl, declaredPdfBytes, sessionToken, rangeWarmup);
    loadingTask = buffered
      ? engine.getDocument(options({ data: bytes, disableRange: true, disableStream: true }))
      : engine.getDocument(options({
          range: activeRangeTransport,
          disableRange: false, disableAutoFetch: true, disableStream: true,
          rangeChunkSize: FIRST_PAGE_RANGE_CHUNK_BYTES,
        }));
    setPhase('parse', buffered ? '正在本地解析 PDF…' : '正在按需读取目录和第一页…');
    if (rangeMode) {
      loadingTask.onProgress = progress => {
        if (destroyed || status.hidden) return;
        const loadedMb = (Number(progress?.loaded || 0) / 1048576).toFixed(1);
        status.textContent = `正在按需读取第一页… 已取 ${loadedMb} MB`;
      };
    }
    let firstPageTimer = null;
    try {
      const firstPageJob = (async()=>{
        pdf = await loadingTask.promise;
        if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('pdf_page_tree');
        controls();
        await render();
      })();
      if (rangeMode) {
        await Promise.race([firstPageJob, activeRangeTransport.failed, new Promise((_,reject)=>{
          firstPageTimer = window.setTimeout(()=>reject(new Error('pdf_first_page_timeout')),FIRST_PAGE_TIMEOUT_MS);
        })]);
      } else {
        await firstPageJob;
      }
    } finally {
      if (firstPageTimer !== null) window.clearTimeout(firstPageTimer);
    }
  } catch (error) {
    rangeWarmup?.abort();
    if (rangeFailure || error?.message === 'pdf_first_page_timeout') {
      renderSequence += 1;
      renderTask?.cancel();
      renderTask = null;
      pdf = null;
      try { void loadingTask?.destroy(); } catch {}
      loadingTask = null;
    }
    showReaderError(rangeFailure || error);
  }
}
download.addEventListener('click', () => { void beginDownload(); });
function update(change) {
  if (!pdf || renderTask || destroyed) return;
  change();
  void render().catch(error => fallbackView('PDF 页面绘制失败，请稍后重试。', safeErrorCode(error)));
}
previous.addEventListener('click', () => update(() => { pageNumber = Math.max(1, pageNumber - 1); }));
next.addEventListener('click', () => update(() => { pageNumber = Math.min(pdf.numPages, pageNumber + 1); }));
zoomOut.addEventListener('click', () => update(() => { zoom = Math.max(0.5, zoom - 0.25); }));
zoomIn.addEventListener('click', () => update(() => { zoom = Math.min(3, zoom + 0.25); }));
function destroy() {
  if (destroyed) return;
  destroyed = true;
  renderSequence += 1;
  renderTask?.cancel();
  renderTask = null;
  transferController?.abort();
  transferController = null;
  activeRangeTransport?.abort();
  activeRangeTransport = null;
  canvas.width = 0;
  canvas.height = 0;
  sourceUrl = '';
  try { loadingTask?.destroy(); } catch {}
  loadingTask = null;
  pdf = null;
}
window.addEventListener('pagehide', destroy, { once: true });
window.addEventListener('beforeunload', destroy, { once: true });
controls();
void start();
