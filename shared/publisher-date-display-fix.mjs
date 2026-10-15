// A temporary, DOI-scoped PRESENTATION correction only.
// This is not a mutation of the fixed-slot-authorized literature dataset.
// Publisher article https://www.science.org/doi/10.1126/sciadv.aed4187
// displays "7 Oct 2026". Crossref-derived 2026-10-09 is inaccurate.
// The authorized 08:00 literature writer separately handles the source update.
const CORRECTION = Object.freeze({
  doi: '10.1126/sciadv.aed4187',
  journal: 'Science Advances',
  oldDate: '2026-10-09',
  publisherDate: '2026-10-07',
  addedDate: '2026-10-08',
});

// Official Nature first-online page confirms both the precise DOI and the
// date 2026-10-14. The fixed-slot Oct 15 card retained dateUnverified=true
// and lost its authors. Keep this presentation-only repair exactly DOI/title/
// journal/addedDate-bound; see audit/publisher-date-evidence/2026-10-15-
// nature-s41586-026-11242-8.json. No other DOI gains publication evidence.
const NATURE_OFFICIAL = Object.freeze({
  doi: '10.1038/s41586-026-11242-8',
  title: 'Catalytic transfer of carbon atoms enables spirofusion of C–C σ-bonds',
  journal: 'Nature',
  date: '2026-10-14',
  addedDate: '2026-10-15',
  authors: Object.freeze([
    'Hayato Fujimoto', 'Masayuki Mizutani', 'Kazuya Imachi',
    'Teruki Nishioka', 'Reona Ikeda', 'Mamoru Tobisu',
  ]),
});

// The five Oct-14-admitted JOC DOI were prospective and uncertain on Oct 14.
// On Oct 15, exact DOI-specific ACS Publications records now explicitly show
// Published Online: October 15, 2026. The publisher evidence is persisted in
// audit/publisher-date-evidence/2026-10-15-acs-five-joc-first-online.json.
// Match exact DOI+title+journal+admission day+candidate date; no Crossref
// created/deposited day is promoted for any other JOC paper.
const JOC_PUBLISHER_VERIFIED = new Map([
  ['10.1021/acs.joc.6c01792', 'Copper(II) Acetate-Catalyzed Aerobic Oxidation of N -(2-Arylacetyl)-1,3-oxazolidin-2-ones to 1,2-Dicarbonyl Compounds'],
  ['10.1021/acs.joc.6c01506', 'Highly Diastereoselective Synthesis of Trifluoromethylated Spirocyclopropanes from 2-(2′-Ketoalkyl)-1,3-Indandiones and CF3-Imidoyl Sulfoxonium Ylides'],
  ['10.1021/acs.joc.6c01769', 'Practical C(sp3)–F Bond Construction via Metal-Free Heterogeneous Photodecarboxylative Fluorination in Continuous Flow'],
  ['10.1021/acs.joc.6c01159', 'Stereoselective Defluorinative Thiolation of gem -Difluoroalkenes with Thiols via Nucleophilic Substitution'],
  ['10.1021/acs.joc.6c01796', 'Water-Mediated Electrochemical Sulfonylation of Alkynes: Switchable Access to Alkynyl versus Alkenyl Sulfones'],
]);

// RSC's official publisher article index now supplies exact "First published"
// dates for the ten DOI whose original published-online metadata was absent.
// Unlike Crossref created/deposited timestamps, these are article-specific
// publisher claims; evidence and exact article URLs are frozen separately in
// audit/publisher-date-evidence/2026-10-15-rsc-ten-first-online.json.
// Presentation-only: each correction is independently DOI, original English
// title, journal, admission day, and still-unverified flag gated.
const RSC_PUBLISHER_VERIFIED = new Map([
  ["10.1039/d6gc03748h", Object.freeze({ title: "Green Synthesis of Dihydropyranone Intermediates via Combined Flow Chemistry and Photocatalysis", journal: "Green Chemistry", addedDate: "2026-10-09", publisherDate: "2026-10-08" })],
  ["10.1039/d6gc04458a", Object.freeze({ title: "Continuous-Flow Hydrogenative Conversion of Biomass-Derived Lactone to Cyclic Ether by Pt Catalysts on Zr-Doped Silicoaluminophosphate", journal: "Green Chemistry", addedDate: "2026-10-08", publisherDate: "2026-10-07" })],
  ["10.1039/d6gc05783g", Object.freeze({ title: "Knoevenagel Polycondensation of Vanillin Enables High-Performance Bio-Based Polyamides", journal: "Green Chemistry", addedDate: "2026-10-08", publisherDate: "2026-10-07" })],
  ["10.1039/d6sc03717h", Object.freeze({ title: "Base-Catalyzed Intramolecular C−H Annulation Reactions of o-Carboranes Containing Nitriles, Alkynes, and Alkenes", journal: "Chemical Science", addedDate: "2026-10-08", publisherDate: "2026-10-07" })],
  ["10.1039/d6sc05041g", Object.freeze({ title: "DNA-scaffolded catalysis for aliphatic alcohol oxidation in DEL synthesis", journal: "Chemical Science", addedDate: "2026-10-08", publisherDate: "2026-10-07" })],
  ["10.1039/d6sc05761f", Object.freeze({ title: "Metal-Free CO 2 Fixation: Conversion of Epoxides to Cyclic Carbonates by a Highly Efficient Bifunctional Boron-Tethered N-Heterocyclic Nitrenium Catalyst", journal: "Chemical Science", addedDate: "2026-10-08", publisherDate: "2026-10-07" })],
  ["10.1039/d6sc06374h", Object.freeze({ title: "Enantioselective Synthesis of β-Aryl-β-acyl Esters as Unsymmetrical 1,4-Dicarbonyl Compounds via Oxidative Aryl Rearrangement Using λ 3 -Perchrolate Iodane", journal: "Chemical Science", addedDate: "2026-10-08", publisherDate: "2026-10-07" })],
  ["10.1039/d6sc06407h", Object.freeze({ title: "Harnessing Carbyne Reactivity from Stabilized Phosphorus Ylides: Skeletal Editing of Indenes via Single-Carbon Insertion", journal: "Chemical Science", addedDate: "2026-10-09", publisherDate: "2026-10-08" })],
  ["10.1039/d6sc06571f", Object.freeze({ title: "Facile Synthesis of Closed-loop Recyclable and Crystalline Stereoregular Poly(ether- alt -ester)s from Bio-based Commodity Chemicals", journal: "Chemical Science", addedDate: "2026-10-14", publisherDate: "2026-10-13" })],
  ["10.1039/d6sc06879k", Object.freeze({ title: "A Lewis-Acidic Anion Enhances Energy Transfer from Excited Cationic Photocatalysts to Basic Substrates", journal: "Chemical Science", addedDate: "2026-10-11", publisherDate: "2026-10-08" })]
]);

