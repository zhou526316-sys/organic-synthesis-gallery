import { normalizeDoi } from './media.js';

async function allRows(statement) {
  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
}

function normalizedFigureKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/^fig\.?\s*/, 'figure ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function mediaState(env, doi) {
  const [toc, figures] = await Promise.all([
    env.DB.prepare(
      'SELECT doi, r2_key, content_hash, reason, available, checked_at, updated_at FROM toc_assets WHERE doi = ?'
    ).bind(doi).first(),
    allRows(env.DB.prepare(
      'SELECT semantic_key, label, r2_key, content_hash, width, height, sort_order, updated_at FROM figure_assets WHERE doi = ? ORDER BY sort_order, updated_at DESC'
    ).bind(doi)),
  ]);
  const activeToc = Boolean(toc && Number(toc.available) === 1 && toc.r2_key);
  const figureOne = figures.find(item => normalizedFigureKey(item.label) === 'figure 1');
  const fallback = figures[0] || null;
  const tocMatchesNonFigureOne = Boolean(
    activeToc &&
    toc.content_hash &&
    figures.some(item => item.content_hash === toc.content_hash && normalizedFigureKey(item.label) !== 'figure 1')
  );
  return {
    doi,
    toc,
    figures,
    activeToc,
    figureOne: Boolean(figureOne),
    fallback: Boolean(fallback),
    tocMatchesNonFigureOne,
  };
}

