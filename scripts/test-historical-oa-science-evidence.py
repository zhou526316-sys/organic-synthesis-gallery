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
    def test_no_network_and_no_truncation_on_bad_body(self):
        raw=fixture().replace(b"<title>Results and discussion</title>",
                              b"<title>Administration</title>").replace(
                              b"<title>Mechanistic studies</title>",b"<title>Other article heading</title>")
        with self.assertRaisesRegex(ValueError,"science_content_missing_or_abstract_only"):
            source.parse_science_jats(raw,DOI)

if __name__=="__main__":
    unittest.main()