function realCalendarDay(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Return only a date that is safe to SHOW as a publication-day claim.
 * Future publisher claims stay unknown until the actual calendar day.
 * Existing DOI-specific unverified flags remain visible as uncertainty
 * even after the date passes; this never promotes a provisional date.
 */
export function publicationDateForDisplay(date, asOfBeijingDay, unverified = false) {
  if (!realCalendarDay(asOfBeijingDay)) throw new Error('invalid_beijing_as_of_date');
  if (!realCalendarDay(date)) return {date: '', unverified: true, reason: 'missing_or_invalid'};
  if (date > asOfBeijingDay) return {date: '', unverified: true, reason: 'future_unverified'};
  // A candidate calendar date is not a first-online claim until publisher-
  // specific evidence clears the unverified flag. Elapsed time cannot verify it.
  if (unverified === true) return {date: '', unverified: true, reason: 'unverified'};
  return {date, unverified: false, reason: 'confirmed'};
}

/** Apply the verified date only to the in-memory display object.
 * It does not change source files, release markers, or publisher capture data.
 */
export function correctedPublisherDateForDisplay(paper) {
  if (!paper || typeof paper !== 'object') return paper;
  const doi = String(paper.doi || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  if (doi === NATURE_OFFICIAL.doi
    && String(paper.journal || '').trim() === NATURE_OFFICIAL.journal
    && String(paper.title || '').trim() === NATURE_OFFICIAL.title
    && paper.addedDate === NATURE_OFFICIAL.addedDate
    && (paper.date === NATURE_OFFICIAL.date || !paper.date)) {
    if (paper.dateUnverified !== true && paper.date === NATURE_OFFICIAL.date
      && Array.isArray(paper.authors) && paper.authors.length) return paper;
    return { ...paper, date: NATURE_OFFICIAL.date, dateUnverified: false,
      authors: Array.isArray(paper.authors) && paper.authors.length
        ? paper.authors : [...NATURE_OFFICIAL.authors] };
  }
  const verifiedJocTitle = JOC_PUBLISHER_VERIFIED.get(doi);
  if (verifiedJocTitle && String(paper.journal || '').trim() === 'JOC'
    && String(paper.title || '').trim() === verifiedJocTitle
    && paper.date === '2026-10-15' && paper.addedDate === '2026-10-14') {
    // Explicitly materialize the publisher-verification result even when the
    // frozen card omitted dateUnverified entirely (undefined is not false).
    return paper.dateUnverified === false ? paper : { ...paper, dateUnverified: false };
  }
  const verifiedRsc = RSC_PUBLISHER_VERIFIED.get(doi);
  if (verifiedRsc
    && String(paper.title || '').trim() === verifiedRsc.title
    && String(paper.journal || '').trim() === verifiedRsc.journal
    && paper.addedDate === verifiedRsc.addedDate
    && (paper.date === '' || paper.date == null || paper.date === verifiedRsc.publisherDate)
    && paper.dateUnverified === true) {
    // The original protected paper and its original addedDate stay unchanged.
    // Do not infer publication from the Crossref created/deposited field.
    return { ...paper, date: verifiedRsc.publisherDate, dateUnverified: false };
  }
  if (doi !== CORRECTION.doi
    || String(paper.journal || '').trim() !== CORRECTION.journal
    || paper.addedDate !== CORRECTION.addedDate
    || (paper.date !== CORRECTION.oldDate && paper.date !== CORRECTION.publisherDate)) return paper;
  if (paper.date === CORRECTION.publisherDate && paper.dateUnverified !== true) return paper;
  return { ...paper, date: CORRECTION.publisherDate, dateUnverified: false };
}