function collectorRetryDelay(stage, outcome, rootCause) {
  const cause = String(rootCause || '').toLowerCase();
  if (stage === 'upload' && outcome === 'complete') return 0;
  if (stage === 'upload' && outcome === 'partial' && cause === 'collector_figure1_fallback') return 24 * 60 * 60 * 1000;
  if (cause.includes('manual_required')) return 24 * 60 * 60 * 1000;
  if (cause.includes('semantic_media_not_found')) return 72 * 60 * 60 * 1000;
  if (cause.includes('image_download_failed')) return 8 * 60 * 60 * 1000;
  if (cause.includes('publisher_rate_limited')) return 24 * 60 * 60 * 1000;
  if (cause.includes('publisher_timeout')) return 8 * 60 * 60 * 1000;
  if (cause.includes('collector_auth')) return 30 * 60 * 1000;
  if (cause.includes('upload_failed')) return 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

export async function persistMediaAttempt(env, payload) {
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };
  const source = typeof payload?.source === 'string' ? payload.source.slice(0, 80) : null;
  const stage = typeof payload?.stage === 'string' ? payload.stage.slice(0, 80) : null;
  const outcome = typeof payload?.outcome === 'string' ? payload.outcome.slice(0, 80) : null;
  const rootCause = typeof payload?.rootCause === 'string' ? payload.rootCause.slice(0, 200) : null;
  const detail = payload && typeof payload === 'object' ? JSON.stringify(payload).slice(0, 8000) : null;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO media_attempts (doi, source, stage, outcome, root_cause, detail_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(doi) DO UPDATE SET
       source = excluded.source,
       stage = excluded.stage,
       outcome = excluded.outcome,
       root_cause = excluded.root_cause,
       detail_json = excluded.detail_json,
       updated_at = excluded.updated_at`
  ).bind(doi, source, stage, outcome, rootCause, detail, now).run();

  if (source === 'windows-toc-collector') {
    const delay = collectorRetryDelay(stage, outcome, rootCause);
    const nextRetryAt = delay > 0 ? now + delay : now;
    await env.DB.prepare(
      `INSERT INTO media_repair_state
        (doi, repair_version, attempts, last_attempt_at, next_retry_at, last_root_cause, last_outcome, reported_priority, updated_at)
       VALUES (?, 1, 1, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(doi) DO UPDATE SET
         attempts = media_repair_state.attempts + 1,
         last_attempt_at = excluded.last_attempt_at,
         next_retry_at = excluded.next_retry_at,
         last_root_cause = excluded.last_root_cause,
         last_outcome = excluded.last_outcome,
         updated_at = excluded.updated_at`
    ).bind(doi, now, nextRetryAt, rootCause, outcome, now).run();
  }

  return { status: 200, body: { stored: true, doi, updatedAt: now } };
}

export async function diagnoseMedia(env, payload) {
  const dois = [...new Set((Array.isArray(payload?.dois) ? payload.dois : [])
    .map(normalizeDoi)
    .filter(Boolean))].slice(0, 100);
  const items = [];
  for (const doi of dois) {
    const state = await mediaState(env, doi);
    let rootCause = 'complete_cached';
    let outcome = 'complete';
    if (!state.activeToc && state.figures.length === 0) {
      rootCause = 'no_cached_toc_or_figures';
      outcome = 'missing';
    } else if (!state.activeToc) {
      rootCause = 'toc_missing_using_figure_fallback';
      outcome = 'partial';
    } else if (state.figures.length === 0) {
      rootCause = 'body_figures_missing';
      outcome = 'partial';
    } else if (state.tocMatchesNonFigureOne) {
      rootCause = 'toc_matches_nonfigure1';
      outcome = 'suspicious';
    }
    const record = {
      doi,
      outcome,
      rootCause,
      tocStored: state.activeToc,
      tocReason: state.toc?.reason || 'cache_miss',
      figureCount: state.figures.length,
      figureOneStored: state.figureOne,
      updatedAt: Date.now(),
    };
    await persistMediaAttempt(env, { ...record, source: 'cloudflare-diagnose', stage: 'cache' });
    items.push(record);
  }
  return { status: 200, body: { generatedAt: Date.now(), items } };
}

export async function persistRenderReport(env, payload) {
  const items = (Array.isArray(payload?.items) ? payload.items : []).slice(0, 80).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const doi = normalizeDoi(value.doi);
    if (!doi) return [];
    return [{
      doi,
      expectedLarge: value.expectedLarge === true,
      expectedFigures: value.expectedFigures === true,
      tocRendered: value.tocRendered === true,
      figuresRendered: value.figuresRendered === true,
      tocState: typeof value.tocState === 'string' ? value.tocState.slice(0, 80) : '',
      figureState: typeof value.figureState === 'string' ? value.figureState.slice(0, 80) : '',
    }];
  });
  const report = { recordedAt: Date.now(), items };
  if (env.STATE) {
    await env.STATE.put('media-diagnostics/latest-render', JSON.stringify(report), { expirationTtl: 7 * 24 * 60 * 60 });
  }
  return { status: 200, body: report };
}

export async function mediaDiagnostics(env) {
  const attempts = await allRows(env.DB.prepare(
    'SELECT doi, source, stage, outcome, root_cause, detail_json, updated_at FROM media_attempts ORDER BY updated_at DESC LIMIT 500'
  ));
  let renderReport = null;
  if (env.STATE) {
    try {
      const raw = await env.STATE.get('media-diagnostics/latest-render');
      if (raw) renderReport = JSON.parse(raw);
    } catch {
      renderReport = null;
    }
  }
  const renderGaps = Array.isArray(renderReport?.items)
    ? renderReport.items.filter(item =>
        (item.expectedLarge === true && item.tocRendered !== true) ||
        (item.expectedFigures === true && item.figuresRendered !== true)
      )
    : [];
  return {
    status: 200,
    body: {
      generatedAt: Date.now(),
      renderReport,
      renderGaps,
      attempts,
    },
  };
}

export async function mediaAudit(env) {
  const [tocRows, figureRows] = await Promise.all([
    allRows(env.DB.prepare(
      `SELECT doi, content_hash, reason, available, r2_key
       FROM toc_assets
       WHERE available = 1 AND r2_key IS NOT NULL`
    )),
    allRows(env.DB.prepare(
      `SELECT doi, semantic_key, label, content_hash, r2_key
       FROM figure_assets
       ORDER BY doi, sort_order`
    )),
  ]);

  const figuresByDoi = new Map();
  for (const row of figureRows) {
    const doi = String(row.doi).toLowerCase();
    const group = figuresByDoi.get(doi) || [];
    group.push(row);
    figuresByDoi.set(doi, group);
  }

  const hashOwners = new Map();
  for (const row of tocRows) {
    if (!row.content_hash) continue;
    const owners = hashOwners.get(row.content_hash) || [];
    owners.push(String(row.doi).toLowerCase());
    hashOwners.set(row.content_hash, owners);
  }
  const duplicateGroups = [...hashOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1)
    .map(([contentHash, dois]) => ({ contentHash, dois: [...new Set(dois)] }));

  const issues = [];
  for (const group of duplicateGroups) issues.push({ type: 'duplicate_toc_hash', ...group });

  let tocMatchesNonFigure1 = 0;
  let noValidToc = 0;
  for (const toc of tocRows) {
    const doi = String(toc.doi).toLowerCase();
    const figures = figuresByDoi.get(doi) || [];
    const wrongMatch = Boolean(toc.content_hash && figures.some(item =>
      item.content_hash === toc.content_hash && normalizedFigureKey(item.label) !== 'figure 1'
    ));
    if (wrongMatch) {
      tocMatchesNonFigure1 += 1;
      issues.push({ type: 'toc_matches_nonfigure1', doi, contentHash: toc.content_hash });
    }
  }

  const allDois = new Set([...tocRows.map(row => String(row.doi).toLowerCase()), ...figureRows.map(row => String(row.doi).toLowerCase())]);
  for (const doi of allDois) {
    const toc = tocRows.find(row => String(row.doi).toLowerCase() === doi);
    const figures = figuresByDoi.get(doi) || [];
    if (!toc && figures.length === 0) {
      noValidToc += 1;
      issues.push({ type: 'no_valid_toc_or_figure1', doi });
    }
  }

  return {
    status: 200,
    body: {
      generatedAt: Date.now(),
      summary: {
        tocMetadata: tocRows.length,
        activeToc: tocRows.length,
        figureMetadata: figureRows.length,
        duplicateTocGroups: duplicateGroups.length,
        tocMatchesNonFigure1,
        noValidToc,
      },
      duplicateGroups: duplicateGroups.slice(0, 80),
      issues: issues.slice(0, 400),
    },
  };
}
