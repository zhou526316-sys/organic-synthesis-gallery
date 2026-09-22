const FULLTEXT_PREFIX = 'private/article-fulltext/';
const SUMMARY_PREFIX = 'private/article-summary/';
const SUMMARY_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const MAX_FULLTEXT_CHARS = 750_000;
const MAX_MODEL_CHARS = 140_000;

function normalizeDoi(value) {
  const raw = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw.replace(/[).,;]+$/, '') : '';
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeFulltext(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_FULLTEXT_CHARS);
}

function sampleForModel(text) {
  if (text.length <= MAX_MODEL_CHARS) return text;
  const first = Math.floor(MAX_MODEL_CHARS * 0.42);
  const middle = Math.floor(MAX_MODEL_CHARS * 0.2);
  const last = MAX_MODEL_CHARS - first - middle;
  const middleStart = Math.max(first, Math.floor((text.length - middle) / 2));
  return [
    text.slice(0, first),
    '\n\n[...middle section sampled from the synced full text...]\n\n',
    text.slice(middleStart, middleStart + middle),
    '\n\n[...later section sampled from the synced full text...]\n\n',
    text.slice(-last),
  ].join('');
}

function extractModelText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  if (typeof result?.text === 'string') return result.text;
  return '';
}

function parseSummaryJson(value) {
  let text = String(value || '').trim();
  text = text.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  try {
    const parsed = JSON.parse(text);
    const zh = typeof parsed?.zh === 'string' ? parsed.zh.trim() : '';
    const en = typeof parsed?.en === 'string' ? parsed.en.trim() : '';
    if (zh && en) return { zh, en };
  } catch {}
  return null;
}

async function keysForDoi(doi) {
  const hash = await sha256Hex(doi);
  const id = hash.slice(0, 32);
  return {
    fulltext: `${FULLTEXT_PREFIX}${id}.txt`,
    summary: `${SUMMARY_PREFIX}${id}.json`,
  };
}

async function readFulltext(env, doi) {
  if (!env?.MEDIA) return null;
  const keys = await keysForDoi(doi);
  const object = await env.MEDIA.get(keys.fulltext);
  if (!object) return null;
  const text = normalizeFulltext(await object.text());
  if (!text) return null;
  return {
    text,
    sourceHash: object.customMetadata?.sourceHash || await sha256Hex(text),
    sourceUrl: object.customMetadata?.sourceUrl || '',
    capturedAt: object.customMetadata?.capturedAt || '',
    key: keys.fulltext,
  };
}

async function readCachedSummary(env, doi, sourceHash) {
  if (!env?.MEDIA) return null;
  const keys = await keysForDoi(doi);
  const object = await env.MEDIA.get(keys.summary);
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text());
    if (parsed?.sourceHash !== sourceHash) return null;
    if (typeof parsed?.zh !== 'string' || typeof parsed?.en !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function generateSummary(env, doi, fulltext) {
  if (!env?.AI) return null;
  const modelText = sampleForModel(fulltext.text);
  const prompt = `You are summarizing a chemistry research article from synced full text.
Return STRICT JSON only, with exactly two string keys: "zh" and "en".
Both versions must summarize the same scientific content.
The Chinese version should be concise but information-dense; the English version should be concise scientific English.
Cover when supported by the text: research objective, core transformation or method, catalyst/reagents/conditions, mechanistic rationale, substrate scope, selectivity, limitations, and significance.
Do not invent missing facts. Do not quote long passages. Paraphrase.
Use short paragraphs and bullet-like lines separated by newline characters.
DOI: ${doi}

SYNCED FULL TEXT:
${modelText}`;

  const result = await env.AI.run(SUMMARY_MODEL, {
    messages: [
      { role: 'system', content: 'You are a precise organic chemistry literature summarizer. Output valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.15,
    max_tokens: 2200,
  });
  return parseSummaryJson(extractModelText(result));
}

export async function importArticleFulltext(env, payload) {
  if (!env?.MEDIA) return { status: 503, body: { error: 'R2 binding MEDIA is not configured.' } };
  const doi = normalizeDoi(payload?.doi);
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  const text = normalizeFulltext(payload?.text);
  if (text.length < 1000) return { status: 400, body: { error: 'fulltext_too_short' } };

  const sourceHash = await sha256Hex(text);
  const keys = await keysForDoi(doi);
  const sourceUrl = String(payload?.sourceUrl || '').slice(0, 2000);
  const capturedAt = String(payload?.capturedAt || new Date().toISOString()).slice(0, 80);
  await env.MEDIA.put(keys.fulltext, text, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { doi, sourceHash, sourceUrl, capturedAt },
  });

  const cached = await env.MEDIA.get(keys.summary);
  if (cached) {
    try {
      const parsed = JSON.parse(await cached.text());
      if (parsed?.sourceHash !== sourceHash) await env.MEDIA.delete(keys.summary);
    } catch {
      await env.MEDIA.delete(keys.summary);
    }
  }

  return {
    status: 200,
    body: {
      stored: true,
      doi,
      chars: text.length,
      sourceHash,
      capturedAt,
    },
  };
}

export async function getArticleSummary(env, doiValue) {
  const doi = normalizeDoi(doiValue);
  if (!doi) return { status: 400, body: { error: 'invalid_doi' } };
  if (!env?.MEDIA) return { status: 503, body: { error: 'summary_storage_unavailable' } };

  const fulltext = await readFulltext(env, doi);
  if (!fulltext) {
    return {
      status: 200,
      body: {
        doi,
        available: false,
        fulltextAvailable: false,
        reason: 'fulltext_missing',
      },
    };
  }

  const cached = await readCachedSummary(env, doi, fulltext.sourceHash);
  if (cached) {
    return {
      status: 200,
      body: {
        doi,
        available: true,
        fulltextAvailable: true,
        cached: true,
        source: 'fulltext',
        zh: cached.zh,
        en: cached.en,
        generatedAt: cached.generatedAt,
      },
    };
  }

  if (!env?.AI) {
    return {
      status: 200,
      body: {
        doi,
        available: false,
        fulltextAvailable: true,
        reason: 'ai_unavailable',
      },
    };
  }

  const summary = await generateSummary(env, doi, fulltext);
  if (!summary) return { status: 502, body: { error: 'summary_generation_failed' } };

  const generatedAt = Date.now();
  const keys = await keysForDoi(doi);
  const stored = {
    version: 1,
    doi,
    sourceHash: fulltext.sourceHash,
    source: 'fulltext',
    model: SUMMARY_MODEL,
    zh: summary.zh,
    en: summary.en,
    generatedAt,
  };
  await env.MEDIA.put(keys.summary, JSON.stringify(stored), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'private, no-store' },
    customMetadata: { doi, sourceHash: fulltext.sourceHash, model: SUMMARY_MODEL },
  });

  return {
    status: 200,
    body: {
      doi,
      available: true,
      fulltextAvailable: true,
      cached: false,
      source: 'fulltext',
      zh: summary.zh,
      en: summary.en,
      generatedAt,
    },
  };
}
