import { api } from './platform-api';
import './styles.css';
import { mountUserShell } from './user-shell';
import { earliestAddedDate, isExcludedDoi, isNewToday as isNewTodayDate, msUntilNextBeijingDay, validAddedDate } from '../shared/literature-policy.js';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';
import { store } from './user-ui/shared';

interface Paper {
  journal: string;
  title: string | null;
  doi: string | null;
  date: string;
  url: string | null;
  new: boolean;
  addedDate?: string;
  authors: string[];
  synthesisType?: 'total' | 'formal';
}

interface PrimaryVisualResponse {
  available: boolean;
  kind?: 'official_visual' | 'figure1' | 'pdf_primary' | 'article_figure' | 'open_fallback';
  label?: string;
  imageUrl?: string;
  masterImageUrl?: string;
  thumbnailImageUrl?: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  source?: string;
  confidence?: number;
}

interface TocResponse {
  available: boolean;
  imageUrl?: string;
  articleUrl?: string;
  contentHash?: string;
  reason?: string;
  primary?: PrimaryVisualResponse;
}

interface FigureAsset {
  id: string;
  label: string;
  caption?: string;
  imageUrl: string;
  order: number;
}

interface FigureResponse {
  available: boolean;
  doi: string;
  articleUrl?: string;
  figures: FigureAsset[];
}

interface MediaBatchItem {
  doi: string;
  toc: TocResponse;
  figures: FigureResponse;
}

interface MediaInventoryItem {
  doi: string;
  status: 'complete' | 'large_only' | 'figures_only' | 'missing';
  largeSource: 'toc' | 'figure1' | 'figure' | 'none';
  fallbackLabel?: string;
  suspiciousToc?: boolean;
  figureCount?: number;
}

interface MediaInventoryResponse {
  generatedAt: number;
  items: MediaInventoryItem[];
}

type Language = 'zh' | 'en';

const copy = {
  zh: {
    title: '有机合成文献库',
    eyebrow: '有机合成方法学与全合成文献',
    lede: '聚合指定期刊的有机合成方法学与全合成论文；日期采用首次在线发表日期。',
    total: '文献总数',
    journals: '期刊数',
    latest: '最新收录日期',
    search: '搜索标题、DOI、期刊或日期…',
    allJournals: '全部期刊',
    journalsSelected: '个期刊已选',
    newest: '最新优先',
    oldest: '最早优先',
    mostRead: '阅读人数最多',
    onlyNew: '仅新增',
    dateFrom: '起始日期',
    dateTo: '结束日期',
    clearFilters: '清除期刊/日期筛选',
    shown: '篇文献',
    titlePending: '正在核验标题…',
    doiPending: 'DOI 待核验',
    open: '打开原文 ↗',
    new: '新增',
    methodology: '方法学',
    totalSynthesis: '全合成',
    formalSynthesis: '形式全合成',
    figures: '正文图片',
    fetching: '正在获取原始 TOC / Figure',
    articleGraphic: '文章图',
    toc: '文章图 / TOC',
    noResults: '没有符合当前筛选条件的文献。',
    loadError: '无法加载文献数据库。',
    close: '关闭大图',
  },
  en: {
    title: 'Organic Synthesis Literature Gallery',
    eyebrow: 'Organic synthesis methodology and total synthesis',
    lede: 'Curated organic synthesis methodology and total synthesis papers from selected journals; dates use first-online publication.',
    total: 'Total papers',
    journals: 'Journals',
    latest: 'Latest first-online date',
    search: 'Search title, DOI, journal or date…',
    allJournals: 'All journals',
    journalsSelected: 'journals selected',
    newest: 'Newest first',
    oldest: 'Oldest first',
    mostRead: 'Most readers',
    onlyNew: 'Only new',
    dateFrom: 'From date',
    dateTo: 'To date',
    clearFilters: 'Clear journal/date filters',
    shown: 'papers shown',
    titlePending: 'Verifying title…',
    doiPending: 'DOI pending',
    open: 'Open article ↗',
    new: 'New',
    methodology: 'Methodology',
    totalSynthesis: 'Total synthesis',
    formalSynthesis: 'Formal total synthesis',
    figures: 'Article figures',
    fetching: 'Fetching original TOC / Figure',
    articleGraphic: 'Article graphic',
    toc: 'Article graphic / TOC',
    noResults: 'No papers match the current filters.',
    loadError: 'Unable to load the literature database.',
    close: 'Close enlarged image',
  },
} as const;

type CopyKey = keyof typeof copy.zh;
const LANGUAGE_KEY = 'organic-gallery-language';
const TITLE_CACHE_KEY = 'organic-gallery-resolved-title-cache-v2';
const ZH_CACHE_KEY = 'organic-gallery-zh-title-cache-v2';
const FILTER_PREFS_KEY = 'organic-gallery-filter-preferences-v1';
const MEDIA_TTL = 5 * 60 * 1000;

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('App root not found');
const app = appElement;

