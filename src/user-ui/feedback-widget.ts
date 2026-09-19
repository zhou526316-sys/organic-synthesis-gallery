import { store } from './shared';

type FeedbackLanguage = 'zh' | 'en';

const ELEMENT = 'site-feedback-widget';
const STYLE_ID = 'site-feedback-widget-styles';
const POSITION_KEY = 'site-feedback-widget-position-v1';

const copy = {
  zh: {
    tab: '吐槽',
    title: '吐槽 / 建议',
    intro: '告诉我们哪里难用、哪里有 bug，或你希望增加什么。反馈只会进入待审核队列，不会自动修改网站。',
    category: '类型',
    categories: {
      general: '功能 / 体验',
      search: '搜索',
      ui: '界面 / 交互',
      account: '用户系统',
      literature: '文献内容',
      other: '其他',
    },
    placeholder: '例如：搜索 “photoredox nickel” 时结果不符合预期……',
    privacy: '请不要填写密码、验证码或其他敏感信息。',
    submit: '提交吐槽',
    sending: '提交中…',
    close: '关闭',
    accepted: '已收到。之后会由 GPT 汇总、去重并筛选值得处理的意见。',
    rateLimited: '这一小时提交得有点多，请稍后再试。',
    failed: '提交失败，请稍后重试。',
    tooShort: '请至少写 3 个字。',
    drag: '拖动这里移动窗口',
  },
  en: {
    tab: 'Feedback',
    title: 'Feedback',
    intro: 'Report awkward behavior, bugs, or missing features. Feedback enters a review queue and never changes the site automatically.',
    category: 'Category',
    categories: {
      general: 'Feature / experience',
      search: 'Search',
      ui: 'UI / interaction',
      account: 'Account system',
      literature: 'Literature content',
      other: 'Other',
    },
    placeholder: 'Example: searching “photoredox nickel” gives unexpected results…',
    privacy: 'Do not include passwords, verification codes, or other sensitive information.',
    submit: 'Send feedback',
    sending: 'Sending…',
    close: 'Close',
    accepted: 'Received. GPT will later consolidate, deduplicate, and triage useful feedback.',
    rateLimited: 'Too many submissions this hour. Please try again later.',
    failed: 'Submission failed. Please try again later.',
    tooShort: 'Please enter at least 3 characters.',
    drag: 'Drag here to move the window',
  },
} as const;

function language(): FeedbackLanguage {
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function loadPosition(): { left: number; top: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null') as { left?: unknown; top?: unknown } | null;
    if (!raw || typeof raw.left !== 'number' || typeof raw.top !== 'number') return null;
    return { left: raw.left, top: raw.top };
  } catch {
    return null;
  }
}

