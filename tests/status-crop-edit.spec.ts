import { test, expect, type Page, type Locator } from '@playwright/test';
import { createHash } from 'node:crypto';
import { KEY, GIF, gifFile } from './status-image-fixtures';
const SITE = process.env.LIVE_SITE_URL || 'http://127.0.0.1:4173/';
test.use({ serviceWorkers: 'block' });
const records = new Map<Page, { errors: string[]; marks: string[] }>();
async function open(page: Page, width = 390): Promise<Locator> {
  await page.setViewportSize({ width, height: 900 });
  const record = { errors: [] as string[], marks: [] as string[] }; records.set(page, record);
  page.on('pageerror', error => record.errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['blob:','data:'].includes(url.protocol)) { await route.continue(); return; }
    const headers = { 'access-control-allow-origin': request.headers().origin || new URL(SITE).origin, 'access-control-allow-credentials':'true', 'access-control-allow-methods':'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE', 'access-control-allow-headers':request.headers()['access-control-request-headers'] || 'content-type, authorization', vary:'Origin' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status:204, headers }); return; }
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (['GET','HEAD'].includes(request.method()) && !api) { await route.continue(); return; }
    if (url.pathname.endsWith('/reader-counts/mark')) record.marks.push(url.pathname);
    const body = url.pathname.endsWith('/reader-counts') ? { counts:{} } : url.pathname.endsWith('/integrations') ? { auth:{}, payments:{} } : { items:[] };
    await route.fulfill({ status:200, headers, contentType:'application/json', body:JSON.stringify(body) });
  });
  const response = await page.goto(SITE, { waitUntil:'domcontentloaded' }); expect(response?.ok()).toBe(true);
  const actions = page.locator('gallery-paper-actions').first();
  await expect(actions).toBeVisible({timeout:45000});
  await actions.locator('[data-action="status"]').click();
  await expect(actions.locator('[data-status-image="to-read"]')).toBeVisible();
  return actions;
}
async function state(page: Page): Promise<any> { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).statuses.find((s:any) => s.id === 'to-read').style, KEY); }
async function fixture(page: Page, background = false): Promise<{name:string;mimeType:string;buffer:Buffer}> {
  const data = await page.evaluate(bg => {
    const c = document.createElement('canvas'); c.width = bg ? 300 : 600; c.height = bg ? 300 : 200;
    const x = c.getContext('2d')!;
    if (bg) { x.fillStyle='#fff';x.fillRect(0,0,300,300);x.fillStyle='#ff0000';x.fillRect(70,70,160,160); }
    else { ['#ff0000','#00ff00','#0000ff'].forEach((color,i) => {x.fillStyle=color;x.fillRect(i*200,0,200,200);}); }
    return c.toDataURL().split(',')[1];
  }, background);
  return {name:'crop-input.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}
async function upload(page:Page,actions:Locator,background=false):Promise<void> {
  await actions.locator('[data-status-image="to-read"]').setInputFiles(await fixture(page,background));
  await expect(actions.locator('[data-status-image-message]')).toContainText(/原图已保存|Original saved/);
}
async function crop(page:Page,actions:Locator):Promise<Locator> {
  await actions.locator('[data-action="crop-status-image:to-read"]').click();
  const dialog=page.locator('[data-crop-editor]'); await expect(dialog).toBeVisible(); return dialog;
}
async function field(dialog:Locator,key:string,value:number):Promise<void> {
  const input=dialog.locator(`[data-crop-field="${key}"]`); await input.fill(String(value)); await input.press('Tab');
}
async function pixels(page:Page,source:string):Promise<any> {
  return page.evaluate(async source=>{
    const image=new Image();image.src=source;await image.decode();
    const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
    const x=c.getContext('2d')!;x.drawImage(image,0,0);
    const at=(px:number,py:number)=>Array.from(x.getImageData(px,py,1,1).data);
    return {width:c.width,height:c.height,center:at(Math.floor(c.width/2),Math.floor(c.height/2)),corner:at(0,0),left:at(1,Math.floor(c.height/2)),right:at(c.width-2,Math.floor(c.height/2))};
  },source);
}
test.afterEach(async ({page})=>{ const r=records.get(page); if(r){ expect(r.errors).toEqual([]);expect(r.marks).toEqual([]); } });

for(const width of [320,1280]) test(`direct crop saves selected pixels, not full image, and survives reload at ${width}`,async({page},info)=>{
  test.setTimeout(60000);
  const actions=await open(page,width);await upload(page,actions);const original=await state(page);
  const dialog=await crop(page,actions);
  await dialog.locator('[data-crop-mode="free"]').click();
  await field(dialog,'width',200);await field(dialog,'height',200);await field(dialog,'x',200);await field(dialog,'y',0);
  const rect=(await dialog.boundingBox())!;expect(rect.width).toBeLessThan(width);expect(rect.height).toBeLessThan(900);
  await page.screenshot({path:info.outputPath(`crop-selection-${width}.png`)});
  await dialog.locator('[data-crop-apply]').click();await expect(dialog).toHaveCount(0);
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.x).toBeCloseTo(1/3,5);
  const cropped=await state(page);expect(cropped.imageOriginal).toEqual(original.imageOriginal);
  expect(cropped.imageCrop.sourcePreview).toBe(original.imageData);
  expect(await pixels(page,cropped.imageData)).toMatchObject({width:200,height:200,center:[0,255,0,255],left:[0,255,0,255],right:[0,255,0,255]});
  await actions.locator('[data-action="set-status:to-read"]').click();
  const image=actions.locator('[data-action="status"] img');await expect(image).toHaveAttribute('data-image-source','crop');
  await expect(image).not.toHaveAttribute('data-status-asset',/.+/);
  await page.reload({waitUntil:'domcontentloaded'});await expect(image).toHaveAttribute('data-image-source','crop');
  expect(await image.getAttribute('src')).toBe(cropped.imageData);
  await actions.locator('[data-action="status"]').click();
  await actions.locator('[data-action="view-status-image:to-read"]').click();
  await expect(page.locator('[data-status-image-viewer] img')).toHaveAttribute('data-image-source','crop');
  await page.keyboard.press('Escape');
  await actions.locator('[data-action="restore-status-image:to-read"]').click();
  await expect(image).toHaveAttribute('data-image-source','original');
  expect((await state(page)).imageData).toBe(original.imageData);expect((await state(page)).imageCrop).toBeUndefined();
  await expect(actions.locator('.bar > button.action')).toHaveCount(4);
});

test('circular crop exports real transparent corners and can be recropped from original',async({page},info)=>{
  test.setTimeout(60000);
  const actions=await open(page);await upload(page,actions);
  let dialog=await crop(page,actions);await dialog.locator('[data-crop-mode="circle"]').click();
  await page.screenshot({path:info.outputPath('circular-selection.png')});
  await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.mode).toBe('circle');
  const circle=await pixels(page,(await state(page)).imageData);expect(circle.corner[3]).toBe(0);expect(circle.center).toEqual([0,255,0,255]);
  dialog=await crop(page,actions);await expect(dialog.locator('[data-crop-mode="circle"]')).toHaveAttribute('aria-pressed','true');
  await dialog.locator('[data-crop-mode="free"]').click();await field(dialog,'x',0);
  await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.x).toBe(0);
  expect((await pixels(page,(await state(page)).imageData)).center).toEqual([255,0,0,255]);
});