let language: Language = initialLanguage();
let papers: Paper[] = [];
let query = '';
let sort: 'newest' | 'oldest' | 'readers' = 'newest';
let onlyNew = false;
const selectedJournals = new Set<string>();
let dateFrom = '';
let dateTo = '';
const zhTitleCache = new Map<string, string>();
const resolvedTitleCache = new Map<string, { title: string; doi?: string }>();
const tocCache = new Map<string, { result: TocResponse; fetchedAt: number }>();
const figureCache = new Map<string, { result: FigureResponse; fetchedAt: number }>();
const mediaCheckedAt = new Map<string, number>();
let batchTimer: number | null = null;
let batchRunning = false;
let batchAgain = false;
let inventoryFingerprint = '';
let bridgeStageTimer: number | null = null;
let bridgeStageCursor = 0;
let newnessTimer: number | null = null;
let journalPickerAbort: AbortController | null = null;

store.addEventListener('counts', () => {
  if (sort === 'readers') renderCards();
});

hydrateFilterPreferences();
hydrateBrowserCaches();
document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Browser storage is optional.
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function validFilterDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hydrateFilterPreferences(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_PREFS_KEY) || 'null') as {
      journals?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
    } | null;
    if (!saved) return;
    if (Array.isArray(saved.journals)) {
      for (const journal of saved.journals) {
        if (typeof journal === 'string' && journal.trim()) selectedJournals.add(journal.trim());
      }
    }
    if (validFilterDate(saved.dateFrom)) dateFrom = saved.dateFrom;
    if (validFilterDate(saved.dateTo)) dateTo = saved.dateTo;
    if (dateFrom && dateTo && dateFrom > dateTo) dateTo = dateFrom;
  } catch {
    // Ignore malformed optional preferences.
  }
}

function persistFilterPreferences(): void {
  try {
    localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify({
      journals: [...selectedJournals].sort(),
      dateFrom,
      dateTo,
    }));
  } catch {
    // Filtering remains usable even if browser storage is unavailable.
  }
}

function t(key: CopyKey): string {
  return copy[language][key];
}

function hydrateBrowserCaches(): void {
  try {
    const zh = JSON.parse(localStorage.getItem(ZH_CACHE_KEY) || '{}') as Record<string, unknown>;
    for (const [title, value] of Object.entries(zh)) {
      if (typeof value === 'string' && value.trim()) zhTitleCache.set(title, value.trim());
    }
  } catch {
    // Ignore malformed cache.
  }
  try {
    const resolved = JSON.parse(localStorage.getItem(TITLE_CACHE_KEY) || '{}') as Record<string, unknown>;
    for (const [key, value] of Object.entries(resolved)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as { title?: unknown; doi?: unknown };
      if (typeof item.title !== 'string' || !item.title.trim()) continue;
      resolvedTitleCache.set(key, {
        title: item.title.trim(),
        doi: typeof item.doi === 'string' && item.doi.trim() ? item.doi.trim() : undefined,
      });
    }
  } catch {
    // Ignore malformed cache.
  }
}

function persistCaches(): void {
  try {
    localStorage.setItem(ZH_CACHE_KEY, JSON.stringify(Object.fromEntries(zhTitleCache)));
    localStorage.setItem(TITLE_CACHE_KEY, JSON.stringify(Object.fromEntries(resolvedTitleCache)));
  } catch {
    // Browser storage is only a performance optimization.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

function canonicalJournal(value: string): string {
  const normalized = value.trim();
  if (/^(?:angew\b|angewandte chemie)/i.test(normalized)) return 'Angew';
  return normalized;
}

function normalizeDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  let cleaned = value.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    return null;
  }
  cleaned = cleaned
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function paperDoi(paper: Paper): string | null {
  const direct = normalizeDoi(paper.doi);
  if (direct) return direct;
  if (!paper.url) return null;
  try {
    const url = new URL(paper.url);
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return normalizeDoi(url.pathname.slice(1));
    const pathDoi = url.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i);
    if (pathDoi) return normalizeDoi(pathDoi[1]);
    const nature = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if (/nature\.com$/i.test(url.hostname) && nature) return normalizeDoi(`10.1038/${nature[1]}`);
  } catch {
    return null;
  }
  return null;
}

function pendingTitle(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  const normalized = value.trim().toLowerCase().replace(/[：:….]/g, '').replace(/\s+/g, ' ');
  return [
    'title pending verification', 'title pending', 'pending verification', 'pending title verification',
    '标题待核验', '待核验', '标题待确认', '待确认',
  ].includes(normalized) || /cloudflare|checking your browser|verify you are human|enable javascript|access denied|page not found/i.test(normalized);
}

function normalizePaper(paper: Paper): Paper {
  return {
    ...paper,
    journal: canonicalJournal(paper.journal),
    title: pendingTitle(paper.title) ? null : paper.title?.trim() || null,
    doi: normalizeDoi(paper.doi),
    addedDate: validAddedDate(paper.addedDate) || undefined,
    authors: Array.isArray(paper.authors)
      ? paper.authors.filter((author): author is string => typeof author === 'string').map(author => author.trim()).filter(Boolean)
      : [],
  };
}

