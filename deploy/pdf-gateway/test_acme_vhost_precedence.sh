#!/usr/bin/env bash
# Reproduce the specific-listen-vs-wildcard nginx HTTP-01 404 with an
# entirely isolated localhost nginx fixture. Never alter system nginx sites.
set -Eeuo pipefail
command -v nginx >/dev/null || { echo '[FAIL] nginx binary required for vhost precedence regression'; exit 1; }
command -v curl >/dev/null || { echo '[FAIL] curl required'; exit 1; }
source_file="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
grep -F 'listen 127.0.0.1:80;' "$source_file" >/dev/null
grep -F 'namei -l "$WEBROOT/.well-known/acme-challenge/$acme_name"' "$source_file" >/dev/null

tmp="$(mktemp -d /tmp/gallery-nginx-binding-regression.XXXXXXXX)"
port=18893
mkdir -p "$tmp/www/.well-known/acme-challenge" "$tmp/logs"
chmod 0755 "$tmp" "$tmp/www" "$tmp/www/.well-known" "$tmp/www/.well-known/acme-challenge" "$tmp/logs"
printf '%s' 'gallery-temporary-acme-fixture' > "$tmp/www/.well-known/acme-challenge/fixture"
chmod 0644 "$tmp/www/.well-known/acme-challenge/fixture"
cleanup(){
  nginx -s stop -c "$tmp/nginx.conf" >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT
make_config(){
  local explicit="$1"
  cat > "$tmp/nginx.conf" <<CONF
pid $tmp/nginx.pid;
error_log $tmp/logs/error.log warn;
events { worker_connections 16; }
http {
 server {
  listen 127.0.0.1:$port default_server;
  server_name relay.gczhouwld.com;
  location / { return 404; }
 }
 server {
  listen $port;
  $(if [[ "$explicit" == 1 ]]; then printf 'listen 127.0.0.1:%s;' "$port"; fi)
  server_name pdf.gczhouwld.com;
  root $tmp/www;
  access_log off;
  location ^~ /.well-known/acme-challenge/ { try_files \$uri =404; }
  location / { return 404; }
 }
}
CONF
  nginx -t -c "$tmp/nginx.conf"
}
probe(){
 curl --noproxy '*' -sS --max-time 3 \
  --resolve "pdf.gczhouwld.com:$port:127.0.0.1" \
  -o /dev/null -w '%{http_code}' \
  "http://pdf.gczhouwld.com:$port/.well-known/acme-challenge/fixture"
}
make_config 0
nginx -c "$tmp/nginx.conf"
sleep 0.12
before="$(probe)"
[[ "$before" == "404" ]] || { echo "[FAIL] original precedence case expected HTTP404 got $before"; exit 1; }
nginx -s stop -c "$tmp/nginx.conf" >/dev/null 2>&1
sleep 0.2
make_config 1
nginx -c "$tmp/nginx.conf"
sleep 0.12
after="$(probe)"
[[ "$after" == "200" ]] || { echo "[FAIL] explicit PDF loopback binding expected HTTP200 got $after"; exit 1; }
echo "PDF_ACME_NGINX_PRECEDENCE_PASS before=$before after=$after; isolated nginx only"
