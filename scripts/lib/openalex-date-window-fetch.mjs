// Fetch a complete OpenAlex publication-date interval without relying on
// protected/unauthenticated deep cursor pages. A response that cannot prove
// completeness always throws; it must never be counted as a healthy source.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid OpenAlex date: ${value}`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid OpenAlex calendar date: ${value}`);
  }
  return timestamp;
}

export async function fetchOpenAlexDateWindows({
  startDate, endDate, fetchPage, onRecord, perPage = 200, maxRequests = 128,
}) {
  const firstDay = utcDay(startDate);
  const lastDay = utcDay(endDate);
  if (firstDay > lastDay) throw new Error('OpenAlex date interval is reversed');
  if (typeof fetchPage !== 'function' || typeof onRecord !== 'function') {
    throw new TypeError('OpenAlex date-window fetch requires fetchPage and onRecord functions');
  }
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 200) {
    throw new Error('OpenAlex perPage must be an integer between 1 and 200');
  }

  let requestCount = 0;
  let receivedCount = 0;
  let splitCount = 0;

  const visit = async (beginMs, finishMs) => {
    if (++requestCount > maxRequests) throw new Error('OpenAlex date-window request budget exhausted');
    const from = new Date(beginMs).toISOString().slice(0, 10);
    const to = new Date(finishMs).toISOString().slice(0, 10);
    const data = await fetchPage({ startDate: from, endDate: to, perPage });
    const results = data?.results;
    const sourceCount = data?.meta?.count;
    if (!Array.isArray(results) || !Number.isSafeInteger(sourceCount) || sourceCount < results.length
        || results.length > perPage) {
      throw new Error(`OpenAlex unverified page metadata for ${from}..${to}`);
    }
    if (sourceCount > results.length) {
      if (beginMs === finishMs) {
        throw new Error(`OpenAlex daily page overflow: ${from}, source count ${sourceCount}`);
      }
      splitCount += 1;
      const elapsedDays = Math.round((finishMs - beginMs) / ONE_DAY_MS);
      const middleMs = beginMs + Math.floor(elapsedDays / 2) * ONE_DAY_MS;
      await visit(beginMs, middleMs);
      await visit(middleMs + ONE_DAY_MS, finishMs);
      return;
    }
    receivedCount += results.length;
    for (const record of results) onRecord(record);
  };

  await visit(firstDay, lastDay);
  return { requests: requestCount, records: receivedCount, dateSplits: splitCount };
}
