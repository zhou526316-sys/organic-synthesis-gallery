#!/usr/bin/env python3
"""Create a WeChat Official Account draft from the latest verified Gallery release.

Secrets are read from /etc/osg-wechat-relay/env. The script never prints the
AppSecret or access_token. A preview URL is generated only after the actual
WeChat draft has been created/updated and successfully read back via draft/get.
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
DEFAULT_BODY_IMAGE_CACHE = Path("/var/lib/osg-wechat-publisher/body-images.json")
FEATURED_DIR = ROOT / "public" / "wechat-featured"
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


def load_featured(date: str):
    path = FEATURED_DIR / f"{date}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid featured article data: {path}")
    return data


def figure_html(fig_id: str, figures: dict[str, dict], uploaded_urls: dict[str, str]) -> str:
    fig = figures.get(fig_id)
    if not fig:
        return ""
    source = uploaded_urls.get(fig_id) or str(fig.get("source_url") or "")
    if not source:
        return ""
    caption = esc(fig.get("caption") or "")
    return (
        "<section style='margin:20px 0 24px;'>"
        f"<img src='{esc(source)}' style='display:block;width:100%;height:auto;margin:0;'/>"
        f"<p style='font-size:11px;color:#777;line-height:1.65;margin:7px 2px 0;'>{caption}</p>"
        "</section>"
    )


def build_content(slot: str, papers: list[dict], featured: dict | None = None, uploaded_urls: dict[str, str] | None = None) -> str:
    uploaded_urls = uploaded_urls or {}
    grouped: dict[str, list[dict]] = {}
    for paper in papers:
        grouped.setdefault(str(paper["journal"]), []).append(paper)

    parts = [
        "<section style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#222;line-height:1.72;'>",
        "<p style='font-size:13px;color:#666;margin:0 0 14px;'>"
        f"今日新增 <strong>{len(papers)}</strong> 篇文献"
        "</p>",
    ]

    for journal, items in grouped.items():
        parts.append(
            "<h2 style='font-size:17px;line-height:1.45;margin:22px 0 8px;"
            "padding-left:9px;border-left:3px solid #222;'>"
            f"{esc(journal)} <span style='font-size:11px;font-weight:400;color:#999;'>"
            f"{len(items)} 篇</span></h2>"
        )
        for paper in items:
            authors = ", ".join(paper["authors"])
            badge = ""
            if featured and normalize_doi(featured.get("paper", {}).get("doi")) == paper["doi"]:
                badge = "<span style='display:inline-block;font-size:10px;color:#fff;background:#222;border-radius:9px;padding:1px 6px;margin-right:6px;'>今日精选</span>"
            parts.append(
                "<section style='margin:0 0 14px;padding:0 0 13px;border-bottom:1px solid #eee;'>"
                f"<div style='font-size:15px;font-weight:700;line-height:1.58;margin-bottom:3px;'>{badge}{esc(paper['titleZh'])}</div>"
                f"<div style='font-size:12px;color:#666;line-height:1.55;margin-bottom:5px;'>{esc(paper['title'])}</div>"
                f"<div style='font-size:11px;color:#999;line-height:1.5;'>{esc(authors)}</div>"
                "</section>"
            )

    if featured:
        figures = {str(x.get("id")): x for x in featured.get("figures", []) if isinstance(x, dict)}
        paper = featured.get("paper") or {}
        parts.extend([
            "<p style='height:1px;background:#e8eaec;margin:28px 0;'></p>",
            "<p style='font-size:11px;letter-spacing:.12em;color:#32675f;font-weight:700;margin:0 0 6px;'>DAILY PICK · 01</p>",
            f"<h2 style='font-size:21px;line-height:1.5;margin:0 0 10px;'>{esc(featured.get('headline') or '')}</h2>",
            f"<p style='font-size:12px;color:#888;line-height:1.65;margin:0 0 18px;'>{esc(paper.get('authors') or '')} · {esc(paper.get('journal') or '')} · DOI {esc(paper.get('doi') or '')}</p>",
        ])

        for point in featured.get("quick_points", []):
            parts.append(
                "<section style='background:#f7f8fa;border-radius:8px;padding:10px 12px;margin:8px 0;'>"
                f"<strong style='font-size:13px;'>{esc(point.get('label') or '')}</strong>"
                f"<p style='font-size:13px;line-height:1.72;margin:3px 0 0;color:#555;'>{esc(point.get('text') or '')}</p>"
                "</section>"
            )

        parts.append(figure_html("fig1", figures, uploaded_urls))

        for section in featured.get("sections", []):
            parts.append(
                f"<p style='font-size:11px;letter-spacing:.08em;color:#32675f;font-weight:700;margin:26px 0 5px;'>{esc(section.get('eyebrow') or '')}</p>"
                f"<h2 style='font-size:19px;line-height:1.55;margin:0 0 10px;'>{esc(section.get('heading') or '')}</h2>"
            )
            for paragraph in section.get("paragraphs", []):
                parts.append(
                    f"<p style='font-size:15px;line-height:1.88;margin:0 0 12px;text-align:justify;'>{esc(paragraph)}</p>"
                )
            for bullet in section.get("bullets", []):
                parts.append(
                    f"<p style='font-size:14px;line-height:1.8;margin:0 0 8px;padding-left:12px;border-left:2px solid #dfe3e5;'>{esc(bullet)}</p>"
                )
            if section.get("callout"):
                parts.append(
                    "<section style='background:#eef7f5;border-left:3px solid #32675f;padding:11px 13px;margin:14px 0;'>"
                    f"<p style='font-size:14px;line-height:1.8;margin:0;'>{esc(section['callout'])}</p></section>"
                )
            if section.get("warning"):
                parts.append(
                    "<section style='background:#fff7e7;border:1px solid #f0ddb0;border-radius:8px;padding:11px 13px;margin:14px 0;'>"
                    f"<p style='font-size:13px;line-height:1.78;margin:0;'>{esc(section['warning'])}</p></section>"
                )
            if section.get("review"):
                parts.append(
                    "<section style='background:#f4f0ff;border:1px solid #e2daf9;border-radius:8px;padding:11px 13px;margin:14px 0;'>"
                    f"<p style='font-size:13px;line-height:1.78;margin:0;'>{esc(section['review'])}</p></section>"
                )
            for fig_id in section.get("figures", []):
                parts.append(figure_html(str(fig_id), figures, uploaded_urls))

        takehome = featured.get("takehome", [])
        if takehome:
            parts.append("<section style='background:#202426;color:#fff;border-radius:10px;padding:15px 16px;margin:24px 0;'>")
            parts.append("<h3 style='font-size:16px;line-height:1.5;margin:0 0 8px;color:#fff;'>这篇论文最值得学什么？</h3>")
            for item in takehome:
                parts.append(f"<p style='font-size:13px;line-height:1.75;margin:0 0 7px;color:#f4f5f6;'>• {esc(item)}</p>")
            parts.append("</section>")

        notice = featured.get("ai_notice")
        if notice:
            parts.append(
                "<section style='border-top:1px solid #eee;margin-top:24px;padding-top:14px;'>"
                "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>创作说明：</strong>"
                f"{esc(notice)}</p></section>"
            )

    parts.append("</section>")
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


def load_json_cache(path: Path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_json_cache(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def download_body_image(source_url: str, fig_id: str) -> Path:
    suffix = ".png"
    target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}{suffix}"
    req = urllib.request.Request(
        source_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; OrganicSynthesisGallery/1.0)",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = response.read()
    except Exception as exc:
        raise RuntimeError(f"failed to download featured figure {fig_id}: {exc}") from exc
    if not payload:
        raise RuntimeError(f"empty featured figure download: {fig_id}")
    target.write_bytes(payload)
    return target


def upload_body_image(token: str, source_url: str, fig_id: str, cache_path: Path) -> str:
    cache = load_json_cache(cache_path)
    key = hashlib.sha256(source_url.encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if isinstance(cached, dict) and cached.get("url"):
        return str(cached["url"])

    local = download_body_image(source_url, fig_id)
    boundary, body = multipart_file("media", local)
    url = (
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?"
        + urllib.parse.urlencode({"access_token": token})
    )
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

    image_url = result.get("url")
    if not image_url:
        raise RuntimeError(
            "body image upload failed: "
            + json.dumps(
                {
                    "figure": fig_id,
                    "errcode": result.get("errcode"),
                    "errmsg": result.get("errmsg"),
                },
                ensure_ascii=False,
            )
        )

    cache[key] = {"url": image_url, "source_url": source_url, "figure": fig_id}
    save_json_cache(cache_path, cache)
    return str(image_url)


def upload_featured_images(token: str, featured: dict | None) -> dict[str, str]:
    if not featured:
        return {}
    uploaded: dict[str, str] = {}
    for fig in featured.get("figures", []):
        if not isinstance(fig, dict):
            continue
        fig_id = str(fig.get("id") or "").strip()
        source_url = str(fig.get("source_url") or "").strip()
        if not fig_id or not source_url:
            continue
        uploaded[fig_id] = upload_body_image(
            token,
            source_url,
            fig_id,
            DEFAULT_BODY_IMAGE_CACHE,
        )
    return uploaded


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

    # Fail-safe neutral cover. Production featured drafts normally use the first
    # original paper figure as the cover source; this is only a last-resort fallback.
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
    draw.text((76, 205), "Daily Literature", fill="#555555", font=sub_font)
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
    parser.add_argument("--title-prefix", default="")
    args = parser.parse_args()

    slot, papers = load_latest_release()
    featured = load_featured(slot[:10])
    title = f"{args.title_prefix}有机合成文献日报｜{slot[:10]} · 每日精选"
    digest = f"今日新增{len(papers)}篇有机合成文献，并精选1篇进行由浅入深的深度解读。" if featured else f"今日新增{len(papers)}篇有机合成文献。"

    if not args.create:
        print(json.dumps({
            "stage": "plan",
            "publicationSlot": slot,
            "paper_count": len(papers),
            "featured": bool(featured),
            "title": title,
            "dois": [x["doi"] for x in papers],
            "note": "No preview URL is created before the WeChat draft is written.",
        }, ensure_ascii=False))
        return 0

    load_env(Path(args.env_file))
    token = get_access_token()
    uploaded_urls = upload_featured_images(token, featured)
    content = build_content(slot, papers, featured, uploaded_urls)
    cover_path = Path(args.cover)
    if featured and featured.get("figures"):
        first_figure = featured["figures"][0]
        first_source = str(first_figure.get("source_url") or "").strip()
        first_id = str(first_figure.get("id") or "cover").strip()
        if first_source:
            cover_path = download_body_image(first_source, f"{first_id}-cover")
    thumb_media_id = upload_cover(token, cover_path, DEFAULT_CACHE)
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
