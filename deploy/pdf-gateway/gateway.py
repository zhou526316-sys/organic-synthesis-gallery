#!/usr/bin/env python3
"""Owner-private PDF relay. No external packages; never stores or logs credentials/PDF bytes."""
import datetime
import http.client
import json
import os
import re
import socket
import sqlite3
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit, urlunsplit

UPSTREAM = os.environ.get("GALLERY_PDF_UPSTREAM", "api.gczhouwld.com")
PUBLIC_HOST = "pdf.gczhouwld.com"
GALLERY_ORIGIN = "https://gallery.gczhouwld.com"
LISTEN = ("127.0.0.1", 18867)
MAX_BODY = 8192
MAX_JSON = 65536
MAX_PDF = 60 * 1024 * 1024
# Conservative fixed portion of current inclusive 512-GB monthly outbound transfer package.
MONTHLY_BUDGET = 256 * 1024 * 1024
QUOTA_DB = os.environ.get("GALLERY_PDF_QUOTA_DB", "/var/lib/gallery-pdf-gateway/quota.sqlite3")
TLS = ssl.create_default_context()
SEM = threading.BoundedSemaphore(4)
LOCK = threading.Lock()
ALLOWED = {
    "/api/user-ui/auth/session": {"GET"},
    "/api/user-ui/auth/password/login": {"POST"},
    "/api/user-ui/auth/exchange": {"POST"},
    "/api/user-ui/auth/email/consume": {"POST"},
    "/api/user-ui/auth/register/consume": {"POST"},
    "/api/user-ui/private-pdf/status": {"GET"},
    "/api/user-ui/private-pdf/open": {"POST"},
    "/api/user-ui/private-pdf/file": {"GET", "HEAD"},
}
INCOMING = {"authorization", "range", "cookie", "content-type", "origin", "accept"}
OUTGOING = {"content-type", "content-disposition", "content-length", "content-range",
            "accept-ranges", "set-cookie", "server-timing", "x-gallery-pdf-status",
            "x-content-type-options"}
DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")
TOKEN_RE = re.compile(r"^(?:v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{32,128})$")


def quota_period():
    return (datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(hours=8)).strftime("%Y-%m")


def reserve_bytes(size):
    """Durable, atomic pessimistic reservation; abandoned transfers still count."""
    reserve = max(2048, int(size * 1.2) + 8192)
    if size < 0 or size > MAX_PDF or reserve > MONTHLY_BUDGET:
        return False
    with LOCK:
        db = sqlite3.connect(QUOTA_DB, timeout=3)
        try:
            db.execute("CREATE TABLE IF NOT EXISTS monthly_usage"
                       "(period TEXT PRIMARY KEY, reserved_bytes INTEGER NOT NULL)")
            db.execute("BEGIN IMMEDIATE")
            period = quota_period()
            used = db.execute("SELECT reserved_bytes FROM monthly_usage WHERE period=?",
                              (period,)).fetchone()
            if (used and used[0] + reserve > MONTHLY_BUDGET) or (
                    not used and reserve > MONTHLY_BUDGET):
                db.rollback()
                return False
            db.execute("INSERT INTO monthly_usage(period,reserved_bytes) VALUES(?,?)"
                       "ON CONFLICT(period) DO UPDATE SET reserved_bytes=reserved_bytes+excluded.reserved_bytes",
                       (period, reserve))
            db.commit()
            return True
        finally:
            db.close()


def rewrite_file_url(value, requested_mode):
    if not isinstance(value, str) or len(value) > 2500:
        raise ValueError("signed_url_invalid")
    parsed = urlsplit(value)
    if (parsed.scheme, parsed.netloc, parsed.path) != (
            "https", UPSTREAM, "/api/user-ui/private-pdf/file") or parsed.fragment:
        raise ValueError("signed_url_origin_invalid")
    query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=6)
    if len(query.get("token", [])) != 1 or not TOKEN_RE.fullmatch(query["token"][0]):
        raise ValueError("signed_url_ticket_invalid")
    if requested_mode == "download":
        if query.get("download") != ["1"]:
            raise ValueError("signed_url_download_flag_missing")
    elif "download" in query:
        raise ValueError("signed_url_view_flag_invalid")
    if set(query) - {"token", "download"}:
        raise ValueError("signed_url_parameters_invalid")
    return urlunsplit(("https", PUBLIC_HOST, parsed.path, parsed.query, ""))


