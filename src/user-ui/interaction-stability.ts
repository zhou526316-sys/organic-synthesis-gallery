const LOCK_CLASS = 'gallery-user-drawer-open';

function ensureGlobalStyle(): void {
  if (document.getElementById('user-ui-interaction-stability')) return;
  const style = document.createElement('style');
  style.id = 'user-ui-interaction-stability';
  style.textContent = `
    .gallery .card.user-action-open {
      content-visibility: visible !important;
      contain: none !important;
      transform: none !important;
      overflow: visible !important;
      position: relative;
      z-index: 10019;
    }
    html.${LOCK_CLASS},
    html.${LOCK_CLASS} body {
      overflow: hidden !important;
      overscroll-behavior: none;
    }
  `;
  document.head.appendChild(style);
}

function drawerActuallyOpen(): boolean {
  return [...document.querySelectorAll<HTMLElement>('gallery-paper-actions')]
    .some(host => host.isConnected && host.dataset.drawerOpen === 'true');
}

function cleanupStaleScrollLock(): void {
  if (drawerActuallyOpen()) return;
  document.documentElement.classList.remove(LOCK_CLASS);
  for (const element of [document.documentElement, document.body]) {
    if (element.style.overflow === 'hidden') element.style.removeProperty('overflow');
    if (element.style.overscrollBehavior === 'none') element.style.removeProperty('overscroll-behavior');
    element.classList.remove('scroll-lock', 'scroll-locked', 'no-scroll');
  }
  document.querySelectorAll<HTMLElement>('.card.user-action-open').forEach(card => card.classList.remove('user-action-open'));
}

ensureGlobalStyle();
cleanupStaleScrollLock();

const observer = new MutationObserver(() => cleanupStaleScrollLock());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('pageshow', cleanupStaleScrollLock);
window.addEventListener('focus', cleanupStaleScrollLock);

export {};
