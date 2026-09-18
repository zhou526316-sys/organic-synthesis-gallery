import { normalizeDoi } from './media.js';

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function titleHash(title) {
  return (await sha256Hex(title.trim())).slice(0, 32);
}

async function paperIdentity(paper) {
  const doi = normalizeDoi(paper?.doi);
  if (doi) return `doi:${doi}`;
  const title = typeof paper?.title === 'string' ? paper.title.trim().toLowerCase() : '';
  const journal = typeof paper?.journal === 'string' ? paper.journal.trim().toLowerCase() : '';
  const date = typeof paper?.date === 'string' ? paper.date.trim() : '';
  return `meta:${(await sha256Hex(`${journal}|${date}|${title}`)).slice(0, 32)}`;
}

function normalizeSynthesisType(value) {
  if (value === 'formal') return 'formal';
  if (value === 'total') return 'total';
  return 'methodology';
}

export async function getTitleTranslations(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const titles = [...new Set((Array.isArray(payload?.titles) ? payload.titles : [])
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(value => value && value.length <= 600))].slice(0, 300);
  if (!titles.length) return { status: 200, body: { translations: [] } };

  const keyed = await Promise.all(titles.map(async title => ({ title, hash: await titleHash(title) })));
  const byHash = new Map();
  for (let offset = 0; offset < keyed.length; offset += 80) {
    const chunk = keyed.slice(offset, offset + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const result = await env.DB.prepare(
      `SELECT title_hash, source_title, zh_title FROM title_translation_zh WHERE title_hash IN (${placeholders})`
    ).bind(...chunk.map(item => item.hash)).all();
    for (const row of result?.results || []) byHash.set(row.title_hash, row);
  }

  return {
    status: 200,
    body: {
      translations: keyed.flatMap(item => {
        const row = byHash.get(item.hash);
        return row?.zh_title ? [{ title: item.title, zh: row.zh_title }] : [];
      }),
    },
  };
}

export async function importTitleTranslations(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const raw = Array.isArray(payload?.translations) ? payload.translations.slice(0, 500) : [];
  const rows = [];
  for (const item of raw) {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const zh = typeof item?.zh === 'string' ? item.zh.trim() : '';
    if (!title || title.length > 600 || !zh || zh.length > 1000) continue;
    rows.push({ title, zh, hash: await titleHash(title) });
  }
  const now = Date.now();
  const statements = rows.map(item => env.DB.prepare(
    `INSERT INTO title_translation_zh (title_hash, source_title, zh_title, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(title_hash) DO UPDATE SET
       source_title = excluded.source_title,
       zh_title = excluded.zh_title,
       updated_at = excluded.updated_at`
  ).bind(item.hash, item.title, item.zh, now));
  for (let offset = 0; offset < statements.length; offset += 80) {
    await env.DB.batch(statements.slice(offset, offset + 80));
  }
  return { status: 200, body: { imported: rows.length } };
}

export async function getLiteratureSupplement(env) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const [papersResult, authorsResult, meta] = await Promise.all([
    env.DB.prepare(
      `SELECT identity, doi, title, journal, first_online_date, article_url, synthesis_type, source
       FROM literature_supplement_papers
       ORDER BY first_online_date DESC, journal, title`
    ).all(),
    env.DB.prepare(
      `SELECT identity, sort_order, author_name
       FROM literature_supplement_authors
       ORDER BY identity, sort_order`
    ).all(),
    env.DB.prepare(
      'SELECT generated_at, verified_through, review_summary_json FROM literature_supplement_meta WHERE id = 1'
    ).first(),
  ]);
  const authorsByIdentity = new Map();
  for (const row of authorsResult?.results || []) {
    if (!authorsByIdentity.has(row.identity)) authorsByIdentity.set(row.identity, []);
    authorsByIdentity.get(row.identity).push(row.author_name);
  }
  const papers = (papersResult?.results || []).map(row => ({
    journal: row.journal,
    title: row.title || null,
    doi: row.doi || null,
    date: row.first_online_date,
    url: row.article_url || (row.doi ? `https://doi.org/${row.doi}` : null),
    new: true,
    authors: authorsByIdentity.get(row.identity) || [],
    ...(row.synthesis_type === 'total' || row.synthesis_type === 'formal'
      ? { synthesisType: row.synthesis_type }
      : {}),
  }));
  let reviewSummary = null;
  try {
    if (meta?.review_summary_json) reviewSummary = JSON.parse(meta.review_summary_json);
  } catch {
    reviewSummary = null;
  }
  return {
    status: 200,
    body: {
      generatedAt: Number(meta?.generated_at || 0),
      verifiedThrough: meta?.verified_through || null,
      reviewSummary,
      papers,
    },
  };
}

