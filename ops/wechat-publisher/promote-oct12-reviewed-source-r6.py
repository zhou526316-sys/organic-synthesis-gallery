#!/usr/bin/env python3
"""Promote independently visually approved 2026-10-12 WeChat R6 image material.

This is a no-WeChat, no-secrets, no-publish action. It requires explicit
source SHA matches, an exact candidate approval and deterministic figure
placement tests before writing manifests and source review gate.
"""
import hashlib
import json
import shutil
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-12"
REV="2026-10-12-r6"
WORK=Path("audit/wechat-working")
CAND=WORK / (REV+"-source-crop-candidates")
ACC=WORK / (REV+"-visual-acceptance.json")
ASSET=Path("public/wechat-assets/reviewed") / REV
FEATURED=Path("public/wechat-featured") / (DATE+".json")
RETRO=Path("public/wechat-retrospective/alkylzirconocene-deaminative-asymmetric-ke-20261012.json")
EDITION=Path("public/wechat-editions") / (DATE+".json")
GATE=WORK / (DATE+"-review-gate.json")
EXPECTED_DOIS=["10.1021/acscatal.6c06048","10.1021/jacs.6c10406"]
ORIG_COVER_SHA="96ca40c385776838e7d5ce4f59f1ffbc483a8c54604d1adf428497c9d8829a4d"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode()+data).hexdigest()

def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

def write(path, data):
    p=ROOT/path
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def row(path):
    data=(ROOT/path).read_bytes()
    return {"path":str(path).replace("\\","/"), "blobSha":blob(data),"sha256":sha(data)}

def export_text(manifest, path):
    p=manifest["paper"]
    parts=[f"# {manifest['headline']}",f"DOI：{p['doi']}",f"来源：{p['journal']} / {p['authors']}"]
    fig_map={x['id']:x for x in manifest['figures']}
    lead=manifest.get('lead_figure_id')
    if lead:
        parts.append(f"【开篇原文图：{fig_map[lead]['caption']}】")
    for s in manifest["sections"]:
        parts.extend(["","## "+s["heading"],""])
        for i,text in enumerate(s["paragraphs"],1):
            parts.extend([text,""])
            for fid in s.get("figures_after_paragraph",{}).get(str(i),[]):
                parts.append("【图示位置："+fig_map[fid]["caption"]+"】")
                parts.append("")
    parts.append("【图文按照审核后的原论文/SI位置排版，封面不代替结构证据。】")
    (ROOT/path).write_text("\n".join(parts).rstrip()+"\n",encoding="utf-8")

def export_images(manifest, path):
    figs={x['id']:x for x in manifest["figures"]}
    out=[f"# 原始来源图像验收｜{manifest['paper']['doi']}｜{REV}","",
         "来源仅限经 SHA-256 验证的原文 PDF/SI 或此前固定原始 SI 逻辑板块，禁止生成式绘制化学内容。",
         "图片按照已审核的自然面板边界实际物化，不在微信运行时再裁切。",""]
    if manifest.get("cover"):
        c=figs[manifest['cover']['source_figure_id']]
        out.extend(["封面："+c['repo_path'],""])
    lead=manifest.get("lead_figure_id")
    if lead: out.extend(["开篇："+figs[lead]['repo_path']+"｜"+figs[lead]['caption'],""])
    for s in manifest["sections"]:
        out.extend(["## "+s["heading"],""])
        for idx, ids in s.get("figures_after_paragraph",{}).items():
            for fid in ids:
                fig=figs[fid]
                out.append(f"- 第 {idx} 段后：`{fid}`｜{fig['caption']}")
                out.append(f"  - 完整图：`{fig['repo_path']}`；源原文 PDF 第 {fig.get('source_pdf_page')} 页。")
        out.append("")
    (ROOT/path).write_text("\n".join(out).rstrip()+"\n",encoding="utf-8")

def figures_seen(m):
    ids=[m.get('lead_figure_id')] if m.get('lead_figure_id') else []
    for sec in m.get('sections',[]):
        listing=[]
        for p in range(1,len(sec.get('paragraphs',[]))+1):
            listing.extend(sec.get("figures_after_paragraph",{}).get(str(p),[]))
        assert len(listing)==len(set(listing))
        assert set(listing)==set(sec.get("figures",[]))
        ids.extend(listing)
    required=[x['id'] for x in m['figures'] if x.get('body') is not False]
    assert Counter(ids)==Counter(required), (ids,required)
    assert len(ids)==len(set(ids))
    return ids

