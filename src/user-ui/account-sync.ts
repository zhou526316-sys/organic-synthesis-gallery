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

function mergePaper(remote: any = {}, local: any = {}, localWins = true): any {
  const remoteNoteAt = Number(remote.noteUpdatedAt || 0);
  const localNoteAt = Number(local.noteUpdatedAt || 0);
  const noteSource = localNoteAt > remoteNoteAt ? local : remote;
  const base = localWins ? { ...remote, ...local } : { ...local, ...remote };
  return {
    ...base,
    favorite: Boolean(remote.favorite || local.favorite),
    collections: union(remote.collections, local.collections),
    quickTerms: union(remote.quickTerms, local.quickTerms),
    tags: union(remote.tags, local.tags),
    note: noteSource.note || '',
    noteUpdatedAt: Math.max(remoteNoteAt, localNoteAt) || undefined,
    lastOpenedAt: Math.max(Number(remote.lastOpenedAt || 0), Number(local.lastOpenedAt || 0)) || undefined,
  };
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

function applyRemote(account: NonNullable<SyncResponse['account']>, localWins = false): void {
  applyingRemote = true;
  store.state = mergeStates(account.state, store.state, localWins);
  rememberAccount(account.userId, account.revision);
  store.save();
  applyingRemote = false;
}

async function initialMerge(): Promise<void> {
  const result = await request('account-merge', store.state);
  if (!result.ok || !result.body.account) {
    if (result.status === 401) clearRememberedAccount();
    return;
  }
  applyingRemote = true;
  store.state = result.body.account.state;
  rememberAccount(result.body.account.userId, result.body.account.revision);
  store.save();
  applyingRemote = false;
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
