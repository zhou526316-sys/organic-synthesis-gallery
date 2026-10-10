/**
 * Restore missing titles through a *derived* Pages presentation supplement.
 * The fixed-slot-authorized seven literature inputs and its marker remain byte-identical.
 * No new DOI, date or literature admission; reads pinned DOI-verified metadata receipts.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { normalizeDoi } from '../shared/literature-identity.mjs';
import { pendingTitle, cleanTitle } from './backfill-pending-titles.mjs';

const DATA = [
  'papers.gz.b64', 'total-synthesis.json', 'manual-supplement.json',
  'final-audit-supplement.json', 'curated-supplement.json',
  'automation-supplement.json', 'rolling-supplement.json',
];
const REPORT = 'audit/title-backfill/verified-titles-20261010.json';
const PUBLIC = 'public';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const norm = v => normalizeDoi(v);
const shaBlob = bytes => createHash('sha1').update('blob ' + Buffer.byteLength(bytes) + '\0').update(bytes).digest('hex');

function validReceipt(receipt) {
  const doi = norm(receipt?.doi);
  const title = cleanTitle(receipt?.title);
  if (!doi || !title) return false;
  if (!['existing_same_doi', 'crossref', 'openalex'].includes(receipt?.source)) return false;
  const expected = {
    existing_same_doi:'matching_doi_published_row',
    crossref:'crossref:verified_doi',
    openalex:'openalex:verified_doi',
  }[receipt.source];
  return Array.isArray(receipt.evidence) && receipt.evidence.includes(expected)
    && Array.isArray(receipt.affectedFiles)
    && receipt.affectedFiles.length > 0
    && receipt.affectedFiles.every(file => file === 'public/papers.gz.b64');
}

/** Pure transform for fixture tests and predictable Pages builds. */
export function applyVerifiedTitlePresentation({ baseline, supplement, receipt, members }) {
  assert(Array.isArray(baseline) && supplement && Array.isArray(supplement.papers), 'invalid_inputs');
  assert(receipt?.schema === 'gallery-verified-title-backfill-v1'
    && receipt?.scope === 'existing_approved_dois_only'
    && receipt?.doiMembershipUnchanged === true
    && receipt?.publicationDatesUnchanged === true
    && receipt?.newLiteraturePublished === false
    && receipt?.pendingRowsAfter === 0 && receipt?.pendingUniqueDoisAfter === 0,
    'title_receipt_not_closed_or_membership_unproven');
  assert(Array.isArray(receipt.resolved)
    && receipt.resolved.length === receipt.resolvedUniqueDois
    && receipt.resolvedRows === receipt.pendingRowsBefore
    && receipt.pendingRowsBefore > 0
    && receipt.pendingUniqueDoisBefore === receipt.resolvedUniqueDois,
    'title_receipt_counts_mismatch');

  const baselineByDoi = new Map();
  const missing = new Set();
  for (const paper of baseline) {
    const doi = norm(paper?.doi || paper?.url);
    assert(doi && !baselineByDoi.has(doi), 'invalid_or_duplicate_baseline_doi:' + doi);
    baselineByDoi.set(doi, paper);
    if (pendingTitle(paper.title)) missing.add(doi);
  }
  assert(missing.size === receipt.pendingUniqueDoisBefore,
    'title_receipt_baseline_gap_mismatch:' + missing.size);
  const updatedPapers = supplement.papers.map(row => ({ ...row }));
  const at = new Map();
  for (let i = 0; i < updatedPapers.length; i++) {
    const doi = norm(updatedPapers[i]?.doi || updatedPapers[i]?.url);
    if (!doi) continue;
    assert(!at.has(doi), 'duplicate_derived_supplement_doi:' + doi);
    at.set(doi, i);
  }
  const seen = new Set();
  let overwritten = 0, inserted = 0, alreadyPresent = 0;
  const proofs = [];
  for (const item of receipt.resolved) {
    assert(validReceipt(item), 'untrusted_title_receipt:' + item?.doi);
    const doi = norm(item.doi);
    assert(!seen.has(doi) && missing.has(doi) && members.has(doi),
      'title_receipt_doi_outside_missing_published_baseline:' + doi);
    seen.add(doi);
    const source = baselineByDoi.get(doi);
    assert(source && pendingTitle(source.title), 'baseline_no_longer_needs_title:' + doi);
    const title = cleanTitle(item.title);
    const i = at.get(doi);
    if (i != null && !pendingTitle(updatedPapers[i].title)) {
      // An already-reviewed supplement title is authoritative over the display
      // patch; do not replace another existing validated source.
      alreadyPresent++;
      proofs.push({doi, status:'already_valid_in_derived_supplement', source:item.source});
      continue;
    }
    if (i != null) {
      updatedPapers[i].title = title; // all non-title fields are preserved
      overwritten++;
    } else {
      updatedPapers.push({ ...source, title }); // same approved DOI, date and authors
      inserted++;
    }
    proofs.push({doi, status:'derived_title_recovered', source:item.source});
  }
  assert(seen.size === missing.size && seen.size === receipt.resolved.length,
    'not_all_existing_missing_titles_covered');
  const overlayDois = new Set(updatedPapers.map(row => norm(row?.doi || row?.url)));
  assert([...overlayDois].every(doi => members.has(doi)), 'derived_supplement_introduced_new_doi');
  for (const doi of missing) {
    const row = updatedPapers[at.get(doi) ?? updatedPapers.findIndex(item=>norm(item?.doi||item?.url)===doi)];
    assert(row && !pendingTitle(row.title), 'unresolved_derived_title:' + doi);
  }
  return {
    supplement: {...supplement,papers:updatedPapers,
      verifiedTitlePresentation:{ schema:'doi-title-presentation-v1',
        evidence:REPORT, receiptResolved:seen.size,
        overlaid:overwritten+inserted, alreadyPresent }},
    summary:{
      originalApprovedDois:members.size, baselineTitleGaps:missing.size,
      verifiedReceipts:seen.size, addedDerivedRows:inserted,
      updatedDerivedRows:overwritten, alreadyValidDerivedRows:alreadyPresent,
      finalDerivedRows:updatedPapers.length,
      newLiteratureAdmissions:0, protectedFilesModified:0,
    },
    proofs,
  };
}
export async function applyVerifiedTitlePresentationToPages(root = process.cwd()) {
  const file = p => path.resolve(root,p);
  const [markerText, reportText, baselineText, supplementText] = await Promise.all([
    readFile(file('audit/publication-release-state.json'),'utf8'),
    readFile(file(REPORT),'utf8'),
    readFile(file('public/papers.gz.b64'),'utf8'),
    readFile(file('public/literature-supplement.json'),'utf8'),
  ]);
  const marker = JSON.parse(markerText);
  assert(marker?.mode === 'slot-release' && Number.isInteger(marker.productionCards)
    && marker.productionCards > 0, 'metadata_presentation_requires_published_fixed_slot_baseline');
  assert(shaBlob(Buffer.from(baselineText)) === marker.protectedBlobs?.['public/papers.gz.b64'],
    'fixed_slot_baseline_unverified');
  const members = new Set();
  for (const name of DATA) {
    const bytes = await readFile(file(PUBLIC+'/'+name));
    if (name==='papers.gz.b64') continue;
    // This runs after merge-curated-pages. The authorized input versions of the
    // other static sources were verified before any build-time transformations.
    const p = JSON.parse(bytes.toString('utf8'));
    assert(Array.isArray(p.papers), 'missing_papers_array:'+name);
    p.papers.forEach(row => { const d=norm(row?.doi||row?.url); assert(d, 'invalid_doi:'+name); members.add(d); });
  }
  const baseline = JSON.parse(gunzipSync(Buffer.from(baselineText.trim(),'base64')).toString('utf8'));
  baseline.forEach(row => {const doi=norm(row?.doi||row?.url);assert(doi, 'invalid_baseline_doi');members.add(doi);});
  assert(members.size === marker.productionCards, 'presentation_membership_count_mismatch');
  const receipt = JSON.parse(reportText);
  assert(receipt.originalUniqueDois <= marker.productionCards,
    'receipt_catalog_count_not_current');
  const original = JSON.parse(supplementText);
  const result = applyVerifiedTitlePresentation({ baseline,supplement:original,receipt,members });
  await writeFile(file('public/literature-supplement.json'),JSON.stringify(result.supplement));
  console.log('VERIFIED_TITLE_PRESENTATION '+JSON.stringify(result.summary));
  return result.summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  await applyVerifiedTitlePresentationToPages();
}
