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

  const mobileCardLayout = await page.locator('#gallery').evaluate(gallery => {
    const cards = Array.from(gallery.querySelectorAll<HTMLElement>('.card')).slice(0, 2);
    if (cards.length < 2) throw new Error('Need at least two cards');
    const first = cards[0].getBoundingClientRect();
    const second = cards[1].getBoundingClientRect();
    const toc = cards[0].querySelector<HTMLElement>('.toc-slot');
    const cardStyle = getComputedStyle(cards[0]);
    return {
      columns: getComputedStyle(gallery).gridTemplateColumns.trim().split(/\s+/).length,
      sameX: Math.abs(first.left - second.left),
      widthDelta: Math.abs(first.width - second.width),
      verticalGap: second.top - first.bottom,
      cardMinHeight: Number.parseFloat(cardStyle.minHeight),
      tocHeight: toc ? toc.getBoundingClientRect().height : 0,
    };
  });
  expect(mobileCardLayout.columns).toBe(1);
  expect(mobileCardLayout.sameX).toBeLessThanOrEqual(2);
  expect(mobileCardLayout.widthDelta).toBeLessThanOrEqual(2);
  expect(mobileCardLayout.verticalGap).toBeGreaterThanOrEqual(8);
  expect(mobileCardLayout.cardMinHeight).toBeGreaterThanOrEqual(360);
  expect(mobileCardLayout.cardMinHeight).toBeLessThanOrEqual(430);
  expect(mobileCardLayout.tocHeight).toBeGreaterThanOrEqual(178);

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
  const actionBar = actions.locator('.bar');
  await expect(actionBar).toBeVisible();
  expect(await actionBar.evaluate(element => getComputedStyle(element).flexWrap)).toBe('nowrap');
  const actionBoxes = await actions.locator('.bar > button.action').evaluateAll(elements =>
    elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    })
  );
  expect(actionBoxes.length).toBeGreaterThanOrEqual(4);
  expect(Math.max(...actionBoxes.map(box => box.top)) - Math.min(...actionBoxes.map(box => box.top))).toBeLessThanOrEqual(2);

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
  const scrollStyle = await content.evaluate(element => {
    const style = getComputedStyle(element);
    return { overflowY: style.overflowY, gutter: style.scrollbarGutter };
  });
  expect(scrollStyle.overflowY).toBe('scroll');
  expect(scrollStyle.gutter).toContain('stable');

  const actionColors: Record<string, { hex: string; rgb: string }> = {
    favorite: { hex: '#aa3377', rgb: 'rgb(170, 51, 119)' },
    status: { hex: '#336699', rgb: 'rgb(51, 102, 153)' },
    note: { hex: '#228855', rgb: 'rgb(34, 136, 85)' },
    more: { hex: '#885522', rgb: 'rgb(136, 85, 34)' },
  };
  for (const [action, color] of Object.entries(actionColors)) {
    const input = userShell.locator(`input[data-color="action:${action}"]`);
    await expect(input).toBeVisible();
    await input.evaluate((element: HTMLInputElement, hex) => {
      element.value = String(hex);
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, color.hex);
    await expect.poll(async () =>
      actions.locator(`button[data-action="${action}"]`).evaluate(element => getComputedStyle(element).backgroundColor)
    ).toBe(color.rgb);
  }

  const statusImageInput = userShell.locator('input[data-image="status:to-read"]');
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const largePng = Buffer.concat([tinyPng, Buffer.alloc(5_000_000 - tinyPng.length)]);
  const largeFile = { name: 'large-status.png', mimeType: 'image/png', buffer: largePng };

  await statusImageInput.setInputFiles(largeFile);
  const cropper = page.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Crop image' });
  await expect(cropper).toBeVisible();
  await cropper.getByRole('button', { name: '取消 / Cancel' }).click();
  await expect(cropper).toHaveCount(0);

  await statusImageInput.setInputFiles(largeFile);
  await expect(cropper).toBeVisible();
  await cropper.getByRole('button', { name: '取消 / Cancel' }).click();
  await expect(cropper).toHaveCount(0);

  await statusImageInput.setInputFiles({
    name: 'status.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  });
  await expect(cropper).toBeVisible();
  await cropper.getByRole('slider').fill('1.25');
  await cropper.getByRole('button', { name: '圆形 / Circle' }).click();
  await cropper.getByRole('button', { name: '使用 / Apply' }).click();
  const statusPreview = userShell.locator('[data-style-preview="status:to-read"]');
  await expect(statusPreview.locator('img')).toBeVisible();
  await expect(statusPreview).toHaveClass(/shape-circle/);

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
  await expect.poll(async () =>
    actions.locator('button[data-action="status"]').evaluate(element => getComputedStyle(element).backgroundColor)
  ).toBe('rgb(51, 102, 153)');

  await expect.poll(async () => actions.evaluate(element => {
    const card = element.closest<HTMLElement>('.card');
    return {
      active: Boolean(card?.classList.contains('user-status-card')),
      statusId: card?.dataset.userStatusId || '',
      rgb: card?.style.getPropertyValue('--user-status-rgb').trim() || '',
    };
  })).toEqual({ active: true, statusId: 'to-read', rgb: '18,52,86' });

  await actions.locator('button[data-action="status"]').click();
  const activeEditor = actions.locator('[data-status-editor="to-read"]');
  const activeColor = activeEditor.locator('input[data-status-color="to-read"]');
  await activeColor.evaluate((element: HTMLInputElement) => {
    element.value = '#654321';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => actions.evaluate(element => {
    const card = element.closest<HTMLElement>('.card');
    return card?.style.getPropertyValue('--user-status-rgb').trim() || '';
  })).toBe('101,67,33');
  await actions.locator('button[data-action="close"]').click();
});


test.describe('desktop feedback regressions', () => {
  test.use({
    viewport: { width: 1707, height: 932 },
    userAgent: devices['Desktop Safari'].userAgent,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    timezoneId: 'Asia/Shanghai',
  });

test('desktop personalization wheel reaches the bottom and action slots align across cards', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
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
  const actions = page.locator('gallery-paper-actions');
  await expect(actions.nth(0)).toBeVisible({ timeout: 30000 });
  await expect(actions.nth(1)).toBeVisible({ timeout: 30000 });
  await expect(actions.nth(2)).toBeVisible({ timeout: 30000 });

  await actions.nth(0).locator('button[data-action="favorite"]').click();
  await actions.nth(0).locator('button[data-action="status"]').click();
  await actions.nth(0).locator('button[data-action="set-status:to-read"]').click();

  const actionGeometry = async (index: number): Promise<Array<{ x: number; y: number; h: number }>> =>
    actions.nth(index).evaluate(host => {
      const hostRect = host.getBoundingClientRect();
      const root = host.shadowRoot;
      if (!root) throw new Error('paper-actions shadow root missing');
      return ['favorite', 'status', 'note', 'more'].map(action => {
        const button = root.querySelector<HTMLElement>(`button[data-action="${action}"]`);
        if (!button) throw new Error(`missing action ${action}`);
        const rect = button.getBoundingClientRect();
        return {
          x: Math.round(rect.left - hostRect.left),
          y: Math.round(rect.top - hostRect.top),
          h: Math.round(rect.height),
        };
      });
    });

  const firstGeometry = await actionGeometry(0);
  const secondGeometry = await actionGeometry(1);
  expect(firstGeometry.map(item => item.x)).toEqual(secondGeometry.map(item => item.x));
  expect(new Set(firstGeometry.map(item => item.y)).size).toBe(1);
  expect(new Set(secondGeometry.map(item => item.y)).size).toBe(1);
  expect(new Set(firstGeometry.map(item => item.h)).size).toBe(1);
  expect(new Set(secondGeometry.map(item => item.h)).size).toBe(1);

  await page.locator('.card').evaluateAll(cards => {
    [72, 118, 164].forEach((height, index) => {
      const slot = cards[index]?.querySelector<HTMLElement>('.figure-strip-slot');
      if (!slot) throw new Error(`figure strip missing for card ${index}`);
      slot.style.height = `${height}px`;
      slot.style.minHeight = `${height}px`;
      slot.style.overflow = 'hidden';
    });
  });

  const crossCardActionTops = await actions.evaluateAll(hosts =>
    hosts.slice(0, 3).map(host => {
      const button = host.shadowRoot?.querySelector<HTMLElement>('button[data-action="favorite"]');
      if (!button) throw new Error('favorite button missing');
      return Math.round(button.getBoundingClientRect().top);
    })
  );
  expect(crossCardActionTops).toHaveLength(3);
  expect(Math.max(...crossCardActionTops) - Math.min(...crossCardActionTops)).toBeLessThanOrEqual(2);

  const userShell = page.locator('gallery-user-shell');
  await userShell.locator('button.trigger').click();
  await userShell.locator('button[data-tab="settings"]').click();
  const panel = userShell.locator('.panel');
  const content = userShell.locator('.content');
  await expect(panel).toBeVisible();
  await expect(content).toBeVisible();

  const panelMetrics = await panel.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      height: Math.round(element.getBoundingClientRect().height),
      gridRows: style.gridTemplateRows,
    };
  });
  expect(panelMetrics.height).toBeGreaterThan(500);
  expect(panelMetrics.height).toBeLessThanOrEqual(760);

  await content.evaluate(element => { (element as HTMLElement).scrollTop = 0; });
  await content.hover();
  await page.mouse.wheel(0, 1100);
  await expect.poll(async () => content.evaluate(element => (element as HTMLElement).scrollTop)).toBeGreaterThan(100);

  for (let index = 0; index < 6; index += 1) await page.mouse.wheel(0, 1200);
  await expect.poll(async () => content.evaluate(element => {
    const node = element as HTMLElement;
    return Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop);
  })).toBeLessThanOrEqual(3);

  const bottomNotice = content.locator('.notice').last();
  await expect(bottomNotice).toBeVisible();
});
});