function titleCacheKey(paper: Paper): string {
  return (paperDoi(paper) || paper.url || `${paper.journal}|${paper.date}|${paper.title || ''}`).toLowerCase();
}

function applyResolvedTitles(): void {
  for (const paper of papers) {
    const cached = resolvedTitleCache.get(titleCacheKey(paper));
    if (!cached) continue;
    if (!paper.title) paper.title = cached.title;
    if (!paperDoi(paper) && cached.doi) paper.doi = cached.doi;
  }
}

function mergePapers(base: Paper[], additions: Paper[]): Paper[] {
  const merged = base.map(item => ({ ...item }));
  const byDoi = new Map<string, Paper>();
  const byTitle = new Map<string, Paper>();
  for (const paper of merged) {
    const doi = paperDoi(paper)?.toLowerCase();
    if (doi) byDoi.set(doi, paper);
    if (paper.title) byTitle.set(paper.title.trim().toLowerCase(), paper);
  }
  for (const item of additions) {
    const paper = normalizePaper(item);
    const doi = paperDoi(paper)?.toLowerCase();
    const title = paper.title?.trim().toLowerCase() || '';
    const existing = (doi ? byDoi.get(doi) : undefined) || (title ? byTitle.get(title) : undefined);
    if (existing) {
      if (!existing.title && paper.title) existing.title = paper.title;
      if (!existing.doi && paper.doi) existing.doi = paper.doi;
      if (!existing.url && paper.url) existing.url = paper.url;
      if (paper.synthesisType) existing.synthesisType = paper.synthesisType;
      if (paper.authors.length > existing.authors.length) existing.authors = [...paper.authors];
      const addedDate = earliestAddedDate(existing.addedDate, paper.addedDate);
      existing.addedDate = addedDate || undefined;
      existing.new = existing.new || paper.new;
      continue;
    }
    merged.push(paper);
    if (doi) byDoi.set(doi, paper);
    if (title) byTitle.set(title, paper);
  }
  return merged;
}

function prettyDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function visibleTitle(paper: Paper): string {
  if (!paper.title) return t('titlePending');
  if (language === 'zh') return zhTitleCache.get(paper.title) || paper.title;
  return paper.title;
}

function isNewToday(paper: Paper): boolean {
  return isNewTodayDate(paper.addedDate);
}

function scheduleNewnessBoundary(): void {
  if (newnessTimer !== null) window.clearTimeout(newnessTimer);
  const delay = msUntilNextBeijingDay();
  newnessTimer = window.setTimeout(() => {
    newnessTimer = null;
    renderCards();
    scheduleNewnessBoundary();
  }, delay);
}

function filteredPapers(): Paper[] {
  const needle = query.trim().toLowerCase();
  return papers
    .filter(paper => selectedJournals.size === 0 || selectedJournals.has(paper.journal))
    .filter(paper => !dateFrom || paper.date >= dateFrom)
    .filter(paper => !dateTo || paper.date <= dateTo)
    .filter(paper => !onlyNew || isNewToday(paper))
    .filter(paper => {
      if (!needle) return true;
      return [
        paper.title || '',
        paper.title ? zhTitleCache.get(paper.title) || '' : '',
        paperDoi(paper) || '',
        paper.journal,
        paper.authors.join(' '),
        paper.date,
      ].some(value => value.toLowerCase().includes(needle));
    })
    .sort((a, b) => {
      if (sort === 'oldest') return a.date.localeCompare(b.date);
      if (sort === 'readers') {
        const aDoi = paperDoi(a);
        const bDoi = paperDoi(b);
        const aReaders = aDoi ? Number(store.readerCounts[aDoi] ?? store.readerCounts[aDoi.toLowerCase()] ?? 0) : 0;
        const bReaders = bDoi ? Number(store.readerCounts[bDoi] ?? store.readerCounts[bDoi.toLowerCase()] ?? 0) : 0;
        return bReaders - aReaders || b.date.localeCompare(a.date);
      }
      return b.date.localeCompare(a.date);
    });
}

function synthesisBadge(paper: Paper): string {
  if (paper.synthesisType === 'formal') return `<span class='tag formal-total'>${escapeHtml(t('formalSynthesis'))}</span>`;
  if (paper.synthesisType === 'total') return `<span class='tag total'>${escapeHtml(t('totalSynthesis'))}</span>`;
  return `<span class='tag method'>${escapeHtml(t('methodology'))}</span>`;
}

function generatedGraphic(paper: Paper, compact = false): string {
  return `<div class='generated-article-graphic${compact ? ' compact' : ''}'><div class='generated-graphic-journal'>${escapeHtml(paper.journal)}</div><div class='generated-graphic-title'>${escapeHtml(visibleTitle(paper))}</div><div class='generated-graphic-status'>${escapeHtml(t('fetching'))}</div></div>`;
}

