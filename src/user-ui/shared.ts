import { ReaderCountLoader } from './reader-count-loader';
import { cropUserImage } from './image-cropper';
import { prepareCroppedStatusImage, imageFingerprint } from './status-image-edit';
import type { StatusImageCrop, StatusImageStyle } from './status-image-types';
import { prepareStatusImage, type OriginalStatusImage } from './status-image-assets';
export type Language = 'zh' | 'en';
export type Shape = 'pill' | 'rounded' | 'rectangle' | 'circle' | 'square' | 'diamond' | 'bookmark' | 'star';
export type RGB = [number, number, number];
export type ActionKey = 'favorite' | 'status' | 'note' | 'more' | 'login' | 'support';
export type SuggestionType = 'author' | 'keyword' | 'journal' | 'doi';

export type StatusGlow = 'none' | 'soft' | 'pulse' | 'orbit' | 'rainbow';
export const STATUS_GLOWS: StatusGlow[] = ['none', 'soft', 'pulse', 'orbit', 'rainbow'];
export interface StyleDef { rgb: RGB; shape: Shape; imageData?: string; imageOriginal?: OriginalStatusImage; imageCrop?: StatusImageCrop; glow?: StatusGlow; glowWidth?: number; }
export interface StatusDef { id: string; name: string; style: StyleDef; countsAsRead: boolean; }
export interface QuickTerm { id: string; label: string; style: StyleDef; }
export interface CollectionDef { id: string; name: string; style: StyleDef; }
export interface AliasGroup { id: string; name: string; terms: string[]; }
export interface PaperMeta { id: string; doi?: string; title: string; journal: string; href?: string; authors: string[]; topics: string[]; }
export interface ArticleSummaryResult {
  doi: string;
  available: boolean;
  fulltextAvailable: boolean;
  reason?: 'fulltext_missing' | 'ai_unavailable';
  source?: 'fulltext';
  cached?: boolean;
  zh?: string;
  en?: string;
  generatedAt?: number;
}
export interface PaperUserState { favorite: boolean; collections: string[]; statusId?: string; note: string; noteUpdatedAt?: number; quickTerms: string[]; tags: string[]; lastOpenedAt?: number; updatedAt?: number; }
export interface UserUiState {
  statuses: StatusDef[];
  quickTerms: QuickTerm[];
  collections: CollectionDef[];
  aliases: AliasGroup[];
  actionStyles: Record<ActionKey, StyleDef>;
  papers: Record<string, PaperUserState>;
  metadata: Record<string, Omit<PaperMeta, 'authors' | 'topics'>>;
  followedSearches: string[];
  searchHistory: string[];
  hideRead: boolean;
}

const STORAGE_KEY = 'organic-gallery-user-ui-v1';
const PROFILE_KEY = 'organic-gallery-profile-v1';
const SITE_FEEDBACK_QUEUE_KEY = 'organic-gallery-site-feedback-queue-v1';
const READER_OPEN_QUEUE_KEY = 'organic-gallery-reader-open-queue-v1';
const READER_COUNTS_CACHE_KEY = 'organic-gallery-reader-counts-v3';
const OPTIONAL_CLOUD_TIMEOUT_MS = 6500;
const SITE_FEEDBACK_QUEUE_LIMIT = 50;
const READER_OPEN_QUEUE_LIMIT = 100;
export const WORKER_API_BASE = 'https://api.gczhouwld.com';
export const SHAPES: Shape[] = ['pill', 'rounded', 'rectangle', 'circle', 'square', 'diamond', 'bookmark', 'star'];

