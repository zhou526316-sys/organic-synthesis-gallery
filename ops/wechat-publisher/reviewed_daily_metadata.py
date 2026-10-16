"""A source-bound, draft-only author completion; never edits a Gallery record."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

SLOT = "2026-10-16T08:00:00+08:00"
DOI = "10.1038/s41467-026-78630-6"
TITLE = "Rapid and versatile water-promoted oxidative [3+2] cycloaddition"
EVIDENCE = "audit/wechat-working/2026-10-16-integration-author-evidence.json"
EVIDENCE_BLOB = "6491588600eb5afd44ab703f668d57fa5b5060d1"
AUTHORS = ["Zheng-Yang Gu", "Bin Gao", "Jinxiang Ye", "Yang Zheng", "Liyun Wu", "Jiaxuan Li", "Ru-Yi Zhu"]


def complete_authors(root: Path, slot: str, paper: dict) -> dict:
    """Return a copy with verified authors only for this exact missing-field case.

    No DOI is added, no nonempty field is replaced, and no file is written.
    All other missing metadata remains subject to the publisher's strict gate.
    """
    result = dict(paper)
    if slot != SLOT or str(paper.get("doi", "")).lower() != DOI or paper.get("authors"):
        return result
    if paper.get("title") != TITLE or paper.get("journal") != "Nature Communications":
        raise RuntimeError("reviewed author completion: DOI/title/journal mismatch")
    raw = (Path(root) / EVIDENCE).read_bytes()
    actual = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    if actual != EVIDENCE_BLOB:
        raise RuntimeError("reviewed author completion: publisher evidence changed")
    source = json.loads(raw)
    if (source.get("date"), source.get("doi"), source.get("title"), source.get("authors"), source.get("sourceUrl")) != (
        SLOT[:10], DOI, TITLE, AUTHORS, "https://www.nature.com/articles/s41467-026-78630-6"
    ):
        raise RuntimeError("reviewed author completion: invalid source identity")
    result["authors"] = list(source["authors"])
    return result
