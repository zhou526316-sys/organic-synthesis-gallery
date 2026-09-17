const NATURE_VISUAL_GAPS = new Set([
  '10.1038/s41467-026-74378-1',
  '10.1038/s41467-026-76455-x',
  '10.1038/s41467-026-76749-0',
  '10.1038/s41467-026-76869-7',
  '10.1038/s41467-026-77092-0',
  '10.1038/s41467-026-77184-x',
  '10.1038/s41467-026-77185-w',
  '10.1038/s41467-026-77336-z',
  '10.1038/s41467-026-77436-w',
  '10.1038/s41467-026-77468-2',
  '10.1038/s41467-026-77482-4',
  '10.1038/s41467-026-77633-7',
  '10.1038/s41467-026-77715-6',
  '10.1038/s41467-026-77739-y',
  '10.1038/s41467-026-77774-9',
  '10.1038/s41586-026-11043-z',
]);

const pending = new Set<string>();
let scanTimer: number | null = null;

function normalizeDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  return /^10\.\d{4,9}\/\S+$/i.test(cleaned) ? cleaned : null;
}

function figureOneUrl(doi: string): string | null {
  const match = doi.match(/^10\.1038\/s(\d+)-(\d{3})-(\d+)-[a-z0-9]+$/i);
  if (!match) return null;
  const journalId = match[1];
  const year = 2000 + Number(match[2]);
  const articleNumber = match[3];
  if (!Number.isFinite(year) || year < 2000 || year > 2099) return null;
  const encodedDoi = encodeURIComponent(doi).replace(/%2f/ig, '%2F');
  return `https://media.springernature.com/full/springer-static/image/art%3A${encodedDoi}/MediaObjects/${journalId}_${year}_${articleNumber}_Fig1_HTML.png`;
}

function isChineseUi(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith('zh');
}

function commitToc(slot: HTMLElement, sourceImage: HTMLImageElement, doi: string, sourceUrl: string): void {
  if (slot.querySelector('img.toc-image')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toc-link';
  button.dataset.sourceRepository = 'Springer Nature';
  button.dataset.sourceType = 'article_figure1';
  button.dataset.sourceUrl = sourceUrl;

  sourceImage.className = 'toc-image';
  sourceImage.alt = 'Figure 1';
  sourceImage.loading = 'eager';
  sourceImage.decoding = 'async';

  const label = document.createElement('span');
  label.className = 'toc-label';
  label.textContent = 'Figure 1';
  button.append(sourceImage, label);

  slot.replaceChildren(button);
  slot.classList.remove('generated', 'pending');
  slot.classList.add('loaded');
  slot.dataset.state = 'done';
  slot.dataset.runtimeNatureFigureFallback = doi;
}

function commitFigureStrip(card: HTMLElement, doi: string, sourceUrl: string): void {
  const slot = card.querySelector<HTMLElement>('.figure-strip-slot[data-figure-doi]');
  if (!slot || slot.querySelector('.figure-thumb:not(.generated-thumb) img')) return;

  const heading = document.createElement('div');
  heading.className = 'figure-strip-heading';
  heading.textContent = isChineseUi() ? '正文图片' : 'Article figures';

  const strip = document.createElement('div');
  strip.className = 'figure-strip';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'figure-thumb';
  button.dataset.sourceRepository = 'Springer Nature';
  button.dataset.sourceType = 'article_figure1';
  const image = new Image();
  image.loading = 'lazy';
  image.decoding = 'async';
  image.alt = 'Figure 1';
  image.src = sourceUrl;
  const label = document.createElement('span');
  label.textContent = 'Figure 1';
  button.append(image, label);
  strip.appendChild(button);
  slot.replaceChildren(heading, strip);
  slot.classList.remove('generated');
  slot.classList.add('loaded');
  slot.dataset.state = 'done';
  slot.dataset.runtimeNatureFigureFallback = doi;
}

function tryRestore(card: HTMLElement, slot: HTMLElement, doi: string): void {
  if (slot.querySelector('img.toc-image') || pending.has(doi)) return;
  const sourceUrl = figureOneUrl(doi);
  if (!sourceUrl) return;
  pending.add(doi);

  const image = new Image();
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer-when-downgrade';
  image.addEventListener('load', () => {
    pending.delete(doi);
    if (!image.naturalWidth || !image.naturalHeight) return;
    commitToc(slot, image, doi, sourceUrl);
    commitFigureStrip(card, doi, sourceUrl);
  }, { once: true });
  image.addEventListener('error', () => pending.delete(doi), { once: true });
  image.src = sourceUrl;
}

function scan(): void {
  for (const card of document.querySelectorAll<HTMLElement>('.card')) {
    const slot = card.querySelector<HTMLElement>('.toc-slot[data-doi]');
    const doi = normalizeDoi(slot?.dataset.doi);
    if (!slot || !doi || !NATURE_VISUAL_GAPS.has(doi)) continue;
    tryRestore(card, slot, doi);
  }
}

function scheduleScan(delay = 0): void {
  if (scanTimer !== null) clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scan();
  }, delay);
}

const observer = new MutationObserver(() => scheduleScan(40));
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('pageshow', () => scheduleScan(0));
window.addEventListener('scroll', () => scheduleScan(80), { passive: true });
document.addEventListener('click', () => scheduleScan(0), true);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleScan(0);
});

scheduleScan(0);

export {};
