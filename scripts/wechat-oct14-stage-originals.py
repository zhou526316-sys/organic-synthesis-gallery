#!/usr/bin/env python3
"""One-time controlled transfer of uploader-owned JACS original PDF-derived rasters."""
import hashlib, io, json, os, pathlib, urllib.request, zipfile
ROOT=pathlib.Path.cwd()
URL=os.environ["OCT14_IMAGE_TRANSFER_URL"]
r=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0","Accept":"application/zip"})
with urllib.request.urlopen(r,timeout=45) as rsp:
    payload=rsp.read(10_000_000)
assert payload[:2]==b"PK", "Source transfer is not an original ZIP"
archive=zipfile.ZipFile(io.BytesIO(payload))
all_names=archive.namelist()
fig_entries=[x for x in all_names if "/figures/" in x and x.endswith(".png")]
assert len(fig_entries)==27, ("Expected 25 original paper/SI figures and 2 source covers",len(fig_entries))
review_path=next(x for x in all_names if x.endswith("/review/完整配图来源与哈希验收.json"))
meta=json.loads(archive.read(review_path).decode("utf8"))
assert len(meta)==25
indexed={x["filename"]:x for x in meta}
assert len(indexed)==25
for item in fig_entries:
    name=pathlib.PurePosixPath(item).name
    data=archive.read(item)
    assert data[:8]==bytes.fromhex("89504e470d0a1a0a"), ("Not genuine PNG",name)
    if name in indexed:
        m=indexed[name]
        assert hashlib.sha256(data).hexdigest()==m["sha256"], "source SHA mismatch: "+name
        assert len(data)==m["bytes"], "source length mismatch: "+name
    else:
        assert name in ("cover_featured.png","cover_retrospective.png"), ("Unreviewed extra file",name)
    dest=ROOT/"public/wechat-assets/reviewed/2026-10-14-r1"/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(data)
out=ROOT/"audit/wechat-working"
out.mkdir(parents=True,exist_ok=True)
for source,dest in [
 ("today_figure_map.json","2026-10-14-r1-today-figure-map.json"),
 ("retro_figure_map.json","2026-10-14-r1-retro-figure-map.json"),
 ("完整配图来源与哈希验收.json","2026-10-14-r1-original-figure-sha-review.json"),
 ("今日精选_铁氢迁移氢胺化_独立文字稿.md","2026-10-14-r1-today-text-only.md"),
 ("往期精选_IDPi香叶基阳离子环化_独立文字稿.md","2026-10-14-r1-retrospective-text-only.md"),
 ("科学事实与图文验收.md","2026-10-14-r1-evidence-review.md"),
 ("mobile_qa.json","2026-10-14-r1-local-mobile-qa.json")
]:
    entry=next(x for x in all_names if x.endswith("/review/"+source))
    (out/dest).write_bytes(archive.read(entry))
summary={"originalImages":len(fig_entries),"userSource":"four PDFs","scienceGraphics":len(indexed),
 "coverSHA256":{n:hashlib.sha256((ROOT/"public/wechat-assets/reviewed/2026-10-14-r1"/n).read_bytes()).hexdigest() for n in ("cover_featured.png","cover_retrospective.png")},
 "status":"original_source_bytes_staged_unchanged",
 "note":"Source archived HTML still contains pre-correction 24; it must NEVER be used in the Oct14 WeChat draft. Current journal counts must be revised to 20."
}
(out/"2026-10-14-r1-original-assets-transfer-report.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(summary,ensure_ascii=False))
