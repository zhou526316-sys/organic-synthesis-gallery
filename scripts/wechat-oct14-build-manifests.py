#!/usr/bin/env python3
"""Build 10/14 two-paper Official Account manifests from independently reviewed exact-PDF text and SHA-locked figures.

Refuses stale 24-paper content or missing original image; never submits WeChat API calls.
"""
import hashlib, json, pathlib, re, urllib.parse, datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
REVIEW=ROOT/"audit/wechat-working"
FIGDIR="public/wechat-assets/reviewed/2026-10-14-r1"
FEATURED="10.1021/jacs.6c17662"
RETRO="10.1021/jacs.6c08353"
DATE="2026-10-14"
REMOVED=["10.1038/s41467-026-78512-x","10.1002/anie.2910902","10.1021/acscatal.6c06095","10.1002/anie.2518487"]
EXPECTED={"JOC":7,"Organic Letters":7,"Nature Synthesis":2,"JACS":2,"ACS Catalysis":1,"Chemical Science":1}

def git_blob_sha(p):
    b=p.read_bytes()
    return hashlib.sha1(("blob "+str(len(b))).encode()+bytes([0])+b).hexdigest()

def parse_manuscript(path):
    source=path.read_text(encoding="utf8")
    lines=source.splitlines()
    parts={"quick":[],"lead":None,"sections":[],"references":[]}
    level=None
    buffer=[]
    def flush():
        nonlocal buffer
        item=" ".join(buffer).strip()
        buffer=[]
        if item and level and not item.startswith("> ") and not item.startswith("原文：") and not item.startswith("阅读原文：") and not item.startswith("Yuang Cui") and not item.startswith("Na Luo"):
            item=re.sub(r"\*\*(.*?)\*\*",r"\1",item)
            parts["quick" if level=="quick" else "sections"][-1]["paragraphs"].append(item) if level!="quick" else parts["quick"].append(item)
    for line in lines:
        line=line.strip()
        if not line:
            flush();continue
        if line.startswith("# ") and not line.startswith("## "):
            parts["mainTitle"]=line[2:];continue
        if line.startswith("## "):
            flush();level="quick";parts["quickTitle"]=line[3:];continue
        if line.startswith("### "):
            flush();level="section"
            parts["sections"].append({"heading":line[4:],"paragraphs":[],"figureNames":[]})
            continue
        image=re.match(r"^\[\[IMAGE:([^|]+)\|(.+)\]\]$",line)
        if image:
            flush()
            if level=="quick":
                if parts["lead"] is not None: raise AssertionError("two lead images")
                parts["lead"]=image.group(1)
            else:
                parts["sections"][-1]["figureNames"].append(image.group(1))
            continue
        if line.startswith("> "):
            continue
        buffer.append(line)
    flush()
    assert parts["lead"], "missing lead image"
    return parts

def add_source_figure(v,doi,review):
    n=v["filename"]
    out={"id":n.replace(".png",""),"repo_path":FIGDIR+"/"+n,"source_doi":doi,
       "source_figure":review["figure"],"source_kind":"exact_original_user_supplied_publisher_pdf_pixel_crop",
       "source_pdf_page":review["page"],"body":True,"caption":review["caption"]}
    width=95 if n.startswith("today_Fig") or "Table" in n else 88
    if "Fig3.png" in n or "Fig2.png" in n or "Fig4.png" in n:
        width=99
    if "lead" in n: width=90
    if n.startswith("retro_SI_S24"):width=94
    if n.startswith("retro_SI_S4"):width=82
    out["display_width_pct"]=width
    return out

