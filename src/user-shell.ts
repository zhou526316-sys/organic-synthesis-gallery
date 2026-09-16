export type UserShellLanguage = 'zh' | 'en';

const ELEMENT_NAME = 'gallery-user-shell';

const copy = {
  zh: {
    trigger: '我的文献',
    title: '我的文献库',
    subtitle: '个人收藏、阅读状态与备注入口',
    saved: '我的收藏',
    notes: '私人备注',
    settings: '个性化设置',
    followed: '关注检索',
    toRead: '将读',
    skim: '粗读',
    deep: '深读',
    sync: '账号接入后可跨设备同步；公开浏览与原文跳转保持不变。',
    close: '关闭',
  },
  en: {
    trigger: 'My Library',
    title: 'My Library',
    subtitle: 'Saved papers, reading states and private notes',
    saved: 'Saved papers',
    notes: 'Private notes',
    settings: 'Personalization',
    followed: 'Followed searches',
    toRead: 'To read',
    skim: 'Skimmed',
    deep: 'Deep read',
    sync: 'Cross-device sync will become available with accounts; public browsing and original-article links remain unchanged.',
    close: 'Close',
  },
} as const;

class GalleryUserShell extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: 'open' });
  private open = false;

  static get observedAttributes(): string[] {
    return ['data-language'];
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.open) return;
    if (event.composedPath().includes(this)) return;
    this.open = false;
    this.render();
  };

  connectedCallback(): void {
    document.addEventListener('pointerdown', this.handleDocumentPointerDown);
    this.render();
  }

  disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private get language(): UserShellLanguage {
    return this.getAttribute('data-language') === 'zh' ? 'zh' : 'en';
  }

  private render(): void {
    const text = copy[this.language];
    this.shadow.innerHTML = `<style>
      :host{position:relative;display:inline-flex;flex:0 0 auto;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033}
      *{box-sizing:border-box}
      button{font:inherit}
      .trigger{min-height:34px;padding:6px 11px;border:1px solid #d7deea;border-radius:10px;background:#fff;color:#334155;display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;font-weight:700;box-shadow:0 1px 2px rgba(15,23,42,.04)}
      .trigger:hover,.trigger:focus-visible{border-color:#9fb7f7;color:#3159bd;outline:none}
      .dot{width:7px;height:7px;border-radius:50%;background:#3159bd;box-shadow:0 0 0 3px #eef3ff}
      .panel{position:absolute;right:0;top:calc(100% + 9px);z-index:120;width:min(360px,calc(100vw - 32px));padding:16px;border:1px solid #dfe5ef;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.16)}
      .head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      h3{margin:0;font-size:16px;letter-spacing:-.01em}
      .sub{margin-top:3px;color:#788497;font-size:11px;line-height:1.45}
      .close{width:28px;height:28px;border:0;border-radius:8px;background:#f5f7fa;color:#667085;cursor:pointer;font-size:18px;line-height:1}
      .states{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 14px}
      .state{padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700}
      .state.a{background:#eef1ff;color:#5260c7}.state.b{background:#eaf5ff;color:#2d78b8}.state.c{background:#eaf7f0;color:#27845b}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .item{min-height:56px;padding:10px;border:1px solid #e5e9f0;border-radius:11px;background:#fafbfc;display:flex;align-items:center;gap:8px;color:#475467;font-size:12px;font-weight:650}
      .icon{width:24px;height:24px;border-radius:8px;background:#fff;border:1px solid #e5e9f0;display:grid;place-items:center;color:#667085;font-size:12px}
      .sync{margin-top:12px;padding-top:11px;border-top:1px solid #eef1f5;color:#8a93a3;font-size:10px;line-height:1.55}
      @media(max-width:680px){.panel{position:fixed;top:72px;right:12px;left:12px;width:auto}.trigger{min-height:32px;padding:5px 9px}.grid{grid-template-columns:1fr}}
    </style><button class='trigger' type='button' aria-expanded='${this.open}'><span class='dot' aria-hidden='true'></span><span>${text.trigger}</span></button>${this.open ? `<section class='panel' role='dialog' aria-label='${text.title}'><div class='head'><div><h3>${text.title}</h3><div class='sub'>${text.subtitle}</div></div><button class='close' type='button' aria-label='${text.close}'>×</button></div><div class='states'><span class='state a'>${text.toRead}</span><span class='state b'>${text.skim}</span><span class='state c'>${text.deep}</span></div><div class='grid'><div class='item'><span class='icon'>☆</span>${text.saved}</div><div class='item'><span class='icon'>✎</span>${text.notes}</div><div class='item'><span class='icon'>⚙</span>${text.settings}</div><div class='item'><span class='icon'>⌕</span>${text.followed}</div></div><div class='sync'>${text.sync}</div></section>` : ''}`;
    this.shadow.querySelector<HTMLButtonElement>('.trigger')?.addEventListener('click', event => {
      event.stopPropagation();
      this.open = !this.open;
      this.render();
    });
    this.shadow.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', () => {
      this.open = false;
      this.render();
    });
  }
}

if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, GalleryUserShell);
}

export function mountUserShell(root: HTMLElement, language: UserShellLanguage): void {
  const heroTop = root.querySelector<HTMLElement>('.hero-top');
  const languageSwitch = root.querySelector<HTMLElement>('.lang-switch');
  if (!heroTop || !languageSwitch) return;

  const cluster = document.createElement('div');
  cluster.dataset.userUiCluster = 'true';
  cluster.style.display = 'inline-flex';
  cluster.style.alignItems = 'center';
  cluster.style.justifyContent = 'flex-end';
  cluster.style.gap = '8px';
  cluster.style.marginLeft = 'auto';
  cluster.style.flexWrap = 'wrap';

  heroTop.insertBefore(cluster, languageSwitch);
  cluster.appendChild(languageSwitch);

  const shell = document.createElement(ELEMENT_NAME);
  shell.setAttribute('data-language', language);
  cluster.appendChild(shell);
}
