#!/usr/bin/env bash
# Read-only effective-vhost inclusion regression, isolated from system nginx.
set -Eeuo pipefail
command -v nginx >/dev/null || { echo '[FAIL] nginx required'; exit 1; }
command -v curl >/dev/null || { echo '[FAIL] curl required'; exit 1; }
source_file="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
grep -F 'Managed PDF vhost found in effective nginx -T configuration' "$source_file" >/dev/null
grep -F "PDF vhost symlink exists but is absent from nginx -T." "$source_file" >/dev/null
grep -F -- '--diagnose) dump_http_route_diagnostic' "$source_file" >/dev/null
grep -F 'acme_name="gallery-acme-probe-$(date +%s)-$$"' "$source_file" >/dev/null

tmp="$(mktemp -d /tmp/gallery-effective-nginx.XXXXXXXX)"
port=18895
mkdir -p "$tmp/sites-enabled" "$tmp/www/.well-known/acme-challenge" "$tmp/logs"
chmod -R a+rx "$tmp"
printf 'expected-http01-body' > "$tmp/www/.well-known/acme-challenge/canary-12345"
chmod 0644 "$tmp/www/.well-known/acme-challenge/canary-12345"
cleanup() {
 nginx -s stop -c "$tmp/nginx.conf" >/dev/null 2>&1 || true
 rm -rf -- "$tmp"
}
trap cleanup EXIT
cat > "$tmp/sites-enabled/pdf" <<CONF
# GALLERY_PDF_GATEWAY_MANAGED_V1
server {
 listen 127.0.0.1:$port;
 server_name pdf.gczhouwld.com;
 root $tmp/www;
 location ^~ /.well-known/acme-challenge/ { try_files \$uri =404; }
 location / { return 404; }
}
CONF
write_root() {
 local enabled="$1"
 cat > "$tmp/nginx.conf" <<CONF
pid $tmp/nginx.pid;
error_log $tmp/logs/error.log warn;
events { worker_connections 16; }
http {
 access_log off;
 server {
   listen 127.0.0.1:$port default_server;
   server_name relay.gczhouwld.com;
   location / { return 404; }
 }
 $(if [[ "$enabled" == 1 ]]; then printf 'include %s/sites-enabled/*;' "$tmp"; fi)
}
CONF
}
probe() {
 curl --noproxy '*' -sS --max-time 3 -o "$tmp/body" -w '%{http_code}' \
  --resolve "pdf.gczhouwld.com:$port:127.0.0.1" \
  "http://pdf.gczhouwld.com:$port/.well-known/acme-challenge/canary-12345"
}
write_root 0
nginx -t -c "$tmp/nginx.conf"
if nginx -T -c "$tmp/nginx.conf" 2>/dev/null | grep -Fq 'GALLERY_PDF_GATEWAY_MANAGED_V1'; then
 echo '[FAIL] Unincluded PDF vhost incorrectly appeared in effective config'; exit 1
fi
nginx -c "$tmp/nginx.conf"
sleep 0.15
test "$(probe)" = 404
write_root 1
nginx -t -c "$tmp/nginx.conf"
nginx -s reload -c "$tmp/nginx.conf"
sleep 0.25
nginx -T -c "$tmp/nginx.conf" 2>/dev/null | grep -F 'GALLERY_PDF_GATEWAY_MANAGED_V1' >/dev/null
test "$(probe)" = 200
test "$(cat "$tmp/body")" = 'expected-http01-body'
echo 'PDF_ACME_EFFECTIVE_INCLUDE_PASS: unused site=404; effective nginx include=200'
