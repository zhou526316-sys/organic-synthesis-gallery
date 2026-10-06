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
import time
import traceback
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
DEFAULT_PUBLISH_STATE = Path("/var/lib/osg-wechat-publisher/publish-state.json")
PUBLISH_TRIGGER = ROOT / "audit" / "automation-triggers" / "wechat-publish-request.json"
RETROSPECTIVE_TRIGGER = ROOT / "audit" / "automation-triggers" / "wechat-retrospective-request.json"
RETROSPECTIVE_DIR = ROOT / "public" / "wechat-retrospective"
DEFAULT_RETROSPECTIVE_STATE = Path("/var/lib/osg-wechat-publisher/retrospective-state.json")
DEFAULT_RETROSPECTIVE_COVER_CACHE = Path("/var/lib/osg-wechat-publisher/retrospective-cover-media.json")
DEFAULT_PREVIEW_DIR = Path("/var/www/osg-wechat-preview")
DEFAULT_PREVIEW_BASE_URL = "https://relay.gczhouwld.com/wechat-preview"
DEFAULT_BODY_IMAGE_CACHE = Path("/var/lib/osg-wechat-publisher/body-images.json")
DEFAULT_PDF_CACHE_DIR = Path("/var/lib/osg-wechat-publisher/source-pdfs")
DEFAULT_SOURCE_IMAGE_CACHE_DIR = Path("/var/lib/osg-wechat-publisher/source-images")
EDITORIAL_GATE_DIR = ROOT / "audit" / "wechat-working"
FEATURED_DIR = ROOT / "public" / "wechat-featured"
EDITION_DIR = ROOT / "public" / "wechat-editions"
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
        if os.environ.get("WECHAT_MP_APP_ID") and os.environ.get("WECHAT_MP_APP_SECRET"):
            return
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
    removed_after_release = {
        normalize_doi(x)
        for x in (
            ((state.get("lastWebsiteSync") or {}).get("verification") or {}).get(
                "removedDoisAbsent", []
            )
        )
        if normalize_doi(x)
    }
    dois = [
        normalize_doi(x)
        for x in release.get("publishedDois", [])
        if normalize_doi(x) and normalize_doi(x) not in removed_after_release
    ]
    slot = str(release.get("publicationSlot") or "")
    if not dois or not slot:
        raise RuntimeError("lastPublication is missing publicationSlot or publishedDois")
    if not slot.endswith("T08:00:00+08:00"):
        raise RuntimeError(
            "WeChat daily draft only accepts the 08:00 Asia/Shanghai literature release"
        )

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


def load_edition(date: str) -> dict:
    path = EDITION_DIR / f"{date}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid WeChat edition data: {path}")
    return data


def git_blob_sha(path: Path) -> str:
    payload = path.read_bytes()
    header = f"blob {len(payload)}\0".encode("utf-8")
    return hashlib.sha1(header + payload).hexdigest()


def require_editorial_review_gate(
    gate_path: Path,
    required_sources: list[Path],
) -> dict:
    if not gate_path.exists():
        raise RuntimeError(
            f"WeChat editorial review gate missing: {gate_path.relative_to(ROOT)}"
        )
    gate = json.loads(gate_path.read_text(encoding="utf-8"))
    if not isinstance(gate, dict):
        raise RuntimeError(f"invalid WeChat editorial review gate: {gate_path}")

    text_review = str(gate.get("textReview") or "").strip().lower()
    image_review = str(gate.get("imageReview") or "").strip().lower()
    if text_review != "pass" or image_review != "pass":
        raise RuntimeError(
            "WeChat editorial review gate not approved: "
            + json.dumps(
                {"textReview": text_review, "imageReview": image_review},
                ensure_ascii=False,
            )
        )

    artifacts = gate.get("artifacts") if isinstance(gate.get("artifacts"), dict) else {}
    for key in ("textOnly", "imagesOnly"):
        rel = str(artifacts.get(key) or "").strip()
        if not rel:
            raise RuntimeError(f"WeChat review gate missing artifact: {key}")
        artifact = (ROOT / rel).resolve()
        try:
            artifact.relative_to(ROOT.resolve())
        except ValueError as exc:
            raise RuntimeError(f"WeChat review artifact escapes repository: {rel}") from exc
        if not artifact.exists() or artifact.stat().st_size <= 0:
            raise RuntimeError(f"WeChat review artifact missing or empty: {rel}")

    source_rows = gate.get("sources") if isinstance(gate.get("sources"), list) else []
    indexed = {
        str(row.get("path") or "").strip(): row
        for row in source_rows
        if isinstance(row, dict) and str(row.get("path") or "").strip()
    }
    for source in required_sources:
        source = source.resolve()
        try:
            rel = str(source.relative_to(ROOT.resolve())).replace("\\", "/")
        except ValueError as exc:
            raise RuntimeError(f"WeChat reviewed source escapes repository: {source}") from exc
        if not source.exists():
            raise RuntimeError(f"WeChat reviewed source missing: {rel}")
        row = indexed.get(rel)
        if not row:
            raise RuntimeError(f"WeChat review gate does not cover source: {rel}")
        expected = str(row.get("blobSha") or "").strip().lower()
        actual = git_blob_sha(source)
        if not expected or expected != actual:
            raise RuntimeError(
                f"WeChat review gate stale for {rel}: expected {expected or 'missing'}, actual {actual}"
            )

    asset_rows = gate.get("assets") if isinstance(gate.get("assets"), list) else []
    for row in asset_rows:
        if not isinstance(row, dict):
            raise RuntimeError("invalid WeChat review asset row")
        rel = str(row.get("path") or "").strip()
        expected = str(row.get("blobSha") or "").strip().lower()
        if not rel or not expected:
            raise RuntimeError("WeChat review asset missing path/blobSha")
        asset = (ROOT / rel).resolve()
        try:
            asset.relative_to(ROOT.resolve())
        except ValueError as exc:
            raise RuntimeError(f"WeChat reviewed asset escapes repository: {rel}") from exc
        if not asset.exists():
            raise RuntimeError(f"WeChat reviewed asset missing: {rel}")
        actual = git_blob_sha(asset)
        if actual != expected:
            raise RuntimeError(
                f"WeChat reviewed asset changed after approval: {rel}: expected {expected}, actual {actual}"
            )
    if bool(gate.get("materializedCropReviewRequired")):
        for source in required_sources:
            rel = str(source.resolve().relative_to(ROOT.resolve())).replace("\\", "/")
            if not rel.startswith("public/wechat-") or not rel.endswith(".json"):
                continue
            manifest = json.loads(source.read_text(encoding="utf-8"))
            figures = manifest.get("figures") if isinstance(manifest, dict) else []
            figure_map = {
                str(fig.get("id")): fig
                for fig in figures if isinstance(figures, list) and isinstance(fig, dict) and fig.get("id")
            }
            for fig in figures if isinstance(figures, list) else []:
                if not isinstance(fig, dict):
                    continue
                fig_id = str(fig.get("id") or "unknown")
                if isinstance(fig.get("crop_frac"), list):
                    raise RuntimeError(
                        f"runtime crop_frac forbidden after materialized review: {rel}#{fig_id}"
                    )
                if fig.get("body") is False:
                    continue
                repo_image = str(fig.get("repo_path") or "").strip()
                if not repo_image:
                    raise RuntimeError(
                        f"reviewed production figure must be pinned to repo_path: {rel}#{fig_id}"
                    )

            if bool(gate.get("strictFigurePlacement")):
                used = set()
                lead_id = str(manifest.get("lead_figure_id") or "").strip()
                if lead_id:
                    used.add(lead_id)
                for section_index, section in enumerate(manifest.get("sections") or [], start=1):
                    if not isinstance(section, dict):
                        continue
                    ids = [str(x) for x in (section.get("figures") or [])]
                    positions = section.get("figures_after_paragraph")
                    positions = positions if isinstance(positions, dict) else {}
                    positioned = set()
                    for positioned_ids in positions.values():
                        if isinstance(positioned_ids, str):
                            positioned_ids = [positioned_ids]
                        if isinstance(positioned_ids, list):
                            positioned.update(str(x) for x in positioned_ids)
                    missing = [x for x in ids if x not in positioned]
                    if missing:
                        raise RuntimeError(
                            f"strict figure placement missing paragraph mapping: {rel} section {section_index}: {missing}"
                        )
                    used.update(ids)

                label_re = re.compile(
                    r"(?:原文\s+)?(?:Fig\.|Table\s+\d+|Supporting Information\s+(?:Fig\.|Table)|SI\s+(?:Fig\.|Table))",
                    re.IGNORECASE,
                )
                for fig_id in sorted(used):
                    fig = figure_map.get(fig_id)
                    if not fig:
                        raise RuntimeError(f"used figure missing from manifest: {rel}#{fig_id}")
                    caption = str(fig.get("caption") or "").strip()
                    if not label_re.search(caption):
                        raise RuntimeError(
                            f"used scientific figure caption lacks Fig/Table/SI identifier: {rel}#{fig_id}"
                        )
    return gate


def load_retrospective_slug(slug: str) -> dict | None:
    slug = str(slug or "").strip()
    if not slug:
        return None
    path = RETROSPECTIVE_DIR / f"{slug}.json"
    if not path.exists():
        raise RuntimeError(f"retrospective manifest missing: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid retrospective manifest: {path}")
    return data


def figure_html(fig_id: str, figures: dict[str, dict], uploaded_urls: dict[str, str]) -> str:
    fig = figures.get(fig_id)
    if not fig:
        return ""
    source = uploaded_urls.get(fig_id) or str(fig.get("source_url") or "")
    if not source:
        return ""
    caption = esc(fig.get("caption") or "")
    try:
        width_pct = int(fig.get("display_width_pct") or 100)
    except (TypeError, ValueError):
        width_pct = 100
    width_pct = max(45, min(100, width_pct))
    image_style = (
        f"display:block;width:{width_pct}%;max-width:100%;height:auto;"
        "margin:0 auto;"
    )
    caption_margin = "7px auto 0"
    caption_width = f"{width_pct}%"
    return (
        "<section style='margin:20px 0 24px;'>"
        f"<img src='{esc(source)}' style='{image_style}'/>"
        f"<p style='font-size:11px;color:#777;line-height:1.65;margin:{caption_margin};width:{caption_width};max-width:100%;'>{caption}</p>"
        "</section>"
    )


