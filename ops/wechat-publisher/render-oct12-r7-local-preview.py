#!/usr/bin/env python3
"""Build a safe local HTML preview from the R7 review manifests.

No WeChat credentials/API call, image modification, draft publication, or
modification of the original chemical images. Displays reviewed originals
with the exact WeChat article HTML builder and pending R7 text.
"""
import html
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "audit/wechat-working/2026-10-12-r7-offline-preview"
OUT.mkdir(parents=True, exist_ok=True)
FEATURED=ROOT/"public/wechat-featured/2026-10-12.json"
RETRO=ROOT/"public/wechat-retrospective/alkylzirconocene-deaminative-asymmetric-ke-20261012.json"

spec=importlib.util.spec_from_file_location("wechat_publisher",str(ROOT/"ops/wechat-publisher/create-draft.py"))
publisher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
ft=json.loads(FEATURED.read_text())
jt=json.loads(RETRO.read_text())
assert ft["editorialRevision"]==jt["editorialRevision"]=="2026-10-12-r7"
assert ft["paper"]["doi"]=="10.1021/acscatal.6c06048"
assert jt["paper"]["doi"]=="10.1021/jacs.6c10406"
assert ft["cover"]["source_figure_id"]=="acs_cover"
assert jt["cover"]["source_figure_id"]=="jacs_cover"

slot,papers=publisher.load_latest_release()
assert slot.startswith("2026-10-12T08:00:00+08:00"),slot
assert len(papers)==5
seen={f["id"] for f in ft["figures"]}|{f["id"] for f in jt["figures"]}
mapping={}
for m in (ft,jt):
    for fig in m["figures"]:
        if fig["id"] not in mapping:
            path=ROOT/fig["repo_path"]
            assert path.is_file(),str(path)
            mapping[fig["id"]]=path.resolve().as_uri()

daily=publisher.build_content(slot,papers,ft,mapping,gallery_qr_url="")
retrospective=publisher.build_retrospective_content(jt,mapping)
# All draft assets/figures are unchanged, only the source manifests' prose
# and figure displayed width changed. No image bytes are authored here.
for file_name,title,content in (
    ("acs-local-review.html",ft["headline"],daily),
    ("jacs-local-review.html",jt["headline"],retrospective),
):
    doc=("<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>"+html.escape(title)+"</title>"
        "<style>*{box-sizing:border-box}body{background:#f4f5f7;margin:0;padding:0;"
        "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif}"
        "main{width:100%;max-width:720px;margin:0 auto;background:white;padding:18px 16px 30px}"
        "p{overflow-wrap:anywhere}img{object-fit:contain;height:auto !important}"
        "h2{word-break:break-word}</style></head><body><main>"
        +content+"</main></body></html>")
    (OUT/file_name).write_text(doc,encoding="utf-8")
qa={"stage":"offline_preview_only","revision":"2026-10-12-r7","files":["acs-local-review.html","jacs-local-review.html"],
    "selectedDois":[ft["paper"]["doi"],jt["paper"]["doi"]],"body":{},"coverByteEdits":False,
    "wechatDraftModified":False,"publicSent":False}
for key,m in (("acs",ft),("jacs",jt)):
    body=[f for f in m["figures"] if f.get("body") is not False]
    chars=sum(len(p) for s in m["sections"] for p in s["paragraphs"])
    qa["body"][key]={"paragraphs":sum(len(s["paragraphs"]) for s in m["sections"]),
                     "chineseAndSymbolChars":chars,"bodyImages":len(body),
                     "widthPct":{f["id"]:f.get("display_width_pct") for f in body},
                     "sourceFigurePaths":[f["repo_path"] for f in body]}
assert qa["body"]["acs"]["bodyImages"]==14 and qa["body"]["jacs"]["bodyImages"]==10
assert qa["body"]["acs"]["chineseAndSymbolChars"]>=3200
assert qa["body"]["jacs"]["chineseAndSymbolChars"]>=3100
(OUT/"source-review-qa.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({"stage":qa["stage"],"body":{k:{"chars":x["chineseAndSymbolChars"],
  "paragraphs":x["paragraphs"],"images":x["bodyImages"]}
  for k,x in qa["body"].items()},"cloudUpdate":False},ensure_ascii=False))