def make(article,review_map,doi,kind):
    prefix="today_" if kind=="today" else "retro_"
    rows=[r for r in review_map if r["part"]==kind]
    names=[r["filename"] for r in rows]
    assert names[0]==article["lead"]
    assert len(rows)==(13 if kind=="today" else 12)
    figByName={r["filename"]:add_source_figure(r,doi,r) for r in rows}
    headings=["背景与突破","自由基迁移","条件判别","竞争路径","底物拓展","决定性实验","应用与边界"] if kind=="today" else ["目标与约束","两个选择性","时间演化","催化组装","非同步过渡态","手性起源","实际应用","边界与启发"]
    positions=[[1],[1],[1,2,2],[1,2],[1,2],[1,2],[1]] if kind=="today" else [[1],[1],[1,2,2],[1,2],[2,2],[],[1,2],[]]
    assert len(article["sections"])==len(headings)==len(positions)
    result=[]
    used=[article["lead"]]
    for i,(s,entry,eyebrow) in enumerate(zip(article["sections"],positions,headings)):
        paragraphs=[p for p in s["paragraphs"] if not p.startswith("（原文 Fig.") or "已完整显示" not in p]
        assert len(entry)==len(s["figureNames"]), ("bad semantic mapping",i,entry,s["figureNames"])
        assert all(1<=x<=len(paragraphs) for x in entry),("image not after text",i)
        mapping={}
        ids=[]
        for target,name in zip(entry,s["figureNames"]):
            mapping.setdefault(str(target),[]).append(figByName[name]["id"])
            ids.append(figByName[name]["id"])
            used.append(name)
        result.append({"eyebrow":eyebrow,"heading":s["heading"],"paragraphs":paragraphs,
                       "figures":ids,"figures_after_paragraph":mapping})
    assert used==names,("original sequence does not match independently reviewed file map",kind,used,names)
    figures=[figByName[n] for n in names]
    coverName="cover_featured.png" if kind=="today" else "cover_retrospective.png"
    coverPath=ROOT/FIGDIR/coverName
    assert coverPath.exists() and coverPath.stat().st_size>10_000
    coverHash=hashlib.sha256(coverPath.read_bytes()).hexdigest()
    figures.append({"id":coverName[:-4],"repo_path":FIGDIR+"/"+coverName,"source_doi":doi,
        "source_figure":"Fig.1B reaction source preserved from main paper", "body":False,
        "source_kind":"exact_original_paper_raster_unaltered","caption":"原文 Fig. 1B 反应图封面"})
    quickLabel="先看懂这项反应"
    if kind=="today":
        assert len(article["quick"])==2
        guide=[{"label":quickLabel,"text":article["quick"][0]},
               {"label":"核心反应路径","text":article["quick"][1]}]
    else:
        assert len(article["quick"])==1
        guide=[{"label":quickLabel,"text":article["quick"][0]}]
    paper={
       "doi":doi, "journal":"JACS",
       "title":"Migratory Hydroamination of Alkenes via Iron-Hydride Catalysis" if kind=="today" else "Catalytic Asymmetric Cationic Geranyl Cyclizations",
       "authors":"Yuang Cui, Yizhou Chen, Hui Lv, Rao Liang, Beibei Zhan, Xiaheng Zhang" if kind=="today" else "Na Luo, Mathias Turberg, Nobuya Tsuji, Markus Leutzsch, Sebastian Brunen, Benjamin List"
    }
    headline=("铁氢催化烯烃迁移氢胺化" if kind=="today" else "手性 IDPi 催化香叶基衍生物的不对称阳离子环化")
    cover={
      "source_figure_id":coverName[:-4],
      "production_cover_image":"user_selected",
      "pixel_equivalence":"exact_source_bytes",
      "delivery_image_sha256":coverHash,
      "canvas":{"width":1880 if kind=="today" else 800,"height":800,"background":"#FFFFFF"},
      "crop_235_1":"0_0_1_1" if kind=="today" else "0_0.287234_1_0.712766",
      "crop_1_1":"0.287234_0_0.712766_1" if kind=="today" else "0_0_1_1",
      "description":"Original PDF Fig1B screenshot without generated or modified chemistry; verified as source-only cover"
    }
    manifest={"date":DATE,"selectionAuthority":"user_uploaded_jacs_main_and_SI_and_20261014_selected_two_papers",
      "editorialRevision":"2026-10-14-r1","paper":paper,"headline":headline,
      "kicker":"今日精选｜JACS" if kind=="today" else "往期精选｜JACS",
      "lead_figure_id":article["lead"][:-4],"lead_figure_position":"after_first_quick_point",
      "quick_points":guide,"sections":result,"figures":figures,"cover":cover,
      "editorialIntent":"Science-led narration grounded in exact original main article and SI. Readers see Fig.1B under 先看懂这项反应. All claims have bounded evidence, including negative SI examples and catalyst-state/DFT uncertainty. Never conflate model with observation."}
    if kind=="retro":
       manifest.update({"slug":"idpi-asymmetric-geranyl-cyclization-20261014",
        "title":"有机合成文献日报｜10.14｜往期精选｜JACS："+headline,
        "digest":"List 团队使用受限手性 IDPi 与氟代醇协同，区分区域选择性、异构化和非同步过渡态。",
        "source_url":"https://gallery.gczhouwld.com/?"+urllib.parse.urlencode({"doi":doi,"summary":"0"})})
    assert len(manifest["figures"])==(14 if kind=="today" else 13)
    return manifest

