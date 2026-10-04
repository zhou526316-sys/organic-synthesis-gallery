#!/usr/bin/env python3
"""Create a WeChat Official Account draft from the latest verified Gallery release.

Secrets are read from /etc/osg-wechat-relay/env. The script never prints the
AppSecret or access_token. By default it only renders a local preview; pass
--create to upload/reuse a permanent cover image and create the draft.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
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
DEFAULT_STATE = Path("/var/lib/osg-wechat-publisher/draft-state.json")
DEFAULT_PREVIEW_DIR = Path("/var/www/osg-wechat-preview")
DEFAULT_PREVIEW_BASE_URL = "https://relay.gczhouwld.com/wechat-preview"
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

    The integration test must not depend on the repository placeholder being
    decodable on every server. If the source image cannot be opened, generate a
    clean local JPG placeholder and continue the API test.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
    except ImportError as exc:
        raise RuntimeError(
            "cover conversion requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    target = Path(tempfile.gettempdir()) / "osg-wechat-cover-thumb.jpg"
    resampling = getattr(Image, "Resampling", Image)

    def save_under_limit(image):
        image = image.convert("RGB")
        image.thumbnail((900, 500), resampling.LANCZOS)
        for quality in (88, 82, 76, 70, 64, 58, 52, 46, 40):
            image.save(
                target,
                format="JPEG",
                quality=quality,
                optimize=True,
                progressive=True,
            )
            if target.stat().st_size < 64 * 1024:
                return target

        original = image
        for scale in (0.85, 0.72, 0.60, 0.50):
            width = max(320, int(original.width * scale))
            height = max(180, int(original.height * scale))
            reduced = original.resize((width, height), resampling.LANCZOS)
            reduced.save(
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

    if cover.exists():
        try:
            with Image.open(cover) as source:
                source.load()
                return save_under_limit(source)
        except (UnidentifiedImageError, OSError, ValueError):
            pass

    # Fail-safe integration cover. This is intentionally generated locally so a
    # stale/corrupt placeholder file cannot block testing draft/add.
    image = Image.new("RGB", (900, 383), "white")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((34, 34, 866, 349), radius=26, outline="#222222", width=3)
    try:
        title_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44
        )
        sub_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 25
        )
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
    draw.text((74, 125), "Organic Synthesis Gallery", fill="#111111", font=title_font)
    draw.text((76, 205), "WeChat draft integration test", fill="#555555", font=sub_font)
    return save_under_limit(image)


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


def update_draft(token: str, media_id: str, article: dict):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/update?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(
        url,
        method="POST",
        payload={"media_id": media_id, "index": 0, "articles": article},
    )
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "draft/update failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    return result


def get_draft(token: str, media_id: str):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/get?"
        + urllib.parse.urlencode({"access_token": token, "media_id": media_id})
    )
    result = json_request(url)
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "draft/get failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    items = result.get("news_item")
    if not isinstance(items, list) or not items:
        raise RuntimeError("draft/get returned no news_item")
    return result


def preview_slug(media_id: str) -> str:
    key = os.environ.get("RELAY_SHARED_KEY", "").encode("utf-8")
    if not key:
        raise RuntimeError("RELAY_SHARED_KEY missing; cannot derive preview slug")
    digest = hmac.new(key, media_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest[:24]


def render_wechat_draft_preview(draft: dict, *, media_id: str) -> str:
    item = draft["news_item"][0]
    title = str(item.get("title") or "")
    author = str(item.get("author") or "")
    digest = str(item.get("digest") or "")
    content = str(item.get("content") or "")
    thumb_url = str(item.get("thumb_url") or "")
    source_url = str(item.get("content_source_url") or "")

    # IMPORTANT: body HTML below is the exact content returned by WeChat draft/get.
    # The wrapper only approximates the reader shell around that stored content.
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>{html.escape(title)}</title>
<style>
*{{box-sizing:border-box}}
html,body{{margin:0;padding:0;background:#fff;color:#222}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Microsoft YaHei",Arial,sans-serif}}
.reader{{max-width:677px;margin:0 auto;padding:24px 20px 48px}}
h1{{font-size:22px;line-height:1.45;font-weight:700;margin:0 0 12px}}
.meta{{font-size:14px;color:#888;line-height:1.6;margin-bottom:22px}}
.digest{{font-size:14px;color:#666;line-height:1.75;margin:0 0 18px}}
.cover{{width:100%;height:auto;display:block;margin:0 0 20px}}
.wx-content{{font-size:16px;line-height:1.75;word-break:break-word;overflow-wrap:anywhere}}
.wx-content img{{max-width:100%!important;height:auto!important}}
.wx-content *{{max-width:100%}}
.source-link{{display:block;margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#576b95;text-decoration:none;font-size:15px}}
.provenance{{margin:28px 0 0;padding:10px 12px;border-radius:8px;background:#f7f7f7;color:#999;font-size:11px;line-height:1.65}}
@media(max-width:520px){{.reader{{padding:20px 17px 42px}}h1{{font-size:22px}}}}
</style>
</head>
<body>
<main class="reader">
<h1>{html.escape(title)}</h1>
<div class="meta">{html.escape(author)}</div>
{f'<img class="cover" src="{html.escape(thumb_url, quote=True)}" alt="封面">' if thumb_url else ''}
{f'<p class="digest">{html.escape(digest)}</p>' if digest else ''}
<section class="wx-content">{content}</section>
{f'<a class="source-link" href="{html.escape(source_url, quote=True)}" target="_blank" rel="noreferrer">阅读原文</a>' if source_url else ''}
<div class="provenance">本预览由微信草稿 API <code>draft/get</code> 返回内容生成；正文不是单独维护的网页版本。Draft media id hash: {preview_slug(media_id)}</div>
</main>
</body>
</html>"""


