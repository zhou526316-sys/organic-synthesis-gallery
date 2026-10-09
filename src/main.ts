import { api } from './platform-api';
import { chineseTitle, validChineseTitle } from '../shared/chinese-title-overrides.js';
import './styles.css';
import './pdf-vault/card-entry.css';
import { mountUserShell } from './user-shell';
import { beijingDate, earliestAddedDate, isExcludedDoi, isNewToday as isNewTodayDate, msUntilNextBeijingDay, validAddedDate } from '../shared/literature-policy.js';
import { TARGET_JOURNALS } from '../shared/literature-journals.js';
import { compareDailyGalleryCards } from '../shared/daily-gallery-order.mjs';
import { correctedPublisherDateForDisplay } from '../shared/publisher-date-display-fix.mjs';
import { RESULT_WINDOW_SIZE as DESKTOP_RESULT_WINDOW_SIZE, MOBILE_RESULT_WINDOW_SIZE, resultPaginationItems, resultWindowState } from '../shared/result-window.js';
import { store } from './user-ui/shared';
import { PublishedCatalogClient, loadPublishedHotFallback } from '../architecture/published-reader.mjs';
import {
  fetchLiteratureCatalogView,
  literatureCatalogIndexedReadActive,
  type LiteratureCatalogViewRequest,
} from './literature-catalog-view';

