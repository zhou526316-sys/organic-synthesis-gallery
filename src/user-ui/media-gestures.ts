interface Point { x: number; y: number; type: string; }
interface GestureOptions {
  viewport: HTMLElement;
  image: HTMLImageElement;
  getScale: () => number;
  setScale: (scale: number) => void;
  minScale: number;
  maxScale: number;
}

/** Owns pointer gestures only inside an already open image viewport.
 * Image sources, bytes, metadata and document zoom are never changed. */
export function installMediaGestures(options: GestureOptions): { reset: () => void; destroy: () => void } {
  const { viewport, image, getScale, setScale, minScale, maxScale } = options;
  const pointers = new Map<number, Point>();
  const previousTouchAction = viewport.style.touchAction;
  viewport.style.touchAction = 'none';
  const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
  const middle = (a: Point, b: Point): { x: number; y: number } => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const release = (id: number): void => {
    try { if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id); } catch { /* Pointer already ended. */ }
  };
  const reset = (): void => {
    const ids = [...pointers.keys()];
    pointers.clear();
    viewport.classList.remove('dragging');
    ids.forEach(release);
  };

  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || !image.naturalWidth || !image.naturalHeight) return;
    const first = pointers.values().next().value as Point | undefined;
    if (first && first.type !== event.pointerType) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    viewport.classList.add('dragging');
    try { viewport.setPointerCapture(event.pointerId); } catch { /* Synthetic events have no active browser pointer. */ }
    event.preventDefault();
  };

  const move = (event: PointerEvent): void => {
    const old = pointers.get(event.pointerId);
    // A hover/compatibility event from another input device cannot take over
    // the tracked touch even if its numeric pointer ID is reused.
    if (!old || old.type !== event.pointerType) return;
    const before = [...pointers.entries()].slice(0, 2);
    pointers.set(event.pointerId, { ...old, x: event.clientX, y: event.clientY });
    const after = [...pointers.entries()].slice(0, 2);
    event.preventDefault();
    if (after.length === 1) {
      viewport.scrollLeft -= event.clientX - old.x;
      viewport.scrollTop -= event.clientY - old.y;
      return;
    }
    // A third finger neither changes the controlling pair nor causes a jump.
    if (!before.some(([id]) => id === event.pointerId)) return;
    const a = before[0][1], b = before[1][1];
    const c = after[0][1], d = after[1][1];
    const oldDistance = distance(a, b), newDistance = distance(c, d);
    if (oldDistance < 2 || newDistance < 2) return;
    const oldMiddle = middle(a, b), newMiddle = middle(c, d);
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Preserve the image point under the two fingers, including midpoint pan.
    const anchorX = (oldMiddle.x - rect.left) / rect.width;
    const anchorY = (oldMiddle.y - rect.top) / rect.height;
    const next = Math.max(minScale, Math.min(maxScale, getScale() * newDistance / oldDistance));
    setScale(next);
    const resized = image.getBoundingClientRect();
    viewport.scrollLeft += resized.left + anchorX * resized.width - newMiddle.x;
    viewport.scrollTop += resized.top + anchorY * resized.height - newMiddle.y;
  };

  const end = (event: PointerEvent): void => {
    const tracked = pointers.get(event.pointerId);
    if (!tracked || tracked.type !== event.pointerType) return;
    pointers.delete(event.pointerId);
    release(event.pointerId);
    // Remaining pointers already hold their latest coordinates, so lifting one
    // finger resumes panning without stale pinch distance or scroll baselines.
    if (!pointers.size) viewport.classList.remove('dragging');
  };

  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  viewport.addEventListener('lostpointercapture', end);
  return {
    reset,
    destroy: () => {
      reset();
      viewport.removeEventListener('pointerdown', down);
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', end);
      viewport.removeEventListener('pointercancel', end);
      viewport.removeEventListener('lostpointercapture', end);
      viewport.style.touchAction = previousTouchAction;
    },
  };
}
