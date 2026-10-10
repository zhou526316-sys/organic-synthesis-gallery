// Browser regression for WeChat "阅读原文" selected-paper links.
// Runs against local Vite preview, without WeChat credentials or publication writes.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ORIGIN = 'http://127.0.0.1:4173';
const ANWEG = '10.1002/anie.3306470';
const RETRO = '10.1038/s44160-026-01128-y';
const SCIENCE = '10.1126/science.aef3001';

async function visit(browser, title, suffix, doi, width, height, reducedMotion = false) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  try {
    await page.goto(ORIGIN + suffix, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.locator('html[data-card-share-ready="true"]').waitFor({ state: 'attached', timeout: 35000 });
    const card = page.locator('#gallery > article.card[data-doi="' + doi + '"]');
    try {
      await card.waitFor({ state: 'visible', timeout: 25000 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        featured: document.documentElement.dataset.galleryEditionFeaturedDoi || null,
        catalogRead: document.documentElement.dataset.catalogRead || null,
        galleryCards: [...document.querySelectorAll('#gallery > .card[data-doi]')].slice(0, 25)
          .map(element => element.getAttribute('data-doi')),
        resultCount: document.querySelector('#resultCount')?.textContent,
        visibleText: document.querySelector('#app')?.textContent?.slice(0, 250),
      }));
      console.error(JSON.stringify({ title, doi, diagnostics, pageErrors }));
      throw error;
    }
    await page.waitForFunction(target => {
      const node = [...document.querySelectorAll('#gallery > .card[data-doi]')]
        .find(item => item.getAttribute('data-doi')?.toLowerCase() === target);
      return Boolean(node?.classList.contains('shared-card-target'));
    }, doi, { timeout: 12000 });
    const firstCardDoi = (await page.locator('#gallery > .card[data-doi]').first().getAttribute('data-doi') || '').toLowerCase();
    if (firstCardDoi !== doi) throw new Error(title + ': wrong first-page target ' + firstCardDoi);
    const glow = await card.evaluate(node => ({
      active: node.classList.contains('shared-card-target'),
      animation: getComputedStyle(node).animationName,
      shadow: getComputedStyle(node).boxShadow,
    }));
    if (!glow.active) throw new Error(title + ': DOI card lost its focus class');
    if (!reducedMotion && !glow.animation.includes('gallery-shared-card-halo')) {
      throw new Error(title + ': animated halo missing: ' + JSON.stringify(glow));
    }
    if (reducedMotion && glow.animation !== 'none') throw new Error(title + ': reduced motion ignored');
    if (!glow.shadow || glow.shadow === 'none') throw new Error(title + ': card shadow missing');
    const openedDrawer = await page.locator('gallery-paper-actions .drawer.summary-drawer').count();
    if (openedDrawer) throw new Error(title + ': default summary drawer obscures the target');
    await page.waitForTimeout(900);
    const box = await card.boundingBox();
    if (!box || box.y >= height || box.y + box.height <= 0) {
      throw new Error(title + ': target not scrolled into mobile viewport: ' + JSON.stringify(box));
    }
    if (pageErrors.length) throw new Error(title + ': browser errors: ' + pageErrors.join(' | '));
    console.log(JSON.stringify({
      title, doi, viewport: [width, height],
      firstCardDoi, glow: reducedMotion ? 'reduced-motion' : 'animated',
      openedDrawer, targetY: Math.round(box.y),
    }));
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await visit(browser, 'legacy-daily-Oct10-mobile', '/?edition=2026-10-10', ANWEG, 390, 844);
  await visit(browser, 'legacy-daily-Oct09-mobile', '/?edition=2026-10-09', SCIENCE, 390, 844);
  await visit(browser, 'new-featured-daily-mobile',
    '/?edition=2026-10-10&doi=10.1002%2Fanie.3306470&summary=0', ANWEG, 390, 844);
  await visit(browser, 'retro-in-edition-mobile',
    '/?edition=2026-10-10&doi=10.1038%2Fs44160-026-01128-y&summary=0', RETRO, 390, 844);
  await visit(browser, 'retro-DOI-only-desktop',
    '/?doi=10.1038%2Fs44160-026-01128-y&summary=0', RETRO, 1280, 800);
  await visit(browser, 'reduced-motion-legacy-mobile', '/?edition=2026-10-10', ANWEG, 390, 844, true);
  console.log('PASS: exact DOI, first-page location, glow, legacy edition and reduced-motion');
} finally {
  await browser.close();
}
