#!/usr/bin/env python3
"""Offline, no-network tests of real XML -> hash-only scientific evidence."""
import importlib.util
import json
import unittest
from pathlib import Path
from xml.sax.saxutils import escape

spec=importlib.util.spec_from_file_location("source",
    Path(__file__).with_name("historical-oa-science-evidence.py"))
source=importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
DOI="10.1038/s41557-026-02206-6"

def fixture(doi=DOI,lic="https://creativecommons.org/licenses/by/4.0/"):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
<front><article-meta><article-id pub-id-type="doi">{escape(doi)}</article-id>
<permissions><license xlink:href="{escape(lic)}">
<license-p>This article is licensed under a Creative Commons Attribution 4.0 International License.</license-p>
</license></permissions></article-meta></front>
<body>
<sec><title>Introduction</title><p>Scientific chemical transformation is a valuable tool for synthesis and molecular function.</p></sec>
<sec><title>Results and discussion</title>
<p>We demonstrate the synthesis of varied products using well-characterized starting materials and diverse transformations.</p>
<sec><title>Mechanistic studies</title>
<p>Control experiments and spectral changes support the proposed mechanistic hypothesis but do not establish direct isolation.</p>
</sec></sec>
<sec><title>Conclusion</title><p>The synthetic approach extends the known transformations and its limitations remain well documented for future study.</p></sec>
<fig id="fig1"><caption><p>Figure one shows verified synthetic examples, control reactions and the measured isolated yields.</p></caption></fig>
<table-wrap id="t1"><caption><title>Optimization table</title><p>Model reaction conditions and control comparisons.</p></caption></table-wrap>
</body><back><ref-list><ref><mixed-citation>References should never enter indexed science.</mixed-citation></ref></ref-list></back>
</article>'''.encode()

class SourceEvidenceTest(unittest.TestCase):
    def test_actual_doi_bound_science_is_hashed_and_captions_not_imported(self):
        raw=fixture()
        x=source.parse_science_jats(raw,DOI,source.sha_bytes(raw))
        self.assertEqual(x["state"],"science_sections_mapped_pending_independent_review")
        self.assertEqual(x["licenseKindSignal"],"cc-by-4.0")
        self.assertEqual(x["scienceSectionUnits"],4)
        self.assertEqual(x["captionEvidenceCount"],2)
        self.assertEqual(x["publicFtsImported"],False)
        self.assertEqual(x["originalXmlPersisted"],False)
        self.assertEqual(x["articleTextPersisted"],False)
        self.assertEqual(x["completenessCandidate"],"complete_candidate")
        self.assertNotIn("We demonstrate the synthesis",json.dumps(x))
        self.assertNotIn("References should never",json.dumps(x))
        self.assertTrue(all(a["type"] in source.TYPES for a in x["sections"]))
        self.assertEqual(len(x["canonicalSectionsSha256"]),64)
    def test_reject_wrong_article(self):
        with self.assertRaisesRegex(ValueError,"article_doi_identity_mismatch"):
            source.parse_science_jats(fixture(doi="10.1038/other"),DOI)
    def test_reject_stale_xml_hash(self):
        with self.assertRaisesRegex(ValueError,"source_xml_sha_changed"):
            source.parse_science_jats(fixture(),DOI,"a"*64)
    def test_reject_noncommercial_or_noderivatives(self):
        for lic in ("https://creativecommons.org/licenses/by-nc-nd/4.0/",
                    "https://creativecommons.org/licenses/by-nc/4.0/"):
            with self.assertRaises(ValueError):
                source.parse_science_jats(fixture(lic=lic),DOI)
    def test_substantial_unclassified_science_is_preserved_as_partial_not_missing(self):
        raw=fixture().replace(b"<title>Results and discussion</title>",
                              b"<title>General chemistry</title>").replace(
                              b"<title>Mechanistic studies</title>",b"<title>Other article heading</title>")
        # Add a real scientific paragraph rather than padding an index row.
        raw=raw.replace(b"</body>",(
            b"<sec><title>Comparative transformations</title><p>"
            b"Additional independent chemical observations explain which products were "
            b"actually detected, their substrate limitations, and what control experiments "
            b"did not establish for the proposed synthetic pathway.</p></sec></body>"))
        result=source.parse_science_jats(raw,DOI)
        self.assertEqual(result["scienceClassificationEvidence"],
                         "unclassified_maintext_pending_review")
        self.assertEqual(result["completenessCandidate"],"partial")
        self.assertGreater(result["scienceSectionUnits"],0)
    def test_genuinely_missing_science_is_rejected(self):
        raw=fixture()
        raw=raw.split(b"<body>")[0]+(
            b"<body><sec><title>Introduction</title><p>Insufficient text.</p></sec></body>"
        )+raw.split(b"</body>",1)[1]
        with self.assertRaisesRegex(ValueError,"science_content_missing_or_abstract_only"):
            source.parse_science_jats(raw,DOI)
    def test_short_science_fragment_is_hashed_and_never_falsely_completes_article(self):
        raw=fixture().replace(
            b"</body>",b"<sec><title>Experimental note</title><p>Very brief note.</p></sec></body>")
        result=source.parse_science_jats(raw,DOI)
        self.assertEqual(result["state"],"science_sections_mapped_pending_independent_review")
        self.assertEqual(result["shortScienceFragmentCount"],1)
        self.assertEqual(result["completenessCandidate"],"partial")
        self.assertEqual(len(result["shortScienceFragments"][0]["sha256"]),64)
        self.assertEqual(result["publicFtsImported"],False)
        self.assertNotIn("Very brief note.",json.dumps(result))
    def test_administrative_data_availability_not_in_scientific_sections(self):
        raw=fixture().replace(b"</body>",(
            b"<sec><title>Data availability</title><p>All article data are in the "
            b"main paper or supplementary files and administration documents.</p></sec></body>"))
        result=source.parse_science_jats(raw,DOI)
        self.assertEqual(result["shortScienceFragmentCount"],0)
        self.assertTrue(all("Data availability" not in x["heading"] for x in result["sections"]))

if __name__=="__main__":
    unittest.main()
