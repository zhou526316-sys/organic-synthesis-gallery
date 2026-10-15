"""Explicitly create ONE new draft from reviewed articles; preserve all older media.

Called only after the normal source/image editorial gate and article construction.
Creation is journalled before the request. An ambiguous POST is never retried blindly.
"""
from __future__ import annotations
import hashlib
import json
import re
import urllib.parse
from pathlib import Path

ACTION = "recreate_reviewed_draft"


def _hash(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(pub, args, request, *, token, publication_date, slot, papers, edition, articles, expected_source_links):
    _require(isinstance(request, dict) and request.get("action") == ACTION, "wrong recreation action")
    _require(args.create and not args.publish and not str(args.media_id or "").strip(), "recreation is draft-add only")
    _require(request.get("draftOnly") is True and request.get("publicSendAuthorized") is False,
             "public send is not authorized")
    _require(request.get("explicitNewDraftAuthorized") is True and request.get("requireDraftGetReadback") is True,
             "explicit new-draft authorization and readback are required")
    _require(request.get("publicationDate") == publication_date and slot == publication_date + "T08:00:00+08:00",
             "wrong publication date/slot")
    revision = str(request.get("editorialRevision") or "")
    _require(revision and edition.get("editorialRevision") == revision, "wrong source revision")
    gate_path = pub.EDITORIAL_GATE_DIR / (publication_date + "-review-gate.json")
    gate = json.loads(gate_path.read_text(encoding="utf-8"))
    _require(gate.get("revision") == revision and gate.get("textReview") == "pass" and gate.get("imageReview") == "pass",
             "current reviewed revision is not approved")
    _require(len(articles) == request.get("expectedArticleCount") == 2, "wrong article count")
    _require(len(papers) == request.get("journalTotalCount"), "current daily literature count differs")
    _require([urllib.parse.parse_qs(urllib.parse.urlparse(a["content_source_url"]).query).get("doi", [""])[0]
              for a in articles] == request.get("expectedDois"), "selected DOI order differs")
    previous = str(request.get("previousMediaId") or "").strip()
    request_id = str(request.get("requestId") or "").strip()
    _require(previous and re.fullmatch(r"[A-Za-z0-9._-]{8,180}", request_id), "missing previous identity or invalid requestId")
    _require(not request.get("expectedExistingMediaId"), "new draft must not target an existing media id")
    fingerprint = _hash({"articles": articles, "revision": revision, "previous": previous, "date": publication_date})

    import fcntl
    journal_path = pub.DEFAULT_STATE.parent / "recreate-reviewed-requests.json"
    journal_path.parent.mkdir(parents=True, exist_ok=True)
    with (journal_path.parent / "recreate-reviewed.lock").open("a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        book = pub.load_state(journal_path)
        book = book if isinstance(book, dict) else {}
        entries = book.setdefault("requests", {})
        record = entries.get(request_id)
        if record:
            _require(record.get("fingerprint") == fingerprint, "same recreation request has different approved content")
            media_id = str(record.get("newMediaId") or "")
            _require(media_id, "prior creation response is uncertain; inspect cloud drafts before another add")
            created = False
        else:
            prior_state = pub.load_state(pub.DEFAULT_STATE)
            prior_id = str((prior_state or {}).get("media_id") or "")
            _require(not prior_id or prior_id == previous, "active publisher state changed; inspect before creating")
            receipt_path = pub.ROOT / "audit/wechat-publisher/latest.json"
            if receipt_path.exists():
                receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
                _require(receipt.get("media_id") == previous, "source receipt no longer matches previous media")
            record = {"requestId": request_id, "publicationDate": publication_date, "revision": revision,
                      "previousMediaId": previous, "previousPublisherState": prior_state,
                      "fingerprint": fingerprint, "status": "creation_pending", "newMediaId": None}
            entries[request_id] = record
            pub.save_state(journal_path, book)
            result = pub.create_draft(token, articles)
            media_id = str(result.get("media_id") or "")
            _require(media_id and media_id != previous, "new draft id unavailable; do not repeat an ambiguous add")
            record.update({"newMediaId": media_id, "status": "created_readback_pending"})
            pub.save_state(journal_path, book)
            created = True

        _require(media_id != previous, "recreation must never reuse the previous media id")
        cloud = pub.get_draft(token, media_id)
        pub.assert_draft_source_links(cloud, expected_source_links)
        items = cloud.get("news_item", [])
        _require(len(items) == len(articles), "cloud article count differs")
        for index, (wanted, saved) in enumerate(zip(articles, items)):
            for key in ("title", "author", "digest", "thumb_media_id", "content_source_url"):
                _require(str(wanted.get(key) or "") == str(saved.get(key) or ""),
                         "cloud article %d field differs: %s" % (index + 1, key))
            expected = pub.summarize_wechat_article_html(str(wanted.get("content") or ""))
            actual = pub.summarize_wechat_article_html(str(saved.get("content") or ""))
            for key in ("prose_sha256", "images", "links", "headings", "tables"):
                if expected[key] != actual[key]:
                    # Bounded diagnostics only. Keep rejection and the saved new ID;
                    # never retry draft/add or modify cloud content on this path.
                    detail = {"newMediaId": media_id, "article": index + 1, "field": key,
                              "expected": expected[key], "actual": actual[key]}
                    record["readbackMismatch"] = detail
                    pub.save_state(journal_path, book)
                    safe = json.dumps(detail, ensure_ascii=False)
                    raise RuntimeError("cloud article %d content differs: %s; %s" %
                                       (index + 1, key, safe[:12000]))
        preview_path, preview_url = pub.write_draft_preview(
            cloud, media_id=media_id, preview_dir=Path(args.preview_dir), base_url=args.preview_base_url)
        record.update({"status": "verified", "previewUrl": preview_url, "draftReadback": "ok",
                       "allProseAndImageSemanticsVerified": True})
        pub.save_state(journal_path, book)
        pub.save_state(pub.DEFAULT_STATE, {"publicationDate": publication_date, "publicationSlot": slot,
            "media_id": media_id, "previous_media_id": previous, "title": articles[0]["title"],
            "articleCount": len(articles), "retrospective": edition.get("retrospective"),
            "editorialRevision": revision, "lastRecreateRequestId": request_id})
        print(json.dumps({"stage": "draft_recreate_add" if created else "draft_recreate_resumed",
            "mode": "daily", "errcode": 0, "errmsg": "ok", "media_id": media_id,
            "source_media_id": previous, "source_preserved": True, "source_state_verified": False,
            "source_state_note": "publication and deletion reported by owner; old media was not mutated",
            "created_new_draft": created, "cloud_draft_modified": True, "article_count": len(articles),
            "paper_count": len(papers), "publicationSlot": slot, "draft_readback": "ok",
            "all_prose_figures_verified": True, "preview_path": str(preview_path), "preview_url": preview_url,
            "content_source_url": expected_source_links[0], "publish_id": None, "public_send": False}, ensure_ascii=False))
    return 0