def write_draft_preview(draft: dict, *, media_id: str, preview_dir: Path, base_url: str):
    slug = preview_slug(media_id)
    preview_dir.mkdir(parents=True, exist_ok=True)
    path = preview_dir / f"{slug}.html"
    path.write_text(render_wechat_draft_preview(draft, media_id=media_id), encoding="utf-8")
    latest = preview_dir / "latest.html"
    latest.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return path, f"{base_url.rstrip('/')}/{slug}.html"


def load_state(path: Path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--create", action="store_true", help="create or update the WeChat draft, then read it back and build the preview")
    parser.add_argument("--media-id", default="", help="adopt/update an existing WeChat draft media_id")
    parser.add_argument("--preview-dir", default=str(DEFAULT_PREVIEW_DIR))
    parser.add_argument("--preview-base-url", default=DEFAULT_PREVIEW_BASE_URL)
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
    state = load_state(DEFAULT_STATE)
    requested_media_id = str(args.media_id or "").strip()
    same_day_state = (
        isinstance(state, dict)
        and str(state.get("publicationDate") or "") == slot[:10]
        and str(state.get("media_id") or "").strip()
    )
    media_id = requested_media_id or (str(state.get("media_id")) if same_day_state else "")

    if media_id:
        result = update_draft(token, media_id, article)
        stage = "draft_update"
    else:
        result = create_draft(token, article)
        media_id = str(result.get("media_id") or "")
        stage = "draft_add"

    if not media_id:
        raise RuntimeError("draft write succeeded but no media_id is available")

    save_state(
        DEFAULT_STATE,
        {
            "publicationDate": slot[:10],
            "publicationSlot": slot,
            "media_id": media_id,
            "title": title,
        },
    )

    # Draft is now the source of truth. Read the stored draft back from WeChat,
    # then build preview from that response only.
    draft = get_draft(token, media_id)
    preview_path, preview_url = write_draft_preview(
        draft,
        media_id=media_id,
        preview_dir=Path(args.preview_dir),
        base_url=args.preview_base_url,
    )

    print(
        json.dumps(
            {
                "stage": stage,
                "errcode": result.get("errcode", 0),
                "errmsg": result.get("errmsg", "ok"),
                "media_id": media_id,
                "paper_count": len(papers),
                "publicationSlot": slot,
                "draft_readback": "ok",
                "preview_path": str(preview_path),
                "preview_url": preview_url,
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
