// Recover a pagination click only when a stationary mouse completed a real
// press/release but late layout moved the button away before the click. WebKit
// does not reliably retarget compatibility clicks with pointer capture alone.
// Never activate on pointerdown or pointerup; touch and keyboard stay native.
export function installPaginationPointerStability(): () => void {
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  type Press = { id: number; button: HTMLButtonElement; rect: DOMRect };
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
    press = { id: event.pointerId, button, rect: button.getBoundingClientRect() };
  }, options);

  document.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    const completed = press;
    press = null;
    const { button, rect } = completed;
    // A real drag outside the original button must not turn into navigation.
    if (!button.isConnected || button.disabled || event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) return;
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
    const { button, rect } = completed;
    if (!button.isConnected || button.disabled || buttonFor(event.target) === button) return;
    if (button.closest('[hidden], [inert]') || !button.getClientRects().length) return;
    const now = button.getBoundingClientRect();
    if (Math.abs(now.left - rect.left) < 2 && Math.abs(now.top - rect.top) < 2) return;
    // The original click would otherwise land on the common ancestor or the
    // newly exposed card. Consume it before forwarding exactly once.
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
