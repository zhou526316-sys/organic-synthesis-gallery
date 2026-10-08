#!/usr/bin/env python3
"""2026-10-08 R8: restore full native WeChat title, preserving verified R7 cover.

Editorial source/review update ONLY. No WeChat API calls, no final send.
"""
from __future__ import annotations
import hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-08"
PRIOR="2026-10-08-r7"
REV="2026-10-08-r8"
FULL_TITLE=("有机合成文献日报｜10.08｜今日精选｜JACS："
    "α-氯代烷基硼酸酯与偕二硼烷的立体选择性1,2-迁移重排")
PAPER_TITLE="α-氯代烷基硼酸酯与偕二硼烷的立体选择性1,2-迁移重排"
DOI="10.1021/jacs.6c14748"
FEATURED="public/wechat-featured/2026-10-08.json"
EDITION="public/wechat-editions/2026-10-08.json"
RETROSPECTIVE="public/wechat-retrospective/os1-multicentred-sulfur-20261008.json"
GATE="audit/wechat-working/2026-10-08-review-gate.json"
TEXT_OLD="audit/wechat-working/2026-10-08-r7-text-only.md"
IMAGES_OLD="audit/wechat-working/2026-10-08-r7-images-only.md"
TEXT_NEW="audit/wechat-working/2026-10-08-r8-text-only.md"
IMAGES_NEW="audit/wechat-working/2026-10-08-r8-images-only.md"
REVIEW="audit/wechat-working/2026-10-08-r8-native-title-qa.json"
COVER="public/wechat-assets/reviewed/2026-10-08-r7/jacs-cover-toc-large-no-label.png"

# Verify exact R7 inputs; fail closed on another editor's concurrent revision.
EXPECTED={
 FEATURED:"7d6e3599e216e309793f80c05ceec0db8ea7c161",
 EDITION:"04c39e98038e7046fcf8cf4bbbb8f922af15257f",
 GATE:"f3a43ad97f2478a593d2f244664f26efc32e0af6",
 TEXT_OLD:"1111af483e4739d035a979abda98d34fec84e6ba",
 IMAGES_OLD:"9ac5a21579df08bea6e14d0fdee2773eba5d172d",
}
def read(path):
    return (ROOT/path).read_bytes()
def sha(b):
    return hashlib.sha256(b).hexdigest()
def blob(b):
    return hashlib.sha1(f"blob {len(b)}\0".encode()+b).hexdigest()
def write_json(path,data):
    p=ROOT/path
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def write_text(path,data):
    p=ROOT/path
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(data,encoding="utf-8")
def check_source_lock():
    for path,want in EXPECTED.items():
        got=blob(read(path))
        assert got==want,f"Concurrent source change {path}: {got}"
    assert blob(read(COVER))=="1c70bbe1748c6d73d5bf3f2c423517626b1612a3", \
        "Original reviewed enlarged TOC changed"
    assert blob(read(RETROSPECTIVE))=="873139bcb57b260f1d0fe19d1b344191ede5755b", \
        "Retrospective unexpectedly changed"