test('More quick choices map directly to customizable folders', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
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
  const actions = page.locator('gallery-paper-actions').first();
  await expect(actions).toBeVisible({ timeout: 30000 });

  await actions.locator('button[data-action="more"]').click();
  await expect(actions.locator('.drawer')).toContainText(/快速选择（收藏夹）|Quick choices \(folders\)/);
  await expect(actions.locator('input[data-collection]')).toHaveCount(3);
  await expect(actions.locator('input[data-quick]')).toHaveCount(0);

  const projectFolder = actions.locator('input[data-collection="project"]');
  await projectFolder.check();
  await expect(projectFolder).toBeChecked();
  await actions.locator('button[data-action="close"]').click();
  const projectChip = actions.locator('.chip').filter({ hasText: '我的课题' });
  await expect(projectChip).toBeVisible();

  const userShell = page.locator('gallery-user-shell');
  await userShell.locator('button.trigger').click();
  await userShell.locator('button[data-tab="settings"]').click();
  const folderColor = userShell.locator('input[data-color="collection:project"]');
  await expect(folderColor).toBeVisible();
  await folderColor.evaluate((element: HTMLInputElement) => {
    element.value = '#13579b';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => projectChip.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(19, 87, 155)');
});


test('Cite formats references and copies the selected style', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { __copiedCitation?: string }).__copiedCitation = value;
        },
      },
    });
  });
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
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
  const actions = page.locator('gallery-paper-actions').first();
  await expect(actions).toBeVisible({ timeout: 30000 });
  await actions.locator('button[data-action="more"]').click();

  const select = actions.locator('select[data-citation-style]');
  await expect(select).toBeVisible();
  await expect(select.locator('option')).toHaveCount(5);
  await select.selectOption('bibtex');

  const preview = actions.locator('[data-citation-preview]');
  await expect(preview).toContainText('@article{');
  await expect(preview).toContainText(/title = \{/);
  await expect(preview).toContainText(/journal = \{/);
  await expect(preview).toContainText(/doi = \{/);

  const expected = await preview.textContent();
  await actions.locator('button[data-action="copy-citation"]').click();
  await expect(actions.locator('.citation-note')).toContainText(/已复制|Copied/);
  const copied = await page.evaluate(() => (window as Window & { __copiedCitation?: string }).__copiedCitation || '');
  expect(copied).toBe(expected);
});


test('search highlights results, picker closes outside, feedback drags and submits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let submittedFeedback: Record<string, unknown> | null = null;
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/site-feedback')) {
      submittedFeedback = route.request().postDataJSON() as Record<string, unknown>;
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
  const feedbackTab = feedback.locator('.site-feedback-tab');
  await expect(feedbackTab).toBeVisible();

  const tabBefore = await feedbackTab.boundingBox();
  expect(tabBefore).not.toBeNull();
  if (tabBefore) {
    await page.mouse.move(tabBefore.x + tabBefore.width / 2, tabBefore.y + tabBefore.height / 2);
    await page.mouse.down();
    await page.mouse.move(tabBefore.x + tabBefore.width / 2 + 180, tabBefore.y + tabBefore.height / 2 + 90, { steps: 6 });
    await page.mouse.up();
    const tabAfter = await feedbackTab.boundingBox();
    expect(tabAfter).not.toBeNull();
    if (tabAfter) {
      expect(Math.abs(tabAfter.x - tabBefore.x) + Math.abs(tabAfter.y - tabBefore.y)).toBeGreaterThan(100);
    }
  }
  await expect(feedback.locator('.site-feedback-panel')).toHaveCount(0);

  await feedbackTab.click();
  const panel = feedback.locator('.site-feedback-panel');
  await expect(panel).toBeVisible();

  await search.click();
  await expect(panel).toHaveCount(0);

  await feedbackTab.click();
  await expect(panel).toBeVisible();
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
  const feedbackImage = feedback.locator('input[data-feedback-image]');
  await feedbackImage.setInputFiles({
    name: 'feedback.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(feedback.locator('.site-feedback-image-preview')).toBeVisible();
  await expect(feedback.locator('.site-feedback-image-preview img')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await feedback.locator('[data-feedback-submit]').click();
  await expect(feedback.locator('.site-feedback-status')).toContainText(/已收到|Received/);
  expect(String(submittedFeedback?.imageData || '')).toMatch(/^data:image\/webp;base64,/);
  expect(submittedFeedback?.imageName).toBe('feedback.png');
});


test('media viewer opens raw images, prefers master source, wheel-zooms, and navigates', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/reader-counts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: {} }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  const firstCard = page.locator('.card').first();
  await expect(firstCard).toBeVisible({ timeout: 30000 });

  await firstCard.evaluate(card => {
    const strip = card.querySelector<HTMLElement>('.figure-strip');
    if (!strip) throw new Error('figure strip missing');
    if (!strip.closest('.figure-strip-shell')) {
      const shell = document.createElement('div');
      shell.className = 'figure-strip-shell';
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'figure-strip-nav figure-strip-nav--previous';
      previous.textContent = '‹';
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'figure-strip-nav figure-strip-nav--next';
      next.textContent = '›';
      strip.replaceWith(shell);
      shell.append(previous, strip, next);
    }
    strip.replaceChildren();

    const makeImage = (label: string, thumbWidth: number, thumbHeight: number, masterWidth: number, masterHeight: number): HTMLImageElement => {
      const image = new Image();
      image.alt = label;
      const thumbSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${thumbWidth}" height="${thumbHeight}"><rect width="100%" height="100%" fill="white"/><text x="4" y="18">${label} thumb</text></svg>`;
      const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${masterWidth}" height="${masterHeight}"><rect width="100%" height="100%" fill="white"/><text x="8" y="28">${label} master</text></svg>`;
      image.src = `data:image/svg+xml,${encodeURIComponent(thumbSvg)}`;
      image.dataset.masterSrc = `data:image/svg+xml,${encodeURIComponent(masterSvg)}`;
      return image;
    };

    strip.append(
      makeImage('Synthetic A', 40, 25, 320, 200),
      makeImage('Synthetic B', 50, 30, 640, 400),
    );
  });

  const stripLayout = await firstCard.locator('.figure-strip-shell').evaluate(shell => {
    const previous = shell.querySelector<HTMLElement>('.figure-strip-nav--previous');
    const next = shell.querySelector<HTMLElement>('.figure-strip-nav--next');
    const strip = shell.querySelector<HTMLElement>('.figure-strip');
    if (!previous || !next || !strip) throw new Error('figure strip navigation missing');
    const shellRect = shell.getBoundingClientRect();
    const previousRect = previous.getBoundingClientRect();
    const nextRect = next.getBoundingClientRect();
    const stripStyle = getComputedStyle(strip);
    return {
      shellPosition: getComputedStyle(shell).position,
      navPosition: getComputedStyle(previous).position,
      previousInset: Math.round(previousRect.left - shellRect.left),
      nextInset: Math.round(shellRect.right - nextRect.right),
      paddingLeft: stripStyle.paddingLeft,
      paddingRight: stripStyle.paddingRight,
    };
  });
  expect(stripLayout).toEqual({
    shellPosition: 'relative',
    navPosition: 'absolute',
    previousInset: 2,
    nextInset: 2,
    paddingLeft: '34px',
    paddingRight: '34px',
  });

  const rawImages = firstCard.locator('.figure-strip img');
  await expect(rawImages).toHaveCount(2);
  await rawImages.first().click();

  const viewer = page.locator('.media-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('aria-label', 'Synthetic A');
  await expect(viewer.locator('.media-viewer__info span')).toContainText('320 × 200px');

  const viewerImage = viewer.locator('.media-viewer__image');
  const beforeWidth = await viewerImage.evaluate(element => Number.parseFloat((element as HTMLImageElement).style.width || '0'));
  const viewport = viewer.locator('.media-viewer__viewport');
  await viewport.dispatchEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
  await expect.poll(async () => viewerImage.evaluate(element => Number.parseFloat((element as HTMLImageElement).style.width || '0'))).toBeGreaterThan(beforeWidth);

  const floatingNext = viewer.locator('.media-viewer__nav--next');
  await expect(floatingNext).toBeVisible();
  await floatingNext.click();
  await expect(viewer).toHaveAttribute('aria-label', 'Synthetic B');
  await expect(viewer.locator('.media-viewer__info span')).toContainText('640 × 400px');

  await page.keyboard.press('ArrowLeft');
  await expect(viewer).toHaveAttribute('aria-label', 'Synthetic A');

  await viewer.locator('button[data-action="close"]').click();
  await expect(viewer).toHaveCount(0);
});


test('reader count marks only trusted article-link clicks', async ({ page }) => {
  test.setTimeout(60_000);
  let markCalls = 0;

  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/reader-counts/mark')) {
      markCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: markCalls, unique: true, generation: 'article-open-v3' }),
      });
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
  const titleLink = page.locator('.card .user-title-link').first();
  await expect(titleLink).toBeVisible({ timeout: 30000 });

  await titleLink.evaluate(anchor => {
    anchor.addEventListener('click', event => event.preventDefault(), { capture: true });
    (anchor as HTMLAnchorElement).click();
  });
  await page.waitForTimeout(150);
  expect(markCalls).toBe(0);

  await titleLink.click();
  await expect.poll(() => markCalls).toBe(1);
});