interface Paper {
  journal: string;
  title: string | null;
  titleZh?: string;
  doi: string | null;
  date: string;
  url: string | null;
  new: boolean;
  addedDate?: string;
  dateUnverified?: boolean;
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

interface WechatEditionManifest {
  id: string;
  date: string;
  title?: string;
  featuredDoi: string;
  dois: string[];
}

type Language = 'zh' | 'en';

const copy = {
  zh: {
    title: '有机合成文献库',
    eyebrow: '有机合成方法学与全合成文献',
    lede: '聚合指定期刊的有机合成方法学与全合成论文；日期采用首次在线发表日期。',
    latest: '最新收录日期',
    search: '搜索标题、DOI、期刊或日期…',
    allJournals: '全部期刊',
    journalsSelected: '个期刊已选',
    journalsHidden: '个期刊已隐藏',
    hideJournal: '不看',
    restoreJournal: '恢复',
    newest: '最新优先',
    oldest: '最早优先',
    mostRead: '阅读人数最多',
    onlyNew: '仅新增',
    dateFrom: '起始日期',
    dateTo: '结束日期',
    clearFilters: '清除期刊/日期筛选',
    recentScope: '近三个月',
    currentScope: '当前筛选',
    recentScopeTitle: '默认首页按首次在线发表日期显示滚动近三个月；最近七天新增但发表日期待核实的论文也展示在首页，不将收录日期冒充发表日期。',
    limitedRead: '当前仅使用已验证的近三个月安全数据；历史 DOI、全库搜索和历史日期检索暂不可用，当前结果不代表全库无匹配。',
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
    share: '分享',
  },
  en: {
    title: 'Organic Synthesis Literature Gallery',
    eyebrow: 'Organic synthesis methodology and total synthesis',
    lede: 'Curated organic synthesis methodology and total synthesis papers from selected journals; dates use first-online publication.',
    latest: 'Latest first-online date',
    search: 'Search title, DOI, journal or date…',
    allJournals: 'All journals',
    journalsSelected: 'journals selected',
    journalsHidden: 'journals hidden',
    hideJournal: 'Hide',
    restoreJournal: 'Restore',
    newest: 'Newest first',
    oldest: 'Oldest first',
    mostRead: 'Most readers',
    onlyNew: 'Only new',
    dateFrom: 'From date',
    dateTo: 'To date',
    clearFilters: 'Clear journal/date filters',
    recentScope: 'Last 3 months',
    currentScope: 'Current filter',
    recentScopeTitle: 'The default landing view uses a rolling three-calendar-month window by first-online date, plus recently added records with unverified publication dates. Inclusion dates are not represented as publication dates.',
    limitedRead: 'Only the verified rolling three-month safety set is available right now. Archive DOI lookup, global search, and historical date retrieval are unavailable, so an empty result is not an all-time negative result.',
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
    share: 'Share',
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
let activeEdition: WechatEditionManifest | null = null;
let editionAutoScrolled = false;
let query = '';
let sort: 'newest' | 'oldest' | 'readers' = 'newest';
let onlyNew = false;
const selectedJournals = new Set<string>();
const excludedJournals = new Set<string>();
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
let mobileInitialMediaWave = true;
let pdfVaultRefreshTimer: number | null = null;
let pdfVaultRefreshGeneration = 0;
let pdfVaultCardsModule: typeof import('./pdf-vault/cards.mjs') | null = null;
let pdfVaultCardsModulePromise: Promise<typeof import('./pdf-vault/cards.mjs')> | null = null;
let inventoryFingerprint = '';
let inventoryTimer: number | null = null;
let bridgeStageTimer: number | null = null;
let bridgeStageCursor = 0;
let newnessTimer: number | null = null;
let journalPickerAbort: AbortController | null = null;
let architectureClient: PublishedCatalogClient | null = null;
let architectureFallbackActive = false;
let architectureBootstrapPending = false;
let architectureReadLimited = false;
let architectureLandingPapers: Paper[] = [];
let hotBootstrapTotal = 0;
let hotFullLoadPromise: Promise<void> | null = null;
let architectureMemberDois: string[] | null = null;
let architectureEarliestDate = '';
let latestCollectionDate = '';
let architectureRefreshTimer: number | null = null;
let architectureRefreshSerial = 0;

function resultWindowSize(): number {
  return window.matchMedia('(max-width: 680px)').matches
    ? MOBILE_RESULT_WINDOW_SIZE
    : DESKTOP_RESULT_WINDOW_SIZE;
}


async function loadPdfVaultCardsModule(): Promise<typeof import('./pdf-vault/cards.mjs')> {
  if (pdfVaultCardsModule) return pdfVaultCardsModule;
  pdfVaultCardsModulePromise ||= import('./pdf-vault/cards.mjs');
  try {
    pdfVaultCardsModule = await pdfVaultCardsModulePromise;
    return pdfVaultCardsModule;
  } catch (error) {
    pdfVaultCardsModulePromise = null;
    throw error;
  }
}

function schedulePdfVaultCardsRefresh(container: HTMLElement, lang: Language): void {
  const generation = ++pdfVaultRefreshGeneration;
  if (pdfVaultRefreshTimer !== null) window.clearTimeout(pdfVaultRefreshTimer);
  const mobile = window.matchMedia('(max-width: 680px)').matches;
  const refresh = (module: typeof import('./pdf-vault/cards.mjs')): void => {
    if (generation !== pdfVaultRefreshGeneration || !container.isConnected) return;
    module.refreshPdfVaultCards(container, lang);
  };
  // Desktop preserves the existing stable layout timing by loading this module
  // before mount. Mobile keeps account/local-PDF state out of the first TOC path.
  if (!mobile && pdfVaultCardsModule) {
    refresh(pdfVaultCardsModule);
    return;
  }
  pdfVaultRefreshTimer = window.setTimeout(() => {
    pdfVaultRefreshTimer = null;
    void loadPdfVaultCardsModule().then(refresh).catch(() => {
      // A deferred enhancement must never block the literature/media reader.
    });
  }, mobile ? 700 : 0);
}

let resultWindowPage = 1;
let lastResultWindowSize = resultWindowSize();
let indexedViewCapability: boolean | null = null;
let indexedViewSerial = 0;
let indexedViewState: {
  requestKey: string;
  matched: number;
  page: number;
  limit: number;
  cursors: string[];
  hasMore: boolean;
  nextCursor: string | null;
  papers: Paper[];
  loading: boolean;
} | null = null;

store.addEventListener('counts', () => {
  if (sort === 'readers') renderCards();
});

app.addEventListener('gallery-corpus-query', event => {
  const detail = event instanceof CustomEvent ? event.detail as { query?: unknown } : undefined;
  query = typeof detail?.query === 'string' ? detail.query : '';
  resetResultWindow();
  renderCards();
  scheduleArchitectureCorpusRefresh();
});

hydrateFilterPreferences();
hydrateBrowserCaches();
document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
window.addEventListener('gallery-title-cache-updated', () => {
  if (hydrateChineseTitleCache() && language === 'zh') renderCards();
});

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
      excludedJournals?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
    } | null;
    if (!saved) return;
    if (Array.isArray(saved.journals)) {
      for (const journal of saved.journals) {
        if (typeof journal === 'string' && journal.trim()) selectedJournals.add(journal.trim());
      }
    }
    if (Array.isArray(saved.excludedJournals)) {
      for (const journal of saved.excludedJournals) {
        if (typeof journal === 'string' && journal.trim()) excludedJournals.add(journal.trim());
      }
    }
    for (const journal of excludedJournals) selectedJournals.delete(journal);
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
      excludedJournals: [...excludedJournals].sort(),
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

function hydrateChineseTitleCache(): boolean {
  let changed = false;
  try {
    const zh = JSON.parse(localStorage.getItem(ZH_CACHE_KEY) || '{}') as Record<string, unknown>;
    for (const [title, value] of Object.entries(zh)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const normalized = value.trim();
      if (zhTitleCache.get(title) === normalized) continue;
      zhTitleCache.set(title, normalized);
      changed = true;
    }
  } catch {
    // Ignore malformed cache.
  }
  return changed;
}

function hydrateBrowserCaches(): void {
  hydrateChineseTitleCache();
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

function sharedDoiFromLocation(): string | null {
  try {
    return normalizeDoi(new URL(window.location.href).searchParams.get('doi'));
  } catch {
    return null;
  }
}

function editionIdFromLocation(): string | null {
  try {
    const value = new URL(window.location.href).searchParams.get('edition')?.trim() || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function loadEditionManifest(): Promise<WechatEditionManifest | null> {
  const editionId = editionIdFromLocation();
  if (!editionId) return null;
  try {
    const response = await fetch(`./wechat-editions/${encodeURIComponent(editionId)}.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const raw = await response.json() as Partial<WechatEditionManifest>;
    const featuredDoi = normalizeDoi(typeof raw.featuredDoi === 'string' ? raw.featuredDoi : null);
    const dois = Array.isArray(raw.dois)
      ? raw.dois.map(value => normalizeDoi(typeof value === 'string' ? value : null)).filter((value): value is string => Boolean(value))
      : [];
    if (!featuredDoi || !dois.length) return null;
    const ordered = [featuredDoi, ...dois.filter(doi => doi.toLowerCase() !== featuredDoi.toLowerCase())];
    return {
      id: editionId,
      date: typeof raw.date === 'string' ? raw.date : editionId,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      featuredDoi,
      dois: [...new Set(ordered.map(doi => doi.toLowerCase()))],
    };
  } catch {
    return null;
  }
}

function editionDoiSet(): Set<string> {
  return new Set((activeEdition?.dois || []).map(doi => doi.toLowerCase()));
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
  const normalized: Paper = {
    ...paper,
    journal: canonicalJournal(paper.journal),
    title: pendingTitle(paper.title) ? null : paper.title?.trim() || null,
    doi: normalizeDoi(paper.doi),
    addedDate: validAddedDate(paper.addedDate) || undefined,
    authors: Array.isArray(paper.authors)
      ? paper.authors.filter((author): author is string => typeof author === 'string').map(author => author.trim()).filter(Boolean)
      : [],
  };
  // The approved publisher date is corrected for Gallery presentation now;
  // fixed-slot production records and publisher provenance remain untouched.
  return correctedPublisherDateForDisplay(normalized);
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
      if (validChineseTitle(paper.titleZh)) existing.titleZh = paper.titleZh;
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

function prettyDate(value: string, unverified = false): string {
  const unknown = language === 'zh' ? '发表日期待核实' : 'Publication date unverified';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return unknown;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return unknown;
  const shown = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date);
  return unverified ? `${shown} ${language === 'zh' ? '（待核实）' : '(unverified)'}` : shown;
}

function sortableDate(paper: Paper): string {
  const verified = /^\d{4}-\d{2}-\d{2}$/.test(paper.date)
    && paper.date <= beijingDate() && paper.dateUnverified !== true;
  return verified ? paper.date : (validAddedDate(paper.addedDate) || paper.date || '');
}

function visibleTitle(paper: Paper): string {
  if (!paper.title) return t('titlePending');
  if (language === 'zh') return chineseTitle(paper, zhTitleCache) || paper.title;
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
  const filtered = papers
    .filter(paper => !excludedJournals.has(paper.journal))
    .filter(paper => selectedJournals.size === 0 || selectedJournals.has(paper.journal))
    .filter(paper => !dateFrom || paper.date >= dateFrom)
    .filter(paper => !dateTo || paper.date <= dateTo)
    .filter(paper => !onlyNew || isNewToday(paper))
    .filter(paper => {
      if (!needle) return true;
      return [
        paper.title || '',
        chineseTitle(paper, zhTitleCache),
        paperDoi(paper) || '',
        paper.journal,
        paper.authors.join(' '),
        paper.date,
      ].some(value => value.toLowerCase().includes(needle));
    })
    .sort((a, b) => {
      if (sort === 'oldest') return sortableDate(a).localeCompare(sortableDate(b));
      if (sort === 'readers') {
        const aDoi = paperDoi(a);
        const bDoi = paperDoi(b);
        const aRaw = aDoi ? (store.readerCounts[aDoi] ?? store.readerCounts[aDoi.toLowerCase()]) : undefined;
        const bRaw = bDoi ? (store.readerCounts[bDoi] ?? store.readerCounts[bDoi.toLowerCase()]) : undefined;
        const aKnown = typeof aRaw === 'number';
        const bKnown = typeof bRaw === 'number';
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (!aKnown && !bKnown) return sortableDate(b).localeCompare(sortableDate(a));
        return Number(bRaw) - Number(aRaw) || sortableDate(b).localeCompare(sortableDate(a));
      }
      // In the default newest view, group by the actual Gallery admission
      // date, then show Nature/Science, their sister journals, JACS/Angew/Chem,
      // ACS Catalysis, and the remaining journals. Publication dates displayed
      // on cards remain untouched.
      return compareDailyGalleryCards(a, b);
    });

  if (activeEdition?.dois.length) {
    const ordered = activeEdition.dois.flatMap(doi => {
      const paper = papers.find(item => paperDoi(item)?.toLowerCase() === doi.toLowerCase());
      return paper ? [paper] : [];
    });
    if (ordered.length) {
      const selected = new Set(ordered);
      return [...ordered, ...filtered.filter(paper => !selected.has(paper))];
    }
  }

  const sharedDoi = sharedDoiFromLocation()?.toLowerCase();
  if (!sharedDoi) return filtered;
  const sharedPaper = papers.find(paper => paperDoi(paper)?.toLowerCase() === sharedDoi);
  if (!sharedPaper) return filtered;
  return [sharedPaper, ...filtered.filter(paper => paper !== sharedPaper)];
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

function syncLiteratureDoiRegistry(): void {
  const complete = Boolean(architectureMemberDois);
  const fallbackCount = architectureFallbackActive && hotBootstrapTotal > 0
    ? hotBootstrapTotal
    : new Set(
        papers
          .map(paperDoi)
          .filter((doi): doi is string => Boolean(doi))
          .map(doi => doi.toLowerCase())
      ).size;
  const count = architectureMemberDois ? architectureMemberDois.length : fallbackCount;
  let node = document.getElementById('gallery-literature-doi-registry') as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement('script');
    node.id = 'gallery-literature-doi-registry';
    node.type = 'application/json';
    document.body.appendChild(node);
  }
  node.textContent = JSON.stringify({
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    scope: architectureMemberDois ? 'all-time' : (architectureFallbackActive ? 'hot-fallback' : 'current-corpus'),
    complete,
    count,
    materializedDois: false,
  });
}

function resetResultWindow(): void {
  resultWindowPage = 1;
  indexedViewSerial += 1;
  if (indexedViewState && architectureLandingPapers.length) setArchitectureCorpus(architectureLandingPapers);
  indexedViewState = null;
}

function resultScopeIsDefaultRecent(): boolean {
  return Boolean(
    (architectureClient || architectureFallbackActive)
    && !query.trim()
    && !onlyNew
    && selectedJournals.size === 0
    && excludedJournals.size === 0
    && !dateFrom
    && !dateTo
    && !sharedDoiFromLocation()
  );
}

function paginationButtonsMarkup(currentPage: number, totalPages: number, loading: boolean): string {
  const compact = window.matchMedia('(max-width: 680px)').matches;
  return resultPaginationItems(currentPage, totalPages, compact).map(item => {
    if (item === 'ellipsis') return "<span class='result-page-ellipsis' aria-hidden='true'>…</span>";
    const current = item === currentPage;
    const label = language === 'zh' ? `第 ${item} 页` : `Page ${item}`;
    return `<button class='result-page-number${current ? ' current' : ''}' type='button' data-result-page='${item}' aria-label='${escapeHtml(label)}'${current ? " aria-current='page'" : ''}${current || loading ? ' disabled' : ''}>${item}</button>`;
  }).join('');
}

function renderCards(): void {
  syncLiteratureDoiRegistry();
  const gallery = document.querySelector<HTMLElement>('#gallery');
  const count = document.querySelector<HTMLElement>('#resultCount');
  const scope = document.querySelector<HTMLElement>('#resultScopeLabel');
  if (!gallery || !count) return;
  const indexed = indexedViewState;
  const list = indexed ? indexed.papers : filteredPapers();
  const windowSize = indexed?.limit || resultWindowSize();
  const localTotal = !indexed && resultScopeIsDefaultRecent() && hotBootstrapTotal > list.length
    ? hotBootstrapTotal
    : list.length;
  const localWindow = indexed ? null : resultWindowState(localTotal, resultWindowPage, windowSize);
  if (localWindow) resultWindowPage = localWindow.page;
  const renderedList = indexed ? list : list.slice(localWindow!.start, Math.min(localWindow!.end, list.length));
  const totalMatched = indexed ? indexed.matched : localTotal;
  const currentPage = indexed ? indexed.page : localWindow!.page;
  const totalPages = indexed
    ? Math.max(1, Math.ceil(indexed.matched / indexed.limit))
    : localWindow!.pages;
  const firstShown = totalMatched ? (indexed ? (currentPage - 1) * indexed.limit + 1 : localWindow!.start + 1) : 0;
  const endShown = renderedList.length ? firstShown + renderedList.length - 1 : firstShown;
  const hasPrevious = indexed ? currentPage > 1 : localWindow!.hasPrevious;
  const hasNext = indexed ? indexed.hasMore : localWindow!.hasNext;
  const windowControls = document.querySelector<HTMLElement>('#resultWindowControls');
  const windowStatus = document.querySelector<HTMLElement>('#resultWindowStatus');
  const previousPage = document.querySelector<HTMLButtonElement>('#previousResultPage');
  const nextPage = document.querySelector<HTMLButtonElement>('#nextResultPage');
  const pageNumbers = document.querySelector<HTMLElement>('#resultPageNumbers');
  const pageJumpInput = document.querySelector<HTMLInputElement>('#resultPageJumpInput');
  const pageJumpButton = document.querySelector<HTMLButtonElement>('#resultPageJumpButton');
  const loadingPage = Boolean(indexed?.loading);
  count.textContent = String(totalMatched);
  if (windowControls) windowControls.hidden = totalMatched === 0 || totalPages <= 1;
  if (windowStatus) {
    windowStatus.textContent = language === 'zh'
      ? `第 ${currentPage}/${totalPages} 页 · 当前显示 ${firstShown}–${endShown} / 共 ${totalMatched} 篇`
      : `Page ${currentPage}/${totalPages} · Showing ${firstShown}–${endShown} of ${totalMatched}`;
  }
  if (pageNumbers) pageNumbers.innerHTML = paginationButtonsMarkup(currentPage, totalPages, loadingPage);
  if (pageJumpInput) {
    pageJumpInput.max = String(totalPages);
    pageJumpInput.value = String(currentPage);
    pageJumpInput.disabled = totalPages <= 1 || loadingPage;
  }
  if (pageJumpButton) pageJumpButton.disabled = totalPages <= 1 || loadingPage;
  if (previousPage) {
    previousPage.disabled = loadingPage || !hasPrevious;
    previousPage.dataset.available = hasPrevious ? 'true' : 'false';
  }
  if (nextPage) {
    nextPage.disabled = loadingPage || !hasNext;
    nextPage.dataset.available = hasNext ? 'true' : 'false';
  }
  if (scope) {
    const recent = resultScopeIsDefaultRecent();
    scope.textContent = recent ? t('recentScope') : t('currentScope');
    scope.title = recent ? t('recentScopeTitle') : '';
  }
  const editionSet = editionDoiSet();
  const featuredDoi = activeEdition?.featuredDoi.toLowerCase() || '';
  gallery.innerHTML = renderedList.length ? renderedList.map(paper => {
    const doi = paperDoi(paper);
    const doiKey = doi?.toLowerCase() || '';
    const isEditionPaper = Boolean(doiKey && editionSet.has(doiKey));
    const isFeaturedPaper = Boolean(doiKey && featuredDoi && doiKey === featuredDoi);
    const editionClass = isFeaturedPaper ? ' edition-featured' : isEditionPaper ? ' edition-highlight' : '';
    const editionBadge = isFeaturedPaper
      ? `<span class='tag edition-featured'>${language === 'zh' ? '每日精选' : 'Featured'}</span>`
      : isEditionPaper
        ? `<span class='tag edition'>${language === 'zh' ? '本期文献' : 'This edition'}</span>`
        : '';
    const href = doi ? `https://doi.org/${doi}` : (paper.url || '');
    const pdfHref = doi ? `/pdf/?${new URLSearchParams({ doi, fallback: href })}` : '';
    const pdfButton = pdfHref
      ? `<a class='private-pdf-button' href='${escapeHtml(pdfHref)}' target='_blank' rel='noopener noreferrer' aria-label='${escapeHtml(`${language === 'zh' ? '查看 PDF' : 'Read PDF'}: ${visibleTitle(paper)}`)}'>PDF</a>`
      : '';
    const pdfDownloadHref = doi ? `/pdf/?${new URLSearchParams({ doi, fallback: href, mode: 'download' })}` : '';
    const pdfCompatHref = doi ? `/pdf/?${new URLSearchParams({ doi, fallback: href, compat: '1' })}` : '';
    const pdfMore = pdfHref
      ? `<details class='private-pdf-more'><summary aria-label='${language === 'zh' ? 'PDF 更多操作' : 'More PDF options'}' title='${language === 'zh' ? 'PDF 下载或兼容模式' : 'Download or compatibility mode'}'>⋯</summary><div class='private-pdf-menu'><a class='private-pdf-download-button' href='${escapeHtml(pdfDownloadHref)}' target='_blank' rel='noopener noreferrer'>${language === 'zh' ? '下载 PDF' : 'Download PDF'}</a><a class='private-pdf-compat-button' href='${escapeHtml(pdfCompatHref)}' target='_blank' rel='noopener noreferrer'>${language === 'zh' ? '兼容模式' : 'Compatibility'}</a></div></details>`
      : '';
    const localPdfHref = doi ? `/pdf-vault/?${new URLSearchParams({ doi })}` : '';
    const localPdfButton = localPdfHref
      ? `<a class='local-pdf-button' href='${escapeHtml(localPdfHref)}' target='_blank' rel='noopener noreferrer' aria-label='${escapeHtml(`${language === 'zh' ? '管理本地 PDF' : 'Manage local PDF'}: ${visibleTitle(paper)}`)}'>${language === 'zh' ? '本地 PDF' : 'Local PDF'}</a>`
      : '';
    return `<article class='card${editionClass}' data-journal='${escapeHtml(paper.journal)}' data-date='${escapeHtml(paper.date)}' data-doi='${escapeHtml(doi || '')}' data-authors='${escapeHtml(paper.authors.join('|'))}'><div class='meta'>${editionBadge}<span class='tag'>${escapeHtml(paper.journal)}</span><span class='tag date'>${escapeHtml(prettyDate(paper.date, paper.dateUnverified === true || paper.date > beijingDate()))}</span>${isNewToday(paper) ? `<span class='tag new'>${escapeHtml(t('new'))}</span>` : ''}${synthesisBadge(paper)}</div><h2 class='title${paper.title ? '' : ' missing'}'>${escapeHtml(visibleTitle(paper))}</h2><div class='authors' title='${escapeHtml(paper.authors.join(', '))}'>${escapeHtml(paper.authors.join(', '))}</div>${tocMarkup(paper)}${figureMarkup(paper)}<div class='cardfoot'><div class='doi'>${escapeHtml(doi || t('doiPending'))}</div><div class='card-actions'><button class='share-card' type='button' data-card-share ${doi ? '' : 'disabled'} aria-label='${escapeHtml(`${t('share')}: ${visibleTitle(paper)}`)}'>${escapeHtml(t('share'))}</button>${localPdfButton}${pdfButton}${pdfMore}${href ? `<a class='open' href='${escapeHtml(href)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(t('open'))}</a>` : ''}</div></div></article>`;
  }).join('') : `<div class='empty'>${escapeHtml(t('noResults'))}</div>`;
  restoreMedia();
  scheduleMediaBatch(0);
  schedulePdfVaultCardsRefresh(gallery, language);
  if (activeEdition && !editionAutoScrolled) {
    editionAutoScrolled = true;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.card.edition-featured, .card.edition-highlight')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function filterSummary(): string {
  const selected = selectedJournals.size;
  const hidden = excludedJournals.size;
  if (selected && hidden) return `${selected} ${t('journalsSelected')} · ${hidden} ${t('journalsHidden')}`;
  if (selected) return `${selected} ${t('journalsSelected')}`;
  if (hidden) return `${hidden} ${t('journalsHidden')}`;
  return t('allJournals');
}

function mount(): void {
  const targetJournals = TARGET_JOURNALS.map(journal => journal.name);
  const targetSet = new Set(targetJournals);
  const extraJournals = [...new Set(papers.map(paper => paper.journal).filter(journal => !targetSet.has(journal)))].sort();
  const journals = [...targetJournals, ...extraJournals];
  const dates = papers.map(paper => paper.date).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  const earliest = (architectureClient || architectureFallbackActive) ? architectureEarliestDate : (dates[0] || '');
  const latest = latestCollectionDate || dates[dates.length - 1] || '';
  document.title = t('title');
  app.innerHTML = `<main class='shell'><section class='hero'><div class='hero-top'><div class='eyebrow'>${escapeHtml(t('eyebrow'))}</div><div class='lang-switch' role='group'><button class='lang-button${language === 'zh' ? ' active' : ''}' data-lang='zh' type='button'>中文</button><button class='lang-button${language === 'en' ? ' active' : ''}' data-lang='en' type='button'>EN</button></div></div><h1>${escapeHtml(t('title'))}</h1><p class='lede'>${escapeHtml(t('lede'))}</p><div class='hero-latest'><strong>${escapeHtml(latest)}</strong><span>${escapeHtml(t('latest'))}</span></div></section><section class='toolbar'><input id='search' class='search' type='search' value='${escapeHtml(query)}' placeholder='${escapeHtml(t('search'))}'><details class='journal-picker'><summary><span id='journalSummary'>${escapeHtml(filterSummary())}</span><span class='journal-chevron'>⌄</span></summary><div class='journal-menu'><button class='journal-clear${selectedJournals.size === 0 && excludedJournals.size === 0 ? ' active' : ''}' data-journal-clear type='button'>${escapeHtml(t('allJournals'))}</button>${journals.map(journal => { const hidden = excludedJournals.has(journal); return `<div class='journal-option-row${hidden ? ' excluded' : ''}'><label class='journal-option'><input data-journal-option type='checkbox' value='${escapeHtml(journal)}'${selectedJournals.has(journal) ? ' checked' : ''}${hidden ? ' disabled' : ''}><span>${escapeHtml(journal)}</span></label><button class='journal-exclude${hidden ? ' active' : ''}' data-journal-exclude='${escapeHtml(journal)}' type='button' aria-pressed='${hidden ? 'true' : 'false'}' aria-label='${escapeHtml(`${hidden ? t('restoreJournal') : t('hideJournal')} ${journal}`)}'>${escapeHtml(hidden ? t('restoreJournal') : t('hideJournal'))}</button></div>`; }).join('')}</div></details><select id='sort'><option value='newest'${sort === 'newest' ? ' selected' : ''}>${escapeHtml(t('newest'))}</option><option value='oldest'${sort === 'oldest' ? ' selected' : ''}>${escapeHtml(t('oldest'))}</option><option value='readers'${sort === 'readers' ? ' selected' : ''}>${escapeHtml(t('mostRead'))}</option></select><label class='check'><input id='newOnly' type='checkbox'${onlyNew ? ' checked' : ''}>${escapeHtml(t('onlyNew'))}</label></section><section class='range-filter' aria-label='${escapeHtml(t('clearFilters'))}'><label class='date-field'><span>${escapeHtml(t('dateFrom'))}</span><input id='dateFrom' type='date' value='${escapeHtml(dateFrom)}'${earliest ? ` min='${escapeHtml(earliest)}'` : ''}${(dateTo || latest) ? ` max='${escapeHtml(dateTo || latest)}'` : ''}></label><label class='date-field'><span>${escapeHtml(t('dateTo'))}</span><input id='dateTo' type='date' value='${escapeHtml(dateTo)}'${(dateFrom || earliest) ? ` min='${escapeHtml(dateFrom || earliest)}'` : ''}${latest ? ` max='${escapeHtml(latest)}'` : ''}></label><button id='clearCustomFilters' class='clear-custom-filters' type='button'${selectedJournals.size === 0 && excludedJournals.size === 0 && !dateFrom && !dateTo ? ' disabled' : ''}>${escapeHtml(t('clearFilters'))}</button></section><div class='resultline'><div class='result-count'><span id='resultScopeLabel' class='result-scope'>${escapeHtml(resultScopeIsDefaultRecent() ? t('recentScope') : t('currentScope'))}</span><span class='result-separator' aria-hidden='true'>·</span><strong id='resultCount'>0</strong> ${escapeHtml(t('shown'))}</div></div>${architectureReadLimited || (architectureBootstrapPending && !resultScopeIsDefaultRecent()) ? `<div class='architecture-read-limited' role='status'>${escapeHtml(t('limitedRead'))}</div>` : ''}<section id='gallery' class='gallery' aria-live='polite'></section><nav id='resultWindowControls' class='result-window-controls' aria-label='${escapeHtml(language === 'zh' ? '文献分页' : 'Paper pagination')}' hidden><div id='resultWindowStatus' class='result-window-status' aria-live='polite'></div><div class='result-pagination-main'><button id='previousResultPage' class='result-page-button' type='button' data-available='false' aria-label='${escapeHtml(language === 'zh' ? '上一页' : 'Previous page')}'><span class='result-page-arrow' aria-hidden='true'>←</span><span class='result-page-button-label'>${escapeHtml(language === 'zh' ? '上一页' : 'Previous')}</span></button><div id='resultPageNumbers' class='result-page-numbers' role='group' aria-label='${escapeHtml(language === 'zh' ? '选择页码' : 'Choose page')}'></div><button id='nextResultPage' class='result-page-button' type='button' data-available='false' aria-label='${escapeHtml(language === 'zh' ? '下一页' : 'Next page')}'><span class='result-page-button-label'>${escapeHtml(language === 'zh' ? '下一页' : 'Next')}</span><span class='result-page-arrow' aria-hidden='true'>→</span></button></div><form id='resultPageJump' class='result-page-jump'><label for='resultPageJumpInput'>${escapeHtml(language === 'zh' ? '跳至' : 'Go to')} <input id='resultPageJumpInput' class='result-page-jump-input' type='number' min='1' step='1' inputmode='numeric' aria-label='${escapeHtml(language === 'zh' ? '跳转页码' : 'Page number')}'><span>${escapeHtml(language === 'zh' ? '页' : '')}</span></label><button id='resultPageJumpButton' class='result-page-jump-button' type='submit'>${escapeHtml(language === 'zh' ? '前往' : 'Go')}</button></form></nav><div class='footer'>Organic Synthesis Literature Gallery · Cloudflare staging</div></main>`;
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
    resetResultWindow();
    renderCards();
    scheduleArchitectureCorpusRefresh();
  });
  document.querySelector<HTMLSelectElement>('#sort')?.addEventListener('change', event => {
    const value = (event.target as HTMLSelectElement).value;
    sort = value === 'oldest' || value === 'readers' ? value : 'newest';
    resetResultWindow();
    renderLocalHotView();
  });
  document.querySelector<HTMLInputElement>('#newOnly')?.addEventListener('change', event => {
    onlyNew = (event.target as HTMLInputElement).checked;
    resetResultWindow();
    renderLocalHotView();
  });
  document.querySelector<HTMLButtonElement>('[data-journal-clear]')?.addEventListener('click', () => {
    selectedJournals.clear();
    excludedJournals.clear();
    resetResultWindow();
    persistFilterPreferences();
    mount();
  });
  document.querySelectorAll<HTMLInputElement>('[data-journal-option]').forEach(input => input.addEventListener('change', () => {
    if (input.checked) selectedJournals.add(input.value);
    else selectedJournals.delete(input.value);
    resetResultWindow();
    persistFilterPreferences();
    const summary = document.querySelector<HTMLElement>('#journalSummary');
    if (summary) summary.textContent = filterSummary();
    const clear = document.querySelector<HTMLButtonElement>('#clearCustomFilters');
    if (clear) clear.disabled = selectedJournals.size === 0 && excludedJournals.size === 0 && !dateFrom && !dateTo;
    document.querySelector<HTMLButtonElement>('[data-journal-clear]')?.classList.toggle('active', selectedJournals.size === 0 && excludedJournals.size === 0);
    renderLocalHotView();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-journal-exclude]').forEach(button => button.addEventListener('click', () => {
    const journal = button.dataset.journalExclude?.trim();
    if (!journal) return;
    const hidden = excludedJournals.has(journal);
    if (hidden) excludedJournals.delete(journal);
    else {
      excludedJournals.add(journal);
      selectedJournals.delete(journal);
    }
    persistFilterPreferences();
    const row = button.closest<HTMLElement>('.journal-option-row');
    const input = row?.querySelector<HTMLInputElement>('[data-journal-option]');
    const nowHidden = excludedJournals.has(journal);
    resetResultWindow();
    row?.classList.toggle('excluded', nowHidden);
    if (input) {
      input.checked = selectedJournals.has(journal);
      input.disabled = nowHidden;
    }
    button.classList.toggle('active', nowHidden);
    button.setAttribute('aria-pressed', nowHidden ? 'true' : 'false');
    button.setAttribute('aria-label', `${nowHidden ? t('restoreJournal') : t('hideJournal')} ${journal}`);
    button.textContent = nowHidden ? t('restoreJournal') : t('hideJournal');
    const summary = document.querySelector<HTMLElement>('#journalSummary');
    if (summary) summary.textContent = filterSummary();
    const clear = document.querySelector<HTMLButtonElement>('#clearCustomFilters');
    if (clear) clear.disabled = selectedJournals.size === 0 && excludedJournals.size === 0 && !dateFrom && !dateTo;
    document.querySelector<HTMLButtonElement>('[data-journal-clear]')?.classList.toggle('active', selectedJournals.size === 0 && excludedJournals.size === 0);
    renderLocalHotView();
  }));
  document.querySelector<HTMLInputElement>('#dateFrom')?.addEventListener('change', event => {
    dateFrom = (event.target as HTMLInputElement).value;
    if (dateFrom && dateTo && dateFrom > dateTo) dateTo = dateFrom;
    resetResultWindow();
    persistFilterPreferences();
    mount();
    scheduleArchitectureCorpusRefresh(0);
  });
  document.querySelector<HTMLInputElement>('#dateTo')?.addEventListener('change', event => {
    dateTo = (event.target as HTMLInputElement).value;
    if (dateFrom && dateTo && dateTo < dateFrom) dateFrom = dateTo;
    resetResultWindow();
    persistFilterPreferences();
    mount();
    scheduleArchitectureCorpusRefresh(0);
  });
  document.querySelector<HTMLButtonElement>('#clearCustomFilters')?.addEventListener('click', () => {
    selectedJournals.clear();
    excludedJournals.clear();
    dateFrom = '';
    dateTo = '';
    resetResultWindow();
    persistFilterPreferences();
    mount();
    scheduleArchitectureCorpusRefresh(0);
  });

  const goToResultPage = async (targetPage: number): Promise<void> => {
    if (!Number.isSafeInteger(targetPage) || targetPage < 1) return;
    if (indexedViewState) {
      await goToIndexedResultPage(targetPage);
      return;
    }
    if (targetPage > 1 && hotBootstrapTotal > papers.length && resultScopeIsDefaultRecent()) {
      try { await ensureFullHotCorpus(); }
      catch { return; }
    }
    const total = filteredPapers().length;
    const bounded = resultWindowState(total, targetPage, resultWindowSize()).page;
    resultWindowPage = bounded;
    renderCards();
    document.querySelector<HTMLElement>('#gallery')?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };
  const moveResultPage = (delta: number): Promise<void> => goToResultPage(
    (indexedViewState?.page || resultWindowPage) + delta,
  );
  document.querySelector<HTMLButtonElement>('#previousResultPage')?.addEventListener('click', () => { void moveResultPage(-1); });
  document.querySelector<HTMLButtonElement>('#nextResultPage')?.addEventListener('click', () => { void moveResultPage(1); });
  document.querySelector<HTMLElement>('#resultPageNumbers')?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-result-page]');
    const targetPage = Number(button?.dataset.resultPage || 0);
    if (button && Number.isSafeInteger(targetPage) && targetPage > 0) void goToResultPage(targetPage);
  });
  document.querySelector<HTMLFormElement>('#resultPageJump')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>('#resultPageJumpInput');
    const targetPage = Number(input?.value || 0);
    if (Number.isSafeInteger(targetPage) && targetPage > 0) void goToResultPage(targetPage);
  });

  renderCards();
  scheduleInventory();
  scheduleNewnessBoundary();
}