function tocMarkup(paper: Paper): string {
  const doi = paperDoi(paper);
  if (!doi) return `<div class='toc-slot generated unresolved' data-state='waiting-doi' data-title='${escapeHtml(visibleTitle(paper))}' data-journal='${escapeHtml(paper.journal)}'>${generatedGraphic(paper)}</div>`;
  return `<div class='toc-slot generated' data-state='idle' data-doi='${escapeHtml(doi)}' data-title='${escapeHtml(visibleTitle(paper))}' data-journal='${escapeHtml(paper.journal)}'>${generatedGraphic(paper)}</div>`;
}

function figureMarkup(paper: Paper): string {
  const doi = paperDoi(paper);
  return `<div class='figure-strip-slot loaded generated' data-state='idle'${doi ? ` data-figure-doi='${escapeHtml(doi)}'` : ''} data-title='${escapeHtml(visibleTitle(paper))}' data-journal='${escapeHtml(paper.journal)}'><div class='figure-strip-heading'>${escapeHtml(t('figures'))}</div><div class='figure-strip'><div class='figure-thumb generated-thumb'>${generatedGraphic(paper, true)}</div></div></div>`;
}

function renderCards(): void {
  const gallery = document.querySelector<HTMLElement>('#gallery');
  const count = document.querySelector<HTMLElement>('#resultCount');
  if (!gallery || !count) return;
  const list = filteredPapers();
  count.textContent = String(list.length);
  gallery.innerHTML = list.length ? list.map(paper => {
    const doi = paperDoi(paper);
    const href = doi ? `https://doi.org/${doi}` : (paper.url || '');
    return `<article class='card' data-journal='${escapeHtml(paper.journal)}' data-date='${escapeHtml(paper.date)}' data-authors='${escapeHtml(paper.authors.join('|'))}'><div class='meta'><span class='tag'>${escapeHtml(paper.journal)}</span><span class='tag date'>${escapeHtml(prettyDate(paper.date))}</span>${isNewToday(paper) ? `<span class='tag new'>${escapeHtml(t('new'))}</span>` : ''}${synthesisBadge(paper)}</div><h2 class='title${paper.title ? '' : ' missing'}'>${escapeHtml(visibleTitle(paper))}</h2><div class='authors' title='${escapeHtml(paper.authors.join(', '))}'>${escapeHtml(paper.authors.join(', '))}</div>${tocMarkup(paper)}${figureMarkup(paper)}<div class='cardfoot'><div class='doi'>${escapeHtml(doi || t('doiPending'))}</div>${href ? `<a class='open' href='${escapeHtml(href)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(t('open'))}</a>` : ''}</div></article>`;
  }).join('') : `<div class='empty'>${escapeHtml(t('noResults'))}</div>`;
  restoreMedia();
  scheduleMediaBatch(0);
}

function filterSummary(): string {
  return selectedJournals.size === 0 ? t('allJournals') : `${selectedJournals.size} ${t('journalsSelected')}`;
}