test('failed article-open marks persist and retry after reload', async ({ page }) => {
  test.setTimeout(60_000);
  let failMark = true;
  let markCalls = 0;

  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/reader-counts/mark')) {
      markCalls += 1;
      if (failMark) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'd1_unavailable' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 2, unique: true, generation: 'article-open-v3' }),
      });
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
  const titleLink = page.locator('.card .user-title-link').first();
  await expect(titleLink).toBeVisible({ timeout: 30000 });
  const doi = await titleLink.evaluate(anchor => {
    const match = String((anchor as HTMLAnchorElement).href || '').match(/doi\.org\/(.+)$/i);
    return match?.[1]?.toLowerCase() || '';
  });
  expect(doi).toBeTruthy();

  await titleLink.click();
  await expect.poll(() => markCalls).toBe(1);
  await expect.poll(async () => page.evaluate(() => {
    return JSON.parse(localStorage.getItem('organic-gallery-reader-open-queue-v1') || '[]').length;
  })).toBe(1);

  failMark = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => markCalls, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.evaluate(() => {
    return JSON.parse(localStorage.getItem('organic-gallery-reader-open-queue-v1') || '[]').length;
  })).toBe(0);

  const metric = page.locator('gallery-paper-actions').first().locator('.metric');
  await expect(metric).toContainText('2');
});


