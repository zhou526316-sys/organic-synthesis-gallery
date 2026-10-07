// Preserve a completed mouse click when late card layout moves its native hit
// target. Trust the browser's pointerdown target: measuring its rectangle can
// itself finish lazy layout, so a post-hit rectangle is not the hit-test truth.
// Touch, keyboard and native clicks on the original button stay untouched.
export function installPaginationPointerStability(): () => void {
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  type Press = {
    id: number; button: HTMLButtonElement; rect: DOMRect;
    x: number; y: number; hitMoved: boolean;
  };
  let press: Press | null = null;
  let released: (Press & { at: number }) | null = null;

  const buttonFor = (target: EventTarget | null): HTMLButtonElement | null => {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLButtonElement>('#resultWindowControls button');
  };

  document.addEventListener('pointerdown', event => {
    press = null;
    released = null;
    if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
    const button = buttonFor(event.target);
    if (!button || button.disabled) return;
    const rect = button.getBoundingClientRect();
    const x = event.clientX, y = event.clientY;
    press = { id: event.pointerId, button, rect, x, y,
      hitMoved: x < rect.left || x > rect.right || y < rect.top || y > rect.bottom };
  }, options);

  document.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    const completed = press;
    press = null;
    // Reconcile only a stationary click. A drag away from its real down point
    // must not navigate even when the footer moves in the opposite direction.
    if (!completed.button.isConnected || completed.button.disabled
      || Math.hypot(event.clientX - completed.x, event.clientY - completed.y) > 6) return;
    released = { ...completed, at: performance.now() };
  }, options);

  document.addEventListener('pointercancel', () => {
    press = null;
    released = null;
  }, options);

  document.addEventListener('click', event => {
    const completed = released;
    released = null;
    if (!completed || event.detail === 0 || event.button !== 0 || performance.now() - completed.at > 750) return;
    const { button, rect, hitMoved } = completed;
    if (!button.isConnected || button.disabled || buttonFor(event.target) === button) return;
    if (button.closest('[hidden], [inert]') || !button.getClientRects().length) return;
    const now = button.getBoundingClientRect();
    if (!hitMoved && Math.abs(now.left - rect.left) < 2 && Math.abs(now.top - rect.top) < 2) return;
    // Consume the retargeted ancestor/card click and forward exactly once.
    event.preventDefault();
    event.stopImmediatePropagation();
    button.click();
  }, options);

  return () => {
    controller.abort();
    press = null;
    released = null;
  };
}
