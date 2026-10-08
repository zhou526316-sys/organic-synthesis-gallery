"""Offline security and behavior tests for the zero-dependency PDF relay."""
import http.client
import importlib.util
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("owner_pdf_gateway", HERE / "gateway.py")
gateway = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gateway)

PDF = b"%PDF-1.7\n" + b"fixture page content\n" * 30 + b"%%EOF\n"
FAKE_TOKEN = "v2.fixturepayload.fixturesignature"


class Backend:
    BAD_URL = False
    calls = []

    def __init__(self, host, *args, **kwargs):
        if host != "api.gczhouwld.com":
            raise AssertionError("upstream host changed")
        self.req = None
        self.payload = io.BytesIO()

    def request(self, method, path, body=None, headers=None):
        self.req = (method, path, body, headers or {})
        Backend.calls.append((method, path.split("?")[0]))
        if headers.get("Host") != "api.gczhouwld.com":
            raise AssertionError("invalid upstream host")

    def getresponse(self):
        method, path, body, headers = self.req
        u = urlsplit(path)
        status = 200
        typ = "application/json"
        reply = {"ok": True}
        extra = {}
        if u.path == "/api/user-ui/private-pdf/open":
            if headers.get("Authorization") != "Bearer fixture-owner":
                status, reply = 401, {"error": "not_authenticated"}
            elif "absent" in u.query:
                reply = {"available": False, "doi": "10.0000/absent", "reason": "pdf_not_stored"}
            else:
                origin = "https://attacker.example" if Backend.BAD_URL else "https://api.gczhouwld.com"
                reply = {"available": True, "byteLength": len(PDF), "headerVerified": True,
                         "url": origin + "/api/user-ui/private-pdf/file?token=" + FAKE_TOKEN}
        elif u.path == "/api/user-ui/private-pdf/file":
            if FAKE_TOKEN not in u.query:
                status, reply = 401, {"error": "pdf_ticket_invalid"}
            else:
                typ = "application/pdf"
                reply = PDF
                if (headers.get("range") or headers.get("Range")) == "bytes=0-15":
                    status, reply = 206, PDF[:16]
                    extra["content-range"] = "bytes 0-15/" + str(len(PDF))
                extra.update({"accept-ranges": "bytes",
                              "set-cookie": "gpdf_test=v1.fixture; Path=/api/user-ui/private-pdf/file; Secure; HttpOnly; SameSite=Strict",
                              "content-disposition": "inline; filename*=UTF-8''fixture.pdf"})
        elif u.path == "/api/user-ui/auth/session":
            reply = {"authenticated": True, "user": {"capabilities": ["private_pdf_read"]}}
        else:
            status, reply = 404, {"error": "route_invalid"}
        data = reply if isinstance(reply, bytes) else json.dumps(reply).encode()
        return FakeResponse(status, typ, data, extra)

    def close(self):
        pass


class FakeResponse:
    def __init__(self, status, ctype, body, extras):
        self.status = status
        self.data = io.BytesIO(body)
        self.headers = [("content-type", ctype), ("content-length", str(len(body))),
                        ("cache-control", "private, no-store")] + list(extras.items())

    def getheader(self, name, default=None):
        for key, val in self.headers:
            if key.lower() == name.lower():
                return val
        return default

    def getheaders(self):
        return self.headers

    def read(self, n=None):
        return self.data.read(n)


class GatewayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="pdf-gateway-test-")
        gateway.QUOTA_DB = str(Path(cls.tmp.name) / "quota.sqlite3")
        cls.previous = http.client.HTTPSConnection
        http.client.HTTPSConnection = Backend
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), gateway.Reader)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        http.client.HTTPSConnection = cls.previous
        cls.tmp.cleanup()

    def setUp(self):
        Backend.calls.clear()
        Backend.BAD_URL = False
        gateway.MONTHLY_BUDGET = 256 * 1024 * 1024

    def request(self, method, url, body=None, origin="https://gallery.gczhouwld.com",
                host="pdf.gczhouwld.com", auth=None, extra=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        headers = {"Host": host}
        if origin is not None:
            headers["Origin"] = origin
        if auth:
            headers["Authorization"] = auth
        if extra:
            headers.update(extra)
        conn.request(method, url, body=body, headers=headers)
        res = conn.getresponse()
        value = res.read() if method != "HEAD" else b""
        out = (res.status, dict(res.getheaders()), value)
        conn.close()
        return out

    def test_health_is_anonymous_and_no_upstream_read(self):
        status, headers, body = self.request("GET", "/_pdf_gateway_health", origin=None)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["role"], "private-pdf-ingress")
        self.assertEqual(Backend.calls, [])

    def test_cors_options_works_but_cannot_bypass_security(self):
        status, headers, _ = self.request("OPTIONS", "/api/user-ui/private-pdf/open")
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], gateway.GALLERY_ORIGIN)
        self.assertIn("authorization", headers["Access-Control-Allow-Headers"])
        denied, _, _ = self.request("POST", "/api/user-ui/private-pdf/open?doi=10.1021%2Fjacs.6c12345")
        self.assertEqual(denied, 401)

    def test_owner_open_rewrites_signed_url_on_gateway(self):
        status, headers, body = self.request(
            "POST", "/api/user-ui/private-pdf/open?doi=10.1021%2Fjacs.6c12345&mode=view",
            auth="Bearer fixture-owner")
        self.assertEqual(status, 200)
        value = json.loads(body)
        self.assertTrue(value["available"])
        self.assertEqual(value["url"],
                         gateway.PUBLIC_HOST.join(["https://", "/api/user-ui/private-pdf/file?token=" + FAKE_TOKEN]))
        self.assertNotIn("api.gczhouwld.com", body.decode())
        self.assertEqual(headers["Cache-Control"], "private, no-store, max-age=0")

    def test_signed_file_range_cookie_and_full_get(self):
        endpoint = "/api/user-ui/private-pdf/file?token=" + FAKE_TOKEN
        part, headers, data = self.request("GET", endpoint, extra={"Range": "bytes=0-15"})
        self.assertEqual(part, 206)
        self.assertEqual(data, PDF[:16])
        self.assertEqual(headers["content-range"], "bytes 0-15/" + str(len(PDF)))
        self.assertIn("SameSite=Strict", headers["set-cookie"])
        full, headers, data = self.request("GET", endpoint)
        self.assertEqual(full, 200)
        self.assertEqual(data, PDF)
        head, headers, data = self.request("HEAD", endpoint)
        self.assertEqual(head, 200)
        self.assertEqual(data, b"")
        self.assertEqual(int(headers["content-length"]), len(PDF))

    def test_session_capability_is_proxied_without_local_grants(self):
        status, headers, body = self.request("GET", "/api/user-ui/auth/session")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["authenticated"])
        self.assertEqual(Backend.calls, [("GET", "/api/user-ui/auth/session")])

    def test_missing_pdf_must_stay_missing(self):
        status, _, body = self.request(
            "POST", "/api/user-ui/private-pdf/open?doi=10.0000%2Fabsent", auth="Bearer fixture-owner")
        self.assertEqual(status, 200)
        self.assertIs(json.loads(body)["available"], False)
        self.assertNotIn("url", json.loads(body))

    def test_cross_origin_and_unlisted_paths_blocked(self):
        x, _, _ = self.request("POST", "/api/user-ui/private-pdf/open?doi=10.1021%2Fjacs.6c12345",
                               origin="https://bad.example", auth="Bearer fixture-owner")
        self.assertEqual(x, 403)
        x, _, _ = self.request("GET", "/api/admin/private-pdf/capture-inventory")
        self.assertEqual(x, 404)
        x, _, _ = self.request("GET", "/api/user-ui/private-pdf/file?token=short")
        self.assertEqual(x, 401)
        x, _, _ = self.request("GET", "/_pdf_gateway_health", host="bad.example")
        self.assertEqual(x, 421)

    def test_bad_origin_in_signed_url_fails_closed(self):
        Backend.BAD_URL = True
        status, headers, body = self.request(
            "POST", "/api/user-ui/private-pdf/open?doi=10.1021%2Fjacs.6c12345",
            auth="Bearer fixture-owner")
        self.assertEqual(status, 400)
        self.assertNotIn(b"attacker.example", body)

    def test_monthly_budget_hard_stop_on_file(self):
        gateway.MONTHLY_BUDGET = 4096
        status, _, body = self.request("GET", "/api/user-ui/private-pdf/file?token=" + FAKE_TOKEN)
        self.assertEqual(status, 429)
        self.assertIn(b"quota", body)
        gateway.MONTHLY_BUDGET = 256 * 1024 * 1024


if __name__ == "__main__":
    unittest.main(verbosity=2)
