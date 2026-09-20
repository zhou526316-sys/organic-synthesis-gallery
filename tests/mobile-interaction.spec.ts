import { test, expect, devices, type Locator } from '@playwright/test';

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

  const journalPicker = page.locator('.journal-picker');
  await journalPicker.locator('summary').click();
  await expect(journalPicker).toHaveAttribute('open', '');
  await page.locator('.hero h1').click();
  await expect(journalPicker).not.toHaveAttribute('open', '');

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

  const expectAnchored = async (anchorLocator: Locator, popoverLocator: Locator): Promise<void> => {
    const anchorBox = await anchorLocator.boundingBox();
    const popoverBox = await popoverLocator.boundingBox();
    expect(anchorBox).not.toBeNull();
    expect(popoverBox).not.toBeNull();
    if (!anchorBox || !popoverBox) return;
    const horizontalOverlap = Math.min(anchorBox.x + anchorBox.width, popoverBox.x + popoverBox.width) - Math.max(anchorBox.x, popoverBox.x);
    const verticalGap = Math.min(
      Math.abs(popoverBox.y - (anchorBox.y + anchorBox.height)),
      Math.abs(anchorBox.y - (popoverBox.y + popoverBox.height)),
    );
    expect(horizontalOverlap).toBeGreaterThan(0);
    expect(verticalGap).toBeLessThanOrEqual(18);
  };

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
    await expect(actions.locator('.drawer')).toBeVisible();
    if (index === 0) await expectAnchored(actions.locator('button[data-action="status"]'), actions.locator('.drawer'));

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
    await expect(actions.locator('.drawer')).toBeVisible();
    if (index === 0) await expectAnchored(actions.locator('button[data-action="note"]'), actions.locator('.drawer'));
    await actions.locator('button[data-action="close"]').click();
    await expect(actions.locator('.overlay')).toHaveCount(0);
    await expectUnlocked();

    await actions.locator('button[data-action="more"]').click();
    await expect(actions.locator('.drawer')).toBeVisible();
    if (index === 0) await expectAnchored(actions.locator('button[data-action="more"]'), actions.locator('.drawer'));
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
  await expect(userShell.locator('.panel')).toBeVisible();
  const triggerBox = await userShell.locator('button.trigger').boundingBox();
  const panelBox = await userShell.locator('.panel').boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  if (triggerBox && panelBox) {
    const horizontalOverlap = Math.min(triggerBox.x + triggerBox.width, panelBox.x + panelBox.width) - Math.max(triggerBox.x, panelBox.x);
    const verticalGap = Math.min(
      Math.abs(panelBox.y - (triggerBox.y + triggerBox.height)),
      Math.abs(triggerBox.y - (panelBox.y + panelBox.height)),
    );
    expect(horizontalOverlap).toBeGreaterThan(0);
    expect(verticalGap).toBeLessThanOrEqual(18);
  }
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

  const statusImageInput = userShell.locator('input[data-image="status:to-read"]');
  await statusImageInput.setInputFiles({
    name: 'status.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(userShell.locator('[data-style-preview="status:to-read"] img')).toBeVisible();

  await userShell.locator('button[data-action="close"]').click();
  await actions.locator('button[data-action="status"]').click();
  await expect(actions.locator('.drawer')).toBeVisible();
  const toRead = actions.locator('button[data-action="set-status:to-read"]');
  await expect(toRead.locator('.status-image')).toBeVisible();

  const inlineEditor = actions.locator('[data-status-editor="to-read"]');
  await expect(inlineEditor).toBeVisible();
  await expectAnchored(actions.locator('button[data-action="status"]'), actions.locator('.drawer'));

  const colorInput = inlineEditor.locator('input[data-status-color="to-read"]');
  await colorInput.evaluate((element: HTMLInputElement) => {
    element.value = '#123456';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () =>
    toRead.locator('.status-choice-label').evaluate(element => getComputedStyle(element).backgroundColor)
  ).toBe('rgb(18, 52, 86)');

  const shapeSelect = actions.locator('select[data-status-shape="to-read"]');
  await shapeSelect.selectOption('square');
  await expect(toRead.locator('.status-choice-label')).toHaveClass(/shape-square/);

  await toRead.click();
  const cardStatus = actions.locator('.chip.status');
  await expect(cardStatus.locator('.status-image')).toBeVisible();
  await expect(cardStatus).toHaveClass(/shape-square/);
  await expect.poll(async () => cardStatus.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(18, 52, 86)');
});


test('search highlights results, picker closes outside, feedback drags and submits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/site-feedback')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: true, id: 1 }) });
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
        body: JSON.stringify({ auth: { google: false, wechat: false, qq: false, email: false }, payments: { wechat: false, alipay: false } }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 30000 });

  const initialCards = await page.locator('.card').count();
  expect(initialCards).toBeGreaterThan(400);
  await page.evaluate(() => {
    const gallery = document.querySelector('#gallery');
    (window as Window & { __searchRemovedCards?: number }).__searchRemovedCards = 0;
    if (!gallery) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('.card')) (window as Window & { __searchRemovedCards?: number }).__searchRemovedCards! += 1;
          (window as Window & { __searchRemovedCards?: number }).__searchRemovedCards! += node.querySelectorAll?.('.card').length || 0;
        }
      }
    });
    observer.observe(gallery, { childList: true });
  });

  const search = page.locator('#search');
  await search.fill('photoredox');
  await expect(search).toHaveValue('photoredox');
  await expect.poll(async () => page.locator('.card:visible').count()).toBeGreaterThan(0);
  const visibleAfterSearch = await page.locator('.card:visible').count();
  expect(visibleAfterSearch).toBeLessThan(initialCards);
  expect(await page.locator('.card[hidden]:visible').count()).toBe(0);
  await expect(page.locator('.user-search-summary')).toContainText(/photoredox/i);
  await expect(page.locator('.card.user-search-match:visible').first()).toBeVisible();
  await expect(page.locator('.card:visible mark.user-search-highlight').first()).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __searchRemovedCards?: number }).__searchRemovedCards || 0)).toBe(0);

  await search.fill('光催化');
  await expect(search).toHaveValue('光催化');
  await expect.poll(async () => page.locator('.card:visible').count()).toBeGreaterThan(0);
  expect(await page.locator('.card:visible').count()).toBeLessThan(initialCards);
  expect(await page.locator('.card[hidden]:visible').count()).toBe(0);
  expect(await page.evaluate(() => (window as Window & { __searchRemovedCards?: number }).__searchRemovedCards || 0)).toBe(0);

  await search.fill('10.1021/jacs.6c08636');
  await expect.poll(async () => page.locator('.card:visible').count()).toBeGreaterThan(0);
  const doiCard = page.locator('.card:visible').filter({ hasText: '10.1021/jacs.6c08636' }).first();
  await expect(doiCard).toBeVisible();
  const canonicalDoiHref = 'https://doi.org/10.1021/jacs.6c08636';
  await expect(doiCard.locator('a.open')).toHaveAttribute('href', canonicalDoiHref);
  await expect(doiCard.locator('.user-title-link')).toHaveAttribute('href', canonicalDoiHref);
  await expect(doiCard.locator('.user-doi-link')).toHaveAttribute('href', canonicalDoiHref);

  const feedback = page.locator('site-feedback-widget');
  await expect(feedback.locator('.site-feedback-tab')).toBeVisible();
  await feedback.locator('.site-feedback-tab').click();

  const panel = feedback.locator('.site-feedback-panel');
  const head = feedback.locator('.site-feedback-head');
  const before = await panel.boundingBox();
  const handle = await head.boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  if (before && handle) {
    await page.mouse.move(handle.x + 80, handle.y + 14);
    await page.mouse.down();
    await page.mouse.move(handle.x + 240, handle.y + 94, { steps: 6 });
    await page.mouse.up();
    const after = await panel.boundingBox();
    expect(after).not.toBeNull();
    if (after) {
      expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(60);
    }
  }

  await feedback.locator('[data-feedback-category]').selectOption('search');
  await feedback.locator('[data-feedback-message]').fill('搜索框输入时不应该闪烁或清空。');
  await feedback.locator('[data-feedback-submit]').click();
  await expect(feedback.locator('.site-feedback-status')).toContainText(/已收到|Received/);
});


