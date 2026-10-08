// Operates only inside the existing authorized 08:00 literature writer.
// Approved corrections never mutate a protected production source off-slot.
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const normalizeDoi = value => String(value || '').trim().toLowerCase();
const validSlot = value => /^\d{4}-\d{2}-\d{2}T08:00:00\+08:00$/.test(String(value || ''));

export function applyApprovedPublicationDateCorrections(byDoi, payload, publicationSlot) {
  if (!(byDoi instanceof Map) || !validSlot(publicationSlot)
    || payload?.schemaVersion !== 1 || !Array.isArray(payload.corrections)) {
    throw new Error('approved_date_correction_input_invalid');
  }
  const seen = new Set();
  const reports = [];
  for (const item of payload.corrections) {
    const doi = normalizeDoi(item?.doi);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi) || seen.has(doi)
      || !validDate(item?.expectedOldDate) || !validDate(item?.correctDate)
      || !validDate(item?.preserveAddedDate) || !validSlot(item?.earliestPublicationSlot)
      || typeof item?.publisherUrl !== 'string' || !item.publisherUrl.startsWith('https://')
      || typeof item?.evidence !== 'string' || item.evidence.length < 60
      || typeof item?.userApproval !== 'string' || !item.userApproval.includes('批准')
      || item?.state !== 'approved_for_next_fixed_slot') {
      throw new Error('approved_date_correction_record_invalid:' + doi);
    }
    seen.add(doi);
    if (publicationSlot < item.earliestPublicationSlot) {
      reports.push({ doi, status: 'not_yet_due' });
      continue;
    }
    const row = byDoi.get(doi);
    if (!row) {
      reports.push({ doi, status: 'not_in_production' });
      continue;
    }
    if (String(row.journal || '').trim() !== item.journal
      || ![item.expectedOldDate, item.correctDate].includes(row.date)
      || ![item.preserveAddedDate, publicationSlot.slice(0, 10)].includes(row.addedDate)) {
      reports.push({ doi, status: 'conflict', actualDate: row.date, actualAddedDate: row.addedDate });
      continue;
    }
    if (row.date === item.correctDate && row.addedDate === item.preserveAddedDate) {
      reports.push({ doi, status: 'already_correct' });
      continue;
    }
    byDoi.set(doi, { ...row, date: item.correctDate, addedDate: item.preserveAddedDate });
    reports.push({ doi, status: 'applied', originalDate: row.date, correctedDate: item.correctDate,
      preservedAddedDate: item.preserveAddedDate });
  }
  return {
    reports,
    applied: reports.filter(row => row.status === 'applied').length,
    conflicts: reports.filter(row => row.status === 'conflict').length,
  };
}
