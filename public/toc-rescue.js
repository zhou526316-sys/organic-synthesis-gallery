(() => {
  const DOI_RE = /^10\.\d{4,9}\/\S+$/i;
  const VIEWPORT_MARGIN = 1200;
  const attempts = new Map();
  let manifestPromise = null;
  let scanTimer = null;

  function assetUrl(path) {
    if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
    return new URL(String(path).replace(/^\/+/, ''), document.baseURI).toString();
  }

  function normalizeDoi(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().toLowerCase()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .replace(/[?#].*$/, '');
    return DOI_RE.test(cleaned) ? cleaned : null;
  }

  function isNearViewport(slot) {
    const rect = slot.getBoundingClientRect();
    return rect.bottom >= -VIEWPORT_MARGIN && rect.top <= window.innerHeight + VIEWPORT_MARGIN;
  }

  async function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(assetUrl('media-index.json'), {
        credentials: 'same-origin',
        cache: 'no-store',
      })
        .then(response => response.ok ? response.json() : { items: {} })
        .then(payload => payload && typeof payload === 'object' ? payload : { items: {} })
        .catch(() => ({ items: {} }));
    }
    return manifestPromise;
  }

  function tocLabel(toc) {
    const sourceType = String(toc?.sourceType || '');
    const reason = String(toc?.reason || '');
    if (sourceType === 'open_graphical_abstract' || reason.startsWith('open_graphical_abstract:')) return 'Open graphical abstract';
    if (sourceType === 'preprint_graphic' || reason.startsWith('preprint_graphic:')) return 'Preprint graphic';
    if (sourceType === 'preprint_figure1' || reason.startsWith('preprint_figure1:')) return 'Preprint Figure 1';
    if (reason === 'figure1_fallback' || sourceType === 'article_figure1') return 'Figure 1';
    if (reason.startsWith('figure_fallback:')) return reason.slice('figure_fallback:'.length);
    return 'Article graphic / TOC';
  }

  function pickLargeImage(item) {
    if (item?.toc?.available && item.toc.imageUrl) {
      return {
        url: item.toc.imageUrl,
        label: tocLabel(item.toc),
      };
    }
    const first = item?.figures?.figures?.[0];
    return first?.imageUrl ? { url: first.imageUrl, label: first.label || 'Figure 1' } : null;
  }

  function openLightbox(url, label) {
    document.querySelector('.image-lightbox')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'image-lightbox';
    const panel = document.createElement('div');
    panel.className = 'image-lightbox-panel';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'image-lightbox-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close enlarged image');
    const image = new Image();
    image.className = 'image-lightbox-image';
    image.alt = label;
    image.src = url;
    panel.append(close, image);
    overlay.appendChild(panel);
    close.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function restoreSlot(slot, imageInfo) {
    const absoluteUrl = assetUrl(imageInfo.url);
    if (slot.dataset.tocRescueUrl === absoluteUrl && slot.querySelector('img.toc-image')) return;

    const key = `${slot.dataset.doi || ''}|${absoluteUrl}`;
    const lastAttempt = attempts.get(key) || 0;
    if (Date.now() - lastAttempt < 3000) return;
    attempts.set(key, Date.now());

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toc-link';
    const image = new Image();
    image.alt = imageInfo.label;
    image.className = 'toc-image';
    image.loading = 'eager';
    image.decoding = 'async';
    const label = document.createElement('span');
    label.className = 'toc-label';
    label.textContent = imageInfo.label;
    button.append(image, label);

    let committed = false;
    const commit = () => {
      if (committed || !image.naturalWidth) return;
      committed = true;
      slot.replaceChildren(button);
      slot.classList.remove('generated', 'pending');
      slot.classList.add('loaded');
      slot.dataset.state = 'done';
      slot.dataset.tocRescueUrl = absoluteUrl;
    };

    image.addEventListener('load', commit, { once: true });
    image.addEventListener('error', () => attempts.delete(key), { once: true });
    button.addEventListener('click', () => openLightbox(absoluteUrl, imageInfo.label));
    image.src = absoluteUrl;

    // Cached same-origin images can already be complete before the event loop returns.
    if (image.complete && image.naturalWidth) queueMicrotask(commit);
  }

  async function scan() {
    const manifest = await loadManifest();
    const items = manifest?.items || {};
    for (const slot of document.querySelectorAll('.toc-slot[data-doi]')) {
      if (!isNearViewport(slot)) continue;
      const doi = normalizeDoi(slot.dataset.doi);
      if (!doi) continue;
      const imageInfo = pickLargeImage(items[doi]);
      if (!imageInfo) continue;
      if (slot.classList.contains('loaded') && slot.querySelector('img.toc-image')) continue;
      restoreSlot(slot, imageInfo);
    }
  }

  function scheduleScan(delay = 0) {
    if (scanTimer !== null) clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      void scan();
    }, delay);
  }

  const observer = new MutationObserver(() => scheduleScan(30));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', () => scheduleScan(0));
  window.addEventListener('scroll', () => scheduleScan(50), { passive: true });
  window.addEventListener('resize', () => scheduleScan(80), { passive: true });
  window.addEventListener('gallery-assets-updated', () => {
    manifestPromise = null;
    scheduleScan(0);
  });
  scheduleScan(0);
})();