function mount(): void {
  const targetJournals = TARGET_JOURNALS.map(journal => journal.name);
  const targetSet = new Set(targetJournals);
  const extraJournals = [...new Set(papers.map(paper => paper.journal).filter(journal => !targetSet.has(journal)))].sort();
  const journals = [...targetJournals, ...extraJournals];
  const dates = papers.map(paper => paper.date).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  const earliest = dates[0] || '';
  const latest = dates[dates.length - 1] || '';
  document.title = t('title');
  app.innerHTML = `<main class='shell'><section class='hero'><div class='hero-top'><div class='eyebrow'>${escapeHtml(t('eyebrow'))}</div><div class='lang-switch' role='group'><button class='lang-button${language === 'zh' ? ' active' : ''}' data-lang='zh' type='button'>中文</button><button class='lang-button${language === 'en' ? ' active' : ''}' data-lang='en' type='button'>EN</button></div></div><h1>${escapeHtml(t('title'))}</h1><p class='lede'>${escapeHtml(t('lede'))}</p><div class='stats'><div class='stat'><strong>${papers.length}</strong><span>${escapeHtml(t('total'))}</span></div><div class='stat'><strong>${journals.length}</strong><span>${escapeHtml(t('journals'))}</span></div><div class='stat'><strong>${escapeHtml(latest)}</strong><span>${escapeHtml(t('latest'))}</span></div></div></section><section class='toolbar'><input id='search' class='search' type='search' value='${escapeHtml(query)}' placeholder='${escapeHtml(t('search'))}'><details class='journal-picker'><summary><span id='journalSummary'>${escapeHtml(filterSummary())}</span><span class='journal-chevron'>⌄</span></summary><div class='journal-menu'><button class='journal-clear${selectedJournals.size === 0 ? ' active' : ''}' data-journal-clear type='button'>${escapeHtml(t('allJournals'))}</button>${journals.map(journal => `<label class='journal-option'><input data-journal-option type='checkbox' value='${escapeHtml(journal)}'${selectedJournals.has(journal) ? ' checked' : ''}><span>${escapeHtml(journal)}</span></label>`).join('')}</div></details><select id='sort'><option value='newest'${sort === 'newest' ? ' selected' : ''}>${escapeHtml(t('newest'))}</option><option value='oldest'${sort === 'oldest' ? ' selected' : ''}>${escapeHtml(t('oldest'))}</option><option value='readers'${sort === 'readers' ? ' selected' : ''}>${escapeHtml(t('mostRead'))}</option></select><label class='check'><input id='newOnly' type='checkbox'${onlyNew ? ' checked' : ''}>${escapeHtml(t('onlyNew'))}</label></section><section class='range-filter' aria-label='${escapeHtml(t('clearFilters'))}'><label class='date-field'><span>${escapeHtml(t('dateFrom'))}</span><input id='dateFrom' type='date' value='${escapeHtml(dateFrom)}'${earliest ? ` min='${escapeHtml(earliest)}'` : ''}${(dateTo || latest) ? ` max='${escapeHtml(dateTo || latest)}'` : ''}></label><label class='date-field'><span>${escapeHtml(t('dateTo'))}</span><input id='dateTo' type='date' value='${escapeHtml(dateTo)}'${(dateFrom || earliest) ? ` min='${escapeHtml(dateFrom || earliest)}'` : ''}${latest ? ` max='${escapeHtml(latest)}'` : ''}></label><button id='clearCustomFilters' class='clear-custom-filters' type='button'${selectedJournals.size === 0 && !dateFrom && !dateTo ? ' disabled' : ''}>${escapeHtml(t('clearFilters'))}</button></section><div class='resultline'><div><strong id='resultCount'>0</strong> ${escapeHtml(t('shown'))}</div></div><section id='gallery' class='gallery' aria-live='polite'></section><div class='footer'>Organic Synthesis Literature Gallery · Cloudflare staging</div></main>`;
  mountUserShell(app, language);

  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.lang;
    if (next !== 'zh' && next !== 'en') return;
    language = next;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* optional */ }
    mount();
  }));
  journalPickerAbort?.abort();
  journalPickerAbort = new AbortController();
  const journalPicker = document.querySelector<HTMLDetailsElement>('.journal-picker');
  if (journalPicker) {
    document.addEventListener('pointerdown', event => {
      if (!journalPicker.open) return;
      const target = event.target;
      if (target instanceof Node && !journalPicker.contains(target)) journalPicker.open = false;
    }, { capture: true, signal: journalPickerAbort.signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && journalPicker.open) {
        journalPicker.open = false;
        journalPicker.querySelector<HTMLElement>('summary')?.focus();
      }
    }, { signal: journalPickerAbort.signal });
  }

  document.querySelector<HTMLInputElement>('#search')?.addEventListener('input', event => {
    query = (event.target as HTMLInputElement).value;
    renderCards();
  });
  document.querySelector<HTMLSelectElement>('#sort')?.addEventListener('change', event => {
    const value = (event.target as HTMLSelectElement).value;
    sort = value === 'oldest' || value === 'readers' ? value : 'newest';
    renderCards();
  });
  document.querySelector<HTMLInputElement>('#newOnly')?.addEventListener('change', event => {
    onlyNew = (event.target as HTMLInputElement).checked;
    renderCards();
  });
  document.querySelector<HTMLButtonElement>('[data-journal-clear]')?.addEventListener('click', () => {
    selectedJournals.clear();
    persistFilterPreferences();
    mount();
  });
  document.querySelectorAll<HTMLInputElement>('[data-journal-option]').forEach(input => input.addEventListener('change', () => {
    if (input.checked) selectedJournals.add(input.value);
    else selectedJournals.delete(input.value);
    persistFilterPreferences();
    const summary = document.querySelector<HTMLElement>('#journalSummary');
    if (summary) summary.textContent = filterSummary();
    renderCards();
  }));
  document.querySelector<HTMLInputElement>('#dateFrom')?.addEventListener('change', event => {
    dateFrom = (event.target as HTMLInputElement).value;
    if (dateFrom && dateTo && dateFrom > dateTo) dateTo = dateFrom;
    persistFilterPreferences();
    mount();
  });
  document.querySelector<HTMLInputElement>('#dateTo')?.addEventListener('change', event => {
    dateTo = (event.target as HTMLInputElement).value;
    if (dateFrom && dateTo && dateTo < dateFrom) dateFrom = dateTo;
    persistFilterPreferences();
    mount();
  });
  document.querySelector<HTMLButtonElement>('#clearCustomFilters')?.addEventListener('click', () => {
    selectedJournals.clear();
    dateFrom = '';
    dateTo = '';
    persistFilterPreferences();
    mount();
  });

  renderCards();
  scheduleInventory();
  scheduleNewnessBoundary();
}