test('simple background removal and erase/restore brushes change actual alpha pixels',async({page},info)=>{
  test.setTimeout(60000);
  const actions=await open(page);await upload(page,actions,true);
  let dialog=await crop(page,actions);await dialog.locator('[data-crop-cutout] summary').click();
  await dialog.locator('[data-crop-background]').click();
  await page.screenshot({path:info.outputPath('local-background-cutout.png')});
  await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.background).toBe(24);
  let p=await pixels(page,(await state(page)).imageData);expect(p.corner[3]).toBe(0);expect(p.center).toEqual([255,0,0,255]);
  dialog=await crop(page,actions);await dialog.locator('[data-crop-cutout] summary').click();await dialog.locator('[data-crop-tool="erase"]').click();
  await dialog.locator('[data-crop-canvas]').click();await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.strokes.length).toBe(1);
  p=await pixels(page,(await state(page)).imageData);expect(p.center[3]).toBe(0);
  dialog=await crop(page,actions);await dialog.locator('[data-crop-cutout] summary').click();await dialog.locator('[data-crop-tool="restore"]').click();
  await dialog.locator('[data-crop-canvas]').click();await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.strokes.length).toBe(2);
  p=await pixels(page,(await state(page)).imageData);expect(p.center).toEqual([255,0,0,255]);expect(p.corner[3]).toBe(0);
});

