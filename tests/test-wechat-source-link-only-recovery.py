"""No-network acceptance tests for the WeChat 40007 exact-draft safe recovery.

Runs importable create-draft.py with mocked WeChat API; no secrets, uploads,
draft/add or freepublish. Production must preserve exactly two article bodies,
covers, ordered DOIs and account-scoped existing media identity.
"""
import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "ops" / "wechat-publisher" / "create-draft.py"
spec = importlib.util.spec_from_file_location("wechat_read_original_recovery", SCRIPT)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

DA = "10.1002/anie.3306470"
DR = "10.1038/s44160-026-01128-y"
TITLE_A = "有机合成文献日报｜10.10｜今日精选｜Angew.：铁–LMCT/镍–SH₂协同催化游离羧酸直接甲基编辑"
TITLE_B = "往期精选｜Nature Synthesis｜仇友爱等：醇与醇的电化学脱羟基交叉偶联"
MEDIA = "old-approved-media-id"
RECOVERED = "unique-existing-new-media-id"


def fixture_draft():
    return {"news_item": [
        {"title": TITLE_A, "author": "化之岛", "digest": "Angew",
         "content": "<p>DOI 10.1002/anie.3306470; 49 reviewed scientific figures.</p>",
         "content_source_url": "https://gallery.gczhouwld.com/?edition=2026-10-10",
         "thumb_media_id": "first-original-cover", "pic_crop_235_1": "0_0_1_1",
         "need_open_comment": 0, "only_fans_can_comment": 0},
        {"title": TITLE_B, "author": "化之岛", "digest": "Nature Synthesis",
         "content": "<p>DOI 10.1038/s44160-026-01128-y, 32 reviewed Nature diagrams</p>",
         "content_source_url": "https://gallery.gczhouwld.com/?doi=10.1038%2Fs44160-026-01128-y",
         "thumb_media_id": "second-original-cover", "pic_crop_1_1": "0_0_1_1",
         "need_open_comment": 0, "only_fans_can_comment": 0},
    ]}