function visibleMediaTargets(): Array<{ doi: string; toc: HTMLElement; figures: HTMLElement | null }> {
  const result: Array<{ doi: string; toc: HTMLElement; figures: HTMLElement | null }> = [];
  const mobile = innerWidth <= 680;
  const preloadBefore = mobile ? 120 : 260;
  const preloadAfter = mobile ? 360 : 900;
  const maxTargets = mobile ? 6 : 14;
  for (const slot of document.querySelectorAll<HTMLElement>('.toc-slot[data-doi]')) {
    const doi = normalizeDoi(slot.dataset.doi);
    const card = slot.closest<HTMLElement>('.card');
    if (!doi || !card) continue;
    const rect = card.getBoundingClientRect();
    if (rect.bottom < -preloadBefore || rect.top > innerHeight + preloadAfter) continue;
    result.push({ doi, toc: slot, figures: card.querySelector<HTMLElement>('.figure-strip-slot[data-figure-doi]') });
    if (result.length >= maxTargets) break;
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
  const candidateDois = [...new Set(targets.flatMap(target => {
    const key = target.doi.toLowerCase();
    const tocReady = tocCache.get(key);
    const figureReady = figureCache.get(key);
    if (tocReady && figureReady && now - tocReady.fetchedAt < MEDIA_TTL && now - figureReady.fetchedAt < MEDIA_TTL) return [];
    if (now - (mediaCheckedAt.get(key) || 0) < 20_000) return [];
    return [target.doi];
  }))];
  if (!candidateDois.length) return;
  const firstMobileWave = innerWidth <= 680 && mobileInitialMediaWave;
  const dois = firstMobileWave ? candidateDois.slice(0, 2) : candidateDois;
  const needsMobileFollowup = firstMobileWave && candidateDois.length > dois.length;
  if (firstMobileWave) mobileInitialMediaWave = false;
  batchRunning = true;
  try {
    const response = await api.post('/api/media/batch', { dois });
    const payload = response.data as { items?: MediaBatchItem[] };
    const liveMediaUnavailable = response.headers.get('x-gallery-media-source') === 'static-fallback';
    for (const item of payload.items || []) {
      const doi = normalizeDoi(item.doi);
      if (!doi) continue;
      const key = doi.toLowerCase();
      mediaCheckedAt.set(key, Date.now());
      tocCache.set(key, { result: item.toc, fetchedAt: Date.now() });
      figureCache.set(key, { result: item.figures, fetchedAt: Date.now() });
      document.querySelectorAll<HTMLElement>('.toc-slot[data-doi]').forEach(slot => {
        if ((slot.dataset.doi || '').toLowerCase() !== key) return;
        if (item.toc?.available && item.toc.imageUrl) renderToc(slot, item.toc);
        else if (liveMediaUnavailable) renderTocUnavailable(slot, 'service');
        else if (!slot.querySelector('img.toc-image')) {
          const pending = slot.querySelector<HTMLElement>('.generated-graphic-status');
          if (pending) pending.textContent = language === 'zh' ? '原始主图待补齐' : 'Original graphic pending';
          slot.dataset.state = 'not-yet-available';
        }
      });
      document.querySelectorAll<HTMLElement>('.figure-strip-slot[data-figure-doi]').forEach(slot => {
        if ((slot.dataset.figureDoi || '').toLowerCase() === key) renderFigures(slot, item.figures);
      });
    }
    if (liveMediaUnavailable) {
      // A failed canonical API read may return an empty static snapshot.
      // Do not leave those visible cards pretending that a capture is still running.
      const requested = new Set(dois.map(doi => doi.toLowerCase()));
      for (const target of targets) {
        if (!requested.has(target.doi.toLowerCase())) continue;
        if (tocCache.get(target.doi.toLowerCase())?.result.available) continue;
        renderTocUnavailable(target.toc, 'service');
      }
    }
  } catch {
    // Preserve the existing static compatibility fallback, but expose a retry
    // instead of leaving the visible card stuck in the generated-pending state.
    for (const target of targets) {
      if (!dois.includes(target.doi)) continue;
      renderTocUnavailable(target.toc, 'service');
    }
    window.dispatchEvent(new CustomEvent('gallery-media-static-fallback'));
  } finally {
    batchRunning = false;
    if (batchAgain) {
      batchAgain = false;
      scheduleMediaBatch(0);
    } else if (needsMobileFollowup) {
      scheduleMediaBatch(40);
    }
  }
}

function renderTocUnavailable(slot: HTMLElement, reason: 'service' | 'image'): void {
  // Never replace an existing visible original, including a TOC already
  // consumed by the article summary panel, with a transient API error.
  if (slot.querySelector('img.toc-image')) return;
  if (slot.dataset.state === reason + '-error') return;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'toc-retry';
  retry.textContent = reason === 'service'
    ? (language === 'zh' ? '主图服务暂不可用 · 点击重试' : 'Graphic service unavailable · Retry')
    : (language === 'zh' ? '主图加载失败 · 点击重试' : 'Graphic could not load · Retry');
  retry.addEventListener('click', () => {
    const doi = normalizeDoi(slot.dataset.doi);
    if (!doi) return;
    const key = doi.toLowerCase();
    tocCache.delete(key);
    figureCache.delete(key);
    mediaCheckedAt.delete(key);
    slot.dataset.state = 'retrying';
    retry.textContent = language === 'zh' ? '正在重新读取主图…' : 'Retrying original graphic…';
    scheduleMediaBatch(0);
  });
  slot.replaceChildren(retry);
  slot.classList.remove('generated');
  slot.classList.add('loaded');
  slot.dataset.state = reason + '-error';
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
  image.alt = result.primary?.label || t('toc');
  image.className = 'toc-image';
  const rect = slot.getBoundingClientRect();
  const priority = rect.bottom >= -80 && rect.top <= innerHeight + (innerWidth <= 680 ? 220 : 120);
  // The image remains detached until load; a detached lazy image never starts.
  // Limit work via visibleMediaTargets(), with low fetch priority for preloads.
  image.loading = 'eager';
  image.decoding = 'async';
  image.setAttribute('fetchpriority', priority ? 'high' : 'low');
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
  // A CDN thumbnail may fail while its immutable master is still healthy.
  // Try only distinct proven URLs from this exact DOI; never invent an image URL.
  const candidates = [...new Set([cardImageUrl, masterImageUrl, result.imageUrl].filter(Boolean))];
  let current = 0;
  const renderId = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
  slot.dataset.mediaRenderId = renderId;
  image.addEventListener('load', () => {
    if (slot.dataset.mediaRenderId !== renderId) return;
    slot.replaceChildren(button);
    slot.classList.remove('generated');
    slot.classList.add('loaded');
    slot.dataset.state = 'done';
  });
  image.addEventListener('error', () => {
    if (slot.dataset.mediaRenderId !== renderId) return;
    current += 1;
    if (current < candidates.length) {
      image.src = candidates[current];
      return;
    }
    console.warn('[Gallery media] original graphic image failed to load', slot.dataset.doi);
    renderTocUnavailable(slot, 'image');
  });
  image.src = candidates[0];
}

function renderFigures(slot: HTMLElement, result: FigureResponse): void {
  if (!result.available || !result.figures.length) {
    slot.replaceChildren();
    slot.hidden = true;
    slot.classList.remove('generated');
    slot.classList.add('loaded');
    slot.dataset.state = 'missing';
    return;
  }
  slot.hidden = false;
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
  const stripShell = document.createElement('div');
  stripShell.className = 'figure-strip-shell';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'figure-strip-nav figure-strip-nav--previous';
  previous.textContent = '‹';
  previous.setAttribute('aria-label', language === 'zh' ? '向左浏览正文图片' : 'Scroll article figures left');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'figure-strip-nav figure-strip-nav--next';
  next.textContent = '›';
  next.setAttribute('aria-label', language === 'zh' ? '向右浏览正文图片' : 'Scroll article figures right');
  const syncNav = (): void => {
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
    previous.disabled = strip.scrollLeft <= 2;
    next.disabled = max <= 2 || strip.scrollLeft >= max - 2;
  };
  const scrollByPage = (direction: number): void => {
    strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * 0.82), behavior: 'smooth' });
  };
  previous.addEventListener('click', () => scrollByPage(-1));
  next.addEventListener('click', () => scrollByPage(1));
  strip.addEventListener('scroll', syncNav, { passive: true });
  stripShell.append(previous, strip, next);
  slot.replaceChildren(heading, stripShell);
  slot.classList.remove('generated');
  slot.classList.add('loaded');
  slot.dataset.state = 'done';
  requestAnimationFrame(syncNav);
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
    const needFigures = Number(item.figureCount || 0) < 2;
    const needToc = item.largeSource === 'none' || item.suspiciousToc === true;
    const need = needFigures && needToc ? 'toc+figures' : needFigures ? 'figures' : 'toc';
    return `<article class='card bridge-staging-card' data-media-need='${need}' data-figure-count='${Number(item.figureCount || 0)}'><div class='toc-slot pending' data-doi='${escapeHtml(item.doi)}' data-media-need='${need}'></div></article>`;
  }).join('');
  if (bridgeStageTimer !== null) clearTimeout(bridgeStageTimer);
  bridgeStageTimer = window.setTimeout(() => {
    bridgeStageCursor = (bridgeStageCursor + size) % gaps.length;
    stageBridgeGaps(inventory);
  }, 22_000);
}

