import { store, WORKER_API_BASE, type UserUiState } from './shared';

const SESSION_KEY = 'organic-gallery-session-v1';
const SYNC_REVISION_KEY = 'organic-gallery-account-sync-revision-v1';
const SYNC_USER_KEY = 'organic-gallery-account-sync-user-v1';
const POLL_INTERVAL_MS = 45_000;
const TOKEN_WATCH_MS = 800;
const SAVE_DEBOUNCE_MS = 700;

interface SyncResponse {
  account?: {
    userId: string;
    revision: number;
    updatedAt: number;
    state: UserUiState;
  };
  error?: string;
}

let activeToken = '';
let activeUserId = '';
let revision = 0;
let applyingRemote = false;
let saveTimer: number | undefined;
let saving = false;
let queuedSave = false;

function sessionToken(): string {
  try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function storedRevision(): number {
  try { return Number(localStorage.getItem(SYNC_REVISION_KEY) || '0') || 0; } catch { return 0; }
}

function storedUserId(): string {
  try { return localStorage.getItem(SYNC_USER_KEY) || ''; } catch { return ''; }
}

function rememberAccount(userId: string, nextRevision: number): void {
  activeUserId = userId;
  revision = nextRevision;
  try {
    localStorage.setItem(SYNC_USER_KEY, userId);
    localStorage.setItem(SYNC_REVISION_KEY, String(nextRevision));
  } catch { /* optional */ }
}

function clearRememberedAccount(): void {
  activeUserId = '';
  revision = 0;
  try {
    localStorage.removeItem(SYNC_USER_KEY);
    localStorage.removeItem(SYNC_REVISION_KEY);
  } catch { /* optional */ }
}

function byId<T extends { id: string }>(remote: T[] = [], local: T[] = [], localWins = true): T[] {
  const map = new Map<string, T>();
  const first = localWins ? remote : local;
  const second = localWins ? local : remote;
  first.forEach(item => item?.id && map.set(item.id, item));
  second.forEach(item => item?.id && map.set(item.id, item));
  return [...map.values()];
}

function union(remote: string[] = [], local: string[] = []): string[] {
  return [...new Set([...remote, ...local].filter(Boolean))];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item)))] : [];
}

function mergePaper(remote: any = {}, local: any = {}, localWins = true): any {
  const remoteUpdatedAt = Number(remote?.updatedAt || 0);
  const localUpdatedAt = Number(local?.updatedAt || 0);
  const remoteNoteAt = Number(remote?.noteUpdatedAt || 0);
  const localNoteAt = Number(local?.noteUpdatedAt || 0);
  const lastOpenedAt = Math.max(Number(remote?.lastOpenedAt || 0), Number(local?.lastOpenedAt || 0)) || undefined;

  // Records created before updatedAt existed keep the old additive behavior so
  // upgrading does not silently discard saved state. As soon as either side has
  // a real edit timestamp, the newer paper snapshot wins, which makes removals
  // (unsave, clear status/folders/tags) durable across devices.
  if (!remoteUpdatedAt && !localUpdatedAt) {
    const noteSource = localNoteAt > remoteNoteAt ? local : remote;
    const base = localWins ? { ...remote, ...local } : { ...local, ...remote };
    return {
      ...base,
      favorite: Boolean(remote.favorite || local.favorite),
      collections: union(remote.collections, local.collections),
      quickTerms: union(remote.quickTerms, local.quickTerms),
      tags: union(remote.tags, local.tags),
      note: typeof noteSource?.note === 'string' ? noteSource.note : '',
      noteUpdatedAt: Math.max(remoteNoteAt, localNoteAt) || undefined,
      lastOpenedAt,
    };
  }

  const generalSource = remoteUpdatedAt === localUpdatedAt
    ? (localWins ? local : remote)
    : (localUpdatedAt > remoteUpdatedAt ? local : remote);
  const otherSource = generalSource === local ? remote : local;
  const noteSource = remoteNoteAt === localNoteAt
    ? generalSource
    : (localNoteAt > remoteNoteAt ? local : remote);
  const merged = {
    ...otherSource,
    ...generalSource,
    favorite: Boolean(generalSource?.favorite),
    collections: stringList(generalSource?.collections),
    quickTerms: stringList(generalSource?.quickTerms),
    tags: stringList(generalSource?.tags),
    note: typeof noteSource?.note === 'string' ? noteSource.note : '',
    noteUpdatedAt: Math.max(remoteNoteAt, localNoteAt) || undefined,
    updatedAt: Math.max(remoteUpdatedAt, localUpdatedAt) || undefined,
    lastOpenedAt,
  } as any;

  // Object spreading cannot express deletion of an optional field, so explicitly
  // remove a stale status when the newest snapshot says the status is unset.
  if (typeof generalSource?.statusId === 'string' && generalSource.statusId) merged.statusId = generalSource.statusId;
  else delete merged.statusId;
  return merged;
}