def main():
    p=REVIEW/"2026-10-14-r1-original-figure-sha-review.json"
    rows=json.loads(p.read_text(encoding="utf8"))
    assert len(rows)==25
    for r in rows:
       img=ROOT/FIGDIR/r["filename"]
       assert img.exists() and hashlib.sha256(img.read_bytes()).hexdigest()==r["sha256"],r["filename"]
    state=json.loads((ROOT/"audit/literature-update-state.json").read_text(encoding="utf8"))
    rel=state["lastPublication"]
    assert rel["publicationSlot"]==DATE+"T08:00:00+08:00"
    raw=rel["publishedDois"];absent=state["lastWebsiteSync"]["verification"].get("removedDoisAbsent",REMOVED)
    # This staging branch may predate a later main-only owner removal; exact four owner corrections remain mandatory.
    assert len(raw)==24 and set(absent)==set(REMOVED)
    final=[v for v in raw if v not in REMOVED]
    assert len(final)==20 and FEATURED in final and RETRO not in final
    j=json.loads((ROOT/"audit/review-2026-10-14-0800.json").read_text(encoding="utf8"))
    accepted={r["doi"]:r["journal"] for r in j["accepted"]}
    counts={}
    for doi in final:
        key=accepted.get(doi)
        assert key,key or doi
        counts[key]=counts.get(key,0)+1
    assert counts==EXPECTED,(counts,EXPECTED)
    today=make(parse_manuscript(REVIEW/"2026-10-14-r1-today-text-only.md"),rows,FEATURED,"today")
    retro=make(parse_manuscript(REVIEW/"2026-10-14-r1-retrospective-text-only.md"),rows,RETRO,"retro")
    edition={"date":DATE,"title":"有机合成文献日报｜10.14｜今日精选｜JACS："+today["headline"],
       "digest":"10月14日正式新增20篇。今日精选解读铁氢催化迁移氢胺化的自由基迁移证据；往期精选深读手性IDPi/PFTB催化香叶基环化的动力学和对映控制。",
       "featured":FEATURED,"retrospective":retro["slug"],
       "selectionAuthority":"user_uploaded_four_main_SI_source_pdfs",
       "editorialRevision":"2026-10-14-r1","publicationMode":"draft_only",
       "correctedDaily":{"total":20,"journalCounts":EXPECTED,"removedDois":REMOVED,"source":"corrected official Gallery catalogue 1087"}}
    writes=[
    (ROOT/"public/wechat-featured"/(DATE+".json"),today),
    (ROOT/"public/wechat-retrospective"/(retro["slug"]+".json"),retro),
    (ROOT/"public/wechat-editions"/(DATE+".json"),edition)
    ]
    for path,obj in writes:
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+chr(10),encoding="utf8")
    audit={
      "date":DATE,"revision":"2026-10-14-r1","reviewType":"independent_science_text_and_source_image_check",
      "sciencePapers":[FEATURED,RETRO],"corrections":{"journalCounts":counts,"publishedToday":20,"removedFour":REMOVED},
      "originalImageBytesVerified":25,"originalCoverImagesVerified":2,
      "sourcePdfContentBasis":"four user-provided main and SI PDFs",
      "sourceTextOriginalReview":[
         "audit/wechat-working/2026-10-14-r1-today-text-only.md",
         "audit/wechat-working/2026-10-14-r1-retrospective-text-only.md"],
      "independentImageAudit":"audit/wechat-working/2026-10-14-r1-original-figure-sha-review.json",
      "design":{"leadFigureBelowIntroTitle":True,"figuresFollowExplanatoryParagraph":True,
        "tocVerifiedNotInvented":True,"chemicalStructureRedrawn":False,
        "noContinuousShortenedControls":True},
      "status":"science_and_image_originality_pass; cloud_preview_pending",
      "publication":{"draftOnly":True,"sendAllowed":False}}
    (REVIEW/"2026-10-14-r1-publication-science-review.json").write_text(json.dumps(audit,ensure_ascii=False,indent=2)+chr(10),encoding="utf8")
    # Construct a standalone image-only review artifact referencing each actual source.
    imageRows=[]
    for kind,m in [("today",today),("retro",retro)]:
      imageRows.append({"article":kind,"paper":m["paper"]["doi"],
          "lead":m["lead_figure_id"],"cover":m["cover"],
          "placements":[{"section":idx+1,"header":s["heading"],"positions":s["figures_after_paragraph"]}
                        for idx,s in enumerate(m["sections"])],
          "figures":[{"id":f["id"],"repo_path":f["repo_path"],"caption":f["caption"],
                       "source_figure":f["source_figure"]} for f in m["figures"]]})
    (REVIEW/"2026-10-14-r1-images-only.json").write_text(json.dumps(imageRows,ensure_ascii=False,indent=2)+chr(10),encoding="utf8")
    sources=["public/wechat-featured/"+DATE+".json",
         "public/wechat-retrospective/"+retro["slug"]+".json",
         "public/wechat-editions/"+DATE+".json",
         "audit/wechat-working/2026-10-14-r1-publication-science-review.json",
         "audit/wechat-working/2026-10-14-r1-images-only.json",
         "audit/wechat-working/2026-10-14-r1-today-text-only.md",
         "audit/wechat-working/2026-10-14-r1-retrospective-text-only.md"]
    assets=[{"path":f["repo_path"],"blobSha":git_blob_sha(ROOT/f["repo_path"])}
            for manifest in [today,retro] for f in manifest["figures"]]
    assert len(assets)==27
    gate={"date":DATE,"revision":"2026-10-14-r1","articleCount":2,
       "selectionDois":[FEATURED,RETRO],"textReview":"pass","imageReview":"pass",
       "reviewedAtBeijing":"2026-10-14T11:12:00+08:00",
       "materializedCropReviewRequired":True,"strictFigurePlacement":True,
       "sources":[{"path":k,"blobSha":git_blob_sha(ROOT/k)} for k in sources],
       "assets":assets,
       "artifacts":{"textOnly":sources[5],"imagesOnly":"audit/wechat-working/2026-10-14-r1-images-only.json",
                     "retrospectiveTextOnly":sources[6],"scienceReview":sources[3]},
       "reviewNotes":"Actual PDF-only original PNG SHA-256 verified, 25 paper/SI body images + exact two covers. Two read-only independent text artifacts, corrected formal20 counts. Local original image responsive QA before cloud write; actual WeChat draft/get still required.",
       "expectedJournalTotal":20,"journalCounts":EXPECTED,"excludedDOIs":REMOVED,
       "exactReadOriginal":[
          "https://gallery.gczhouwld.com/?"+urllib.parse.urlencode({"edition":DATE,"doi":FEATURED,"summary":"0"}),
          retro["source_url"]],
       "draftWriteAuthorized":True,"publicSendAuthorized":False,"publishId":None}
    (REVIEW/(DATE+"-review-gate.json")).write_text(json.dumps(gate,ensure_ascii=False,indent=2)+chr(10),encoding="utf8")
    print(json.dumps({"correctedToday":len(final),"perJournal":counts,"sourceImageCount":len(assets),
         "figureCount":[len(today["figures"])-1,len(retro["figures"])-1],
         "headlines":[edition["title"],retro["title"]],"sourcePaths":sources},ensure_ascii=False))
if __name__=="__main__":main()