function style(rgb: RGB, shape: Shape = 'rounded'): StyleDef { return { rgb, shape }; }
function defaults(): UserUiState {
  return {
    statuses: [
      { id: 'to-read', name: '将读', style: style([93, 109, 219], 'pill'), countsAsRead: false },
      { id: 'skim', name: '粗读', style: style([45, 132, 219]), countsAsRead: true },
      { id: 'deep', name: '深读', style: style([37, 151, 96], 'pill'), countsAsRead: true },
    ],
    quickTerms: [
      { id: 'project', label: '与课题直接相关', style: style([72, 137, 165], 'pill') },
      { id: 'method', label: '方法值得学习', style: style([74, 112, 198], 'pill') },
      { id: 'substrate', label: '底物值得尝试', style: style([112, 98, 185], 'pill') },
      { id: 'mechanism', label: '机理值得学习', style: style([201, 128, 34], 'pill') },
      { id: 'catalyst', label: '催化剂值得关注', style: style([40, 142, 122], 'pill') },
      { id: 'citation', label: '写文章引用', style: style([101, 116, 139], 'pill') },
      { id: 'group', label: 'Group Meeting', style: style([174, 86, 132], 'pill') },
    ],
    collections: [
      { id: 'default', name: '默认收藏', style: style([49, 89, 189], 'pill') },
      { id: 'project', name: '我的课题', style: style([72, 137, 165], 'pill') },
      { id: 'group', name: 'Group Meeting', style: style([174, 86, 132], 'pill') },
    ],
    aliases: [
      { id: 'photoredox', name: 'Photoredox', terms: ['photoredox', 'photoredox catalysis', 'photocatalysis', 'visible-light catalysis', '光氧化还原', '光催化'] },
      { id: 'ce-lmct', name: 'Ce-LMCT', terms: ['ce-lmct', 'cerium lmct', 'cerium', 'ce(iii)', 'cecl3', 'ligand-to-metal charge transfer'] },
      { id: 'minisci', name: 'Minisci', terms: ['minisci', 'heteroarene alkylation', 'radical heteroarene functionalization'] },
      { id: 'ni-radical', name: 'Ni radical coupling', terms: ['nickel radical coupling', 'nickel', 'ni', 'radical cross-coupling', 'cross-electrophile'] },
    ],
    actionStyles: {
      favorite: style([49, 89, 189]), status: style([93, 109, 219]), note: style([86, 98, 119]), more: style([89, 105, 132]), login: style([49, 89, 189], 'pill'), support: style([33, 160, 97], 'pill'),
    },
    papers: {}, metadata: {}, followedSearches: [], searchHistory: [], hideRead: false,
  };
}

function load(): UserUiState {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<UserUiState> | null;
    if (!saved) return base;
    return {
      ...base, ...saved,
      statuses: Array.isArray(saved.statuses) && saved.statuses.length ? saved.statuses.map(item => ({ ...item, countsAsRead: typeof item.countsAsRead === 'boolean' ? item.countsAsRead : item.id !== 'to-read' })) : base.statuses,
      quickTerms: Array.isArray(saved.quickTerms) && saved.quickTerms.length ? saved.quickTerms : base.quickTerms,
      collections: Array.isArray(saved.collections) && saved.collections.length
        ? saved.collections.map((item, index) => ({
            ...item,
            style: item.style || base.collections[index % base.collections.length]?.style || style([96, 116, 145], 'pill'),
          }))
        : base.collections,
      aliases: Array.isArray(saved.aliases) ? saved.aliases : base.aliases,
      actionStyles: { ...base.actionStyles, ...(saved.actionStyles || {}) },
      papers: saved.papers || {}, metadata: saved.metadata || {},
      followedSearches: Array.isArray(saved.followedSearches) ? saved.followedSearches : [],
      searchHistory: Array.isArray(saved.searchHistory) ? saved.searchHistory : [],
      hideRead: saved.hideRead === true,
    };
  } catch { return base; }
}

function newId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function browserProfile(): string {
  try {
    const old = localStorage.getItem(PROFILE_KEY);
    if (old) return old;
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : newId('profile');
    localStorage.setItem(PROFILE_KEY, id);
    return id;
  } catch { return newId('profile'); }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}