def build_content(
    slot: str,
    papers: list[dict],
    featured: dict | None = None,
    uploaded_urls: dict[str, str] | None = None,
    gallery_qr_url: str = "",
) -> str:
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

    if len(papers) > 5:
        summary = " · ".join(
            f"{esc(journal)} {len(items)} 篇"
            for journal, items in grouped.items()
        )
        parts.append(
            "<p style='font-size:13px;line-height:1.8;color:#3f4650;margin:0 0 12px;'>"
            + summary
            + "</p>"
        )
    else:
        for journal, items in grouped.items():
            parts.append(
                "<h2 style='font-size:16px;line-height:1.45;margin:19px 0 7px;"
                "padding-left:8px;border-left:3px solid #222;'>"
                f"{esc(journal)} <span style='font-size:10px;font-weight:400;color:#999;'>"
                f"{len(items)} 篇</span></h2>"
            )
            for paper in items:
                badge = ""
                if featured and normalize_doi(featured.get("paper", {}).get("doi")) == paper["doi"]:
                    badge = "<span style='display:inline-block;font-size:9px;color:#8b5a08;background:#fff0cf;border-radius:8px;padding:1px 5px;margin-right:5px;'>每日精选</span>"
                authors = str(paper.get("authors") or "").strip()
                author_html = (
                    f"<div style='font-size:10px;color:#9aa2ad;line-height:1.45;margin-top:2px;'>{esc(authors)}</div>"
                    if authors else ""
                )
                parts.append(
                    "<section style='margin:0 0 10px;padding:0 0 9px;border-bottom:1px solid #f0f1f3;'>"
                    f"<div style='font-size:14px;font-weight:700;line-height:1.5;margin-bottom:2px;'>{badge}{esc(paper['titleZh'])}</div>"
                    f"<div style='font-size:10px;color:#8a93a3;line-height:1.45;'>{esc(paper['title'])}</div>"
                    + author_html
                    + "</section>"
                )

    if gallery_qr_url:
        card_visuals = uploaded_urls.get("__gallery_cards__", {}) if isinstance(uploaded_urls.get("__gallery_cards__"), dict) else {}
        parts.append(
            build_gallery_jump_card(
                slot[:10],
                papers,
                featured,
                gallery_qr_url,
                card_visuals=card_visuals,
            )
        )

    if featured:
        figures = {str(x.get("id")): x for x in featured.get("figures", []) if isinstance(x, dict)}
        paper = featured.get("paper") or {}
        parts.extend([
            "<p style='height:1px;background:#e8eaec;margin:28px 0;'></p>",
            f"<p style='font-size:11px;letter-spacing:.12em;color:#32675f;font-weight:700;margin:0 0 6px;'>{esc(featured.get('kicker') or '每日精选')}</p>",
            f"<h2 style='font-size:21px;line-height:1.5;margin:0 0 10px;'>{esc(featured.get('headline') or '')}</h2>",
            f"<p style='font-size:12px;color:#888;line-height:1.65;margin:0 0 18px;'>{esc(paper.get('authors') or '')} · {esc(paper.get('journal') or '')} · DOI {esc(paper.get('doi') or '')}</p>",
        ])

        rendered_figures = set()
        lead_figure_id = (
            str(featured.get("lead_figure_id") or "").strip()
            if "lead_figure_id" in featured
            else "fig1"
        )
        lead_position = str(featured.get("lead_figure_position") or "before_quick_points").strip()
        if lead_figure_id and lead_position == "before_quick_points":
            lead_html = figure_html(lead_figure_id, figures, uploaded_urls)
            if lead_html:
                parts.append(lead_html)
                rendered_figures.add(lead_figure_id)
        for point in featured.get("quick_points", []):
            parts.append(
                "<section style='background:#f7f8fa;border-radius:8px;padding:11px 13px;margin:9px 0;'>"
                f"<strong style='font-size:14px;line-height:1.55;'>{esc(point.get('label') or '')}</strong>"
                f"<p style='font-size:14px;line-height:1.78;margin:4px 0 0;color:#444;text-align:justify;'>{esc(point.get('text') or '')}</p>"
                "</section>"
            )
        if lead_figure_id and lead_position == "after_quick_points":
            lead_html = figure_html(lead_figure_id, figures, uploaded_urls)
            if lead_html:
                parts.append(lead_html)
                rendered_figures.add(lead_figure_id)

        for section in featured.get("sections", []):
            parts.append(
                f"<p style='font-size:11px;letter-spacing:.08em;color:#32675f;font-weight:700;margin:26px 0 5px;'>{esc(section.get('eyebrow') or '')}</p>"
                f"<h2 style='font-size:19px;line-height:1.55;margin:0 0 10px;'>{esc(section.get('heading') or '')}</h2>"
            )
            figure_positions = section.get("figures_after_paragraph") if isinstance(section.get("figures_after_paragraph"), dict) else {}
            for paragraph_index, paragraph in enumerate(section.get("paragraphs", []), start=1):
                parts.append(
                    f"<p style='font-size:15px;line-height:1.88;margin:0 0 12px;text-align:justify;'>{esc(paragraph)}</p>"
                )
                inline_ids = figure_positions.get(str(paragraph_index), figure_positions.get(paragraph_index, []))
                if isinstance(inline_ids, str):
                    inline_ids = [inline_ids]
                for fig_id in inline_ids if isinstance(inline_ids, list) else []:
                    fig_key = str(fig_id)
                    if fig_key in rendered_figures:
                        continue
                    fig_html = figure_html(fig_key, figures, uploaded_urls)
                    if fig_html:
                        parts.append(fig_html)
                        rendered_figures.add(fig_key)
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
                fig_key = str(fig_id)
                if fig_key in rendered_figures:
                    continue
                fig_html = figure_html(fig_key, figures, uploaded_urls)
                if fig_html:
                    parts.append(fig_html)
                    rendered_figures.add(fig_key)

        takehome = featured.get("takehome", [])
        if takehome:
            parts.append("<section style='background:#202426;color:#fff;border-radius:10px;padding:15px 16px;margin:24px 0;'>")
            parts.append(f"<h3 style='font-size:16px;line-height:1.5;margin:0 0 8px;color:#fff;'>{esc(featured.get('takehome_heading') or '这篇论文最值得学什么？')}</h3>")
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

    parts.append(
        "<section style='margin-top:12px;padding-top:12px;border-top:1px solid #eee;'>"
        "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>原创说明：</strong>"
        "本文由“化之岛”原创策划与整理，AI 辅助生成与校核；文献事实、化学结构和数据以论文原文为准。"
        "</p></section>"
    )
    parts.append("</section>")
    return "".join(parts)