function visibleMediaTargets(): Array<{ doi: string; toc: HTMLElement; figures: HTMLElement | null }> {
  const result: Array<{ doi: string; toc: HTMLElement; figures: HTMLElement | null }> = [];
  for (const slot of document.querySelectorAll<HTMLElement>('.toc-slot[data-doi]')) {
    const doi = normalizeDoi(slot.dataset.doi);
    const card = slot.closest<HTMLElement>('.card');
    if (!doi || !card) continue;
    const rect = card.getBoundingClientRect();
    if (rect.bottom < -260 || rect.top > innerHeight + 900) continue;
    result.push({ doi, toc: slot, figures: card.querySelector<HTMLElement>('.figure-strip-slot[data-figure-doi]') });
    if (result.length >= 14) break;
  }
  return result;
}

function restoreMedia(): void {
  const now = Date.now();
  for (const target of visibleMediaTargets()) {
    const key = target.doi.toLowerCase();
    const toc = tocCache.get(key);
    if (toc && now - toc.fetchedAt < MEDIA_TTL && toc.result.available) renderToc(target.toc, toc.result);
    const figures = figureCache.get(key);
    if (target.figures && figures && now - figures.fetchedAt < MEDIA_TTL && figures.result.available) renderFigures(target.figures, figures.result);
  }
}

function scheduleMediaBatch(delay = 30): void {
  if (batchTimer !== null) clearTimeout(batchTimer);
  batchTimer = window.setTimeout(() => {
    batchTimer = null;
    void hydrateMediaBatch();
  }, delay);
}

async function hydrateMediaBatch(): Promise<void> {
  if (batchRunning) {
    batchAgain = true;
    return;
  }
  const now = Date.now();
  const targets = visibleMediaTargets();
  const dois = [...new Set(targets.flatMap(target => {
    const key = target.doi.toLowerCase();
    const tocReady = tocCache.get(key);
    const figureReady = figureCache.get(key);
    if (tocReady && figureReady && now - tocReady.fetchedAt < MEDIA_TTL && now - figureReady.fetchedAt < MEDIA_TTL) return [];
    if (now - (mediaCheckedAt.get(key) || 0) < 20_000) return [];
    return [target.doi];
  }))];
  if (!dois.length) return;
  batchRunning = true;
  try {
    const response = await api.post('/api/media/batch', { dois });
    const payload = response.data as { items?: MediaBatchItem[] };
    for (const item of payload.items || []) {
      const doi = normalizeDoi(item.doi);
      if (!doi) continue;
      const key = doi.toLowerCase();
      mediaCheckedAt.set(key, Date.now());
      tocCache.set(key, { result: item.toc, fetchedAt: Date.now() });
      figureCache.set(key, { result: item.figures, fetchedAt: Date.now() });
      document.querySelectorAll<HTMLElement>('.toc-slot[data-doi]').forEach(slot => {
        if ((slot.dataset.doi || '').toLowerCase() === key) renderToc(slot, item.toc);
      });
      document.querySelectorAll<HTMLElement>('.figure-strip-slot[data-figure-doi]').forEach(slot => {
        if ((slot.dataset.figureDoi || '').toLowerCase() === key) renderFigures(slot, item.figures);
      });
    }
  } catch {
    // Generated fallbacks remain visible.
  } finally {
    batchRunning = false;
    if (batchAgain) {
      batchAgain = false;
      scheduleMediaBatch(0);
    }
  }
}

function renderToc(slot: HTMLElement, result: TocResponse): void {
  if (!result.available || !result.imageUrl) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toc-link';
  const masterImageUrl = result.primary?.masterImageUrl || result.primary?.imageUrl || result.imageUrl;
  const cardImageUrl = result.primary?.thumbnailImageUrl || result.primary?.previewImageUrl || result.imageUrl;
  button.dataset.masterSrc = masterImageUrl;
  const image = new Image();
  image.src = cardImageUrl;
  image.alt = result.primary?.label || t('toc');
  image.className = 'toc-image';
  image.loading = 'lazy';
  image.decoding = 'async';
  const label = document.createElement('span');
  label.className = 'toc-label';
  label.textContent = result.primary?.label || (result.reason === 'figure1_fallback'
    ? 'Figure 1'
    : result.reason === 'pdf_primary_fallback'
      ? 'PDF Primary Visual'
      : result.reason?.startsWith('figure_fallback:')
        ? result.reason.slice('figure_fallback:'.length)
        : t('toc'));
  button.append(image, label);
  button.addEventListener('click', () => openLightbox(masterImageUrl, label.textContent || t('toc')));
  image.addEventListener('load', () => {
    slot.replaceChildren(button);
    slot.classList.remove('generated');
    slot.classList.add('loaded');
    slot.dataset.state = 'done';
  });
}

