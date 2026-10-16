"""Deterministic, reviewed daily entry; no network or WeChat mutations here."""
from __future__ import annotations
from collections import Counter
from urllib.parse import quote

def validate(mod, date, papers, featured):
    spec=featured.get("reviewed_gallery_entry")
    if not isinstance(spec, dict):
        raise RuntimeError("reviewed entry specification missing")
    doi=mod.normalize_doi((featured.get("paper") or {}).get("doi"))
    if (spec.get("date")!=date or featured.get("date")!=date or spec.get("doi")!=doi
        or spec.get("count")!=len(papers) or sum(mod.normalize_doi(p.get("doi"))==doi for p in papers)!=1):
        raise RuntimeError("reviewed daily entry does not match the actual released catalogue")
    edition=mod.load_edition(date)
    snapshot=edition.get("dailyReleaseSnapshot") or {}
    if (snapshot.get("slot")!=date+"T08:00:00+08:00" or snapshot.get("count")!=len(papers)
        or set(snapshot.get("dois") or [])!={mod.normalize_doi(p.get("doi")) for p in papers}
        or dict(Counter(str(p.get("journal")) for p in papers))!=snapshot.get("journals")):
        raise RuntimeError("daily catalogue changed since editorial review; refresh statistics and gate")
    figures={x["id"]:x for x in featured.get("figures",[]) if isinstance(x,dict) and x.get("id")}
    image=figures.get(spec.get("figure_id"),{})
    qr=figures.get(spec.get("qr_figure_id"),{})
    if (image.get("source_doi")!=doi or image.get("body") is False or not image.get("repo_path")
        or qr.get("body") is not False or not qr.get("repo_path")
        or qr.get("target_url")!="https://gallery.gczhouwld.com/?edition="+date):
        raise RuntimeError("reviewed daily entry is missing its original source image or date QR")
    return spec

def build(mod,date,papers,featured,uploaded_urls,qr_url):
    spec=validate(mod,date,papers,featured)
    visual=uploaded_urls.get(spec["figure_id"],"")
    if not visual or not qr_url:
        raise RuntimeError("reviewed daily entry has not uploaded all images")
    paper=featured["paper"];esc=mod.esc
    daily="https://gallery.gczhouwld.com/?edition="+date
    card=mod.gallery_original_url(paper["doi"],date)
    # Intentional reuse: the same actual paper TOC is a navigation thumbnail here
    # and a full-size scientific overview later. No invented other-paper visuals.
    return ("<section style='margin:14px 0 24px;border:1px solid #dfe5e4;border-radius:8px;padding:12px;background:#fafcfb;'>"
        "<table role='presentation' style='width:100%;table-layout:fixed;border-collapse:collapse;'><tr>"
        "<td style='width:65%;vertical-align:middle;padding:0 10px 0 0;'>"
        f"<a href='{esc(card)}' style='text-decoration:none;color:#263c38;'>"
        f"<p style='font-size:11px;font-weight:700;line-height:1.5;margin:0 0 7px;'>{esc(paper['journal'])} · 今日文献卡片</p>"
        f"<img src='{esc(visual)}' style='display:block;width:100%;height:auto;object-fit:contain;'/>"
        f"<p style='font-size:10px;line-height:1.55;margin:6px 0 0;overflow-wrap:anywhere;'>{esc(featured.get('headline') or paper['title'])}</p></a></td>"
        "<td style='width:35%;vertical-align:middle;text-align:center;'>"
        f"<a href='{esc(daily)}'><img src='{esc(qr_url)}' style='display:block;width:100%;max-width:160px;height:auto;margin:auto;'/></a>"
        f"<p style='font-size:10px;line-height:1.6;margin:6px 0 0;'>今日全部 {len(papers)} 篇</p></td></tr></table>"
        f"<p style='font-size:11px;line-height:1.65;margin:10px 0 0;color:#68736f;'>"
        f"<a href='{esc(daily)}' style='color:#32675f;'>进入当日文献目录</a>，继续按期刊、日期或关键词搜索与筛选。</p></section>")
