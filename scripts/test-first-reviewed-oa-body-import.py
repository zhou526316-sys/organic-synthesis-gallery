#!/usr/bin/env python3
import importlib.util
import json
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("pilot",Path(__file__).with_name("import-first-approved-oa-body.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def xml_fixture(lic="https://creativecommons.org/licenses/by/4.0/"):
    return ('''<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><article-meta>
<article-id pub-id-type="doi">%s</article-id>
<permissions><license xlink:href="%s"><license-p>
This article is available under Creative Commons Attribution 4.0 International License.
</license-p></license></permissions></article-meta></front><body>
<sec><title>Main</title><p>This synthetic strategy creates new chemical building blocks and enables molecular diversification across multiple representative substrates.</p></sec>
<sec><title>Results and discussion</title><p>Different partners were tested and the reported isolated yields and product structures provide the method's core substrate scope and applicability evidence.</p></sec>
<sec><title>Mechanistic studies</title><p>Spectroscopy and controlled mechanistic experiments offer supporting evidence but do not establish a directly isolated reactive intermediate.</p></sec>
<sec><title>Conclusion</title><p>The work describes an experimentally demonstrated synthetic method with specific practical limitations and opportunities for future improvements.</p></sec>
<sec><title>General experimental procedure</title><p>Samples were prepared, reacted and analyzed using independently characterized starting materials according to the reported synthetic approach.</p></sec>
<sec><title>Online content</title><p>Journal's supplementary content and administrative article metadata are available on the publisher platform.</p></sec>
<fig><caption><p>Third-party figure descriptions and credit lines are not independently cleared yet.</p></caption></fig>
</body><back><ref-list><ref><mixed-citation>This referenced work should be omitted.</mixed-citation></ref></ref-list></back></article>'''%(m.DOI,lic)).encode()

class CanaryUnitTests(unittest.TestCase):
    def setUp(self):
        self.raw=xml_fixture()
        self.old_source=m.SOURCE_XML_SHA
        m.SOURCE_XML_SHA=m.digest(self.raw)
        self.audit=self.prepare_audit()
        self.rights="Main-article second scientific pass completed_main_article_only and publisher_article_cc_by_4_verified with third-party figures pending."
    def tearDown(self):
        m.SOURCE_XML_SHA=self.old_source
    def prepare_audit(self):
        headings={
           "Main":"This synthetic strategy creates new chemical building blocks and enables molecular diversification across multiple representative substrates.",
           "Results and discussion":"Different partners were tested and the reported isolated yields and product structures provide the method's core substrate scope and applicability evidence.",
           "Mechanistic studies":"Spectroscopy and controlled mechanistic experiments offer supporting evidence but do not establish a directly isolated reactive intermediate.",
           "Conclusion":"The work describes an experimentally demonstrated synthetic method with specific practical limitations and opportunities for future improvements.",
           "General experimental procedure":"Samples were prepared, reacted and analyzed using independently characterized starting materials according to the reported synthetic approach.",
        }
        return {"reports":[{"doi":m.DOI,"state":"science_sections_mapped_pending_independent_review",
            "sections":[{"heading":heading,"sectionSha256":m.digest(text)}
                        for heading,text in headings.items()]}]}
    def test_doi_license_and_science_sha_gated(self):
        rows,sh,shorts=m.materialize_scientific_sections(self.raw,self.audit,self.rights)
        self.assertEqual(len(rows),5)
        self.assertEqual(shorts,0)
        self.assertEqual(len(sh),64)
        self.assertEqual([x["type"] for x in rows],["other","results","mechanism","conclusion","experimental"])
        self.assertFalse(any("online content" in row["heading"].lower() for row in rows))
        self.assertFalse(any("third-party" in row["text"].lower() for row in rows))
    def test_source_hash_change_rejected(self):
        with self.assertRaisesRegex(ValueError,"xml_sha_identity_mismatch"):
            m.materialize_scientific_sections(self.raw+b"new",self.audit,self.rights)
    def test_rights_doc_and_hash_review_missing(self):
        with self.assertRaisesRegex(ValueError,"independent_publisher_science_rights_review_unavailable"):
            m.materialize_scientific_sections(self.raw,self.audit,"unverified")
        self.audit["reports"][0]["sections"][1]["sectionSha256"]="b"*64
        with self.assertRaisesRegex(ValueError,"reviewed_article_science_paragraph_sha_drift"):
            m.materialize_scientific_sections(self.raw,self.audit,self.rights)
    def test_noncommercial_source_rejected(self):
        raw=xml_fixture("https://creativecommons.org/licenses/by-nc-nd/4.0/")
        m.SOURCE_XML_SHA=m.digest(raw)
        with self.assertRaisesRegex(ValueError,"source_publisher_article_cc_by4_not_verified"):
            m.materialize_scientific_sections(raw,self.audit,self.rights)

if __name__=="__main__":unittest.main()
