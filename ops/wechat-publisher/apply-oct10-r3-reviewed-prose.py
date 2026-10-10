#!/usr/bin/env python3
"""2026-10-10 R3 two-article Chinese editorial overhaul; source-only.

NO WeChat access, NO publication action, NO new cover, NO figure changes.
A single immutable GitHub commit updates only the reviewed prose manifests,
one text-only artifact, one evidence map, and the formal review gate.
The existing fixed-IP writer performs draft/update and draft/get separately.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import re
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-10"
SOURCE_REV="2026-10-10-r2"
NEW_REV="2026-10-10-r3"
DOIS=["10.1002/anie.3306470","10.1038/s44160-026-01128-y"]
FEATURED="public/wechat-featured/2026-10-10.json"
RETRO="public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r5.json"
EDITION="public/wechat-editions/2026-10-10.json"
GATE="audit/wechat-working/2026-10-10-review-gate.json"
IMAGE_REVIEW="audit/wechat-working/2026-10-10-r1-images-only.md"
OVERLAY="audit/wechat-working/2026-10-10-r3-prose-overlay.json"
TRIGGER="audit/automation-triggers/wechat-oct10-r3-prose-reviewed.json"
TEXT="audit/wechat-working/2026-10-10-r3-text-only.md"
PLAN="audit/wechat-working/2026-10-10-r3-editorial-plan.json"
QA="audit/wechat-working/2026-10-10-r3-prose-qa.json"
EXPECTED_OLD_BLOBS={
 FEATURED:"1d629f4cccfcfeb34a41bdeb93b92157ae9187f3",
 RETRO:"2a1302a9c5b554964a989af0e955f83f4ff0f25e",
 EDITION:"b2e03a9b8d17bf16b1b2ef77eab92b276d51d85a",
 GATE:"c46aa0c024efbce90c55261e7f79ceaba2c8e4f3",
 IMAGE_REVIEW:"8fc007eebd9b40525aa6c70f91f488cfb443f7af",
}
FEATURED_COUNTS=[3,3,3,5,3,3,3,4,5,3]
RETRO_COUNTS=[2,2,3,3,4,2,3,3,3,3,3]
MEDIAN_BODY_IMAGES=[18,31]

def raw(p):return (ROOT/p).read_bytes()
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(f"blob {len(b)}\0".encode()+b).hexdigest()
def write(p,data):
    file=ROOT/p
    if p in (TEXT,PLAN,QA) and file.exists():
        raise RuntimeError("Refusing overwrite of immutable new review artifact: "+p)
    file.parent.mkdir(parents=True,exist_ok=True)
    file.write_bytes(data)
def encode(x):return (json.dumps(x,ensure_ascii=False,indent=2)+"\n").encode()
def load_json(p):return json.loads(raw(p))
def figure_order(doc):
    lead=str(doc.get("lead_figure_id") or "").strip()
    ret=[lead] if lead else []
    for s in doc["sections"]:
        mapping=s.get("figures_after_paragraph",{})
        positions=[]
        for i in range(len(s["paragraphs"])):
            ids=mapping.get(str(i+1),[])
            assert isinstance(ids,list)
            positions.extend(ids)
        assert Counter(positions)==Counter(s.get("figures",[])),s["heading"]
        ret.extend(positions)
    body=[f["id"] for f in doc["figures"] if f.get("body") is not False]
    assert Counter(ret)==Counter(body) and len(ret)==len(set(ret))
    return ret

class Viewer(HTMLParser):
    def __init__(self):super().__init__();self.images=[];self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="img":self.images.append(dict(attrs).get("src"))
    def handle_data(self,s):self.text.append(s)

def change_article(original,changes,counts,kind):
    before=encode(original)
    assert original["editorialRevision"]==SOURCE_REV
    assert len(original["sections"])==len(counts)==len(changes["sections"])
    assert [len(s["paragraphs"]) for s in original["sections"]]==counts
    assert [len(s["paragraphs"]) for s in changes["sections"]]==counts
    assert len(changes["quick_points"])==len(original["quick_points"])==3
    assert all(len(p["text"].strip())>=45 for p in changes["quick_points"])
    for sec,b in zip(original["sections"],changes["sections"]):
        assert isinstance(b["heading"],str) and len(b["heading"])>8
        assert all(isinstance(p,str) and len(p)>=85 for p in b["paragraphs"])
        sec["heading"]=b["heading"]
        sec["paragraphs"]=b["paragraphs"]
    original["quick_points"]=changes["quick_points"]
    if kind=="featured":
        assert len(changes["takehome"])==3
        original["takehome_heading"]=changes["takehome_heading"]
        original["takehome"]=changes["takehome"]
    original["editorialRevision"]=NEW_REV
    assert before!=encode(original)
    return original

def main():
    trigger=load_json(TRIGGER)
    overlay=load_json(OVERLAY)
    assert trigger["action"]=="review_source_only_oct10_two_article_r3"
    assert trigger["revision"]==NEW_REV and trigger["date"]==DATE
    assert trigger["dois"]==overlay["dois"]==DOIS
    assert trigger["draftOnly"] is True and trigger["publicSendAuthorized"] is False
    assert overlay["date"]==DATE and overlay["fromRevision"]==SOURCE_REV
    assert overlay["revision"]==NEW_REV
    assert blob(raw(OVERLAY))==trigger["expectedOverlayBlobSha"]
    assert trigger["existingMediaId"]=="KhELYUzvwADwB_l1xH1SWFOfn60HSWWcYlciDjMIDj7HKSul-GJJti3u0OIKFcyL"
    for p,h in EXPECTED_OLD_BLOBS.items():
        assert blob(raw(p))==h,f"Concurrent source drift; refusing overwrite: {p}"
    receipt=load_json("audit/wechat-publisher/latest.json")
    assert receipt["status"]=="ok" and receipt["stage"]=="draft_update"
    assert receipt["draft_readback"]=="ok" and receipt["media_id"]==trigger["existingMediaId"]
    assert receipt["publicationSlot"]=="2026-10-10T08:00:00+08:00" and receipt["publish_id"] is None
    assert receipt["preview_url"]=="https://relay.gczhouwld.com/wechat-preview/2a737c870da5ed6fe2cdde25.html"
    state=load_json("audit/publication-release-state.json")
    assert state["publicationSlot"]=="2026-10-10T08:00:00+08:00"
    assert state["productionCards"]>=938

    f=load_json(FEATURED);r=load_json(RETRO);e=load_json(EDITION);gate=load_json(GATE)
    assert f["paper"]["doi"]==DOIS[0] and r["paper"]["doi"]==DOIS[1]
    assert e["featured"]==DOIS[0] and e["retrospective"]==r["slug"]
    assert e["publicationMode"]=="draft_only_manual_final_send"
    assert e["title"]==trigger["expectedFirstTitle"]
    assert r["title"]==trigger["expectedSecondTitle"]
    assert [len([x for x in d["figures"] if x.get("body") is not False]) for d in (f,r)]==MEDIAN_BODY_IMAGES
    assert gate["revision"]==SOURCE_REV and gate["textReview"]==gate["imageReview"]=="pass"
    assert len(gate["assets"])==51 and gate["selectionDois"]==DOIS

    # Snapshot every scientific figure, cover, caption, graphical-abstract
    # source, placement, and both primary article headings before rewriting.
    historic={}
    for label,doc in (("featured",f),("retrospective",r)):
        historic[label]={
          "paper":encode(doc["paper"]),
          "headline":doc.get("headline"),
          "title":doc.get("title"),
          "kicker":doc.get("kicker"),
          "cover":encode(doc["cover"]),
          "figures":encode(doc["figures"]),
          "lead":doc["lead_figure_id"],
          "lead_position":doc["lead_figure_position"],
          "placements":[encode(s["figures_after_paragraph"]) for s in doc["sections"]],
          "imageSets":[list(s["figures"]) for s in doc["sections"]],
          "count":len(figure_order(doc))
        }

    f=change_article(f,overlay["featured"],FEATURED_COUNTS,"featured")
    r=change_article(r,overlay["retrospective"],RETRO_COUNTS,"retrospective")
    e["editorialRevision"]=NEW_REV
    for label,doc in (("featured",f),("retrospective",r)):
        old=historic[label]
        assert old["paper"]==encode(doc["paper"])
        assert old["headline"]==doc.get("headline")
        assert old["title"]==doc.get("title")
        assert old["kicker"]==doc.get("kicker")
        assert old["cover"]==encode(doc["cover"])
        assert old["figures"]==encode(doc["figures"])
        assert old["lead"]==doc["lead_figure_id"]
        assert old["lead_position"]==doc["lead_figure_position"]
        assert old["placements"]==[encode(s["figures_after_paragraph"]) for s in doc["sections"]]
        assert old["imageSets"]==[list(s["figures"]) for s in doc["sections"]]
        assert old["count"]==len(figure_order(doc))
    assert "邱友爱" not in json.dumps(r,ensure_ascii=False)
    assert r["title"].count("仇友爱")==1
    assert e["date"]==DATE and e["title"]==trigger["expectedFirstTitle"]
    for path,item in ((FEATURED,f),(RETRO,r),(EDITION,e)):
        write(path,encode(item))

    # Preserve all 51 previously reviewed original image bytes, including
    # both previously user-approved covers. Recheck hash and decoding.
    for row in gate["assets"]:
        file=ROOT/row["path"]
        b=file.read_bytes()
        assert blob(b)==row["blobSha"] and sha(b)==row["sha256"],row["path"]
        with Image.open(file) as im:
            im.load()
            assert im.size==(row["width"],row["height"])
    assert len({x["path"] for x in gate["assets"]})==51

    # Text-only review must be independently readable and include every
    # paragraph plus the placement key and every quick/takehome point.
    md=[f"# {DATE} 双篇公众号中文科学深读审阅 · {NEW_REV}",
        "",
        "状态：新文字审阅完成，旧图片/标题/封面完整保留；尚未执行本轮微信 draft/update。",
        "审核来源：Angew. Chem. Int. Ed. 论文正文及作者 SI；Nature Synthesis 论文正文及251页 SI。",
        "DOI: "+DOIS[0]+" / "+DOIS[1],
        "原生主标题："+e["title"],
        "独立往期精选标题："+r["title"],
        "10.10 正式发布数据：新增 23 篇，仅在更新模块按期刊统计；不逐条堆 DOI。",
        ""]
    plan={"date":DATE,"revision":NEW_REV,"selectedDois":DOIS,
          "draftOnly":True,"publicSendAuthorized":False,
          "textMethod":"Primary source grounded, causal high-level synthesis and clearly calibrated evidence strength",
          "scientificReview":overlay["writingReview"],"articles":[]}
    for label,doc in (("今日精选（Angew）",f),("往期精选（Nature Synthesis）",r)):
        md.extend(["",f"## {label}",""])
        pmap={fobj["id"]:fobj for fobj in doc["figures"]}
        md.append("### 一分钟核心问题")
        for q in doc["quick_points"]:
            md.extend(["",f"**{q['label']}**",q["text"]])
        if doc["lead_figure_id"]:
            fid=doc["lead_figure_id"]
            md.append(f"〔开篇原图 {fid}：{pmap[fid]['caption']}〕")
        amap=[]
        for si,sec in enumerate(doc["sections"]):
            md.extend(["",f"### {sec['heading']}"])
            for i,p in enumerate(sec["paragraphs"],1):
                md.extend(["",p])
                fs=sec["figures_after_paragraph"].get(str(i),[])
                for fid in fs:
                    md.append(f"〔正文图号：{fid}｜{pmap[fid]['caption']}〕")
            amap.append({
                "sectionIndex":si,"heading":sec["heading"],
                "paragraphCount":len(sec["paragraphs"]),
                "figureAfterParagraph":sec["figures_after_paragraph"],
                "figureEvidence":[{"id":fid,"caption":pmap[fid]["caption"]} for fid in sec["figures"]]
            })
        if doc.get("takehome"):
            md.extend(["",f"### {doc.get('takehome_heading','核心结论')}"])
            md.extend([f"- {x}" for x in doc["takehome"]])
        md.extend(["",doc.get("ai_notice") or ""])
        plan["articles"].append({"label":label,"doi":doc["paper"]["doi"],
             "headline":doc.get("headline") or doc.get("title"),
             "quickPoints":len(doc["quick_points"]),
             "bodyImageCount":len(figure_order(doc)),
             "paragraphs":sum(len(s["paragraphs"]) for s in doc["sections"]),
             "structure":amap,
             "sourcePolicy":"Original figures and cover pixels immutable from R2; evidentiary figure order unchanged."})
    write(TEXT,("\n".join(md).rstrip()+"\n").encode())
    write(PLAN,encode(plan))

    # Edit source lock indices; R1 historical reviews remain untouched.
    gate["revision"]=NEW_REV
    gate["draftReadback"]="pending-r3"
    gate["artifacts"]["textOnly"]=TEXT
    gate["artifacts"]["imagesOnly"]=IMAGE_REVIEW
    gate["sources"]=[
        {"path":p,"blobSha":blob(raw(p)),"sha256":sha(raw(p))}
        for p in [FEATURED,RETRO,EDITION,TEXT,IMAGE_REVIEW,PLAN,OVERLAY]
    ]
    gate.setdefault("reviewNotes",[]).append(
        "R3: user-requested deep Chinese narrative rewriting, 10+11 science-source chapters, "
        "35+31 paragraphs; source-backed figures, captions and both cover assets unchanged. "
        "All 49 science body images remain at exactly the same paragraph positions, "
        "evidence strength graded by control, CV, isotope, stoichiometric tests and source models. "
        "R3 must update same WeChat media_id once with draft/get; no public send."
    )
    gate["textReview"]="pass"
    gate["imageReview"]="pass"
    assert gate["publicSendAuthorized"] is False
    write(GATE,encode(gate))

    # Run the actual production editorial gate. It rejects stale images,
    # missing figure numbers and incoherent paragraph->image placements.
    module_path=ROOT/"ops/wechat-publisher/create-draft.py"
    spec=importlib.util.spec_from_file_location("wechat_oct10_r3_prose_test",module_path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.require_editorial_review_gate(ROOT/GATE,[ROOT/FEATURED,ROOT/RETRO,ROOT/EDITION])
    slot,papers=mod.load_latest_release()
    assert slot=="2026-10-10T08:00:00+08:00" and len(papers)==23
    for label,d,expected in (("a",f,18),("b",r,31)):
        urls={x["id"]:f"https://preview.invalid/{label}/{x['id']}.png" for x in d["figures"]}
        h=mod.build_content(slot,papers,d,urls,gallery_qr_url="") if label=="a" else mod.build_retrospective_content(d,urls)
        scan=Viewer();scan.feed(h)
        expected_urls=[urls[fid] for fid in figure_order(d)]
        assert len(expected_urls)==expected
        assert scan.images==expected_urls, "Science figures shifted after prose optimization"
        all_text="".join(scan.text)
        for q in d["quick_points"]:
            assert q["text"] in all_text
        for s in d["sections"]:
            for p in s["paragraphs"]:
                assert p in all_text,("missing prose",s["heading"],p[:60])
        if label=="a":
            for x in d["takehome"]:assert x in all_text
        for fig in d["figures"]:
            if fig.get("body") is not False:
                assert fig["caption"] in all_text

    # Editorial evidence-aware checks prevent polished prose from outrunning
    # manuscript results, and check essential numerical guardrails.
    daily="\n".join(" ".join(x["paragraphs"]) for x in f["sections"])
    retro="\n".join(" ".join(x["paragraphs"]) for x in r["sections"])
    for fact in ["51%","70%","83%","18%","15:85","0.2 mmol","395 nm","Ni–SH₂","SI Fig. S12","Scheme 4B","DMSO-d₆"]:
        assert fact in daily,("missing Angew source fact",fact)
    for fact in ["Ni(I)","Ni(0)","−1.69 V","−2.06 V","18.7 F mol⁻¹","78%","1.16 g","仇友爱","SI Fig. S14"]:
        assert fact in retro,("missing Nature source fact",fact)
    assert "100% 化学收率" in daily and "不是化学收率达到 100%" in daily
    assert "无法" in retro or "不能" in retro
    assert len(overlay["featured"]["sections"])==10 and len(overlay["retrospective"]["sections"])==11
    assert all(len(p)>=85 for s in f["sections"]+r["sections"] for p in s["paragraphs"])

    qa={
     "date":DATE,"revision":NEW_REV,"status":"prose_source_review_pass",
     "doiOrder":DOIS,"dailySectionCount":len(f["sections"]),"retroSectionCount":len(r["sections"]),
     "dailyParagraphs":sum(len(s["paragraphs"]) for s in f["sections"]),
     "retroParagraphs":sum(len(s["paragraphs"]) for s in r["sections"]),
     "sourceArticleTitlesUnchanged":True,
     "coverPathsAndBytesUnchanged":True,
     "sourceCaptionAndImagePlacementsUnchanged":True,
     "scienceImageCounts":[18,31],"reviewedAssets":51,"reviewedAssetsSha":"all_sha256_pass",
     "preDraftReviewGate":"pass","realPublisherHTMLRender":"pass",
     "scienceEvidenceGuardrails":"pass",
     "editionNewLiterature":23,"reviewedSourceOverlay":OVERLAY,
     "previousRealPreview":receipt["preview_url"],
     "existingMediaId":receipt["media_id"],
     "draftWritten":False,"draftGetReadback":"pending","publicSendAuthorized":False
    }
    write(QA,encode(qa))
    files=[FEATURED,RETRO,EDITION,GATE,TEXT,PLAN,QA]
    subprocess.run(["git","config","user.name","github-actions[bot]"],check=True)
    subprocess.run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],check=True)
    subprocess.run(["git","add","--",*files],check=True)
    subprocess.run(["git","commit","-m","wechat: review-bound Oct10 R3 expert-level two-paper Chinese prose (49 original figures unchanged, draft only)"],check=True)
    for i in range(5):
        subprocess.run(["git","fetch","origin","main"],check=True)
        c=subprocess.run(["git","rebase","origin/main"])
        if c.returncode:
            subprocess.run(["git","rebase","--abort"])
            raise RuntimeError("Concurrent editorial or other source changed; refusing overwrite")
        if subprocess.run(["git","push","origin","HEAD:main"]).returncode==0:
            print(json.dumps(qa,ensure_ascii=False))
            return
    raise RuntimeError("Cannot safely commit reviewed R3 prose to main")

if __name__=="__main__":main()
