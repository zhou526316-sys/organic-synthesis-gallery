const { app, BrowserWindow, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const output = path.resolve('.artifacts');
fs.mkdirSync(output, { recursive: true });
const doi = '10.1038/pdf-fixture';
function fixture(figurePage, supporting = false) {
  const streams = [1, 2].map(page => `BT /F1 14 Tf 50 750 Td (${page === 1 ? (supporting ? 'Supporting information ' : '') + doi : 'Article continued'}) Tj ET\n` +
    (page === figurePage ? '0.15 0.4 0.65 RG 4 w 70 155 190 130 re S 320 155 190 130 re S 260 220 m 320 220 l S 305 210 m 320 220 l 305 230 l S\nBT /F1 12 Tf 80 180 Td (Panel A) Tj 250 0 Td (Panel B) Tj ET\nBT /F1 11 Tf 60 120 Td (Figure 1. Vector-only compound reaction scheme.) Tj ET\n' : ''));
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    ...[5, 6].map(id => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents ${id} 0 R >>`),
    ...streams.map(s => `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}endstream`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
app.whenReady().then(async () => {
  const keepAliveWindow = new BrowserWindow({ show: false });
  const { extractPdfPrimary } = await import(pathToFileURL(path.resolve('toc-collector/src/pdf-primary.mjs')).href);
  const results = [];
  for (const page of [1, 2]) {
    const result = await extractPdfPrimary({ BrowserWindow, doi, bytes: fixture(page) });
    assert.equal(result.page, page);
    assert.equal(result.kind, 'pdf_primary');
    assert.ok(result.bbox.y > 400, 'bottom-of-page figure selected');
    assert.ok(!nativeImage.createFromDataURL(result.imageData).isEmpty());
    fs.writeFileSync(path.join(output, `pdf-vector-page${page}.png`), Buffer.from(result.imageData.split(',')[1], 'base64'));
    results.push({ page, bbox: result.bbox, width: result.width, height: result.height, kind: result.kind });
  }
  assert.equal((await extractPdfPrimary({ BrowserWindow, doi: doi + '2', bytes: fixture(1) })).reason, 'pdf_doi_not_verified');
  assert.equal((await extractPdfPrimary({ BrowserWindow, doi, bytes: fixture(1, true) })).reason, 'pdf_supporting_information_rejected');
  fs.writeFileSync(path.join(output, 'pdf-tests.json'), JSON.stringify({ passed: true, results }, null, 2));
  app.exit(0);
}).catch(error => { fs.writeFileSync(path.join(output, 'pdf-tests.json'), JSON.stringify({ passed: false, error: String(error.message) })); app.exit(1); });
