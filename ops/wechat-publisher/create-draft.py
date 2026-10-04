#!/usr/bin/env python3
"""Create a WeChat Official Account draft from the latest verified Gallery release.

Secrets are read from /etc/osg-wechat-relay/env. The script never prints the
AppSecret or access_token. By default it only renders a local preview; pass
--create to upload/reuse a permanent cover image and create the draft.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import tempfile
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV = Path("/etc/osg-wechat-relay/env")
DEFAULT_COVER = ROOT / "public" / "share-default.png"
DEFAULT_CACHE = Path("/var/lib/osg-wechat-publisher/cover-media.json")
DEFAULT_SOURCE_URL = "https://gallery.gczhouwld.com/"

SUPPLEMENT_FILES = (
    "rolling-supplement.json",
    "literature-supplement.json",
    "automation-supplement.json",
    "curated-supplement.json",
    "final-audit-supplement.json",
    "manual-supplement.json",
    "total-synthesis.json",
)

JOURNAL_ORDER = {
    "Nature": 0,
    "Science": 1,
    "Nature Catalysis": 2,
    "Nature Synthesis": 3,
    "Nature Chemistry": 4,
    "Nature Communications": 5,
    "Science Advances": 6,
    "JACS": 7,
    "Angew": 8,
    "Chem": 9,
    "ACS Catalysis": 10,
    "Chemical Science": 11,
    "CCS Chemistry": 12,
    "Green Chemistry": 13,
    "JOC": 14,
    "Organic Letters": 15,
}


def load_env(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"env file not found: {path}")
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def json_request(url: str, *, method: str = "GET", payload=None, headers=None):
    data = None
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            body = {"errcode": exc.code, "errmsg": "HTTP error"}
        return body
    return json.loads(raw.decode("utf-8"))


def get_access_token() -> str:
    app_id = os.environ.get("WECHAT_MP_APP_ID", "").strip()
    app_secret = os.environ.get("WECHAT_MP_APP_SECRET", "").strip()
    if not app_id or not app_secret:
        raise RuntimeError("WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET missing")
    query = urllib.parse.urlencode(
        {"grant_type": "client_credential", "appid": app_id, "secret": app_secret}
    )
    result = json_request("https://api.weixin.qq.com/cgi-bin/token?" + query)
    token = result.get("access_token")
    if not token:
        raise RuntimeError(
            "access_token failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    return str(token)


def normalize_doi(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower().replace("https://doi.org/", "").replace("doi:", "").strip()


def iter_papers(obj):
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                yield item
        return
    if not isinstance(obj, dict):
        return
    for key in ("papers", "items", "records"):
        value = obj.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    yield item


def load_translations() -> dict[str, str]:
    path = ROOT / "public" / "title-translations-zh.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, str] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, str):
                result[normalize_doi(key)] = value.strip()
            elif isinstance(value, dict):
                title = value.get("titleZh") or value.get("zh") or value.get("title")
                if isinstance(title, str):
                    result[normalize_doi(key)] = title.strip()
    return result


def load_latest_release():
    state_path = ROOT / "audit" / "literature-update-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    release = state.get("lastPublication") or {}
    dois = [normalize_doi(x) for x in release.get("publishedDois", []) if normalize_doi(x)]
    slot = str(release.get("publicationSlot") or "")
    if not dois or not slot:
        raise RuntimeError("lastPublication is missing publicationSlot or publishedDois")

    index: dict[str, dict] = {}
    for name in SUPPLEMENT_FILES:
        path = ROOT / "public" / name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for paper in iter_papers(data):
            doi = normalize_doi(paper.get("doi"))
            if not doi:
                continue
            existing = index.setdefault(doi, {})
            for key, value in paper.items():
                if value not in (None, "", [], {}):
                    existing.setdefault(key, value)

    translations = load_translations()
    papers = []
    missing = []
    for doi in dois:
        paper = dict(index.get(doi) or {})
        paper["doi"] = doi
        if not paper.get("titleZh") and translations.get(doi):
            paper["titleZh"] = translations[doi]
        paper["authors"] = [
            str(x).strip()
            for x in (paper.get("authors") or [])
            if isinstance(x, str) and str(x).strip()
        ]
        needed = []
        if not paper.get("journal"):
            needed.append("journal")
        if not paper.get("title"):
            needed.append("title")
        if not paper.get("titleZh"):
            needed.append("titleZh")
        if not paper.get("authors"):
            needed.append("authors")
        if needed:
            missing.append({"doi": doi, "missing": needed})
        papers.append(paper)

    if missing:
        raise RuntimeError(
            "refusing to create incomplete draft: "
            + json.dumps(missing, ensure_ascii=False)
        )

    papers.sort(
        key=lambda p: (
            JOURNAL_ORDER.get(str(p.get("journal")), 100),
            str(p.get("journal")),
            str(p.get("title")),
        )
    )
    return slot, papers


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def slot_label(slot: str) -> str:
    date = slot[:10] if len(slot) >= 10 else slot
    time = slot[11:16] if len(slot) >= 16 else ""
    return f"{date} {time}".strip()


def build_content(slot: str, papers: list[dict]) -> str:
    grouped: dict[str, list[dict]] = {}
    for paper in papers:
        grouped.setdefault(str(paper["journal"]), []).append(paper)

    parts = [
        "<section style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#222;line-height:1.72;'>",
        "<p style='font-size:15px;margin:0 0 18px;'>"
        f"本期网站正式新增 <strong>{len(papers)}</strong> 篇文献。"
        "以下按期刊优先级整理中英文标题与作者。</p>",
    ]

    number = 0
    for journal, items in grouped.items():
        parts.append(
            "<h2 style='font-size:18px;line-height:1.45;margin:28px 0 14px;"
            "padding-left:10px;border-left:4px solid #222;'>"
            f"{esc(journal)} <span style='font-size:12px;font-weight:400;color:#888;'>"
            f"{len(items)} 篇</span></h2>"
        )
        for paper in items:
            number += 1
            authors = ", ".join(paper["authors"])
            parts.append(
                "<section style='margin:0 0 22px;padding:0 0 20px;border-bottom:1px solid #eee;'>"
                f"<div style='font-size:12px;color:#999;margin-bottom:5px;'>#{number:02d}</div>"
                f"<div style='font-size:16px;font-weight:700;line-height:1.6;margin-bottom:5px;'>{esc(paper['titleZh'])}</div>"
                f"<div style='font-size:13px;color:#555;line-height:1.55;margin-bottom:7px;'>{esc(paper['title'])}</div>"
                f"<div style='font-size:12px;color:#888;line-height:1.55;'>作者：{esc(authors)}</div>"
                "</section>"
            )

    parts.extend(
        [
            "<p style='font-size:13px;color:#777;margin:28px 0 0;'>"
            "点击文末“阅读原文”进入有机合成文献库查看对应文献。"
            "</p>",
            f"<p style='font-size:11px;color:#aaa;margin-top:8px;'>数据批次：{esc(slot_label(slot))}</p>",
            "</section>",
        ]
    )
    return "".join(parts)


def multipart_file(field: str, path: Path):
    boundary = "----osg" + uuid.uuid4().hex
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    content = path.read_bytes()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    body = head + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    return boundary, body


def prepare_thumb_cover(cover: Path) -> Path:
    """Return a WeChat-compatible JPG thumbnail (<64 KiB).

    WeChat's draft cover uses a permanent thumb material.  Keep this conversion
    separate from article-body images, which use media/uploadimg instead.
    """
    if not cover.exists():
        raise RuntimeError(f"cover image not found: {cover}")

    raw = cover.read_bytes()
    if cover.suffix.lower() in (".jpg", ".jpeg") and len(raw) < 64 * 1024:
        return cover

    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "cover conversion requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    target = Path(tempfile.gettempdir()) / "osg-wechat-cover-thumb.jpg"
    with Image.open(cover) as image:
        image = image.convert("RGB")
        image.thumbnail((900, 500), Image.Resampling.LANCZOS)

        qualities = (88, 82, 76, 70, 64, 58, 52, 46, 40)
        for quality in qualities:
            image.save(
                target,
                format="JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
            )
            if target.stat().st_size < 64 * 1024:
                return target

        # If compression alone is insufficient, progressively reduce dimensions.
        working = image
        for scale in (0.85, 0.72, 0.60, 0.50):
            width = max(320, int(image.width * scale))
            height = max(180, int(image.height * scale))
            working = image.resize((width, height), Image.Resampling.LANCZOS)
            working.save(
                target,
                format="JPEG",
                quality=55,
                optimize=True,
                progressive=True,
            )
            if target.stat().st_size < 64 * 1024:
                return target

    raise RuntimeError(
        f"converted cover is still too large for WeChat thumb: "
        f"{target.stat().st_size} bytes"
    )


def upload_cover(token: str, cover: Path, cache_path: Path) -> str:
    thumb = prepare_thumb_cover(cover)
    digest = hashlib.sha256(thumb.read_bytes()).hexdigest()

    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    if cache.get("sha256") == digest and cache.get("media_id"):
        return str(cache["media_id"])

    boundary, body = multipart_file("media", thumb)
    query = urllib.parse.urlencode({"access_token": token, "type": "thumb"})
    url = "https://api.weixin.qq.com/cgi-bin/material/add_material?" + query
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        result = json.loads(exc.read().decode("utf-8", errors="replace"))

    media_id = result.get("media_id")
    if not media_id:
        raise RuntimeError(
            "cover upload failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(
            {"sha256": digest, "media_id": media_id, "cover": str(cover), "upload_type": "thumb"},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return str(media_id)


def create_draft(token: str, article: dict):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/add?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(url, method="POST", payload={"articles": [article]})
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "draft/add failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    if not result.get("media_id"):
        raise RuntimeError("draft/add returned no media_id")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--create", action="store_true", help="actually create the WeChat draft")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV))
    parser.add_argument("--cover", default=str(DEFAULT_COVER))
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--output", default="/tmp/osg-wechat-draft-preview.html")
    parser.add_argument("--title-prefix", default="【联调草稿】")
    args = parser.parse_args()

    slot, papers = load_latest_release()
    content = build_content(slot, papers)
    label = slot_label(slot)
    title = f"{args.title_prefix}有机合成文献更新｜{label}"
    digest = f"本期新增{len(papers)}篇有机合成相关文献，按期刊优先级整理中英文标题与作者。"

    output = Path(args.output)
    output.write_text(content, encoding="utf-8")

    summary = {
        "stage": "preview",
        "publicationSlot": slot,
        "paper_count": len(papers),
        "journals": list(dict.fromkeys(str(x["journal"]) for x in papers)),
        "title": title,
        "preview_file": str(output),
        "dois": [x["doi"] for x in papers],
    }
    print(json.dumps(summary, ensure_ascii=False))

    if not args.create:
        return 0

    load_env(Path(args.env_file))
    token = get_access_token()
    thumb_media_id = upload_cover(token, Path(args.cover), DEFAULT_CACHE)
    article = {
        "article_type": "news",
        "title": title,
        "author": "有机合成文献库",
        "digest": digest,
        "content": content,
        "content_source_url": args.source_url,
        "thumb_media_id": thumb_media_id,
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
    }
    result = create_draft(token, article)
    print(
        json.dumps(
            {
                "stage": "draft_add",
                "errcode": result.get("errcode", 0),
                "errmsg": result.get("errmsg", "ok"),
                "media_id": result.get("media_id"),
                "paper_count": len(papers),
                "publicationSlot": slot,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            json.dumps(
                {"stage": "error", "error": str(exc)},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1)
