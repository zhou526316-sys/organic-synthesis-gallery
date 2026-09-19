import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function extractPdfPrimary({ BrowserWindow, doi, pdfPath, bytes }) {
  const data = bytes || await readFile(pdfPath);
  if (data.length > 30_000_000 || data.subarray(0, 5).toString() !== '%PDF-') throw new Error('invalid_or_oversize_pdf');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  let timer;
  try {
    await win.loadFile(fileURLToPath(new URL('./pdf-renderer.html', import.meta.url)));
    const render = win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; !window.renderPrimaryPdf && i < 100; i++) await new Promise(r => setTimeout(r, 50));
      if (!window.renderPrimaryPdf) throw new Error('pdf_renderer_load_failed');
      return window.renderPrimaryPdf(${JSON.stringify(data.toString('base64'))}, ${JSON.stringify(doi)});
    })()`);
    return await Promise.race([render, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('pdf_render_timeout')), 45000); })]);
  } finally { clearTimeout(timer); if (!win.isDestroyed()) win.destroy(); }
}