def main():
    check_source_lock()
    before_feat=json.loads(read(FEATURED))
    before_ed=json.loads(read(EDITION))
    before_gate=json.loads(read(GATE))
    assert before_feat["paper"]["doi"]==DOI
    assert before_feat["headline"]==PAPER_TITLE
    assert before_ed["title"]==PAPER_TITLE
    assert before_ed["featured"]==DOI
    assert before_ed["retrospective"]=="os1-multicentred-sulfur-20261008"
    assert before_ed["publicationMode"]=="draft_only_manual_final_send"
    assert before_feat["editorialRevision"]==before_ed["editorialRevision"]==PRIOR
    assert before_gate["revision"]==PRIOR
    assert before_gate["textReview"]==before_gate["imageReview"]=="pass"
    assert before_gate["selectionDois"]==[DOI,"10.1038/s41929-026-01602-y"]
    assert len(before_gate["assets"])==34 and len(before_gate["sources"])==5

    feat=json.loads(read(FEATURED))
    cover=[f for f in feat["figures"] if f.get("id")=="jacs-cover"]
    assert len(cover)==1 and cover[0]["repo_path"]==COVER and cover[0]["body"] is False
    figure_paths=[(f["id"],f["repo_path"]) for f in feat["figures"]]
    feat["editorialRevision"]=REV
    feat["cover"]["description"]=(
      "Source-verified original JACS TOC enlarged, without upper header. "
      "The native WeChat news title has been restored to the complete "
      "有机合成文献日报｜10.08｜今日精选｜JACS：中文论文标题, while the "
      "authentic chemistry and solid navy native-title backing remain "
      "byte-identical to approved R7."
    )
    assert figure_paths==[(f["id"],f["repo_path"]) for f in feat["figures"]], \
        "No paper figure/cover modification permitted"
    write_json(FEATURED,feat)

    ed=json.loads(read(EDITION))
    ed["title"]=FULL_TITLE
    ed["editorialRevision"]=REV
    assert ed["retrospective"]==before_ed["retrospective"] \
       and ed["featured"]==before_ed["featured"] \
       and ed["digest"]==before_ed["digest"]
    write_json(EDITION,ed)

    source_text=read(TEXT_OLD).decode("utf-8")
    prior_heading="公众号首篇原生标题："+PAPER_TITLE
    assert prior_heading in source_text
    source_text=source_text.replace(
      "# 2026-10-08 Bundle — Text-only reviewed source (R7)",
      "# 2026-10-08 Bundle — Text-only reviewed source (R8)",1)
    source_text=source_text.replace(prior_heading,"公众号首篇原生标题："+FULL_TITLE,1)
    assert "封面顶部已有“今日精选·JACS”；原生标题不得重复栏目名。" in source_text
    source_text=source_text.replace(
      "封面顶部已有“今日精选·JACS”；原生标题不得重复栏目名。",
      "封面顶部已删除“今日精选·JACS”栏目字样，因此公众号原生标题应完整包含“有机合成文献日报｜10.08｜今日精选｜JACS：”，再接论文中文题目。"
    )
    assert source_text.count("公众号首篇原生标题：")==1
    write_text(TEXT_NEW,source_text)

    # All figure/cover assets and captions remain unchanged.
    source_imgs=read(IMAGES_OLD).decode("utf-8")
    assert COVER in source_imgs
    updated_imgs=source_imgs.replace(
      "# 2026-10-08 Bundle — Images-only reviewed sources",
      "# 2026-10-08 Bundle — Images-only reviewed sources (R8, exact R7 assets)",1)
    updated_imgs+=(
      "\nR8封面审核：图像字节与R7完全相同，顶部无栏目文字，"
      "原始TOC为760×460；原生完整标题在微信图文元数据中恢复，"
      "不往封面图片重新绘字；第二篇封面、32张正文图片和顺序不变。\n")
    write_text(IMAGES_NEW,updated_imgs)

    gate=json.loads(read(GATE))
    gate["revision"]=REV
    gate["artifacts"]={"textOnly":TEXT_NEW,"imagesOnly":IMAGES_NEW}
    gate["sources"]=[v for v in gate["sources"] if v["path"] not in {TEXT_OLD,IMAGES_OLD}]
    mapping={v["path"]:v for v in gate["sources"]}
    for p in (FEATURED,EDITION,TEXT_NEW,IMAGES_NEW):
        content=read(p)
        record=mapping.get(p)
        if record is None:
            record={"path":p}
            gate["sources"].append(record)
        record.update(blobSha=blob(content),sha256=sha(content))
    gate["reviewNotesR8"]={
      "userCorrection":"The first WeChat native article title must not be paper-only.",
      "nativeTitle":FULL_TITLE,
      "sourceAndScientificBody":"Reviewed R7 complete scientific body unchanged",
      "textReview":"pass: full title restored; no edits to experimental discussion, evidence or figures",
      "imageReview":"pass: identical audited R7 cover and 34 pinned assets",
      "secondArticle":"unchanged Nature Catalysis source and cover",
      "draftWrite":"pending single same-media draft/update and draft/get readback",
      "nativeMobileTitleLayout":"Requires actual client inspection; HTML readback checks full metadata title"
    }
    assert len(gate["assets"])==34 and len(gate["sources"])==5
    assert gate["textReview"]==gate["imageReview"]=="pass"
    write_json(GATE,gate)
    qa={
      "date":DATE,"revision":REV,"title":FULL_TITLE,
      "priorTitle":PAPER_TITLE,
      "cover":COVER,"coverSha256":sha(read(COVER)),
      "coverBytesChanged":False,"titleRestored":True,
      "originalChemistryRedrawn":False,"bodyImageChangedCount":0,
      "secondArticleChanged":False,"draftWrite":"pending",
      "publicSendAuthorized":False
    }
    write_json(REVIEW,qa)
    print(json.dumps({"result":"R8_TITLE_REVIEW_PASS","title":FULL_TITLE,
      "cover":COVER,"assets":len(gate["assets"]),
      "sources":len(gate["sources"]),"draftWritten":False},ensure_ascii=False))

if __name__=="__main__":
    main()
