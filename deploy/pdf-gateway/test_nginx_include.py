#!/usr/bin/env python3
"""Protect the byte-level safety of the additive parent-Nginx include."""
import unittest
from nginx_include import (
    PDF_INCLUDE, MARKER, add_include, remove_include,
)


class NginxIncludeTests(unittest.TestCase):
    def test_explicit_relay_include_round_trip(self):
        raw = (b"worker_processes 2;\nhttp {\n"
               b"    include /etc/nginx/sites-enabled/osg-wechat-relay;\n}\n")
        patched = add_include(raw)
        self.assertIn(b"include " + PDF_INCLUDE + b"; # " + MARKER, patched)
        self.assertEqual(patched.count(MARKER), 1)
        self.assertEqual(remove_include(patched), (raw, True))

    def test_relative_relay_include_and_crlf(self):
        raw = b"http {\r\n  include sites-enabled/osg-wechat-relay;\r\n}\r\n"
        patched = add_include(raw)
        self.assertIn(MARKER + b"\r\n", patched)
        self.assertEqual(remove_include(patched)[0], raw)

    def test_no_matching_include_fails_without_modification(self):
        raw = b"http {\n include /etc/nginx/sites-enabled/*;\n}\n"
        with self.assertRaisesRegex(ValueError, "exactly one"):
            add_include(raw)
        self.assertEqual(remove_include(raw), (raw, False))

    def test_duplicate_relay_include_fails(self):
        raw = (b"http {\n"
               b" include /etc/nginx/sites-enabled/osg-wechat-relay;\n"
               b" include /etc/nginx/sites-enabled/osg-wechat-relay;\n}\n")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            add_include(raw)

    def test_unmanaged_existing_pdf_include_fails(self):
        raw = (b"http {\n"
               b" include /etc/nginx/sites-enabled/osg-wechat-relay;\n"
               b" include /etc/nginx/sites-enabled/gallery-pdf-gateway;\n}\n")
        with self.assertRaisesRegex(ValueError, "Unmanaged"):
            add_include(raw)
        self.assertEqual(remove_include(raw), (raw, False))

    def test_refuse_altered_or_duplicate_markers(self):
        raw = (b"http {\n"
               b" include /etc/nginx/sites-enabled/gallery-pdf-gateway; "
               b"# GALLERY_PDF_GATEWAY_INCLUDE_MANAGED_V1\n}\n")
        with self.assertRaisesRegex(ValueError, "already exists"):
            add_include(raw)
        self.assertEqual(remove_include(raw)[1], True)
        with self.assertRaisesRegex(ValueError, "duplicated"):
            remove_include(raw + raw)
        with self.assertRaisesRegex(ValueError, "Modified"):
            remove_include(b"#" + MARKER + b"\n")


if __name__ == "__main__":
    unittest.main()
