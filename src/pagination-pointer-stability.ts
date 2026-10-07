// Keep a native mouse click attached to the pressed pagination button when
// lazy card layout moves the footer between pointerdown and pointerup.
// Activation still happens on click, never on pointerdown. Touch scrolling and
// keyboard activation retain their native behavior.
export function installPaginationPointerStability(): () => void {
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  const cancelled = new WeakSet<HTMLButtonElement>();
  let press: { id: number; button: HTMLButtonElement; rect: DOMRect } | null = null;

  const buttonFor = (target: EventTarget | null): HTMLButtonElement | null => {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('#resultWindowControls button');
    return button && !button.disabled ? button : null;
  };

  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
    const button = buttonFor(event.target);
    if (!button) return;
    cancelled.delete(button);
    const rect = button.getBoundingClientRect();
    try {
      button.setPointerCapture(event.pointerId);
      press = { id: event.pointerId, button, rect };
    } catch {
      press = null;
    }
  }, options);

  document.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    const { button, rect } = press;
    press = null;
    // Preserve drag-away cancellation against the original mouse hit target,
    // not a footer that may have moved underneath a stationary pointer.
    if (!button.isConnected || event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) cancelled.add(button);
  }, options);

  document.addEventListener('pointercancel', event => {
    if (!press || press.id !== event.pointerId) return;
    cancelled.add(press.button);
    press = null;
  }, options);

  document.addEventListener('click', event => {
    const button = buttonFor(event.target);
    if (!button || event.detail === 0 || !cancelled.has(button)) return;
    cancelled.delete(button);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, options);

  return () => {
    controller.abort();
    if (press?.button.hasPointerCapture(press.id)) press.button.releasePointerCapture(press.id);
    press = null;
  };
}
