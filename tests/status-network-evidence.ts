import { test, type BrowserContext, type Page } from '@playwright/test';

const timelines = new Map<BrowserContext, unknown[]>();
const attached = new WeakSet<Page>();
const PREFIX = 'STATUS_NETWORK_EVIDENCE ';

export async function recordStatusNetwork(context: BrowserContext): Promise<void> {
  if (timelines.has(context)) return;
  const events: unknown[] = [];
  timelines.set(context, events);
  const record = (event: unknown): void => { events.push(event); if (events.length > 1200) events.shift(); };
  const attach = (page: Page): void => {
    if (attached.has(page)) return;
    attached.add(page);
    page.on('console', message => {
      if (message.text().startsWith(PREFIX)) {
        try { record(JSON.parse(message.text().slice(PREFIX.length))); } catch { /* diagnostic only */ }
      }
    });
    page.on('pageerror', error => record({ at: Date.now(), event: 'pageerror', message: error.message }));
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.pathname.includes('/reader-counts')) record({ at: Date.now(), event: 'requestfailed', origin: url.origin, path: url.pathname, method: request.method(), failure: request.failure() });
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.endsWith('/reader-counts')) record({ at: Date.now(), event: 'response', origin: url.origin, path: url.pathname, status: response.status(), allowOrigin: response.headers()['access-control-allow-origin'] });
    });
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) record({ at: Date.now(), event: 'navigation', path: new URL(frame.url()).pathname }); });
  };
  context.pages().forEach(attach);
  context.on('page', attach);
  await context.addInitScript(prefix => {
    const documentId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const log = (event: string, details = {}): void => console.log(prefix + JSON.stringify({ at: Date.now(), documentId, event, ...details }));
    for (const name of ['pagehide', 'pageshow', 'visibilitychange']) window.addEventListener(name, event => log(name, { persisted: (event as PageTransitionEvent).persisted, visibility: document.visibilityState }));
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (!url.pathname.includes('/reader-counts') && !url.search.includes('__gallery_lifecycle_probe__')) return nativeFetch(input, init);
      const signal = init?.signal || (input instanceof Request ? input.signal : null);
      const details = { origin: url.origin, path: url.pathname, method: init?.method || (input instanceof Request ? input.method : 'GET') };
      log('fetch:start', { ...details, aborted: signal?.aborted });
      try {
        const response = await nativeFetch(input, init);
        log('fetch:resolve', { ...details, status: response.status });
        return response;
      } catch (error) {
        log('fetch:reject', { ...details, name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : String(error), aborted: signal?.aborted });
        throw error;
      }
    }) as typeof window.fetch;
  }, PREFIX);
}

export function networkEvidence(context: BrowserContext): unknown[] { return timelines.get(context) || []; }

test.afterEach(async ({ context }, info) => {
  const events = timelines.get(context);
  if (events) await info.attach('status-network-timeline', { body: Buffer.from(JSON.stringify(events, null, 2)), contentType: 'application/json' });
  timelines.clear();
});
