import { escapeHtml, rgbCss, SHAPES, statusLabel, store, styleVars, type ArticleSummaryResult, type Language, type PaperUserState, type Shape, type StyleDef } from './shared';

import { hydrateStatusImages, statusImageError, statusImageTag, viewStatusImage } from './status-image-assets';

import { positionSummaryPanel, SUMMARY_PANEL_STYLES } from './summary-panel-layout';

import { bindStatusPresentation, STATUS_PRESENTATION_CSS } from './status-presentation';

const NAME = 'gallery-paper-actions';

function icon(style: StyleDef, fallback: string): string {
  return style.imageData ? `<img class='icon' src='${escapeHtml(style.imageData)}' alt=''>` : `<span aria-hidden='true'>${fallback}</span>`;
}
function button(style: StyleDef, label: string, action: string, fallback: string, active = false, original?: StyleDef): string {
  return `<button type='button' aria-label='${escapeHtml(label)}' class='action shape-${style.shape}${active ? ' active' : ''}${original ? ' status-artwork' : ''}' style='${styleVars(style)}' data-action='${action}' title='${escapeHtml(label)}'>${original ? statusImageTag(original, 'status-original-action', label) + `<span class='status-action-label'>${escapeHtml(label)}</span>` : `${icon(style, fallback)}<span>${escapeHtml(label)}</span>`}</button>`;
}
function formatTime(value?: number): string { return value ? new Date(value).toLocaleString() : ''; }
function rgbToHex(rgb: [number, number, number]): string { return `#${rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`; }
function hexToRgb(value: string): [number, number, number] {
  const clean = value.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}
function notePreview(value: string): string {
  let safe = escapeHtml(value);
  safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  safe = safe.replace(/\b(10\.\d{4,9}\/[^\s<]+)/gi, '<a href="https://doi.org/$1" target="_blank" rel="noopener noreferrer">$1</a>');
  safe = safe.replace(/^- \[([ xX])\] (.+)$/gm, (_all, checked: string, label: string) => `<label class='check-preview'><input type='checkbox' disabled ${checked.trim() ? 'checked' : ''}>${label}</label>`);
  return safe.replace(/\n/g, '<br>');
}

type CitationStyle = 'acs' | 'nature' | 'apa' | 'bibtex' | 'ris';
interface CitationMeta {
  title: string;
  journal: string;
  doi?: string;
  authors: string[];
  date?: string;
}
function citationYear(date?: string): string {
  return /^\d{4}/.test(date || '') ? String(date).slice(0, 4) : 'n.d.';
}
function authorText(authors: string[], separator = '; '): string {
  return authors.length ? authors.join(separator) : 'Unknown author';
}
function bibKey(meta: CitationMeta): string {
  const first = meta.authors[0]?.trim().split(/\s+/).slice(-1)[0]?.replace(/[^A-Za-z0-9]/g, '') || 'paper';
  return `${first}${citationYear(meta.date).replace(/\D/g, '') || 'nd'}`;
}
function citationText(meta: CitationMeta, style: CitationStyle): string {
  const year = citationYear(meta.date);
  const doiUrl = meta.doi ? `https://doi.org/${meta.doi}` : '';
  if (style === 'nature') {
    return `${authorText(meta.authors, ', ')}. ${meta.title}. ${meta.journal} (${year}).${doiUrl ? ` ${doiUrl}` : ''}`;
  }
  if (style === 'apa') {
    return `${authorText(meta.authors, ', ')} (${year}). ${meta.title}. ${meta.journal}.${doiUrl ? ` ${doiUrl}` : ''}`;
  }
  if (style === 'bibtex') {
    return `@article{${bibKey(meta)},\n  author = {${meta.authors.join(' and ')}},\n  title = {${meta.title}},\n  journal = {${meta.journal}},\n  year = {${year}},${meta.doi ? `\n  doi = {${meta.doi}},\n  url = {${doiUrl}},` : ''}\n}`;
  }
  if (style === 'ris') {
    return [
      'TY  - JOUR',
      `TI  - ${meta.title}`,
      ...meta.authors.map(author => `AU  - ${author}`),
      `JO  - ${meta.journal}`,
      `PY  - ${year}`,
      ...(meta.doi ? [`DO  - ${meta.doi}`, `UR  - ${doiUrl}`] : []),
      'ER  -',
    ].join('\n');
  }
  return `${authorText(meta.authors)}. ${meta.title}. ${meta.journal} ${year}.${doiUrl ? ` ${doiUrl}` : ''}`;
}