function savePosition(position: { left: number; top: number }): void {
  try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* optional */ }
}

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    ${ELEMENT}{position:fixed;left:0;top:44%;z-index:10040;font:inherit}
    .site-feedback-tab{border:1px solid #cfd7e6;border-left:0;border-radius:0 12px 12px 0;background:#fff;color:#344054;padding:12px 9px;box-shadow:0 8px 28px rgba(15,23,42,.14);cursor:pointer;font-weight:700;letter-spacing:.04em}
    .site-feedback-tab:hover{background:#f6f8fc}
    .site-feedback-panel{position:fixed;left:12px;top:50%;transform:translateY(-50%);width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid #d7deea;border-radius:16px;background:#fff;color:#273142;box-shadow:0 24px 70px rgba(15,23,42,.22);padding:16px}
    .site-feedback-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;cursor:grab;touch-action:none;user-select:none}.site-feedback-panel.dragging .site-feedback-head{cursor:grabbing}.site-feedback-head-title{display:flex;align-items:center;gap:8px}.site-feedback-drag-grip{color:#98a2b3;font-size:13px;letter-spacing:-.12em}
    .site-feedback-head strong{font-size:15px}
    .site-feedback-close{border:0;background:transparent;color:#667085;font-size:20px;line-height:1;cursor:pointer;padding:4px}
    .site-feedback-intro,.site-feedback-privacy,.site-feedback-status{margin:0 0 10px;color:#667085;font-size:12px;line-height:1.55}
    .site-feedback-label{display:block;margin:10px 0 6px;font-size:12px;font-weight:700;color:#475467}
    .site-feedback-select,.site-feedback-textarea{box-sizing:border-box;width:100%;border:1px solid #cfd7e6;border-radius:10px;background:#fff;color:#1d2939;font:inherit}
    .site-feedback-select{height:38px;padding:0 10px}
    .site-feedback-textarea{min-height:122px;resize:vertical;padding:10px 11px;line-height:1.5}
    .site-feedback-select:focus,.site-feedback-textarea:focus{outline:2px solid rgba(49,89,189,.18);border-color:#6f89d5}
    .site-feedback-submit{width:100%;border:0;border-radius:10px;background:#3159bd;color:#fff;padding:10px 12px;font-weight:700;cursor:pointer}
    .site-feedback-submit:disabled{opacity:.6;cursor:default}
    .site-feedback-status{margin-top:10px;margin-bottom:0}
    @media(max-width:680px){
      ${ELEMENT}{top:auto;bottom:88px}
      .site-feedback-tab{padding:10px 8px;font-size:12px}
      .site-feedback-panel{left:12px!important;right:12px;top:auto!important;bottom:12px;transform:none!important;width:auto;max-height:min(72vh,620px)}
      .site-feedback-head{cursor:default}.site-feedback-drag-grip{display:none}
    }
  `;
  document.head.appendChild(style);
}

class SiteFeedbackWidget extends HTMLElement {
  private open = false;
  private busy = false;
  private status = '';
  private observer: MutationObserver | null = null;
  private position: { left: number; top: number } | null = loadPosition();
  private drag: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  private readonly onResize = (): void => this.applyPanelPosition();

  connectedCallback(): void {
    installStyles();
    this.render();
    this.observer = new MutationObserver(() => this.rerenderPreservingDraft());
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    window.addEventListener('resize', this.onResize);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('resize', this.onResize);
  }

  private rerenderPreservingDraft(): void {
    const draft = this.querySelector<HTMLTextAreaElement>('[data-feedback-message]')?.value || '';
    const category = this.querySelector<HTMLSelectElement>('[data-feedback-category]')?.value || 'general';
    this.render();
    const nextDraft = this.querySelector<HTMLTextAreaElement>('[data-feedback-message]');
    const nextCategory = this.querySelector<HTMLSelectElement>('[data-feedback-category]');
    if (nextDraft) nextDraft.value = draft;
    if (nextCategory) nextCategory.value = category;
  }

  private render(): void {
    const lang = language();
    const t = copy[lang];
    this.innerHTML = `
      <button class="site-feedback-tab" type="button" aria-expanded="${this.open}" aria-controls="site-feedback-panel">${t.tab}</button>
      ${this.open ? `
        <section class="site-feedback-panel" id="site-feedback-panel" role="dialog" aria-label="${t.title}">
          <div class="site-feedback-head" title="${t.drag}"><span class="site-feedback-head-title"><strong>${t.title}</strong><span class="site-feedback-drag-grip" aria-hidden="true">⋮⋮</span></span><button class="site-feedback-close" type="button" aria-label="${t.close}">×</button></div>
          <p class="site-feedback-intro">${t.intro}</p>
          <label class="site-feedback-label" for="site-feedback-category">${t.category}</label>
          <select class="site-feedback-select" id="site-feedback-category" data-feedback-category>
            ${Object.entries(t.categories).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
          <textarea class="site-feedback-textarea" data-feedback-message maxlength="2000" placeholder="${t.placeholder}"></textarea>
          <p class="site-feedback-privacy">${t.privacy}</p>
          <button class="site-feedback-submit" data-feedback-submit type="button" ${this.busy ? 'disabled' : ''}>${this.busy ? t.sending : t.submit}</button>
          ${this.status ? `<p class="site-feedback-status" role="status">${this.status}</p>` : ''}
        </section>
      ` : ''}
    `;

    this.applyPanelPosition();
    const head = this.querySelector<HTMLElement>('.site-feedback-head');
    head?.addEventListener('pointerdown', event => this.startDrag(event));
    head?.addEventListener('pointermove', event => this.moveDrag(event));
    head?.addEventListener('pointerup', event => this.endDrag(event));
    head?.addEventListener('pointercancel', event => this.endDrag(event));

    this.querySelector<HTMLButtonElement>('.site-feedback-tab')?.addEventListener('click', () => {
      this.open = !this.open;
      this.status = '';
      this.render();
      if (this.open) this.querySelector<HTMLTextAreaElement>('[data-feedback-message]')?.focus();
    });
    this.querySelector<HTMLButtonElement>('.site-feedback-close')?.addEventListener('click', () => {
      this.open = false;
      this.render();
    });
    this.querySelector<HTMLButtonElement>('[data-feedback-submit]')?.addEventListener('click', () => void this.submit());
    this.querySelector<HTMLTextAreaElement>('[data-feedback-message]')?.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void this.submit();
      }
      if (event.key === 'Escape') {
        this.open = false;
        this.render();
      }
    });
  }

  private applyPanelPosition(): void {
    if (!this.position || window.innerWidth <= 680) return;
    const panel = this.querySelector<HTMLElement>('.site-feedback-panel');
    if (!panel) return;
    const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    this.position = {
      left: Math.min(maxLeft, Math.max(8, this.position.left)),
      top: Math.min(maxTop, Math.max(8, this.position.top)),
    };
    panel.style.left = `${this.position.left}px`;
    panel.style.top = `${this.position.top}px`;
    panel.style.transform = 'none';
  }

  private startDrag(event: PointerEvent): void {
    if (window.innerWidth <= 680 || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('.site-feedback-close')) return;
    const panel = this.querySelector<HTMLElement>('.site-feedback-panel');
    const head = this.querySelector<HTMLElement>('.site-feedback-head');
    if (!panel || !head) return;
    const rect = panel.getBoundingClientRect();
    this.position = { left: rect.left, top: rect.top };
    this.drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    panel.classList.add('dragging');
    panel.style.transform = 'none';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    head.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  private moveDrag(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const panel = this.querySelector<HTMLElement>('.site-feedback-panel');
    if (!panel) return;
    const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    const left = Math.min(maxLeft, Math.max(8, event.clientX - this.drag.offsetX));
    const top = Math.min(maxTop, Math.max(8, event.clientY - this.drag.offsetY));
    this.position = { left, top };
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  private endDrag(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const head = this.querySelector<HTMLElement>('.site-feedback-head');
    if (head?.hasPointerCapture(event.pointerId)) head.releasePointerCapture(event.pointerId);
    this.querySelector<HTMLElement>('.site-feedback-panel')?.classList.remove('dragging');
    this.drag = null;
    if (this.position) savePosition(this.position);
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const lang = language();
    const t = copy[lang];
    const textarea = this.querySelector<HTMLTextAreaElement>('[data-feedback-message]');
    const select = this.querySelector<HTMLSelectElement>('[data-feedback-category]');
    const message = textarea?.value.trim() || '';
    if (message.length < 3) {
      this.status = t.tooShort;
      this.rerenderPreservingDraft();
      return;
    }

    this.busy = true;
    this.status = '';
    this.rerenderPreservingDraft();
    const searchQuery = document.querySelector<HTMLInputElement>('#search')?.value || '';
    const result = await store.siteFeedback(select?.value || 'general', message, {
      pagePath: `${location.pathname}${location.hash}`,
      language: lang,
      searchQuery,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    this.busy = false;

    if (result === 'accepted') {
      this.status = t.accepted;
      this.render();
      const nextCategory = this.querySelector<HTMLSelectElement>('[data-feedback-category]');
      if (nextCategory) nextCategory.value = select?.value || 'general';
      return;
    }
    this.status = result === 'rate_limited' ? t.rateLimited : t.failed;
    this.rerenderPreservingDraft();
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, SiteFeedbackWidget);
if (!document.querySelector(ELEMENT)) document.body.appendChild(document.createElement(ELEMENT));
