#!/usr/bin/env python3
"""Review-bound import of 2026-10-10 Angew + Nature Synthesis paired WeChat source.

The Adobe-hosted user-selected upload is SHA256-pinned in the trigger. This
script NEVER invokes the WeChat API or any mass-send action. One writer,
main only, immutable original body figures, complete review gate before draft.
"""
from __future__ import annotations
import hashlib, html, importlib.util, io, json, os, re, shutil, subprocess, sys, urllib.parse, urllib.request, zipfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DATE="2026-10-10"
REV="2026-10-10-r1"
DA="10.1002/anie.3306470"
RE="10.1038/s44160-026-01128-y"
OLD_RETRO="public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r3.json"
NEW_RETRO="public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r5.json"
OLD_GATE="audit/wechat-working/retrospective-alcohols-electrochemical-crosscoupling-qiu-20261010-r3-review-gate.json"
FEATURED="public/wechat-featured/2026-10-10.json"
EDITION="public/wechat-editions/2026-10-10.json"
TEXT="audit/wechat-working/2026-10-10-r1-text-only.md"
IMAGES="audit/wechat-working/2026-10-10-r1-images-only.md"
PLAN="audit/wechat-working/2026-10-10-r1-editorial-plan.json"
GATE="audit/wechat-working/2026-10-10-review-gate.json"
QA="audit/wechat-working/2026-10-10-r1-import-and-qa.json"
TRIGGER="audit/automation-triggers/wechat-oct10-pair-reviewed-import.json"

def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(f"blob {len(b)}\0".encode()+b).hexdigest()
def read(p):return (ROOT/p).read_bytes()
def encoded(j):return (json.dumps(j,ensure_ascii=False,indent=2)+"\n").encode()
def write(p,b,paths):
    f=ROOT/p
    if f.exists() and f.read_bytes()!=b:raise RuntimeError("Refusing unapproved overwrite: "+p)
    f.parent.mkdir(parents=True,exist_ok=True)
    f.write_bytes(b);paths.add(p)
def image_row(p):
    b=read(p)
    with Image.open(io.BytesIO(b)) as im:im.load();w,h=im.size
    return dict(path=p,blobSha=blob(b),sha256=sha(b),width=w,height=h)

class HTMLSeen(HTMLParser):
    def __init__(self):super().__init__();self.images=[];self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="img":self.images.append(dict(attrs).get("src"))
    def handle_data(self,data):self.text.append(data)

def ordered(manifest):
    lead=str(manifest.get("lead_figure_id") or "").strip()
    used=[lead] if lead else []
    for sec in manifest["sections"]:
        ps=sec["paragraphs"];mapping=sec["figures_after_paragraph"]
        assert isinstance(ps,list) and len(ps)>0
        placed=[]
        for i,p in enumerate(ps,1):
            assert isinstance(p,str) and len(p)>12
            figures=mapping.get(str(i),[])
            assert isinstance(figures,list)
            placed.extend(figures)
        assert Counter(placed)==Counter(sec["figures"]),sec["heading"]
        used.extend(placed)
    ids=[f["id"] for f in manifest["figures"] if f.get("body") is not False]
    assert len(used)==len(set(used)) and Counter(used)==Counter(ids)
    return used

