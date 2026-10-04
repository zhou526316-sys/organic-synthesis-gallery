import { normalizeDoi } from '../shared/literature-identity.mjs';
import { acquisitionEligibility } from '../shared/literature-lifecycle.mjs';

const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
/**
 * Adapter boundary for queue-coverage: keep the full legacy articles registry intact,
 * then restrict NEW job selection. Do not run an absence/removal sweep on this result.
 * It deliberately preserves the caller's already-ranked job order and every layer flag.
 */
export function filterAcquisitionJobs({ queue, jobs, records, fence, asOfDate, grants = [] }) {
  assert(fence.fresh(), 'current_membership_required');
  assert(Array.isArray(queue?.articles) && queue.webpageDoiCount === queue.articles.length, 'legacy_registry_incomplete');
  const registryDois = queue.articles.map(row => normalizeDoi(row.doi));
  assert(registryDois.every(Boolean) && new Set(registryDois).size === registryDois.length, 'legacy_registry_identity_invalid');
  const members = Object.keys(fence.snapshot.members), present = new Set(registryDois);
  assert(registryDois.length === members.length && members.every(doi => present.has(doi)), 'legacy_registry_generation_mismatch');
  const byDoi = new Map(records.map(record => [record.doi, record]));
  assert(byDoi.size === records.length && records.length === members.length && members.every(doi => byDoi.has(doi)), 'record_membership_mismatch');
  // All records, not only today's jobs, must be from the exact current record set.
  for (const record of records) assert(fence.status(record.doi, record.revision) === 'present', 'record_generation_mismatch');
  const executable = [], held = [], seen = new Set();
  for (const job of jobs) {
    const doi = normalizeDoi(job?.doi);
    assert(doi && !seen.has(doi), 'job_identity_invalid_or_duplicate'); seen.add(doi);
    const record = byDoi.get(doi), membership = fence.status(doi, record?.revision);
    if (!record || membership !== 'present') { held.push({ doi, reason: membership, preserveProgress: true }); continue; }
    const permission = acquisitionEligibility(record, asOfDate, grants);
    if (permission.eligible) executable.push(structuredClone(job));
    else held.push({ doi, reason: permission.reason, preserveProgress: true });
  }
  assert(fence.fresh(), 'membership_expired_during_plan');
  return { schema: 'gallery-queue-membership-adapter-v1', scope: 'active-work', dispatchEnabled: false,
    membershipDigest: fence.snapshot.digest, allTimeCount: registryDois.length,
    executable, held, removed: [] };
}
/** A missing active job never erases checkpoint/partial progress or becomes 'removed'. */
export function coverageMembership(row, fence, activeDois) {
  const status = fence.status(row.doi);
  if (status === 'withdrawn') return { ...structuredClone(row), membership: 'withdrawn', eligible: false, disposition: 'quarantine-no-delete' };
  if (status !== 'present') return { ...structuredClone(row), membership: status, eligible: false, disposition: 'hold-preserve-progress' };
  return { ...structuredClone(row), membership: 'present', eligible: activeDois.has(normalizeDoi(row.doi)), disposition: 'retain' };
}
/** In-flight legal acquisition may finish after retirement, but an obsolete job cannot write. */
export function captureReceiptDisposition({ doi, jobId, currentJobId, fence }) {
  if (!jobId || jobId !== currentJobId) return 'reject-stale-job';
  const status = fence.status(doi);
  return status === 'withdrawn' ? 'quarantine' : status === 'present' ? 'retain-validated-receipt' : 'hold-for-membership';
}
