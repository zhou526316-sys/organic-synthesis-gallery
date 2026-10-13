#!/usr/bin/env python3
"""Read-only actual Gallery media/batch provenance for WeChat mini-cards.
No tokens, WeChat API calls, media uploads, Gallery writes or source edits."""
import json,urllib.request,urllib.error,sys
from pathlib import Path
state=json.loads(Path("audit/literature-update-state.json").read_text())["lastPublication"]
assert state["publicationSlot"]=="2026-10-13T08:00:00+08:00"
dois=state["publishedDois"]
assert len(dois)==12, f"Unexpected formal count {len(dois)}"
data=json.dumps({"dois":dois}).encode()
url="https://api.gczhouwld.com/api/media/batch"
req=urllib.request.Request(url,data=data,method="POST",
headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"OSG-WeChat-ReadOnly-QA/1.0"})
try:
  with urllib.request.urlopen(req,timeout=45) as r:
    b=r.read(); code=r.status; typ=r.headers.get("content-type","")
except urllib.error.HTTPError as e:
  code=e.code;typ=e.headers.get("content-type","");b=e.read()
except Exception as e:
  print("MEDIA_BATCH_CONNECTION_ERROR",str(e));sys.exit(3)
print("MEDIA_BATCH_HTTP",code,"CONTENT_TYPE",typ,"bytes",len(b))
try:
  obj=json.loads(b)
except Exception as e:
  print("MEDIA_BATCH_NON_JSON",b[:500].decode(errors="replace"));sys.exit(3)
if code!=200:
  print("MEDIA_BATCH_HTTP_ERROR",json.dumps(obj,ensure_ascii=False)[:1000]);sys.exit(2)
items=obj.get("items") or obj.get("body",{}).get("items") or []
out={"source":"2026-10-13T08:00:00+08:00","http":code,"count":len(items),"items":[]}
for item in items:
  toc=item.get("toc") or {}; pri=item.get("primary") or {}; fs=item.get("figures") or {}
  record={"doi":item.get("doi"),"tocAvailable":toc.get("available"),"tocReason":toc.get("reason"),
   "tocImage":bool(toc.get("imageUrl")),"tocURL":toc.get("imageUrl"),
   "primaryAvailable":pri.get("available"),"primaryKind":pri.get("kind"),
   "primaryImage":bool(pri.get("imageUrl")),"primaryURL":pri.get("imageUrl"),
   "figureCount":len(fs.get("figures") or []) if isinstance(fs,dict) else 0}
  out["items"].append(record)
  print("MEDIA_CARD",json.dumps({k:v for k,v in record.items() if not k.endswith("URL")},ensure_ascii=False))
Path("/tmp/wechat-oct13-media-diagnostic.json").write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
assert len(items)==12,"Worker missed selected DOI(s)"
