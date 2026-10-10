#!/usr/bin/env bash
# Isolated Nginx regression reproducing live Tencent topology (wildcard and
# loopback listeners, relay default, PDF sibling). No production ports/files.
set -Eeuo pipefail
source_file="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
command -v nginx >/dev/null || { echo '[FAIL] nginx required'; exit 1; }
command -v curl >/dev/null || { echo '[FAIL] curl required'; exit 1; }
grep -F 'location = /_gallery_pdf_route_probe' "$source_file" >/dev/null
grep -F 'return 200 "gallery-pdf-acme-vhost-ready";' "$source_file" >/dev/null
grep -F 'alias /var/www/gallery-pdf-acme/.well-known/acme-challenge/;' "$source_file" >/dev/null
grep -F 'LIVE_VHOST_ROUTE_MISMATCH' "$source_file" >/dev/null
grep -F 'ACME_STATIC_FILE_FAILED' "$source_file" >/dev/null

tmp="$(mktemp -d /tmp/gallery-live-vhost-route.XXXXXXXX)"
port=18896
mkdir -p "$tmp/sites" "$tmp/www/.well-known/acme-challenge" "$tmp/log"
chmod 0755 "$tmp" "$tmp/sites" "$tmp/www" "$tmp/www/.well-known" \
  "$tmp/www/.well-known/acme-challenge" "$tmp/log"
printf 'expected-acme-bytes' > "$tmp/www/.well-known/acme-challenge/test-123"
chmod 0644 "$tmp/www/.well-known/acme-challenge/test-123"
cat > "$tmp/nginx.conf" <<CONF
pid $tmp/nginx.pid;
error_log $tmp/log/error.log warn;
events { worker_connections 16; }
http {
 access_log off;
 include $tmp/sites/*;
}
CONF
cat > "$tmp/sites/relay" <<CONF
server {
 listen $port default_server;
 listen [::]:$port;
 server_name relay.gczhouwld.com;
 location / { return 404; }
}
CONF
relay_before="$(sha256sum "$tmp/sites/relay" | cut -d' ' -f1)"
cleanup(){
 nginx -s stop -c "$tmp/nginx.conf" >/dev/null 2>&1 || true
 rm -rf -- "$tmp"
}
trap cleanup EXIT
probe(){
 local path="$1"
 curl --http1.1 --noproxy '*' --silent --max-time 4 \
   --resolve "pdf.gczhouwld.com:$port:127.0.0.1" \
   -o "$tmp/response" -w '%{http_code}' \
   "http://pdf.gczhouwld.com:$port$path"
}
write_pdf(){
 local target="$1"
 cat > "$tmp/sites/pdf" <<CONF
# GALLERY_PDF_GATEWAY_MANAGED_V1
server {
 listen $port;
 listen 127.0.0.1:$port;
 listen [::]:$port;
 server_name pdf.gczhouwld.com;
 root $tmp/www;
 access_log off;
 location = /_gallery_pdf_route_probe {
   default_type text/plain;
   return 200 "gallery-pdf-acme-vhost-ready";
 }
 location ^~ /.well-known/acme-challenge/ {
   alias $target;
   default_type text/plain;
   add_header X-Gallery-Pdf-ACME pdf-static always;
 }
 location / { return 404; }
}
CONF
}
static_path="/.well-known/acme-challenge/test-123"
route_path="/_gallery_pdf_route_probe"
nginx -t -c "$tmp/nginx.conf"
nginx -c "$tmp/nginx.conf"
sleep 0.15
test "$(probe "$route_path")" = 404
echo '[CHECK] Missing PDF site: route marker 404 (relay default)'
write_pdf "$tmp/does-not-exist/"
nginx -t -c "$tmp/nginx.conf"
nginx -s reload -c "$tmp/nginx.conf"
sleep 0.25
test "$(probe "$route_path")" = 200
test "$(cat "$tmp/response")" = 'gallery-pdf-acme-vhost-ready'
test "$(probe "$static_path")" = 404
echo '[CHECK] Present PDF site but wrong alias: route 200, file 404'
write_pdf "$tmp/www/.well-known/acme-challenge/"
nginx -t -c "$tmp/nginx.conf"
nginx -s reload -c "$tmp/nginx.conf"
sleep 0.25
test "$(probe "$route_path")" = 200
test "$(cat "$tmp/response")" = 'gallery-pdf-acme-vhost-ready'
test "$(probe "$static_path")" = 200
test "$(cat "$tmp/response")" = 'expected-acme-bytes'
test "$(probe "/.well-known/acme-challenge/missing-file")" = 404
test "$(probe "/private-file")" = 404
test "$(sha256sum "$tmp/sites/relay" | cut -d' ' -f1)" = "$relay_before"
echo 'PDF_ACME_RUNTIME_ROUTE_PASS: relay 404; PDF route 200; wrong alias 404; exact static 200; private 404; relay hash unchanged'
