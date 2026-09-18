import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  timezoneId: 'Asia/Shanghai',
});

test('mobile paper actions survive 30 status/note/more cycles without locking page scroll', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/reader-counts/mark')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
      return;
    }
    if (url.includes('/api/user-ui/reader-counts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    if (url.includes('/api/user-ui/integrations')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          auth: { google: false, wechat: false, qq: false, email: false },
          payments: { wechat: false, alipay: false },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('gallery-paper-actions').first().waitFor({ state: 'visible', timeout: 30000 });

  const initialCards = await page.locator('.card').count();
  expect(initialCards).toBeGreaterThan(400);

  await page.evaluate(() => {
    const gallery = document.querySelector('#gallery');
    (window as Window & { __removedGalleryCards?: number }).__removedGalleryCards = 0;
    if (!gallery) return;
    const observer = new MutationObserver(records => {
      let removed = 0;
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('.card')) removed += 1;
          removed += node.querySelectorAll?.('.card').length || 0;
        }
      }
      (window as Window & { __removedGalleryCards?: number }).__removedGalleryCards =
        ((window as Window & { __removedGalleryCards?: number }).__removedGalleryCards || 0) + removed;
    });
    observer.observe(gallery, { childList: true });
    (window as Window & { __galleryRemovalObserver?: MutationObserver }).__galleryRemovalObserver = observer;
  });

  const actions = page.locator('gallery-paper-actions').first();

  const expectUnlocked = async (): Promise<void> => {
    const state = await page.evaluate(() => ({
      htmlClass: document.documentElement.classList.contains('gallery-user-drawer-open'),
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      htmlScrollLocked: ['hidden', 'clip'].includes(getComputedStyle(document.documentElement).overflowY),
      bodyScrollLocked: ['hidden', 'clip'].includes(getComputedStyle(document.body).overflowY),
      drawerOpen: document.querySelectorAll('gallery-paper-actions[data-drawer-open="true"]').length,
    }));
    expect(state.htmlClass).toBe(false);
    expect(state.htmlOverflow).not.toBe('hidden');
    expect(state.bodyOverflow).not.toBe('hidden');
    expect(state.htmlScrollLocked).toBe(false);
    expect(state.bodyScrollLocked).toBe(false);
    expect(state.drawerOpen).toBe(0);
  };

  for (let index = 0; index < 30; index += 1) {
    await actions.locator('button[data-action="status"]').click();
    await expect(actions.locator('.overlay')).toBeVisible();

    const choices = actions.locator('button[data-action^="set-status:"]');
    await expect(choices.first()).toBeVisible();
    await choices.nth(index % 3).click();

    await expect(actions.locator('.overlay')).toHaveCount(0);
    await expectUnlocked();

    const scroll = await page.evaluate(() => {
      const before = window.scrollY;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const delta = before + 140 <= max ? 140 : -140;
      window.scrollBy(0, delta);
      return { before, max };
    });
    await page.waitForTimeout(20);
    if (scroll.max > 200) {
      const after = await page.evaluate(() => window.scrollY);
      expect(after).not.toBe(scroll.before);
    }

    await actions.locator('button[data-action="note"]').click();
    await expect(actions.locator('.overlay')).toBeVisible();
    await actions.locator('button[data-action="close"]').click();
    await expect(actions.locator('.overlay')).toHaveCount(0);
    await expectUnlocked();

    await actions.locator('button[data-action="more"]').click();
    await expect(actions.locator('.overlay')).toBeVisible();
    await actions.locator('button[data-action="close"]').click();
    await expect(actions.locator('.overlay')).toHaveCount(0);
    await expectUnlocked();
  }

  expect(await page.locator('.card').count()).toBe(initialCards);
  const removedCards = await page.evaluate(() =>
    (window as Window & { __removedGalleryCards?: number }).__removedGalleryCards || 0
  );
  expect(removedCards).toBe(0);

  const userShell = page.locator('gallery-user-shell');
  await userShell.locator('button.trigger').click();
  await userShell.locator('button[data-tab="settings"]').click();
  const content = userShell.locator('.content');
  await expect(content).toBeVisible();

  const scrollability = await content.evaluate(element => {
    const node = element as HTMLElement;
    const before = node.scrollTop;
    node.scrollTop = node.scrollHeight;
    return { before, after: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
  });
  expect(scrollability.scrollHeight).toBeGreaterThan(scrollability.clientHeight);
  expect(scrollability.after).toBeGreaterThan(scrollability.before);
});
