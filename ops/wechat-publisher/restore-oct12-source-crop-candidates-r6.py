#!/usr/bin/env python3
"""Restore R6 WeChat figure-crop CANDIDATES directly from SHA-pinned owner PDFs.

This pipeline never rewrites molecule graphics, never obtains credentials,
never changes production manifests/review gate and never contacts WeChat.
All outputs remain in audit review staging until independently inspected.
"""
import hashlib
import io
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REQUEST = ROOT / "audit/automation-triggers/wechat-oct12-r6-source-crops.json"
STAGING = Path("/tmp/wechat-oct12-r6-pixel-source")
CANDIDATES = STAGING / "candidates"
REVISION = "2026-10-12-r6"

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main():
    req = json.loads(REQUEST.read_text())
    assert req["revision"] == REVISION and req["date"] == "2026-10-12"
    assert req["action"] == "render_exact_original_figures_candidates"
    assert req["draftWriteAuthorized"] is False
    assert req["publicSendAuthorized"] is False
    assert set(req["selectedDois"]) == {"10.1021/jacs.6c10406", "10.1021/acscatal.6c06048"}
    assert len(req["crops"]) == 20
    assert set(req["sources"]) == {"jacs", "acscatal", "acscatal_si"}

    STAGING.mkdir(parents=True, exist_ok=True)
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    source_files = {}
    source_receipts = {}
    for key, source in req["sources"].items():
        url = str(source["downloadUrl"])
        assert urlparse(url).hostname == "at.adobe.com"
        expected = str(source["sha256"])
        assert len(expected) == 64
        dest = STAGING / (key + ".pdf")
        subprocess.run(["curl", "-fsSL", "--retry", "2", "--retry-delay", "2",
                        "--max-time", "120", "--output", str(dest), url], check=True)
        payload = dest.read_bytes()
        assert payload.startswith(b"%PDF-"), (key, "not a PDF")
        assert digest(payload) == expected, (key, "source PDF fingerprint mismatch")
        source_files[key] = dest
        source_receipts[key] = {"originalSha256": expected, "bytes": len(payload),
                                "doi": source["doi"]}
    page_cache = {}
    receipts = []
    used_names = set()
    for spec in req["crops"]:
        name = str(spec["id"])
        assert name not in used_names
        used_names.add(name)
        target = CANDIDATES / (name + ".png")
        src = str(spec["source"])
        bounds = spec["bounds"]
        assert len(bounds) == 4 and 0 <= bounds[0] < bounds[2] <= 1 and 0 <= bounds[1] < bounds[3] <= 1
        if src == "jacs_si_existing":
            p = ROOT / spec["imageSource"]
            assert p.is_file() and digest(p.read_bytes()) == spec["imageSha256"]
            with Image.open(p) as raster:
                raster.load()
                original = raster.convert("RGB")
                source_label = str(spec["imageSource"])
        else:
            assert src in source_files
            page = int(spec["page"])
            assert 1 <= page <= 80
            ref = (src, page)
            if ref not in page_cache:
                png_stem = STAGING / (src + "-" + str(page))
                subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page),
                                "-r", "220", "-png", "-singlefile",
                                str(source_files[src]), str(png_stem)], check=True,
                               stdout=subprocess.DEVNULL)
                page_cache[ref] = Path(str(png_stem) + ".png")
            with Image.open(page_cache[ref]) as raster:
                raster.load()
                original = raster.convert("RGB")
                source_label = f"{src} original journal PDF p{page}"
        w, h = original.size
        rect = tuple(round(v * (w if i % 2 == 0 else h)) for i, v in enumerate(bounds))
        result = original.crop(rect)
        assert result.width > 150 and result.height > 120
        result.save(target, "PNG", optimize=True)
        payload = target.read_bytes()
        receipts.append({"id": name, "source": source_label, "page": spec.get("page"),
                         "originalSourceSize": [w, h], "normalizedBounds": bounds,
                         "outputSize": [result.width, result.height],
                         "sha256": digest(payload), "bytes": len(payload),
                         "visualReview": "pending"})
        print("FIGURE-CANDIDATE", name, result.width, result.height, len(payload))
    qa = {"revision": REVISION, "date": "2026-10-12",
          "status": "awaiting_independent_original_source_pixel_review",
          "sourceSha256Verified": source_receipts, "candidates": receipts,
          "expectedCount": len(receipts), "editorialManifestsModified": False,
          "wechatDraftModified": False, "reviewGateApproved": False,
          "massSent": False,
          "note": "These are source-authentic image candidates, NOT reviewed/production images. Inspect for cut chemistry, plot axes, scheme branches, table columns, captions and excessive marginal matter prior to promotion."}
    (CANDIDATES / "source-crop-review-qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    print("ARTIFACTS_STAGED_ONLY", len(receipts), "NO_DRAFT_WRITE")

if __name__ == "__main__":
    main()
