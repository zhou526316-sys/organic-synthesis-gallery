import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfDois, filenameDoiHint, inferPdfDoiIdentity,
  evaluatePdfDoiIdentity } from '../src/pdf-vault/doi-identity.mjs';

const DOI = '10.1021/jacs.6c15886';

test('exact DOI is required regardless of filename', () => {
  assert.equal(filenameDoiHint('jacs.6c15886.pdf', DOI), true);
  assert.equal(evaluatePdfDoiIdentity({ filename: 'jacs.6c15886.pdf',
    firstPageText: 'doi:10.1021/jacs.6c15887' }, DOI).status, 'mismatch');
  assert.equal(evaluatePdfDoiIdentity({ filename: 'jacs.6c15886.pdf',
    firstPageText: 'No DOI on this scan' }, DOI).status, 'unknown');
});

test('publisher metadata DOI and first-page DOI are verifiable', () => {
  assert.deepEqual(extractPdfDois('DOI: 10.1021/jacs.6c15886. Citation'), [DOI]);
  assert.equal(evaluatePdfDoiIdentity({ firstPageText: 'Title Example DOI: 10.1021/jacs.6c15886' }, DOI).status, 'match');
  assert.equal(evaluatePdfDoiIdentity({ metadataText: 'https://doi.org/10.1021/jacs.6c15886',
    firstPageText: 'Some background references doi:10.1002/anie.123456' }, DOI).status, 'match');
});

test('multiple page DOIs without publisher metadata fail closed', () => {
  const value = { firstPageText: 'DOI 10.1021/jacs.6c15886 and DOI 10.1002/anie.3699223' };
  assert.equal(evaluatePdfDoiIdentity(value, DOI).status, 'ambiguous');
  assert.equal(inferPdfDoiIdentity(value).status, 'ambiguous');
});

test('supporting information is not a main paper even with matching DOI', () => {
  assert.equal(evaluatePdfDoiIdentity({ filename: 'jacs.6c15886_si_001.pdf',
    firstPageText: 'Supporting Information for the article DOI 10.1021/jacs.6c15886' }, DOI).status,
  'supporting');
});

test('new-page metadata inference does not need a filename hint', () => {
  const result = inferPdfDoiIdentity({ firstPageText: 'A new article\\nDOI 10.1021/jacs.6c15886',
    filename: 'download-27.pdf' });
  assert.equal(result.status, 'match');
  assert.equal(result.doi, DOI);
  assert.equal(filenameDoiHint('download-27.pdf', DOI), false);
});
