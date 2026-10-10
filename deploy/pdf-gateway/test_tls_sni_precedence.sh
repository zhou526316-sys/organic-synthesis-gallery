#!/usr/bin/env bash
# Strict-TLS regression for the 2026-10-10 Tencent mismatch:
# specific relay 127.0.0.1:443 presents wrong SAN despite a PDF wildcard
# listener. Add the PDF-specific loopback listener, keep relay unchanged.
# All Nginx sockets/certificates are isolated temporary CI fixtures.
set -Eeuo pipefail
source_file="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
for binary in nginx curl openssl; do
 command -v "$binary" >/dev/null || { echo "[FAIL] $binary required"; exit 1; }
done
grep -F 'listen 127.0.0.1:443 ssl;' "$source_file" >/dev/null
grep -F "curl --noproxy '*' --http1.1 --fail --silent" "$source_file" >/dev/null
grep -F 'LOCAL_TLS_SNI_PASS' "$source_file" >/dev/null
grep -F 'TLS_LOOPBACK_CERT_MISMATCH' "$source_file" >/dev/null
if grep -Eq '(curl.*--insecure|curl.*[[:space:]]-k[[:space:]])' "$source_file"; then
 echo '[FAIL] TLS verification bypass forbidden'; exit 1
fi

tmp="$(mktemp -d /tmp/gallery-tls-loopback.XXXXXXXX)"
port=18898
mkdir -p "$tmp/log"
cleanup(){
 nginx -s stop -c "$tmp/nginx.conf" >/dev/null 2>&1 || true
 rm -rf -- "$tmp"
}
trap cleanup EXIT
for name in relay pdf; do
 openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
   -keyout "$tmp/$name.key" -out "$tmp/$name.crt" \
   -subj "/CN=$name.gczhouwld.com" \
   -addext "subjectAltName=DNS:$name.gczhouwld.com" >/dev/null 2>&1
done
cat "$tmp/relay.crt" "$tmp/pdf.crt" > "$tmp/roots.pem"
write_config(){
 local explicit="$1"
 cat > "$tmp/nginx.conf" <<CONF
pid $tmp/nginx.pid;
error_log $tmp/log/error.log warn;
events { worker_connections 16; }
http {
 access_log off;
 server {
  listen 127.0.0.1:$port ssl default_server;
  server_name relay.gczhouwld.com;
  ssl_certificate $tmp/relay.crt;
  ssl_certificate_key $tmp/relay.key;
  location = /_pdf_gateway_health { default_type text/plain; return 200 "relay-health"; }
 }
 server {
  listen $port ssl;
  $(if [[ "$explicit" == 1 ]]; then printf 'listen 127.0.0.1:%s ssl;' "$port"; fi)
  server_name pdf.gczhouwld.com;
  ssl_certificate $tmp/pdf.crt;
  ssl_certificate_key $tmp/pdf.key;
  location = /_pdf_gateway_health { default_type application/json; return 200 '{"ok":true,"role":"private-pdf-ingress","authenticated":false}'; }
 }
}
CONF
}
probe(){
 local domain="$1"
 curl --fail --silent --show-error --noproxy '*' --cacert "$tmp/roots.pem" \
   --resolve "$domain:$port:127.0.0.1" \
   "https://$domain:$port/_pdf_gateway_health"
}
write_config 0
nginx -t -c "$tmp/nginx.conf"
nginx -c "$tmp/nginx.conf"
sleep 0.2
set +e
before="$(probe pdf.gczhouwld.com 2>&1)"
rc=$?
set -e
[[ "$rc" == 60 && "$before" == *'certificate subject name matches'* ]] || {
 echo "[FAIL] Expected hostname mismatch curl(60), got exit $rc"; exit 1
}
relay_before="$(sha256sum "$tmp/relay.crt" | cut -d' ' -f1)"
write_config 1
nginx -t -c "$tmp/nginx.conf"
nginx -s reload -c "$tmp/nginx.conf"
sleep 0.3
pdf="$(probe pdf.gczhouwld.com)"
relay="$(probe relay.gczhouwld.com)"
[[ "$pdf" == '{"ok":true,"role":"private-pdf-ingress","authenticated":false}' ]]
[[ "$relay" == "relay-health" ]]
[[ "$(sha256sum "$tmp/relay.crt" | cut -d' ' -f1)" == "$relay_before" ]]
echo 'PDF_TLS_LOOPBACK_SNI_PASS: real curl(60) mismatch reproduced, then trusted PDF 200; relay unchanged'