export async function importLiteratureSupplement(env, payload) {
  if (!env?.DB) return { status: 503, body: { error: 'D1 binding DB is not configured.' } };
  const rawPapers = Array.isArray(payload?.papers) ? payload.papers.slice(0, 5000) : [];
  const rows = [];
  for (const paper of rawPapers) {
    if (!paper || typeof paper !== 'object') continue;
    const journal = typeof paper.journal === 'string' ? paper.journal.trim() : '';
    const date = typeof paper.date === 'string' ? paper.date.trim() : '';
    const title = typeof paper.title === 'string' && paper.title.trim() ? paper.title.trim() : null;
    const doi = normalizeDoi(paper.doi);
    if (!journal || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (!title && !doi)) continue;
    rows.push({
      identity: await paperIdentity(paper),
      doi,
      title,
      journal,
      date,
      articleUrl: typeof paper.url === 'string' && paper.url.trim()
        ? paper.url.trim()
        : doi
          ? `https://doi.org/${doi}`
          : null,
      synthesisType: normalizeSynthesisType(paper.synthesisType),
      authors: Array.isArray(paper.authors)
        ? paper.authors.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean).slice(0, 200)
        : [],
      source: typeof paper.source === 'string' ? paper.source.slice(0, 120) : 'appdeploy-v93-migration',
    });
  }

  const now = Date.now();
  const statements = rows.map(row => env.DB.prepare(
    `INSERT INTO literature_supplement_papers
      (identity, doi, title, journal, first_online_date, article_url, synthesis_type, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(identity) DO UPDATE SET
       doi = COALESCE(excluded.doi, literature_supplement_papers.doi),
       title = COALESCE(excluded.title, literature_supplement_papers.title),
       journal = excluded.journal,
       first_online_date = excluded.first_online_date,
       article_url = COALESCE(excluded.article_url, literature_supplement_papers.article_url),
       synthesis_type = excluded.synthesis_type,
       source = excluded.source,
       updated_at = excluded.updated_at`
  ).bind(
    row.identity,
    row.doi,
    row.title,
    row.journal,
    row.date,
    row.articleUrl,
    row.synthesisType,
    row.source,
    now
  ));
  for (let offset = 0; offset < statements.length; offset += 80) {
    await env.DB.batch(statements.slice(offset, offset + 80));
  }

  const authorStatements = [];
  for (const row of rows) {
    authorStatements.push(env.DB.prepare(
      'DELETE FROM literature_supplement_authors WHERE identity = ?'
    ).bind(row.identity));
    row.authors.forEach((author, sortOrder) => {
      authorStatements.push(env.DB.prepare(
        `INSERT INTO literature_supplement_authors (identity, sort_order, author_name)
         VALUES (?, ?, ?)`
      ).bind(row.identity, sortOrder, author));
    });
  }
  for (let offset = 0; offset < authorStatements.length; offset += 80) {
    await env.DB.batch(authorStatements.slice(offset, offset + 80));
  }

  // Hard invariant: every newly imported DOI enters the media-repair system in the
  // same import operation. Existing completed/priority state is preserved.
  const repairDois = [...new Set(rows.map(row => row.doi).filter(Boolean))];
  const repairStatements = repairDois.map(doi => env.DB.prepare(
    `INSERT INTO media_repair_state
      (doi, repair_version, attempts, last_attempt_at, next_retry_at, last_root_cause, last_outcome, reported_priority, updated_at)
     VALUES (?, 1, 0, 0, 0, 'new_literature_import', 'pending', 0, ?)
     ON CONFLICT(doi) DO NOTHING`
  ).bind(doi, now));
  for (let offset = 0; offset < repairStatements.length; offset += 80) {
    await env.DB.batch(repairStatements.slice(offset, offset + 80));
  }

  const generatedAt = Number.isFinite(payload?.generatedAt) ? Number(payload.generatedAt) : now;
  const verifiedThrough = typeof payload?.verifiedThrough === 'string' ? payload.verifiedThrough.slice(0, 40) : null;
  const reviewSummary = payload?.reviewSummary && typeof payload.reviewSummary === 'object'
    ? JSON.stringify(payload.reviewSummary).slice(0, 12000)
    : null;
  await env.DB.prepare(
    `INSERT INTO literature_supplement_meta (id, generated_at, verified_through, review_summary_json, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       generated_at = excluded.generated_at,
       verified_through = excluded.verified_through,
       review_summary_json = excluded.review_summary_json,
       updated_at = excluded.updated_at`
  ).bind(generatedAt, verifiedThrough, reviewSummary, now).run();

  return {
    status: 200,
    body: {
      imported: rows.length,
      mediaRepairSeeded: repairDois.length,
      generatedAt,
      verifiedThrough,
    },
  };
}
