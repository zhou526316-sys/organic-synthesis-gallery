import { normalizeDoi } from '../shared/literature-identity.mjs';

export const PUBLISHED_MEMBERSHIP_SCHEMA = 'gallery-published-membership-v1';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const isHash = (value, length=64) => typeof value === 'string' && new RegExp('^[a-f0-9]{'+length+'}$').test(value);

export function buildPublishedMembership({ publicationSlot, markerBlobSha, catalogId, doiSetHash, records, withdrawn = [] }) {
  assert(/^\d{4}-\d{2}-\d{2}T(?:08|18):00:00\+08:00$/.test(publicationSlot || ''), 'membership_publication_slot_invalid');
  assert(isHash(markerBlobSha, 40) && isHash(catalogId) && isHash(doiSetHash), 'membership_generation_identity_invalid');
  assert(Array.isArray(records) && Array.isArray(withdrawn), 'membership_input_invalid');
  const members = {}, withdrawnSet = new Set();
  for (const row of records) {
    const doi = normalizeDoi(row?.doi);
    assert(doi && !Object.hasOwn(members, doi), 'membership_duplicate_or_invalid_doi');
    assert(isHash(row?.revision), 'membership_record_revision_invalid');
    members[doi] = row.revision;
  }
  for (const value of withdrawn) {
    const doi = normalizeDoi(typeof value === 'string' ? value : value?.doi);
    assert(doi && !withdrawnSet.has(doi) && !Object.hasOwn(members, doi), 'membership_withdrawal_invalid_or_overlap');
    withdrawnSet.add(doi);
  }
  const serial = Date.parse(publicationSlot);
  assert(Number.isSafeInteger(serial), 'membership_serial_invalid');
  return {
    schema: PUBLISHED_MEMBERSHIP_SCHEMA,
    scope: 'all-time',
    complete: true,
    publicationSlot,
    markerBlobSha,
    catalogId,
    doiSetHash,
    serial,
    count: records.length,
    members,
    withdrawn: [...withdrawnSet].sort(),
  };
}
