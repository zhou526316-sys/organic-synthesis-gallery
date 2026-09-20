import { escapeHtml, rgbCss, statusLabel, store, styleVars, type Language, type PaperUserState, type StyleDef } from './shared';

const NAME = 'gallery-paper-actions';

function icon(style: StyleDef, fallback: string): string {
  return style.imageData ? `<img class='icon' src='${escapeHtml(style.imageData)}' alt=''>` : `<span aria-hidden='true'>${fallback}</span>`;
}
function button(style: StyleDef, label: string, action: string, fallback: string, active = false): string {
  return `<button type='button' class='action shape-${style.shape}${active ? ' active' : ''}' style='${styleVars(style)}' data-action='${action}' title='${escapeHtml(label)}'>${icon(style, fallback)}<span>${escapeHtml(label)}</span></button>`;
}
function formatTime(value?: number): string { return value ? new Date(value).toLocaleString() : ''; }
function notePreview(value: string): string {
  let safe = escapeHtml(value);
  safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  safe = safe.replace(/\b(10\.\d{4,9}\/[^\s<]+)/gi, '<a href="https://doi.org/$1" target="_blank" rel="noopener noreferrer">$1</a>');
  safe = safe.replace(/^- \[([ xX])\] (.+)$/gm, (_all, checked: string, label: string) => `<label class='check-preview'><input type='checkbox' disabled ${checked.trim() ? 'checked' : ''}>${label}</label>`);
  return safe.replace(/\n/g, '<br>');
}

