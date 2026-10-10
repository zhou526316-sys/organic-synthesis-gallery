"""Offline acceptance tests for new WeChat featured '阅读原文' DOI deep links.

This suite does not access WeChat, upload images, write drafts, or publish.
It verifies the publisher's URL generation, readback and stale-trigger gates.
"""
import importlib.util
import inspect
import pathlib
import unittest


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "ops" / "wechat-publisher" / "create-draft.py"
spec = importlib.util.spec_from_file_location("wechat_original_link_publisher", SCRIPT)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

TODAY_DOI = "10.1002/anie.3306470"
RETRO_DOI = "10.1038/s44160-026-01128-y"
DAILY_URL = "https://gallery.gczhouwld.com/?edition=2026-10-10&doi=10.1002%2Fanie.3306470&summary=0"
RETRO_URL = "https://gallery.gczhouwld.com/?doi=10.1038%2Fs44160-026-01128-y&summary=0"


def readback(urls):
    return {"news_item": [{"title": f"Paper {i}", "content_source_url": url}
                          for i, url in enumerate(urls)]}


class WeChatOriginalLinkContractTests(unittest.TestCase):
    def test_daily_feature_uses_exact_date_and_doi(self):
        self.assertEqual(publisher.gallery_original_url(TODAY_DOI, "2026-10-10"), DAILY_URL)

    def test_retrospective_uses_exact_doi_not_daily_listing(self):
        self.assertEqual(publisher.gallery_original_url(RETRO_DOI), RETRO_URL)

    def test_missing_or_invalid_doi_must_not_fall_back_to_homepage(self):
        for bad in (None, "", "N/A", "https://example.com/other", "2026-10-10"):
            with self.subTest(doi=bad), self.assertRaisesRegex(RuntimeError, "verified DOI"):
                publisher.gallery_original_url(bad, "2026-10-10")

    def test_readback_accepts_two_distinct_precise_links(self):
        self.assertIsNone(
            publisher.assert_draft_source_links(readback([DAILY_URL, RETRO_URL]), [DAILY_URL, RETRO_URL])
        )

    def test_readback_rejects_legacy_date_only_link(self):
        with self.assertRaisesRegex(RuntimeError, "阅读原文 mismatch"):
            publisher.assert_draft_source_links(
                readback(["https://gallery.gczhouwld.com/?edition=2026-10-10", RETRO_URL]),
                [DAILY_URL, RETRO_URL],
            )

    def test_readback_rejects_swapped_wrong_or_summary_open_links(self):
        alternatives = [
            [RETRO_URL, DAILY_URL],
            [DAILY_URL.replace("3306470", "3306471"), RETRO_URL],
            [DAILY_URL.replace("summary=0", "summary=1"), RETRO_URL],
            ["https://gallery.gczhouwld.com/", RETRO_URL],
        ]
        for urls in alternatives:
            with self.subTest(urls=urls), self.assertRaisesRegex(RuntimeError, "阅读原文 mismatch"):
                publisher.assert_draft_source_links(readback(urls), [DAILY_URL, RETRO_URL])

    def test_readback_rejects_missing_and_extra_articles(self):
        for urls in ([DAILY_URL], [DAILY_URL, RETRO_URL, RETRO_URL], []):
            with self.subTest(urls=urls), self.assertRaisesRegex(RuntimeError, "article count mismatch"):
                publisher.assert_draft_source_links(readback(urls), [DAILY_URL, RETRO_URL])

    def test_readback_rejects_missing_news_item(self):
        with self.assertRaisesRegex(RuntimeError, "article count mismatch"):
            publisher.assert_draft_source_links({}, [DAILY_URL])

    def test_old_link_only_recovery_does_not_block_next_day(self):
        request = {"linkOnly": True, "publicationDate": "2026-10-10"}
        self.assertTrue(publisher.is_current_link_only_request(request, "2026-10-10"))
        self.assertFalse(publisher.is_current_link_only_request(request, "2026-10-11"))

    def test_invalid_or_future_link_only_recovery_fails_closed(self):
        for date in ("", "2026-10-12", "tomorrow"):
            with self.subTest(date=date), self.assertRaisesRegex(RuntimeError, "no write"):
                publisher.is_current_link_only_request(
                    {"linkOnly": True, "publicationDate": date}, "2026-10-11"
                )
        self.assertFalse(publisher.is_current_link_only_request({"linkOnly": False}, "2026-10-11"))

    def test_both_standard_draft_paths_require_real_readback(self):
        source = inspect.getsource(publisher.main)
        self.assertIn("assert_draft_source_links(draft, [source_url])", source)
        self.assertIn("assert_draft_source_links(draft, expected_source_links)", source)
        self.assertIn("if is_current_link_only_request(source_link_request, publication_date)", source)
        self.assertIn('"content_source_url": expected_source_links[1]', source)


if __name__ == "__main__":
    unittest.main()
