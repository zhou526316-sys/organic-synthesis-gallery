export const PRIMARY_VISUAL_KINDS = new Set([
  'graphical_abstract',
  'toc_graphic',
  'visual_abstract',
  'abstract_image',
  'graphical_synopsis',
  'figure1',
  'scheme1',
  'article_figure',
  'pdf_primary_visual',
  'open_version_graphic',
  'preprint_graphic',
]);

const REJECT_RE = /\b(?:supporting\s+information|supplement(?:ary)?|nmr|spectrum|spectra|x-?ray\s+(?:table|diffraction)|kinetic|bar\s+chart|journal\s+cover|cover\s+image|logo|advert|banner|avatar)\b/i;
const HIGH_VALUE_RE = /\b(?:reaction|synthetic|synthesis|strategy|concept|scope|mechanism|mechanistic|catalytic\s+cycle|platform|overview|scheme)\b/i;
const OFFICIAL_RE = /\b(?:graphical\s+abstract|visual\s+abstract|abstract\s+image|abstract\s+graphic|graphical\s+synopsis|synopsis\s+graphic|table\s+of\s+contents|toc\s+(?:graphic|image)|entry\s+for\s+table\s+of\s+contents|highlight\s+graphic|article\s+graphic|teaser\s+image|featured\s+image)\b/i;

export function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

export function inferKind({ kind, reason, label, caption, sourceType } = {}) {
  if (PRIMARY_VISUAL_KINDS.has(kind)) return kind;
  const text = [reason, label, caption, sourceType].filter(Boolean).join(' ').toLowerCase();
  if (/visual\s*abstract/.test(text)) return 'visual_abstract';
  if (/graphical\s*abstract/.test(text)) return 'graphical_abstract';
  if (/graphical\s*synopsis|synopsis\s*graphic/.test(text)) return 'graphical_synopsis';
  if (/toc[_\s-]*(?:graphic|image)|table\s*of\s*contents/.test(text)) return 'toc_graphic';
  if (/abstract[_\s-]*(?:image|graphic)/.test(text)) return 'abstract_image';
  if (/^figure[_\s-]*1$|figure1|figure\s*1|fig\.?\s*1|figure1_fallback/.test(text)) return 'figure1';
  if (/^scheme[_\s-]*1$|scheme\s*1/.test(text)) return 'scheme1';
  if (/publisher_pdf|pdf[_\s-]*primary|pdf\s+figure/.test(text)) return 'pdf_primary_visual';
  if (/preprint/.test(text)) return 'preprint_graphic';
  if (/open[_\s-]*(?:version|repository)|pmc|institutional|accepted[_\s-]*manuscript/.test(text)) return 'open_version_graphic';
  return 'article_figure';
}

export function semanticScore(candidate = {}) {
  const kind = inferKind(candidate);
  const text = [candidate.label, candidate.caption, candidate.reason].filter(Boolean).join(' ');
  if (REJECT_RE.test(text)) return -100;
  const base = {
    graphical_abstract: 100,
    toc_graphic: 100,
    visual_abstract: 100,
    abstract_image: 92,
    graphical_synopsis: 92,
    figure1: 70,
    scheme1: 58,
    pdf_primary_visual: 68,
    open_version_graphic: 55,
    preprint_graphic: 50,
    article_figure: 40,
  }[kind] ?? 0;
  return base + (HIGH_VALUE_RE.test(text) ? 8 : 0) + (OFFICIAL_RE.test(text) ? 5 : 0);
}

export function sourceScore(candidate = {}) {
  const source = [candidate.sourceType, candidate.sourceRepository, candidate.sourceUrl].filter(Boolean).join(' ').toLowerCase();
  if (/publisher_pdf/.test(source)) return 100;
  if (/publisher|acs publications|springer nature|nature|wiley|science/.test(source)) return 100;
  if (/crossref.*tdm|crossref/.test(source)) return 88;
  if (/pmc/.test(source)) return 82;
  if (/openalex|institutional|accepted/.test(source)) return 72;
  if (/preprint|chemrxiv/.test(source)) return 60;
  if (/search|thumbnail|google/.test(source)) return 20;
  return 55;
}

export function imageQualityScore(candidate = {}) {
  const width = Number(candidate.width || 0);
  const height = Number(candidate.height || 0);
  const longest = Math.max(width, height);
  const pixels = width * height;
  let score = 55;
  if (longest >= 1800) score = 100;
  else if (longest >= 1200) score = 92;
  else if (longest >= 900) score = 82;
  else if (longest >= 600) score = 70;
  else if (longest > 0) score = 45;
  if (pixels > 0 && pixels < 120_000) score -= 20;
  if (candidate.isThumbnail) score -= 25;
  return Math.max(0, Math.min(100, score));
}

export function scoreCandidate(candidate = {}) {
  const semantic = semanticScore(candidate);
  const source = sourceScore(candidate);
  const quality = imageQualityScore(candidate);
  const rejected = semantic < 0 || !candidate.imageUrl;
  const total = rejected ? -1000 : semantic * 0.5 + source * 0.3 + quality * 0.2;
  const confidence = rejected ? 0 : Math.max(0.35, Math.min(0.99, total / 100));
  return { semanticScore: semantic, sourceScore: source, imageQualityScore: quality, totalScore: total, confidence };
}

