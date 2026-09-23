import { test, expect, type Page } from '@playwright/test';
import { open, state, KEY } from './status-image-fixtures';

test.use({ serviceWorkers: 'block' });
async function measure(page: Page): Promise<{ reads: string[][]; errors: string[]; marks: string[] }> {
  const result = { reads: [] as string[][], errors: [] as string[], marks: [] as string[] };
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/reader-counts') && request.method() === 'POST') result.reads.push(request.postDataJSON().dois || []);
    if (path.endsWith('/reader-counts/mark')) result.marks.push(path);
  });
  await page.addInitScript(key => {
    (window as any).__uiWrites = 0;
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) (window as any).__uiWrites++;
      return native.call(this, name, value);
    };
  }, KEY);
  return result;
}
const writes = (page: Page) => page.evaluate(() => (window as any).__uiWrites as number);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

for (const width of [390,1280]) {
  test(`appearance edits do not requery or serialize the full corpus at ${width}px`, async ({page}, info) => {
    const metrics = await measure(page);
    const actions = await open(page,width);
    await actions.locator('[data-action="set-status:to-read"]').click();
    await actions.locator('[data-action="status"]').click();
    await frames(page);
    const count = await page.locator('#gallery .card').count();
    const initialWrites = await writes(page);
    expect(count).toBeGreaterThan(30);
    // Includes every initial card registration, not just a small fixture.
    expect(initialWrites).toBeLessThan(16);
    const beforeReads = metrics.reads.length;
    const beforeWrites = await writes(page);
    for (const mode of ['soft','pulse','orbit','rainbow','none','soft','pulse','none']) {
      await actions.locator('[data-status-glow-choice="to-read"]').selectOption(mode);
    }
    await frames(page);
    const editWrites = (await writes(page)) - beforeWrites;
    const editReads = metrics.reads.length - beforeReads;
    expect(editWrites).toBe(8);
    expect(editReads).toBe(0);
    expect((await state(page)).statuses.find((s:any) => s.id==='to-read').style.glow).toBe('none');
    await expect(actions.locator('.bar > button.action')).toHaveCount(4);
    expect(metrics.marks).toEqual([]); expect(metrics.errors).toEqual([]);
    await info.attach('refresh-cost.json', { body: JSON.stringify({width,cards:count,initialWrites,editWrites,editReads}), contentType:'application/json' });
  });
}

test('search reuses metadata and count reads while matching DOI and clearing highlights', async ({page},info) => {
  const metrics=await measure(page);
  const actions=await open(page,1280);
  await actions.locator('[data-action="close"]').click();
  await frames(page);
  const doi=await actions.getAttribute('data-paper-id');
  expect(doi).toMatch(/^10\./);
  const beforeReads=metrics.reads.length, beforeWrites=await writes(page);
  const search=page.locator('#search');
  await search.fill(doi!.toUpperCase());
  await expect(page.locator('#resultCount')).toHaveText('1');
  await expect(page.locator('#gallery .card:not([hidden]) .user-search-highlight').first()).toBeVisible();
  await search.fill('not-an-existing-search-combination-923');
  await expect(page.locator('#resultCount')).toHaveText('0');
  await search.fill('');
  await expect(page.locator('#gallery .user-search-empty')).toHaveCount(0);
  await expect(page.locator('#gallery .user-search-highlight')).toHaveCount(0);
  await frames(page);
  expect(metrics.reads.length-beforeReads).toBe(0);
  expect((await writes(page))-beforeWrites).toBe(0);
  expect(metrics.marks).toEqual([]); expect(metrics.errors).toEqual([]);
  await info.attach('search-cost.json',{body:JSON.stringify({countReads:0,metadataWrites:0}),contentType:'application/json'});
});

test('new DOM card registers immediately and loads only its uncached DOI', async ({page},info) => {
  const metrics=await measure(page);
  const actions=await open(page,1280); await actions.locator('[data-action="close"]').click();
  await frames(page);
  const beforeReads=metrics.reads.length, beforeWrites=await writes(page);
  const doi='10.5555/gallery-ui-refresh-fixture';
  await page.locator('#gallery').evaluate((gallery,doi)=>{
    const card=document.createElement('article'); card.className='card'; card.dataset.refreshFixture='true';
    card.innerHTML=`<div class="meta"><span class="tag">Layout fixture only</span></div><h2 class="title">Distinctive refresh regression fixture</h2><div class="doi">${doi}</div><div class="cardfoot"></div>`;
    gallery.prepend(card);
  },doi);
  const fixture=page.locator('[data-refresh-fixture]');
  await expect(fixture.locator('gallery-paper-actions')).toHaveAttribute('data-paper-id',doi);
  await expect.poll(()=>metrics.reads.slice(beforeReads).flat()).toEqual([doi]);
  expect((await state(page)).metadata[doi].title).toBe('Distinctive refresh regression fixture');
  expect((await writes(page))-beforeWrites).toBe(1);
  await page.locator('#search').fill('Distinctive refresh regression fixture');
  await expect(page.locator('#resultCount')).toHaveText('1');
  await fixture.evaluate(element=>element.remove());
  await expect(page.locator('#resultCount')).toHaveText('0');
  expect(metrics.marks).toEqual([]); expect(metrics.errors).toEqual([]);
  await info.attach('new-card-cost.json',{body:JSON.stringify({readDois:metrics.reads.slice(beforeReads).flat(),metadataWrites:1}),contentType:'application/json'});
});
