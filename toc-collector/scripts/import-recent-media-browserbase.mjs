import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import {
  articleUrlsForDoi,
  classifyPublisher,
  pickBestPublisherMediaCandidate,
} from '../src/publisher-adapters.mjs';

const API_BASE = String(process.env.WORKER_URL || 'https://organic-synthesis-gallery.zhou526316.workers.dev').replace(/\/$/, '');
const WRITE_TOKEN = String(process.env.BRIDGE_WRITE_TOKEN || '').trim();
const BROWSERBASE_API_KEY = String(process.env.BROWSERBASE_API_KEY || '').trim();
const BROWSERBASE_PROJECT_ID = String(process.env.BROWSERBASE_PROJECT_ID || '').trim();
const INPUT = process.env.RECENT_MEDIA_JSON || '/tmp/recent-media-repair.json';
const LIMIT = Math.max(1, Math.min(12, Number(process.env.BROWSERBASE_MEDIA_LIMIT || 8)));
const PAGE_TIMEOUT_MS = 35000;
const IMAGE_TIMEOUT_MS = 20000;
const DELAY_MS = Math.max(1200, Number(process.env.BROWSERBASE_PUBLISHER_DELAY_MS || 1800));
const SUPPORTED = new Set(['acs', 'wiley', 'rsc', 'elsevier', 'nature', 'science']);

if (!WRITE_TOKEN) throw new Error('BRIDGE_WRITE_TOKEN is required');

function normalizeDoi(value) {
  const cleaned = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function browserbaseApi(pathname, options = {}) {
  const response = await fetch('https://api.browserbase.com/v1' + pathname, {
    ...options,
    headers: {
      'X-BB-API-Key': BROWSERBASE_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
  if (!response.ok) throw new Error('browserbase_http_' + response.status + ':' + String(body.message || body.error || text).slice(0, 240));
  return body;
}

async function createSession(publisher) {
  const payload = { keepAlive: false };
  if (BROWSERBASE_PROJECT_ID) payload.projectId = BROWSERBASE_PROJECT_ID;
  const created = await browserbaseApi('/sessions', { method: 'POST', body: JSON.stringify(payload) });
  if (!created?.connectUrl) throw new Error('browserbase_session_missing_connect_url:' + publisher);
  return created;
}

function challenged(html, url) {
  const signal = String(url || '') + '\n' + String(html || '').slice(0, 250000);
  return /captcha|verify you are human|security check|access denied|challenge-platform|just a moment|unusual traffic/i.test(signal);
}

async function apiPost(pathname, body) {
  const response = await fetch(API_BASE + pathname, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + WRITE_TOKEN,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(pathname + ' HTTP ' + response.status + ': ' + JSON.stringify(data).slice(0, 240));
  return data;
}

async function readImage(page, candidate, referer) {
  const response = await page.request.get(candidate.src, {
    headers: { Referer: referer, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
    timeout: IMAGE_TIMEOUT_MS,
  });
  if (!response.ok()) throw new Error('image_http_' + response.status());
  const contentType = String(response.headers()['content-type'] || '').split(';')[0].toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('image_content_type_' + contentType);
  const body = await response.body();
  if (body.length < 1024 || body.length > 8000000) throw new Error('image_size_' + body.length);
  return { imageData: 'data:' + contentType + ';base64,' + body.toString('base64'), bytes: body.length };
}

async function importCandidate(doi, page, pageUrl, candidate) {
  const image = await readImage(page, candidate, pageUrl);
  if (candidate.kind === 'official') {
    await apiPost('/api/toc/import', {
      doi,
      articleUrl: pageUrl,
      imageData: image.imageData,
      replace: false,
    });
    return { imported: 'toc', bytes: image.bytes, assetType: candidate.assetType || 'official' };
  }
  await apiPost('/api/article-figures/import', {
    doi,
    articleUrl: pageUrl,
    id: 'figure-1',
    label: 'Figure 1',
    caption: String(candidate.text || 'Figure 1').slice(0, 500),
    imageData: image.imageData,
    order: 0,
  });
  return { imported: 'figure1', bytes: image.bytes, assetType: 'figure1_fallback' };
}

async function resolveOne(page, doi, publisher) {
  const pages = [];
  for (const entry of articleUrlsForDoi(doi).slice(0, 4)) {
    try {
      await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
      await page.waitForTimeout(900);
      const pageUrl = page.url();
      const html = await page.content();
      const challenge = challenged(html, pageUrl);
      pages.push({ requested: entry.url, final: pageUrl, challenge });
      if (challenge) continue;
      const candidate = pickBestPublisherMediaCandidate(html, pageUrl, { doi, publisher });
      if (!candidate) continue;
      const result = await importCandidate(doi, page, pageUrl, candidate);
      return { doi, publisher, ...result, source: candidate.source || '', pages };
    } catch (error) {
      pages.push({ requested: entry.url, error: String(error?.message || error).slice(0, 220) });
    }
  }
  return { doi, publisher, imported: '', pages };
}

async function processPublisher(publisher, dois) {
  const session = await createSession(publisher);
  let browser;
  const results = [];
  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    for (let index = 0; index < dois.length; index += 1) {
      const doi = dois[index];
      const result = await resolveOne(page, doi, publisher);
      results.push(result);
      console.log('BROWSERBASE_MEDIA_ITEM ' + JSON.stringify(result));
      if (index < dois.length - 1) await sleep(DELAY_MS);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return results;
}

if (!BROWSERBASE_API_KEY) {
  console.log('BROWSERBASE_MEDIA_SUMMARY ' + JSON.stringify({ configured: false, requested: 0, tocImported: 0, figure1Imported: 0 }));
  process.exit(0);
}

const prepared = JSON.parse(await readFile(INPUT, 'utf8'));
const targets = [...new Set((prepared.gaps || [])
  .map(item => normalizeDoi(item?.doi))
  .filter(Boolean))]
  .filter(doi => SUPPORTED.has(classifyPublisher(doi)))
  .slice(0, LIMIT);

const groups = new Map();
for (const doi of targets) {
  const publisher = classifyPublisher(doi);
  if (!groups.has(publisher)) groups.set(publisher, []);
  groups.get(publisher).push(doi);
}

const results = [];
for (const [publisher, dois] of groups) {
  try {
    results.push(...await processPublisher(publisher, dois));
  } catch (error) {
    for (const doi of dois) {
      const item = { doi, publisher, imported: '', error: String(error?.message || error).slice(0, 240) };
      results.push(item);
      console.warn('BROWSERBASE_MEDIA_ITEM ' + JSON.stringify(item));
    }
  }
}

const summary = {
  configured: true,
  requested: targets.length,
  publishers: [...groups.keys()],
  tocImported: results.filter(item => item.imported === 'toc').length,
  figure1Imported: results.filter(item => item.imported === 'figure1').length,
  unresolved: results.filter(item => !item.imported).length,
};
console.log('BROWSERBASE_MEDIA_SUMMARY ' + JSON.stringify(summary));
