// Tampermonkey capture report ordering is about actual job chronology, not the
// arrival order of HTTP retries. Keep this module free of Worker/R2 side effects.
function reportDate(value) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function tmReportEventId(report) {
  const jobId = String(report?.jobId || '');
  if (!jobId) return '';
  const provided = String(report?.deliveryEventId || '');
  if (provided && provided.startsWith(jobId + ':') && /^[a-zA-Z0-9-]{12,120}:(?:final|checkpoint):[0-9]+$/.test(provided)) return provided;
  for (const entry of Array.isArray(report?.trace) ? report.trace : []) {
    if (String(entry?.stage || '') !== 'diagnostic_context') continue;
    const found = String(entry?.message || '').match(/"eventId"\s*:\s*"([a-zA-Z0-9-]{12,120}:(?:final|checkpoint):[0-9]+)"/);
    if (found && found[1].startsWith(jobId + ':')) return found[1];
  }
  return '';
}

export function tmReportDeliveryKey(row) {
  const doi = String(row?.doi || '').toLowerCase();
  const jobId = String(row?.jobId || '');
  if (!doi || !jobId) return '';
  const event = tmReportEventId(row);
  if (event) return doi + '|' + event;
  // Old reports did not retain the diagnostic event id. A final result from
  // one publisher job is immutable even if uploaded repeatedly.
  if (row?.final === true) return doi + '|' + jobId + '|final:' + String(row.finishedAt || '');
  // Never collapse unidentified progress checkpoints: they may contain new
  // positive media receipts, even when their visible status is identical.
  return '';
}

export function tmUniqueReportHistory(item, limit = 1000) {
  const rows = Array.isArray(item?.attempts) ? item.attempts.slice() : [];
  if (item?.reportKey && !rows.some(x => x?.reportKey === item.reportKey)) rows.push(item);
  const byKey = new Map();
  for (const row of rows) {
    if (!row?.reportKey) continue;
    const key = tmReportDeliveryKey(row) || 'attempt:' + String(row.attemptId || row.reportKey);
    const old = byKey.get(key);
    if (!old || Number(row.updatedAt || 0) > Number(old.updatedAt || 0)) byKey.set(key, row);
  }
  return [...byKey.values()]
    .sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, Math.max(1, Number(limit) || 1));
}

export function tmEffectiveReport(item) {
  const history = tmUniqueReportHistory(item);
  if (!history.length) return null;
  const byJob = new Map();
  for (const row of history) {
    const key = String(row.jobId || '') || ('legacy:' + String(row.attemptId || row.reportKey));
    const previous = byJob.get(key);
    if (!previous || (row.final === true && previous.final !== true)
      || (row.final === previous.final && Number(row.updatedAt || 0) > Number(previous.updatedAt || 0))) {
      byJob.set(key, row);
    }
  }
  return [...byJob.values()].sort((a,b) => {
    // A newer publisher visit is a newer job, even if an earlier job uploads
    // a delayed checkpoint after it has already finished.
    const startA = reportDate(a.startedAt) || Number(a.updatedAt || 0);
    const startB = reportDate(b.startedAt) || Number(b.updatedAt || 0);
    return startB - startA || Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  })[0];
}

export function tmProjectReportItem(item) {
  if (!item) return item;
  const winner = tmEffectiveReport(item);
  if (!winner) return item;
  const fields = ['attemptId','jobId','captureVersion','controllerRevision','mediaNeed',
    'final','tocStatus','figuresDiscovered','figuresStored','figureLabels',
    'fulltextStatus','privatePdfStatus','privatePdfBytes','evidenceLevel','evidenceChars',
    'evidenceSections','publisher','status','reason','assetType','candidateKind',
    'candidateSource','articleUrl','sourceUrl','reportKey','traceEvents','startedAt','finishedAt','updatedAt'];
  const projection = {};
  for (const field of fields) if (Object.hasOwn(winner,field)) projection[field] = winner[field];
  return {...item, ...projection, retainedAttempts:tmUniqueReportHistory(item).length};
}
