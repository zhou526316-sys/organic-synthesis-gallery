const RSS_ROOT = 'https://pubs.acs.org/rss';

export const ACS_JOURNALS = {
  orlef7: { name: 'Organic Letters', doiPrefixes: ['10.1021/acs.orglett.'] },
  jacsat: { name: 'Journal of the American Chemical Society', doiPrefixes: ['10.1021/jacs.'] },
  accacs: { name: 'ACS Catalysis', doiPrefixes: ['10.1021/acscatal.'] },
};

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, 'i'));
  return decodeXml(match?.[1] || match?.[2] || '');
}

function imageCandidates(block) {
  const rows = [];
  for (const match of String(block || '').matchAll(/<(?:media:content|media:thumbnail)\b[^>]*>/gi)) {
    const url = attr(match[0], 'url');
    if (url) rows.push({ url, text: match[0], source: 'rss_media' });
  }
  for (const match of String(block || '').matchAll(/<img\b[^>]*>/gi)) {
    const url = attr(match[0], 'src') || attr(match[0], 'data-src') || attr(match[0], 'data-original');
    const text = [attr(match[0], 'alt'), attr(match[0], 'title'), match[0]].filter(Boolean).join(' ');
    if (url) rows.push({ url, text, source: 'rss_html' });
  }
  return rows.filter(row => {
    const low = `${row.url} ${row.text}`.toLowerCase();
    return /^https:/.test(row.url) && !/logo|icon|avatar|cover|advert|banner|linkedin|facebook|twitter/.test(low);
  });
}

function candidateScore(row) {
  const text = `${row.url} ${row.text}`.toLowerCase();
  let score = 40;
  if (/toc|graphical|abstract|ga[-_.]/.test(text)) score += 50;
  if (/article|figure|fig/.test(text)) score += 20;
  if (/thumb|small|icon/.test(text)) score -= 25;
  return score;
}

export function journalCodeForDoi(doi) {
  const lower = String(doi || '').toLowerCase();
  return Object.entries(ACS_JOURNALS).find(([, value]) => value.doiPrefixes.some(prefix => lower.startsWith(prefix)))?.[0] || null;
}

export async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.7',
          'User-Agent': 'organic-synthesis-gallery-primary-visual-resolver/2.0',
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) return { text: await response.text(), finalUrl: response.url || url, status: response.status };
      lastError = new Error(`HTTP ${response.status}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 600 * 2 ** attempt));
  }
  throw lastError || new Error(`Unable to fetch ${url}`);
}

export function parseRssForDoi(xml, doi, feedUrl) {
  const normalized = String(doi || '').toLowerCase();
  for (const match of String(xml || '').matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = decodeXml(match[0]);
    if (!block.toLowerCase().includes(normalized)) continue;
    const images = imageCandidates(block).sort((a, b) => candidateScore(b) - candidateScore(a));
    if (!images.length) return null;
    const image = images[0];
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
    return {
      doi: normalized,
      kind: /toc/.test(`${image.url} ${image.text}`.toLowerCase()) ? 'toc_graphic' : /graphical|abstract/.test(`${image.url} ${image.text}`.toLowerCase()) ? 'graphical_abstract' : 'abstract_image',
      imageUrl: image.url,
      articleUrl: /^https?:/i.test(link) ? link : `https://doi.org/${normalized}`,
      sourceType: 'publisher_rss',
      sourceRepository: 'ACS Publications',
      sourceUrl: feedUrl,
      label: 'ACS article graphic',
      confidence: 0.86,
    };
  }
  return null;
}

export async function resolveFromAcsRss(doi) {
  const code = journalCodeForDoi(doi);
  if (!code) return null;
  const feeds = [`${RSS_ROOT}/${code}/asap.xml`, `${RSS_ROOT}/${code}/currentIssue.xml`];
  const failures = [];
  for (const feedUrl of feeds) {
    try {
      const { text } = await fetchText(feedUrl);
      const candidate = parseRssForDoi(text, doi, feedUrl);
      if (candidate) return { candidate, failures };
    } catch (error) {
      failures.push({ url: feedUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { candidate: null, failures };
}
