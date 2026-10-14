"""Offline tests: source chapter bytes MUST match prior independent evidence exactly."""
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

def load(path, alias):
    spec=importlib.util.spec_from_file_location(alias,Path(path))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

pilot=load("scripts/import-reviewed-science-body-one.py","reviewed_import")
fixture=load("scripts/test-historical-oa-science-evidence.py","science_fixture")
science=pilot.science

class ReviewedScientificFtsTest(unittest.TestCase):
    def science_manifest(self,raw):
        return science.parse_science_jats(raw,pilot.DOI)
    def test_section_extraction_preserves_source_and_sha(self):
        xml=fixture.fixture()
        old=self.science_manifest(xml)
        result,sha=pilot.extract_exact_sections(xml,old)
        self.assertEqual(len(result),old["scienceSectionUnits"])
        self.assertEqual(sha,old["canonicalSectionsSha256"])
        for record,source in zip(result,old["sections"],strict=True):
            self.assertEqual(record["sectionId"],source["sectionId"])
            self.assertEqual(record["sha256"],source["sectionSha256"])
            self.assertGreaterEqual(len(record["text"]),60)
        pkt=pilot.build_packet("a"*64,"b"*64,result,sha)
        self.assertEqual(pkt["rightsReview"]["licenseKind"],"cc-by-4.0")
        self.assertEqual(pkt["rightsReview"]["articleUrl"],pilot.PUBLISHER)
        self.assertEqual(pkt["completeness"],"partial")
        self.assertFalse(pkt["rightsReview"].get("anyImageRightsConfirmed",False))
        self.assertTrue(pkt["publicUploadAllowed"])
        self.assertNotIn("figures",json.dumps(pkt))
        self.assertNotIn("supplementary",json.dumps(pkt["sections"]).lower())
    def test_modified_science_cannot_enter_import(self):
        old=fixture.fixture()
        manifest=self.science_manifest(old)
        xml=old.replace(b"Reproducible reaction procedures",b"Unreviewed changed reaction procedures")
        # The primary JATS SHA must match the evidence; no extracted text passes otherwise.
        with self.assertRaisesRegex(ValueError,"source_xml_sha_changed"):
            science.parse_science_jats(xml,pilot.DOI,manifest["xmlSha256"])
        with self.assertRaisesRegex(ValueError,"original_scientific_source_evidence_changed"):
            pilot.extract_exact_sections(xml,manifest)
    def test_opaque_noncommercial_doi_mismatch_and_short_fragment_rejected(self):
        manifest=self.science_manifest(fixture.fixture())
        bad=fixture.fixture(lic="https://creativecommons.org/licenses/by-nc-nd/4.0/")
        with self.assertRaises(ValueError):
            pilot.extract_exact_sections(bad,manifest)
        bad=fixture.fixture(doi="10.1038/s41557-026-XXXX-y")
        with self.assertRaises(ValueError):
            pilot.extract_exact_sections(bad,manifest)
        altered=fixture.fixture().replace(b"</body>",b"<sec><title>Methods note</title><p>Short.</p></sec></body>")
        with self.assertRaisesRegex(ValueError,"original_scientific_source_evidence_changed"):
            pilot.extract_exact_sections(altered,manifest)
    def test_real_first_source_has_actual_dual_research_and_rights_review(self):
        src,old=pilot.source_record()
        self.assertEqual(src["doi"],pilot.DOI)
        self.assertEqual(src["shortScienceFragmentCount"],0)
        self.assertEqual(len(src["sections"]),6)
        self.assertEqual(old["revision"],"2fc0ded3b9f307140f93c328d32883a9215d208eebcdfbb1d20ed7cadf04567e")
    def test_live_member_generation_is_pinned_to_doi_revision(self):
        release={"architectureCatalogId":"a"*64,"dois":[pilot.DOI],"productionCards":1}
        row={"catalogId":"a"*64,"readPathActive":True,"matched":1,"items":[
          {"doi":pilot.DOI,"revision":"b"*64,"firstOnlineDate":"2026-07-13"}
        ]}
        with patch.object(pilot,"safe_json",side_effect=[release,row]):
            self.assertEqual(pilot.published_member("b"*64)[:2],("a"*64,"b"*64))
        with patch.object(pilot,"safe_json",side_effect=[release,row]):
            with self.assertRaisesRegex(ValueError,"formal_live_paper_revision_changed"):
                pilot.published_member("c"*64)
    def test_public_api_import_is_only_invoked_in_explicit_import_mode(self):
        # All text/DTO transport methods are unreachable during a preflight.
        with patch.object(pilot,"safe_request") as requester,patch.object(pilot,"safe_json_post") as poster:
            requester.return_value=b""
            with self.assertRaises(ValueError):
                pilot.execute("preflight",Path("/tmp/invalid-preflight.xml"))
            poster.assert_not_called()

if __name__=="__main__":
    unittest.main()