function renderFigures(slot: HTMLElement, result: FigureResponse): void {
  if (!result.available || !result.figures.length) {
    const doi = normalizeDoi(slot.dataset.figureDoi);
    const remembered = doi ? tocCache.get(doi.toLowerCase())?.result : undefined;
    if (remembered?.available && remembered.imageUrl) renderFigureFallback(slot, remembered.imageUrl);
    return;
  }
  const heading = document.createElement('div');
  heading.className = 'figure-strip-heading';
  heading.textContent = t('figures');
  const strip = document.createElement('div');
  strip.className = 'figure-strip';
  for (const figure of result.figures) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'figure-thumb';
    const image = new Image();
    image.src = figure.imageUrl;
    image.alt = figure.label;
    image.loading = 'lazy';
    image.decoding = 'async';
    const label = document.createElement('span');
    label.textContent = figure.label;
    button.append(image, label);
    button.addEventListener('click', () => openLightbox(figure.imageUrl, figure.label, figure.caption));
    strip.appendChild(button);
  }
  slot.replaceChildren(heading, strip);
  slot.classList.remove('generated');
  slot.classList.add('loaded');
  slot.dataset.state = 'done';
}

function renderFigureFallback(slot: HTMLElement, imageUrl: string): void {
  const heading = document.createElement('div');
  heading.className = 'figure-strip-heading';
  heading.textContent = t('figures');
  const strip = document.createElement('div');
  strip.className = 'figure-strip';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'figure-thumb';
  const image = new Image();
  image.src = imageUrl;
  image.alt = t('articleGraphic');
  const label = document.createElement('span');
  label.textContent = t('articleGraphic');
  button.append(image, label);
  button.addEventListener('click', () => openLightbox(imageUrl, t('articleGraphic')));
  strip.appendChild(button);
  slot.replaceChildren(heading, strip);
  slot.classList.add('loaded');
  slot.dataset.state = 'fallback';
}

function openLightbox(imageUrl: string, alt: string, caption?: string): void {
  document.querySelector('.image-lightbox')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  const panel = document.createElement('div');
  panel.className = 'image-lightbox-panel';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'image-lightbox-close';
  close.textContent = '×';
  close.setAttribute('aria-label', t('close'));
  const image = new Image();
  image.className = 'image-lightbox-image';
  image.src = imageUrl;
  image.alt = alt;
  panel.append(close, image);
  if (caption) {
    const text = document.createElement('div');
    text.className = 'image-lightbox-caption';
    text.textContent = caption;
    panel.appendChild(text);
  }
  overlay.appendChild(panel);
  const dismiss = (): void => overlay.remove();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  document.body.appendChild(overlay);
}

function stageBridgeGaps(inventory: MediaInventoryResponse): void {
  const gaps = inventory.items
    .filter(item => item.status !== 'complete' || item.suspiciousToc || Number(item.figureCount || 0) < 2)
    .sort((a, b) => Number(b.suspiciousToc) - Number(a.suspiciousToc) || Number(a.figureCount || 0) - Number(b.figureCount || 0));
  let holder = document.getElementById('bridge-gap-staging');
  if (!gaps.length) {
    holder?.remove();
    if (bridgeStageTimer !== null) clearTimeout(bridgeStageTimer);
    bridgeStageTimer = null;
    return;
  }
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'bridge-gap-staging';
    holder.setAttribute('aria-hidden', 'true');
    Object.assign(holder.style, { position: 'fixed', left: '-10000px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', overflow: 'hidden' });
    document.body.appendChild(holder);
  }
  const size = Math.min(12, gaps.length);
  bridgeStageCursor %= gaps.length;
  holder.innerHTML = Array.from({ length: size }, (_, index) => {
    const item = gaps[(bridgeStageCursor + index) % gaps.length];
    return `<article class='card bridge-staging-card'><div class='toc-slot pending' data-doi='${escapeHtml(item.doi)}'></div></article>`;
  }).join('');
  if (bridgeStageTimer !== null) clearTimeout(bridgeStageTimer);
  bridgeStageTimer = window.setTimeout(() => {
    bridgeStageCursor = (bridgeStageCursor + size) % gaps.length;
    inventoryFingerprint = '';
    scheduleInventory();
  }, 22_000);
}

function scheduleInventory(): void {
  const dois = [...new Set(papers.map(paperDoi).filter((doi): doi is string => Boolean(doi)).map(doi => doi.toLowerCase()))].sort();
  const fingerprint = dois.join('|');
  if (!dois.length || fingerprint === inventoryFingerprint) return;
  inventoryFingerprint = fingerprint;
  void api.post('/api/media/inventory', { dois }).then(response => {
    const inventory = response.data as MediaInventoryResponse;
    stageBridgeGaps(inventory);
  }).catch(() => {
    inventoryFingerprint = '';
  });
}