test('cancel and failed save keep both source and prior display unchanged',async({page})=>{
  const actions=await open(page);await upload(page,actions);const before=await state(page);
  await crop(page,actions);await page.keyboard.press('Escape');await expect(page.locator('[data-crop-editor]')).toHaveCount(0);expect(await state(page)).toEqual(before);
  const dialog=await crop(page,actions);
  await page.evaluate(key=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Full','QuotaExceededError');return native.call(this,k,v);};},KEY);
  await dialog.locator('[data-crop-apply]').click();
  await expect(actions.locator('[data-status-image-message]')).toContainText(/未能保存|Could not save/);
  expect(await state(page)).toEqual(before);
  await actions.locator('[data-action="set-status:to-read"]').click();
  await expect(actions.locator('[data-action="status"] img')).toHaveAttribute('data-image-source','original');
});

test('crop-after-upload uses the same editor; GIF crop is static and original is byte-exact after restore',async({page})=>{
  const actions=await open(page);await actions.locator('[data-status-crop="to-read"]').check();
  await actions.locator('[data-status-image="to-read"]').setInputFiles(gifFile);
  const dialog=page.locator('[data-crop-editor]');await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-crop-notice]')).toContainText(/静态|static/);
  await dialog.locator('[data-crop-mode="circle"]').click();await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.mode).toBe('circle');
  expect((await state(page)).imageData).toMatch(/^data:image\/png/);
  await actions.locator('[data-action="set-status:to-read"]').click();await actions.locator('[data-action="status"]').click();
  await actions.locator('[data-action="restore-status-image:to-read"]').click();
  const image=actions.locator('[data-action="status"] img');await expect(image).toHaveAttribute('data-image-source','original');
  const hash=await image.evaluate(async node=>{const b=await(await fetch((node as HTMLImageElement).src)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');});
  expect(hash).toBe(createHash('sha256').update(GIF).digest('hex'));
});

test('saved crop remains a crop without local originals in an independent browser context',async({page,browser})=>{
  const actions=await open(page);await upload(page,actions);const dialog=await crop(page,actions);await dialog.locator('[data-crop-apply]').click();
  await expect.poll(async()=>(await state(page)).imageCrop?.recipe.mode).toBe('square');
  const snapshot=await page.evaluate(key=>localStorage.getItem(key)!,KEY);
  const other=await browser.newContext({serviceWorkers:'block'});
  try {
    await other.addInitScript(({key,snapshot})=>localStorage.setItem(key,snapshot),{key:KEY,snapshot});
    const otherPage=await other.newPage();const otherActions=await open(otherPage);
    const saved=await state(otherPage);expect((await pixels(otherPage,saved.imageData)).center).toEqual([0,255,0,255]);
    const edit=await crop(otherPage,otherActions);await expect(edit.locator('[data-crop-notice]')).toContainText(/同步预览|synced preview/);await otherPage.keyboard.press('Escape');
    const record=records.get(otherPage)!;expect(record.errors).toEqual([]);expect(record.marks).toEqual([]);
  } finally { await other.close(); }
});
