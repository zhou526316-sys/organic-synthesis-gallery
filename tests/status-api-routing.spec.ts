import { test, expect, type Page } from '@playwright/test';
import { open } from './status-image-fixtures';

const PRIMARY = 'https://api.gczhouwld.com';
const WORKER = 'https://organic-synthesis-gallery.zhou526316.workers.dev';
const PROBE = '__gallery_api_route_probe__';
type Seen = { url: string; method: string; body: string | null };

async function mockProbes(page: Page): Promise<Seen[]> {
  const seen: Seen[] = [];
  // Page routes take precedence over the general isolation fixture. Every probe,
  // including simulated POST/failure requests, is intercepted before networking.
  await page.route(`**/*${PROBE}*`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': request.headers().origin || new URL(page.url()).origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type, authorization',
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'vary': 'Origin',
    };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    const entry = { url: request.url(), method: request.method(), body: request.postData() };
    seen.push(entry);
    if (url.origin === PRIMARY && url.searchParams.get('mode') === 'network-failure') {
      await route.abort('failed');
      return;
    }
    const status = url.origin === PRIMARY && url.searchParams.get('mode') === 'http-failure' ? 503 : 200;
    await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(entry) });
  });
  return seen;
}

test('static data, media and API-like paths preserve the requested origin', async ({ page }) => {
  test.setTimeout(90000);
  await open(page);
  const seen = await mockProbes(page);
  const paths = [
    '/papers.gz.b64', '/manual-supplement.json', '/total-synthesis.json',
    '/final-audit-supplement.json', '/media-index.json', '/title-translations-zh.json',
    '/assets/example.js', '/media/example.png', '/apiary/data.json', '/api.json',
    '/API/user-ui/state', '/index.html?next=/api/user-ui/state',
  ];
  const absolute = [PRIMARY, WORKER].flatMap(origin => paths.map(path => `${origin}${path}`));
  const urls = [...absolute, 'papers.gz.b64', './title-translations-zh.json', 'https://unrelated.invalid/api/state'];
  const cases = urls.flatMap((url, index) => ['string', 'url', 'request'].map(kind => ({
    kind, url: `${url}${url.includes('?') ? '&' : '?'}${PROBE}=${index}-${kind}`,
  })));
  const expected = cases.map(item => new URL(item.url, page.url()).href);
  const actual = await page.evaluate(async cases => {
    const results: string[] = [];
    for (const item of cases) {
      const input = item.kind === 'url' ? new URL(item.url, location.href)
        : item.kind === 'request' ? new Request(new URL(item.url, location.href)) : item.url;
      const response = await fetch(input);
      results.push((await response.json()).url);
    }
    return results;
  }, cases);
  expect(actual).toEqual(expected);
  expect(seen.map(item => item.url)).toEqual(expected);
});

test('API paths retain primary-first routing, network fallback and Request passthrough', async ({ page }) => {
  await open(page);
  const seen = await mockProbes(page);
  const cases = [
    { url: `${WORKER}/api?${PROBE}=root`, kind: 'string', method: 'GET' },
    { url: `${WORKER}/api/user-ui/integrations?${PROBE}=url`, kind: 'url', method: 'GET' },
    { url: `${WORKER}/api/user-ui/reader-counts?${PROBE}=post&mode=network-failure`, kind: 'string', method: 'POST' },
    { url: `${WORKER}/api/user-ui/state?${PROBE}=http&mode=http-failure`, kind: 'string', method: 'GET' },
    { url: `${WORKER}/api/user-ui/state?${PROBE}=request`, kind: 'request', method: 'GET' },
  ];
  const actual = await page.evaluate(async cases => {
    const results: Array<{ status: number; url: string }> = [];
    for (const item of cases) {
      const input = item.kind === 'url' ? new URL(item.url) : item.kind === 'request' ? new Request(item.url) : item.url;
      const init = item.method === 'POST'
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"paperIds":[]}' } : undefined;
      const response = await fetch(input, init);
      results.push({ status: response.status, url: (await response.json()).url });
    }
    return results;
  }, cases);
  const primary = (value: string): string => value.replace(WORKER, PRIMARY);
  expect(actual).toEqual([
    { status: 200, url: primary(cases[0].url) },
    { status: 200, url: primary(cases[1].url) },
    { status: 200, url: cases[2].url },
    { status: 503, url: primary(cases[3].url) },
    { status: 200, url: cases[4].url },
  ]);
  expect(seen.map(item => item.url)).toEqual([
    primary(cases[0].url), primary(cases[1].url), primary(cases[2].url),
    cases[2].url, primary(cases[3].url), cases[4].url,
  ]);
  expect(seen.filter(item => item.method === 'POST').map(item => item.body)).toEqual(['{"paperIds":[]}', '{"paperIds":[]}']);
});
