import { store, WORKER_API_BASE, type UserUiState } from './shared';

const SESSION_KEY = 'organic-gallery-session-v1';
const SYNC_REVISION_KEY = 'organic-gallery-account-sync-revision-v1';
const SYNC_USER_KEY = 'organic-gallery-account-sync-user-v1';
const POLL_INTERVAL_MS = 45_000;
const TOKEN_WATCH_MS = 800;
const SAVE_DEBOUNCE_MS = 700;
const V3_PAGE_LIMIT = 100;
const V3_MAX_PAGES_PER_SYNC = 2000;
const V3_MUTATION_OP_LIMIT = 32;
const V3_MUTATION_TARGET_BYTES = 1_500_000;

type SyncMode =
  | 'account-merge'
  | 'account-save'
  | 'account-pull'
  | 'account-v3-head'
  | 'account-v3-page'
  | 'account-v3-delta'
  | 'account-v3-mutate';

interface V3Head {
  ready: true;
  revision: number;
  updatedAt: number;
  globalState: Record<string, unknown>;
  globalRevision: number;
  paperCount: number;
  metadataCount: number;
  changeFloorRevision: number;
  papersSplit: boolean;
  metadataSplit: boolean;
}

interface V3Row {
  paperKey: string;
  doi?: string | null;
  paperPresent?: boolean;
  paperState?: unknown;
  metadataPresent?: boolean;
  metadata?: unknown;
  deleted?: boolean;
  revision?: number;
  updatedAt?: number;
  op?: 'upsert' | 'delete';
}

interface AccountPayload {
  userId: string;
  revision?: number;
  updatedAt?: number;
  state?: UserUiState;
  readPath?: string;
  ready?: boolean;
  globalState?: Record<string, unknown>;
  globalRevision?: number;
  paperCount?: number;
  metadataCount?: number;
  changeFloorRevision?: number;
  papersSplit?: boolean;
  metadataSplit?: boolean;
  scanStartRevision?: number;
  head?: V3Head;
  rows?: V3Row[];
  changes?: V3Row[];
  count?: number;
  hasMore?: boolean;
  nextKey?: string | null;
  nextCursor?: { revision: number; seq: number } | null;
  sinceRevision?: number;
  targetRevision?: number;
  resetRequired?: boolean;
  reason?: string;
  writeEnabled?: boolean;
  operationCount?: number;
}


interface SyncResponse {
  account?: AccountPayload;
  error?: string;
  currentRevision?: number;
  writeEnabled?: boolean;
}

interface RemoteAccount {
  userId: string;
  revision: number;
  updatedAt: number;
  state: UserUiState;
  readPath: 'v3' | 'legacy';
  writeEnabled: boolean;
}


type V3Outcome =
  | { kind: 'ok'; account: RemoteAccount }
  | { kind: 'reset' }
  | { kind: 'unauthorized' }
  | { kind: 'fallback' };

type V3SaveOutcome =
  | { kind:'ok' }
  | { kind:'conflict'; currentRevision:number }
  | { kind:'unauthorized' }
  | { kind:'failure' };

type PersistOutcome =
  | { kind:'ok'; state:UserUiState }
  | { kind:'unauthorized' }
  | { kind:'failure' };

let activeToken = '';
let activeUserId = '';
let revision = 0;
let applyingRemote = false;
let saveTimer: number | undefined;
let saving = false;
let queuedSave = false;
let syncedState: UserUiState | null = null;
let v3WriteActive = false;
let dirtyGlobal = false;
const dirtyPaperKeys = new Set<string>();

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
  syncedState = null;
  v3WriteActive = false;
  dirtyGlobal = false;
  dirtyPaperKeys.clear();
  setWriteDiagnostic('none');
  try {
    localStorage.removeItem(SYNC_USER_KEY);
    localStorage.removeItem(SYNC_REVISION_KEY);
  } catch { /* optional */ }
}

