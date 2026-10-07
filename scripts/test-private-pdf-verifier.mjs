import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIVATE_PDF_PROCESSOR_REVISION, sha256Hex, titleScoreMilli, verifyPrivatePdfBytes } from './private-pdf-readable-verifier.mjs';

function escapePdf(value) { return String(value).replace(/([\\()])/g, '\\$1').replace(/[\r\n]+/g, ' '); }
function makePdf(text, title = '') {
  text = String(text) + ' ' + 'validation filler '.repeat(80);
  const stream = `BT /F1 10 Tf 50 740 Td (${escapePdf(text)}) Tj ET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  if (title) objects.push(`6 0 obj\n<< /Title (${escapePdf(title)}) >>\nendobj\n`);
  let body = '%PDF-1.4\n'; const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(body)); body += object; }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) body += String(offset).padStart(10, '0') + ' 00000 n \n';
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${title ? ' /Info 6 0 R' : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body));
}
function item(bytes, overrides = {}) { return { documentId: 'pdf_fixture', doi: '10.1021/jacs.6c12345',
  contentHash: sha256Hex(bytes), byteLength: bytes.byteLength,
  catalog: { title: 'Selective Radical Carbonylation of Alkenes with Visible Light', authors: ['Alice Smith', 'Bob Chen'], journal: 'JACS' },
  sourceKind: 'article', ...overrides }; }

test('revision is pinned', () => assert.equal(PRIVATE_PDF_PROCESSOR_REVISION, 'private-pdf-readable-v2'));
test('title matcher tolerates punctuation and spacing', () => assert.ok(titleScoreMilli('Nickel-Catalyzed C–H Coupling', 'Nickel catalyzed C H coupling under mild conditions') >= 750));
test('real PDF.js parse verifies DOI plus title identity', async () => {
  const bytes = makePdf('Selective Radical Carbonylation of Alkenes with Visible Light Alice Smith Bob Chen DOI 10.1021/jacs.6c12345 body text body text body text body text body text body text');
  const out = await verifyPrivatePdfBytes(bytes, item(bytes)); assert.equal(out.decision, 'verified'); assert.equal(out.evidence.doiMatch, true); assert.ok(out.evidence.titleScoreMilli >= 450);
});
test('supporting-information PDF is rejected even with matching DOI and title', async () => {
  const bytes = makePdf('Supporting Information Selective Radical Carbonylation of Alkenes with Visible Light 10.1021/jacs.6c12345 Alice Smith body body body body body body body');
  const out = await verifyPrivatePdfBytes(bytes, item(bytes, { sourceKind: 'supplement' })); assert.equal(out.decision, 'failed'); assert.equal(out.evidence.reason, 'supplement_detected');
});
test('wrong DOI is rejected', async () => {
  const bytes = makePdf('Selective Radical Carbonylation of Alkenes with Visible Light 10.1021/jacs.6c99999 Alice Smith body text body text body text body text body text body text');
  const out = await verifyPrivatePdfBytes(bytes, item(bytes, { sourceKind: 'unknown' })); assert.equal(out.decision, 'failed'); assert.equal(out.evidence.reason, 'doi_missing');
});
test('hash mismatch fails before identity activation', async () => {
  const bytes = makePdf('Selective Radical Carbonylation of Alkenes with Visible Light 10.1021/jacs.6c12345 Alice Smith');
  const out = await verifyPrivatePdfBytes(bytes, { ...item(bytes), contentHash: 'a'.repeat(64) }); assert.equal(out.decision, 'failed'); assert.equal(out.evidence.reason, 'object_mismatch');
});

test('article source is not rejected merely because first page mentions Supporting Information', async () => {
  const bytes = makePdf('Selective Radical Carbonylation of Alkenes with Visible Light Alice Smith 10.1021/jacs.6c12345 abstract text Supporting Information is available for this article');
  const out = await verifyPrivatePdfBytes(bytes, item(bytes, { sourceKind: 'article' }));
  assert.equal(out.decision, 'verified');
  assert.equal(out.evidence.supplementMarker, false);
});
test('strong article source plus exact catalog title can recover a DOI omitted from extracted text', async () => {
  const bytes = makePdf('Selective Radical Carbonylation of Alkenes with Visible Light Alice Smith Bob Chen full article body without a machine-readable DOI');
  const out = await verifyPrivatePdfBytes(bytes, item(bytes, { sourceKind: 'article' }));
  assert.equal(out.decision, 'verified');
  assert.equal(out.evidence.doiMatch, false);
  assert.ok(out.evidence.titleScoreMilli >= 900);
});
