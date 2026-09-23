const ELEMENT = 'gallery-page-navigation';
const STYLE_ID = 'gallery-page-navigation-visibility';
const INTERRUPT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

class GalleryPageNavigation extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private frame = 0;
  private sizes: ResizeObserver | null = null;
  private startupContent: MutationObserver | null = null;
  private language: MutationObserver | null = null;
  private lastLanguage = '';
  private jumpEdge: 'top' | 'bottom' | null = null;
  private settleUntil = 0;
  private settleTimer = 0;

  private readonly stopJump = (): void => {
    this.jumpEdge = null;
    if (this.settleTimer) window.clearTimeout(this.settleTimer);
    this.settleTimer = 0;
  };

  private readonly schedule = (): void => {
    if (!this.frame && this.isConnected) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  };

  private readonly onResize = (): void => {
    this.stopJump();
    this.schedule();
  };

  private observeLayoutRoots(): boolean {
    if (!this.sizes) return false;
    const app = document.querySelector('#app');
    const gallery = document.querySelector('#gallery');
    if (app instanceof Element) this.sizes.observe(app);
    if (gallery instanceof Element) this.sizes.observe(gallery);
    return gallery instanceof Element;
  }

  connectedCallback(): void {
    this.root.innerHTML = `<style>
      :host{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9000;display:block;width:46px;font:11px/1.2 system-ui,sans-serif;color:#344054}
      :host([hidden]){display:none!important}
      *{box-sizing:border-box}
      nav{display:grid;gap:4px;padding:2px;border:1px solid #d7deea;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 4px 16px rgba(30,41,59,.12)}
      button{appearance:none;border:0;border-radius:11px;background:transparent;color:inherit;width:40px;min-height:44px;padding:4px 0;display:grid;place-items:center;gap:0;cursor:pointer;font:inherit;touch-action:manipulation}
      button:hover:not(:disabled){background:#eef3fc;color:#24499b}
      button:focus-visible{outline:2px solid #3159bd;outline-offset:0}
      button:disabled{opacity:.35;cursor:default}
      .arrow{font:20px/1 system-ui,sans-serif}
      @media(forced-colors:active){nav{background:Canvas;border-color:ButtonText}button{color:ButtonText}}
    </style><nav aria-label='页面导航'>
      <button type='button' data-page-jump='top'><span class='arrow' aria-hidden='true'>↑</span><span data-label>顶部</span></button>
      <button type='button' data-page-jump='bottom'><span class='arrow' aria-hidden='true'>↓</span><span data-label>底部</span></button>
    </nav>`;
    this.root.addEventListener('click', this.onClick);
    window.addEventListener('scroll', this.schedule, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('pageshow', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize, { passive: true });
    for (const type of INTERRUPT_EVENTS) window.addEventListener(type, this.stopJump, { capture: true, passive: true });
    this.sizes = new ResizeObserver(this.schedule);
    this.sizes.observe(document.body);
    this.sizes.observe(document.documentElement);
    // main() can finish importing before its asynchronous render inserts
    // #gallery. Watch only that startup phase so the eventual content root is
    // attached to ResizeObserver; stop the DOM observer immediately afterwards.
    this.startupContent = new MutationObserver(() => {
      const ready = this.observeLayoutRoots();
      this.schedule();
      if (ready) {
        this.startupContent?.disconnect();
        this.startupContent = null;
      }
    });
    this.startupContent.observe(document.body, { childList: true, subtree: true });
    if (this.observeLayoutRoots()) {
      this.startupContent.disconnect();
      this.startupContent = null;
    }
    this.language = new MutationObserver(this.schedule);
    this.language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    this.update();
    // A custom element can connect before the browser has completed the first
    // layout pass. Re-read on the next frame even when no ResizeObserver record
    // is generated for the initial scrollHeight growth.
    this.schedule();
  }

  disconnectedCallback(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.stopJump();
    this.sizes?.disconnect(); this.sizes = null;
    this.startupContent?.disconnect(); this.startupContent = null;
    this.language?.disconnect(); this.language = null;
    this.root.removeEventListener('click', this.onClick);
    window.removeEventListener('scroll', this.schedule);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pageshow', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    for (const type of INTERRUPT_EVENTS) window.removeEventListener(type, this.stopJump, true);
    this.lastLanguage = '';
  }

  private extent(): number {
    return Math.max(0, (document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight) - document.documentElement.clientHeight);
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-page-jump]');
    if (!button || button.disabled) return;
    const edge = button.dataset.pageJump === 'top' ? 'top' : 'bottom';
    const top = edge === 'top' ? 0 : this.extent();
    const direct = Math.abs(top - window.scrollY) > window.innerHeight * 2 || matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.stopJump();
    if (direct) {
      this.jumpEdge = edge;
      this.settleUntil = performance.now() + 1500;
      this.settleTimer = window.setTimeout(() => { this.stopJump(); this.schedule(); }, 1500);
    }
    window.scrollTo({ top, left: window.scrollX, behavior: direct ? 'instant' : 'smooth' });
    this.schedule();
  };

  private update(): void {
    const extent = this.extent();
    if (this.jumpEdge && performance.now() < this.settleUntil) {
      const target = this.jumpEdge === 'top' ? 0 : extent;
      if (Math.abs(window.scrollY - target) > 3) window.scrollTo({ top: target, left: window.scrollX, behavior: 'instant' });
    } else this.stopJump();

    const vv = window.visualViewport;
    const keyboardOrZoom = Boolean(vv && (vv.scale > 1.05 || vv.height < window.innerHeight * .7));
    this.hidden = extent < 80 || keyboardOrZoom;
    const top = this.root.querySelector<HTMLButtonElement>('[data-page-jump="top"]')!;
    const bottom = this.root.querySelector<HTMLButtonElement>('[data-page-jump="bottom"]')!;
    const y = Math.max(0, window.scrollY);
    top.disabled = y <= 3;
    bottom.disabled = extent - y <= 3;
    const language = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
    if (this.lastLanguage === language) return;
    this.lastLanguage = language;
    const zh = language === 'zh';
    this.root.querySelector('nav')!.setAttribute('aria-label', zh ? '页面导航' : 'Page navigation');
    for (const [button, label, title] of [
      [top, zh ? '顶部' : 'Top', zh ? '回到顶部' : 'Back to top'],
      [bottom, zh ? '底部' : 'End', zh ? '前往底部' : 'Go to bottom'],
    ] as const) {
      button.querySelector('[data-label]')!.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
    }
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, GalleryPageNavigation);
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `body:has(.media-viewer,.image-lightbox,dialog[open],[data-gallery-user-cropper],gallery-paper-actions[data-drawer-open="true"]) ${ELEMENT}{visibility:hidden;pointer-events:none}@media print{${ELEMENT}{display:none!important}}`;
  document.head.append(style);
}
if (!document.querySelector(ELEMENT)) document.body.append(document.createElement(ELEMENT));

export {};
