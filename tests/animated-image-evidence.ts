import { expect, type Locator, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';

/** Sample the currently painted image region. Scrolling happens once before
 * sampling, not implicitly on every locator screenshot. The six-second limit
 * and requirement for genuinely different rendered frames stay unchanged. */
export async function expectAnimatedImage(image: Locator, info: TestInfo): Promise<void> {
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  const page = image.page();
  const frames = new Set<string>();
  const samples: Array<{ at: number; hash: string; clip: { x: number; y: number; width: number; height: number } }> = [];
  const buffers = new Map<string, Buffer>();
  try {
    await expect.poll(async () => {
      const clip = await image.boundingBox();
      if (!clip || !clip.width || !clip.height) throw new Error('Animated image has no painted bounds');
      const visible = await image.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const root = node.getRootNode() as Document | ShadowRoot;
        return root.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node;
      });
      if (!visible) throw new Error('Animated image is covered; do not count unrelated pixels as animation');
      const pixels = await page.screenshot({ clip, animations: 'allow' });
      const hash = createHash('sha256').update(pixels).digest('hex');
      frames.add(hash); buffers.set(hash, pixels);
      samples.push({ at: Date.now(), hash, clip });
      return frames.size;
    }, { timeout: 6000, intervals: [150, 230, 310] }).toBeGreaterThan(1);
  } finally {
    await info.attach('painted-animation-samples.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
    let index = 0;
    for (const pixels of buffers.values()) {
      await info.attach(`painted-animation-frame-${index++}.png`, { body: pixels, contentType: 'image/png' });
    }
  }
}