export function candidateFromToc(toc = {}, doi = '') {
  if (!toc?.available || !toc?.imageUrl) return null;
  return {
    doi,
    imageUrl: toc.imageUrl,
    articleUrl: toc.articleUrl,
    reason: toc.reason,
    kind: inferKind(toc),
    sourceType: toc.sourceType || (String(toc.reason || '').includes('figure') ? 'publisher_html' : 'publisher_structured'),
    sourceRepository: toc.sourceRepository,
    sourceUrl: toc.sourceUrl || toc.imageUrl,
    page: toc.page,
    bbox: toc.bbox,
    width: toc.width,
    height: toc.height,
    sha256: toc.sha256 || toc.contentHash,
    retrievedAt: toc.retrievedAt,
    label: toc.label,
    caption: toc.caption,
  };
}

export function candidateFromFigure(figure = {}, doi = '', articleUrl = '') {
  if (!figure?.imageUrl) return null;
  const label = String(figure.label || figure.id || 'Article figure');
  const kind = inferKind({ kind: figure.kind, label, caption: figure.caption, sourceType: figure.sourceType });
  return {
    doi,
    imageUrl: figure.imageUrl,
    articleUrl: figure.articleUrl || articleUrl,
    reason: kind === 'figure1' ? 'figure1_fallback' : `figure_fallback:${label}`,
    kind,
    sourceType: figure.sourceType || 'publisher_html',
    sourceRepository: figure.sourceRepository,
    sourceUrl: figure.sourceUrl || figure.imageUrl,
    page: figure.page,
    bbox: figure.bbox,
    width: figure.width,
    height: figure.height,
    sha256: figure.sha256 || figure.contentHash,
    retrievedAt: figure.retrievedAt,
    label,
    caption: figure.caption,
  };
}

export function selectBestPrimaryVisual(item = {}) {
  const doi = normalizeDoi(item?.doi) || String(item?.doi || '').toLowerCase();
  const candidates = [];
  const toc = candidateFromToc(item?.toc, doi);
  if (toc) candidates.push(toc);
  if (item?.primaryVisual?.imageUrl) candidates.push({ ...item.primaryVisual, doi, kind: inferKind(item.primaryVisual) });
  const figureArticleUrl = item?.figures?.articleUrl || item?.toc?.articleUrl || '';
  for (const figure of item?.figures?.figures || []) {
    const candidate = candidateFromFigure(figure, doi, figureArticleUrl);
    if (candidate) candidates.push(candidate);
  }
  const scored = candidates
    .map(candidate => ({ ...candidate, ...scoreCandidate(candidate) }))
    .filter(candidate => candidate.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore || b.imageQualityScore - a.imageQualityScore);
  return scored[0] || null;
}

export function primaryVisualRecord(candidate) {
  if (!candidate) return null;
  return {
    doi: candidate.doi,
    kind: inferKind(candidate),
    imageUrl: candidate.imageUrl,
    sourceType: candidate.sourceType || 'unknown',
    sourceRepository: candidate.sourceRepository || undefined,
    sourceUrl: candidate.sourceUrl || candidate.imageUrl,
    articleUrl: candidate.articleUrl || undefined,
    page: Number.isInteger(candidate.page) ? candidate.page : undefined,
    bbox: Array.isArray(candidate.bbox) && candidate.bbox.length === 4 ? candidate.bbox : undefined,
    confidence: Number(candidate.confidence?.toFixed?.(3) ?? candidate.confidence ?? 0),
    semanticScore: Number(candidate.semanticScore ?? 0),
    sourceScore: Number(candidate.sourceScore ?? 0),
    imageQualityScore: Number(candidate.imageQualityScore ?? 0),
    totalScore: Number(candidate.totalScore?.toFixed?.(2) ?? candidate.totalScore ?? 0),
    width: Number(candidate.width || 0) || undefined,
    height: Number(candidate.height || 0) || undefined,
    sha256: candidate.sha256 || undefined,
    retrievedAt: candidate.retrievedAt || undefined,
    label: candidate.label || undefined,
  };
}

export function compatibilityToc(candidate, existing = {}, doi = '') {
  if (!candidate) return existing;
  const kind = inferKind(candidate);
  return {
    ...existing,
    available: true,
    doi: normalizeDoi(doi) || candidate.doi || doi,
    articleUrl: candidate.articleUrl || existing.articleUrl,
    imageUrl: candidate.imageUrl,
    reason: kind === 'figure1' ? 'figure1_fallback' : kind === 'article_figure' || kind === 'scheme1' || kind === 'pdf_primary_visual' || kind === 'open_version_graphic' || kind === 'preprint_graphic' ? `figure_fallback:${candidate.label || kind}` : existing.reason || kind,
    kind,
    sourceType: candidate.sourceType || existing.sourceType,
    sourceRepository: candidate.sourceRepository || existing.sourceRepository,
    sourceUrl: candidate.sourceUrl || existing.sourceUrl || candidate.imageUrl,
    page: candidate.page ?? existing.page,
    bbox: candidate.bbox ?? existing.bbox,
    confidence: candidate.confidence ?? existing.confidence,
    width: candidate.width ?? existing.width,
    height: candidate.height ?? existing.height,
    sha256: candidate.sha256 ?? existing.sha256,
    retrievedAt: candidate.retrievedAt ?? existing.retrievedAt,
    label: candidate.label ?? existing.label,
  };
}

export function visualBucket(primary) {
  const kind = inferKind(primary || {});
  if (!primary?.imageUrl) return 'no_visual';
  if (['graphical_abstract', 'toc_graphic', 'visual_abstract', 'abstract_image', 'graphical_synopsis'].includes(kind)) return 'publisher_primary_graphic';
  if (kind === 'figure1') return 'publisher_figure1';
  if (kind === 'pdf_primary_visual') return 'pdf_primary_visual';
  if (['open_version_graphic', 'preprint_graphic'].includes(kind)) return 'open_version_visual';
  return 'other_fallback';
}
