import hashlib
import unittest
from scripts.historical_oa_section_review import inspect

DOI="10.1038/s41557-026-02206-6"
def fixture(rights="https://creativecommons.org/licenses/by/4.0/",doi=DOI,figures=8):
    s="Representative scientific mechanistic investigation of a new organoboron synthesis. "*4
    section="<sec><title>Results and discussion</title><p>"+s+"</p></sec>"
    fig="".join("<fig><label>Figure "+str(i)+"</label><caption><p>"+s+"</p></caption></fig>" for i in range(figures))
    xml=("<article xmlns:xlink='http://www.w3.org/1999/xlink'><front><article-meta>"+
         "<article-id pub-id-type='doi'>"+doi+"</article-id>"+
         "<permissions><license xlink:href='"+rights+"'/></permissions>"+
         "</article-meta></front><body>"+section*25+fig+"</body></article>").encode()
    return xml,{"doi":DOI,"pmcid":"PMC13623650",
                "xmlSha256":hashlib.sha256(xml).hexdigest(),"licenseKind":"cc-by-4.0"}

class OAChapterReviewTest(unittest.TestCase):
    def test_scientific_chapters_and_figures_are_distinct_evidence(self):
        xml,target=fixture()
        row=inspect(xml,target)
        self.assertEqual(row["sourceUnits"],33)
        self.assertEqual(row["figureUnits"],8)
        self.assertTrue(row["indexBudgetEligible"])
        self.assertEqual(row["publicIndexWrites"],0)
        self.assertFalse(row["rawOriginalPersisted"])
        self.assertNotIn("text",row["units"][0])
    def test_doi_restricted_rights_and_source_hash_reject(self):
        xml,target=fixture(doi="10.1021/jacs.other")
        with self.assertRaisesRegex(ValueError,"source_doi_mismatch"):inspect(xml,target)
        xml,target=fixture(rights="https://creativecommons.org/licenses/by-nc-nd/4.0/")
        with self.assertRaisesRegex(ValueError,"source_reuse_restricted"):inspect(xml,target)
        xml,target=fixture();target["xmlSha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"source_sha_mismatch"):inspect(xml,target)
    def test_65_evidence_units_need_separate_handling(self):
        xml,target=fixture(figures=40)
        row=inspect(xml,target)
        self.assertEqual(row["sourceUnits"],65)
        self.assertFalse(row["indexBudgetEligible"])