export function normalizeDoi(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : undefined;
}
export function rgbCss(rgb: RGB): string { return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`; }
export function textOn(rgb: RGB): string { return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.66 ? '#182033' : '#fff'; }
export function styleVars(value: StyleDef): string { return `--u-color:${rgbCss(value.rgb)};--u-text:${textOn(value.rgb)}`; }
export function statusLabel(status: StatusDef, language: Language): string {
  if (language === 'zh') return status.name;
  if (status.id === 'to-read' && status.name === '将读') return 'To read';
  if (status.id === 'skim' && status.name === '粗读') return 'Skimmed';
  if (status.id === 'deep' && status.name === '深读') return 'Deep read';
  return status.name;
}
export function queryTokens(value: string): string[] {
  return [...value.matchAll(/"([^"]+)"|([^\s,，;；+]+)/g)].map(match => (match[1] || match[2] || '').trim().toLowerCase()).filter(Boolean);
}
export function queryTerm(value: string): string { return /\s/.test(value.trim()) ? `"${value.trim()}"` : value.trim(); }
export function normalizeSearch(value: string): string { return value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); }
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}
export function suggestionMatch(query: string, candidate: string): { score: number; replaceWords: number; hint: 'exact' | 'prefix' | 'contains' | 'spelling' } | null {
  const words = query.trim().replace(/"/g, '').split(/\s+/).filter(Boolean);
  const candidateWords = candidate.split(/\s+/).filter(Boolean);
  let best: { score: number; replaceWords: number; hint: 'exact' | 'prefix' | 'contains' | 'spelling' } | null = null;
  const compare = (fragment: string, replaceWords: number, target: string): void => {
    const left = normalizeSearch(fragment); const right = normalizeSearch(target);
    if (left.length < 2 || !right) return;
    let score = 0; let hint: 'exact' | 'prefix' | 'contains' | 'spelling' = 'exact';
    if (left === right) { score = 140; hint = 'exact'; }
    else if (right.startsWith(left)) { score = 120 - Math.max(0, right.length - left.length); hint = 'prefix'; }
    else if (right.includes(left)) { score = 104 - Math.max(0, right.length - left.length); hint = 'contains'; }
    else {
      const distance = levenshtein(left, right);
      const limit = Math.max(1, Math.min(3, Math.floor(Math.max(left.length, right.length) * 0.28)));
      if (distance <= limit) { score = 94 - distance * 10; hint = 'spelling'; }
    }
    if (score && (!best || score > best.score)) best = { score, replaceWords, hint };
  };
  const maxTail = Math.min(words.length, Math.max(3, candidateWords.length + 1));
  for (let count = 1; count <= maxTail; count += 1) compare(words.slice(-count).join(' '), count, candidate);
  const last = words[words.length - 1] || '';
  candidateWords.forEach(word => compare(last, 1, word));
  return best;
}

type SiteFeedbackPayload = {
  profileId: string;
  category: string;
  message: string;
  pagePath?: string;
  language?: string;
  searchQuery?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  imageData?: string;
  imageName?: string;
};

type QueuedSiteFeedback = {
  id: string;
  createdAt: number;
  attempts: number;
  payload: SiteFeedbackPayload;
};

function readSiteFeedbackQueue(): QueuedSiteFeedback[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SITE_FEEDBACK_QUEUE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === 'object' && typeof item.id === 'string' && item.payload && typeof item.payload.message === 'string')
      .slice(-SITE_FEEDBACK_QUEUE_LIMIT);
  } catch {
    return [];
  }
}

function writeSiteFeedbackQueue(items: QueuedSiteFeedback[]): void {
  try {
    localStorage.setItem(SITE_FEEDBACK_QUEUE_KEY, JSON.stringify(items.slice(-SITE_FEEDBACK_QUEUE_LIMIT)));
  } catch { /* local fallback is best effort */ }
}

function readReaderCountsCache(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_COUNTS_CACHE_KEY) || '{}') as Record<string, unknown>;
    const counts: Record<string, number> = {};
    for (const [doi, value] of Object.entries(parsed || {})) {
      const normalized = normalizeDoi(doi);
      const count = Number(value);
      if (normalized && Number.isFinite(count) && count >= 0) counts[normalized] = Math.floor(count);
    }
    return counts;
  } catch {
    return {};
  }
}

function writeReaderCountsCache(counts: Record<string, number>): void {
  try {
    localStorage.setItem(READER_COUNTS_CACHE_KEY, JSON.stringify(counts));
  } catch { /* reader-count cache is best effort */ }
}

function readReaderOpenQueue(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_OPEN_QUEUE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(value => normalizeDoi(String(value))).filter((value): value is string => Boolean(value)))].slice(-READER_OPEN_QUEUE_LIMIT);
  } catch {
    return [];
  }
}

function writeReaderOpenQueue(dois: string[]): void {
  try {
    localStorage.setItem(READER_OPEN_QUEUE_KEY, JSON.stringify([...new Set(dois)].slice(-READER_OPEN_QUEUE_LIMIT)));
  } catch { /* reader-open queue is best effort */ }
}

function enqueueReaderOpen(doi: string): void {
  const queue = readReaderOpenQueue();
  if (!queue.includes(doi)) queue.push(doi);
  writeReaderOpenQueue(queue);
}

async function postReaderOpen(doi: string): Promise<{ count?: number }> {
  const response = await fetch(`${WORKER_API_BASE}/api/user-ui/reader-counts/mark`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doi }),
    keepalive: true,
    signal: AbortSignal.timeout(OPTIONAL_CLOUD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Worker ${response.status}`);
  return response.json() as Promise<{ count?: number }>;
}

