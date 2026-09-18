const PAPER_ACTIONS = 'gallery-paper-actions';

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
    html.gallery-user-drawer-open,
    html.gallery-user-drawer-open body {
      overflow: hidden !important;
      overscroll-behavior: none;
    }
  `;
  document.head.appendChild(style);
}

function releaseOrphanedScrollLock(): void {
  const drawerOpen = Boolean(document.querySelector(`${PAPER_ACTIONS}[data-drawer-open="true"]`));
  document.documentElement.classList.toggle('gallery-user-drawer-open', drawerOpen);
  if (drawerOpen) return;
  for (const element of [document.documentElement, document.body]) {
    if (element.style.overflow === 'hidden') element.style.removeProperty('overflow');
    if (element.style.overscrollBehavior === 'none') element.style.removeProperty('overscroll-behavior');
    element.classList.remove('scroll-lock', 'scroll-locked', 'no-scroll');
  }
}

ensureGlobalStyle();
releaseOrphanedScrollLock();

const observer = new MutationObserver(() => releaseOrphanedScrollLock());
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['data-drawer-open', 'class', 'style'],
});

window.addEventListener('pageshow', releaseOrphanedScrollLock);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) releaseOrphanedScrollLock();
});

export {};