function mergeStates(remote: UserUiState, local: UserUiState, localWins = true): UserUiState {
  const papers: UserUiState['papers'] = {};
  const ids = new Set([...Object.keys(remote?.papers || {}), ...Object.keys(local?.papers || {})]);
  ids.forEach(id => { papers[id] = mergePaper(remote?.papers?.[id], local?.papers?.[id], localWins); });

  return {
    statuses: byId(remote?.statuses, local?.statuses, localWins),
    quickTerms: byId(remote?.quickTerms, local?.quickTerms, localWins),
    collections: byId(remote?.collections, local?.collections, localWins),
    aliases: byId(remote?.aliases, local?.aliases, localWins),
    actionStyles: localWins ? { ...(remote?.actionStyles || {}), ...(local?.actionStyles || {}) } : { ...(local?.actionStyles || {}), ...(remote?.actionStyles || {}) },
    papers,
    metadata: localWins ? { ...(remote?.metadata || {}), ...(local?.metadata || {}) } : { ...(local?.metadata || {}), ...(remote?.metadata || {}) },
    followedSearches: union(remote?.followedSearches, local?.followedSearches).slice(0, 100),
    searchHistory: union(remote?.searchHistory, local?.searchHistory).slice(0, 50),
    hideRead: localWins ? Boolean(local?.hideRead) : Boolean(remote?.hideRead),
  };
}

async function request(mode: 'account-merge' | 'account-save' | 'account-pull', state?: UserUiState): Promise<{ ok: boolean; status: number; body: SyncResponse }> {
  const token = sessionToken();
  if (!token) return { ok: false, status: 401, body: { error: 'not_signed_in' } };
  const response = await fetch(`${WORKER_API_BASE}/api/user-ui/reader-counts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode,
      sessionToken: token,
      profileId: store.profileId,
      revision,
      state,
    }),
  });
  const body = await response.json().catch(() => ({})) as SyncResponse;
  return { ok: response.ok, status: response.status, body };
}

async function initialMerge(): Promise<void> {
  // Pull first and merge locally. The original server-side account-merge used
  // OR/union semantics, which could resurrect a favorite or tag that a newer
  // device had deliberately removed.
  const pulled = await request('account-pull');
  if (!pulled.ok || !pulled.body.account) {
    if (pulled.status === 401) clearRememberedAccount();
    return;
  }

  const localState = store.state;
  const merged = mergeStates(pulled.body.account.state, localState, true);
  applyingRemote = true;
  store.state = merged;
  rememberAccount(pulled.body.account.userId, pulled.body.account.revision);
  store.save();
  applyingRemote = false;

  const saved = await request('account-save', merged);
  if (saved.status === 409 && saved.body.account) {
    const retryMerged = mergeStates(saved.body.account.state, merged, true);
    applyingRemote = true;
    store.state = retryMerged;
    rememberAccount(saved.body.account.userId, saved.body.account.revision);
    store.save();
    applyingRemote = false;
    const retried = await request('account-save', retryMerged);
    if (retried.ok && retried.body.account) rememberAccount(retried.body.account.userId, retried.body.account.revision);
    return;
  }
  if (saved.ok && saved.body.account) rememberAccount(saved.body.account.userId, saved.body.account.revision);
}

async function pullRemote(): Promise<void> {
  if (!activeToken || saving) return;
  const result = await request('account-pull');
  if (!result.ok || !result.body.account) return;
  if (result.body.account.revision > revision) {
    applyingRemote = true;
    store.state = result.body.account.state;
    rememberAccount(result.body.account.userId, result.body.account.revision);
    store.save();
    applyingRemote = false;
  }
}

async function saveRemote(): Promise<void> {
  if (!activeToken || applyingRemote) return;
  if (saving) { queuedSave = true; return; }
  saving = true;
  try {
    let result = await request('account-save', store.state);
    if (result.status === 409 && result.body.account) {
      const merged = mergeStates(result.body.account.state, store.state, true);
      applyingRemote = true;
      store.state = merged;
      rememberAccount(result.body.account.userId, result.body.account.revision);
      store.save();
      applyingRemote = false;
      result = await request('account-save', merged);
    }
    if (result.ok && result.body.account) rememberAccount(result.body.account.userId, result.body.account.revision);
  } finally {
    saving = false;
    if (queuedSave) { queuedSave = false; void saveRemote(); }
  }
}

function scheduleSave(): void {
  if (!activeToken || applyingRemote) return;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { saveTimer = undefined; void saveRemote(); }, SAVE_DEBOUNCE_MS);
}

async function detectSessionChange(): Promise<void> {
  const token = sessionToken();
  if (token === activeToken) return;
  activeToken = token;
  if (!token) {
    clearRememberedAccount();
    return;
  }
  const rememberedUser = storedUserId();
  revision = rememberedUser ? storedRevision() : 0;
  await initialMerge();
}

store.addEventListener('change', scheduleSave);
activeToken = sessionToken();
activeUserId = storedUserId();
revision = activeUserId ? storedRevision() : 0;
if (activeToken) void initialMerge();
window.setInterval(() => { void detectSessionChange(); }, TOKEN_WATCH_MS);
window.setInterval(() => { if (activeToken) void pullRemote(); }, POLL_INTERVAL_MS);