test('journal and date filters persist across reload and clear cleanly', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('https://api.gczhouwld.com/**', async route => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  const galleryCards = page.locator('#gallery > .card');
  await galleryCards.first().waitFor({ state: 'visible', timeout: 30000 });
  const initialCards = await galleryCards.count();
  expect(initialCards).toBeGreaterThan(400);

  const picker = page.locator('.journal-picker');
  await picker.locator('summary').click();
  const jacs = picker.locator('input[data-journal-option][value="JACS"]');
  await jacs.check();
  await expect(jacs).toBeChecked();

  await page.locator('#dateFrom').evaluate((element: HTMLInputElement) => {
    element.value = '2026-09-01';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#dateTo').evaluate((element: HTMLInputElement) => {
    element.value = '2026-09-20';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.locator('#dateFrom')).toHaveValue('2026-09-01');
  await expect(page.locator('#dateTo')).toHaveValue('2026-09-20');
  await expect.poll(async () => galleryCards.count()).toBeGreaterThan(0);
  const filteredCount = await galleryCards.count();
  expect(filteredCount).toBeLessThan(initialCards);

  const filtered = await galleryCards.evaluateAll(cards => cards.map(card => ({
    journal: (card as HTMLElement).dataset.journal || '',
    date: (card as HTMLElement).dataset.date || '',
  })));
  expect(filtered.length).toBe(filteredCount);
  expect(filtered.every(item => item.journal === 'JACS')).toBe(true);
  expect(filtered.every(item => item.date >= '2026-09-01' && item.date <= '2026-09-20')).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 30000 });
  await expect(page.locator('#dateFrom')).toHaveValue('2026-09-01');
  await expect(page.locator('#dateTo')).toHaveValue('2026-09-20');
  await expect(page.locator('input[data-journal-option][value="JACS"]')).toBeChecked();
  await expect.poll(async () => galleryCards.count()).toBe(filteredCount);

  await page.locator('#clearCustomFilters').click();
  await expect(page.locator('#dateFrom')).toHaveValue('');
  await expect(page.locator('#dateTo')).toHaveValue('');
  await expect(page.locator('input[data-journal-option][value="JACS"]')).not.toBeChecked();
  await expect.poll(async () => galleryCards.count()).toBe(initialCards);
});
