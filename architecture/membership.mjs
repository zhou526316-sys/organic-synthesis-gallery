import { normalizeDoi } from '../shared/literature-identity.mjs';

export const MEMBERSHIP_SCHEMA = 'gallery-current-membership-v1';
const assert = (value, reason) => { if (!value) throw new Error(reason); };
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
export async function membershipDigest(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Publisher helper. Use only a complete, verified all-time source, never a DOM/work subset. */
export async function makeMembership({ catalogId, serial, issuedAt, validUntil, records, withdrawn = [] }) {
  const members = {};
  for (const row of records) {
    const doi = normalizeDoi(row.doi);
    assert(doi && !Object.hasOwn(members, doi), 'membership_duplicate_or_invalid_doi');
    assert(isHash(row.revision), 'membership_record_revision_missing');
    members[doi] = row.revision;
  }
  const body = { schema: MEMBERSHIP_SCHEMA, scope: 'all-time', complete: true,
    catalogId, serial, issuedAt, validUntil, count: records.length, members, withdrawn: [...withdrawn].sort() };
  validateShape(body);
  return { ...body, digest: await membershipDigest(body) };
}
function validateShape(value) {
  assert(value?.schema === MEMBERSHIP_SCHEMA && value.scope === 'all-time' && value.complete === true, 'not_complete_all_time_membership');
  assert(isHash(value.catalogId) && Number.isSafeInteger(value.serial) && value.serial >= 0, 'membership_identity_missing');
  assert(Number.isSafeInteger(value.issuedAt) && Number.isSafeInteger(value.validUntil) && value.validUntil > value.issuedAt,
    'membership_time_invalid');
  assert(value.members && typeof value.members === 'object' && !Array.isArray(value.members), 'membership_members_missing');
  const entries = Object.entries(value.members);
  assert(Number.isSafeInteger(value.count) && value.count === entries.length, 'membership_count_mismatch');
  for (const [doi, revision] of entries) assert(normalizeDoi(doi) === doi && isHash(revision), 'membership_invalid_member');
  assert(Array.isArray(value.withdrawn) && new Set(value.withdrawn).size === value.withdrawn.length, 'withdrawal_list_invalid');
  for (const doi of value.withdrawn) assert(normalizeDoi(doi) === doi && !Object.hasOwn(value.members, doi), 'withdrawal_membership_overlap');
}
/**
 * Read barrier, not a publisher. The transport must use the configured trusted origin.
 * A digest proves internal consistency, not server authority. Never use an untrusted page as fetchSnapshot.
 * Positive decisions expire; known withdrawals survive failures and stale replies. No data is deleted.
 */
export class MembershipFence {
  constructor({ fetchSnapshot, now = Date.now, maxTtlMs = 300000, retryMs = 1000, initialState } = {}) {
    assert(typeof fetchSnapshot === 'function' && typeof now === 'function', 'membership_transport_required');
    this.fetchSnapshot = fetchSnapshot; this.now = now; this.maxTtlMs = maxTtlMs; this.retryMs = retryMs;
    assert(Number.isSafeInteger(maxTtlMs) && maxTtlMs > 0 && Number.isSafeInteger(retryMs) && retryMs >= 0, 'membership_policy_invalid');
    this.serial = -1; this.snapshot = null; this.withdrawn = new Set(); this.listeners = new Set();
    this.inflight = null; this.usable = false; this.retryAt = 0; this.error = null;
    if (initialState) {
      assert(initialState.schema === MEMBERSHIP_SCHEMA && Number.isSafeInteger(initialState.serial) && Array.isArray(initialState.withdrawn), 'invalid_fence_checkpoint');
      assert(initialState.withdrawn.every(doi => normalizeDoi(doi) === doi), 'invalid_fence_checkpoint_doi');
      this.serial = initialState.serial; this.withdrawn = new Set(initialState.withdrawn);
    }
  }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { for (const listener of this.listeners) { try { listener(this.checkpoint()); } catch { /* UI listeners cannot weaken the gate. */ } } }
  checkpoint() { return { schema: MEMBERSHIP_SCHEMA, serial: this.serial, withdrawn: [...this.withdrawn].sort() }; }
  fresh() { return Boolean(this.usable && this.snapshot && this.now() >= this.snapshot.issuedAt && this.now() < this.snapshot.validUntil); }
  async accept(snapshot) {
    // Own the bytes before any await so caller mutation cannot change checked content.
    const value = structuredClone(snapshot); validateShape(value);
    const { digest, ...body } = value;
    assert(isHash(digest) && await membershipDigest(body) === digest, 'membership_digest_mismatch');
    const now = this.now();
    assert(value.issuedAt <= now && value.validUntil > now && value.validUntil - value.issuedAt <= this.maxTtlMs, 'membership_not_fresh');
    assert(value.serial >= this.serial, 'membership_serial_rollback');
    if (value.serial === this.serial && this.snapshot) assert(digest === this.snapshot.digest, 'membership_serial_conflict');
    // Restoring a confirmed withdrawal needs a separately authorized restoration protocol.
    for (const doi of this.withdrawn) assert(!Object.hasOwn(value.members, doi), 'withdrawn_doi_resurrection');
    this.serial = value.serial;
    for (const doi of value.withdrawn) this.withdrawn.add(doi);
    this.snapshot = value; this.usable = true; this.error = null; this.retryAt = 0; this.emit();
    return true;
  }
  async refresh() {
    if (this.inflight) return this.inflight;
    this.usable = false;
    this.inflight = (async () => {
      try { return await this.accept(await this.fetchSnapshot()); }
      catch (error) { this.error = String(error.message || error); this.usable = false; this.retryAt = this.now() + this.retryMs; this.emit(); return false; }
      finally { this.inflight = null; }
    })();
    return this.inflight;
  }
  async ready() {
    if (this.inflight) return this.inflight;
    if (this.fresh()) return true;
    if (this.now() < this.retryAt) return false;
    return this.refresh();
  }
  status(doiValue, revision) {
    const doi = normalizeDoi(doiValue);
    if (!doi) return 'unknown';
    if (this.withdrawn.has(doi)) return 'withdrawn';
    if (!this.fresh()) return 'unknown';
    if (!Object.hasOwn(this.snapshot.members, doi)) return 'absent';
    if (revision !== undefined && revision !== this.snapshot.members[doi]) return 'record-update-required';
    return 'present';
  }
}