function scheduleInventory(delay = 4500): void {
  if (inventoryTimer !== null) window.clearTimeout(inventoryTimer);
  inventoryTimer = window.setTimeout(() => {
    inventoryTimer = null;
    const dois = [...new Set(
      [...document.querySelectorAll<HTMLElement>('#gallery .toc-slot[data-doi]')]
        .map(slot => normalizeDoi(slot.dataset.doi))
        .filter((doi): doi is string => Boolean(doi))
        .map(doi => doi.toLowerCase())
    )].slice(0, DESKTOP_RESULT_WINDOW_SIZE).sort();
    const fingerprint = dois.join('|');
    if (!dois.length || fingerprint === inventoryFingerprint) return;
    inventoryFingerprint = fingerprint;
    void api.post('/api/media/inventory', { dois, readOnly: true }).then(response => {
      const inventory = response.data as MediaInventoryResponse;
      stageBridgeGaps(inventory);
    }).catch(() => {
      inventoryFingerprint = '';
    });
  }, Math.max(0, delay));
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
  const missing = [...new Set(papers.filter(paper => !chineseTitle(paper, zhTitleCache)).map(paper => paper.title).filter((title): title is string => Boolean(title)))];
  for (let offset = 0; offset < missing.length; offset += 100) {
    try {
      const response = await api.post('/api/title-translations/zh', { titles: missing.slice(offset, offset + 100) });
      const payload = response.data as { translations?: Array<{ title?: unknown; zh?: unknown }> };
      for (const item of payload.translations || []) {
        if (typeof item.title === 'string' && validChineseTitle(item.zh)) zhTitleCache.set(item.title, String(item.zh).trim());
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

async function loadLegacyCorpus(): Promise<Paper[]> {
  let result = mergePapers([], await loadStaticPapers()).filter(paper => !isExcludedDoi(paperDoi(paper)));
  try {
    const response = await api.get('/api/literature/supplement');
    const supplement = response.data as { papers?: Paper[] };
    result = mergePapers(result, (supplement.papers || []).map(normalizePaper))
      .filter(paper => !isExcludedDoi(paperDoi(paper)));
  } catch {
    // Static snapshot remains usable if the API is temporarily unavailable.
  }
  return result;
}

function normalizeArchitectureRows(value: unknown): Paper[] {
  if (!Array.isArray(value)) throw new Error('architecture_paper_array_invalid');
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('architecture_paper_shape_invalid');
    const paper = raw as Partial<Paper>;
    if (typeof paper.journal !== 'string' || typeof paper.date !== 'string' || !Array.isArray(paper.authors)) {
      throw new Error('architecture_paper_shape_invalid');
    }
    const normalized = normalizePaper({
      journal: paper.journal,
      title: typeof paper.title === 'string' ? paper.title : null,
      titleZh: typeof paper.titleZh === 'string' ? paper.titleZh : undefined,
      doi: typeof paper.doi === 'string' ? paper.doi : null,
      date: paper.date,
      url: typeof paper.url === 'string' ? paper.url : null,
      new: paper.new === true,
      addedDate: typeof paper.addedDate === 'string' ? paper.addedDate : undefined,
      dateUnverified: paper.dateUnverified === true,
      authors: paper.authors as string[],
      synthesisType: paper.synthesisType === 'formal' || paper.synthesisType === 'total' ? paper.synthesisType : undefined,
    });
    if (!paperDoi(normalized)) throw new Error('architecture_paper_doi_invalid');
    return normalized;
  }).filter(paper => !isExcludedDoi(paperDoi(paper)));
}

function setArchitectureCorpus(rows: Paper[]): void {
  papers = mergePapers([], rows).filter(paper => !isExcludedDoi(paperDoi(paper)));
  applyResolvedTitles();
}

async function ensureFullHotCorpus(): Promise<void> {
  if (!hotBootstrapTotal || papers.length >= hotBootstrapTotal) {
    hotBootstrapTotal = 0;
    return;
  }
  if (hotFullLoadPromise) return hotFullLoadPromise;
  const siteBase = new URL('./', document.baseURI).toString();
  hotFullLoadPromise = loadPublishedHotFallback(siteBase)
    .then(fallback => {
      const rows = normalizeArchitectureRows(fallback.papers);
      architectureLandingPapers = rows;
      architectureEarliestDate = rows.map(paper => paper.date)
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()[0] || architectureEarliestDate;
      setArchitectureCorpus(rows);
      hotBootstrapTotal = 0;
      architectureReadLimited = false;
    })
    .catch(error => {
      architectureReadLimited = true;
      console.warn('full Hot compatibility snapshot unavailable; keeping bounded first page', error);
      throw error;
    })
    .finally(() => {
      hotFullLoadPromise = null;
    });
  return hotFullLoadPromise;
}

function renderLocalHotView(): void {
  if (hotBootstrapTotal > papers.length) {
    void ensureFullHotCorpus().then(() => renderCards()).catch(() => renderCards());
    return;
  }
  renderCards();
}

async function activateArchitectureClientInBackground(siteBase: string): Promise<void> {
  try {
    const client = await new PublishedCatalogClient(siteBase).open();
    architectureClient = client;
    architectureFallbackActive = false;
    architectureBootstrapPending = false;
    architectureReadLimited = false;
    architectureMemberDois = [...client.memberDois];
    architectureEarliestDate = client.earliestDate || architectureEarliestDate;
    document.documentElement.dataset.catalogRead = 'architecture-v1';
    syncLiteratureDoiRegistry();

    const fromInput = document.querySelector<HTMLInputElement>('#dateFrom');
    const toInput = document.querySelector<HTMLInputElement>('#dateTo');
    if (architectureEarliestDate) {
      if (fromInput) fromInput.min = architectureEarliestDate;
      if (toInput && !dateFrom) toInput.min = architectureEarliestDate;
    }
    document.querySelector('.architecture-read-limited')?.remove();

    if (query.trim() || dateFrom || dateTo) scheduleArchitectureCorpusRefresh(0);
  } catch (error) {
    architectureBootstrapPending = false;
    architectureReadLimited = true;
    document.documentElement.dataset.catalogRead = 'architecture-hot-fallback';
    console.warn('architecture-v1 background initialization unavailable; retaining verified Hot landing', error);
    mount();
  }
}

function installFastHotFallback(fallback: Awaited<ReturnType<typeof loadPublishedHotFallback>>): void {
  const fallbackRows = normalizeArchitectureRows(fallback.papers);
  hotBootstrapTotal = Math.max(Number(fallback.totalCount || 0), fallbackRows.length);
  architectureClient = null;
  architectureFallbackActive = true;
  architectureBootstrapPending = true;
  architectureReadLimited = false;
  architectureMemberDois = null;
  architectureEarliestDate = fallbackRows.map(paper => paper.date)
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()[0] || '';
  architectureLandingPapers = fallbackRows;
  const dates = fallbackRows.map(paper => paper.date)
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  latestCollectionDate = dates[dates.length - 1] || '';
  setArchitectureCorpus(fallbackRows);
  document.documentElement.dataset.catalogRead = 'architecture-hot-bootstrap';
}

async function loadArchitectureCorpus(): Promise<'architecture-v1' | 'architecture-hot-fallback' | 'legacy-compatible'> {
  const siteBase = new URL('./', document.baseURI).toString();
  const fastBootstrapEligible = !sharedDoiFromLocation()
    && !(activeEdition?.dois.length)
    && !query.trim()
    && !dateFrom
    && !dateTo;

  if (fastBootstrapEligible) {
    try {
      const fallback = await loadPublishedHotFallback(siteBase, { headOnly: true });
      installFastHotFallback(fallback);
      void activateArchitectureClientInBackground(siteBase);
      return 'architecture-hot-fallback';
    } catch (bootstrapError) {
      console.warn('verified Hot bootstrap unavailable; trying full architecture reader', bootstrapError);
    }
  }

  try {
    const client = await new PublishedCatalogClient(siteBase).open();
    const landingRows = normalizeArchitectureRows(await client.landing(sharedDoiFromLocation()));
    const editionRows = activeEdition?.dois.length
      ? normalizeArchitectureRows(await client.resolve(activeEdition.dois))
      : [];
    architectureClient = client;
    architectureFallbackActive = false;
    architectureBootstrapPending = false;
    architectureReadLimited = false;
    architectureMemberDois = [...client.memberDois];
    architectureEarliestDate = client.earliestDate || '';
    architectureLandingPapers = mergePapers(landingRows, editionRows);
    hotBootstrapTotal = 0;
    const architectureDates = architectureLandingPapers.map(paper => paper.date)
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    latestCollectionDate = architectureDates[architectureDates.length - 1] || '';
    setArchitectureCorpus(architectureLandingPapers);
    document.documentElement.dataset.catalogRead = 'architecture-v1';
    return 'architecture-v1';
  } catch (primaryError) {
    console.warn('architecture-v1 full reader unavailable; attempting bounded Hot fallback', primaryError);
    try {
      const fallback = await loadPublishedHotFallback(siteBase);
      const fallbackRows = normalizeArchitectureRows(fallback.papers);
      const editionRows = activeEdition?.dois.flatMap(doi => {
        const paper = fallbackRows.find(item => paperDoi(item)?.toLowerCase() === doi.toLowerCase());
        return paper ? [paper] : [];
      }) || [];
      let orderedFallback = mergePapers(editionRows, fallbackRows);
      const sharedDoi = sharedDoiFromLocation()?.toLowerCase();
      const sharedPaper = sharedDoi
        ? orderedFallback.find(paper => paperDoi(paper)?.toLowerCase() === sharedDoi)
        : undefined;
      if (sharedPaper) orderedFallback = [sharedPaper, ...orderedFallback.filter(paper => paper !== sharedPaper)];
      architectureClient = null;
      architectureFallbackActive = true;
      architectureBootstrapPending = false;
      architectureReadLimited = true;
      architectureMemberDois = null;
      architectureEarliestDate = orderedFallback.map(paper => paper.date)
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()[0] || '';
      architectureLandingPapers = orderedFallback;
      hotBootstrapTotal = 0;
      const dates = orderedFallback.map(paper => paper.date)
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
      latestCollectionDate = dates[dates.length - 1] || '';
      setArchitectureCorpus(orderedFallback);
      document.documentElement.dataset.catalogRead = 'architecture-hot-fallback';
      return 'architecture-hot-fallback';
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      const localHost = new URL(siteBase).hostname;
      const localCompatibilityHost = localHost === '127.0.0.1' || localHost === 'localhost';
      const deliveryUnavailableLocally = localCompatibilityHost
        && /delivery_(?:http_404|invalid_json)/.test(primaryMessage)
        && /delivery_(?:http_404|invalid_json)/.test(fallbackMessage);
      architectureClient = null;
      architectureFallbackActive = false;
      architectureBootstrapPending = false;
      architectureReadLimited = false;
      architectureMemberDois = null;
      architectureEarliestDate = '';
      architectureLandingPapers = [];
      latestCollectionDate = '';
      if (deliveryUnavailableLocally) {
        document.documentElement.dataset.catalogRead = 'legacy';
        return 'legacy-compatible';
      }
      document.documentElement.dataset.catalogRead = 'unavailable';
      throw new Error(`verified_architecture_unavailable:${primaryMessage};hot_fallback:${fallbackMessage}`);
    }
  }
}

function indexedViewRequest(cursor = ''): LiteratureCatalogViewRequest | null {
  const client = architectureClient;
  if (!client || activeEdition || sharedDoiFromLocation() || sort === 'readers') return null;
  const needle = query.trim();
  if (needle && [...needle].length < 3) return null;
  // Keep the default Hot landing, journal-only filtering and new-only filtering local.
  // D1 is used only when the user requests historical/all-time discovery.
  if (!needle && !dateFrom && !dateTo) return null;
  return {
    catalogId: client.catalogId,
    query: needle,
    selectedJournals: [...selectedJournals].sort(),
    excludedJournals: [...excludedJournals].sort(),
    dateFrom,
    dateTo,
    addedDate: onlyNew ? beijingDate() : '',
    sort: sort === 'oldest' ? 'oldest' : 'newest',
    limit: resultWindowSize(),
    cursor,
  };
}

function indexedViewRequestKey(request: LiteratureCatalogViewRequest): string {
  return JSON.stringify({
    catalogId: request.catalogId,
    query: request.query || '',
    selectedJournals: request.selectedJournals || [],
    excludedJournals: request.excludedJournals || [],
    dateFrom: request.dateFrom || '',
    dateTo: request.dateTo || '',
    addedDate: request.addedDate || '',
    sort: request.sort || 'newest',
    limit: request.limit || resultWindowSize(),
  });
}

async function loadIndexedViewPage(
  serial: number,
  request: LiteratureCatalogViewRequest,
  page: number,
  cursors: string[],
): Promise<boolean> {
  const client = architectureClient;
  if (!client || request.catalogId !== client.catalogId) return false;
  const requestKey = indexedViewRequestKey(request);
  const response = await fetchLiteratureCatalogView(request);
  if (serial !== architectureRefreshSerial && page === 1) return false;
  if (page > 1 && serial !== indexedViewSerial) return false;
  if (architectureClient !== client) return false;
  const indexedPapers = normalizeArchitectureRows(await client.resolveIndexed(response.items));
  if (indexedPapers.length !== response.items.length) throw new Error('literature_catalog_view_excluded_member');
  const pageCursors = [...cursors];
  if (response.hasMore && response.nextCursor) pageCursors[page] = response.nextCursor;
  indexedViewState = {
    requestKey,
    matched: response.matched,
    page,
    limit: response.limit,
    cursors: pageCursors,
    hasMore: response.hasMore,
    nextCursor: response.nextCursor,
    papers: indexedPapers,
    loading: false,
  };
  architectureReadLimited = false;
  setArchitectureCorpus(indexedPapers);
  document.documentElement.dataset.catalogQueryRead = 'd1-index';
  mount();
  return true;
}

async function tryIndexedArchitectureView(serial: number): Promise<boolean> {
  const request = indexedViewRequest('');
  if (!request) return false;
  if (indexedViewCapability === null) {
    indexedViewCapability = await literatureCatalogIndexedReadActive();
    document.documentElement.dataset.catalogIndexCapability = indexedViewCapability ? 'active' : 'inactive';
  }
  if (!indexedViewCapability) return false;
  try {
    return await loadIndexedViewPage(serial, request, 1, ['']);
  } catch (error) {
    indexedViewCapability = false;
    indexedViewState = null;
    document.documentElement.dataset.catalogIndexCapability = 'degraded';
    document.documentElement.dataset.catalogQueryRead = 'static-segments';
    console.warn('D1 literature view unavailable; using verified static catalog reader', error);
    return false;
  }
}

async function goToIndexedResultPage(requestedPage: number): Promise<void> {
  const client = architectureClient;
  const state = indexedViewState;
  if (!client || !state || state.loading) return;
  const totalPages = Math.max(1, Math.ceil(state.matched / state.limit));
  const targetPage = Math.max(1, Math.min(requestedPage, totalPages));
  if (targetPage === state.page) return;

  const token = ++indexedViewSerial;
  const cursors = [...state.cursors];
  indexedViewState = { ...state, loading: true };
  renderCards();

  try {
    let startPage = targetPage;
    while (startPage > 1 && typeof cursors[startPage - 1] !== 'string') startPage -= 1;
    let cursor = cursors[startPage - 1] || '';
    let response: Awaited<ReturnType<typeof fetchLiteratureCatalogView>> | null = null;

    for (let page = startPage; page <= targetPage; page += 1) {
      const request = indexedViewRequest(cursor);
      if (!request || indexedViewRequestKey(request) !== state.requestKey) {
        resetResultWindow();
        scheduleArchitectureCorpusRefresh(0);
        return;
      }
      response = await fetchLiteratureCatalogView(request);
      if (token !== indexedViewSerial || architectureClient !== client) return;
      if (page < targetPage) {
        if (!response.hasMore || !response.nextCursor) throw new Error('literature_catalog_page_cursor_missing');
        cursors[page] = response.nextCursor;
        cursor = response.nextCursor;
      }
    }

    if (!response) return;
    const indexedPapers = normalizeArchitectureRows(await client.resolveIndexed(response.items));
    if (indexedPapers.length !== response.items.length) throw new Error('literature_catalog_view_excluded_member');
    if (response.hasMore && response.nextCursor) cursors[targetPage] = response.nextCursor;
    indexedViewState = {
      requestKey: state.requestKey,
      matched: response.matched,
      page: targetPage,
      limit: response.limit,
      cursors,
      hasMore: response.hasMore,
      nextCursor: response.nextCursor,
      papers: indexedPapers,
      loading: false,
    };
    setArchitectureCorpus(indexedPapers);
    document.documentElement.dataset.catalogQueryRead = 'd1-index';
    mount();
    document.querySelector<HTMLElement>('#gallery')?.scrollIntoView({ block: 'start', behavior: 'auto' });
  } catch (error) {
    if (token !== indexedViewSerial) return;
    console.warn('D1 literature page unavailable; returning to verified static catalog reader', error);
    indexedViewCapability = false;
    indexedViewState = null;
    resultWindowPage = 1;
    document.documentElement.dataset.catalogIndexCapability = 'degraded';
    document.documentElement.dataset.catalogQueryRead = 'static-segments';
    setArchitectureCorpus(architectureLandingPapers);
    scheduleArchitectureCorpusRefresh(0);
  }
}

async function refreshArchitectureCorpus(serial: number): Promise<void> {
  const client = architectureClient;
  if (!client || serial !== architectureRefreshSerial) return;
  if (await tryIndexedArchitectureView(serial)) return;
  if (serial !== architectureRefreshSerial || architectureClient !== client) return;
  indexedViewState = null;
  document.documentElement.dataset.catalogQueryRead = 'static-segments';
  try {
    let additions: Paper[] = [];
    const needle = query.trim();
    if (needle.length >= 2) additions = mergePapers(additions, normalizeArchitectureRows(await client.search(needle)));
    if (dateFrom || dateTo) {
      additions = mergePapers(additions, normalizeArchitectureRows(await client.range(dateFrom, dateTo || client.asOfDate)));
    }
    if (serial !== architectureRefreshSerial || architectureClient !== client) return;
    architectureReadLimited = false;
    setArchitectureCorpus(mergePapers(architectureLandingPapers, additions));
    mount();
  } catch (error) {
    if (serial !== architectureRefreshSerial || architectureClient !== client) return;
    console.warn('architecture-v1 on-demand read unavailable; retaining bounded Hot landing set', error);
    architectureReadLimited = true;
    setArchitectureCorpus(architectureLandingPapers);
    mount();
  }
}

function scheduleArchitectureCorpusRefresh(delay = 220): void {
  if (!architectureClient) return;
  architectureRefreshSerial += 1;
  const serial = architectureRefreshSerial;
  if (architectureRefreshTimer !== null) window.clearTimeout(architectureRefreshTimer);
  architectureRefreshTimer = window.setTimeout(() => {
    architectureRefreshTimer = null;
    void refreshArchitectureCorpus(serial);
  }, delay);
}

async function load(): Promise<void> {
  try {
    activeEdition = await loadEditionManifest();
    const architectureMode = await loadArchitectureCorpus();
    if (architectureMode === 'legacy-compatible') {
      setArchitectureCorpus(await loadLegacyCorpus());
      const legacyDates = papers.map(paper => paper.date)
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
      latestCollectionDate = legacyDates[legacyDates.length - 1] || '';
    }
    if (!window.matchMedia('(max-width: 680px)').matches) {
      try { await loadPdfVaultCardsModule(); } catch { /* Optional card state must not block Gallery. */ }
    }
    mount();
    window.dispatchEvent(new CustomEvent('gallery-first-content-rendered'));
    if (architectureMode === 'architecture-v1' && (dateFrom || dateTo || query.trim())) scheduleArchitectureCorpusRefresh(0);
    void resolveTitles().then(() => resolveTitles());
    void loadTranslations();
  } catch (error) {
    app.innerHTML = `<div class='error'><strong>${escapeHtml(t('loadError'))}</strong><br>${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

window.addEventListener('scroll', () => scheduleMediaBatch(40), { passive: true });
window.addEventListener('resize', () => {
  const nextWindowSize = resultWindowSize();
  if (nextWindowSize !== lastResultWindowSize) {
    lastResultWindowSize = nextWindowSize;
    resetResultWindow();
    renderCards();
    scheduleArchitectureCorpusRefresh(0);
  }
  scheduleMediaBatch(60);
});
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
