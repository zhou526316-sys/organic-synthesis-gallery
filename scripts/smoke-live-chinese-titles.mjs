import { chromium } from 'playwright';
import { CURRENT_TITLE_TRANSLATIONS } from '../shared/chinese-title-overrides.js';
import { writeFile } from 'node:fs/promises';

const base = 'https://zhou526316-sys.github.io/organic-synthesis-gallery/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
const output = { checkedAt: new Date().toISOString(), base, ok: false, chinese: [], english: [], failures: [], blockedWriteRequests: 0, productionDataModified: false };
try {
  await context.addInitScript(rows => {
    localStorage.setItem('organic-gallery-language', 'zh');
    localStorage.removeItem('organic-gallery-filter-preferences-v1');
    // Exercise recovery from old English-as-Chinese cache values.
    localStorage.setItem('organic-gallery-zh-title-cache-v2', JSON.stringify(Object.fromEntries(rows.map(row => [row.title, row.title]))));
  }, CURRENT_TITLE_TRANSLATIONS);
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      output.blockedWriteRequests += 1;
      return route.abort();
    }
    if (/translate-titles/.test(request.url()) || ['image', 'media'].includes(request.resourceType())) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(base + '?title-smoke=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#search').waitFor({ timeout: 30000 });
  const search = page.locator('#search');
  const titleFor = async doi => page.locator('.card').filter({ has: page.locator('.doi', { hasText: doi }) }).locator('h2.title').first().textContent();
  for (const row of CURRENT_TITLE_TRANSLATIONS) {
    await search.fill(row.doi);
    await page.waitForFunction(({ doi, title }) => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === doi && card.querySelector('h2.title')?.textContent?.trim() === title), { doi: row.doi, title: row.zh }, { timeout: 8000 });
    output.chinese.push({ doi: row.doi, title: await titleFor(row.doi) });
  }
  await page.locator('[data-lang="en"]').click();
  for (const row of CURRENT_TITLE_TRANSLATIONS) {
    await page.locator('#search').fill(row.doi);
    await page.waitForFunction(({ doi, title }) => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === doi && card.querySelector('h2.title')?.textContent?.trim() === title), { doi: row.doi, title: row.title }, { timeout: 8000 });
    output.english.push({ doi: row.doi, title: await titleFor(row.doi) });
  }
  await page.locator('[data-lang="zh"]').click();
  await page.locator('#search').fill('亚甲基桥连噻蒽鎓');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.card')).some(card => card.querySelector('.doi')?.textContent?.trim() === '10.1021/jacs.6c16812'), null, { timeout: 8000 });
  output.chineseSearchPassed = true;
  output.ok = output.chinese.length === 24 && output.english.length === 24;
} catch (error) {
  output.failures.push(error.message);
} finally {
  await browser.close();
  await writeFile(process.env.TITLE_SMOKE_OUTPUT || '/tmp/live-chinese-title-smoke.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}
if (!output.ok) process.exitCode = 1;