class ExactRecoveryTests(unittest.TestCase):
    def test_exact_dois_and_titles_required(self):
        item = fixture_draft()
        self.assertTrue(publisher.exact_draft_identity(item, [TITLE_A, TITLE_B], [DA, DR]))
        item["news_item"][0]["content"] = "something unrelated"
        self.assertFalse(publisher.exact_draft_identity(item, [TITLE_A, TITLE_B], [DA, DR]))
        item = fixture_draft()
        item["news_item"].reverse()
        self.assertFalse(publisher.exact_draft_identity(item, [TITLE_A, TITLE_B], [DA, DR]))

    def test_readonly_list_uniquely_finds_actual_draft(self):
        requests = []
        def batchget(url, *, method, payload):
            self.assertIn("/cgi-bin/draft/batchget?", url)
            self.assertEqual(method, "POST")
            self.assertEqual(payload["no_content"], 1)
            requests.append(payload)
            return {"total_count": 2, "item_count": 2, "item": [
                {"media_id": "unrelated", "content": {"news_item": [{"title": "Other"}]}},
                {"media_id": RECOVERED, "content": {
                    "news_item": [{"title": TITLE_A}, {"title": TITLE_B}]}}
            ]}
        with patch.object(publisher, "json_request", side_effect=batchget), \
             patch.object(publisher, "get_draft", return_value=fixture_draft()):
            found, body = publisher.find_unique_readable_draft("token", [TITLE_A, TITLE_B], [DA, DR])
        self.assertEqual(found, RECOVERED)
        self.assertEqual(len(requests), 1)
        self.assertEqual(body, fixture_draft())

    def test_no_candidates_never_creates_new_draft(self):
        with patch.object(publisher, "json_request", return_value={
            "total_count": 1, "item": [{"media_id": "other", "content": {"news_item": [{"title": "Other"}]}}]
        }), patch.object(publisher, "create_draft", side_effect=AssertionError("Never add")):
            with self.assertRaisesRegex(RuntimeError, "no unique matching"):
                publisher.find_unique_readable_draft("token", [TITLE_A, TITLE_B], [DA, DR])

    def test_duplicate_candidates_fail_closed(self):
        a = {"content": {"news_item": [{"title": TITLE_A}, {"title": TITLE_B}]}}
        with patch.object(publisher, "json_request", return_value={
            "total_count": 2, "item": [dict(a, media_id="x"), dict(a, media_id="y")]
        }), patch.object(publisher, "get_draft", return_value=fixture_draft()):
            with self.assertRaisesRegex(RuntimeError, "ambiguous"):
                publisher.find_unique_readable_draft("token", [TITLE_A, TITLE_B], [DA, DR])

    def test_other_wechat_account_failure_is_not_bypassed(self):
        with patch.object(publisher, "json_request", return_value={
            "errcode": 48001, "errmsg": "API unauthorized"
        }):
            with self.assertRaisesRegex(RuntimeError, "list unavailable: errcode=48001"):
                publisher.find_unique_readable_draft("token", [TITLE_A, TITLE_B], [DA, DR])

    def test_link_only_preserves_full_content_and_original_covers(self):
        source = fixture_draft()["news_item"][0]
        outgoing = publisher.preserve_draft_article_with_new_source(source, "https://example.com/?doi=10.1002")
        self.assertEqual(outgoing["content"], source["content"])
        self.assertEqual(outgoing["thumb_media_id"], "first-original-cover")
        self.assertEqual(outgoing["title"], TITLE_A)
        self.assertEqual(outgoing["content_source_url"], "https://example.com/?doi=10.1002")
        self.assertEqual(source["content_source_url"], "https://gallery.gczhouwld.com/?edition=2026-10-10")

    def test_invalid_media_id_can_adopt_only_unique_match_and_write_urls_only(self):
        origin = fixture_draft()
        modified = json.loads(json.dumps(origin))
        saved = []
        def old_get(token, media_id):
            self.assertEqual(token, "token")
            if media_id == MEDIA:
                raise RuntimeError('draft/get failed: {"errcode": 40007, "errmsg": "invalid media_id"}')
            self.assertEqual(media_id, RECOVERED)
            return json.loads(json.dumps(modified))
        def update(token, media_id, article, index=0):
            self.assertEqual(media_id, RECOVERED)
            self.assertEqual(article["content"], origin["news_item"][index]["content"])
            self.assertEqual(article["thumb_media_id"], origin["news_item"][index]["thumb_media_id"])
            saved.append(index)
            modified["news_item"][index] = article

        request = {
            "action": "sync_daily_draft", "publicationDate": "2026-10-10",
            "expectedExistingMediaId": MEDIA,
            "expectedDois": [DA, DR],
            "expectedFirstReadOriginalUrl": publisher.gallery_original_url(DA, "2026-10-10"),
            "expectedSecondReadOriginalUrl": publisher.gallery_original_url(DR),
            "draftOnly": True, "publicSendAuthorized": False,
            "requireDraftGetReadback": True,
        }
        class FakeArgs:
            preview_dir = "/tmp"
            preview_base_url = "https://relay.gczhouwld.com/wechat-preview"
        state = {"publicationDate": "2026-10-10", "media_id": MEDIA}
        result = io.StringIO()
        with patch.object(publisher, "load_retrospective_slug", return_value={
            "paper": {"doi": DR}, "title": TITLE_B,
        }), patch.object(publisher, "load_state", return_value=state), \
             patch.object(publisher, "get_draft", side_effect=old_get), \
             patch.object(publisher, "find_unique_readable_draft", return_value=(RECOVERED, origin)), \
             patch.object(publisher, "update_draft", side_effect=update), \
             patch.object(publisher, "save_state") as save_state, \
             patch.object(publisher, "write_draft_preview", return_value=(
                pathlib.Path("/tmp/new-preview.html"), "https://relay.gczhouwld.com/wechat-preview/verified.html"
             )), patch.object(publisher, "create_draft", side_effect=AssertionError("Never duplicate")), \
             contextlib.redirect_stdout(result):
            status = publisher.update_verified_original_links_only(
                "token", publication_date="2026-10-10", slot="2026-10-10T08:00:00+08:00",
                papers=[{}] * 23, featured={"paper": {"doi": DA}},
                edition={"title": TITLE_A}, retrospective_slug="the-approved-retrospective",
                request=request, args=FakeArgs(),
            )
        self.assertEqual(status, 0)
        self.assertEqual(saved, [0, 1])
        body = json.loads(result.getvalue())
        self.assertTrue(body["recoveredExistingDraft"])
        self.assertEqual(body["media_id"], RECOVERED)
        self.assertIsNone(body["publish_id"])
        self.assertEqual(save_state.call_args.args[1]["media_id"], RECOVERED)

    def test_40007_no_exact_match_never_writes(self):
        request = {
            "action": "sync_daily_draft", "publicationDate": "2026-10-10",
            "expectedExistingMediaId": MEDIA, "expectedDois": [DA, DR],
            "expectedFirstReadOriginalUrl": publisher.gallery_original_url(DA, "2026-10-10"),
            "expectedSecondReadOriginalUrl": publisher.gallery_original_url(DR),
            "draftOnly": True, "publicSendAuthorized": False, "requireDraftGetReadback": True,
        }
        class Args:
            preview_dir = "/tmp"
            preview_base_url = "https://relay.gczhouwld.com/wechat-preview"
        with patch.object(publisher, "load_retrospective_slug", return_value={
            "paper": {"doi": DR}, "title": TITLE_B,
        }), patch.object(publisher, "load_state", return_value={
            "publicationDate": "2026-10-10", "media_id": MEDIA
        }), patch.object(publisher, "get_draft", side_effect=RuntimeError(
            'draft/get failed: {"errcode": 40007, "errmsg": "invalid media_id"}'
        )), patch.object(publisher, "find_unique_readable_draft", side_effect=RuntimeError(
            "no unique matching WeChat draft found"
        )), patch.object(publisher, "update_draft", side_effect=AssertionError("Never update")), \
             patch.object(publisher, "create_draft", side_effect=AssertionError("Never add")):
            with self.assertRaisesRegex(RuntimeError, "no unique matching"):
                publisher.update_verified_original_links_only(
                    "token", publication_date="2026-10-10",
                    slot="2026-10-10T08:00:00+08:00", papers=[],
                    featured={"paper": {"doi": DA}}, edition={"title": TITLE_A},
                    retrospective_slug="the-approved-retrospective", request=request, args=Args(),
                )


if __name__ == "__main__":
    unittest.main()
