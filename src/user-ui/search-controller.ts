import { normalizeDoi, normalizeSearch, queryTerm, queryTokens, store, suggestionMatch, type Language, type PaperMeta, type SuggestionType } from './shared';
import { PAPER_ACTION_ELEMENT } from './paper-actions';
import { USER_SHELL_ELEMENT } from './library-shell';

interface Candidate { value: string; type: SuggestionType; frequency: number; }
interface Suggestion extends Candidate { score: number; replaceWords: number; hint: 'exact' | 'prefix' | 'contains' | 'spelling'; }

function installGlobalStyles(): void {
  if (document.querySelector('#gallery-user-ui-global-styles')) return;
  const style = document.createElement('style');
  style.id = 'gallery-user-ui-global-styles';
  style.textContent = `
    .user-title-link,.user-doi-link{color:inherit;text-decoration:none}.user-title-link:hover,.user-doi-link:hover{color:#3159bd;text-decoration:underline}.user-search-match{outline:2px solid rgba(49,89,189,.22);outline-offset:2px}.user-search-highlight{border-radius:4px;background:#fff0a8;color:inherit;padding:0 .08em}.user-search-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 12px;padding:10px 12px;border:1px solid #cfd9f4;border-radius:12px;background:#f7f9ff;color:#344054;font-size:12px}.user-search-summary strong{color:#172033}.user-search-summary button{border:0;border-radius:8px;background:#e9efff;color:#3159bd;padding:6px 9px;cursor:pointer;font-weight:700}.user-hit-reason{margin:-2px 0 7px;color:#788497;font-size:10px;line-height:1.35}.user-search-empty{grid-column:1/-1;padding:42px 18px;border:1px dashed #d2d9e5;border-radius:16px;background:#fff;color:#667085;text-align:center}.user-search-popover{position:fixed;z-index:10050;max-height:300px;overflow:auto;padding:5px;border:1px solid #d7deea;border-radius:12px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.18)}.user-search-popover button{width:100%;display:grid;grid-template-columns:65px minmax(0,1fr) auto;gap:7px;align-items:center;padding:8px;border:0;border-radius:8px;background:#fff;text-align:left;color:#344054;cursor:pointer}.user-search-popover button:hover{background:#f4f6fb}.user-search-popover .kind{color:#667085;font-size:9px}.user-search-popover strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.user-search-popover small{color:#98a2b3;font-size:9px}@media(max-width:680px){.user-search-summary{align-items:flex-start;font-size:10px}.user-search-summary button{flex:0 0 auto}.user-hit-reason{font-size:8px;margin-bottom:4px}.user-search-popover{max-height:240px}.user-search-popover button{grid-template-columns:48px minmax(0,1fr);font-size:10px}.user-search-popover small{display:none}}
  `;
  document.head.appendChild(style);
}

export class UserSearchController {
  private searchInput: HTMLInputElement | null = null;
  private gallery: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private popover: HTMLElement | null = null;
  private fullQuery = '';
  private candidates: Candidate[] = [];
  private refreshQueued = false;
  private composing = false;
  private readonly storeChanged = (): void => this.refresh();
  private readonly resize = (): void => this.positionPopover();
  private readonly onInput = (event: Event): void => {
    // The legacy Gallery still has an input listener that rebuilds every card.
    // This controller owns search now, so stop that older listener instead of
    // blanking/restoring the input value (which breaks IME and caret position).
    event.stopImmediatePropagation();
    if (!this.searchInput) return;
    this.fullQuery = this.searchInput.value;
    this.updateShellQuery();
    if (this.composing || (event instanceof InputEvent && event.isComposing)) return;
    this.refresh();
    this.renderSuggestions();
  };
  private readonly onCompositionStart = (): void => { this.composing = true; };
  private readonly onCompositionEnd = (): void => {
    this.composing = false;
    if (!this.searchInput) return;
    this.fullQuery = this.searchInput.value;
    this.updateShellQuery();
    this.refresh();
    this.renderSuggestions();
  };

