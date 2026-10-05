const GENERIC_RECEIPT = 'audit/deployment-delivery-latest.json';
const SCOPE_RECEIPT = 'audit/scope-removal-delivery-latest.json';

export function architectureReleaseBasis(marker) {
  if (!marker || typeof marker !== 'object') throw new Error('invalid_publication_marker');
  if (marker.mode === 'scope-correction') {
    if (marker.releasePolicy !== 'deletion-only') throw new Error('invalid_scope_correction_policy');
    const publicationSlot = String(marker.lastFixedPublicationSlot || '');
    if (!publicationSlot) throw new Error('scope_correction_fixed_slot_missing');
    return { mode: 'scope-correction', publicationSlot, receiptFile: SCOPE_RECEIPT };
  }
  const publicationSlot = String(marker.publicationSlot || '');
  if (!publicationSlot) throw new Error('publication_slot_missing');
  return { mode: String(marker.mode || 'slot-release'), publicationSlot, receiptFile: GENERIC_RECEIPT };
}

export const ARCHITECTURE_RECEIPT_FILES = Object.freeze({
  generic: GENERIC_RECEIPT,
  scopeCorrection: SCOPE_RECEIPT,
});