function enqueueSiteFeedback(payload: SiteFeedbackPayload): void {
  const queue = readSiteFeedbackQueue();
  queue.push({ id: newId('feedback'), createdAt: Date.now(), attempts: 0, payload });
  writeSiteFeedbackQueue(queue);
}

async function postSiteFeedback(payload: SiteFeedbackPayload): Promise<'accepted' | 'rate_limited' | 'retryable'> {
  try {
    const response = await fetch(`${WORKER_API_BASE}/api/user-ui/site-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(OPTIONAL_CLOUD_TIMEOUT_MS),
    });
    if (response.status === 429) return 'rate_limited';
    if (response.ok) return 'accepted';
    return response.status >= 500 || response.status === 408 ? 'retryable' : 'retryable';
  } catch {
    return 'retryable';
  }
}

async function workerPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${WORKER_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPTIONAL_CLOUD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Worker ${response.status}`);
  return response.json() as Promise<T>;
}

async function workerGet<T>(path: string): Promise<T> {
  const response = await fetch(`${WORKER_API_BASE}${path}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Worker ${response.status}`);
  return response.json() as Promise<T>;
}

class Store extends EventTarget {
  state = load();
  readonly profileId = browserProfile();
  readerCounts: Record<string, number> = readReaderCountsCache();
  private feedbackFlushRunning = false;
  private readerOpenFlushRunning = false;
  private readonly summaryCache = new Map<string, ArticleSummaryResult>();
  private metadataSaveQueued = false;
  private readonly countLoader = new ReaderCountLoader(
    async dois => (await workerPost<{ counts?: Record<string, number> }>('/api/user-ui/reader-counts', { dois })).counts,
    counts => {
      let changed = false;
      for (const [doi, count] of Object.entries(counts)) {
        if (this.readerCounts[doi] !== count) changed = true;
        this.readerCounts[doi] = count;
      }
      if (changed) {
        writeReaderCountsCache(this.readerCounts);
        this.dispatchEvent(new CustomEvent('counts', { detail: { dois: Object.keys(counts) } }));
      }
    },
  );

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.flushSiteFeedbackQueue();
        void this.flushReaderOpenQueue();
      });
      window.setInterval(() => {
        void this.flushSiteFeedbackQueue();
        void this.flushReaderOpenQueue();
      }, 5 * 60 * 1000);
      window.setTimeout(() => {
        void this.flushSiteFeedbackQueue();
        void this.flushReaderOpenQueue();
      }, 1500);
    }
  }

  private async flushReaderOpenQueue(): Promise<void> {
    if (this.readerOpenFlushRunning) return;
    const queue = readReaderOpenQueue();
    if (!queue.length) return;
    this.readerOpenFlushRunning = true;
    const remaining: string[] = [];
    try {
      for (let index = 0; index < queue.length; index += 1) {
        const doi = queue[index];
        try {
          const data = await postReaderOpen(doi);
          if (typeof data.count === 'number') {
            this.countLoader.noteMark(doi);
            const changed = this.readerCounts[doi] !== data.count;
            this.readerCounts[doi] = data.count;
            writeReaderCountsCache(this.readerCounts);
            if (changed) this.dispatchEvent(new CustomEvent('counts', { detail: { doi } }));
          }
        } catch {
          remaining.push(...queue.slice(index));
          break;
        }
      }
    } finally {
      writeReaderOpenQueue(remaining);
      this.readerOpenFlushRunning = false;
    }
  }

  private async flushSiteFeedbackQueue(): Promise<void> {
    if (this.feedbackFlushRunning) return;
    const queue = readSiteFeedbackQueue();
    if (!queue.length) return;
    this.feedbackFlushRunning = true;
    const remaining: QueuedSiteFeedback[] = [];
    try {
      for (const item of queue) {
        const result = await postSiteFeedback(item.payload);
        if (result === 'accepted') continue;
        remaining.push({ ...item, attempts: item.attempts + 1 });
        if (result === 'rate_limited' || result === 'retryable') {
          remaining.push(...queue.slice(queue.indexOf(item) + 1));
          break;
        }
      }
      writeSiteFeedbackQueue(remaining);
    } finally {
      this.feedbackFlushRunning = false;
    }
  }

  async articleSummary(doi: string, refresh = false): Promise<ArticleSummaryResult> {
    const normalized = normalizeDoi(doi);
    if (!normalized) throw new Error('invalid_doi');
    if (!refresh) {
      const cached = this.summaryCache.get(normalized);
      if (cached) return cached;
    }
    const data = await workerGet<ArticleSummaryResult>(`/api/user-ui/article-summary?doi=${encodeURIComponent(normalized)}`);
    this.summaryCache.set(normalized, data);
    return data;
  }

  save(broadcast = true, detail?: { paperId?: string; scope?: 'paper' | 'global' }): void {
    this.metadataSaveQueued = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* optional */ }
    if (broadcast) this.dispatchEvent(new CustomEvent('change', { detail: detail || { scope: 'global' } }));
  }
  paper(id: string): PaperUserState { return this.state.papers[id] || { favorite: false, collections: [], note: '', quickTerms: [], tags: [] }; }
  updatePaper(id: string, updater: (value: PaperUserState) => void, broadcast = true, markUpdated = true): void {
    const value = structuredClone(this.paper(id));
    updater(value);
    if (markUpdated) value.updatedAt = Date.now();
    this.state.papers[id] = value;
    this.save(false);
    if (broadcast) {
      this.dispatchEvent(new CustomEvent('change', { detail: { scope: 'paper', paperId: id } }));
    }
  }
  registerMeta(meta: PaperMeta): void {
    const next = { id: meta.id, doi: meta.doi, title: meta.title, journal: meta.journal, href: meta.href };
    const previous = this.state.metadata[meta.id];
    if (previous && previous.id === next.id && previous.doi === next.doi && previous.title === next.title && previous.journal === next.journal && previous.href === next.href) return;
    // Metadata is immediately available to newly mounted components, but
    // serialize the full state only once for this synchronous card batch.
    this.state.metadata[meta.id] = next;
    if (this.metadataSaveQueued) return;
    this.metadataSaveQueued = true;
    queueMicrotask(() => { if (this.metadataSaveQueued) this.save(false); });
  }
  metadata(id: string): Omit<PaperMeta, 'authors' | 'topics'> | undefined { return this.state.metadata[id]; }
  status(id: string): StatusDef | undefined { return this.state.statuses.find(item => item.id === id); }
  isRead(id: string): boolean { const status = this.status(this.paper(id).statusId || ''); return status?.countsAsRead === true; }
  toggleFavorite(id: string): void {
    this.updatePaper(id, paper => {
      paper.favorite = !paper.favorite;
      if (paper.favorite && !paper.collections.length) paper.collections = ['default'];
      if (!paper.favorite) paper.collections = [];
    });
  }
  setStatusGlow(id: string, glow: StatusGlow): boolean {
    const target = this.status(id)?.style;
    if (!target || !STATUS_GLOWS.includes(glow)) return false;
    const previous = target.glow;
    target.glow = glow;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch {
      if (previous === undefined) delete target.glow; else target.glow = previous;
      return false;
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { scope: 'global' } }));
    return true;
  }
  setStatusGlowWidth(id: string, width: number): boolean {
    const target = this.status(id)?.style;
    if (!target || !Number.isInteger(width) || width < 1 || width > 6) return false;
    const previous = target.glowWidth;
    target.glowWidth = width;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch {
      if (previous === undefined) delete target.glowWidth; else target.glowWidth = previous;
      return false;
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { scope: 'global' } }));
    return true;
  }
  setStatus(id: string, statusId: string): void {
    this.updatePaper(id, paper => { if (statusId) paper.statusId = statusId; else delete paper.statusId; });
  }
  setNote(id: string, note: string, broadcast = false): void { this.updatePaper(id, paper => { paper.note = note; paper.noteUpdatedAt = Date.now(); }, broadcast); }
  touchOpened(id: string): void { this.updatePaper(id, paper => { paper.lastOpenedAt = Date.now(); }, false, false); }
  addHistory(query: string): void { const value = query.trim(); if (!value) return; this.state.searchHistory = [value, ...this.state.searchHistory.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 20); this.save(false); }
  follow(query: string): void { const value = query.trim(); if (value && !this.state.followedSearches.some(item => item.toLowerCase() === value.toLowerCase())) { this.state.followedSearches.unshift(value); this.save(); } }
  async loadCounts(dois: string[]): Promise<void> {
    const unique = [...new Set(dois.map(normalizeDoi).filter((value): value is string => Boolean(value)))];
    await this.countLoader.load(unique);
  }
  async recordOpen(doi: string): Promise<void> {
    const normalized = normalizeDoi(doi);
    if (!normalized) return;
    enqueueReaderOpen(normalized);
    await this.flushReaderOpenQueue();
  }
  async feedback(doi: string, kind: string, note: string): Promise<boolean> {
    try { await workerPost('/api/user-ui/feedback', { doi, profileId: this.profileId, kind, note: note.slice(0, 1000) }); return true; } catch { return false; }
  }
  async siteFeedback(category: string, message: string, context: { pagePath?: string; language?: string; searchQuery?: string; viewportWidth?: number; viewportHeight?: number; imageData?: string; imageName?: string } = {}): Promise<'accepted' | 'queued' | 'rate_limited'> {
    const payload: SiteFeedbackPayload = {
      profileId: this.profileId,
      category,
      message: message.slice(0, 2000),
      ...context,
    };
    const result = await postSiteFeedback(payload);
    if (result === 'accepted') {
      void this.flushSiteFeedbackQueue();
      return 'accepted';
    }
    if (result === 'rate_limited') return 'rate_limited';
    enqueueSiteFeedback(payload);
    return 'queued';
  }
  private commitStatusImage(target: StyleDef, next: StatusImageStyle): void {
    const keys = ['imageData', 'imageOriginal', 'imageCrop'] as const;
    const previous: StatusImageStyle = { imageData: target.imageData, imageOriginal: target.imageOriginal, imageCrop: target.imageCrop };
    const assign = (value: StatusImageStyle): void => {
      for (const key of keys) delete target[key];
      Object.assign(target, Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined)));
    };
    assign(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch (error) { assign(previous); throw error; }
    this.dispatchEvent(new CustomEvent('change', { detail: { scope: 'global' } }));
  }
  async cropStatusImage(target: StyleDef, file?: File): Promise<boolean> {
    const id = this.state.statuses.find(item => item.style === target)?.id;
    if (!id || (!file && !target.imageData)) return false;
    const job = Symbol('crop-status-image'); this.statusImageJobs.set(id, job);
    const fingerprint = imageFingerprint(target);
    const snapshot = structuredClone({ imageData: target.imageData, imageOriginal: target.imageOriginal, imageCrop: target.imageCrop });
    const prepared = await prepareCroppedStatusImage(snapshot, file);
    const live = this.status(id)?.style;
    if (!prepared || this.statusImageJobs.get(id) !== job || !live || imageFingerprint(live) !== fingerprint) return false;
    this.commitStatusImage(live, prepared);
    return true;
  }
  restoreStatusImage(target: StyleDef): boolean {
    const id = this.state.statuses.find(item => item.style === target)?.id;
    if (!id || !target.imageCrop) return false;
    this.statusImageJobs.set(id, Symbol('restore-status-image'));
    this.commitStatusImage(target, { imageData: target.imageCrop.sourcePreview, imageOriginal: target.imageOriginal });
    return true;
  }
  private readonly statusImageJobs = new Map<string, symbol>();
  async setOriginalStatusImage(target: StyleDef, file: File): Promise<boolean> {
    const statusId = this.state.statuses.find(item => item.style === target)?.id;
    if (!statusId) return false;
    const job = Symbol('status-image');
    this.statusImageJobs.set(statusId, job);
    const previousData = target.imageData;
    const previousId = target.imageOriginal?.id;
    const prepared = await prepareStatusImage(file);
    const live = this.status(statusId)?.style;
    // Newer selections/removal or a remote image replacement win over this load.
    if (this.statusImageJobs.get(statusId) !== job || !live || live.imageData !== previousData || live.imageOriginal?.id !== previousId) return false;
    this.commitStatusImage(live, prepared);
    return true;
  }
  clearImage(target: StyleDef): void {
    const statusId = this.state.statuses.find(item => item.style === target)?.id;
    if (statusId) this.statusImageJobs.set(statusId, Symbol('removed'));
    delete target.imageData;
    delete target.imageOriginal;
    delete target.imageCrop;
    this.save();
  }
  async setImage(target: StyleDef, file: File): Promise<void> {
    const statusId = this.state.statuses.find(item => item.style === target)?.id;
    if (statusId) { await this.cropStatusImage(target, file); return; }
    const actionKey = (Object.entries(this.state.actionStyles) as Array<[ActionKey, StyleDef]>).find(([, style]) => style === target)?.[0];
    const quickTermId = this.state.quickTerms.find(item => item.style === target)?.id;
    const collectionId = this.state.collections.find(item => item.style === target)?.id;
    const job = Symbol('cropped-image');
    if (statusId) this.statusImageJobs.set(statusId, job);
    const cropped = await cropUserImage(file);
    if (statusId && this.statusImageJobs.get(statusId) !== job) return;
    if (!cropped) return;

    const liveTarget = statusId
      ? this.status(statusId)?.style
      : actionKey
        ? this.state.actionStyles[actionKey]
        : quickTermId
          ? this.state.quickTerms.find(item => item.id === quickTermId)?.style
          : collectionId
            ? this.state.collections.find(item => item.id === collectionId)?.style
            : target;
    if (!liveTarget) return;
    delete liveTarget.imageOriginal;
    liveTarget.imageData = cropped.imageData;
    if (cropped.circular) liveTarget.shape = 'circle';
    this.save();
  }
}

export const store = new Store();
export function makeId(prefix: string): string { return newId(prefix); }
