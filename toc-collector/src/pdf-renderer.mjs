import { getDocument, GlobalWorkerOptions } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;

// Render the complete page, including vector paths and compound figures. A
// caption plus a separated graphic region is required; unlabelled crops fail soft.
window.renderPrimaryPdf = async (base64, doi) => {
  const task = getDocument({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
    isEvalSupported: false, enableXfa: false, useSystemFonts: true });
  const doc = await task.promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= Math.min(2, doc.numPages); pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push({ page, pageNumber, items: text.items.filter(item => 'str' in item) });
    }
    const text = pages.flatMap(p => p.items.map(i => i.str)).join(' ').toLowerCase();
    const doiPattern = doi.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(doiPattern + '(?![a-z0-9./-])').test(text)) return { reason: 'pdf_doi_not_verified' };
    if (/supporting information|supplementary information/i.test(pages[0].items.slice(0, 12).map(i => i.str).join(' '))) {
      return { reason: 'pdf_supporting_information_rejected' };
    }
    for (const { page, pageNumber, items } of pages) {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
      const boxes = items.map(item => {
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        return { text: item.str, x, y: y - Math.abs(item.height * 2), width: item.width * 2, height: Math.abs(item.height * 2) };
      });
      const captions = boxes.filter(b => /^(?:fig(?:ure)?\.?\s*1\b|graphical\s+abstract\b|visual\s+abstract\b|TOC\s+graphic\b)/i.test(b.text.trim()));
      for (const caption of captions) {
        const below = /^(?:graphical|visual|TOC)/i.test(caption.text.trim());
        const top = Math.max(0, Math.floor(below ? caption.y + caption.height + 5 : caption.y - canvas.height * .6));
        const bottom = Math.min(canvas.height, Math.floor(below ? canvas.height - 45 : caption.y - 5));
        if (bottom - top < 120) continue;
        const masked = document.createElement('canvas');
        masked.width = canvas.width; masked.height = canvas.height;
        const mc = masked.getContext('2d', { willReadFrequently: true });
        mc.drawImage(canvas, 0, 0); mc.fillStyle = 'white';
        // Remove prose only for geometry detection; the final image is cropped
        // from the original canvas so chemical labels and panel text survive.
        for (const b of boxes) mc.fillRect(b.x - 2, b.y - 3, b.width + 4, b.height + 6);
        const pixels = mc.getImageData(0, top, canvas.width, bottom - top);
        const rows = [];
        for (let y = 0; y < pixels.height; y++) {
          let count = 0;
          for (let x = 35; x < canvas.width - 35; x++) {
            const i = (y * canvas.width + x) * 4;
            if (Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) < 180) count++;
          }
          if (count >= 8) rows.push(y + top);
        }
        if (!rows.length) continue;
        const groups = [];
        for (const y of rows) {
          if (!groups.length || y - groups.at(-1).at(-1) > 45) groups.push([]);
          groups.at(-1).push(y);
        }
        const group = below ? groups[0] : groups.at(-1);
        const y0 = Math.max(top, group[0] - 14), y1 = Math.min(bottom, group.at(-1) + 15);
        if (y1 - y0 < 120 || (below ? y0 - top : bottom - y1) > 150) continue;
        let x0 = canvas.width, x1 = 0;
        for (let y = y0; y < y1; y++) for (let x = 35; x < canvas.width - 35; x++) {
          const i = ((y - top) * canvas.width + x) * 4;
          if (Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) < 180) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        }
        x0 = Math.max(0, x0 - 20); x1 = Math.min(canvas.width, x1 + 20);
        if (x1 - x0 < 200) continue;
        const crop = document.createElement('canvas'); crop.width = x1 - x0; crop.height = y1 - y0;
        crop.getContext('2d').drawImage(canvas, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height);
        return { kind: 'pdf_primary', source: 'pdf_caption_region_render', confidence: 80,
          text: caption.text, page: pageNumber, bbox: { x: x0 / 2, y: y0 / 2, width: crop.width / 2, height: crop.height / 2, units: 'pt', origin: 'top-left' },
          width: crop.width, height: crop.height, ownershipToken: doi,
          imageData: crop.toDataURL('image/png') };
      }
    }
    return { reason: 'pdf_caption_region_not_verified' };
  } finally { await doc.destroy(); }
};
