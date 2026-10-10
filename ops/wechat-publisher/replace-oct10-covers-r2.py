#!/usr/bin/env python3
"""Replace ONLY two Oct 10 reviewed WeChat cover rasters in the same draft.

- Fixed exact user-selected retrospective image bytes (no transformation).
- Enlarged original Angew Scheme 1B PDF crop; body science images untouched.
- Source edit & full strict review gate only: absolutely no WeChat writes here.
- Final WeChat draft/update and draft/get use the separate fixed-IP publisher.
"""
from __future__ import annotations

import hashlib, importlib.util, io, json, re, subprocess, urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-10"
OLD_REV="2026-10-10-r1"
NEW_REV="2026-10-10-r2"
DA="10.1002/anie.3306470"
DR="10.1038/s44160-026-01128-y"
FEATURED="public/wechat-featured/2026-10-10.json"
RETRO="public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r5.json"
EDITION="public/wechat-editions/2026-10-10.json"
GATE="audit/wechat-working/2026-10-10-review-gate.json"
IMAGES="audit/wechat-working/2026-10-10-r1-images-only.md"
QA="audit/wechat-working/2026-10-10-r2-cover-review-and-qa.json"
TRIGGER="audit/automation-triggers/wechat-oct10-two-covers-r2.json"
OLD_DAILY="public/wechat-assets/reviewed/2026-10-10-anie3306470-r1/anie3306470-toc-source-authentic-title-safe.png"
OLD_RETRO="public/wechat-assets/reviewed/2026-10-10-qiu-alcohols/nature-synthesis-author-name-corrected-r5.png"
NEW_DAILY="public/wechat-assets/reviewed/2026-10-10-r2/anie3306470-original-scheme1b-enlarged-title-safe.png"
NEW_RETRO="public/wechat-assets/reviewed/2026-10-10-r2/nature-synthesis-user-selected-exact-square.png"
SOURCE_OLD={
    FEATURED:"7df97bc95d311bec1c278f69b275df742c3750b6",
    RETRO:"5ed7fadfcbc7b5eb02cfc5602ac11bc5d3dfde37",
    EDITION:"cc54817bd580088e682c5ec5f22924d36a01c07b",
    GATE:"119c5927a8a87962575bd99ba60ff21c03078ab6",
    IMAGES:"3dcb028e038bdc6b2dd88fc6c2445e769c97f742",
}