  constructor(private readonly root: HTMLElement, private readonly language: Language) {}

  start(preservedQuery = ''): void {
    installGlobalStyles();
    this.searchInput = this.root.querySelector<HTMLInputElement>('#search');
    this.gallery = this.root.querySelector<HTMLElement>('#gallery');
    if (!this.searchInput || !this.gallery) return;
    this.fullQuery = preservedQuery || this.searchInput.value || '';
    this.searchInput.value = this.fullQuery;
    this.searchInput.placeholder = this.language === 'zh' ? '搜索标题、作者、DOI、关键词；多词条 AND，支持拼写纠正…' : 'Search title, author, DOI or keyword; multi-term AND + typo correction…';
    this.searchInput.addEventListener('input', this.onInput, { capture: true });
    this.searchInput.addEventListener('compositionstart', this.onCompositionStart);
    this.searchInput.addEventListener('compositionend', this.onCompositionEnd);
    this.searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') store.addHistory(this.fullQuery);
      if (event.key === 'Escape' && this.fullQuery) {
        event.preventDefault();
        this.setSearch('');
      }
    });
    this.searchInput.addEventListener('change', () => store.addHistory(this.fullQuery));
    this.searchInput.addEventListener('focus', () => this.renderSuggestions());
    this.searchInput.addEventListener('blur', () => window.setTimeout(() => { this.popover?.remove(); this.popover = null; }, 150));
    this.root.addEventListener('gallery-search', this.handleSearch as EventListener);
    this.root.addEventListener('gallery-similar', this.handleSimilar as EventListener);
    store.addEventListener('change', this.storeChanged);
    window.addEventListener('resize', this.resize);
    window.addEventListener('scroll', this.resize, true);
    this.observer = new MutationObserver(() => this.queueRefresh());
    this.observer.observe(this.gallery, { childList: true });
    this.updateShellQuery();
    this.refresh();
  }

  destroy(): void {
    this.observer?.disconnect(); this.observer = null;
    this.searchInput?.removeEventListener('input', this.onInput, true);
    this.searchInput?.removeEventListener('compositionstart', this.onCompositionStart);
    this.searchInput?.removeEventListener('compositionend', this.onCompositionEnd);
    this.root.removeEventListener('gallery-search', this.handleSearch as EventListener);
    this.root.removeEventListener('gallery-similar', this.handleSimilar as EventListener);
    store.removeEventListener('change', this.storeChanged);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('scroll', this.resize, true);
    this.popover?.remove(); this.popover = null;
  }
  currentSearch(): string { return this.fullQuery; }

  private readonly handleSearch = (event: CustomEvent<{ query?: string }>): void => { this.setSearch(event.detail?.query || ''); };
  private readonly handleSimilar = (event: CustomEvent<{ paperId?: string }>): void => {
    const meta = store.metadata(event.detail?.paperId || ''); if (!meta) return;
    const stop = new Set(['with','from','using','through','toward','towards','via','and','the','for','into','under','enabled','enables','synthesis','total','formal','catalyzed','catalytic','organic','methodology']);
    const words = meta.title.split(/[^A-Za-z0-9-]+/).filter(word => word.length >= 5 && !stop.has(word.toLowerCase())).slice(0, 2);
    this.setSearch(words.length ? words.map(queryTerm).join(' ') : meta.journal);
  };

  private setSearch(value: string): void {
    if (!this.searchInput) return;
    this.fullQuery = value.trim(); store.addHistory(this.fullQuery); this.searchInput.value = this.fullQuery;
    this.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    this.searchInput.focus();
  }
  private updateShellQuery(): void { this.root.querySelector<HTMLElement>(USER_SHELL_ELEMENT)?.setAttribute('data-current-query', this.fullQuery); }
  private queueRefresh(): void { if (this.refreshQueued) return; this.refreshQueued = true; queueMicrotask(() => { this.refreshQueued = false; this.refresh(); }); }

  private refresh(): void {
    if (!this.gallery) return;
    this.observer?.disconnect();
    const cards = [...this.gallery.querySelectorAll<HTMLElement>('.card')];
    const metas = cards.flatMap(card => { const meta = this.decorate(card); return meta ? [meta] : []; });
    this.buildCandidates(metas);
    this.applyFilters(cards);
    this.observer?.observe(this.gallery, { childList: true });
    void store.loadCounts(metas.flatMap(meta => meta.doi ? [meta.doi] : []));
  }

  private decorate(card: HTMLElement): PaperMeta | null {
    const titleElement = card.querySelector<HTMLElement>('.title'); const doiElement = card.querySelector<HTMLElement>('.doi'); const open = card.querySelector<HTMLAnchorElement>('a.open');
    if (!titleElement) return null;
    const title = titleElement.textContent?.trim() || ''; const journal = card.querySelector<HTMLElement>('.meta .tag')?.textContent?.trim() || ''; const doi = normalizeDoi(doiElement?.textContent || ''); const href = open?.href || (doi ? `https://doi.org/${doi}` : undefined);
    const id = doi || `title:${normalizeSearch(title).slice(0, 120)}`; if (!id) return null;
    const authors = (card.dataset.authors || '').split('|').map(value => value.trim()).filter(Boolean); const topics = (card.dataset.topics || '').split('|').map(value => value.trim()).filter(Boolean);
    const meta: PaperMeta = { id, doi, title, journal, href, authors, topics }; store.registerMeta(meta); card.dataset.userPaperId = id;
    if (href && !titleElement.querySelector('.user-title-link')) titleElement.innerHTML = `<a class='user-title-link' href='${href}' target='_blank' rel='noopener noreferrer'>${titleElement.innerHTML}</a>`;
    if (href && doiElement && !doiElement.querySelector('.user-doi-link')) doiElement.innerHTML = `<a class='user-doi-link' href='${href}' target='_blank' rel='noopener noreferrer'>${doiElement.textContent || ''}</a>`;
    if (!card.querySelector(PAPER_ACTION_ELEMENT)) { const actions = document.createElement(PAPER_ACTION_ELEMENT); actions.setAttribute('data-paper-id', id); actions.setAttribute('data-language', this.language); card.querySelector('.cardfoot')?.before(actions); }
    open?.addEventListener('click', () => store.touchOpened(id), { once: true }); titleElement.querySelector('a')?.addEventListener('click', () => store.touchOpened(id), { once: true });
    return meta;
  }

  private buildCandidates(metas: PaperMeta[]): void {
    const values = new Map<string, Candidate>();
    const add = (value: string, type: SuggestionType): void => { const clean = value.trim(); if (clean.length < 2) return; const key = `${type}:${clean.toLowerCase()}`; const old = values.get(key); if (old) old.frequency += 1; else values.set(key, { value: clean, type, frequency: 1 }); };
    const stop = new Set(['with','from','using','through','toward','towards','via','and','the','for','into','under','enabled','enables','synthesis','total','formal','catalyzed','catalytic','organic']);
    metas.forEach(meta => { add(meta.journal, 'journal'); if (meta.doi) add(meta.doi, 'doi'); meta.authors.forEach(value => add(value, 'author')); meta.topics.forEach(value => add(value, 'keyword')); meta.title.split(/[^A-Za-z0-9-]+/).filter(word => word.length >= 4 && !stop.has(word.toLowerCase())).forEach(word => add(word, 'keyword')); });
    store.state.aliases.forEach(group => group.terms.forEach(term => add(term, 'keyword')));
    this.candidates = [...values.values()];
  }

  private expanded(token: string): string[] { const lower = token.toLowerCase(); const group = store.state.aliases.find(item => item.terms.some(term => term.toLowerCase() === lower)); return group ? group.terms.map(term => term.toLowerCase()) : [lower]; }
  private clearSearchHighlights(card: HTMLElement): void {
    card.classList.remove('user-search-match');
    card.querySelectorAll<HTMLElement>('mark.user-search-highlight').forEach(mark => {
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
    });
    card.querySelectorAll<HTMLElement>('.title,.authors,.doi,.meta .tag').forEach(element => element.normalize());
  }

  private highlightElement(element: HTMLElement, terms: string[]): void {
    const cleanTerms = [...new Set(terms.map(term => term.trim()).filter(term => term.length >= 2))]
      .sort((a, b) => b.length - a.length);
    if (!cleanTerms.length) return;
    const escaped = cleanTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    nodes.forEach(textNode => {
      const value = textNode.nodeValue || '';
      if (!pattern.test(value)) { pattern.lastIndex = 0; return; }
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of value.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > cursor) fragment.append(value.slice(cursor, index));
        const mark = document.createElement('mark');
        mark.className = 'user-search-highlight';
        mark.textContent = match[0];
        fragment.append(mark);
        cursor = index + match[0].length;
      }
      if (cursor < value.length) fragment.append(value.slice(cursor));
      textNode.replaceWith(fragment);
    });
  }

  private renderSearchSummary(tokens: string[], visible: number): void {
    const existing = this.root.querySelector<HTMLElement>('.user-search-summary');
    if (!tokens.length) { existing?.remove(); return; }
    const summary = existing || document.createElement('div');
    summary.className = 'user-search-summary';
    summary.replaceChildren();
    const text = document.createElement('span');
    const prefix = this.language === 'zh' ? '搜索结果' : 'Search results';
    const suffix = this.language === 'zh' ? `${visible} 篇` : `${visible} papers`;
    text.append(`${prefix}：“`);
    const strong = document.createElement('strong');
    strong.textContent = this.fullQuery.trim();
    text.append(strong, `” · ${suffix}`);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = this.language === 'zh' ? '清除搜索' : 'Clear search';
    clear.addEventListener('click', () => this.setSearch(''));
    summary.append(text, clear);
    if (!existing) this.root.querySelector('.resultline')?.after(summary);
  }

  private applyFilters(cards: HTMLElement[]): void {
    const tokens = queryTokens(this.fullQuery); let visible = 0;
    for (const card of cards) {
      card.querySelector('.user-hit-reason')?.remove();
      this.clearSearchHighlights(card);
      const id = card.dataset.userPaperId || '';
      const meta = store.metadata(id);
      const title = card.querySelector<HTMLElement>('.title')?.textContent || meta?.title || '';
      const authors = card.dataset.authors || meta?.authors?.join(' ') || '';
      const topics = card.dataset.topics || meta?.topics?.join(' ') || '';
      const searchable = [title, authors, topics, meta?.journal || '', meta?.doi || ''].join(' ').toLowerCase();
      const normalized = normalizeSearch(searchable);
      const hidden = !tokens.every(token => this.expanded(token).some(term => {
        const lower = term.toLowerCase();
        return searchable.includes(lower) || normalized.includes(normalizeSearch(lower));
      })) || (store.state.hideRead && store.isRead(id));
      card.hidden = hidden;
      if (hidden) continue;
      visible += 1;
      if (tokens.length) {
        card.classList.add('user-search-match');
        const expandedTerms = tokens.flatMap(token => this.expanded(token));
        card.querySelectorAll<HTMLElement>('.title,.authors,.doi,.meta .tag').forEach(element => this.highlightElement(element, expandedTerms));
        const reasons = tokens.map(token => {
          const terms = this.expanded(token);
          if (card.dataset.authors && terms.some(term => card.dataset.authors!.toLowerCase().includes(term))) return `${this.language === 'zh' ? '作者' : 'Author'}:${token}`;
          if (meta?.journal && terms.some(term => meta.journal.toLowerCase().includes(term))) return `${this.language === 'zh' ? '期刊' : 'Journal'}:${token}`;
          if (meta?.doi && terms.some(term => meta.doi!.includes(term))) return `DOI:${token}`;
          return `${this.language === 'zh' ? '标题/关键词' : 'Title/keyword'}:${token}`;
        });
        const hit = document.createElement('div');
        hit.className = 'user-hit-reason';
        hit.textContent = `${this.language === 'zh' ? '命中' : 'Matched'}：${reasons.join(' · ')}`;
        card.querySelector(PAPER_ACTION_ELEMENT)?.before(hit);
      }
    }
    const count = this.root.querySelector<HTMLElement>('#resultCount'); if (count) count.textContent = String(visible);
    this.renderSearchSummary(tokens, visible);
    const empty = this.gallery?.querySelector<HTMLElement>('.user-search-empty') || null;
    if (!visible && this.gallery && !empty) { const next = document.createElement('div'); next.className = 'user-search-empty'; next.textContent = this.language === 'zh' ? '没有匹配当前词条组合的文献。可以减少词条、选择智能推荐或检查拼写。' : 'No papers match this term combination. Try fewer terms, a suggestion, or check spelling.'; this.gallery.appendChild(next); }
    if (visible) empty?.remove();
  }

  private suggestions(): Suggestion[] {
    if (this.fullQuery.trim().length < 2 || /\s$/.test(this.fullQuery)) return [];
    return this.candidates.flatMap(candidate => { const match = suggestionMatch(this.fullQuery, candidate.value); return match ? [{ ...candidate, ...match, score: match.score + Math.min(8, candidate.frequency) }] : []; }).sort((a, b) => b.score - a.score || a.value.localeCompare(b.value)).slice(0, 8);
  }
  private renderSuggestions(): void {
    this.popover?.remove(); this.popover = null; const suggestions = this.suggestions(); if (!suggestions.length || !this.searchInput) return;
    const popover = document.createElement('div'); popover.className = 'user-search-popover'; const typeLabel = (type: SuggestionType): string => type === 'author' ? (this.language === 'zh' ? '作者' : 'Author') : type === 'journal' ? (this.language === 'zh' ? '期刊' : 'Journal') : type === 'doi' ? 'DOI' : (this.language === 'zh' ? '关键词' : 'Keyword'); const hint = (value: Suggestion['hint']): string => value === 'spelling' ? (this.language === 'zh' ? '拼写纠正' : 'Spelling') : value === 'prefix' ? (this.language === 'zh' ? '前缀匹配' : 'Prefix') : value === 'contains' ? (this.language === 'zh' ? '包含匹配' : 'Contains') : (this.language === 'zh' ? '完全匹配' : 'Exact');
    popover.innerHTML = suggestions.map((item, index) => `<button type='button' data-index='${index}'><span class='kind'>${typeLabel(item.type)}</span><strong>${item.value.replace(/[&<>"']/g, '')}</strong><small>${hint(item.hint)}</small></button>`).join('');
    popover.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('mousedown', event => { event.preventDefault(); const item = suggestions[Number(button.dataset.index || 0)]; if (!item) return; const words = this.fullQuery.trim().replace(/"/g, '').split(/\s+/).filter(Boolean); const keep = words.slice(0, Math.max(0, words.length - Math.max(1, item.replaceWords))); this.setSearch([...keep, queryTerm(item.value)].join(' ')); popover.remove(); this.popover = null; }));
    document.body.appendChild(popover); this.popover = popover; this.positionPopover();
  }
  private positionPopover(): void { if (!this.popover || !this.searchInput) return; const rect = this.searchInput.getBoundingClientRect(); this.popover.style.left = `${Math.max(8, rect.left)}px`; this.popover.style.top = `${rect.bottom + 6}px`; this.popover.style.width = `${Math.max(280, rect.width)}px`; this.popover.style.maxWidth = `calc(100vw - ${Math.max(16, rect.left + 8)}px)`; }
}
