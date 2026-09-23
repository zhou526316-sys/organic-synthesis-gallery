#!/usr/bin/env python3
"""Materialize exact already-reviewed R2 body-image bytes into immutable audit assets.

This script is deliberately one-way: R2 GET only, repository file writes only. It does not
publish media, mutate staging, discover publisher pages, or make semantic approval decisions.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request

GENERATION = 1790082000000
ASSET_RE = re.compile(r"^audit/media-recovery/body-batches/assets/([a-f0-9]{64})\.(svg|png|webp)$")
R2_RE = re.compile(r"^local-captures/article-figures/images/[a-f0-9]{24}/(?:figure|scheme|chart)-\d+-([a-f0-9]{16})\.(svg|png|webp)$")
MANIFEST_RE = re.compile(r"^audit/media-recovery/body-batches/[a-z0-9][a-z0-9-]*\.json$")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def demand(ok: bool, reason: str) -> None:
    if not ok:
        raise RuntimeError(reason)


def get_r2(key: str) -> bytes:
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    demand(bool(account and token), "r2_credentials_missing")
    demand(R2_RE.fullmatch(key) is not None and ".." not in key, "r2_key_invalid")
    url = (
        "https://api.cloudflare.com/client/v4/accounts/"
        + account
        + "/r2/buckets/organic-synthesis-gallery-media/objects/"
        + urllib.parse.quote(key, safe="/")
    )
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=25) as response:
        raw = response.read(4_000_001)
    demand(100 <= len(raw) <= 4_000_000, "r2_object_size_invalid")
    return raw


def validate_manifest(path: Path) -> list[dict]:
    rel = path.as_posix()
    demand(MANIFEST_RE.fullmatch(rel) is not None, "manifest_path_invalid")
    doc = json.loads(path.read_text(encoding="utf-8"))
    items = doc.get("items")
    demand(doc.get("schemaVersion") == 1, "manifest_schema_invalid")
    demand(doc.get("mediaGeneration") == GENERATION, "manifest_generation_invalid")
    demand(isinstance(items, list) and 0 < len(items) <= 30, "manifest_item_count_invalid")
    demand(doc.get("approvedCount") == len(items), "manifest_approved_count_invalid")
    demand(len({str(item.get("doi", "")).lower() for item in items}) <= 5, "manifest_article_limit")
    return items


def materialize(item: dict) -> tuple[str, bool]:
    sha = str(item.get("sha256", "")).lower()
    asset = str(item.get("assetPath", ""))
    key = str(item.get("originalR2Key", ""))
    asset_match = ASSET_RE.fullmatch(asset)
    key_match = R2_RE.fullmatch(key)
    demand(item.get("approved") is True and item.get("review", {}).get("decision") == "approved", "explicit_review_required")
    demand(re.fullmatch(r"[a-f0-9]{64}", sha) is not None, "sha256_invalid")
    demand(asset_match is not None and asset_match.group(1) == sha, "asset_path_hash_mismatch")
    demand(key_match is not None and key_match.group(1) == sha[:16], "r2_key_hash_mismatch")
    demand(asset_match.group(2) == key_match.group(2), "asset_extension_mismatch")
    demand(item.get("mediaGeneration") == GENERATION, "item_generation_invalid")
    expected_bytes = int(item.get("byteLength") or 0)
    demand(100 <= expected_bytes <= 4_000_000, "item_byte_length_invalid")
    target = Path(asset)
    if target.exists():
        existing = target.read_bytes()
        demand(hashlib.sha256(existing).hexdigest() == sha and len(existing) == expected_bytes, "existing_asset_conflict")
        return asset, False
    raw = get_r2(key)
    demand(len(raw) == expected_bytes, "r2_object_length_mismatch")
    demand(hashlib.sha256(raw).hexdigest() == sha, "r2_object_digest_mismatch")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    return asset, True


def main(argv: list[str]) -> int:
    demand(len(argv) > 1, "manifest_argument_required")
    paths = [Path(value) for value in argv[1:]]
    demand(len(paths) <= 5, "too_many_manifests")
    created: list[str] = []
    reused: list[str] = []
    seen_assets: set[str] = set()
    for path in paths:
        for item in validate_manifest(path):
            asset = str(item.get("assetPath", ""))
            demand(asset not in seen_assets, "duplicate_asset_in_input")
            seen_assets.add(asset)
            name, changed = materialize(item)
            (created if changed else reused).append(name)
    print(json.dumps({"materialized": len(created), "reused": len(reused), "assets": sorted(created)}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv))
    except Exception as exc:
        print("MATERIALIZE_APPROVED_BODY_FAILED " + type(exc).__name__ + ":" + str(exc), file=sys.stderr)
        raise