async function resolveTitles(): Promise<void> {
  const requests = papers.flatMap((paper, index) => {
    const doi = paperDoi(paper);
    if (paper.title && doi) return [];
    return [{
      key: String(index),
      doi: doi || undefined,
      url: paper.url || undefined,
      title: paper.title || undefined,
      journal: paper.journal,
      date: paper.date,
    }];
  });
  for (let offset = 0; offset < requests.length; offset += 40) {
    const batch = requests.slice(offset, offset + 40);
    try {
      const response = await api.post('/api/paper-titles/resolve', { papers: batch });
      const payload = response.data as { papers?: Array<{ key?: unknown; title?: unknown; doi?: unknown }> };
      let changed = false;
      for (const item of payload.papers || []) {
        if (typeof item.key !== 'string' || typeof item.title !== 'string') continue;
        const index = Number(item.key);
        const paper = Number.isInteger(index) ? papers[index] : undefined;
        if (!paper) continue;
        const beforeKey = titleCacheKey(paper);
        paper.title = item.title.trim();
        if (!paperDoi(paper) && typeof item.doi === 'string' && normalizeDoi(item.doi)) paper.doi = item.doi;
        const entry = { title: paper.title, doi: paperDoi(paper) || undefined };
        resolvedTitleCache.set(beforeKey, entry);
        resolvedTitleCache.set(titleCacheKey(paper), entry);
        changed = true;
      }
      if (changed) {
        persistCaches();
        mount();
      }
    } catch {
      // The next page load or second pass will retry.
    }
  }
}

async function loadTranslations(): Promise<void> {
  const missing = [...new Set(papers.map(paper => paper.title).filter((title): title is string => Boolean(title)))].filter(title => !zhTitleCache.has(title));
  for (let offset = 0; offset < missing.length; offset += 100) {
    try {
      const response = await api.post('/api/title-translations/zh', { titles: missing.slice(offset, offset + 100) });
      const payload = response.data as { translations?: Array<{ title?: unknown; zh?: unknown }> };
      for (const item of payload.translations || []) {
        if (typeof item.title === 'string' && typeof item.zh === 'string' && item.zh.trim()) zhTitleCache.set(item.title, item.zh.trim());
      }
    } catch {
      // English titles remain valid fallback.
    }
  }
  persistCaches();
  if (language === 'zh') renderCards();
}

async function loadStaticPapers(): Promise<Paper[]> {
  const [encodedText, total, manual, audit] = await Promise.all([
    fetch('./papers.gz.b64').then(async response => {
      if (!response.ok) throw new Error(`papers.gz.b64 HTTP ${response.status}`);
      return response.text();
    }),
    fetch('./total-synthesis.json').then(response => response.ok ? response.json() as Promise<{ papers?: Paper[] }> : { papers: [] as Paper[] }),
    fetch('./manual-supplement.json').then(response => response.ok ? response.json() as Promise<{ papers?: Paper[] }> : { papers: [] as Paper[] }),
    fetch('./final-audit-supplement.json').then(response => response.ok ? response.json() as Promise<{ papers?: Paper[] }> : { papers: [] as Paper[] }),
  ]);
  const bytes = Uint8Array.from(atob(encodedText.trim()), char => char.charCodeAt(0));
  const Decompressor = (window as unknown as { DecompressionStream: new (format: string) => TransformStream }).DecompressionStream;
  if (!Decompressor) throw new Error('Browser does not support gzip decompression.');
  const stream = new Blob([bytes]).stream().pipeThrough(new Decompressor('gzip'));
  const base = JSON.parse(await new Response(stream).text()) as Paper[];
  return [
    ...base.map(normalizePaper),
    ...(total.papers || []).map(normalizePaper),
    ...(manual.papers || []).map(normalizePaper),
    ...(audit.papers || []).map(normalizePaper),
  ];
}

async function load(): Promise<void> {
  try {
    const staticPapers = await loadStaticPapers();
    papers = mergePapers([], staticPapers).filter(paper => !isExcludedDoi(paperDoi(paper)));
    applyResolvedTitles();
    try {
      const response = await api.get('/api/literature/supplement');
      const supplement = response.data as { papers?: Paper[] };
      papers = mergePapers(papers, (supplement.papers || []).map(normalizePaper)).filter(paper => !isExcludedDoi(paperDoi(paper)));
    } catch {
      // Static snapshot remains usable if the API is temporarily unavailable.
    }
    applyResolvedTitles();
    mount();
    void resolveTitles().then(() => resolveTitles());
    void loadTranslations();
  } catch (error) {
    app.innerHTML = `<div class='error'><strong>${escapeHtml(t('loadError'))}</strong><br>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

window.addEventListener('scroll', () => scheduleMediaBatch(40), { passive: true });
window.addEventListener('resize', () => scheduleMediaBatch(60));
window.addEventListener('gallery-assets-updated', event => {
  const detail = event instanceof CustomEvent ? event.detail as { doi?: unknown } : undefined;
  const doi = normalizeDoi(typeof detail?.doi === 'string' ? detail.doi : null);
  if (!doi) return;
  const key = doi.toLowerCase();
  tocCache.delete(key);
  figureCache.delete(key);
  mediaCheckedAt.delete(key);
  scheduleMediaBatch(0);
});

void load();