def main():
    req=json.loads(read(TRIGGER))
    assert req["action"]=="review_and_import_oct10_daily_pair"
    assert req["revision"]==REV
    assert req["draftOnly"] is True and req["publicSendAuthorized"] is False
    assert req["dois"]==[DA,RE]
    url=req["packageUrl"];assert re.fullmatch(r"https://at\.adobe\.com/[A-Za-z0-9]+",url)
    with urllib.request.urlopen(url,timeout=60) as r: raw=r.read(20_000_001)
    assert len(raw)<20_000_000 and sha(raw)==req["packageSha256"],"Review bundle changed"
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names=z.namelist()
        assert len(names)==len(set(names)) and len(names)<=80
        assert sum(x.file_size for x in z.infolist())<=30_000_000
        assert not any(PurePosixPath(n).is_absolute() or ".." in PurePosixPath(n).parts for n in names)
        package=json.loads(z.read("bundle-manifest.json"))
        assert package["revision"]==REV and package["featuredDoi"]==DA and package["retroDoi"]==RE
        assert package["sourcePublishedCount"]==23
        assert package["expectedPreviousRetroManifestBlobSha"]==blob(read(OLD_RETRO))==req["oldRetroManifestBlobSha"]
        assert package["expectedPreviousRetroGateBlobSha"]==blob(read(OLD_GATE))==req["oldRetroGateBlobSha"]
        old=json.loads(read(OLD_RETRO))
        oldgate=json.loads(read(OLD_GATE))
        assert old["editorialRevision"]=="2026-10-10-qiu-r4"
        assert oldgate["textReview"]==oldgate["imageReview"]=="pass"
        assert old["paper"]["doi"]==RE
        assert old["title"].count("邱友爱")==1
        existing_cover=next(f for f in old["figures"] if f["id"]=="retro-cover")
        assert sha(read(existing_cover["repo_path"]))==package["expectedPreviousRetroCoverSHA256"]
        for row in oldgate["assets"]:
            assert blob(read(row["path"]))==row["blobSha"]
            assert sha(read(row["path"]))==row["sha256"]
        old_body=[(f["id"],f["repo_path"],f["caption"]) for f in old["figures"] if f.get("body") is not False]
        assert len(old_body)==31
        state=json.loads(read("audit/publication-release-state.json"))
        review=json.loads(read("audit/review-2026-10-10-0800.json"))
        assert state["publicationSlot"]==review["publicationSlot"]=="2026-10-10T08:00:00+08:00"
        assert state["productionCards"]>=938 and len(review["accepted"])==23
        assert DA in state["publishableDois"] and any(x["doi"]==DA for x in review["accepted"])

        # Stage new reviewed assets, source manuscripts and source-authored texts.
        written=set()
        whitelisted={FEATURED,EDITION,TEXT,IMAGES,PLAN}
        for n in names:
            if n=="bundle-manifest.json":continue
            good=n in whitelisted or n.startswith("public/wechat-assets/reviewed/2026-10-10-anie3306470-r1/") or n==package["newRetroCover"]
            assert good and PurePosixPath(n).suffix.lower() in (".png",".md",".json"),"Unapproved file in source bundle: "+n
            assert not (ROOT/n).exists(),"This revision was already imported: "+n
            write(n,z.read(n),written)
    data=json.loads(read(FEATURED));edition=json.loads(read(EDITION))
    assert data["paper"]["doi"]==DA and data["editorialRevision"]==REV
    assert edition["featured"]==DA and edition["date"]==DATE and edition["editorialRevision"]==REV
    assert edition["publicationMode"]=="draft_only_manual_final_send"
    assert edition["title"].startswith("有机合成文献日报｜10.10｜今日精选｜Angew.")

    # Copy Nature Synthesis's already reviewed 31 source figures verbatim.
    # Chinese surname correction is a human-requested editorial fact.
    retro=json.loads(json.dumps(old,ensure_ascii=False).replace("邱友爱","仇友爱"))
    assert retro["title"].count("仇友爱")==1
    retro["slug"]="alcohols-electrochemical-crosscoupling-qiu-20261010-r5"
    retro["editorialRevision"]=REV
    retro["figures"][-1] if False else None
    finalcover=next(f for f in retro["figures"] if f["id"]=="retro-cover")
    assert finalcover.get("body") is False
    assert package["newRetroCover"]=="public/wechat-assets/reviewed/2026-10-10-qiu-alcohols/nature-synthesis-author-name-corrected-r5.png"
    assert sha(read(package["newRetroCover"]))==package["newRetroCoverSHA256"]
    finalcover["repo_path"]=package["newRetroCover"]
    finalcover["source_adjustment"]="Same user-approved R4 chemistry and layout; only lower author name changed from 邱友爱 to 仇友爱. The chemical panel pixels remain unchanged."
    retro["cover"]["description"]=retro["cover"].get("description","")+" Original molecular structures preserved; author label corrected to 仇友爱."
    assert old_body==[(f["id"],f["repo_path"],f["caption"]) for f in retro["figures"] if f.get("body") is not False]
    assert "邱友爱" not in json.dumps(retro,ensure_ascii=False)
    edition["retrospective"]=retro["slug"]
    for p,obj in [(NEW_RETRO,retro),(EDITION,edition)]:
        f=ROOT/p
        assert not f.exists()
        write(p,encoded(obj),written)

    # The final independent text/image review artifacts cover BOTH full articles.
    text_md=read(TEXT).decode()
    text_md+="\n\n## 第二篇：Nature Synthesis 往期精选完整文字\n"
    text_md+="\n" + retro["title"]+"\n"
    for k in retro["quick_points"]:text_md+=f"\n**{k['label']}**\n{k['text']}\n"
    for section in retro["sections"]:
        text_md+="\n## "+section["heading"]+"\n"
        for i,p in enumerate(section["paragraphs"],1):
            text_md+="\n"+p+"\n"
            for fid in section.get("figures_after_paragraph",{}).get(str(i),[]):text_md+="〔对应源图："+fid+"〕\n"
    (ROOT/TEXT).write_text(text_md,encoding="utf-8")
    assetmeta=package["dailyAssets"]
    old_files={row["path"]:row for row in oldgate["assets"] if row["path"]!=existing_cover["repo_path"]}
    assert len(old_files)==31
    figures_main=data["figures"]
    figures_retro=retro["figures"]
    main_ids=ordered(data);retro_ids=ordered(retro)
    assert len(main_ids)==18 and len(retro_ids)==31
    image_md=read(IMAGES).decode()
    image_md+="\n## Nature Synthesis 往期精选 · 已审核的全套31张源图\n"
    for sec in retro["sections"]:
        for pidx,ids in sec["figures_after_paragraph"].items():
            for fid in ids:
                f=next(x for x in retro["figures"] if x["id"]==fid)
                image_md+=f"\n- {fid}｜{sec['heading']}第{pidx}段｜{f['caption']}｜{f['repo_path']}"
    image_md+=f"\n- 先导图：{retro['lead_figure_id']}"
    image_md+=f"\n- 第二篇封面作者姓名校正版：{package['newRetroCover']}"
    (ROOT/IMAGES).write_text(image_md+"\n",encoding="utf-8")

    oldbodyset={row["path"] for row in oldgate["assets"] if row["path"]!=existing_cover["repo_path"]}
    allfigurepaths={f["repo_path"] for f in data["figures"]+retro["figures"]}
    assert len(allfigurepaths)==51
    assert oldbodyset.issubset(allfigurepaths)
    assert all(f["repo_path"] in allfigurepaths for f in figures_main+figures_retro)
    assets=[image_row(x) for x in sorted(allfigurepaths)]
    assert len(assets)==51
    assert package["newRetroCover"] in allfigurepaths
    for row in assetmeta:
        assert sha(read(row["path"]))==row["sha256"]
    figure_names={f["id"]:f for f in figures_main+figures_retro}
    label_re=re.compile(r"(?:原文\s+)?(?:Fig\.|Scheme\s+\d+|Table\s+\d+|Supporting Information\s+(?:Fig\.|Scheme|Table)|SI\s+(?:Fig\.|Scheme|Table))",re.I)
    for f in data["figures"]+retro["figures"]:
        if f.get("body") is False:continue
        assert label_re.search(f.get("caption","")),("Missing source fig number",f["id"])
        assert not isinstance(f.get("crop_frac"),list)
    review_src=[FEATURED,NEW_RETRO,EDITION,TEXT,IMAGES,PLAN]
    sources=[{"path":p,"blobSha":blob(read(p)),"sha256":sha(read(p))} for p in review_src]
    gate={"date":DATE,"revision":REV,"articleCount":2,"selectionAuthority":"explicit_user_selection",
          "selectionDois":[DA,RE],"textReview":"pass","imageReview":"pass",
          "strictFigurePlacement":True,"materializedCropReviewRequired":True,
          "artifacts":{"textOnly":TEXT,"imagesOnly":IMAGES},
          "sources":sources,"assets":assets,"publicSendAuthorized":False,"draftReadback":"pending",
          "reviewNotes":[
            "2026-10-10 08:00 formal review selected the exact user-submitted Angew DOI, 23 accepted, Gallery productionCards>=938.",
            "First article 10 sections, 35 research paragraphs, 18 source-authentic Scheme/SI numbered scientific figures.",
            "Nature Synthesis second article 31 already-approved scientific figures byte-identical to R4, only author name and lower cover label corrected to 仇友爱.",
            "Unnumbered SI illustrations not invented as numbered source figures; SI EMF graphs which rasterized incorrectly are not published.",
            "10.10 native full-title follows header-free cover. Square 1:1 and full 2.35:1 source chemical diagram region retained.",
            "2026-10-10 Fig placement and captions mapped by paragraph; independent source SHA256 for 51 exact decoded assets.",
            "This import is source-only. Draft publisher may run once only after approval, then perform actual draft/get. No public send."
          ]}
    write(GATE,encoded(gate),written)

    # Exercise the real publisher's review gate and text/image renderer without credentials.
    module_path=ROOT/"ops/wechat-publisher/create-draft.py"
    spec=importlib.util.spec_from_file_location("wechat_oct10_source_qa",module_path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    mod.require_editorial_review_gate(ROOT/GATE,[ROOT/FEATURED,ROOT/NEW_RETRO,ROOT/EDITION])
    today_url={f["id"]:"https://editorial.invalid/daily/"+f["id"]+".png" for f in figures_main}
    retro_url={f["id"]:"https://editorial.invalid/retro/"+f["id"]+".png" for f in figures_retro}
    slot,papers=mod.load_latest_release()
    assert slot=="2026-10-10T08:00:00+08:00",slot
    assert len(papers)==23,len(papers)
    dhtml=mod.build_content(slot,papers,data,today_url,gallery_qr_url="")
    rhtml=mod.build_retrospective_content(retro,retro_url)
    for output,ids,urls,m in [(dhtml,main_ids,today_url,data),(rhtml,retro_ids,retro_url,retro)]:
        parser=HTMLSeen();parser.feed(output)
        assert parser.images==[urls[x] for x in ids],("Unexpected image order",ids,parser.images)
        joined="".join(parser.text)
        for section in m["sections"]:
            for para in section["paragraphs"]:assert para in joined,("Omitted text",para[:100])
        for fid in ids:
            fig=next(f for f in m["figures"] if f["id"]==fid)
            assert fig["caption"] in joined
    assert "仇友爱" in edition["digest"]
    assert "邱友爱" not in edition["title"]+edition["digest"]+retro["title"]

    # Provenance and upload expectation; this is NOT a 微信 draft/get receipt.
    receipt={"date":DATE,"revision":REV,"status":"source_review_pass",
        "publicationSlot":slot,"acceptedToday":23,
        "title":edition["title"],"selectedDois":[DA,RE],
        "mainBodyImages":len(main_ids),"retroBodyImages":len(retro_ids),
        "reviewedAssets":len(assets),"textOnly":TEXT,"imagesOnly":IMAGES,"gatePath":GATE,
        "sameSourceRetro31":True,"retroChineseAuthor":"仇友爱","originalChemicalStructuresPreserved":True,
        "noFabricatedUnnumberedSIFigures":True,"renderedHtmlCheck":"pass","shaPinning":"pass",
        "draftWritten":False,"draftGetReadback":"not_run","publicSendAuthorized":False}
    write(QA,encoded(receipt),written)

    subprocess.run(["git","config","user.name","github-actions[bot]"],check=True)
    subprocess.run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],check=True)
    subprocess.run(["git","add","--",*sorted(written)],check=True)
    subprocess.run(["git","commit","-m","editorial: 2026-10-10 Angew / 仇友爱 Nature Synthesis reviewed two-article draft sources (no send)"],check=True)
    for i in range(5):
        subprocess.run(["git","fetch","origin","main"],check=True)
        reb=subprocess.run(["git","rebase","origin/main"])
        if reb.returncode!=0:
            subprocess.run(["git","rebase","--abort"],check=False)
            raise RuntimeError("Concurrent editor changed reviewed source; refusing overwrite")
        if subprocess.run(["git","push","origin","HEAD:main"]).returncode==0:
            print(json.dumps(receipt,ensure_ascii=False));return
    raise RuntimeError("Concurrent main moved repeatedly; no unsafe overwrite")

if __name__=="__main__":main()
