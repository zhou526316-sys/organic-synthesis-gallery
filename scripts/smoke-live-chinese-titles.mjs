import { chromium } from 'playwright';
import { CURRENT_TITLE_TRANSLATIONS } from '../shared/chinese-title-overrides.js';
import { isExcludedDoi } from '../shared/literature-policy.js';
import { loadScopeCorrections, normalizeScopeDoi } from './lib/scope-corrections.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const base = 'https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
const output = { checkedAt: new Date().toISOString(), base, sourceCommit: process.env.GITHUB_SHA || null, ok: false, chinese: [], english: [], retiredCatalogDois: [], scopeCorrectionPresence: [], failures: [], blockedWriteRequests: 0, blockedTranslationRequests: 0, productionDataModified: false };

async function expectedProductionDois() {
  const dois = new Set();
  const add = row => {
    const doi = normalizeScopeDoi(row?.doi || row?.url);
    if (doi.startsWith('10.') && !isExcludedDoi(doi)) dois.add(doi);
  };
  const encoded = (await readFile('public/papers.gz.b64', 'utf8')).trim();
  const baseline = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  if (!Array.isArray(baseline)) throw new Error('Invalid production baseline');
  baseline.forEach(add);
  for (const name of ['total-synthesis', 'manual-supplement', 'final-audit-supplement', 'curated-supplement', 'automation-supplement', 'rolling-supplement', 'literature-supplement']) {
    let payload;
    try { payload = JSON.parse(await readFile(`public/${name}.json`, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!Array.isArray(payload.papers)) throw new Error(`Invalid production supplement: ${name}`);
    payload.papers.forEach(add);
  }
  return dois;
}

try {
  const expected = await expectedProductionDois();
  const corrections = await loadScopeCorrections();
  const excluded = new Set(corrections.map(row => normalizeScopeDoi(row.doi)));
  const activeRows = CURRENT_TITLE_TRANSLATIONS.filter(row => expected.has(row.doi));
  const retiredRows = CURRENT_TITLE_TRANSLATIONS.filter(row => !expected.has(row.doi));
  for (const row of retiredRows) {
    if (!excluded.has(row.doi) && !isExcludedDoi(row.doi)) throw new Error(`Unexpectedly lost bilingual card in production data: ${row.doi}`);
  }
  if (!activeRows.length) throw new Error('No active bilingual reference cards; not a valid successful test');
  output.expectedBilingualCards = activeRows.length;
  output.repositoryDoiCount = expected.size;
  await context.addInitScript(rows => {
    localStorage.setItem('organic-gallery-language', 'zh');
    localStorage.removeItem('organic-gallery-filter-preferences-v1');
    // Exercise recovery from old English-as-Chinese cache values.
    localStorage.setItem('organic-gallery-zh-title-cache-v2', JSON.stringify(Object.fromEntries(rows.map(row => [row.title, row.title]))));
  }, CURRENT_TITLE_TRANSLATIONS);
  await context.route('**/*', async route => {
    const request = route.request();
    if (/translate-titles|title-translations\/zh/.test(request.url())) {
      output.blockedTranslationRequests += 1;
      return route.abort();
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      output.blockedWriteRequests += 1;
      return route.abort();
    }
    if (['image', 'media'].includes(request.resourceType())) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(base + '?title-smoke=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#search').waitFor({ timeout: 30000 });
  const search = page.locator('#search');
  const titleFor = async doi => page.locator('.card').filter({ has: page.locator('.doi', { hasText: doi }) }).locator('h2.title').first().textContent();
  for (const row of activeRows) {
    await search.fill(row.doi);
    await page.waitForFunction(({ doi, title }) => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === doi && card.querySelector('h2.title')?.textContent?.trim() === title), { doi: row.doi, title: row.zh }, { timeout: 8000 });
    output.chinese.push({ doi: row.doi, title: await titleFor(row.doi) });
  }
  await page.locator('[data-lang="en"]').click();
  for (const row of activeRows) {
    await page.locator('#search').fill(row.doi);
    await page.waitForFunction(({ doi, title }) => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === doi && card.querySelector('h2.title')?.textContent?.trim() === title), { doi: row.doi, title: row.title }, { timeout: 8000 });
    output.english.push({ doi: row.doi, title: await titleFor(row.doi) });
  }
  // Record queued versus actually removed corrections; do not call a registry edit a deletion.
  for (const correction of corrections) {
    const doi = normalizeScopeDoi(correction.doi);
    await page.locator('#search').fill(doi);
    await page.waitForTimeout(400);
    const present = await page.evaluate(doi => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === doi), doi);
    const expectedPresent = expected.has(doi);
    output.scopeCorrectionPresence.push({ doi, present, expectedPresent, status: present ? 'queued_not_removed' : 'absent_from_production' });
    if (present !== expectedPresent) throw new Error(`Live/repository correction mismatch: ${doi}; live=${present}, repository=${expectedPresent}`);
  }
  output.retiredCatalogDois = retiredRows.map(row => row.doi);
  await page.locator('[data-lang="zh"]').click();
  const sample = activeRows[0];
  await page.locator('#search').fill(sample.zh);
  await page.waitForFunction(doi => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === doi), sample.doi, { timeout: 8000 });
  output.chineseSearchPassed = true;
  output.ok = output.chinese.length === activeRows.length && output.english.length === activeRows.length;
} catch (error) {
  output.failures.push(error.message);
} finally {
  await browser.close();
  await writeFile(process.env.TITLE_SMOKE_OUTPUT || '/tmp/live-chinese-title-smoke.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}
if (!output.ok) process.exitCode = 1;