def read(path):return (ROOT/path).read_bytes()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def blob(raw):return hashlib.sha1(f"blob {len(raw)}\0".encode()+raw).hexdigest()
def jwrite(p,j):
    path=ROOT/p
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(j,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
def new_asset(row,expected_size):
    url=row["url"]
    assert re.fullmatch(r"https://at\.adobe\.com/[A-Za-z0-9]+",url)
    assert re.fullmatch(r"[0-9a-f]{64}",row["sha256"])
    with urllib.request.urlopen(url,timeout=55) as response:
        payload=response.read(4_000_001)
    assert len(payload)<4_000_000 and sha(payload)==row["sha256"], "Changed Adobe cover"
    with Image.open(io.BytesIO(payload)) as image:
        image.load()
        assert image.format=="PNG" and image.size==expected_size
    return payload
class Reader(HTMLParser):
    def __init__(self):super().__init__();self.images=[];self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="img":self.images.append(dict(attrs).get("src"))
    def handle_data(self,text):self.text.append(text)

def full_order(article):
    order=[article.get("lead_figure_id")] if article.get("lead_figure_id") else []
    for s in article["sections"]:
        ids=[]
        pos=s.get("figures_after_paragraph") or {}
        for i in range(1,len(s["paragraphs"])+1):
            ids.extend(pos.get(str(i),[]))
        assert Counter(ids)==Counter(s.get("figures",[])),s.get("heading")
        order.extend(ids)
    correct=[f["id"] for f in article["figures"] if f.get("body") is not False]
    assert Counter(order)==Counter(correct) and len(order)==len(set(order))
    return order

def main():
    request=json.loads(read(TRIGGER))
    assert request["action"]=="replace_oct10_two_reviewed_covers_only"
    assert request["fromRevision"]==OLD_REV and request["toRevision"]==NEW_REV
    assert request["dois"]==[DA,DR]
    assert request["draftOnly"] is True and request["publicSendAuthorized"] is False
    for path,old_blob in SOURCE_OLD.items():
        assert blob(read(path))==old_blob, "Source drift: "+path

    prev=json.loads(read("audit/wechat-publisher/latest.json"))
    assert prev["status"]=="ok" and prev["draft_readback"]=="ok"
    assert prev["publicationSlot"]=="2026-10-10T08:00:00+08:00"
    assert prev["media_id"]==request["existingMediaId"]
    assert not prev.get("publish_id")
    f=json.loads(read(FEATURED));r=json.loads(read(RETRO));e=json.loads(read(EDITION));gate=json.loads(read(GATE))
    assert f["editorialRevision"]==r["editorialRevision"]==e["editorialRevision"]==gate["revision"]==OLD_REV
    assert f["paper"]["doi"]==DA and r["paper"]["doi"]==DR and e["featured"]==DA
    assert e["retrospective"]==r["slug"]
    assert e["title"]==request["expectedFirstTitle"]
    assert r["title"]==request["expectedSecondTitle"]
    assert gate["textReview"]==gate["imageReview"]=="pass"
    assert len(gate["assets"])==51
    assert gate["selectionDois"]==[DA,DR]

    old_f=[(x["id"],x["repo_path"],x.get("caption")) for x in f["figures"] if x.get("body") is not False]
    old_r=[(x["id"],x["repo_path"],x.get("caption")) for x in r["figures"] if x.get("body") is not False]
    assert len(old_f)==18 and len(old_r)==31
    daily_cover=next(x for x in f["figures"] if x["id"]=="fcover")
    retro_cover=next(x for x in r["figures"] if x["id"]=="retro-cover")
    assert daily_cover["repo_path"]==OLD_DAILY and retro_cover["repo_path"]==OLD_RETRO
    assert daily_cover.get("body") is False and retro_cover.get("body") is False

    daily_png=new_asset(request["images"]["daily"],(1880,800))
    retro_png=new_asset(request["images"]["retrospective"],(1254,1254))
    original_daily=next(x for x in gate["assets"] if x["path"]==OLD_DAILY)
    original_retro=next(x for x in gate["assets"] if x["path"]==OLD_RETRO)
    assert original_daily["sha256"]==request["originalCoverSha256"]["daily"]
    assert original_retro["sha256"]==request["originalCoverSha256"]["retrospective"]
    # User specified the exact image, never recreate it or modify its pixels.
    target_digest=request["images"]["retrospective"]["sha256"]
    assert sha(retro_png)==target_digest
    for path,data in ((NEW_DAILY,daily_png),(NEW_RETRO,retro_png)):
        dst=ROOT/path
        assert not dst.exists(), "Refusing to overwrite another cover: "+path
        dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_bytes(data)

    # Main cover geometry validation: pure source figure ends before navy title band.
    with Image.open(io.BytesIO(daily_png)) as image:
        image.load()
        # Source scheme remains within x442..1438 / y7..507; no part crosses y515.
        assert image.getpixel((30,20))==(255,255,255)
        assert image.getpixel((30,510))==(255,255,255)
        assert image.getpixel((30,515))==(23,53,75)
        assert image.getpixel((940,780))==(23,53,75)
    daily_cover["repo_path"]=NEW_DAILY
    daily_cover["source_adjustment"]=(
        "2026-10-10 R2: from the unchanged original Angew PDF p.2 Scheme 1B, "
        "fitz clip x72..544 y258..495 at 3x, intact chemistry uniformly "
        "downsampled to 996×500 at x442 y7, navy title backing starts y515; "
        "no molecular redrawing or baked headline. Main 2.35:1 crop prioritized."
    )
    f["cover"]["description"]=(
        "Enlarged source-authentic Angew Scheme 1B, approximately +28% in displayed width, "
        "on white field ending before navy native-title band. No title image overlay; "
        "portrait mobile square is secondary to the primary full-width first article."
    )

    retro_cover["repo_path"]=NEW_RETRO
    retro_cover["source_kind"]="user_selected_exact_unmodified_cover_png"
    retro_cover["source_adjustment"]=(
        "Byte-for-byte identical 1254x1254 image explicitly supplied by owner "
        "in the Oct10 conversation, no recomposition/redrawing/resizing. "
        "Bottom author label: 仇友爱等 · 2026."
    )
    r["cover"]["description"]=(
        "Exact owner-selected dark-blue Nature Synthesis conceptual PNG with "
        "electrodes, multiple structures and Chinese 仇友爱 author credit. "
        "Shown unmodified as the square second-article thumbnail."
    )
    f["editorialRevision"]=r["editorialRevision"]=e["editorialRevision"]=NEW_REV
    assert old_f==[(x["id"],x["repo_path"],x.get("caption")) for x in f["figures"] if x.get("body") is not False]
    assert old_r==[(x["id"],x["repo_path"],x.get("caption")) for x in r["figures"] if x.get("body") is not False]
    assert "邱友爱" not in json.dumps(r,ensure_ascii=False)
    for path,obj in ((FEATURED,f),(RETRO,r),(EDITION,e)):
        jwrite(path,obj)

    md=read(IMAGES).decode("utf8")
    assert OLD_DAILY in md and OLD_RETRO in md
    md=md.replace(OLD_DAILY,NEW_DAILY).replace(OLD_RETRO,NEW_RETRO)
    # All scientific main and SI figure descriptions remain intact.
    md += ("\n\n## 10.10 R2 仅封面资产修正（正文图片与科学描述原样保留）\n"
           f"- 今日精选：原文 Scheme 1B 无损完整图重新等比例显示，放大且不进入标题底色区。SHA256：{sha(daily_png)}\n"
           f"- 往期精选：作者指定封面原字节替换，不使用任何图像模型重绘。SHA256：{sha(retro_png)}\n"
           "- 18+31 张正文原始科学图及正文段落全部未改。\n")
    (ROOT/IMAGES).write_text(md,encoding="utf8")

    for target,raw,w,h in ((original_daily,daily_png,1880,800),(original_retro,retro_png,1254,1254)):
        target["path"]=NEW_DAILY if raw is daily_png else NEW_RETRO
        target["blobSha"]=blob(raw);target["sha256"]=sha(raw)
        target["width"]=w;target["height"]=h
    for source in gate["sources"]:
        path=source["path"]
        data=read(path)
        source["blobSha"]=blob(data);source["sha256"]=sha(data)
    gate["revision"]=NEW_REV
    gate["draftReadback"]="pending-R2"
    gate.setdefault("reviewNotes",[]).append(
        "R2 cover-only: full title unchanged; first cover PDF source Scheme1B enlarged "
        "996x500 safely above y515 native title band; second cover EXACT user-selected "
        "1254 square bytes; the 49 science body figures and article text unchanged. "
        "One same-media draft/update and draft/get required, publicSendAuthorized=false."
    )
    jwrite(GATE,gate)

    # Independently run the same publisher's PRE-DRAFT review and render checks.
    pub=ROOT/"ops/wechat-publisher/create-draft.py"
    spec=importlib.util.spec_from_file_location("wechat_oct10_r2_draft_check",pub)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.require_editorial_review_gate(ROOT/GATE,[ROOT/FEATURED,ROOT/RETRO,ROOT/EDITION])
    slot,papers=mod.load_latest_release()
    assert slot=="2026-10-10T08:00:00+08:00" and len(papers)==23
    for article,expected_count,renderer in ((f,18,"daily"),(r,31,"retro")):
        urls={x["id"]:"https://verified.invalid/"+renderer+"/"+x["id"]+".png" for x in article["figures"]}
        if renderer=="daily":
            h=mod.build_content(slot,papers,article,urls,gallery_qr_url="")
        else:
            h=mod.build_retrospective_content(article,urls)
        parsed=Reader();parsed.feed(h)
        expected=full_order(article)
        assert len(expected)==expected_count
        assert parsed.images==[urls[x] for x in expected],"Paragraph-image positions moved"
        readable="".join(parsed.text)
        for section in article["sections"]:
            for paragraph in section["paragraphs"]:
                assert paragraph in readable
    # Exact hash/size for ALL unchanged science assets and two new covers.
    for row in gate["sources"]+gate["assets"]:
        data=read(row["path"])
        assert blob(data)==row["blobSha"] and sha(data)==row["sha256"],row["path"]
        if row in gate["assets"]:
            with Image.open(io.BytesIO(data)) as im:
                im.load()
                assert im.size==(row["width"],row["height"])
    assert len(gate["assets"])==51
    assert len(set(x["path"] for x in gate["assets"]))==51

    qa={
        "date":DATE,"revision":NEW_REV,"status":"review_pass","draftWritten":False,
        "draftGetReadback":"not_run","publicSendAuthorized":False,
        "existingDraftMediaId":prev["media_id"],"originalPreview":prev["preview_url"],
        "selectedDois":[DA,DR],"dailyTitleUnchanged":True,"retroTitleUnchanged":True,
        "dailyCover":{"path":NEW_DAILY,"sha256":sha(daily_png),"size":[1880,800],
            "source":"Angew p2 Scheme1B original PDF crop, no redrawn chemistry",
            "artBounds":[442,7,1438,507],"navyTitleAreaStartsAtY":515},
        "retrospectiveCover":{"path":NEW_RETRO,"sha256":sha(retro_png),
            "size":[1254,1254],"exactUserSubmittedBytes":True},
        "unchangedBodyImageCounts":[18,31],"originalSourceImageBytesPreserved":True,
        "sourceReview":"pass","publisherReviewGate":"pass",
        "articleRendererAndParagraphImageMap":"pass","all51RasterHashes":"pass"
    }
    jwrite(QA,qa)

    subprocess.run(["git","config","user.name","github-actions[bot]"],check=True)
    subprocess.run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],check=True)
    changes=[NEW_DAILY,NEW_RETRO,FEATURED,RETRO,EDITION,IMAGES,GATE,QA]
    subprocess.run(["git","add","--",*changes],check=True)
    subprocess.run(["git","commit","-m","wechat: replace Oct10 same-draft featured and retrospective covers with source-reviewed R2 images (no send)"],check=True)
    for attempt in range(5):
        subprocess.run(["git","fetch","origin","main"],check=True)
        p=subprocess.run(["git","rebase","origin/main"])
        if p.returncode!=0:
            subprocess.run(["git","rebase","--abort"],check=False)
            raise RuntimeError("Concurrent publisher/editorial change: refusing to clobber")
        if subprocess.run(["git","push","origin","HEAD:main"]).returncode==0:
            print(json.dumps(qa,ensure_ascii=False));return
    raise RuntimeError("Cannot push updated sources without overwriting concurrent changes")

if __name__=="__main__":main()