def build_retrospective_content(data: dict, uploaded_urls: dict[str, str] | None = None) -> str:
    uploaded_urls = uploaded_urls or {}
    figures = {str(x.get("id")): x for x in data.get("figures", []) if isinstance(x, dict)}
    paper = data.get("paper") or {}
    parts = [
        "<section style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#222;line-height:1.72;'>",
        f"<p style='font-size:11px;letter-spacing:.14em;color:#32675f;font-weight:700;margin:0 0 7px;'>{esc(data.get('kicker') or '往期精选')}</p>",
        f"<h2 style='font-size:22px;line-height:1.52;margin:0 0 10px;'>{esc(data.get('headline') or data.get('title') or '')}</h2>",
        f"<p style='font-size:12px;color:#888;line-height:1.65;margin:0 0 18px;'>{esc(paper.get('authors') or '')} · {esc(paper.get('journal') or '')} · DOI {esc(paper.get('doi') or '')}</p>",
    ]

    rendered_figures = set()
    lead_figure_id = str(data.get("lead_figure_id") or "fig1").strip()
    lead_position = str(data.get("lead_figure_position") or "before_quick_points").strip()
    lead_html = figure_html(lead_figure_id, figures, uploaded_urls) if lead_figure_id else ""
    if lead_html and lead_position == "before_quick_points":
        parts.append(lead_html)
        rendered_figures.add(lead_figure_id)
    for point_index, point in enumerate(data.get("quick_points", []), start=1):
        parts.append(
            "<section style='background:#f7f8fa;border-radius:8px;padding:11px 13px;margin:9px 0;'>"
            f"<strong style='font-size:14px;line-height:1.55;'>{esc(point.get('label') or '')}</strong>"
            f"<p style='font-size:14px;line-height:1.78;margin:4px 0 0;color:#444;text-align:justify;'>{esc(point.get('text') or '')}</p>"
            "</section>"
        )
        if (
            lead_html
            and lead_position == "after_first_quick_point"
            and point_index == 1
            and lead_figure_id not in rendered_figures
        ):
            parts.append(lead_html)
            rendered_figures.add(lead_figure_id)
    if lead_html and lead_position == "after_quick_points" and lead_figure_id not in rendered_figures:
        parts.append(lead_html)
        rendered_figures.add(lead_figure_id)

    for section in data.get("sections", []):
        parts.append(
            f"<p style='font-size:11px;letter-spacing:.08em;color:#32675f;font-weight:700;margin:27px 0 5px;'>{esc(section.get('eyebrow') or '')}</p>"
            f"<h2 style='font-size:19px;line-height:1.55;margin:0 0 10px;'>{esc(section.get('heading') or '')}</h2>"
        )
        figure_positions = section.get("figures_after_paragraph") if isinstance(section.get("figures_after_paragraph"), dict) else {}
        for paragraph_index, paragraph in enumerate(section.get("paragraphs", []), start=1):
            parts.append(
                f"<p style='font-size:15px;line-height:1.88;margin:0 0 12px;text-align:justify;'>{esc(paragraph)}</p>"
            )
            inline_ids = figure_positions.get(str(paragraph_index), figure_positions.get(paragraph_index, []))
            if isinstance(inline_ids, str):
                inline_ids = [inline_ids]
            for fig_id in inline_ids if isinstance(inline_ids, list) else []:
                fig_key = str(fig_id)
                if fig_key in rendered_figures:
                    continue
                fig_html = figure_html(fig_key, figures, uploaded_urls)
                if fig_html:
                    parts.append(fig_html)
                    rendered_figures.add(fig_key)
        for bullet in section.get("bullets", []):
            parts.append(
                f"<p style='font-size:14px;line-height:1.82;margin:0 0 8px;padding-left:12px;border-left:2px solid #dfe3e5;'>{esc(bullet)}</p>"
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
            fig_key = str(fig_id)
            if fig_key in rendered_figures:
                continue
            fig_html = figure_html(fig_key, figures, uploaded_urls)
            if fig_html:
                parts.append(fig_html)
                rendered_figures.add(fig_key)

    takehome = data.get("takehome", [])
    if takehome:
        parts.append("<section style='background:#202426;color:#fff;border-radius:10px;padding:15px 16px;margin:25px 0;'>")
        parts.append(f"<h3 style='font-size:16px;line-height:1.5;margin:0 0 8px;color:#fff;'>{esc(data.get('takehome_heading') or '这篇论文最值得学什么？')}</h3>")
        for item in takehome:
            parts.append(f"<p style='font-size:13px;line-height:1.75;margin:0 0 7px;color:#f4f5f6;'>• {esc(item)}</p>")
        parts.append("</section>")

    notice = data.get("ai_notice")
    if notice:
        parts.append(
            "<section style='border-top:1px solid #eee;margin-top:24px;padding-top:14px;'>"
            "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>创作说明：</strong>"
            f"{esc(notice)}</p></section>"
        )
    parts.append(
        "<section style='margin-top:12px;padding-top:12px;border-top:1px solid #eee;'>"
        "<p style='font-size:11px;color:#888;line-height:1.7;margin:0;'><strong>原创说明：</strong>"
        "本文由“化之岛”原创策划与整理，AI 辅助生成与校核；文献事实、化学结构和数据以论文原文为准。"
        "</p></section>"
    )
    parts.append("</section>")
    return "".join(parts)


def prepare_cover_from_local(data: dict, local_images: dict[str, Path]) -> Path | None:
    cover = data.get("cover")
    if not isinstance(cover, dict):
        return None
    fig_id = str(cover.get("source_figure_id") or "").strip()
    source = local_images.get(fig_id) if fig_id else None
    if not source:
        return None
    portrait_id = str(cover.get("portrait_figure_id") or "").strip()
    portrait = local_images.get(portrait_id) if portrait_id else None
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
    except ImportError as exc:
        raise RuntimeError("cover composition requires Pillow") from exc

    canvas_spec = cover.get("canvas") if isinstance(cover.get("canvas"), dict) else {}
    width = int(canvas_spec.get("width") or 1880)
    height = int(canvas_spec.get("height") or 800)
    background_name = str(canvas_spec.get("background") or "white")
    crop_frac = cover.get("crop_frac")
    layout = str(cover.get("layout") or "").strip()

    def choose_font(size: int, bold: bool = False):
        names = (
            [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            ]
            if bold
            else [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            ]
        )
        for name in names:
            if Path(name).exists():
                try:
                    return ImageFont.truetype(name, size)
                except OSError:
                    continue
        return ImageFont.load_default()

    def wrap_text(draw, value: str, font, max_width: int, max_lines: int):
        text = str(value or "").strip()
        if not text:
            return []
        tokens = text.split(" ") if " " in text else list(text)
        joiner = " " if " " in text else ""
        lines = []
        current = ""
        used = 0
        for index, token in enumerate(tokens):
            candidate = token if not current else current + joiner + token
            box = draw.textbbox((0, 0), candidate, font=font)
            if not current or box[2] - box[0] <= max_width:
                current = candidate
                used = index + 1
                continue
            lines.append(current)
            if len(lines) >= max_lines:
                break
            current = token
            used = index
        if len(lines) < max_lines and current:
            lines.append(current)
            used = len(tokens)
        if used < len(tokens) and lines:
            last = lines[-1]
            while last:
                box = draw.textbbox((0, 0), last + "…", font=font)
                if box[2] - box[0] <= max_width:
                    break
                last = last[:-1]
            lines[-1] = last.rstrip(" ,.;:，。；：") + "…"
        return lines[:max_lines]

    with Image.open(source) as image:
        image.load()
        image = image.convert("RGB")
        if isinstance(crop_frac, list) and len(crop_frac) == 4:
            x0, y0, x1, y1 = [float(v) for v in crop_frac]
            x0 = max(0.0, min(1.0, x0)); y0 = max(0.0, min(1.0, y0))
            x1 = max(x0 + 0.01, min(1.0, x1)); y1 = max(y0 + 0.01, min(1.0, y1))
            image = image.crop((
                int(image.width * x0), int(image.height * y0),
                int(image.width * x1), int(image.height * y1),
            ))

        canvas = Image.new("RGB", (width, height), background_name)

        if layout == "gallery_card_qr":
            # Main WeChat cover: reproduce the visual language of the actual
            # Gallery "每日精选" card and reserve a clean right column for a QR
            # code that opens the day's Gallery edition. No chemistry is redrawn.
            canvas = Image.new("RGB", (width, height), "#f4f7fb")
            draw = ImageDraw.Draw(canvas)
            card_x, card_y = 44, 44
            card_w, card_h = int(width * 0.755), height - 88
            qr_x = card_x + card_w + 34
            qr_w = width - qr_x - 34

            draw.rounded_rectangle(
                (card_x, card_y, card_x + card_w, card_y + card_h),
                radius=34,
                fill="#ffffff",
                outline="#d7a446",
                width=5,
            )

            paper = data.get("paper") if isinstance(data.get("paper"), dict) else {}
            journal = str(paper.get("journal") or "")
            date = str(cover.get("card_date") or data.get("date") or "")
            card_title = str(
                cover.get("card_title")
                or data.get("headline")
                or paper.get("title")
                or ""
            )
            authors = str(paper.get("authors") or "")
            doi = str(paper.get("doi") or "")

            tag_font = choose_font(25, True)
            small_font = choose_font(24, False)
            title_font = choose_font(44, True)
            doi_font = choose_font(22, False)

            tx = card_x + 38
            ty = card_y + 30
            tags = [
                ("每日精选", "#fff0cf", "#8b5a08"),
                (journal, "#eef3ff", "#3159bd"),
                ("新增", "#edf9f0", "#237044"),
            ]
            if date:
                tags.insert(2, (date, "#f4f5f7", "#667085"))
            for label, fill, ink in tags:
                if not label:
                    continue
                box = draw.textbbox((0, 0), label, font=tag_font)
                tw = box[2] - box[0] + 28
                th = 46
                draw.rounded_rectangle((tx, ty, tx + tw, ty + th), radius=22, fill=fill)
                draw.text((tx + 14, ty + 7), label, font=tag_font, fill=ink)
                tx += tw + 12

            text_x = card_x + 40
            text_w = card_w - 80
            title_y = card_y + 105
            title_lines = wrap_text(draw, card_title, title_font, text_w, 2)
            for line in title_lines:
                draw.text((text_x, title_y), line, font=title_font, fill="#172033")
                title_y += 58

            if authors:
                author_lines = wrap_text(draw, authors, small_font, text_w, 1)
                for line in author_lines:
                    draw.text((text_x, title_y + 4), line, font=small_font, fill="#667085")
                    title_y += 34

            visual_top = max(card_y + 255, title_y + 24)
            visual_bottom = card_y + card_h - 58
            visual_h = max(220, visual_bottom - visual_top)
            visual_x = card_x + 32
            visual_w = card_w - 64
            draw.rounded_rectangle(
                (visual_x, visual_top, visual_x + visual_w, visual_top + visual_h),
                radius=22,
                fill="#ffffff",
                outline="#e3e8f1",
                width=2,
            )
            fitted = ImageOps.contain(
                image,
                (visual_w - 34, visual_h - 34),
                method=Image.Resampling.LANCZOS,
            )
            px = visual_x + (visual_w - fitted.width) // 2
            py = visual_top + (visual_h - fitted.height) // 2
            canvas.paste(fitted, (px, py))

            if doi:
                doi_label = f"DOI {doi}"
                box = draw.textbbox((0, 0), doi_label, font=doi_font)
                draw.text(
                    (card_x + card_w - 34 - (box[2] - box[0]), card_y + card_h - 36),
                    doi_label,
                    font=doi_font,
                    fill="#8a93a3",
                )

            # QR column.
            qr_title_font = choose_font(34, True)
            qr_hint_font = choose_font(24, False)
            qr_title = str(cover.get("qr_title") or "今日新增")
            qr_count = str(cover.get("qr_count") or "")
            qr_line = f"{qr_title}{(' · ' + qr_count) if qr_count else ''}"
            qr_title_lines = wrap_text(draw, qr_line, qr_title_font, qr_w - 20, 2)
            qy = 110
            for line in qr_title_lines:
                draw.text((qr_x + 10, qy), line, font=qr_title_font, fill="#172033")
                qy += 47

            qr_rel = str(cover.get("qr_repo_path") or "").strip()
            qr_path = (ROOT / qr_rel).resolve() if qr_rel else None
            if qr_path and qr_path.exists():
                try:
                    qr_path.relative_to(ROOT.resolve())
                except ValueError as exc:
                    raise RuntimeError("cover qr_repo_path escapes repository") from exc
                with Image.open(qr_path) as qr_image:
                    qr_image.load()
                    qr_image = qr_image.convert("RGB")
                    qr_size = min(qr_w - 36, 292)
                    qr_image = qr_image.resize(
                        (qr_size, qr_size),
                        Image.Resampling.NEAREST,
                    )
                    qx = qr_x + (qr_w - qr_size) // 2
                    qy = max(qy + 24, 210)
                    draw.rounded_rectangle(
                        (qx - 14, qy - 14, qx + qr_size + 14, qy + qr_size + 14),
                        radius=22,
                        fill="#ffffff",
                        outline="#d7deea",
                        width=2,
                    )
                    canvas.paste(qr_image, (qx, qy))
                    qy += qr_size + 38
            else:
                qy += 20

            hint = str(cover.get("qr_hint") or "扫码进入当日文献页")
            for line in wrap_text(draw, hint, qr_hint_font, qr_w - 24, 3):
                box = draw.textbbox((0, 0), line, font=qr_hint_font)
                draw.text(
                    (qr_x + (qr_w - (box[2] - box[0])) // 2, qy),
                    line,
                    font=qr_hint_font,
                    fill="#526071",
                )
                qy += 34
            site = "gallery.gczhouwld.com"
            site_box = draw.textbbox((0, 0), site, font=doi_font)
            draw.text(
                (qr_x + (qr_w - (site_box[2] - site_box[0])) // 2, height - 78),
                site,
                font=doi_font,
                fill="#98a2b3",
            )

        elif layout == "hyster_fret_abstract":
            # Hyster retrospective cover: abstract editorial illustration of
            # energy transfer -> excited PLP -> localized radical coupling.
            # Chemistry in the small inset remains the original paper crop.
            canvas = Image.new("RGBA", (width, height), "#082a4d")
            draw = ImageDraw.Draw(canvas)

            # Layered blue background gives the cover depth without inventing
            # a molecular structure.
            for i in range(14):
                x0 = int(width * (0.02 + i * 0.075))
                shade = max(15, 52 - i * 2)
                draw.ellipse(
                    (x0-int(width*0.18), int(height*0.20),
                     x0+int(width*0.30), int(height*0.70)),
                    fill=(10, 55+shade//2, 92+shade, 14),
                )

            gold = "#efca78"
            white = "#f7f9fc"
            cyan = "#69d7ff"
            purple = "#c5a4ff"
            muted = "#cad7e5"

            kicker = str(cover.get("thumb_kicker") or "往期精选｜Nature｜Hyster")
            title_text = str(cover.get("thumb_title") or data.get("headline") or "")
            kicker_font = choose_font(max(30, int(width*0.038)), True)
            title_font = choose_font(max(55, int(width*0.070)), True)
            node_font = choose_font(max(25, int(width*0.030)), True)
            small_font = choose_font(max(20, int(width*0.024)), True)

            # Header.
            draw.rounded_rectangle(
                (int(width*0.055), int(height*0.045), int(width*0.73), int(height*0.125)),
                radius=max(14,int(width*0.018)),
                fill=(7,39,73,235), outline=gold, width=max(2,int(width*0.0025)),
            )
            draw.text((int(width*0.075), int(height*0.062)), kicker, font=kicker_font, fill=gold)

            # Main title: no subtitle.
            y = int(height*0.16)
            for line in wrap_text(draw, title_text, title_font, int(width*0.88), 3):
                draw.text((int(width*0.06), y), line, font=title_font, fill=white)
                y += int(height*0.075)

            # Abstract FRET / PLP energy-transfer diagram.
            cy = int(height*0.49)
            r1 = int(width*0.075)
            r2 = int(width*0.085)
            x1 = int(width*0.18)
            x2 = int(width*0.49)
            x3 = int(width*0.78)

            # donor glow
            for rr,alpha in [(int(r1*1.7),35),(int(r1*1.35),65)]:
                draw.ellipse((x1-rr,cy-rr,x1+rr,cy+rr),fill=(245,193,73,alpha))
            draw.ellipse((x1-r1,cy-r1,x1+r1,cy+r1),fill="#e4b84e")
            t="Rh6G*"; b=draw.textbbox((0,0),t,font=small_font)
            draw.text((x1-(b[2]-b[0])//2,cy-(b[3]-b[1])//2),t,font=small_font,fill="#102941")

            # acceptor glow / enzyme pocket
            for rr,alpha in [(int(r2*2.0),25),(int(r2*1.55),55)]:
                draw.ellipse((x2-rr,cy-rr,x2+rr,cy+rr),fill=(73,194,239,alpha),outline=(116,214,255,70))
            draw.ellipse((x2-r2,cy-r2,x2+r2,cy+r2),fill="#4bb8e3")
            t="PLP*"; b=draw.textbbox((0,0),t,font=node_font)
            draw.text((x2-(b[2]-b[0])//2,cy-(b[3]-b[1])//2),t,font=node_font,fill="#062743")

            # FRET arrow.
            arrow_y = cy
            draw.line((x1+r1+18,arrow_y,x2-r2-28,arrow_y),fill=gold,width=max(3,int(width*0.004)))
            draw.polygon([
                (x2-r2-28,arrow_y),
                (x2-r2-48,arrow_y-int(height*0.012)),
                (x2-r2-48,arrow_y+int(height*0.012)),
            ],fill=gold)
            ft="FRET"; b=draw.textbbox((0,0),ft,font=small_font)
            draw.text((((x1+x2)-(b[2]-b[0]))//2,cy-int(height*0.055)),ft,font=small_font,fill=gold)

            # localized radical pair and bond formation.
            pr = int(width*0.038)
            draw.ellipse((x3-pr*2,cy-pr,x3,cy+pr),fill=purple)
            draw.ellipse((x3+int(width*0.045),cy-pr,x3+int(width*0.045)+pr*2,cy+pr),fill=cyan)
            draw.line((x3,cy,x3+int(width*0.045),cy),fill=white,width=max(3,int(width*0.004)))
            t="C–C"; b=draw.textbbox((0,0),t,font=node_font)
            draw.text((x3+int(width*0.022)-(b[2]-b[0])//2,cy+int(height*0.065)),t,font=node_font,fill=white)

            # Original reaction inset — paper artwork, not redrawn chemistry.
            card=(int(width*0.055),int(height*0.68),int(width*0.945),int(height*0.94))
            draw.rounded_rectangle(card,radius=max(20,int(width*0.022)),fill="#ffffff")
            src=image.convert("RGB")
            fitted=ImageOps.fit(
                src,
                (card[2]-card[0]-int(width*0.04),card[3]-card[1]-int(height*0.035)),
                method=Image.Resampling.LANCZOS,
                centering=(0.50, 0.50),
            )
            px=card[0]+(card[2]-card[0]-fitted.width)//2
            py=card[1]+(card[3]-card[1]-fitted.height)//2
            canvas.paste(fitted,(px,py))
            canvas = canvas.convert("RGB")

        elif layout == "daily_reference_darkband":
            # Daily main-cover layout: keep the exact reviewed publisher panel
            # intact in a light card and reserve a dark lower band for WeChat's
            # own white title overlay. No chemistry or data are redrawn.
            canvas = Image.new("RGB", (width, height), "#0a2442")
            draw = ImageDraw.Draw(canvas)

            # Subtle dark vertical gradient keeps the title-safe lower region
            # readable after WeChat applies its own card text.
            top_rgb = (18, 53, 92)
            bottom_rgb = (5, 22, 42)
            for yy in range(height):
                t = yy / max(1, height - 1)
                rgb = tuple(
                    int(top_rgb[i] * (1 - t) + bottom_rgb[i] * t)
                    for i in range(3)
                )
                draw.line((0, yy, width, yy), fill=rgb)

            margin_x = max(24, int(width * 0.022))
            top_y = max(22, int(height * 0.035))
            panel_w = width - margin_x * 2
            panel_h = max(1, int(image.height * (panel_w / max(1, image.width))))
            max_panel_h = int(height * 0.56)
            if panel_h > max_panel_h:
                scale = max_panel_h / panel_h
                panel_w = max(1, int(panel_w * scale))
                panel_h = max(1, int(panel_h * scale))
            panel = image.resize((panel_w, panel_h), Image.Resampling.LANCZOS)
            px = (width - panel_w) // 2

            mask = Image.new("L", (panel_w, panel_h), 0)
            md = ImageDraw.Draw(mask)
            md.rounded_rectangle(
                (0, 0, panel_w - 1, panel_h - 1),
                radius=max(10, int(width * 0.012)),
                fill=255,
            )
            card = Image.new("RGB", (panel_w, panel_h), "white")
            card.paste(panel, (0, 0))
            canvas.paste(card, (px, top_y), mask)

            separator_y = top_y + panel_h + max(16, int(height * 0.025))
            draw.line(
                (margin_x + 10, separator_y, width - margin_x - 10, separator_y),
                fill="#c28e35",
                width=max(2, int(height * 0.003)),
            )

        elif layout == "retrospective_abstract_square":
            # Abstract editorial cover inspired by the established retrospective
            # visual language. Only symbolic light/energy/radical motifs are drawn;
            # all chemical structures remain in the original-paper reaction inset.
            from PIL import ImageFilter, ImageChops

            canvas = Image.new("RGBA", (width, height), "#09284a")
            draw = ImageDraw.Draw(canvas)

            # Soft blue/magenta/gold glows create an abstract enzyme-pocket field.
            glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow)
            for cx, cy, rgb in [
                (int(width*0.20), int(height*0.61), (255, 66, 188)),
                (int(width*0.55), int(height*0.62), (245, 188, 66)),
                (int(width*0.78), int(height*0.64), (77, 153, 255)),
            ]:
                for rad, alpha in [
                    (int(width*0.18), 18),
                    (int(width*0.12), 34),
                    (int(width*0.075), 58),
                ]:
                    gd.ellipse((cx-rad, cy-rad, cx+rad, cy+rad), fill=(*rgb, alpha))
            glow = glow.filter(ImageFilter.GaussianBlur(max(18, int(width*0.03))))
            canvas = Image.alpha_composite(canvas, glow)
            draw = ImageDraw.Draw(canvas)

            gold = "#e8c36f"
            white = "#f7f9fc"
            muted = "#cbd9e8"

            kicker = str(cover.get("thumb_kicker") or "往期精选｜Nature")
            title_text = str(cover.get("thumb_title") or "")
            meta = str(cover.get("thumb_meta") or "Nature")

            kicker_font = choose_font(max(34, int(width * 0.044)), True)
            title_font = choose_font(max(50, int(width * 0.064)), True)
            meta_font = choose_font(max(25, int(width * 0.032)), True)
            label_font = choose_font(max(25, int(width * 0.031)), True)

            # Header.
            draw.rounded_rectangle(
                (int(width*0.055), int(height*0.048), int(width*0.945), int(height*0.13)),
                radius=max(16, int(width*0.018)), outline=gold, width=3, fill="#09284a"
            )
            draw.text((int(width*0.075), int(height*0.066)), kicker, font=kicker_font, fill=gold)
            mbox = draw.textbbox((0,0), meta, font=meta_font)
            draw.text((int(width*0.925)-(mbox[2]-mbox[0]), int(height*0.073)), meta, font=meta_font, fill=muted)

            # Main title: no subtitle.
            y = int(height*0.17)
            lines = wrap_text(draw, title_text, title_font, int(width*0.88), 3)
            for idx, line in enumerate(lines):
                draw.text(
                    (int(width*0.06), y),
                    line,
                    font=title_font,
                    fill=gold if idx == 0 else white,
                )
                y += int(height*0.073)

            # Abstract FRET pathway.
            center = (int(width*0.58), int(height*0.59))
            for rad, alpha in [(210,110),(165,135),(120,165)]:
                r = int(rad * width / 1000)
                draw.ellipse(
                    (center[0]-r, center[1]-r, center[0]+r, center[1]+r),
                    outline=(70,155,255,alpha), width=max(4,int(width*0.006))
                )

            # Incoming light beam.
            for i in range(8):
                y0=int(height*(0.55+i*0.004))
                draw.line(
                    (int(width*0.03), y0, int(width*0.22), int(height*(0.59+i*0.003))),
                    fill=(255,70,190,210-i*18), width=max(3,int(width*0.006))
                )

            # Donor / acceptor / radical-pair symbols.
            donor=(int(width*0.25),int(height*0.61))
            accept=(int(width*0.55),int(height*0.60))
            r1=(int(width*0.75),int(height*0.58))
            r2=(int(width*0.84),int(height*0.64))
            draw.ellipse((donor[0]-55,donor[1]-55,donor[0]+55,donor[1]+55),fill="#f441b8")
            draw.text((donor[0]-53,donor[1]+63),"Rh6G",font=label_font,fill=white)
            draw.ellipse((accept[0]-58,accept[1]-58,accept[0]+58,accept[1]+58),fill="#efb83f",outline="#ffe8a5",width=4)
            draw.text((accept[0]-42,accept[1]-17),"PLP*",font=label_font,fill="#152433")

            # FRET arc.
            draw.arc(
                (int(width*0.27),int(height*0.45),int(width*0.62),int(height*0.67)),
                start=205,end=340,fill=gold,width=max(7,int(width*0.010))
            )
            draw.polygon([
                (int(width*0.575),int(height*0.545)),
                (int(width*0.615),int(height*0.55)),
                (int(width*0.59),int(height*0.585)),
            ], fill=gold)
            draw.text((int(width*0.37),int(height*0.50)),"FRET",font=label_font,fill=gold)

            draw.ellipse((r1[0]-32,r1[1]-32,r1[0]+32,r1[1]+32),fill="#579cf5")
            draw.ellipse((r2[0]-30,r2[1]-30,r2[0]+30,r2[1]+30),fill="#fb6666")
            draw.text((r1[0]-8,r1[1]-17),"•",font=label_font,fill=white)
            draw.text((r2[0]-8,r2[1]-17),"•",font=label_font,fill=white)
            draw.line((r1[0]+25,r1[1]+15,r2[0]-25,r2[1]-12),fill=gold,width=max(5,int(width*0.007)))

            # Factual anchor: the original reaction crop, tightly trimmed and
            # placed in a bottom card. No generated chemistry is drawn.
            rgb = image.convert("RGB")
            bg = Image.new("RGB", rgb.size, "white")
            diff = ImageChops.difference(rgb, bg).convert("L")
            bbox = diff.point(lambda p: 255 if p > 18 else 0).getbbox()
            if bbox:
                rgb = rgb.crop(bbox)
            fitted = ImageOps.contain(
                rgb,
                (int(width*0.82), int(height*0.20)),
                method=Image.Resampling.LANCZOS,
            )
            card=(int(width*0.055),int(height*0.76),int(width*0.945),int(height*0.96))
            draw.rounded_rectangle(card,radius=max(18,int(width*0.022)),fill="#ffffff")
            px=(width-fitted.width)//2
            py=card[1]+(card[3]-card[1]-fitted.height)//2
            canvas.alpha_composite(fitted.convert("RGBA"),(px,py))

            canvas = canvas.convert("RGB")

        elif layout == "retrospective_figure_square":
            # Full editorial square for secondary WeChat cards, echoing the
            # established blue/gold retrospective visual language while keeping
            # every chemistry structure from the original paper.
            canvas = Image.new("RGB", (width, height), "#0b2d52")
            draw = ImageDraw.Draw(canvas)

            kicker = str(cover.get("thumb_kicker") or "往期精选")
            title1 = str(cover.get("thumb_title") or "")
            title2 = str(cover.get("thumb_subtitle") or "")
            meta = str(cover.get("thumb_meta") or "")
            footer = str(cover.get("thumb_footer") or "")

            kicker_font = choose_font(max(38, int(width * 0.050)), True)
            meta_font = choose_font(max(30, int(width * 0.038)), False)
            title1_font = choose_font(max(64, int(width * 0.078)), True)
            title2_font = choose_font(max(55, int(width * 0.068)), True)
            footer_font = choose_font(max(27, int(width * 0.033)), False)

            left = int(width * 0.06)
            right = int(width * 0.94)

            # Header badge and journal/year.
            badge_w = int(width * 0.54)
            draw.rounded_rectangle(
                (left, int(height*0.05), left+badge_w, int(height*0.135)),
                radius=max(12,int(width*0.012)),
                outline="#e7c56f",
                width=max(2,int(width*0.002)),
                fill="#102f53",
            )
            draw.text((left+24, int(height*0.066)), kicker, font=kicker_font, fill="#f1cf7e")
            if meta:
                mbox = draw.textbbox((0,0), meta, font=meta_font)
                draw.text((right-(mbox[2]-mbox[0]), int(height*0.072)), meta, font=meta_font, fill="#f3f6fa")
                draw.line(
                    (right-(mbox[2]-mbox[0]), int(height*0.115), right, int(height*0.115)),
                    fill="#e7c56f", width=max(2,int(width*0.002)),
                )

            # Big two-level title, designed to survive thumbnail scaling.
            y = int(height * 0.19)
            for line in wrap_text(draw, title1, title1_font, int(width*0.86), 2):
                draw.text((left, y), line, font=title1_font, fill="#ffffff")
                y += int(height * 0.085)
            for line in wrap_text(draw, title2, title2_font, int(width*0.86), 2):
                draw.text((left, y+8), line, font=title2_font, fill="#f0cf82")
                y += int(height * 0.075)

            draw.line((left, int(height*0.45), right, int(height*0.45)), fill="#e7c56f", width=max(2,int(width*0.003)))
            if footer:
                draw.text((left, int(height*0.465)), footer, font=footer_font, fill="#dce7f2")

            # Original reaction scheme occupies the lower half in a clean light card.
            card = (
                left, int(height*0.55),
                right, int(height*0.93),
            )
            draw.rounded_rectangle(
                card,
                radius=max(24,int(width*0.022)),
                fill="#f8fafc",
                outline="#d7e0ea",
                width=max(2,int(width*0.002)),
            )
            max_w = card[2]-card[0]-int(width*0.055)
            max_h = card[3]-card[1]-int(height*0.045)
            fitted = ImageOps.contain(
                image,
                (max_w, max_h),
                method=Image.Resampling.LANCZOS,
            )
            px = card[0] + (card[2]-card[0]-fitted.width)//2
            py = card[1] + (card[3]-card[1]-fitted.height)//2
            canvas.paste(fitted, (px, py))

        elif layout == "retrospective_square":
            # Full square editorial cover for the secondary WeChat card.
            # Portrait-led, dense blue/gold composition; all essential text
            # remains inside the central crop used by WeChat.
            canvas = Image.new("RGB", (width, height), "#0b2a4a")
            draw = ImageDraw.Draw(canvas)

            # Full-bleed portrait on the left ~56%.
            if portrait:
                with Image.open(portrait) as p:
                    p.load()
                    p = p.convert("RGB")
                    p = ImageOps.fit(
                        p,
                        (int(width * 0.58), height),
                        method=Image.Resampling.LANCZOS,
                        centering=(0.48, 0.42),
                    )
                    canvas.paste(p, (0, 0))

            # Deep blue information panel with subtle gold separators.
            panel_x = int(width * 0.47)
            draw.rectangle((panel_x, 0, width, height), fill="#0b2a4a")
            draw.rectangle((panel_x, int(height*0.28), width, int(height*0.285)), fill="#d6b56b")
            draw.rectangle((panel_x, int(height*0.73), width, int(height*0.735)), fill="#d6b56b")

            kicker = str(cover.get("thumb_kicker") or "往期精选")
            title1 = str(cover.get("thumb_title") or "通过杂原子均裂取代")
            title2 = str(cover.get("thumb_subtitle") or "合成二烷基醚")
            meta = str(cover.get("thumb_meta") or "MacMillan · Nature")

            kicker_font = choose_font(max(38, int(width * 0.050)), True)
            meta_font = choose_font(max(28, int(width * 0.036)), True)
            title_font = choose_font(max(60, int(width * 0.078)), True)
            small_font = choose_font(max(27, int(width * 0.034)), False)

            tx = int(width * 0.515)

            # Top label.
            draw.text((tx, int(height * 0.085)), kicker, font=kicker_font, fill="#e6c779")
            draw.text((tx, int(height * 0.155)), meta, font=meta_font, fill="#e9eef5")

            # Main title sits in the central crop-safe band.
            y = int(height * 0.335)
            for line in wrap_text(draw, title1, title_font, int(width * 0.43), 2):
                draw.text((tx, y), line, font=title_font, fill="#ffffff")
                y += int(height * 0.082)
            y += int(height * 0.012)
            for line in wrap_text(draw, title2, title_font, int(width * 0.43), 2):
                draw.text((tx, y), line, font=title_font, fill="#f0cf82")
                y += int(height * 0.082)

            # Minimal chemistry cue rather than a dense generated scheme.
            draw.text((tx, int(height * 0.78)), "Ti–O   +   R•   →   C–O", font=small_font, fill="#dbe7f2")
            draw.text((tx, int(height * 0.84)), "自由基 C–O 成键", font=small_font, fill="#e6c779")

        elif portrait:
            left_w = int(width * 0.34)
            with Image.open(portrait) as p:
                p.load()
                p = p.convert("RGB")
                p = ImageOps.fit(
                    p,
                    (left_w, height),
                    method=Image.Resampling.LANCZOS,
                    centering=(0.50, 0.42),
                )
                canvas.paste(p, (0, 0))
            right_x = int(width * 0.35)
            right_w = width - right_x - int(width * 0.025)
            right_h = int(height * 0.78)
            fitted = ImageOps.contain(
                image,
                (right_w, right_h),
                method=Image.Resampling.LANCZOS,
            )
            px = right_x + (right_w - fitted.width)//2
            py = (height - fitted.height)//2
            canvas.paste(fitted, (px, py))
        else:
            scale = min(width / image.width, height / image.height)
            resized = image.resize(
                (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
                Image.Resampling.LANCZOS,
            )
            canvas.paste(resized, ((width - resized.width)//2, (height - resized.height)//2))

    target = Path(tempfile.gettempdir()) / "osg-wechat-composed-cover.jpg"
    canvas.save(
        target,
        format="JPEG",
        quality=95,
        optimize=True,
        progressive=False,
        dpi=(300, 300),
    )
    return target

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
    """Download, normalize and persist a source figure for WeChat reuse."""
    DEFAULT_SOURCE_IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    source_key = hashlib.sha256(source_url.encode("utf-8")).hexdigest()
    persistent_png = DEFAULT_SOURCE_IMAGE_CACHE_DIR / f"{source_key}.png"
    if persistent_png.exists():
        try:
            if persistent_png.stat().st_size > 0:
                return persistent_png
        except OSError:
            pass

    raw_target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}-raw"
    req = urllib.request.Request(
        source_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; OrganicSynthesisGallery/1.0)",
            "Accept": "image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = response.read()
            content_type = str(response.headers.get("Content-Type") or "").lower()
    except Exception as exc:
        raise RuntimeError(f"failed to download featured figure {fig_id}: {exc}") from exc

    if not payload:
        raise RuntimeError(f"empty featured figure download: {fig_id}")
    if "text/html" in content_type:
        raise RuntimeError(f"featured figure {fig_id} returned HTML instead of an image")

    raw_target.write_bytes(payload)

    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:
        raise RuntimeError(
            "body image normalization requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    try:
        with Image.open(raw_target) as image:
            image.load()
            if image.mode in ("RGBA", "LA"):
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(image.convert("RGBA"))
                normalized = background.convert("RGB")
            elif image.mode == "P":
                normalized = image.convert("RGBA")
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(normalized)
                normalized = background.convert("RGB")
            else:
                normalized = image.convert("RGB")
            normalized.save(
                persistent_png,
                format="PNG",
                optimize=False,
                compress_level=4,
                dpi=(300, 300),
            )
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise RuntimeError(
            f"featured figure {fig_id} is not a decodable raster image: "
            f"content_type={content_type or 'unknown'}, bytes={len(payload)}"
        ) from exc

    return persistent_png

def ensure_pdf_source(featured: dict, override_path: str = "") -> Path:
    if override_path:
        path = Path(override_path).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"featured PDF not found: {path}")
        if not path.read_bytes()[:5] == b"%PDF-":
            raise RuntimeError(f"featured source is not a PDF: {path}")
        return path

    repo_path = str(featured.get("pdf_repo_path") or "").strip()
    if repo_path:
        path = (ROOT / repo_path).resolve()
        try:
            path.relative_to(ROOT.resolve())
        except ValueError as exc:
            raise RuntimeError(f"featured pdf_repo_path escapes repository: {repo_path}") from exc
        if not path.exists():
            raise RuntimeError(
                f"featured repository PDF is missing: {repo_path}. "
                "Run git pull --ff-only before publishing."
            )
        if path.read_bytes()[:5] != b"%PDF-":
            raise RuntimeError(f"featured repository source is not a PDF: {repo_path}")
        return path

    pdf_urls = []
    primary_pdf_url = str(featured.get("pdf_url") or "").strip()
    if primary_pdf_url:
        pdf_urls.append(primary_pdf_url)
    configured_pdf_urls = featured.get("pdf_urls")
    if isinstance(configured_pdf_urls, list):
        for value in configured_pdf_urls:
            value = str(value or "").strip()
            if value and value not in pdf_urls:
                pdf_urls.append(value)
    if not pdf_urls:
        raise RuntimeError(
            "featured article has pdf_render figures but neither pdf_repo_path nor pdf_url(s)"
        )

    DEFAULT_PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    errors = []
    for pdf_url in pdf_urls:
        url_hash = hashlib.sha256(pdf_url.encode("utf-8")).hexdigest()[:20]
        target = DEFAULT_PDF_CACHE_DIR / f"{url_hash}.pdf"
        if target.exists():
            try:
                if target.read_bytes()[:5] == b"%PDF-":
                    return target
            except OSError:
                pass

        req = urllib.request.Request(
            pdf_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/154.0.0.0 Safari/537.36"
                ),
                "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
                "Referer": "https://pubs.acs.org/",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                payload = response.read()
                content_type = str(response.headers.get("Content-Type") or "").lower()
        except Exception as exc:
            errors.append(f"{pdf_url}: {exc}")
            continue

        if not payload.startswith(b"%PDF-"):
            errors.append(
                f"{pdf_url}: non-PDF content_type={content_type or 'unknown'}, bytes={len(payload)}"
            )
            continue
        target.write_bytes(payload)
        return target

    raise RuntimeError(
        "failed to download featured PDF from all configured sources: "
        + " | ".join(errors[-3:])
    )


def render_figure_from_pdf(pdf_path: Path, fig: dict) -> Path:
    spec = fig.get("pdf_render")
    if not isinstance(spec, dict):
        raise RuntimeError(f"figure {fig.get('id')} has no pdf_render specification")

    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError(
            "PDF figure rendering requires PyMuPDF. Install once with: "
            "sudo apt-get update && sudo apt-get install -y python3-fitz"
        ) from exc

    fig_id = str(fig.get("id") or "figure")
    page_index = int(spec.get("page_index"))
    clip_values = spec.get("clip")
    zoom = float(spec.get("zoom") or 4.0)
    if not isinstance(clip_values, list) or len(clip_values) != 4:
        raise RuntimeError(f"invalid pdf_render clip for {fig_id}")

    doc = fitz.open(str(pdf_path))
    try:
        if page_index < 0 or page_index >= doc.page_count:
            raise RuntimeError(
                f"pdf_render page out of range for {fig_id}: "
                f"{page_index} / {doc.page_count}"
            )
        page = doc[page_index]
        clip = fitz.Rect(*[float(x) for x in clip_values])
        pix = page.get_pixmap(
            matrix=fitz.Matrix(zoom, zoom),
            clip=clip,
            alpha=False,
        )
        target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}-pdf.png"
        pix.save(str(target))
        return target
    finally:
        doc.close()


def prepare_featured_local_images(featured: dict | None, override_pdf: str = "") -> dict[str, Path]:
    if not featured:
        return {}
    figures = [x for x in featured.get("figures", []) if isinstance(x, dict)]

    prepared: dict[str, Path] = {}
    for fig in figures:
        fig_id = str(fig.get("id") or "").strip()
        if not fig_id:
            continue
        repo_image = str(fig.get("repo_path") or "").strip()
        if repo_image:
            local = (ROOT / repo_image).resolve()
            try:
                local.relative_to(ROOT.resolve())
            except ValueError as exc:
                raise RuntimeError(f"featured repo_path escapes repository: {repo_image}") from exc
            if not local.exists():
                raise RuntimeError(f"featured repository image is missing: {repo_image}")
            try:
                from PIL import Image, UnidentifiedImageError
                with Image.open(local) as image:
                    image.load()
            except ImportError as exc:
                raise RuntimeError("local image validation requires Pillow") from exc
            except (UnidentifiedImageError, OSError, ValueError) as exc:
                raise RuntimeError(
                    f"featured repository image is not a decodable raster: {repo_image}"
                ) from exc
            prepared[fig_id] = local
            continue
        if isinstance(fig.get("pdf_render"), dict):
            source_spec = dict(featured)
            figure_pdf_url = str(fig.get("pdf_url") or "").strip()
            figure_pdf_repo = str(fig.get("pdf_repo_path") or "").strip()
            if figure_pdf_url or figure_pdf_repo:
                source_spec.pop("pdf_url", None)
                source_spec.pop("pdf_repo_path", None)
                if figure_pdf_url:
                    source_spec["pdf_url"] = figure_pdf_url
                if figure_pdf_repo:
                    source_spec["pdf_repo_path"] = figure_pdf_repo
            pdf_path = ensure_pdf_source(source_spec, override_pdf if not (figure_pdf_url or figure_pdf_repo) else "")
            prepared[fig_id] = render_figure_from_pdf(pdf_path, fig)
            continue
        source_url = str(fig.get("source_url") or "").strip()
        if not source_url:
            continue
        local = download_body_image(source_url, fig_id)

        # Publisher figures are often multi-panel. Allow a fractional crop so the
        # article can show only the exact evidentiary panel, without page chrome,
        # neighbouring panels, or unrelated text.
        crop_frac = fig.get("crop_frac")
        if isinstance(crop_frac, list) and len(crop_frac) == 4:
            try:
                from PIL import Image
            except ImportError as exc:
                raise RuntimeError("figure cropping requires Pillow") from exc
            x0, y0, x1, y1 = [float(v) for v in crop_frac]
            x0 = max(0.0, min(1.0, x0)); y0 = max(0.0, min(1.0, y0))
            x1 = max(x0 + 0.01, min(1.0, x1)); y1 = max(y0 + 0.01, min(1.0, y1))
            with Image.open(local) as image:
                image.load()
                image = image.convert("RGB")
                crop = image.crop((
                    int(image.width * x0), int(image.height * y0),
                    int(image.width * x1), int(image.height * y1),
                ))
                target = Path(tempfile.gettempdir()) / f"osg-wechat-{fig_id}-crop.png"
                crop.save(target, format="PNG", optimize=True, dpi=(300, 300))
                local = target
        prepared[fig_id] = local
    return prepared

def upload_local_body_image(token: str, local: Path, fig_id: str, cache_path: Path) -> str:
    payload = local.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    cache = load_json_cache(cache_path)
    cache_key = f"sha256:{digest}"
    cached = cache.get(cache_key)
    if isinstance(cached, dict) and cached.get("url"):
        return str(cached["url"])

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
    cache[cache_key] = {
        "url": image_url,
        "figure": fig_id,
        "source": "pdf_render",
        "bytes": len(payload),
    }
    save_json_cache(cache_path, cache)
    return str(image_url)


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


def upload_featured_images(token: str, featured: dict | None, override_pdf: str = ""):
    local_images = prepare_featured_local_images(featured, override_pdf)
    uploaded: dict[str, str] = {}
    figure_specs = {
        str(x.get("id")): x
        for x in (featured or {}).get("figures", [])
        if isinstance(x, dict) and str(x.get("id") or "").strip()
    }
    for fig_id, local in local_images.items():
        spec = figure_specs.get(fig_id) or {}
        if spec.get("body") is False:
            continue
        uploaded[fig_id] = upload_local_body_image(
            token,
            local,
            fig_id,
            DEFAULT_BODY_IMAGE_CACHE,
        )
    return uploaded, local_images


def upload_gallery_card_visuals(token: str, papers: list[dict], featured: dict | None, limit: int = 4) -> dict[str, str]:
    """Upload real Gallery TOC/primary visuals for compact daily-card miniatures."""
    featured_doi = normalize_doi((featured or {}).get("paper", {}).get("doi"))
    ordered = list(papers)
    ordered.sort(key=lambda p: (
        0 if featured_doi and normalize_doi(p.get("doi")) == featured_doi else 1,
        JOURNAL_ORDER.get(str(p.get("journal")), 100),
        str(p.get("titleZh") or p.get("title") or ""),
    ))
    selected = [normalize_doi(p.get("doi")) for p in ordered[:max(1, int(limit))]]
    selected = [x for x in selected if x]
    if not selected:
        return {}

    try:
        payload = json_request(
            "https://api.gczhouwld.com/api/media/batch",
            method="POST",
            payload={"dois": selected},
        )
    except Exception:
        return {}

    by_doi: dict[str, str] = {}
    for item in ((payload.get("items") or []) if isinstance(payload, dict) else []):
        if not isinstance(item, dict):
            continue
        doi = normalize_doi(item.get("doi"))
        toc = item.get("toc") if isinstance(item.get("toc"), dict) else {}
        image_url = str(toc.get("imageUrl") or "").strip()
        if not doi or not image_url:
            continue
        try:
            local = download_body_image(image_url, "gallery-" + hashlib.sha256(doi.encode()).hexdigest()[:10])
            by_doi[doi] = upload_local_body_image(
                token,
                local,
                "gallery-card-" + hashlib.sha256(doi.encode()).hexdigest()[:10],
                DEFAULT_BODY_IMAGE_CACHE,
            )
        except Exception:
            continue
    return by_doi


def prepare_gallery_qr_image(target_url: str) -> Path:
    """Create a high-resolution QR PNG for the daily Gallery entry."""
    target = Path(tempfile.gettempdir()) / "osg-wechat-gallery-qr.png"
    try:
        import qrcode  # type: ignore
        image = qrcode.make(target_url)
        image.save(target)
        return target
    except Exception:
        pass

    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/?"
        + urllib.parse.urlencode({
            "size": "520x520",
            "margin": "16",
            "format": "png",
            "data": target_url,
        })
    )
    req = urllib.request.Request(
        qr_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; OrganicSynthesisGallery/1.0)",
            "Accept": "image/png,image/*;q=0.8,*/*;q=0.1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = response.read()
            content_type = str(response.headers.get("Content-Type") or "").lower()
    except Exception as exc:
        raise RuntimeError(f"failed to generate Gallery QR code: {exc}") from exc
    if not payload or ("image/" not in content_type and not payload.startswith(b"\x89PNG")):
        raise RuntimeError("Gallery QR endpoint did not return a PNG image")
    target.write_bytes(payload)
    return target


def build_gallery_jump_card(
    publication_date: str,
    papers: list[dict],
    featured: dict | None,
    qr_url: str,
    card_visuals: dict[str, str] | None = None,
) -> str:
    """Compact entry banner: actual miniatures of today's Gallery cards + QR."""
    if not qr_url or not papers:
        return ""
    card_visuals = card_visuals or {}

    featured_doi = normalize_doi((featured or {}).get("paper", {}).get("doi"))
    ordered = list(papers)
    ordered.sort(
        key=lambda p: (
            0 if featured_doi and normalize_doi(p.get("doi")) == featured_doi else 1,
            JOURNAL_ORDER.get(str(p.get("journal")), 100),
            str(p.get("titleZh") or p.get("title") or ""),
        )
    )
    shown = ordered[:4]

    def card_cell(card: dict) -> str:
        doi = normalize_doi(card.get("doi"))
        is_featured = bool(featured_doi and doi == featured_doi)
        title = str(card.get("titleZh") or card.get("title") or doi or "")
        journal = str(card.get("journal") or "")
        visual = card_visuals.get(doi or "", "")
        border = "#d7a446" if is_featured else "#dfe5ef"
        bg = "#fffdf7" if is_featured else "#ffffff"
        badge = (
            "<span style='display:inline-block;font-size:7px;font-weight:700;color:#8b5a08;"
            "background:#fff0cf;border-radius:999px;padding:2px 5px;margin-right:3px;'>每日精选</span>"
            if is_featured else
            "<span style='display:inline-block;font-size:7px;font-weight:700;color:#3159bd;"
            "background:#edf3ff;border-radius:999px;padding:2px 5px;margin-right:3px;'>本期文献</span>"
        )
        visual_html = (
            f"<img src='{esc(visual)}' style='display:block;width:100%;height:66px;"
            "object-fit:contain;background:#fff;border:1px solid #e7eaf0;border-radius:6px;"
            "margin:5px 0 6px;'/>"
            if visual else ""
        )
        min_h = "154px" if visual else "96px"
        return (
            f"<section style='min-height:{min_h};background:{bg};border:1px solid {border};"
            "border-radius:8px;padding:7px;margin:0;'>"
            "<p style='margin:0 0 3px;line-height:1.2;'>"
            + badge
            + f"<span style='font-size:7px;font-weight:700;color:#3159bd;"
              f"background:#eef3ff;border-radius:999px;padding:2px 5px;'>{esc(journal)}</span>"
            + "</p>"
            + visual_html
            + f"<p style='font-size:9px;line-height:1.35;font-weight:700;color:#222;"
              f"margin:0 0 3px;'>{esc(title)}</p>"
            + f"<p style='font-size:6.5px;line-height:1.25;color:#98a2b3;margin:0;"
              f"word-break:break-all;'>DOI {esc(doi)}</p>"
            + "</section>"
        )

    rows = []
    for offset in range(0, len(shown), 2):
        cells = shown[offset:offset + 2]
        row = "<tr>"
        for card in cells:
            row += "<td style='width:50%;vertical-align:top;padding:3px;'>" + card_cell(card) + "</td>"
        if len(cells) == 1:
            row += "<td style='width:50%;padding:3px;'></td>"
        row += "</tr>"
        rows.append(row)

    remaining = max(0, len(papers) - len(shown))
    more = f"另有 {remaining} 篇，扫码查看完整列表" if remaining else "扫码进入网页继续搜索与筛选"

    return (
        "<section style='margin:16px 0 25px;'>"
        "<table role='presentation' cellpadding='0' cellspacing='0' style='width:100%;"
        "border-collapse:separate;border-spacing:0;background:#f7f9fc;border:1px solid #dfe5ef;"
        "border-radius:12px;overflow:hidden;'>"
        "<tr>"
        "<td style='width:70%;vertical-align:middle;padding:9px 5px 9px 8px;'>"
        f"<p style='font-size:9px;color:#667085;font-weight:700;letter-spacing:.04em;margin:0 3px 4px;'>"
        f"网页今日新增卡片 · {len(papers)} 篇</p>"
        "<table role='presentation' cellpadding='0' cellspacing='0' style='width:100%;border-collapse:collapse;'>"
        + "".join(rows)
        + "</table>"
        f"<p style='font-size:8px;color:#98a2b3;line-height:1.4;margin:4px 4px 0;'>{esc(more)}</p>"
        "</td>"
        "<td style='width:30%;vertical-align:middle;text-align:center;padding:12px 10px 12px 4px;"
        "border-left:1px solid #e1e5eb;'>"
        f"<img src='{esc(qr_url)}' style='display:block;width:132px;max-width:100%;height:auto;"
        "margin:0 auto 8px;background:#fff;border:7px solid #fff;border-radius:8px;'/>"
        "<p style='font-size:12px;line-height:1.4;font-weight:700;color:#3159bd;margin:0 0 3px;'>扫码进入网页</p>"
        "<p style='font-size:9px;line-height:1.45;color:#8a93a3;margin:0;'>查看今日全部新增</p>"
        "</td>"
        "</tr></table>"
        "<p style='font-size:11px;color:#777;line-height:1.6;margin:7px 2px 0;text-align:center;'>"
        "前往有机合成文献库查看今日全部新增，并按期刊、日期或关键词继续搜索与筛选。</p>"
        "</section>"
    )
def prepare_featured_cover(featured: dict | None, override_pdf: str = "") -> Path | None:
    if not featured:
        return None
    cover = featured.get("cover")
    if not isinstance(cover, dict):
        return None
    spec = cover.get("pdf_render")
    if not isinstance(spec, dict):
        return None

    pdf_path = ensure_pdf_source(featured, override_pdf)
    rendered = render_figure_from_pdf(
        pdf_path,
        {"id": "cover", "pdf_render": spec},
    )

    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "cover composition requires Pillow; install with: "
            "sudo apt-get update && sudo apt-get install -y python3-pil"
        ) from exc

    canvas_spec = cover.get("canvas") if isinstance(cover.get("canvas"), dict) else {}
    width = int(canvas_spec.get("width") or 1880)
    height = int(canvas_spec.get("height") or 800)
    background_name = str(canvas_spec.get("background") or "white")

    with Image.open(rendered) as source:
        source.load()
        source = source.convert("RGB")
        scale = min(width / source.width, height / source.height)
        resized = source.resize(
            (max(1, int(source.width * scale)), max(1, int(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        canvas = Image.new("RGB", (width, height), background_name)
        x = (width - resized.width) // 2
        y = (height - resized.height) // 2
        canvas.paste(resized, (x, y))

    target = Path(tempfile.gettempdir()) / "osg-wechat-cover-235.jpg"
    canvas.save(
        target,
        format="JPEG",
        quality=94,
        optimize=True,
        progressive=True,
        dpi=(300, 300),
    )
    return target


def upload_permanent_image(token: str, image_path: Path, cache_path: Path) -> str:
    payload = image_path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    cache = load_json_cache(cache_path)
    if (
        cache.get("sha256") == digest
        and cache.get("media_id")
        and cache.get("upload_type") == "image"
    ):
        return str(cache["media_id"])

    boundary, body = multipart_file("media", image_path)
    query = urllib.parse.urlencode({"access_token": token, "type": "image"})
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
            "cover image upload failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )

    save_json_cache(
        cache_path,
        {
            "sha256": digest,
            "media_id": media_id,
            "cover": str(image_path),
            "upload_type": "image",
            "bytes": len(payload),
        },
    )
    return str(media_id)


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


def submit_publish(token: str, media_id: str):
    url = (
        "https://api.weixin.qq.com/cgi-bin/freepublish/submit?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(url, method="POST", payload={"media_id": media_id})
    if result.get("errcode") not in (None, 0):
        raise RuntimeError(
            "freepublish/submit failed: "
            + json.dumps(
                {"errcode": result.get("errcode"), "errmsg": result.get("errmsg")},
                ensure_ascii=False,
            )
        )
    publish_id = result.get("publish_id")
    if publish_id in (None, ""):
        raise RuntimeError("freepublish/submit returned no publish_id")
    return str(publish_id)


def get_publish_status(token: str, publish_id: str):
    url = (
        "https://api.weixin.qq.com/cgi-bin/freepublish/get?"
        + urllib.parse.urlencode({"access_token": token})
    )
    return json_request(url, method="POST", payload={"publish_id": publish_id})


def wait_for_publish(token: str, publish_id: str, timeout_seconds: int = 120):
    deadline = time.time() + timeout_seconds
    last = None
    while time.time() < deadline:
        last = get_publish_status(token, publish_id)
        if last.get("errcode") not in (None, 0):
            raise RuntimeError(
                "freepublish/get failed: "
                + json.dumps(
                    {"errcode": last.get("errcode"), "errmsg": last.get("errmsg")},
                    ensure_ascii=False,
                )
            )
        status = int(last.get("publish_status", -1))
        if status == 0:
            detail = last.get("article_detail") if isinstance(last.get("article_detail"), dict) else {}
            items = detail.get("item") if isinstance(detail, dict) else []
            article_url = ""
            if isinstance(items, list) and items:
                first = items[0] if isinstance(items[0], dict) else {}
                article_url = str(first.get("article_url") or "")
            return {
                "publish_status": status,
                "article_id": last.get("article_id"),
                "article_url": article_url,
            }
        if status in (2, 3, 4, 5, 6):
            labels = {
                2: "original_declaration_failed",
                3: "publish_failed",
                4: "platform_review_rejected",
                5: "deleted_after_publish",
                6: "banned_after_publish",
            }
            raise RuntimeError(
                f"publish failed: status={status} ({labels.get(status, 'unknown')}) "
                + json.dumps(last, ensure_ascii=False)
            )
        time.sleep(2)
    raise RuntimeError(
        "publish status timeout: "
        + json.dumps(last or {"publish_id": publish_id}, ensure_ascii=False)
    )


def create_draft(token: str, article: dict | list[dict]):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/add?"
        + urllib.parse.urlencode({"access_token": token})
    )
    articles = article if isinstance(article, list) else [article]
    if not articles:
        raise RuntimeError("draft/add requires at least one article")
    result = json_request(url, method="POST", payload={"articles": articles})
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


def update_draft(token: str, media_id: str, article: dict, index: int = 0):
    url = (
        "https://api.weixin.qq.com/cgi-bin/draft/update?"
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(
        url,
        method="POST",
        payload={"media_id": media_id, "index": int(index), "articles": article},
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
        + urllib.parse.urlencode({"access_token": token})
    )
    result = json_request(
        url,
        method="POST",
        payload={"media_id": media_id},
    )
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


def preview_slug(media_id: str, draft: dict | None = None) -> str:
    key = os.environ.get("RELAY_SHARED_KEY", "").encode("utf-8")
    if not key:
        raise RuntimeError("RELAY_SHARED_KEY missing; cannot derive preview slug")

    version_basis = media_id
    if draft:
        items = draft.get("news_item") if isinstance(draft, dict) else None
        compact_items = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            compact_items.append({
                "title": item.get("title"),
                "digest": item.get("digest"),
                "content": item.get("content"),
                "thumb_url": item.get("thumb_url"),
                "content_source_url": item.get("content_source_url"),
            })
        version_basis += "\n" + json.dumps(
            compact_items,
            ensure_ascii=False,
            sort_keys=True,
        )
    digest = hmac.new(key, version_basis.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest[:24]


def render_wechat_draft_preview(draft: dict, *, media_id: str) -> str:
    items = draft.get("news_item") if isinstance(draft, dict) else None
    if not isinstance(items, list) or not items:
        raise RuntimeError("draft preview requires news_item")

    title = str((items[0] or {}).get("title") or "")
    card_nav = []
    rendered = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        item_title = str(item.get("title") or "")
        author = str(item.get("author") or "")
        digest = str(item.get("digest") or "")
        content = str(item.get("content") or "")
        source_url = str(item.get("content_source_url") or "")
        thumb_url = str(item.get("thumb_url") or "")
        anchor = f"article-{idx + 1}"
        if idx == 0:
            card_nav.append(
                "<a class='push-card push-card-main' href='#" + anchor + "'>"
                + (f"<img src='{html.escape(thumb_url, quote=True)}'/>" if thumb_url else "")
                + "<span><b>" + html.escape(item_title) + "</b>"
                + (f"<small>{html.escape(digest)}</small>" if digest else "")
                + "</span></a>"
            )
        else:
            card_nav.append(
                "<a class='push-card push-card-sub' href='#" + anchor + "'>"
                + "<span><b>" + html.escape(item_title) + "</b>"
                + (f"<small>{html.escape(digest)}</small>" if digest else "")
                + "</span>"
                + (f"<img src='{html.escape(thumb_url, quote=True)}'/>" if thumb_url else "")
                + "</a>"
            )
        rendered.append(
            f"<article id='{anchor}' class='article-block'>"
            f"<p class='article-index'>{idx + 1:02d} / {len(items):02d}</p>"
            f"<h1>{html.escape(item_title)}</h1>"
            f"<div class='meta'>{html.escape(author)}</div>"
            f"<section class='wx-content'>{content}</section>"
            + (
                f"<a class='source-link' href='{html.escape(source_url, quote=True)}' "
                "target='_blank' rel='noreferrer'>阅读原文</a>"
                if source_url else ""
            )
            + "</article>"
        )

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>{html.escape(title)}</title>
<style>
*{{box-sizing:border-box}}
html,body{{margin:0;padding:0;background:#f5f6f7;color:#222;scroll-behavior:smooth}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Microsoft YaHei",Arial,sans-serif}}
.bundle{{max-width:720px;margin:0 auto;padding:16px 12px 48px}}
.bundle-head{{background:#fff;border-radius:14px;padding:14px;margin:0 0 14px;box-shadow:0 1px 8px rgba(0,0,0,.04)}}
.bundle-head>p{{font-size:11px;letter-spacing:.12em;color:#777;margin:0 0 10px}}
.push-card{{text-decoration:none;color:#222}}
.push-card-main{{display:block;padding:0 0 12px}}
.push-card-main img{{display:block;width:100%;aspect-ratio:2.35/1;object-fit:cover;border-radius:8px;background:#eee}}
.push-card-main span{{display:block;padding:10px 2px 0}}
.push-card-main b{{display:block;font-size:16px;line-height:1.45}}
.push-card-main small{{display:block;color:#888;font-size:11px;line-height:1.45;margin-top:4px}}
.push-card-sub{{display:flex;gap:12px;align-items:center;padding:12px 0 0;border-top:1px solid #eee}}
.push-card-sub span{{display:block;min-width:0;flex:1}}
.push-card-sub b{{display:block;font-size:14px;line-height:1.45}}
.push-card-sub small{{display:block;color:#888;font-size:11px;line-height:1.45;margin-top:4px}}
.push-card-sub img{{display:block;width:88px;height:88px;object-fit:cover;border-radius:7px;background:#eee;flex:0 0 auto}}
.article-block{{max-width:677px;margin:0 auto 18px;background:#fff;padding:24px 20px 48px;border-radius:14px}}
.article-index{{font-size:10px;letter-spacing:.12em;color:#aaa;margin:0 0 8px}}
h1{{font-size:22px;line-height:1.45;font-weight:700;margin:0 0 12px}}
.meta{{font-size:14px;color:#888;line-height:1.6;margin-bottom:22px}}
.wx-content{{font-size:16px;line-height:1.75;word-break:break-word;overflow-wrap:anywhere}}
.wx-content img{{max-width:100%!important;height:auto!important}}
.wx-content *{{max-width:100%}}
.source-link{{display:block;margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#576b95;text-decoration:none;font-size:15px}}
@media(max-width:520px){{.bundle{{padding:10px 0 36px}}.bundle-head,.article-block{{border-radius:0}}.article-block{{padding:20px 17px 42px}}h1{{font-size:22px}}}}
</style>
</head>
<body>
<main class="bundle">
<section class="bundle-head">
<p>WECHAT PUSH PREVIEW · 共 {len(items)} 篇</p>
{''.join(card_nav)}
</section>
{''.join(rendered)}
<!-- Preview source: WeChat draft/get. version hash: {preview_slug(media_id, draft)} -->
</main>
</body>
</html>"""


def write_draft_preview(draft: dict, *, media_id: str, preview_dir: Path, base_url: str):
    slug = preview_slug(media_id, draft)
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



def pending_retrospective_request():
    if not RETROSPECTIVE_TRIGGER.exists():
        return None
    try:
        request = json.loads(RETROSPECTIVE_TRIGGER.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(request, dict) or str(request.get("action") or "") != "sync_retrospective_draft":
        return None
    request_id = str(request.get("requestId") or "").strip()
    manifest_rel = str(request.get("manifest") or "").strip()
    if not request_id or not manifest_rel:
        return None
    state = load_state(DEFAULT_RETROSPECTIVE_STATE)
    if str(state.get("lastRequestId") or "") == request_id:
        return None
    manifest_path = (ROOT / manifest_rel).resolve()
    try:
        manifest_path.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise RuntimeError("retrospective manifest escapes repository") from exc
    if not manifest_path.exists():
        raise RuntimeError(f"retrospective manifest missing: {manifest_rel}")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("invalid retrospective manifest")
    return request, data


def pending_publish_request(publication_date: str):
    if not PUBLISH_TRIGGER.exists():
        return None
    try:
        request = json.loads(PUBLISH_TRIGGER.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(request, dict):
        return None
    if str(request.get("action") or "") != "publish_daily_draft":
        return None
    request_id = str(request.get("requestId") or "").strip()
    if not request_id:
        return None
    requested_date = str(request.get("publicationDate") or publication_date).strip()
    if requested_date != publication_date:
        return None

    state = load_state(DEFAULT_PUBLISH_STATE)
    if str(state.get("lastRequestId") or "") == request_id:
        return None
    return request


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
    parser.add_argument("--featured-pdf", default="", help="optional local PDF path used instead of downloading the featured paper PDF")
    parser.add_argument("--publish", action="store_true", help="submit the updated draft for publication and wait for final status")
    args = parser.parse_args()

    retrospective = pending_retrospective_request()
    if retrospective:
        request, data = retrospective
        slug = str(data.get("slug") or request.get("slug") or "retrospective").strip()
        title = str(data.get("title") or "").strip()
        digest = str(data.get("digest") or "").strip()
        source_url = str(data.get("source_url") or DEFAULT_SOURCE_URL).strip()
        if not title or not digest:
            raise RuntimeError("retrospective title/digest missing")

        if not args.create:
            print(json.dumps({
                "stage": "plan",
                "mode": "retrospective",
                "slug": slug,
                "title": title,
                "source_url": source_url,
                "note": "No preview URL is created before the WeChat draft is written.",
            }, ensure_ascii=False))
            return 0

        require_editorial_review_gate(
            EDITORIAL_GATE_DIR / f"retrospective-{slug}-review-gate.json",
            [RETROSPECTIVE_DIR / f"{slug}.json"],
        )

        load_env(Path(args.env_file))
        token = get_access_token()
        uploaded_urls, local_images = upload_featured_images(token, data, args.featured_pdf)
        content = build_retrospective_content(data, uploaded_urls)
        cover_path = prepare_cover_from_local(data, local_images)
        if cover_path is not None:
            thumb_media_id = upload_permanent_image(token, cover_path, DEFAULT_RETROSPECTIVE_COVER_CACHE)
        else:
            fallback = next(iter(local_images.values()), Path(args.cover))
            thumb_media_id = upload_cover(token, fallback, DEFAULT_RETROSPECTIVE_COVER_CACHE)

        article = {
            "article_type": "news",
            "title": title,
            "author": "化之岛",
            "digest": digest,
            "content": content,
            "content_source_url": source_url,
            "thumb_media_id": thumb_media_id,
            "need_open_comment": 0,
            "only_fans_can_comment": 0,
        }
        cover = data.get("cover") if isinstance(data.get("cover"), dict) else {}
        if cover.get("crop_235_1"):
            article["pic_crop_235_1"] = str(cover["crop_235_1"])
        if cover.get("crop_1_1"):
            article["pic_crop_1_1"] = str(cover["crop_1_1"])

        state = load_state(DEFAULT_RETROSPECTIVE_STATE)
        drafts = state.get("drafts") if isinstance(state.get("drafts"), dict) else {}
        prior = drafts.get(slug) if isinstance(drafts.get(slug), dict) else {}
        media_id = str(prior.get("media_id") or "").strip()
        if media_id:
            existing = get_draft(token, media_id)
            existing_items = existing.get("news_item") if isinstance(existing, dict) else []
            cover_cfg = data.get("cover") if isinstance(data.get("cover"), dict) else {}
            if bool(cover_cfg.get("preserve_existing_thumb")) and isinstance(existing_items, list) and existing_items:
                prior_item = existing_items[0] if isinstance(existing_items[0], dict) else {}
                prior_thumb = str(prior_item.get("thumb_media_id") or "").strip()
                if prior_thumb:
                    article["thumb_media_id"] = prior_thumb
            result = update_draft(token, media_id, article)
            stage = "draft_update"
        else:
            result = create_draft(token, article)
            media_id = str(result.get("media_id") or "")
            stage = "draft_add"
        if not media_id:
            raise RuntimeError("retrospective draft write succeeded but no media_id is available")

        draft = get_draft(token, media_id)
        preview_path, preview_url = write_draft_preview(
            draft,
            media_id=media_id,
            preview_dir=Path(args.preview_dir),
            base_url=args.preview_base_url,
        )
        drafts[slug] = {
            "media_id": media_id,
            "title": title,
            "preview_url": preview_url,
            "updatedAt": int(time.time()),
        }
        save_state(DEFAULT_RETROSPECTIVE_STATE, {
            "lastRequestId": str(request.get("requestId") or ""),
            "drafts": drafts,
        })
        print(json.dumps({
            "stage": stage,
            "mode": "retrospective",
            "slug": slug,
            "errcode": result.get("errcode", 0),
            "errmsg": result.get("errmsg", "ok"),
            "media_id": media_id,
            "paper_count": 1,
            "publicationSlot": None,
            "draft_readback": "ok",
            "preview_path": str(preview_path),
            "preview_url": preview_url,
            "content_source_url": source_url,
            "title": title,
        }, ensure_ascii=False))
        return 0

    slot, papers = load_latest_release()
    publication_date = slot[:10]
    featured = load_featured(publication_date)
    edition = load_edition(publication_date)
    title = str(
        edition.get("title")
        or f"{args.title_prefix}有机合成文献日报｜{publication_date} · 每日精选"
    )
    digest = (
        str(edition.get("digest") or "").strip()
        or (
            f"今日新增{len(papers)}篇有机合成文献；推文内精选1篇展开解读。"
            if featured
            else f"今日新增{len(papers)}篇有机合成文献。"
        )
    )
    source_url = (
        f"https://gallery.gczhouwld.com/?edition={urllib.parse.quote(publication_date)}"
        if featured
        else args.source_url
    )
    retrospective_slug = str(edition.get("retrospective") or "").strip()

    if not args.create:
        print(json.dumps({
            "stage": "plan",
            "publicationSlot": slot,
            "paper_count": len(papers),
            "featured": bool(featured),
            "retrospective": retrospective_slug or None,
            "title": title,
            "dois": [x["doi"] for x in papers],
            "note": "No preview URL is created before the WeChat draft is written.",
        }, ensure_ascii=False))
        return 0

    required_review_sources = []
    edition_path = EDITION_DIR / f"{publication_date}.json"
    if edition_path.exists():
        required_review_sources.append(edition_path)
    if featured:
        required_review_sources.append(FEATURED_DIR / f"{publication_date}.json")
    if retrospective_slug:
        required_review_sources.append(RETROSPECTIVE_DIR / f"{retrospective_slug}.json")
    require_editorial_review_gate(
        EDITORIAL_GATE_DIR / f"{publication_date}-review-gate.json",
        required_review_sources,
    )

    load_env(Path(args.env_file))
    token = get_access_token()
    uploaded_urls, local_images = upload_featured_images(token, featured, args.featured_pdf)
    uploaded_urls["__gallery_cards__"] = upload_gallery_card_visuals(token, papers, featured, 4)
    gallery_target_url = f"https://gallery.gczhouwld.com/?edition={urllib.parse.quote(publication_date)}"
    qr_local = prepare_gallery_qr_image(gallery_target_url)
    gallery_qr_url = upload_local_body_image(
        token,
        qr_local,
        f"gallery-qr-{publication_date}",
        DEFAULT_BODY_IMAGE_CACHE,
    )
    content = build_content(
        slot,
        papers,
        featured,
        uploaded_urls,
        gallery_qr_url=gallery_qr_url,
    )

    highres_cover = prepare_featured_cover(featured, args.featured_pdf)
    if highres_cover is None and featured:
        highres_cover = prepare_cover_from_local(featured, local_images)
    if highres_cover is not None:
        thumb_media_id = upload_permanent_image(token, highres_cover, DEFAULT_CACHE)
    else:
        cover_path = Path(args.cover)
        if local_images.get("fig1"):
            cover_path = local_images["fig1"]
        thumb_media_id = upload_cover(token, cover_path, DEFAULT_CACHE)

    daily_article = {
        "article_type": "news",
        "title": title,
        "author": "化之岛",
        "digest": digest,
        "content": content,
        "content_source_url": source_url,
        "thumb_media_id": thumb_media_id,
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
    }
    if featured and isinstance(featured.get("cover"), dict):
        cover = featured["cover"]
        if cover.get("crop_235_1"):
            daily_article["pic_crop_235_1"] = str(cover["crop_235_1"])
        if cover.get("crop_1_1"):
            daily_article["pic_crop_1_1"] = str(cover["crop_1_1"])

    articles = [daily_article]
    if retrospective_slug:
        retro = load_retrospective_slug(retrospective_slug)
        if retro:
            retro_uploaded, retro_local = upload_featured_images(token, retro, "")
            retro_content = build_retrospective_content(retro, retro_uploaded)
            retro_cover_path = prepare_cover_from_local(retro, retro_local)
            if retro_cover_path is not None:
                retro_thumb = upload_permanent_image(
                    token, retro_cover_path, DEFAULT_RETROSPECTIVE_COVER_CACHE
                )
            else:
                retro_fallback = next(iter(retro_local.values()), Path(args.cover))
                retro_thumb = upload_cover(
                    token, retro_fallback, DEFAULT_RETROSPECTIVE_COVER_CACHE
                )
            retro_article = {
                "article_type": "news",
                "title": str(retro.get("title") or "往期精选"),
                "author": "化之岛",
                "digest": str(retro.get("digest") or ""),
                "content": retro_content,
                "content_source_url": str(retro.get("source_url") or DEFAULT_SOURCE_URL),
                "thumb_media_id": retro_thumb,
                "need_open_comment": 0,
                "only_fans_can_comment": 0,
            }
            retro_cover = retro.get("cover") if isinstance(retro.get("cover"), dict) else {}
            if retro_cover.get("crop_235_1"):
                retro_article["pic_crop_235_1"] = str(retro_cover["crop_235_1"])
            if retro_cover.get("crop_1_1"):
                retro_article["pic_crop_1_1"] = str(retro_cover["crop_1_1"])
            articles.append(retro_article)

    state = load_state(DEFAULT_STATE)
    requested_media_id = str(args.media_id or "").strip()
    same_day_state = (
        isinstance(state, dict)
        and str(state.get("publicationDate") or "") == publication_date
        and str(state.get("media_id") or "").strip()
    )
    media_id = requested_media_id or (str(state.get("media_id")) if same_day_state else "")

    if media_id:
        existing = get_draft(token, media_id)
        existing_items = existing.get("news_item") if isinstance(existing, dict) else []
        if isinstance(existing_items, list) and len(existing_items) == len(articles):
            if retrospective_slug and len(articles) > 1:
                retro_manifest = load_retrospective_slug(retrospective_slug)
                retro_cover = retro_manifest.get("cover") if isinstance(retro_manifest, dict) and isinstance(retro_manifest.get("cover"), dict) else {}
                preserve = bool(retro_cover.get("preserve_existing_thumb"))
                prior_retro = existing_items[1] if len(existing_items) > 1 and isinstance(existing_items[1], dict) else {}
                prior_thumb = str(prior_retro.get("thumb_media_id") or "").strip()
                if preserve and prior_thumb:
                    articles[1]["thumb_media_id"] = prior_thumb
            for index, item in enumerate(articles):
                update_draft(token, media_id, item, index=index)
            result = {"errcode": 0, "errmsg": "ok"}
            stage = "draft_update"
        else:
            result = create_draft(token, articles)
            media_id = str(result.get("media_id") or "")
            stage = "draft_add_bundle_replacement"
    else:
        result = create_draft(token, articles)
        media_id = str(result.get("media_id") or "")
        stage = "draft_add"

    if not media_id:
        raise RuntimeError("draft write succeeded but no media_id is available")

    save_state(
        DEFAULT_STATE,
        {
            "publicationDate": publication_date,
            "publicationSlot": slot,
            "media_id": media_id,
            "title": title,
            "articleCount": len(articles),
            "retrospective": retrospective_slug or None,
        },
    )

    draft = get_draft(token, media_id)
    preview_path, preview_url = write_draft_preview(
        draft,
        media_id=media_id,
        preview_dir=Path(args.preview_dir),
        base_url=args.preview_base_url,
    )

    output_payload = {
        "stage": stage,
        "errcode": result.get("errcode", 0),
        "errmsg": result.get("errmsg", "ok"),
        "media_id": media_id,
        "paper_count": len(papers),
        "article_count": len(articles),
        "retrospective": retrospective_slug or None,
        "publicationSlot": slot,
        "draft_readback": "ok",
        "preview_path": str(preview_path),
        "preview_url": preview_url,
        "content_source_url": source_url,
    }

    publish_request = pending_publish_request(slot[:10])
    should_publish = bool(args.publish or publish_request)
    if should_publish:
        publish_id = submit_publish(token, media_id)
        published = wait_for_publish(token, publish_id)
        output_payload.update({
            "stage": "published",
            "publish_id": publish_id,
            **published,
        })
        if publish_request:
            save_state(
                DEFAULT_PUBLISH_STATE,
                {
                    "lastRequestId": str(publish_request.get("requestId") or ""),
                    "publicationDate": slot[:10],
                    "publish_id": publish_id,
                    **published,
                },
            )

    print(json.dumps(output_payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            json.dumps(
                {
                    "stage": "error",
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1)