export class GalleryPaperActions extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: 'open' });
  private panel: 'none' | 'favorite' | 'status' | 'note' | 'more' | 'summary' = 'none';
  private feedbackMessage = '';
  private imageMessage = '';
  private imageBusy = false;
  private citationStyle: CitationStyle = 'acs';
  private citationMessage = '';
  private summaryLanguage: Language = 'zh';
  private summaryData: ArticleSummaryResult | null = null;
  private summaryLoading = false;
  private summaryError = '';
  private readonly outside = (event: PointerEvent): void => {
    if (this.panel === 'none') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-gallery-user-cropper]')) return;
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
    window.visualViewport?.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('scroll', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
    this.render();
  }
  disconnectedCallback(): void {
    store.removeEventListener('change', this.storeChanged);
    store.removeEventListener('counts', this.countsChanged);
    document.removeEventListener('pointerdown', this.outside);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
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
    if (this.panel === 'summary') {
      positionSummaryPanel(drawer, anchor, this);
      return;
    }

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

  private openPanel(panel: 'favorite' | 'status' | 'note' | 'more' | 'summary'): void {
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

  private tocImageUrl(): string {
    const card = this.closest<HTMLElement>('.card');
    const image = card?.querySelector<HTMLImageElement>('.toc-image, .toc-link img, .toc-slot img');
    return image?.currentSrc || image?.src || '';
  }

  private async openSummary(): Promise<void> {
    const doi = store.metadata(this.paperId)?.doi;
    this.panel = 'summary';
    this.dataset.drawerOpen = 'true';
    this.summaryError = '';
    this.summaryLoading = Boolean(doi);
    this.render();
    this.syncScrollLock();
    if (!doi) {
      this.summaryData = null;
      this.summaryLoading = false;
      this.summaryError = this.tr('该文献 DOI 尚未核验，暂不能读取 AI 摘要。', 'This paper has no verified DOI yet, so the AI summary cannot be read.');
      this.render();
      return;
    }
    try {
      this.summaryData = await store.articleSummary(doi);
    } catch {
      this.summaryData = null;
      this.summaryError = this.tr('摘要服务暂时不可用，请稍后重试。', 'Summary service is temporarily unavailable.');
    } finally {
      this.summaryLoading = false;
      this.render();
    }
  }

  private summaryMarkup(): string {
    const meta = store.metadata(this.paperId);
    const toc = this.tocImageUrl();
    const data = this.summaryData;
    let content = '';
    if (this.summaryLoading) {
      content = `<div class='summary-state'>${this.tr('正在读取证据覆盖与 GPT 审核状态…', 'Loading evidence coverage and GPT review status…')}</div>`;
    } else if (this.summaryError) {
      content = `<div class='summary-state error'>${escapeHtml(this.summaryError)}</div>`;
    } else if (!data?.available) {
      const coverage = data?.evidenceLevel === 'abstract_only'
        ? this.tr('Abstract', 'Abstract')
        : data?.evidenceLevel === 'partial'
          ? this.tr('部分正文', 'partial article text')
          : data?.evidenceLevel === 'complete'
            ? this.tr('完整正文', 'complete article text')
            : this.tr('文本证据', 'text evidence');
      let message = '';
      if (data?.reason === 'fulltext_missing') {
        message = this.tr('尚未同步到可用的文章文字证据。', 'No usable article text evidence has been synced yet.');
      } else if (data?.reason === 'evidence_v2_required') {
        message = this.tr('已有旧版全文缓存，等待升级为可审核的证据包。', 'A legacy full-text cache exists and is waiting to be upgraded to an auditable evidence packet.');
      } else if (data?.reason === 'summary_stale') {
        message = this.tr('文章文字证据已更新，旧摘要已自动失效，等待 GPT 重新审核。', 'The article evidence changed, so the previous summary was invalidated and is awaiting GPT re-review.');
      } else if (data?.reason === 'summary_invalid') {
        message = this.tr('摘要记录未通过完整性校验，等待重新审核。', 'The summary record failed integrity validation and is awaiting review.');
      } else if (data?.reason === 'summary_not_reviewed' || data?.reason === 'summary_pending') {
        message = this.tr(`已同步${coverage}，等待 GPT 审核；当前不会现场生成摘要。`, `${coverage} is synced and awaiting GPT review; no summary is generated on demand.`);
      } else {
        message = this.tr('已同步文章证据，等待 GPT 审核。', 'Article evidence is synced and awaiting GPT review.');
      }
      content = `<div class='summary-state'>${message}</div>`;
    } else {
      const text = this.summaryLanguage === 'zh' ? data.zh || '' : data.en || '';
      content = `<div class='summary-tabs'>
        <button type='button' class='${this.summaryLanguage === 'zh' ? 'selected' : ''}' data-action='summary-lang:zh'>中文</button>
        <button type='button' class='${this.summaryLanguage === 'en' ? 'selected' : ''}' data-action='summary-lang:en'>English</button>
      </div><div class='summary-text'>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
    }
    return `<section class='summary-layout'>
      ${toc ? `<div class='summary-toc'><img src='${escapeHtml(toc)}' alt='TOC / graphical abstract'></div>` : ''}
      <div class='summary-main'>
        ${content}
        ${data?.generatedAt ? `<div class='summary-meta'>${this.tr('GPT 审核通过', 'GPT reviewed')} · ${data.evidenceLevel === 'abstract_only' ? this.tr('基于 Abstract', 'Abstract-based') : data.evidenceLevel === 'partial' ? this.tr('基于部分正文', 'based on partial article text') : data.evidenceLevel === 'complete' ? this.tr('基于完整正文', 'based on complete article text') : this.tr('基于已同步证据', 'based on synced evidence')} · ${this.tr('生成于', 'Generated')} ${formatTime(data.generatedAt)}</div>` : ''}
        ${meta?.href ? `<a class='summary-open' data-summary-open href='${escapeHtml(meta.href)}' target='_blank' rel='noopener noreferrer'>${this.tr('打开原文 ↗', 'Open original ↗')}</a>` : ''}
      </div>
    </section>`;
  }

  private render(): void {
    const paper = store.paper(this.paperId); const meta = store.metadata(this.paperId); const status = store.status(paper.statusId || '');
    const count = meta?.doi ? store.readerCounts[meta.doi] : undefined;
    const countLabel = typeof count === 'number' ? String(count) : '—';
    const s = store.state.actionStyles;
    this.shadow.innerHTML = `<style>
      :host{display:block;position:relative;margin-top:4px;font:12px/1.4 Inter,system-ui,sans-serif;color:#344054}
      *{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer}.bar{display:grid;grid-template-columns:84px 110px 96px 64px max-content;align-items:center;gap:6px;margin:6px 0 10px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain}.bar::-webkit-scrollbar{display:none}.action{display:inline-flex;justify-self:stretch;align-self:center;width:100%;max-width:100%;height:32px;min-height:32px;white-space:nowrap;align-items:center;justify-content:center;gap:5px;padding:5px 8px;border:0;background:var(--u-color);color:var(--u-text);font-size:11px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}.action.active{box-shadow:0 0 0 2px rgba(49,89,189,.18)}.action .icon{width:15px;height:15px;object-fit:contain}.shape-pill{border-radius:999px}.shape-rounded{border-radius:9px}.shape-rectangle{border-radius:2px}.shape-circle{width:32px;min-width:32px;height:32px;padding:0;border-radius:50%;justify-self:center}.shape-circle span:last-child,.shape-square span:last-child,.shape-diamond span:last-child,.shape-star span:last-child,.shape-bookmark span:last-child{display:none}.shape-square{width:32px;min-width:32px;height:32px;padding:0;border-radius:5px;justify-self:center}.shape-diamond{width:29px;min-width:29px;height:29px;min-height:29px;padding:0;border-radius:5px;transform:rotate(45deg);justify-self:center}.shape-diamond>*{transform:rotate(-45deg)}.shape-bookmark{border-radius:6px 6px 2px 2px;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)}.shape-star{clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 94%,50% 72%,21% 94%,32% 57%,2% 35%,39% 35%);width:34px;min-width:34px;height:34px;min-height:34px;padding:0;justify-self:center}.metric{justify-self:end;margin-left:0;color:#7a8494;font-size:10px;white-space:nowrap}.chips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px}.chip{padding:3px 6px;border-radius:999px;background:#f2f5fb;color:#526071;font-size:9px}.chip.status,.status-choice-label{display:inline-flex;align-items:center;gap:5px;color:#fff}.status-image{width:16px;height:16px;object-fit:contain;border-radius:4px;background:rgba(255,255,255,.16)}.status-row{display:grid;gap:6px}.status-main{display:block}.status-choice{display:flex;align-items:center;gap:7px}.status-choice-label{padding:4px 7px;min-width:0}.status-choice small{color:#7a8494;font-size:9px}.status-style-editor{display:grid;grid-template-columns:72px minmax(78px,1fr) minmax(92px,1.2fr);gap:7px;padding:7px 9px;border:1px solid #e3e8f1;border-radius:10px;background:#fafbfc}.status-style-editor label{display:grid;gap:4px;color:#667085;font-size:9px}.status-style-editor input[type=color]{width:100%;height:30px;border:0;padding:0;background:transparent}.status-style-editor select,.status-style-editor input[type=file]{width:100%;min-width:0;font-size:9px}.status-style-editor .remove-image{grid-column:1/-1;width:auto;justify-self:start;border:0;background:transparent;color:#b42318;padding:2px 0}.status{background:${status ? rgbCss(status.style.rgb) : '#f2f5fb'};color:${status ? '#fff' : '#526071'}}
      .overlay{position:absolute;left:0;top:0;width:100%;height:0;z-index:10020;background:transparent;pointer-events:none}.drawer{position:absolute;pointer-events:auto;width:min(350px,calc(100vw - 24px));height:auto;max-height:min(68dvh,560px);overflow:auto;padding:15px;background:#fff;border:1px solid #dfe5ef;border-radius:16px;box-shadow:0 14px 38px rgba(15,23,42,.18)}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-18px;background:#fff;padding:18px 0 10px;z-index:2}.head h3{margin:0;font-size:17px}.close{border:0;background:#f2f4f7;border-radius:9px;width:30px;height:30px}.section{padding:12px 0;border-top:1px solid #edf0f4}.section h4{margin:0 0 8px}.stack{display:grid;gap:6px}.choice,.secondary{width:100%;text-align:left;padding:8px 10px;border:1px solid #e1e6ee;border-radius:10px;background:#fff;color:#344054}.choice.selected{border-color:#8aa5ef;background:#f5f7ff}.check{display:flex;align-items:center;gap:8px;padding:5px 0}.input,textarea{width:100%;border:1px solid #d7deea;border-radius:10px;padding:9px;outline:none}textarea{min-height:150px;resize:vertical}.help{margin-top:6px;color:#8a93a3;font-size:10px}.preview{margin-top:8px;padding:9px;border-radius:10px;background:#f8fafc;overflow-wrap:anywhere}.preview a{color:#3159bd}.check-preview{display:flex;gap:6px}.citation-tools{display:grid;grid-template-columns:minmax(110px,140px) 1fr;gap:7px;align-items:start}.citation-tools select{width:100%;border:1px solid #d7deea;border-radius:9px;padding:8px;background:#fff}.citation-preview{grid-column:1/-1;white-space:pre-wrap;word-break:break-word;max-height:190px;overflow:auto;padding:9px;border-radius:10px;background:#f8fafc;color:#344054;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.citation-copy{width:100%;padding:8px 10px;border:1px solid #d7deea;border-radius:9px;background:#fff;color:#3159bd;font-weight:750}.citation-note{grid-column:1/-1;color:#667085;font-size:10px}
      .summary-entry{display:flex;justify-content:flex-end;margin:3px 0 2px}.summary-trigger{border:1px solid #cfd8ec;border-radius:999px;background:#f6f8ff;color:#3159bd;padding:5px 10px;font-size:10px;font-weight:800;white-space:nowrap}
      .drawer.summary-drawer{width:min(740px,calc(100vw - 24px));max-height:min(72dvh,680px);padding:16px}.summary-layout{display:grid;grid-template-columns:minmax(190px,38%) minmax(0,1fr);gap:16px;align-items:start}.summary-toc{display:grid;place-items:center;min-height:180px;padding:10px;border-radius:12px;background:#f7f8fb}.summary-toc img{display:block;width:100%;max-height:300px;object-fit:contain}.summary-main{min-width:0}.summary-tabs{display:flex;gap:6px;margin-bottom:10px}.summary-tabs button{border:1px solid #d8dfec;border-radius:999px;background:#fff;color:#667085;padding:6px 11px;font-weight:750}.summary-tabs button.selected{background:#3159bd;color:#fff;border-color:#3159bd}.summary-text{overflow-wrap:anywhere;font-size:12px;line-height:1.7;color:#344054}.summary-state{padding:18px;border-radius:12px;background:#f7f8fb;color:#667085;line-height:1.65}.summary-state.error{color:#b42318;background:#fff4f2}.summary-meta{margin-top:12px;color:#98a2b3;font-size:9px}.summary-open{display:inline-flex;margin-top:12px;padding:8px 12px;border-radius:9px;background:#3159bd;color:#fff;text-decoration:none;font-weight:800}
      .tag-row{display:flex;gap:6px}.tag-row .input{flex:1}.tag-row .secondary{width:auto}.danger{color:#b42318}.feedback{margin-top:7px;color:#667085;font-size:10px}
      @media(max-width:680px){:host{margin-top:2px}.bar{grid-template-columns:36px 36px 36px 36px max-content;gap:4px;margin:4px 0 7px}.action{min-height:26px;padding:4px 6px;font-size:9px}.action span:last-child{display:none}.metric{font-size:8px}.drawer{width:min(330px,calc(100vw - 16px));height:auto;max-height:min(64dvh,520px);padding:13px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border-radius:14px}.chips{display:flex}.chips>.chip:not(.status){display:none}.drawer .chips>.chip{display:inline-flex}.drawer.summary-drawer{width:min(520px,calc(100vw - 16px));max-height:min(70dvh,620px)}.summary-layout{grid-template-columns:1fr;gap:10px}.summary-toc{min-height:140px}.summary-toc img{max-height:210px}.summary-text{font-size:11px;line-height:1.65}}
      .status-original{padding:2px!important;width:auto!important;max-width:128px;height:40px;min-height:0;background:transparent!important;border-radius:0;clip-path:none;transform:none}
      .status-original .status-image{width:auto;height:36px;max-width:124px;object-fit:contain;border-radius:0;background:transparent;transform:none}
      .action.status-artwork{clip-path:none;transform:none;width:100%;max-width:100%;padding:2px 5px}
      .status-original-action{display:block;width:100%;height:28px;object-fit:contain;transform:none}
      .status-style-editor .image-options{grid-column:1/-1;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .image-options label{display:flex;align-items:center;gap:4px}.image-options button{border:0;background:transparent;color:#3159bd;padding:4px}
      .image-help{grid-column:1/-1;line-height:1.5;overflow-wrap:anywhere}
      .image-options .crop-image-entry{background:#eef3ff;border:1px solid #8aa5ef;border-radius:8px;min-height:38px;padding:6px 10px;font-weight:700}
      .status-original-action[data-image-source='crop']{object-fit:contain!important}
      ${SUMMARY_PANEL_STYLES}
      ${STATUS_PRESENTATION_CSS}
    </style>${this.chips(paper, status)}<div class='summary-entry'><button type='button' class='summary-trigger' data-action='summary'>✦ ${this.tr('AI 摘要', 'AI summary')}</button></div><div class='bar'>
      ${button(s.favorite, paper.favorite ? this.tr('已收藏', 'Saved') : this.tr('收藏', 'Save'), 'favorite', paper.favorite ? '★' : '☆', paper.favorite)}
      ${button(status ? { ...s.status, rgb: status.style.rgb } : s.status, status ? statusLabel(status, this.language) : this.tr('阅读状态', 'Status'), 'status', '◈', Boolean(status), status?.style.imageData ? status.style : undefined)}
      ${button(s.note, this.tr('私人备注', 'Private note'), 'note', '✎', Boolean(paper.note))}
      ${button(s.more, this.tr('更多', 'More'), 'more', '•••')}
      <span class='metric' data-reader-count-known='${typeof count === 'number' ? 'true' : 'false'}'>◉ ${countLabel} ${this.tr('人读过', 'readers')}</span>
    </div>${this.panel === 'none' ? '' : this.drawer(paper)}`;
    this.bind();
    hydrateStatusImages(this.shadow);
    bindStatusPresentation(this.shadow, this.language, this.paperId);
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
    // A retained source does not turn a static crop into original display.
    if (status.style.imageOriginal && status.style.imageData && !status.style.imageCrop) {
      return `<span class='${className} status-original' title='${escapeHtml(statusLabel(status, this.language))}'>${statusImageTag(status.style, 'status-image', statusLabel(status, this.language))}</span>`;
    }
    const image = status.style.imageData
      ? statusImageTag(status.style, 'status-image', statusLabel(status, this.language))
      : '';
    return `<span class='${className} shape-${status.style.shape}' style='background:${rgbCss(status.style.rgb)}'>${image}<span>${escapeHtml(statusLabel(status, this.language))}</span></span>`;
  }

  private chips(paper: PaperUserState, status: ReturnType<typeof store.status>): string {
    const collections = store.state.collections.filter(item => paper.collections.includes(item.id));
    const values = [
      status ? this.statusVisual(status, 'chip status') : '',
      ...collections.map(item => `<span class='chip shape-${item.style.shape}' style='background:${rgbCss(item.style.rgb)};color:#fff'>${escapeHtml(item.name)}</span>`),
      ...paper.tags.map(tag => `<span class='chip'>${escapeHtml(tag)}</span>`),
    ];
    return values.some(Boolean) ? `<div class='chips'>${values.join('')}</div>` : '';
  }

  private citationMeta(): CitationMeta {
    const meta = store.metadata(this.paperId);
    const card = this.closest<HTMLElement>('.card');
    const authors = (card?.dataset.authors || '').split('|').map(value => value.trim()).filter(Boolean);
    return {
      title: meta?.title || this.paperId,
      journal: meta?.journal || '',
      doi: meta?.doi,
      authors,
      date: card?.dataset.date || undefined,
    };
  }

  private citationMarkup(): string {
    const citation = citationText(this.citationMeta(), this.citationStyle);
    const options: Array<[CitationStyle, string]> = [
      ['acs', 'ACS'],
      ['nature', 'Nature'],
      ['apa', 'APA'],
      ['bibtex', 'BibTeX'],
      ['ris', 'RIS'],
    ];
    return `<section class='section'><h4>${this.tr('Cite / 参考文献', 'Cite / reference')}</h4><div class='citation-tools'><select data-citation-style aria-label='${this.tr('引用格式', 'Citation style')}'>${options.map(([value, label]) => `<option value='${value}' ${this.citationStyle === value ? 'selected' : ''}>${label}</option>`).join('')}</select><button class='citation-copy' type='button' data-action='copy-citation'>${this.tr('复制引用', 'Copy citation')}</button><div class='citation-preview' data-citation-preview>${escapeHtml(citation)}</div><div class='citation-note'>${escapeHtml(this.citationMessage || this.tr('基于当前卡片已有元数据生成；缺失卷期页码时不会自动虚构。', 'Generated from current card metadata; missing volume/issue/pages are not invented.'))}</div></div></section>`;
  }

  private drawer(paper: PaperUserState): string {
    const meta = store.metadata(this.paperId); const title = this.panel === 'favorite' ? this.tr('收藏与收藏夹', 'Saved papers and folders') : this.panel === 'summary' ? this.tr('AI 文献摘要', 'AI paper summary') : this.panel === 'status' ? this.tr('阅读状态', 'Reading status') : this.panel === 'note' ? this.tr('私人备注', 'Private note') : this.tr('文献管理', 'Paper tools');
    let body = '';
    if (this.panel === 'summary') {
      body = this.summaryMarkup();
    } else if (this.panel === 'status') {
      body = `<section class='section'><div class='help' role='status' data-status-image-message>${escapeHtml(this.imageMessage)}</div><div class='stack'>${store.state.statuses.map(status => {
        const editor = `<div class='status-style-editor' data-status-editor='${escapeHtml(status.id)}'>
          <label>${this.tr('颜色', 'Color')}<input type='color' data-status-color='${escapeHtml(status.id)}' value='${rgbToHex(status.style.rgb)}'></label>
          <label>${this.tr('形状', 'Shape')}<select data-status-shape='${escapeHtml(status.id)}'>${SHAPES.map(shape => `<option value='${shape}' ${status.style.shape === shape ? 'selected' : ''}>${shape}</option>`).join('')}</select></label>
          <label>${this.tr('图片', 'Image')}<input type='file' accept='image/png,image/jpeg,image/webp,image/gif' ${this.imageBusy ? 'disabled' : ''} data-status-image='${escapeHtml(status.id)}'></label>
          <div class='image-options'><label><input type='checkbox' data-status-crop='${escapeHtml(status.id)}'>${this.tr('上传后裁切（可选）', 'Crop after upload (optional)')}</label>${status.style.imageData ? `<button type='button' class='crop-image-entry' ${this.imageBusy ? 'disabled' : ''} data-action='crop-status-image:${escapeHtml(status.id)}'>${this.tr(status.style.imageCrop ? '重新裁切 / 抠图' : '裁切图片 / 抠图', status.style.imageCrop ? 'Edit crop / cutout' : 'Crop image / cutout')}</button><button type='button' data-action='view-status-image:${escapeHtml(status.id)}'>${this.tr('查看图片', 'View image')}</button>${status.style.imageCrop ? `<button type='button' ${this.imageBusy ? 'disabled' : ''} data-action='restore-status-image:${escapeHtml(status.id)}'>${this.tr('恢复原图', 'Restore original')}</button><button type='button' data-action='view-status-original:${escapeHtml(status.id)}'>${this.tr('查看原图', 'View original')}</button>` : ''}` : ''}</div>
          <div class='help image-help'>${this.tr('PNG / JPG / WebP / GIF，最大 30 MB。已上传整图可直接点“裁切图片”。支持选区、圆形和手动抠图；GIF 裁切为静态图，原图保留，可恢复。账号同步裁切结果与预览，原文件仅存本浏览器。', 'Up to 30 MB. Crop uploaded images directly: rectangle, circle and manual cutout. GIF crops are static and reversible. Accounts sync the crop and preview; original files remain browser-local.')}</div>
          ${status.style.imageData ? `<button class='remove-image' type='button' data-action='clear-status-image:${escapeHtml(status.id)}'>${this.tr('移除图片', 'Remove image')}</button>` : ''}
        </div>`;
        return `<div class='status-row'><div class='status-main'>
          <button type='button' class='choice status-choice${paper.statusId === status.id ? ' selected' : ''}' data-action='set-status:${escapeHtml(status.id)}'>${this.statusVisual(status, 'status-choice-label')}${status.countsAsRead ? `<small>· ${this.tr('视为已读', 'treated as read')}</small>` : ''}</button>
        </div>${editor}</div>`;
      }).join('')}</div></section>`;
    } else if (this.panel === 'note') {
      body = `<section class='section'><textarea data-note placeholder='${this.tr('支持 Markdown 文本、DOI/URL、- [ ] checklist', 'Markdown text, DOI/URL and - [ ] checklist are supported')}'>${escapeHtml(paper.note)}</textarea><div class='help'>${paper.noteUpdatedAt ? `${this.tr('修改于', 'Modified')} ${formatTime(paper.noteUpdatedAt)}` : this.tr('自动保存到当前浏览器', 'Autosaved in this browser')}</div>${paper.note ? `<div class='preview'>${notePreview(paper.note)}</div>` : ''}</section>`;
    } else if (this.panel === 'favorite') {
      body = `<section class='section'><h4>${this.tr('快速选择（收藏夹）', 'Quick choices (folders)')}</h4><div class='help' style='margin-bottom:7px'>${this.tr('这里的每一项都对应一个收藏夹。', 'Every quick choice maps directly to a folder.')}</div><div class='stack'>${store.state.collections.map(item => `<label class='check'><input type='checkbox' data-collection='${escapeHtml(item.id)}' ${paper.collections.includes(item.id) ? 'checked' : ''}><span class='chip shape-${item.style.shape}' style='background:${rgbCss(item.style.rgb)};color:#fff'>${escapeHtml(item.name)}</span></label>`).join('')}</div></section>
      <section class='section'><button class='secondary${paper.favorite ? ' danger' : ''}' type='button' data-action='toggle-favorite'>${paper.favorite ? this.tr('取消收藏并移出所有收藏夹', 'Remove from saved and all folders') : this.tr('仅收藏（不分类）', 'Save without a folder')}</button><div class='help'>${this.tr('可选择多个收藏夹。取消某个分类不会取消收藏；取消收藏请使用上方按钮。', 'Choose multiple folders. Unchecking a folder keeps the paper saved; use the button above to remove it from saved papers.')}</div></section>`;
    } else {
      body = `
      ${this.citationMarkup()}
      <section class='section'><h4>${this.tr('自定义标签', 'Custom tags')}</h4><div class='tag-row'><input class='input' data-tag placeholder='${this.tr('例如：需要复现', 'e.g. reproduce')}'><button class='secondary' type='button' data-action='add-tag'>${this.tr('添加', 'Add')}</button></div><div class='chips' style='margin-top:8px'>${paper.tags.map(tag => `<span class='chip'>${escapeHtml(tag)} <button class='danger' style='border:0;background:transparent' data-action='remove-tag:${escapeHtml(tag)}'>×</button></span>`).join('')}</div></section>
      <section class='section'><div class='stack'><button class='secondary' type='button' data-action='similar'>${this.tr('查找相似文献', 'Find similar papers')}</button><button class='secondary' type='button' data-action='feedback'>${this.tr('报告文献问题', 'Report a paper issue')}</button>${meta?.href ? `<a class='secondary' data-close-panel='true' style='text-decoration:none' href='${escapeHtml(meta.href)}' target='_blank' rel='noopener noreferrer'>${this.tr('打开原文 ↗', 'Open original ↗')}</a>` : ''}</div>${this.feedbackMessage ? `<div class='feedback'>${escapeHtml(this.feedbackMessage)}</div>` : ''}</section>`;
    }
    return `<div class='overlay'><aside class='drawer${this.panel === 'summary' ? ' summary-drawer' : ''}'><div class='head'><div><h3>${title}</h3><div class='help'>${escapeHtml(meta?.title || '')}</div></div><button class='close' type='button' data-action='close'>×</button></div>${body}</aside></div>`;
  }

  private bind(): void {
    this.shadow.querySelectorAll<HTMLElement>('[data-action]').forEach(element => element.addEventListener('click', () => { void this.action(element.dataset.action || ''); }));
    this.shadow.querySelectorAll<HTMLElement>('[data-close-panel]').forEach(element => element.addEventListener('click', () => this.closePanel()));
    this.shadow.querySelector<HTMLAnchorElement>('[data-summary-open]')?.addEventListener('click', event => {
      if (!event.isTrusted) return;
      const doi = store.metadata(this.paperId)?.doi;
      if (doi) void store.recordOpen(doi);
    });
    this.shadow.querySelector<HTMLTextAreaElement>('[data-note]')?.addEventListener('input', event => store.setNote(this.paperId, (event.target as HTMLTextAreaElement).value, false));
    this.shadow.querySelector<HTMLTextAreaElement>('[data-note]')?.addEventListener('blur', event => {
      store.setNote(this.paperId, (event.target as HTMLTextAreaElement).value, false);
    });
    this.shadow.querySelectorAll<HTMLInputElement>('[data-collection]').forEach(input => input.addEventListener('change', () => store.updatePaper(this.paperId, paper => {
      const id = input.dataset.collection || ''; paper.collections = input.checked ? [...new Set([...paper.collections, id])] : paper.collections.filter(value => value !== id); paper.favorite = paper.collections.length > 0 || paper.favorite;
    })));
    this.shadow.querySelector<HTMLSelectElement>('[data-citation-style]')?.addEventListener('change', event => {
      this.citationStyle = (event.currentTarget as HTMLSelectElement).value as CitationStyle;
      this.citationMessage = '';
      this.render();
    });
        this.shadow.querySelectorAll<HTMLInputElement>('[data-status-color]').forEach(input => input.addEventListener('change', () => {
      const status = store.status(input.dataset.statusColor || '');
      if (!status) return;
      status.style.rgb = hexToRgb(input.value);
      store.save();
    }));
    this.shadow.querySelectorAll<HTMLSelectElement>('[data-status-shape]').forEach(select => select.addEventListener('change', () => {
      const status = store.status(select.dataset.statusShape || '');
      if (!status) return;
      status.style.shape = select.value as Shape;
      store.save();
    }));
    this.shadow.querySelectorAll<HTMLInputElement>('[data-status-image]').forEach(input => input.addEventListener('change', async () => {
      const status = store.status(input.dataset.statusImage || '');
      const file = input.files?.[0];
      if (!status || !file) return;
      const crop = this.shadow.querySelector<HTMLInputElement>(`input[data-status-crop="${CSS.escape(status.id)}"]`)?.checked;
      this.imageBusy = true;
      this.imageMessage = this.tr('正在保存图片…', 'Saving image…');
      this.render();
      try {
        if (crop) { const saved = await store.cropStatusImage(status.style, file); this.imageMessage = saved ? this.tr('裁切已保存；显示选区结果，原图可恢复。', 'Crop saved; selected area displayed, original can be restored.') : this.tr('已取消，原设置未改变。', 'Cancelled; previous settings kept.'); }
        else {
          const saved = await store.setOriginalStatusImage(status.style, file);
          this.imageMessage = saved ? this.tr('原图已保存在当前浏览器；刷新后仍可显示。', 'Original saved in this browser and available after reload.') : this.tr('已取消，保留更新后的设置。', 'Cancelled; newer settings kept.');
        }
      } catch (error) { this.imageMessage = statusImageError(error); }
      finally { this.imageBusy = false; input.value = ''; this.render(); }
    }));
  }

  private async action(action: string): Promise<void> {
    const imageEdit = /^(crop-status-image|restore-status-image|view-status-original):(.+)$/.exec(action);
    if (imageEdit) {
      const status = store.status(imageEdit[2]);
      if (!status?.style.imageData) return;
      if (imageEdit[1] === 'view-status-original') {
        await viewStatusImage({ ...status.style, imageData: status.style.imageCrop?.sourcePreview || status.style.imageData, imageCrop: undefined }); return;
      }
      if (this.imageBusy) return;
      this.imageBusy = true; this.imageMessage = this.tr('正在准备图片…', 'Preparing image…'); this.render();
      try {
        const saved = imageEdit[1] === 'crop-status-image' ? await store.cropStatusImage(status.style) : store.restoreStatusImage(status.style);
        this.imageMessage = saved ? this.tr('图片设置已保存。', 'Image settings saved.') : this.tr('已取消或已有更新，保留当前设置。', 'Cancelled or superseded; current settings kept.');
      } catch (error) { this.imageMessage = statusImageError(error); }
      finally { this.imageBusy = false; this.render(); }
      return;
    }

    if (action === 'favorite') {
      if (this.panel === 'favorite') this.closePanel();
      else this.openPanel('favorite');
      return;
    }
    if (action === 'toggle-favorite') {
      store.updatePaper(this.paperId, paper => {
        paper.favorite = !paper.favorite;
        if (!paper.favorite) paper.collections = [];
      });
      return;
    }
    if (action === 'summary') { await this.openSummary(); return; }
    if (action === 'status' || action === 'note' || action === 'more') { this.openPanel(action); return; }
    if (action === 'summary-lang:zh' || action === 'summary-lang:en') {
      this.summaryLanguage = action.endsWith(':en') ? 'en' : 'zh';
      this.render();
      return;
    }
    if (action === 'close') { this.closePanel(); return; }
    if (action.startsWith('view-status-image:')) {
      const status = store.status(action.slice('view-status-image:'.length));
      if (status) await viewStatusImage(status.style);
      return;
    }
    if (action.startsWith('clear-status-image:')) {
      const statusId = action.slice('clear-status-image:'.length);
      const status = store.status(statusId);
      if (status?.style.imageData) {
        this.imageMessage = '';
        store.clearImage(status.style);
      }
      return;
    }
    if (action.startsWith('set-status:')) {
      const statusId = action.slice(11);
      this.closePanel();
      store.setStatus(this.paperId, statusId);
      return;
    }
    if (action === 'copy-citation') {
      const text = citationText(this.citationMeta(), this.citationStyle);
      try {
        await navigator.clipboard.writeText(text);
        this.citationMessage = this.tr('已复制到剪贴板。', 'Copied to clipboard.');
      } catch {
        this.citationMessage = this.tr('复制失败，请手动选择上方文本。', 'Copy failed; select the text above manually.');
      }
      this.render();
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
