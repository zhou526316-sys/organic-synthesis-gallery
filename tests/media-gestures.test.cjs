const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installMediaGestures } = require('/tmp/gallery-media-gestures.cjs');

function scene() {
  const viewport = new EventTarget();
  const classes = new Set();
  Object.assign(viewport, { style: { touchAction: 'pan-x pan-y' }, scrollLeft: 0, scrollTop: 0,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {} });
  let scale = 1;
  const image = { naturalWidth: 1200, naturalHeight: 800,
    getBoundingClientRect: () => ({ left: -viewport.scrollLeft, top: -viewport.scrollTop, width: 1200 * scale, height: 800 * scale }) };
  const controller = installMediaGestures({ viewport, image, minScale: 0.2, maxScale: 6,
    getScale: () => scale, setScale: value => { scale = value; } });
  const send = (name, id, type, x, y = 100) => {
    const event = new Event(name, { cancelable: true });
    Object.assign(event, { pointerId: id, pointerType: type, button: 0, clientX: x, clientY: y });
    viewport.dispatchEvent(event);
  };
  return { viewport, classes, controller, send, scale: () => scale };
}

test('foreign move or up with the same ID cannot steal an active touch', () => {
  const s = scene(); s.send('pointerdown', 1, 'touch', 150); s.send('pointerdown', 2, 'touch', 250);
  s.send('pointermove', 1, 'mouse', 3000); s.send('pointerup', 1, 'mouse', 3000);
  assert.equal(s.scale(), 1); assert.equal(s.viewport.scrollLeft, 0);
  s.send('pointermove', 1, 'touch', 100); assert.equal(s.scale(), 1.5);
  s.send('pointerup', 2, 'touch', 250); const before = s.viewport.scrollLeft;
  s.send('pointermove', 1, 'touch', 80); assert.equal(s.viewport.scrollLeft, before + 20);
  s.controller.destroy();
});

test('third finger is ignored and reset clears all tracking', () => {
  const s = scene(); s.send('pointerdown', 1, 'touch', 100); s.send('pointerdown', 2, 'touch', 200);
  s.send('pointerdown', 3, 'touch', 150); s.send('pointermove', 3, 'touch', 3000);
  assert.equal(s.scale(), 1);
  s.controller.reset(); s.send('pointermove', 1, 'touch', 40);
  assert.equal(s.scale(), 1); assert.equal(s.classes.has('dragging'), false);
  s.controller.destroy();
});

test('destroy restores viewport touch action and removes gesture listeners', () => {
  const s = scene(); assert.equal(s.viewport.style.touchAction, 'none'); s.controller.destroy();
  assert.equal(s.viewport.style.touchAction, 'pan-x pan-y');
  s.send('pointerdown', 1, 'touch', 100); s.send('pointerdown', 2, 'touch', 200); s.send('pointermove', 2, 'touch', 400);
  assert.equal(s.scale(), 1); assert.equal(s.classes.has('dragging'), false);
});