test('reader counts preserve last success and never turn API failure into fake zero', async ({ page }) => {
  test.setTimeout(60_000);
  let failCounts = false;

  await page.route('https://api.gczhouwld.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/user-ui/reader-counts')) {
      if (failCounts) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'd1_unavailable' }) });
        return;
      }
      const payload = route.request().postDataJSON() as { dois?: string[] };
      const counts = Object.fromEntries((payload.dois || []).map(doi => [doi, 7]));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts }) });
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
  const metric = page.locator('gallery-paper-actions').first().locator('.metric');
  await expect(metric).toContainText('7');
  await expect(metric).toHaveAttribute('data-reader-count-known', 'true');

  failCounts = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  const cachedMetric = page.locator('gallery-paper-actions').first().locator('.metric');
  await expect(cachedMetric).toContainText('7');
  await expect(cachedMetric).toHaveAttribute('data-reader-count-known', 'true');

  await page.evaluate(() => localStorage.removeItem('organic-gallery-reader-counts-v3'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const unknownMetric = page.locator('gallery-paper-actions').first().locator('.metric');
  await expect(unknownMetric).toContainText('—');
  await expect(unknownMetric).toHaveAttribute('data-reader-count-known', 'false');
  await expect(unknownMetric).not.toContainText('0');
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
