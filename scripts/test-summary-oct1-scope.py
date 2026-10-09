#!/usr/bin/env python3
"""Read-only regression for approved October 1+ Gallery summary eligibility."""
import datetime
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def eligible(article, cutoff):
    added = article.get("addedDate")
    if not isinstance(added, str) or not DATE.fullmatch(added):
        return False
    try:
        datetime.date.fromisoformat(added)
    except ValueError:
        return False
    return added >= cutoff


class SummaryScopeTests(unittest.TestCase):
    def setUp(self):
        self.policy = json.loads((ROOT / "audit/summary-publication-policy.json").read_text(encoding="utf-8"))
        self.cutoff = self.policy["minimumAddedDate"]

    def test_current_october_scope_inclusive(self):
        self.assertEqual(self.cutoff, "2026-10-01")
        self.assertEqual(self.policy["minimumArticleDate"], self.cutoff)
        self.assertEqual(self.policy["articleDateField"], "addedDate")
        self.assertTrue(self.policy["minimumDateInclusive"])

    def test_old_publisher_date_but_new_gallery_admission_is_in_scope(self):
        self.assertTrue(eligible({"date": "2026-08-01", "addedDate": "2026-10-01"}, self.cutoff))
        self.assertTrue(eligible({"date": "2026-09-30", "addedDate": "2026-10-09"}, self.cutoff))

    def test_old_added_date_cannot_be_promoted_by_new_publisher_date(self):
        self.assertFalse(eligible({"date": "2026-10-09", "addedDate": "2026-09-30"}, self.cutoff))

    def test_missing_or_invalid_added_date_must_not_be_guessed(self):
        for a in ({}, {"addedDate": ""}, {"addedDate": "2026-10-00"}, {"addedDate": "unknown"},
                  {"date": "2026-10-09"}, {"addedDate": "2026-11-32"}):
            self.assertFalse(eligible(a, self.cutoff))

    def test_registry_scope_and_approved_store_are_separate(self):
        registry = json.loads((ROOT / "public/toc-demand-live.json").read_text(encoding="utf-8"))
        summaries = json.loads((ROOT / "public/scheduled-article-summaries.json").read_text(encoding="utf-8"))
        items = summaries["items"]
        current = [a for a in registry["articles"] if eligible(a, self.cutoff)]
        ids = [a["doi"].lower() for a in current]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreater(len(ids), 0)
        existing = sum(items.get(doi, {}).get("status") == "approved" for doi in ids)
        self.assertLessEqual(existing, len(ids))
        self.assertEqual(summaries["schemaVersion"], "scheduled-reviewed-summary-v1")
        print("SUMMARY_OCT1_SCOPE", json.dumps({"activeCount":len(ids), "approvedRecordCount":existing,
                                               "pendingRecordCount":len(ids)-existing}, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
