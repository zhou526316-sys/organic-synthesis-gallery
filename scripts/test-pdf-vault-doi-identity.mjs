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

test('ACS Catalysis DOI wraps after a period in extracted first-page text', () => {
  const doi = '10.1021/acscatal.6c06048';
  const text = 'ACS Catalysis\nArticle\nhttps://doi.org/10.1021/acscatal. 6c06048\n'
    + 'Supporting information is linked elsewhere.';
  const result = evaluatePdfDoiIdentity({ filename: 'download (3).pdf', firstPageText: text }, doi);
  assert.equal(result.status, 'match');
  assert.equal(result.evidence, 'first_page_label');
  assert.deepEqual(extractPdfDois(text), [doi]);
});

test('ACS first-page labelled DOI outweighs incidental unlabelled reference', () => {
  const doi = '10.1021/acscatal.6c06048';
  const result = evaluatePdfDoiIdentity({
    firstPageText: 'ACS Catalysis Article\nhttps://doi.org/10.1021/acscatal.6c06048\n'
      + 'Prior methodology was reported in 10.1021/jacs.6c15886.',
  }, doi);
  assert.equal(result.status, 'match');
  assert.equal(result.doi, doi);
});

test('two different labelled DOI values remain ambiguous', () => {
  const result = evaluatePdfDoiIdentity({
    firstPageText: 'DOI: 10.1021/acscatal.6c06048\nDOI: 10.1021/jacs.6c15886',
  }, '10.1021/acscatal.6c06048');
  assert.equal(result.status, 'ambiguous');
});

test('wrong ACS journal DOI and real supporting-information PDF must not open as article', () => {
  const doi = '10.1021/acscatal.6c06048';
  assert.equal(evaluatePdfDoiIdentity({
    firstPageText: 'ACS Catalysis DOI: 10.1021/acscatal.6c06049', filename: 'acscatal.6c06048.pdf',
  }, doi).status, 'mismatch');
  assert.equal(evaluatePdfDoiIdentity({
    firstPageText: 'Supporting Information DOI: 10.1021/acscatal.6c06048',
    filename: 'acscatal.6c06048_si_001.pdf',
  }, doi).status, 'supporting');
});