class Reader(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "GalleryPdfGateway"
    sys_version = ""

    def log_message(self, *_):
        # No access logs: paths and query strings can contain private PDF tickets.
        pass

    def do_OPTIONS(self): self.handle_request("OPTIONS")
    def do_GET(self): self.handle_request("GET")
    def do_POST(self): self.handle_request("POST")
    def do_HEAD(self): self.handle_request("HEAD")

    def common_headers(self):
        self.send_header("Cache-Control", "private, no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Access-Control-Allow-Origin", GALLERY_ORIGIN)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type, range")
        self.send_header("Access-Control-Expose-Headers",
                         "content-length, content-range, accept-ranges, content-type, "
                         "x-gallery-pdf-status, server-timing")
        self.send_header("Vary", "Origin")

    def error_response(self, status, code):
        body = json.dumps({"error": code}, separators=(",", ":")).encode()
        try:
            self.send_response(status)
            self.common_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, socket.timeout, OSError):
            return

    def handle_request(self, method):
        try:
            self.connection.settimeout(75)
            uri = urlsplit(self.path)
            if (not self.path.startswith("/") or uri.fragment or len(self.path) > 4000
                    or uri.path not in ALLOWED and uri.path != "/_pdf_gateway_health"):
                return self.error_response(404, "not_found")
            if self.headers.get("Host", "") not in (
                    PUBLIC_HOST, "127.0.0.1:18867", "localhost:18867"):
                return self.error_response(421, "host_invalid")
            if uri.path == "/_pdf_gateway_health":
                if method == "GET" and not uri.query:
                    return self.reply_health()
                return self.error_response(404, "not_found")
            if self.headers.get("Origin") not in (None, GALLERY_ORIGIN):
                return self.error_response(403, "origin_not_allowed")
            if method == "OPTIONS":
                if uri.path not in ALLOWED:
                    return self.error_response(404, "not_found")
                self.send_response(204)
                self.common_headers()
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if method not in ALLOWED.get(uri.path, set()):
                return self.error_response(405, "method_not_allowed")
            if uri.path == "/api/user-ui/private-pdf/file":
                q = parse_qs(uri.query, keep_blank_values=True, max_num_fields=8)
                if len(q.get("token", [])) != 1 or not TOKEN_RE.fullmatch(q["token"][0]):
                    return self.error_response(401, "file_ticket_invalid")
                if set(q) - {"token", "download"}:
                    return self.error_response(400, "file_query_invalid")
            if uri.path == "/api/user-ui/private-pdf/open":
                q = parse_qs(uri.query, max_num_fields=8)
                if len(q.get("doi", [])) != 1 or not DOI_RE.fullmatch(q["doi"][0]):
                    return self.error_response(400, "doi_invalid")
                if q.get("mode", ["view"]) not in (["view"], ["download"]):
                    return self.error_response(400, "mode_invalid")
            if not SEM.acquire(blocking=False):
                return self.error_response(503, "gateway_busy")
            try:
                return self.forward(uri, method)
            finally:
                SEM.release()
        except (ValueError, UnicodeError):
            return self.error_response(400, "invalid_request")
        except (socket.timeout, TimeoutError, ssl.SSLError, OSError, http.client.HTTPException):
            return self.error_response(502, "upstream_unavailable")
        except Exception:
            # Never serialize request, source exception, private object paths or token.
            return self.error_response(502, "gateway_failure")

    def reply_health(self):
        payload = b'{"ok":true,"role":"private-pdf-ingress","authenticated":false}'
        self.send_response(200)
        self.common_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def forward(self, uri, method):
        amount = self.headers.get("Content-Length", "0")
        if not re.fullmatch(r"\d{1,5}", amount):
            return self.error_response(400, "body_length_invalid")
        count = int(amount)
        if count > MAX_BODY or (method != "POST" and count):
            return self.error_response(413, "body_too_large")
        body = self.rfile.read(count) if count else None
        request_headers = {"Host": UPSTREAM, "Accept-Encoding": "identity"}
        for name, value in self.headers.items():
            if name.lower() in INCOMING:
                request_headers[name] = value
        request_headers["Origin"] = GALLERY_ORIGIN
        upstream = http.client.HTTPSConnection(UPSTREAM, timeout=18, context=TLS)
        try:
            upstream.request(method, uri.path + ("?" + uri.query if uri.query else ""),
                             body=body, headers=request_headers)
            response = upstream.getresponse()
            content_type = response.getheader("content-type", "")
            headers = [(name, value) for name, value in response.getheaders()
                       if name.lower() in OUTGOING]
            is_file = uri.path == "/api/user-ui/private-pdf/file" and response.status in (200, 206)
            if is_file:
                if not content_type.lower().startswith("application/pdf"):
                    return self.error_response(502, "file_type_invalid")
                raw_length = response.getheader("Content-Length", "")
                if not re.fullmatch(r"\d{1,9}", raw_length):
                    return self.error_response(502, "file_length_invalid")
                length = int(raw_length)
                if not reserve_bytes(length):
                    return self.error_response(429, "gateway_transfer_quota_exhausted")
                self.send_response(response.status)
                self.common_headers()
                for name, value in headers:
                    if name.lower() not in {"cache-control", "content-encoding"}:
                        self.send_header(name, value)
                self.end_headers()
                if method != "HEAD":
                    left = length
                    while left > 0:
                        chunk = response.read(min(128 * 1024, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
                return

            size = response.getheader("Content-Length", "")
            if size and (not size.isdecimal() or int(size) > MAX_JSON):
                return self.error_response(502, "upstream_json_too_large")
            content = response.read(MAX_JSON + 1)
            if len(content) > MAX_JSON:
                return self.error_response(502, "upstream_response_too_large")
            # Rewritten short-lived URL keeps this alternative ingress independent.
            if uri.path == "/api/user-ui/private-pdf/open" and response.status == 200:
                if not content_type.lower().startswith("application/json"):
                    return self.error_response(502, "open_response_type_invalid")
                data = json.loads(content)
                if isinstance(data, dict) and data.get("available") is True:
                    requested_mode = parse_qs(uri.query).get("mode", ["view"])[0]
                    data["url"] = rewrite_file_url(data.get("url"), requested_mode)
                    content = json.dumps(data, separators=(",", ":")).encode()
            if not reserve_bytes(len(content)):
                return self.error_response(429, "gateway_transfer_quota_exhausted")
            self.send_response(response.status)
            self.common_headers()
            for name, value in headers:
                if name.lower() not in {"cache-control", "content-length", "content-encoding", "transfer-encoding"}:
                    self.send_header(name, value)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            if method != "HEAD":
                self.wfile.write(content)
        finally:
            upstream.close()


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(LISTEN, Reader)
    server.daemon_threads = True
    try:
        server.serve_forever(poll_interval=.5)
    finally:
        server.server_close()
