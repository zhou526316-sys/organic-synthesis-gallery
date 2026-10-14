"""Owner-directed cover/title-only patch; never regenerates or approves article bodies."""
from __future__ import annotations
import copy
import hashlib
import json
import re
import struct
from pathlib import Path
from datetime import datetime, timezone

ACTION = "update_covers_title_only"
PLAN = "audit/wechat-working/2026-10-14-user-images-cover-title-plan.json"
MEDIA = "KhELYUzvwADwB_l1xH1SWK0GEUwdJcrzZUnUqTu1MZdQpaEILGEgEcWC4qU-DSzy"
DATE = "2026-10-14"
ALLOWED = ("article_type", "title", "author", "digest", "content", "content_source_url", "thumb_media_id", "need_open_comment", "only_fans_can_comment", "pic_crop_235_1", "pic_crop_1_1")
IMMUTABLE = ("content", "author", "digest", "content_source_url", "need_open_comment", "only_fans_can_comment")

def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def fingerprint(item: dict) -> dict:
    return {key: sha(str(item.get(key, "")).encode("utf8")) for key in IMMUTABLE}

def run(p, args, request: dict) -> int:
    if (request.get("action") != ACTION or request.get("publicationDate") != DATE
        or request.get("expectedExistingMediaId") != MEDIA
        or request.get("draftOnly") is not True
        or request.get("publicSendAuthorized") is not False
        or request.get("bodyChangeAuthorized") is not False
        or request.get("requireDraftGetReadback") is not True
        or request.get("planPath") != PLAN or args.publish or args.media_id):
        raise RuntimeError("Cover/title-only request invalid; no write")
    if not args.create:
        print(json.dumps({"stage": "plan", "scope": "two covers and retrospective native title only", "body_modified": False}))
        return 0
    plan_file = p.ROOT / PLAN
    if sha(plan_file.read_bytes()) != request.get("planSha256"):
        raise RuntimeError("Reviewed metadata plan fingerprint differs; no write")
    plan = json.loads(plan_file.read_text(encoding="utf8"))
    if (plan.get("scopeApproval") != "pass_covers_and_native_title_only"
        or plan.get("bodyApprovalGranted") is not False
        or plan.get("expectedExistingMediaId") != MEDIA or len(plan.get("articles", [])) != 2):
        raise RuntimeError("No scoped metadata approval; full editorial hold cannot authorize this update")
    assets = []
    for spec in plan["articles"]:
        path = (p.ROOT / spec["assetPath"]).resolve()
        path.relative_to(p.ROOT.resolve())
        data = path.read_bytes()
        if (sha(data) != spec["assetSha256"] or data[:8] != bytes.fromhex("89504e470d0a1a0a")
            or struct.unpack(">II", data[16:24]) != (2680, 800)):
            raise RuntimeError("Original image canvas hash or dimensions incorrect")
        assets.append(path)
    hold_file = p.ROOT / "audit/wechat-working/2026-10-14-review-gate.json"
    hold_sha = sha(hold_file.read_bytes())
    state = p.load_state(p.DEFAULT_STATE)
    if state.get("publicationDate") != DATE or state.get("media_id") != MEDIA or int(state.get("articleCount", 0)) != 2:
        raise RuntimeError("Current draft identity differs from the owner-approved existing Oct14 draft")
    p.load_env(Path(args.env_file))
    token = p.get_access_token()
    current = p.get_draft(token, MEDIA)
    items = current.get("news_item", [])
    if len(items) != 2:
        raise RuntimeError("Expected exactly two articles")
    expected_urls = [s["sourceUrl"] for s in plan["articles"]]
    p.assert_draft_source_links(current, expected_urls)
    if items[0].get("title") != plan["articles"][0]["expectedTitle"]:
        raise RuntimeError("Today's existing native title changed; preserve and stop")
    if items[1].get("title") not in (plan["articles"][1]["expectedTitle"], plan["articles"][1]["newTitle"]):
        raise RuntimeError("Retrospective title differs from reviewed source")
    if not re.search(r"20\s*篇", str(items[0].get("content", ""))):
        raise RuntimeError("Expected corrected20 daily bulletin absent; do not rewrite the body")
    checkpoint_path = p.DEFAULT_STATE.parent / "oct14-user-covers-title-checkpoint.json"
    checkpoint = p.load_state(checkpoint_path)
    request_id = str(request.get("requestId") or "")
    if not request_id:
        raise RuntimeError("Missing idempotency key")
    snapshots = [fingerprint(i) for i in items]
    if checkpoint.get("requestId") == request_id:
        if checkpoint.get("bodyFingerprints") != snapshots:
            raise RuntimeError("Body changed since the partial metadata update; do not overwrite")
        snapshots = checkpoint["bodyFingerprints"]
    else:
        checkpoint = {"requestId":request_id,"mediaId":MEDIA,"bodyFingerprints":snapshots,"status":"before_metadata_write"}
        p.save_state(checkpoint_path, checkpoint)
    thumbs = []
    for index, (item, spec, path) in enumerate(zip(items, plan["articles"], assets)):
        cache = p.DEFAULT_STATE.parent / ("oct14-user-cover-" + str(index) + ".json")
        thumb = p.upload_permanent_image(token, path, cache)
        thumbs.append(thumb)
        article = {key: copy.deepcopy(item[key]) for key in ALLOWED if key in item}
        article["thumb_media_id"] = thumb
        article["pic_crop_235_1"] = spec["crop235"]
        article["pic_crop_1_1"] = spec["crop11"]
        if index == 1:
            article["title"] = spec["newTitle"]
        if fingerprint(article) != snapshots[index]:
            raise RuntimeError("Nonmetadata fields altered before sending")
        if (item.get("thumb_media_id") != thumb or item.get("title") != article["title"]
            or item.get("pic_crop_235_1") != spec["crop235"] or item.get("pic_crop_1_1") != spec["crop11"]):
            p.update_draft(token, MEDIA, article, index=index)
        checkpoint["completedIndex"] = index
        p.save_state(checkpoint_path, checkpoint)
    after = p.get_draft(token, MEDIA)
    p.assert_draft_source_links(after, expected_urls)
    actual = after.get("news_item", [])
    if len(actual) != 2 or [fingerprint(i) for i in actual] != snapshots:
        raise RuntimeError("Official readback changed body, digest, source link or comment flags; metadata acceptance failed")
    crop_readback = []
    for index,(item, spec) in enumerate(zip(actual, plan["articles"])):
        title = spec["expectedTitle"] if index == 0 else spec["newTitle"]
        if item.get("title") != title or item.get("thumb_media_id") != thumbs[index]:
            raise RuntimeError("Official readback title or cover media mismatch")
        entry={"article":index,"expected235":spec["crop235"],"expected11":spec["crop11"],"fields":{}}
        for key,expected in (("pic_crop_235_1",spec["crop235"]),("pic_crop_1_1",spec["crop11"])):
            if key in item:
                # Some WeChat deployments round coordinate strings or omit these fields.
                found=[float(x) for x in re.split(r"[_ ,]+",str(item[key])) if x]
                target=[float(x) for x in expected.split("_")]
                if len(found)!=4 or any(abs(a-b)>1e-5 for a,b in zip(found,target)):
                    raise RuntimeError("Readback crop coordinates disagree with reviewed full-content framing")
                entry["fields"][key]=item[key]
        crop_readback.append(entry)
    if sha(hold_file.read_bytes()) != hold_sha:
        raise RuntimeError("Global body editorial hold changed unexpectedly")
    preview_path,preview_url=p.write_draft_preview(after,media_id=MEDIA,preview_dir=Path(args.preview_dir),base_url=args.preview_base_url)
    # Only the preview presentation: use the actual WeChat atlas thumbnails, crop left wide / right square.
    # Titles are displayed below the cover instead of painted over the chemistry. It is not a native-client screenshot.
    markup=preview_path.read_text(encoding="utf8")
    css="<style id='owner-cover-crop-preview'>.push-card-main img{object-position:left center!important}.push-card-sub img{object-position:right center!important}.push-card-main .cover-title{position:static!important;color:#222!important;font-size:16px!important;line-height:1.5!important;max-height:none!important;display:block!important;padding:10px 0 0!important}.push-card-main .cover-frame{overflow:visible!important}</style>"
    markup=markup.replace("</head>",css+"</head>").replace("封面排版示意", "微信已保存封面 · 宽图/方图裁切示意")
    preview_path.write_text(markup,encoding="utf8")
    (Path(args.preview_dir)/"latest.html").write_text(markup,encoding="utf8")
    proof={"requestId":request_id,"publicationDate":DATE,"scope":"covers_and_second_native_title_only","mediaId":MEDIA,
      "bodyUnchanged":True,"bodyFingerprintsBefore":snapshots,"bodyFingerprintsAfter":[fingerprint(i) for i in actual],
      "titles":[i["title"] for i in actual],"sourceLinks":expected_urls,"coverMediaIds":thumbs,
      "cropReadback":crop_readback,"fullEditorialHoldSha256":hold_sha,"fullEditorialApprovalGranted":False,
      "publicSend":False,"previewUrl":preview_url,"createdAt":datetime.now(timezone.utc).isoformat(),
      "coverSources":plan["sources"],"nativeMobileClientInspected":False}
    proof_name=preview_path.stem+"-cover-proof.json"
    (Path(args.preview_dir)/proof_name).write_text(json.dumps(proof,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    checkpoint.update(status="verified",previewUrl=preview_url)
    p.save_state(checkpoint_path,checkpoint)
    print(json.dumps({"stage":"draft_cover_title_update","media_id":MEDIA,"publicationSlot":DATE+"T08:00:00+08:00",
      "paper_count":20,"article_count":2,"draft_readback":"ok","preview_path":str(preview_path),"preview_url":preview_url,
      "content_source_url":expected_urls[0],"publish_id":None,"body_unchanged":True,"new_draft_created":False,
      "proof_url":args.preview_base_url.rstrip("/")+"/"+proof_name,"titles":proof["titles"],"crop_readback":crop_readback,
      "full_editorial_approval_granted":False},ensure_ascii=False))
    return 0