function setReadDiagnostic(mode: 'v3' | 'legacy' | 'none'): void {
  document.documentElement.dataset.accountSyncRead = mode;
}

function setWriteDiagnostic(mode: 'v3' | 'legacy' | 'none'): void {
  document.documentElement.dataset.accountSyncWrite = mode;
}

function globalStateOf(state: UserUiState): Omit<UserUiState, 'papers' | 'metadata'> {
  return {
    statuses: state.statuses,
    quickTerms: state.quickTerms,
    collections: state.collections,
    aliases: state.aliases,
    actionStyles: state.actionStyles,
    followedSearches: state.followedSearches,
    searchHistory: state.searchHistory,
    hideRead: state.hideRead,
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowSnapshotFor(state: UserUiState, key: string): {
  paperPresent: boolean;
  paperState?: UserUiState['papers'][string];
  metadataPresent: boolean;
  metadata?: UserUiState['metadata'][string];
} {
  const paperPresent = Object.prototype.hasOwnProperty.call(state.papers || {}, key);
  const metadataPresent = Object.prototype.hasOwnProperty.call(state.metadata || {}, key);
  return {
    paperPresent,
    paperState: paperPresent ? state.papers[key] : undefined,
    metadataPresent,
    metadata: metadataPresent ? state.metadata[key] : undefined,
  };
}

function mutationOperation(base: UserUiState, target: UserUiState, key: string): Record<string, unknown> | null {
  const before = rowSnapshotFor(base,key);
  const after = rowSnapshotFor(target,key);
  if (before.paperPresent === after.paperPresent
    && before.metadataPresent === after.metadataPresent
    && sameJson(before.paperState,after.paperState)
    && sameJson(before.metadata,after.metadata)) return null;
  if (!after.paperPresent && !after.metadataPresent) return { paperKey:key, delete:true };
  const operation: Record<string, unknown> = { paperKey:key };
  if (after.paperPresent) operation.paperState = after.paperState;
  if (after.metadataPresent) operation.metadata = after.metadata;
  return operation;
}

function mutationBatches(operations: Record<string, unknown>[]): Record<string, unknown>[][] {
  const batches: Record<string, unknown>[][] = [];
  let batch: Record<string, unknown>[] = [];
  for (const operation of operations) {
    const candidate = [...batch,operation];
    const bytes = new TextEncoder().encode(JSON.stringify({ operations:candidate })).byteLength;
    if (batch.length && (candidate.length > V3_MUTATION_OP_LIMIT || bytes > V3_MUTATION_TARGET_BYTES)) {
      batches.push(batch);
      batch = [operation];
    } else {
      batch = candidate;
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function clearSyncedDirty(snapshot: UserUiState, keys: string[], globalWasDirty: boolean): void {
  for (const key of keys) {
    const current = rowSnapshotFor(store.state,key);
    const saved = rowSnapshotFor(snapshot,key);
    if (current.paperPresent === saved.paperPresent
      && current.metadataPresent === saved.metadataPresent
      && sameJson(current.paperState,saved.paperState)
      && sameJson(current.metadata,saved.metadata)) dirtyPaperKeys.delete(key);
  }
  if (globalWasDirty && sameJson(globalStateOf(store.state),globalStateOf(snapshot))) dirtyGlobal = false;
}

function relevantPaperKeys(base:UserUiState,target:UserUiState):Set<string>{
  return new Set([...Object.keys(base.papers || {}),...Object.keys(target.papers || {})]);
}

function markInitialDifferences(base: UserUiState, target: UserUiState): void {
  for (const key of relevantPaperKeys(base,target)) {
    if (mutationOperation(base,target,key)) dirtyPaperKeys.add(key);
  }
  if (!sameJson(globalStateOf(base),globalStateOf(target))) dirtyGlobal = true;
}

function allChangedKeys(base: UserUiState, target: UserUiState): string[] {
  return [...relevantPaperKeys(base,target)].filter(key=>Boolean(mutationOperation(base,target,key)));
}

function committedSubset(base: UserUiState, target: UserUiState, keys: string[], globalChanged: boolean): UserUiState {
  const next = cloneState(base);
  if (globalChanged) {
    const global = globalStateOf(target);
    next.statuses = structuredClone(global.statuses);
    next.quickTerms = structuredClone(global.quickTerms);
    next.collections = structuredClone(global.collections);
    next.aliases = structuredClone(global.aliases);
    next.actionStyles = structuredClone(global.actionStyles);
    next.followedSearches = structuredClone(global.followedSearches);
    next.searchHistory = structuredClone(global.searchHistory);
    next.hideRead = global.hideRead;
  }
  for (const key of keys) {
    const row = rowSnapshotFor(target,key);
    if (row.paperPresent) next.papers[key] = structuredClone(row.paperState!);
    else delete next.papers[key];
    if (row.metadataPresent) next.metadata[key] = structuredClone(row.metadata!);
    else delete next.metadata[key];
  }
  return next;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum = 0): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
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

function validGlobalState(value: unknown): value is Omit<UserUiState, 'papers' | 'metadata'> {
  if (!plainObject(value)) return false;
  return Array.isArray(value.statuses)
    && Array.isArray(value.quickTerms)
    && Array.isArray(value.collections)
    && Array.isArray(value.aliases)
    && plainObject(value.actionStyles)
    && Array.isArray(value.followedSearches)
    && Array.isArray(value.searchHistory)
    && typeof value.hideRead === 'boolean';
}

function v3Head(value: unknown): V3Head | null {
  if (!plainObject(value) || value.ready !== true) return null;
  const revisionValue = safeInteger(value.revision);
  const updatedAt = safeInteger(value.updatedAt);
  const globalRevision = safeInteger(value.globalRevision);
  const paperCount = safeInteger(value.paperCount);
  const metadataCount = safeInteger(value.metadataCount);
  const changeFloorRevision = safeInteger(value.changeFloorRevision);
  if (revisionValue === null || updatedAt === null || globalRevision === null
    || paperCount === null || metadataCount === null || changeFloorRevision === null
    || globalRevision > revisionValue || changeFloorRevision > revisionValue
    || !validGlobalState(value.globalState)
    || value.papersSplit !== true || value.metadataSplit !== true) return null;
  return {
    ready: true,
    revision: revisionValue,
    updatedAt,
    globalState: value.globalState,
    globalRevision,
    paperCount,
    metadataCount,
    changeFloorRevision,
    papersSplit: true,
    metadataSplit: true,
  };
}

function stateFromGlobal(
  globalState: unknown,
  papers: UserUiState['papers'],
  metadata: UserUiState['metadata'],
): UserUiState | null {
  if (!validGlobalState(globalState)) return null;
  return {
    ...(globalState as Omit<UserUiState, 'papers' | 'metadata'>),
    papers,
    metadata,
  };
}

function applyV3Row(state: UserUiState, row: V3Row): boolean {
  const key = typeof row?.paperKey === 'string' ? row.paperKey : '';
  if (!key) return false;
  if (row.op === 'delete' || row.deleted === true) {
    delete state.papers[key];
    delete state.metadata[key];
    return true;
  }
  if (row.paperPresent === true) {
    if (!plainObject(row.paperState)) return false;
    state.papers[key] = row.paperState as unknown as UserUiState['papers'][string];
  } else {
    delete state.papers[key];
  }
  if (row.metadataPresent === true) {
    if (!plainObject(row.metadata)) return false;
    state.metadata[key] = row.metadata as unknown as UserUiState['metadata'][string];
  } else {
    delete state.metadata[key];
  }
  return true;
}

function cloneState(value: UserUiState): UserUiState {
  return structuredClone(value);
}

function localDirty(): boolean {
  return dirtyGlobal || dirtyPaperKeys.size > 0;
}

function validUserId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function stateMatchesHead(state: UserUiState, head: V3Head): boolean {
  return Object.keys(state.papers || {}).length === head.paperCount
    && Object.keys(state.metadata || {}).length === head.metadataCount;
}

async function request(
  mode: SyncMode,
  options: { state?: UserUiState; [key: string]: unknown } = {},
): Promise<{ ok: boolean; status: number; body: SyncResponse }> {
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
      ...options,
    }),
  });
  const body = await response.json().catch(() => ({})) as SyncResponse;
  return { ok: response.ok, status: response.status, body };
}

function legacyAccount(result: { ok: boolean; status: number; body: SyncResponse }): RemoteAccount | null {
  const account = result.body.account;
  const nextRevision = safeInteger(account?.revision);
  const updatedAt = safeInteger(account?.updatedAt);
  const userId = validUserId(account?.userId);
  if (!result.ok || !account || !account.state || !userId || nextRevision === null || updatedAt === null) return null;
  return {
    userId,
    revision: nextRevision,
    updatedAt,
    state: account.state,
    readPath: 'legacy',
    writeEnabled: account.writeEnabled === true,
  };
}

async function legacyPull(): Promise<{ result: RemoteAccount | null; status: number }> {
  const response = await request('account-pull');
  return { result: legacyAccount(response), status: response.status };
}

async function saveViaV3(
  base: UserUiState,
  desired: UserUiState,
  keys: string[],
  globalWasDirty: boolean,
): Promise<V3SaveOutcome> {
  const operations = keys.map(key=>mutationOperation(base,desired,key))
    .filter((item): item is Record<string,unknown> => Boolean(item));
  const globalChanged = globalWasDirty && !sameJson(globalStateOf(base),globalStateOf(desired));
  const batches = mutationBatches(operations);
  let expectedRevision = revision;
  const expectedUserId = activeUserId;

  const send = async (options: Record<string,unknown>): Promise<V3SaveOutcome> => {
    const response = await request('account-v3-mutate',{expectedRevision,...options});
    if(response.status===401)return {kind:'unauthorized'};
    if(response.status===409&&response.body.error==='user_library_v3_revision_conflict'){
      return {kind:'conflict',currentRevision:safeInteger(response.body.currentRevision)||expectedRevision};
    }
    const account=response.body.account;
    const nextRevision=safeInteger(account?.revision);
    const userId=validUserId(account?.userId);
    if(!response.ok||!account||account.readPath!=='v3-mutate'||account.writeEnabled!==true
      ||nextRevision===null||nextRevision<=expectedRevision||!userId
      ||(expectedUserId&&userId!==expectedUserId))return {kind:'failure'};
    expectedRevision=nextRevision;
    rememberAccount(userId,nextRevision);
    return {kind:'ok'};
  };

  if(globalChanged){
    const outcome=await send({globalState:globalStateOf(desired),operations:[]});
    if(outcome.kind!=='ok')return outcome;
  }
  for(const batch of batches){
    const outcome=await send({operations:batch});
    if(outcome.kind!=='ok')return outcome;
  }

  syncedState=committedSubset(base,desired,keys,globalChanged);
  v3WriteActive=true;
  setWriteDiagnostic('v3');
  clearSyncedDirty(desired,keys,globalWasDirty);
  return {kind:'ok'};
}

async function recoveryPull(): Promise<{account:RemoteAccount|null;status:number}> {
  const v3=await v3FullPull();
  if(v3.kind==='ok')return {account:v3.account,status:200};
  if(v3.kind==='unauthorized')return {account:null,status:401};
  const legacy=await legacyPull();
  return {account:legacy.result,status:legacy.status};
}

function replaceStoreStateWithoutDirty(state:UserUiState):void{
  applyingRemote=true;
  store.state=state;
  store.save();
  applyingRemote=false;
}

async function persistV3Desired(
  desired:UserUiState,
  keys:string[],
  globalWasDirty:boolean,
  allowRecovery=true,
):Promise<PersistOutcome>{
  let base=syncedState;
  if(!base){
    const recovery=await recoveryPull();
    if(recovery.status===401)return {kind:'unauthorized'};
    if(!recovery.account)return {kind:'failure'};
    acceptRemoteBaseline(recovery.account);
    base=recovery.account.state;
    if(!recovery.account.writeEnabled)return persistLegacyDesired(desired,false);
  }

  const outcome=await saveViaV3(base,desired,keys,globalWasDirty);
  if(outcome.kind==='ok')return {kind:'ok',state:desired};
  if(outcome.kind==='unauthorized')return {kind:'unauthorized'};
  if(!allowRecovery)return {kind:'failure'};

  const recovery=await recoveryPull();
  if(recovery.status===401)return {kind:'unauthorized'};
  if(!recovery.account)return {kind:'failure'};
  acceptRemoteBaseline(recovery.account);
  const merged=mergeStates(recovery.account.state,desired,true);
  replaceStoreStateWithoutDirty(merged);
  if(!recovery.account.writeEnabled)return persistLegacyDesired(merged,false);

  const retryKeys=allChangedKeys(recovery.account.state,merged);
  const retryGlobal=!sameJson(globalStateOf(recovery.account.state),globalStateOf(merged));
  const retry=await saveViaV3(recovery.account.state,merged,retryKeys,retryGlobal);
  if(retry.kind==='ok')return {kind:'ok',state:merged};
  if(retry.kind==='unauthorized')return {kind:'unauthorized'};
  return {kind:'failure'};
}

async function persistLegacyDesired(desired:UserUiState,allowRecovery=true):Promise<PersistOutcome>{
  let response=await request('account-save',{state:desired});
  if(response.status===401)return {kind:'unauthorized'};

  if(response.status===409&&response.body.error==='user_library_client_upgrade_required'&&allowRecovery){
    const recovery=await recoveryPull();
    if(recovery.status===401)return {kind:'unauthorized'};
    if(!recovery.account||!recovery.account.writeEnabled)return {kind:'failure'};
    acceptRemoteBaseline(recovery.account);
    const merged=mergeStates(recovery.account.state,desired,true);
    replaceStoreStateWithoutDirty(merged);
    return persistV3Desired(
      merged,
      allChangedKeys(recovery.account.state,merged),
      !sameJson(globalStateOf(recovery.account.state),globalStateOf(merged)),
      false,
    );
  }

  if(response.status===409&&response.body.account?.state&&allowRecovery){
    const account=response.body.account;
    const conflictRevision=safeInteger(account.revision);
    const updatedAt=safeInteger(account.updatedAt);
    const userId=validUserId(account.userId);
    if(conflictRevision===null||updatedAt===null||!userId)return {kind:'failure'};
    const remote:RemoteAccount={
      userId,revision:conflictRevision,updatedAt,state:account.state,
      readPath:'legacy',writeEnabled:account.writeEnabled===true,
    };
    acceptRemoteBaseline(remote);
    const merged=mergeStates(remote.state,desired,true);
    replaceStoreStateWithoutDirty(merged);
    if(remote.writeEnabled){
      return persistV3Desired(
        merged,
        allChangedKeys(remote.state,merged),
        !sameJson(globalStateOf(remote.state),globalStateOf(merged)),
        false,
      );
    }
    response=await request('account-save',{state:merged});
    if(response.status===401)return {kind:'unauthorized'};
    if(!response.ok||!response.body.account)return {kind:'failure'};
    const retryRevision=safeInteger(response.body.account.revision);
    const retryUserId=validUserId(response.body.account.userId);
    if(retryRevision===null||!retryUserId)return {kind:'failure'};
    rememberAccount(retryUserId,retryRevision);
    syncedState=cloneState(merged);
    v3WriteActive=false;
    setWriteDiagnostic('legacy');
    return {kind:'ok',state:merged};
  }

  if(!response.ok||!response.body.account)return {kind:'failure'};
  const nextRevision=safeInteger(response.body.account.revision);
  const userId=validUserId(response.body.account.userId);
  if(nextRevision===null||!userId)return {kind:'failure'};
  rememberAccount(userId,nextRevision);
  syncedState=cloneState(desired);
  v3WriteActive=response.body.account.writeEnabled===true;
  setWriteDiagnostic(v3WriteActive?'v3':'legacy');
  return {kind:'ok',state:desired};
}

async function v3DeltaFromState(sinceRevision: number, baseState: UserUiState): Promise<V3Outcome> {
  let next = cloneState(baseState);
  let afterRevision: number | null = null;
  let afterSeq = -1;
  let finalRevision = sinceRevision;
  let finalUpdatedAt = 0;
  let userId = '';
  let writeEnabled: boolean | null = null;

  for (let pageNo = 0; pageNo < V3_MAX_PAGES_PER_SYNC; pageNo += 1) {
    const response = await request('account-v3-delta', {
      sinceRevision,
      afterRevision,
      afterSeq,
      limit: V3_PAGE_LIMIT,
    });
    if (response.status === 401) return { kind: 'unauthorized' };
    if (!response.ok || !response.body.account) return { kind: 'fallback' };
    const account = response.body.account;
    if (account.readPath !== 'v3-delta') return { kind: 'fallback' };
    if (account.resetRequired === true) return { kind: 'reset' };

    const head = v3Head(account.head);
    const targetRevision = safeInteger(account.targetRevision);
    const pageUserId = validUserId(account.userId);
    const pageWriteEnabled = account.writeEnabled === true;
    if (!head || targetRevision === null || targetRevision < sinceRevision
      || targetRevision !== head.revision || !pageUserId) return { kind: 'fallback' };
    if (userId && pageUserId !== userId) return { kind: 'fallback' };
    if (writeEnabled !== null && writeEnabled !== pageWriteEnabled) return { kind:'fallback' };
    userId = pageUserId;
    writeEnabled = pageWriteEnabled;
    finalRevision = targetRevision;
    finalUpdatedAt = head.updatedAt;

    if (account.globalState !== undefined) {
      const replaced = stateFromGlobal(account.globalState, next.papers, next.metadata);
      if (!replaced) return { kind: 'fallback' };
      next = replaced;
    }

    const changes = Array.isArray(account.changes) ? account.changes : null;
    if (!changes) return { kind: 'fallback' };
    for (const change of changes) if (!applyV3Row(next, change)) return { kind: 'fallback' };

    if (account.hasMore !== true) {
      if (!stateMatchesHead(next,head)) return { kind: 'fallback' };
      return {
        kind: 'ok',
        account: { userId, revision: finalRevision, updatedAt: finalUpdatedAt, state: next, readPath: 'v3', writeEnabled:writeEnabled === true },
      };
    }

    const cursor = account.nextCursor;
    const cursorRevision = safeInteger(cursor?.revision);
    const cursorSeq = safeInteger(cursor?.seq);
    if (cursorRevision === null || cursorSeq === null
      || (afterRevision !== null && (cursorRevision < afterRevision
        || (cursorRevision === afterRevision && cursorSeq <= afterSeq)))) return { kind: 'fallback' };
    afterRevision = cursorRevision;
    afterSeq = cursorSeq;
  }
  return { kind: 'fallback' };
}

async function v3FullPull(): Promise<V3Outcome> {
  const headResponse = await request('account-v3-head');
  if (headResponse.status === 401) return { kind: 'unauthorized' };
  if (!headResponse.ok || !headResponse.body.account) return { kind: 'fallback' };
  const account = headResponse.body.account;
  const initialUserId = validUserId(account.userId);
  const initialWriteEnabled = account.writeEnabled === true;
  if (account.readPath !== 'v3-head' || !initialUserId) return { kind: 'fallback' };
  const initialHead = v3Head(account);
  if (!initialHead) return { kind: 'fallback' };

  let state = stateFromGlobal(initialHead.globalState, {}, {});
  if (!state) return { kind: 'fallback' };
  let afterKey = '';

  for (let pageNo = 0; pageNo < V3_MAX_PAGES_PER_SYNC; pageNo += 1) {
    const pageResponse = await request('account-v3-page', { afterKey, limit: V3_PAGE_LIMIT });
    if (pageResponse.status === 401) return { kind: 'unauthorized' };
    if (!pageResponse.ok || !pageResponse.body.account) return { kind: 'fallback' };
    const page = pageResponse.body.account;
    const pageHead = v3Head(page.head);
    const pageUserId = validUserId(page.userId);
    const pageWriteEnabled = page.writeEnabled === true;
    const scanStartRevision = safeInteger(page.scanStartRevision);
    if (page.readPath !== 'v3-page' || !pageHead || pageUserId !== initialUserId
      || pageWriteEnabled !== initialWriteEnabled
      || scanStartRevision === null || scanStartRevision !== pageHead.revision
      || pageHead.revision < initialHead.revision) return { kind: 'fallback' };
    const rows = Array.isArray(page.rows) ? page.rows : null;
    if (!rows || safeInteger(page.count) !== rows.length) return { kind: 'fallback' };
    let previousKey = afterKey;
    for (const row of rows) {
      const rowKey = typeof row?.paperKey === 'string' ? row.paperKey : '';
      if (!rowKey || (previousKey && rowKey <= previousKey) || !applyV3Row(state,row)) return { kind: 'fallback' };
      previousKey = rowKey;
    }

    if (page.hasMore !== true) break;
    const nextKey = typeof page.nextKey === 'string' ? page.nextKey : '';
    if (!nextKey || nextKey <= afterKey) return { kind: 'fallback' };
    afterKey = nextKey;
    if (pageNo === V3_MAX_PAGES_PER_SYNC - 1) return { kind: 'fallback' };
  }

  const catchup = await v3DeltaFromState(initialHead.revision, state);
  if (catchup.kind === 'reset') return { kind: 'fallback' };
  if (catchup.kind !== 'ok' || catchup.account.userId !== initialUserId
    || catchup.account.writeEnabled !== initialWriteEnabled) {
    return catchup.kind === 'ok' ? { kind:'fallback' } : catchup;
  }
  return catchup;
}

async function preferredInitialPull(): Promise<{ account: RemoteAccount | null; status: number }> {
  const v3 = await v3FullPull();
  if (v3.kind === 'ok') {
    setReadDiagnostic('v3');
    return { account: v3.account, status: 200 };
  }
  if (v3.kind === 'unauthorized') return { account: null, status: 401 };
  const legacy = await legacyPull();
  if (legacy.result) setReadDiagnostic('legacy');
  return { account: legacy.result, status: legacy.status };
}

function acceptRemoteBaseline(account: RemoteAccount): void {
  rememberAccount(account.userId,account.revision);
  syncedState=cloneState(account.state);
  v3WriteActive=account.writeEnabled;
  setWriteDiagnostic(v3WriteActive?'v3':'legacy');
}

function applyRemote(account: RemoteAccount): void {
  applyingRemote = true;
  store.state = account.state;
  acceptRemoteBaseline(account);
  dirtyGlobal = false;
  dirtyPaperKeys.clear();
  store.save();
  applyingRemote = false;
}

async function initialMerge(): Promise<void> {
  const pulled = await preferredInitialPull();
  if (!pulled.account) {
    if (pulled.status === 401) clearRememberedAccount();
    return;
  }

  const remoteBase=cloneState(pulled.account.state);
  acceptRemoteBaseline(pulled.account);
  const localState = store.state;
  const merged = mergeStates(remoteBase, localState, true);
  applyingRemote = true;
  store.state = merged;
  store.save();
  applyingRemote = false;

  dirtyGlobal=false;
  dirtyPaperKeys.clear();
  markInitialDifferences(remoteBase,merged);
  const keys=[...dirtyPaperKeys];
  const globalWasDirty=dirtyGlobal;
  const outcome=v3WriteActive
    ? await persistV3Desired(merged,keys,globalWasDirty)
    : await persistLegacyDesired(merged);
  if(outcome.kind==='unauthorized'){
    clearRememberedAccount();
    return;
  }
  if(outcome.kind==='ok')clearSyncedDirty(outcome.state,keys,globalWasDirty);
}

async function pullRemote(): Promise<void> {
  if (!activeToken || saving || saveTimer !== undefined || localDirty()) return;

  let remote: RemoteAccount | null = null;
  const delta = await v3DeltaFromState(revision, syncedState || store.state);
  if (delta.kind === 'unauthorized') {
    clearRememberedAccount();
    return;
  }
  if (delta.kind === 'ok') {
    remote = delta.account;
    setReadDiagnostic('v3');
  } else if (delta.kind === 'reset') {
    const full = await v3FullPull();
    if (full.kind === 'unauthorized') {
      clearRememberedAccount();
      return;
    }
    if (full.kind === 'ok') {
      remote = full.account;
      setReadDiagnostic('v3');
    }
  }

  if (!remote) {
    const legacy = await legacyPull();
    if (legacy.status === 401) {
      clearRememberedAccount();
      return;
    }
    remote = legacy.result;
    if (remote) setReadDiagnostic('legacy');
  }

  if (!remote) return;
  v3WriteActive=remote.writeEnabled;
  setWriteDiagnostic(v3WriteActive?'v3':'legacy');
  if (remote.revision !== revision) applyRemote(remote);
  else if (!syncedState) syncedState=cloneState(remote.state);
}

async function saveRemote(): Promise<void> {
  if (!activeToken || applyingRemote || !localDirty()) return;
  if (saving) { queuedSave = true; return; }
  saving = true;
  const desired=cloneState(store.state);
  const keys=[...dirtyPaperKeys];
  const globalWasDirty=dirtyGlobal;
  try {
    const outcome=v3WriteActive
      ? await persistV3Desired(desired,keys,globalWasDirty)
      : await persistLegacyDesired(desired);
    if(outcome.kind==='unauthorized'){
      clearRememberedAccount();
      return;
    }
    if(outcome.kind==='ok')clearSyncedDirty(outcome.state,keys,globalWasDirty);
  } finally {
    saving = false;
    if (queuedSave) { queuedSave = false; void saveRemote(); }
  }
}

function scheduleSave(event:Event): void {
  if (!activeToken || applyingRemote) return;
  const detail=(event as CustomEvent<{scope?:'paper'|'global';paperId?:string;paperIds?:string[]}>).detail;
  if(detail?.scope==='paper'&&typeof detail.paperId==='string'&&detail.paperId){
    dirtyPaperKeys.add(detail.paperId);
  }else{
    dirtyGlobal=true;
  }
  for(const paperId of detail?.paperIds || []){
    if(typeof paperId==='string'&&paperId)dirtyPaperKeys.add(paperId);
  }
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { saveTimer = undefined; void saveRemote(); }, SAVE_DEBOUNCE_MS);
}

async function detectSessionChange(): Promise<void> {
  const token = sessionToken();
  if (token === activeToken) return;
  activeToken = token;
  syncedState=null;
  v3WriteActive=false;
  dirtyGlobal=false;
  dirtyPaperKeys.clear();
  setWriteDiagnostic(token?'legacy':'none');
  if (!token) {
    clearRememberedAccount();
    setReadDiagnostic('none');
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
setWriteDiagnostic(activeToken?'legacy':'none');
if (activeToken) void initialMerge();
else setReadDiagnostic('none');
window.setInterval(() => { void detectSessionChange(); }, TOKEN_WATCH_MS);
window.setInterval(() => { if (activeToken) void pullRemote(); }, POLL_INTERVAL_MS);
