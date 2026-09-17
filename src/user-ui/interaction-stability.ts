const USER_CENTER = 'gallery-user-shell';
const PAPER_ACTIONS = 'gallery-paper-actions';
const USER_CENTER_PATCH = Symbol.for('organic-gallery.user-center-scroll-stability');
const PAPER_ACTIONS_PATCH = Symbol.for('organic-gallery.paper-actions-overlay-stability');
const activeDrawerHosts = new Set<HTMLElement>();

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

function syncPageLock(): void {
  document.documentElement.classList.toggle('gallery-user-drawer-open', activeDrawerHosts.size > 0);
}

function patchUserCenter(): void {
  void customElements.whenDefined(USER_CENTER).then(() => {
    const ctor = customElements.get(USER_CENTER) as (CustomElementConstructor & { prototype: Record<PropertyKey, any> }) | undefined;
    if (!ctor) return;
    const proto = ctor.prototype;
    if (proto[USER_CENTER_PATCH]) return;
    proto[USER_CENTER_PATCH] = true;
    const originalRender = proto.render;
    if (typeof originalRender !== 'function') return;

    proto.render = function renderWithStableScroll(this: HTMLElement): void {
      originalRender.call(this);
      const shadow = this.shadowRoot;
      if (!shadow || shadow.querySelector('style[data-user-center-scroll-fix]')) return;
      const style = document.createElement('style');
      style.dataset.userCenterScrollFix = 'true';
      style.textContent = `
        .panel {
          height: min(76vh, 720px);
          min-height: 0;
        }
        .nav,
        .content {
          min-height: 0;
        }
        .content {
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          -webkit-overflow-scrolling: touch;
        }
        @media(max-width:680px) {
          .panel { height: auto; max-height: none; }
          .content { min-height: 0; overflow-y: auto; }
        }
      `;
      shadow.appendChild(style);
    };

    document.querySelectorAll<HTMLElement>(USER_CENTER).forEach(element => proto.render.call(element));
  });
}

function patchPaperActions(): void {
  void customElements.whenDefined(PAPER_ACTIONS).then(() => {
    const ctor = customElements.get(PAPER_ACTIONS) as (CustomElementConstructor & { prototype: Record<PropertyKey, any> }) | undefined;
    if (!ctor) return;
    const proto = ctor.prototype;
    if (proto[PAPER_ACTIONS_PATCH]) return;
    proto[PAPER_ACTIONS_PATCH] = true;
    const originalRender = proto.render;
    const originalDisconnected = proto.disconnectedCallback;
    if (typeof originalRender !== 'function') return;

    proto.render = function renderWithStableDrawer(this: HTMLElement): void {
      originalRender.call(this);
      const card = this.closest<HTMLElement>('.card');
      const shadow = this.shadowRoot;
      const overlay = shadow?.querySelector<HTMLElement>('.overlay') || null;
      const drawer = shadow?.querySelector<HTMLElement>('.drawer') || null;
      const open = Boolean(overlay && drawer);

      if (card) card.classList.toggle('user-action-open', open);
      if (open) activeDrawerHosts.add(this);
      else activeDrawerHosts.delete(this);
      syncPageLock();

      if (shadow && !shadow.querySelector('style[data-paper-drawer-fix]')) {
        const style = document.createElement('style');
        style.dataset.paperDrawerFix = 'true';
        style.textContent = `
          .overlay { overscroll-behavior: contain; }
          .drawer {
            min-height: 0;
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
            -webkit-overflow-scrolling: touch;
          }
        `;
        shadow.appendChild(style);
      }

      drawer?.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
      drawer?.addEventListener('touchmove', event => event.stopPropagation(), { passive: true });
    };

    proto.disconnectedCallback = function disconnectedWithDrawerCleanup(this: HTMLElement): void {
      activeDrawerHosts.delete(this);
      this.closest<HTMLElement>('.card')?.classList.remove('user-action-open');
      syncPageLock();
      if (typeof originalDisconnected === 'function') originalDisconnected.call(this);
    };

    document.querySelectorAll<HTMLElement>(PAPER_ACTIONS).forEach(element => proto.render.call(element));
  });
}

ensureGlobalStyle();
patchUserCenter();
patchPaperActions();

export {};