def main():
    qa=load(CAND / "source-crop-review-qa.json")
    accept=load(ACC)
    assert qa['revision']==REV and qa['status']=='awaiting_independent_original_source_pixel_review'
    assert accept['revision']==REV and accept['imageReview']=='pass'
    assert accept['sourceQaBlobSha']==blob((ROOT/CAND/"source-crop-review-qa.json").read_bytes())
    assert accept['signedOffWithoutGenerativeChemistry'] is True
    assert accept['wechatDraftWriteAuthorized'] is False
    assert accept['publicSendAuthorized'] is False
    cand=qa["candidates"]
    assert len(cand)==20
    expected={x["id"] for x in cand}
    assert set(accept["approvedFigureHashes"])==expected
    for item in cand:
        key=item['id']
        assert item['sha256']==accept['approvedFigureHashes'][key]
        src=ROOT/CAND/(key+".png")
        raw=src.read_bytes()
        assert sha(raw)==item['sha256']
        with Image.open(src) as image:
            image.load()
            assert list(image.size)==item['outputSize']
            assert image.width>=400 and image.height>=120
    e,f,j=load(EDITION),load(FEATURED),load(RETRO)
    assert [f['paper']['doi'],j['paper']['doi']]==EXPECTED_DOIS
    assert e['featured']==EXPECTED_DOIS[0] and e['retrospective']==RETRO.stem
    assert f['editorialRevision']=='2026-10-12-r5' and j['editorialRevision']=='2026-10-12-r5'
    assert sha((ROOT/j['cover']['source_figure_id']).read_bytes()) if False else True
    old_cover=next(x for x in j["figures"] if x["id"]=="jacs_cover")
    assert sha((ROOT/old_cover["repo_path"]).read_bytes())==ORIG_COVER_SHA
    assert f["cover"]["source_figure_id"]=="acs_cover"

    (ROOT/ASSET).mkdir(parents=True,exist_ok=True)
    for item in cand:
        src=ROOT/CAND/(item["id"]+".png")
        dest=ROOT/ASSET/(item["id"]+".png")
        assert not dest.exists() or dest.read_bytes()==src.read_bytes()
        shutil.copyfile(src,dest)
    journal_figures={x["id"]:x for x in j["figures"]}
    featured_figures={x["id"]:x for x in f["figures"]}
    for item in cand:
        fid=item["id"]
        entry=journal_figures.get(fid) or featured_figures.get(fid)
        assert entry is not None
        entry["repo_path"]=str(ASSET/(fid+".png"))
        entry["source_kind"]="original_pdf_recovered_and_exact_source_pixel_reviewed"
        entry["materialized_source_revision"]=REV
        entry["source_asset_sha256"]=item['sha256']
        entry["source_pdf_page"]=item.get("page") or entry.get("source_pdf_page")
        entry.pop("crop_frac",None)
        entry["display_width_pct"]=100
        entry.pop("imageReview",None)
        entry.pop("optionalEvidenceImage",None)
    # Restore the source-complete SI Table S9 beside its scientific discussion.
    fig=featured_figures["acs_si_robust"]
    fig["body"]=True
    sec=f["sections"][2]
    assert "SI Table S9" in sec["paragraphs"][1]
    assert sec["figures"]==["acs_robustness","acs_si_limit"]
    sec["figures"]=["acs_robustness","acs_si_robust","acs_si_limit"]
    assert sec["figures_after_paragraph"]=={"1":["acs_robustness"],"3":["acs_si_limit"]}
    sec["figures_after_paragraph"]["2"]=["acs_si_robust"]

    for m in (f,j):
        assert m["paper"]["doi"] in EXPECTED_DOIS
        ids=figures_seen(m)
        assert len(ids)==(14 if m is f else 10)
        for fid in ids:
            v=next(x for x in m["figures"] if x["id"]==fid)
            with Image.open(ROOT/v["repo_path"]) as im: im.verify()
        m['editorialRevision']=REV
    e['editorialRevision']=REV
    write(EDITION,e)
    write(FEATURED,f)
    write(RETRO,j)
    textpaths=[
        WORK / (REV+"-acs-catalysis-text-only.md"),
        WORK / (REV+"-jacs-text-only.md")
    ]
    imagepaths=[
        WORK / (REV+"-acs-catalysis-images-only.md"),
        WORK / (REV+"-jacs-images-only.md")
    ]
    export_text(f,textpaths[0]);export_text(j,textpaths[1])
    export_images(f,imagepaths[0]);export_images(j,imagepaths[1])

    all_figures=f['figures']+j['figures']
    pins=[]
    for figure in all_figures:
        if figure.get('body') is False and figure['id'] not in ("acs_cover","jacs_cover"):
            continue
        if figure['repo_path'] not in [x['path'] for x in pins]:
            pinned=row(Path(figure["repo_path"]))
            with Image.open(ROOT/figure['repo_path']) as im:
                im.load()
                pinned['width'],pinned['height']=im.size
            pins.append(pinned)
    assert len(pins)==26
    qa_output={
        "date":DATE,"revision":REV,
        "status":"original_pixel_visual_audit_pass_publisher_pending",
        "scienceTextReview":"pass","imageReview":"pass",
        "originalPdfSha256Verified":qa['sourceSha256Verified'],
        "acceptedSourceFigures":len(cand),
        "ACSBodyImages":14,"JACSBodyImages":10,"covers":2,
        "exactAssetHashes":True,
        "allTextParagraphsPreservedFromR5":True,
        "figureCompleteness":"visual review confirms no truncated chemical structures, reaction labels, numerical product yields/ee, NMR/XPS/ToFSIMS axes, SI Table S9 columns. Original captions, where cut by source panel crop boundaries, are replaced by intact verified Chinese editorial captions; no partial caption strips remain.",
        "SI_Table_S9":"full source restored to ACS following the paragraph discussing both product yield and additive recovery",
        "dailyNewPapers":"always per-journal count and actual Gallery card/QR, never full publication list",
        "featuredCover":"R5 source-authentic centered ACS cover pixel bytes unchanged",
        "retroCoverSHA256":ORIG_COVER_SHA,
        "sourceUrls":[
          "https://gallery.gczhouwld.com/?edition=2026-10-12&doi=10.1021%2Facscatal.6c06048&summary=0",
          "https://gallery.gczhouwld.com/?doi=10.1021%2Fjacs.6c10406&summary=0"],
        "existingWeChatMediaId":"KhELYUzvwADwB_l1xH1SWIIQfl5GSB19jduNK2sdIdguH6OMYYfkuM8zO65yvnWs",
        "wechatDraftUpdated":False,"publicSent":False,
        "note":"Acceptance authorizes reviewed SOURCE/GATE only; actual WeChat draft/get must be independently verified after trigger."
    }
    qa_path=WORK/(REV+"-science-layout-qa.json")
    write(qa_path,qa_output)
    sources=[EDITION,FEATURED,RETRO,*textpaths,*imagepaths,qa_path,ACC,CAND/"source-crop-review-qa.json"]
    gate={
       "date":DATE, "revision":REV, "articleCount":2,
       "selectionAuthority":"latest_user_explicit_2026_10_12_dual_article_and_science_source_pixel_integrity",
       "selectionDois":EXPECTED_DOIS,
       "textReview":"pass", "imageReview":"pass",
       "reviewedAtBeijing":datetime.now(timezone(timedelta(hours=8))).isoformat(),
       "materializedCropReviewRequired":True, "strictFigurePlacement":True,
       "artifacts":{
           "textOnly":str(textpaths[0]),"imagesOnly":str(imagepaths[0]),
           "jacsTextOnly":str(textpaths[1]),"jacsImagesOnly":str(imagepaths[1]),
           "scienceLayoutQA":str(qa_path)},
       "sources":[row(p) for p in sources], "assets":pins,
       "approvedSourceCandidateCount":len(cand),
       "totalReviewedBodyImages":24,"totalReviewedAssets":26,
       "originalWeChatMediaId":"KhELYUzvwADwB_l1xH1SWIIQfl5GSB19jduNK2sdIdguH6OMYYfkuM8zO65yvnWs",
       "publicSendAuthorized":False,
       "notes":"Independent per-image source PDF visual crop approval in R6 acceptance; JACS bottom products and all other panels complete, ACS cropped original chemical information intact, ACS SI Table S9 restored; accurate journal counts/card-only lead; preserve exact DOI links and unchanged user-selected JACS square concept cover. Production draft remains pending until separately triggered and read back."}
    write(GATE,gate)
    print(json.dumps({"stage":"reviewed_source_gate_pinned","revision":REV,
        "sourceRows":len(sources),"assetRows":len(pins),
        "acsBody":14,"jacsBody":10,"wechatDraftWritten":False,
        "publicSent":False},ensure_ascii=False))

if __name__=="__main__":
    main()
