export type Language = 'zh' | 'en';
export type Shape = 'pill' | 'rounded' | 'rectangle' | 'circle' | 'square' | 'diamond' | 'bookmark' | 'star';
export type RGB = [number, number, number];
export type ActionKey = 'favorite' | 'status' | 'note' | 'more' | 'login' | 'support';
export type SuggestionType = 'author' | 'keyword' | 'journal' | 'doi';

export interface StyleDef { rgb: RGB; shape: Shape; imageData?: string; }
export interface StatusDef { id: string; name: string; style: StyleDef; countsAsRead: boolean; }
export interface QuickTerm { id: string; label: string; style: StyleDef; }
export interface CollectionDef { id: string; name: string; }
export interface AliasGroup { id: string; name: string; terms: string[]; }
export interface PaperMeta { id: string; doi?: string; title: string; journal: string; href?: string; authors: string[]; topics: string[]; }
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
      { id: 'default', name: '默认收藏' },
      { id: 'project', name: '我的课题' },
      { id: 'group', name: 'Group Meeting' },
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
      collections: Array.isArray(saved.collections) && saved.collections.length ? saved.collections : base.collections,
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

async function workerPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${WORKER_API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Worker ${response.status}`);
  return response.json() as Promise<T>;
}

class Store extends EventTarget {
  state = load();
  readonly profileId = browserProfile();
  readerCounts: Record<string, number> = {};

  save(broadcast = true, detail?: { paperId?: string; scope?: 'paper' | 'global' }): void {
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
  registerMeta(meta: PaperMeta): void { this.state.metadata[meta.id] = { id: meta.id, doi: meta.doi, title: meta.title, journal: meta.journal, href: meta.href }; this.save(false); }
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
  setStatus(id: string, statusId: string): void {
    this.updatePaper(id, paper => { if (statusId) paper.statusId = statusId; else delete paper.statusId; });
    const meta = this.metadata(id); const status = this.status(statusId);
    if (meta?.doi && status?.countsAsRead) void this.markRead(meta.doi, statusId);
  }
  setNote(id: string, note: string, broadcast = false): void { this.updatePaper(id, paper => { paper.note = note; paper.noteUpdatedAt = Date.now(); }, broadcast); }
  touchOpened(id: string): void { this.updatePaper(id, paper => { paper.lastOpenedAt = Date.now(); }, false, false); }
  addHistory(query: string): void { const value = query.trim(); if (!value) return; this.state.searchHistory = [value, ...this.state.searchHistory.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 20); this.save(false); }
  follow(query: string): void { const value = query.trim(); if (value && !this.state.followedSearches.some(item => item.toLowerCase() === value.toLowerCase())) { this.state.followedSearches.unshift(value); this.save(); } }
  async loadCounts(dois: string[]): Promise<void> {
    const unique = [...new Set(dois.map(normalizeDoi).filter((value): value is string => Boolean(value)))];
    try {
      for (let i = 0; i < unique.length; i += 150) {
        const data = await workerPost<{ counts?: Record<string, number> }>('/api/user-ui/reader-counts', { dois: unique.slice(i, i + 150) });
        Object.assign(this.readerCounts, data.counts || {});
      }
      this.dispatchEvent(new CustomEvent('counts', { detail: { dois: unique } }));
    } catch { /* aggregate counts are optional */ }
  }
  private async markRead(doi: string, statusId: string): Promise<void> {
    try {
      const data = await workerPost<{ count?: number }>('/api/user-ui/reader-counts/mark', { doi, profileId: this.profileId, statusId });
      if (typeof data.count === 'number') {
        this.readerCounts[doi] = data.count;
        this.dispatchEvent(new CustomEvent('counts', { detail: { doi } }));
      }
    } catch { /* local reading state still succeeds */ }
  }
  async feedback(doi: string, kind: string, note: string): Promise<boolean> {
    try { await workerPost('/api/user-ui/feedback', { doi, profileId: this.profileId, kind, note: note.slice(0, 1000) }); return true; } catch { return false; }
  }
  async siteFeedback(category: string, message: string, context: { pagePath?: string; language?: string; searchQuery?: string; viewportWidth?: number; viewportHeight?: number } = {}): Promise<'accepted' | 'rate_limited' | 'failed'> {
    try {
      const response = await fetch(`${WORKER_API_BASE}/api/user-ui/site-feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profileId: this.profileId,
          category,
          message: message.slice(0, 2000),
          ...context,
        }),
      });
      if (response.status === 429) return 'rate_limited';
      return response.ok ? 'accepted' : 'failed';
    } catch {
      return 'failed';
    }
  }
  async setImage(target: StyleDef, file: File): Promise<void> {
    if (!file.type.startsWith('image/') || file.size > 4_000_000) return;
    const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; });
    const scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height); target.imageData = canvas.toDataURL('image/png'); this.save();
  }
}

export const store = new Store();
export function makeId(prefix: string): string { return newId(prefix); }
