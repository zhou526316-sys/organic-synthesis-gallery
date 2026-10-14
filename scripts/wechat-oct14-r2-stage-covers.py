#!/usr/bin/env python3
"""Stage exactly two visually reviewed Oct14 R2 covers, not the 25 paper/SI figures."""
import hashlib, io, json, os, pathlib, urllib.request, zipfile
from PIL import Image
root=pathlib.Path.cwd()
url=os.environ["ORIGINAL_COVER_ARCHIVE"]
headers={"User-Agent":"Mozilla/5.0","Accept":"application/zip,application/octet-stream"}
with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as r:
    raw=r.read(4_000_000)
if raw[:2]!=b"PK":raise RuntimeError("Zip source unavailable")
z=zipfile.ZipFile(io.BytesIO(raw))
expected={
  "cover_featured_r2.png":("e5c09db82ea8f7d5fcf2484756d0af3d2bfb9d4c4f16f9143cd05509ce9816cb",(1880,800),"cover_featured.png"),
  "cover_retrospective_r2.png":("0bab4bd15dbe65cfd78cd9766363a4ff2720f63381c414b977386398501c2bcc",(800,800),"cover_retrospective.png")
}
assert set(z.namelist())==set(expected)|{"cover-transfer-manifest.json"},z.namelist()
for name,(expectedsha,size,outname) in expected.items():
    contents=z.read(name);digest=hashlib.sha256(contents).hexdigest()
    if digest!=expectedsha:raise RuntimeError("Cover SHA mismatch "+name)
    im=Image.open(io.BytesIO(contents));im.load()
    if im.size!=size or im.format!="PNG":raise RuntimeError("Cover raster size/type mismatch")
    p=root/"public/wechat-assets/reviewed/2026-10-14-r2"/outname
    p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(contents)
    print(json.dumps({"file":str(p),"SHA256":digest,"bytes":len(contents),"size":size}))