export class GalleryPaperActions extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: 'open' });
  private panel: 'none' | 'status' | 'note' | 'more' = 'none';
  private feedbackMessage = '';
  private readonly outside = (event: PointerEvent): void => {
    if (this.panel === 'none') return;
    if (event.composedPath().includes(this)) return;
    this.closePanel();
  };
  private readonly reposition = (): void => { if (this.panel !== 'none') this.positionPanel(); };
  private readonly storeChanged = (event: Event): void => {
    const detail = event instanceof CustomEvent ? event.detail as { scope?: string; paperId?: string } : undefined;
    if (detail?.scope === 'paper' && detail.paperId && detail.paperId !== this.paperId) return;
    this.render();
  };
  private readonly countsChanged = (event: Event): void => {
    const detail = event instanceof CustomEvent ? event.detail as { doi?: string; dois?: string[] } : undefined;
    const doi = store.metadata(this.paperId)?.doi?.toLowerCase();
    if (doi && detail?.doi && doi !== detail.doi.toLowerCase()) return;
    if (doi && Array.isArray(detail?.dois) && !detail.dois.some(value => String(value).toLowerCase() === doi)) return;
    this.render();
  };

  static get observedAttributes(): string[] { return ['data-paper-id', 'data-language']; }
  connectedCallback(): void {
    store.addEventListener('change', this.storeChanged);
    store.addEventListener('counts', this.countsChanged);
    document.addEventListener('pointerdown', this.outside);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
    this.render();
  }
  disconnectedCallback(): void {
    store.removeEventListener('change', this.storeChanged);
    store.removeEventListener('counts', this.countsChanged);
    document.removeEventListener('pointerdown', this.outside);
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    this.closePanel(false);
  }
  attributeChangedCallback(): void { if (this.isConnected) this.render(); }
  private get paperId(): string { return this.dataset.paperId || ''; }
  private get language(): Language { return this.dataset.language === 'en' ? 'en' : 'zh'; }
  private tr(zh: string, en: string): string { return this.language === 'zh' ? zh : en; }

  private syncScrollLock(): void {
    document.documentElement.classList.remove('gallery-user-drawer-open');
    for (const element of [document.documentElement, document.body]) {
      element.classList.remove('gallery-user-drawer-open', 'scroll-lock', 'scroll-locked', 'no-scroll');
      if (element.style.overflow === 'hidden') element.style.removeProperty('overflow');
      if (element.style.overflowY === 'hidden') element.style.removeProperty('overflow-y');
      if (element.style.overscrollBehavior === 'none') element.style.removeProperty('overscroll-behavior');
      if (element.style.touchAction === 'none') element.style.removeProperty('touch-action');
    }
  }

  private positionPanel(): void {
    if (this.panel === 'none') return;
    const anchor = this.shadow.querySelector<HTMLElement>(`button[data-action="${this.panel}"]`);
    const drawer = this.shadow.querySelector<HTMLElement>('.drawer');
    if (!anchor || !drawer) return;

    drawer.style.left = '0px';
    drawer.style.top = '0px';
    drawer.style.removeProperty('max-height');
    const anchorRect = anchor.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const initialRect = drawer.getBoundingClientRect();
    const margin = 8;
    const gap = 6;

    let left = anchorRect.left;
    left = Math.min(left, window.innerWidth - initialRect.width - margin);
    left = Math.max(margin, left);

    const below = Math.max(0, window.innerHeight - anchorRect.bottom - gap - margin);
    const above = Math.max(0, anchorRect.top - gap - margin);
    const openBelow = below >= Math.min(initialRect.height, 220) || below >= above;
    const available = openBelow ? below : above;
    const cap = window.innerWidth <= 680 ? 520 : 560;
    drawer.style.maxHeight = `${Math.max(96, Math.min(cap, available))}px`;

    const fittedRect = drawer.getBoundingClientRect();
    const top = openBelow
      ? anchorRect.bottom + gap
      : anchorRect.top - fittedRect.height - gap;

    drawer.style.left = `${Math.round(left - hostRect.left)}px`;
    drawer.style.top = `${Math.round(top - hostRect.top)}px`;
    drawer.dataset.anchor = this.panel;
  }

  private openPanel(panel: 'status' | 'note' | 'more'): void {
    this.panel = panel;
    this.dataset.drawerOpen = 'true';
    this.render();
    this.syncScrollLock();
  }

  private closePanel(render = true): void {
    this.panel = 'none';
    delete this.dataset.drawerOpen;
    if (render && this.isConnected) this.render();
    this.closest<HTMLElement>('.card')?.classList.remove('user-action-open');
    this.syncScrollLock();
    queueMicrotask(() => this.syncScrollLock());
  }

  private render(): void {
    const paper = store.paper(this.paperId); const meta = store.metadata(this.paperId); const status = store.status(paper.statusId || '');
    const count = meta?.doi ? store.readerCounts[meta.doi] || 0 : 0;
    const s = store.state.actionStyles;
    this.shadow.innerHTML = `<style>
      :host{display:block;position:relative;margin-top:4px;font:12px/1.4 Inter,system-ui,sans-serif;color:#344054}
      *{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer}.bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 10px}.action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;padding:5px 8px;border:0;background:var(--u-color);color:var(--u-text);font-size:11px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.action.active{box-shadow:0 0 0 2px rgba(49,89,189,.18)}.action .icon{width:15px;height:15px;object-fit:contain}.shape-pill{border-radius:999px}.shape-rounded{border-radius:9px}.shape-rectangle{border-radius:2px}.shape-circle{width:32px;height:32px;padding:0;border-radius:50%}.shape-circle span:last-child,.shape-square span:last-child,.shape-diamond span:last-child,.shape-star span:last-child,.shape-bookmark span:last-child{display:none}.shape-square{width:32px;height:32px;padding:0;border-radius:5px}.shape-diamond{width:29px;height:29px;padding:0;border-radius:5px;transform:rotate(45deg)}.shape-diamond>*{transform:rotate(-45deg)}.shape-bookmark{border-radius:6px 6px 2px 2px;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)}.shape-star{clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 94%,50% 72%,21% 94%,32% 57%,2% 35%,39% 35%);width:34px;height:34px;padding:0}.metric{margin-left:auto;color:#7a8494;font-size:10px;white-space:nowrap}.chips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px}.chip{padding:3px 6px;border-radius:999px;background:#f2f5fb;color:#526071;font-size:9px}.chip.status,.status-choice-label{display:inline-flex;align-items:center;gap:5px;color:#fff}.status-image{width:16px;height:16px;object-fit:contain;border-radius:4px;background:rgba(255,255,255,.16)}.status-choice{display:flex;align-items:center;gap:7px}.status-choice-label{padding:4px 7px;min-width:0}.status-choice small{color:#7a8494;font-size:9px}.status{background:${status ? rgbCss(status.style.rgb) : '#f2f5fb'};color:${status ? '#fff' : '#526071'}}
      .overlay{position:absolute;left:0;top:0;width:100%;height:0;z-index:10020;background:transparent;pointer-events:none}.drawer{position:absolute;pointer-events:auto;width:min(350px,calc(100vw - 24px));height:auto;max-height:min(68dvh,560px);overflow:auto;padding:15px;background:#fff;border:1px solid #dfe5ef;border-radius:16px;box-shadow:0 14px 38px rgba(15,23,42,.18)}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-18px;background:#fff;padding:18px 0 10px;z-index:2}.head h3{margin:0;font-size:17px}.close{border:0;background:#f2f4f7;border-radius:9px;width:30px;height:30px}.section{padding:12px 0;border-top:1px solid #edf0f4}.section h4{margin:0 0 8px}.stack{display:grid;gap:6px}.choice,.secondary{width:100%;text-align:left;padding:8px 10px;border:1px solid #e1e6ee;border-radius:10px;background:#fff;color:#344054}.choice.selected{border-color:#8aa5ef;background:#f5f7ff}.check{display:flex;align-items:center;gap:8px;padding:5px 0}.input,textarea{width:100%;border:1px solid #d7deea;border-radius:10px;padding:9px;outline:none}textarea{min-height:150px;resize:vertical}.help{margin-top:6px;color:#8a93a3;font-size:10px}.preview{margin-top:8px;padding:9px;border-radius:10px;background:#f8fafc;overflow-wrap:anywhere}.preview a{color:#3159bd}.check-preview{display:flex;gap:6px}.tag-row{display:flex;gap:6px}.tag-row .input{flex:1}.tag-row .secondary{width:auto}.danger{color:#b42318}.feedback{margin-top:7px;color:#667085;font-size:10px}
      @media(max-width:680px){:host{margin-top:2px}.bar{gap:4px;margin:4px 0 7px}.action{min-height:26px;padding:4px 6px;font-size:9px}.action span:last-child{display:none}.metric{font-size:8px}.drawer{width:min(330px,calc(100vw - 16px));height:auto;max-height:min(64dvh,520px);padding:13px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border-radius:14px}.chips{display:flex}.chips>.chip:not(.status){display:none}.drawer .chips>.chip{display:inline-flex}}
    </style>${this.chips(paper, status)}<div class='bar'>
      ${button(s.favorite, paper.favorite ? this.tr('已收藏', 'Saved') : this.tr('收藏', 'Save'), 'favorite', paper.favorite ? '★' : '☆', paper.favorite)}
      ${button(s.status, status ? statusLabel(status, this.language) : this.tr('阅读状态', 'Status'), 'status', '◈', Boolean(status))}
      ${button(s.note, this.tr('私人备注', 'Private note'), 'note', '✎', Boolean(paper.note))}
      ${button(s.more, this.tr('更多', 'More'), 'more', '•••')}
      <span class='metric'>◉ ${count} ${this.tr('人读过', 'readers')}</span>
    </div>${this.panel === 'none' ? '' : this.drawer(paper)}`;
    this.bind();
    const drawerOpen = this.panel !== 'none' && Boolean(this.shadow.querySelector('.overlay'));
    if (drawerOpen) {
      this.dataset.drawerOpen = 'true';
      this.closest<HTMLElement>('.card')?.classList.add('user-action-open');
    } else {
      delete this.dataset.drawerOpen;
      this.closest<HTMLElement>('.card')?.classList.remove('user-action-open');
    }
    this.syncScrollLock();
    if (drawerOpen) queueMicrotask(() => this.positionPanel());
  }

  private statusVisual(status: NonNullable<ReturnType<typeof store.status>>, className: string): string {
    const image = status.style.imageData
      ? `<img class='status-image' src='${escapeHtml(status.style.imageData)}' alt=''>`
      : '';
    return `<span class='${className} shape-${status.style.shape}' style='background:${rgbCss(status.style.rgb)}'>${image}<span>${escapeHtml(statusLabel(status, this.language))}</span></span>`;
  }

  private chips(paper: PaperUserState, status: ReturnType<typeof store.status>): string {
    const quick = store.state.quickTerms.filter(item => paper.quickTerms.includes(item.id));
    const values = [status ? this.statusVisual(status, 'chip status') : '', ...quick.map(item => `<span class='chip'>${escapeHtml(item.label)}</span>`), ...paper.tags.map(tag => `<span class='chip'>${escapeHtml(tag)}</span>`)];
    return values.some(Boolean) ? `<div class='chips'>${values.join('')}</div>` : '';
  }

  private drawer(paper: PaperUserState): string {
    const meta = store.metadata(this.paperId); const title = this.panel === 'status' ? this.tr('阅读状态', 'Reading status') : this.panel === 'note' ? this.tr('私人备注', 'Private note') : this.tr('文献管理', 'Paper tools');
    let body = '';
    if (this.panel === 'status') {
      body = `<section class='section'><div class='stack'>${store.state.statuses.map(status => `<button type='button' class='choice status-choice${paper.statusId === status.id ? ' selected' : ''}' data-action='set-status:${escapeHtml(status.id)}'>${this.statusVisual(status, 'status-choice-label')}${status.countsAsRead ? `<small>· ${this.tr('计入阅读人数', 'counts as read')}</small>` : ''}</button>`).join('')}</div></section>`;
    } else if (this.panel === 'note') {
      body = `<section class='section'><textarea data-note placeholder='${this.tr('支持 Markdown 文本、DOI/URL、- [ ] checklist', 'Markdown text, DOI/URL and - [ ] checklist are supported')}'>${escapeHtml(paper.note)}</textarea><div class='help'>${paper.noteUpdatedAt ? `${this.tr('修改于', 'Modified')} ${formatTime(paper.noteUpdatedAt)}` : this.tr('自动保存到当前浏览器', 'Autosaved in this browser')}</div>${paper.note ? `<div class='preview'>${notePreview(paper.note)}</div>` : ''}</section>`;
    } else {
      body = `<section class='section'><h4>${this.tr('收藏夹', 'Folders')}</h4><div class='stack'>${store.state.collections.map(item => `<label class='check'><input type='checkbox' data-collection='${escapeHtml(item.id)}' ${paper.collections.includes(item.id) ? 'checked' : ''}>${escapeHtml(item.name)}</label>`).join('')}</div></section>
      <section class='section'><h4>${this.tr('快速选择', 'Quick choices')}</h4><div class='stack'>${store.state.quickTerms.map(item => `<label class='check'><input type='checkbox' data-quick='${escapeHtml(item.id)}' ${paper.quickTerms.includes(item.id) ? 'checked' : ''}>${escapeHtml(item.label)}</label>`).join('')}</div></section>
      <section class='section'><h4>${this.tr('自定义标签', 'Custom tags')}</h4><div class='tag-row'><input class='input' data-tag placeholder='${this.tr('例如：需要复现', 'e.g. reproduce')}'><button class='secondary' type='button' data-action='add-tag'>${this.tr('添加', 'Add')}</button></div><div class='chips' style='margin-top:8px'>${paper.tags.map(tag => `<span class='chip'>${escapeHtml(tag)} <button class='danger' style='border:0;background:transparent' data-action='remove-tag:${escapeHtml(tag)}'>×</button></span>`).join('')}</div></section>
      <section class='section'><div class='stack'><button class='secondary' type='button' data-action='similar'>${this.tr('查找相似文献', 'Find similar papers')}</button><button class='secondary' type='button' data-action='feedback'>${this.tr('报告文献问题', 'Report a paper issue')}</button>${meta?.href ? `<a class='secondary' data-close-panel='true' style='text-decoration:none' href='${escapeHtml(meta.href)}' target='_blank' rel='noopener noreferrer'>${this.tr('打开原文 ↗', 'Open original ↗')}</a>` : ''}</div>${this.feedbackMessage ? `<div class='feedback'>${escapeHtml(this.feedbackMessage)}</div>` : ''}</section>`;
    }
    return `<div class='overlay'><aside class='drawer'><div class='head'><div><h3>${title}</h3><div class='help'>${escapeHtml(meta?.title || '')}</div></div><button class='close' type='button' data-action='close'>×</button></div>${body}</aside></div>`;
  }

  private bind(): void {
    this.shadow.querySelectorAll<HTMLElement>('[data-action]').forEach(element => element.addEventListener('click', () => { void this.action(element.dataset.action || ''); }));
    this.shadow.querySelectorAll<HTMLElement>('[data-close-panel]').forEach(element => element.addEventListener('click', () => this.closePanel()));
    this.shadow.querySelector<HTMLTextAreaElement>('[data-note]')?.addEventListener('input', event => store.setNote(this.paperId, (event.target as HTMLTextAreaElement).value, false));
    this.shadow.querySelector<HTMLTextAreaElement>('[data-note]')?.addEventListener('blur', event => {
      store.setNote(this.paperId, (event.target as HTMLTextAreaElement).value, false);
    });
    this.shadow.querySelectorAll<HTMLInputElement>('[data-collection]').forEach(input => input.addEventListener('change', () => store.updatePaper(this.paperId, paper => {
      const id = input.dataset.collection || ''; paper.collections = input.checked ? [...new Set([...paper.collections, id])] : paper.collections.filter(value => value !== id); paper.favorite = paper.collections.length > 0 || paper.favorite;
    })));
    this.shadow.querySelectorAll<HTMLInputElement>('[data-quick]').forEach(input => input.addEventListener('change', () => store.updatePaper(this.paperId, paper => {
      const id = input.dataset.quick || ''; paper.quickTerms = input.checked ? [...new Set([...paper.quickTerms, id])] : paper.quickTerms.filter(value => value !== id);
    })));
  }

  private async action(action: string): Promise<void> {
    if (action === 'favorite') { store.toggleFavorite(this.paperId); return; }
    if (action === 'status' || action === 'note' || action === 'more') { this.openPanel(action); return; }
    if (action === 'close') { this.closePanel(); return; }
    if (action.startsWith('set-status:')) {
      const statusId = action.slice(11);
      this.closePanel();
      store.setStatus(this.paperId, statusId);
      return;
    }
    if (action === 'add-tag') { const input = this.shadow.querySelector<HTMLInputElement>('[data-tag]'); const tag = input?.value.trim(); if (tag) store.updatePaper(this.paperId, paper => { if (!paper.tags.includes(tag)) paper.tags.push(tag); }); return; }
    if (action.startsWith('remove-tag:')) { const tag = action.slice(11); store.updatePaper(this.paperId, paper => { paper.tags = paper.tags.filter(value => value !== tag); }); return; }
    if (action === 'similar') {
      const paperId = this.paperId;
      this.closePanel();
      this.dispatchEvent(new CustomEvent('gallery-similar', { bubbles: true, composed: true, detail: { paperId } }));
      return;
    }
    if (action === 'feedback') {
      const meta = store.metadata(this.paperId); if (!meta?.doi) { this.feedbackMessage = this.tr('该文献 DOI 尚未核验，暂不能提交。', 'DOI is not verified yet.'); this.render(); return; }
      const kinds = this.tr('TOC错误/图片错误/标题错误/日期错误/重复文献/分类错误/其他', 'toc/image/title/date/duplicate/classification/other');
      const raw = window.prompt(`${this.tr('问题类型', 'Issue type')}：${kinds}`, this.language === 'zh' ? 'TOC错误' : 'toc'); if (!raw) return;
      const map: Record<string, string> = { 'TOC错误': 'toc', '图片错误': 'image', '标题错误': 'title', '日期错误': 'date', '重复文献': 'duplicate', '分类错误': 'classification', '其他': 'other' };
      const kind = map[raw] || raw.toLowerCase(); const note = window.prompt(this.tr('补充说明（可留空）', 'Additional note (optional)'), '') || '';
      const ok = await store.feedback(meta.doi, kind, note); this.feedbackMessage = ok ? this.tr('已提交到待审核队列。', 'Submitted for review.') : this.tr('提交失败，请稍后重试。', 'Submission failed. Try again later.'); this.render();
    }
  }
}

if (!customElements.get(NAME)) customElements.define(NAME, GalleryPaperActions);
export const PAPER_ACTION_ELEMENT = NAME;
