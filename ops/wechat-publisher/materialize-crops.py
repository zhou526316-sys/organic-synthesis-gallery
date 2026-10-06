#!/usr/bin/env python3
from __future__ import annotations
import io, json, math, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[2]

def load_image(url:str)->Image.Image:
    req=urllib.request.Request(url,headers={
        "User-Agent":"Mozilla/5.0 (compatible; OrganicSynthesisGallery/1.0)",
        "Accept":"image/png,image/jpeg,image/*;q=0.9,*/*;q=0.1",
    })
    with urllib.request.urlopen(req,timeout=90) as r:
        data=r.read()
    im=Image.open(io.BytesIO(data))
    im.load()
    return im.convert("RGB")

def crop_frac(im:Image.Image, frac):
    x0,y0,x1,y1=[float(v) for v in frac]
    x0=max(0,min(1,x0)); y0=max(0,min(1,y0)); x1=max(x0+0.001,min(1,x1)); y1=max(y0+0.001,min(1,y1))
    return im.crop((round(im.width*x0),round(im.height*y0),round(im.width*x1),round(im.height*y1)))

def save_proof(source:Image.Image, frac, crop:Image.Image, target:Path):
    preview=source.copy()
    d=ImageDraw.Draw(preview)
    x0,y0,x1,y1=[float(v) for v in frac]
    rect=(round(preview.width*x0),round(preview.height*y0),round(preview.width*x1)-1,round(preview.height*y1)-1)
    width=max(3,round(min(preview.size)*0.008))
    d.rectangle(rect,outline=(220,0,0),width=width)
    maxw=1200
    if preview.width>maxw:
        h=round(preview.height*maxw/preview.width)
        preview=preview.resize((maxw,h),Image.Resampling.LANCZOS)
    crop_preview=crop.copy()
    if crop_preview.width>maxw:
        h=round(crop_preview.height*maxw/crop_preview.width)
        crop_preview=crop_preview.resize((maxw,h),Image.Resampling.LANCZOS)
    gap=24
    canvas=Image.new("RGB",(max(preview.width,crop_preview.width),preview.height+gap+crop_preview.height),"white")
    canvas.paste(preview,(0,0)); canvas.paste(crop_preview,(0,preview.height+gap))
    target.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(target,"JPEG",quality=88,optimize=True,progressive=False)

def main():
    recipe_path=ROOT/"audit/wechat-working/2026-10-06-crop-recipes.json"
    obj=json.loads(recipe_path.read_text(encoding="utf-8"))
    cache={}
    for item in obj["items"]:
        out=(ROOT/item["output"]).resolve()
        out.parent.mkdir(parents=True,exist_ok=True)
        if item.get("components"):
            crops=[]
            for comp in item["components"]:
                url=comp["source_url"]
                if url not in cache: cache[url]=load_image(url)
                crops.append(crop_frac(cache[url],comp["crop_frac"]))
            width=max(x.width for x in crops)
            gap=int(item.get("gap",28))
            padded=[]
            for im in crops:
                if im.width!=width:
                    h=round(im.height*width/im.width)
                    im=im.resize((width,h),Image.Resampling.LANCZOS)
                padded.append(im)
            total=sum(x.height for x in padded)+gap*(len(padded)-1)
            canvas=Image.new("RGB",(width,total),"white")
            y=0
            for im in padded:
                canvas.paste(im,(0,y)); y+=im.height+gap
            canvas.save(out,"PNG",optimize=True)
            # component proofs
            for idx,comp in enumerate(item["components"],1):
                src=cache[comp["source_url"]]
                cr=crop_frac(src,comp["crop_frac"])
                save_proof(src,comp["crop_frac"],cr,ROOT/item["proof"].replace(".jpg",f"-part{idx}.jpg"))
        else:
            url=item["source_url"]
            if url not in cache: cache[url]=load_image(url)
            src=cache[url]
            cr=crop_frac(src,item["crop_frac"])
            cr.save(out,"PNG",optimize=True)
            save_proof(src,item["crop_frac"],cr,ROOT/item["proof"])
        # verify decodable
        with Image.open(out) as chk:
            chk.load()
            if chk.width<120 or chk.height<80:
                raise RuntimeError(f"crop too small: {item['id']} {chk.size}")
    print(json.dumps({"ok":True,"count":len(obj["items"])},ensure_ascii=False))

if __name__=="__main__":
    main()
