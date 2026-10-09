#!/usr/bin/env bash
# Owner-only PDF alternate ingress on EXISTING Tencent nginx, no new paid service.
set -Eeuo pipefail
umask 077
HOST=pdf.gczhouwld.com
RELAY=relay.gczhouwld.com
VHOST=/etc/nginx/sites-available/gallery-pdf-gateway
LINK=/etc/nginx/sites-enabled/gallery-pdf-gateway
WEBROOT=/var/www/gallery-pdf-acme
CERT=/etc/letsencrypt/live/pdf.gczhouwld.com/fullchain.pem
KEY=/etc/letsencrypt/live/pdf.gczhouwld.com/privkey.pem
APP=/opt/gallery-pdf-gateway
STATE=/var/lib/gallery-pdf-gateway
UNIT=/etc/systemd/system/gallery-pdf-gateway.service
SERVICE=gallery-pdf-gateway
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd -P)"
MODE=--preflight
if (( $# > 0 )); then MODE="$1"; fi
ADDED=0
STARTED=0
UNIT_CREATED=0
RELOADED=0
abort(){ echo "[STOP] $*" >&2; exit 1; }
ip_of(){ getent ahostsv4 "$1" 2>/dev/null | awk '$2=="STREAM"{print $1;exit}'; }
we_chat_hash(){ sha256sum /etc/nginx/sites-enabled/osg-wechat-relay | awk '{print $1}'; }
cert_ok(){
 [[ -s "$CERT" && -s "$KEY" ]] &&
 openssl x509 -in "$CERT" -noout -checkhost "$HOST" 2>/dev/null | grep -q 'does match'
}
preflight(){
 [[ "$(id -u)" == 0 ]] || abort 'Run with sudo.'
 command -v nginx >/dev/null || abort 'nginx missing'
 command -v python3 >/dev/null || abort 'Python missing'
 python3 -c 'import sys; assert sys.version_info >= (3,10)'
 [[ -e /etc/nginx/sites-enabled/osg-wechat-relay ]] || abort 'WeChat vhost not found'
 nginx -t || abort 'Existing nginx config invalid'
 if ss -ltnH '( sport = :18867 )' 2>/dev/null | grep -q .; then
   abort 'Private PDF localhost port 18867 already in use; no changes permitted'
 fi
 local nginx_dump
 nginx_dump="$(nginx -T 2>/dev/null)" || abort 'Unable to inspect current Nginx configuration'
 if grep -E '[[:space:]]server_name[[:space:]]+pdf[.]gczhouwld[.]com[[:space:];]' <<< "$nginx_dump" >/dev/null; then
   abort 'An existing Nginx vhost already owns the PDF hostname; do not overwrite'
 fi
 echo "[CHECK] WeChat vhost SHA: $(we_chat_hash)"
 echo '[CHECK] Existing PDF ACME/app directory modes (read-only):'
 for dir in "$WEBROOT" "$WEBROOT/.well-known" "$WEBROOT/.well-known/acme-challenge" "$APP"; do
   if [[ -e "$dir" ]]; then stat -c '%a %U:%G %n' "$dir"; fi
 done
 free -h; df -h /
 local a p
 a="$(ip_of "$RELAY" || true)";p="$(ip_of "$HOST" || true)"
 echo "[CHECK] relay A: $a / pdf A: $p"
 [[ -n "$a" ]] || abort 'relay A missing'
 [[ -z "$p" || "$a" == "$p" ]] ||
    abort 'pdf DNS must be DNS-only A to existing Tencent host'
 if cert_ok; then echo '[CHECK] TLS already ready'
 elif command -v certbot >/dev/null; then echo '[CHECK] Free certbot available'
 else echo '[PENDING] certbot missing (no auto-install)' ; fi
 curl --noproxy '*' -fsS -o /dev/null --connect-timeout 4 --max-time 10 \
  -w 'Upstream health HTTP=%{http_code} total=%{time_total}s\n' \
  https://api.gczhouwld.com/api/_healthcheck ||
  abort 'Tencent to Cloudflare unavailable'
}
write_acme(){
 cat > "$VHOST" <<'NGINX'
# GALLERY_PDF_GATEWAY_MANAGED_V1
server {
 listen 80;
 listen [::]:80;
 server_name pdf.gczhouwld.com;
 root /var/www/gallery-pdf-acme;
 access_log off;
 location ^~ /.well-known/acme-challenge/ { try_files $uri =404; }
 location / { return 404; }
}
NGINX
}
write_tls(){
 write_acme
 cat >> "$VHOST" <<'NGINX'
server {
 listen 443 ssl;
 listen [::]:443 ssl;
 server_name pdf.gczhouwld.com;
 ssl_certificate /etc/letsencrypt/live/pdf.gczhouwld.com/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/pdf.gczhouwld.com/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 client_max_body_size 8k;
 client_header_timeout 15s;
 client_body_timeout 15s;
 keepalive_timeout 5s;
 send_timeout 30s;
 access_log off;
 error_log /var/log/nginx/gallery-pdf-gateway.error.log crit;
 add_header Referrer-Policy no-referrer always;
 add_header X-Content-Type-Options nosniff always;
 location / {
  proxy_http_version 1.1;
  proxy_pass http://127.0.0.1:18867;
  proxy_set_header Host pdf.gczhouwld.com;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_connect_timeout 3s;
  proxy_read_timeout 80s;
  proxy_send_timeout 30s;
 }
}
NGINX
}
write_unit(){
 cat > "$UNIT" <<'SYSTEMD'
[Unit]
Description=Gallery owner-only PDF alternative gateway
After=network-online.target
Wants=network-online.target
[Service]
User=gallerypdf
Group=gallerypdf
WorkingDirectory=/opt/gallery-pdf-gateway
ExecStart=/usr/bin/python3 -B /opt/gallery-pdf-gateway/gateway.py
Restart=on-failure
RestartSec=3
CPUQuota=50%
MemoryMax=192M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/gallery-pdf-gateway
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0077
[Install]
WantedBy=multi-user.target
SYSTEMD
}
on_error(){
 local rc=$?
 trap - ERR EXIT INT TERM
 if (( rc == 0 )); then return; fi
 echo '[ROLLBACK] Restoring previous Nginx sites (WeChat vhost never overwritten).' >&2
 if (( ADDED )); then rm -f "$LINK" "$VHOST"; fi
 if (( STARTED )); then systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true; fi
 if (( UNIT_CREATED )); then rm -f "$UNIT"; systemctl daemon-reload || true; fi
 if (( RELOADED )) && nginx -t >/dev/null 2>&1; then
  systemctl reload nginx >/dev/null 2>&1 || true
 fi
 exit "$rc"
}
install_new(){
 preflight
 [[ ! -e "$VHOST" && ! -e "$LINK" && ! -e "$UNIT" ]] ||
   abort 'Gateway files already exist, refusing overwrite'
 [[ -f "$SOURCE_DIR/gateway.py" ]] || abort 'Missing gateway.py next to installer'
 [[ -n "$(ip_of "$HOST")" && "$(ip_of "$HOST")" == "$(ip_of "$RELAY")" ]] ||
   abort 'Create DNS-only A pdf.gczhouwld.com first'
 if ! cert_ok; then
   command -v certbot >/dev/null || abort 'Free certbot is not installed; stop before changes'
 fi
 local wechat_before
 wechat_before="$(we_chat_hash)"
 # Prior installer used umask 077 with mkdir -p, leaving dedicated
 # HTTP-01 webroot and /opt app directories mode 0700. Nginx's
 # unprivileged worker cannot traverse root-only challenge directories,
 # leading to a real Let's Encrypt HTTP-01 404.
 # Explicit modes protect private state while allowing nginx and systemd
 # users to traverse only the intentionally public paths.
 mkdir -p /var/backups/gallery-pdf-gateway "$STATE"
 install -d -o root -g root -m 0755 "$WEBROOT" \
   "$WEBROOT/.well-known" "$WEBROOT/.well-known/acme-challenge" "$APP"
 cp -a /etc/nginx/sites-enabled/osg-wechat-relay \
   "/var/backups/gallery-pdf-gateway/wechat.$(date +%Y%m%d%H%M%S)"
 trap on_error ERR EXIT INT TERM
 if ! cert_ok; then
   write_acme;ln -s "$VHOST" "$LINK";ADDED=1
   nginx -t;systemctl reload nginx;RELOADED=1
   # Confirm that the actual unprivileged Nginx listener serves a real
   # HTTP-01 challenge before requesting a public CA certificate.
   # This does not contact Let's Encrypt and cannot consume a CA limit.
   local acme_name acme_expect acme_result
   acme_name="gallery-acme-probe-$"
   acme_expect="gallery-private-pdf-http01-$"
   printf '%s' "$acme_expect" > "$WEBROOT/.well-known/acme-challenge/$acme_name"
   chmod 0644 "$WEBROOT/.well-known/acme-challenge/$acme_name"
   if ! acme_result="$(curl --noproxy '*' --fail --silent --show-error \
     --connect-timeout 3 --max-time 8 --resolve "$HOST:80:127.0.0.1" \
     "http://$HOST/.well-known/acme-challenge/$acme_name")"; then
     rm -f "$WEBROOT/.well-known/acme-challenge/$acme_name"
     abort 'Local ACME webroot challenge returned an error; certbot was NOT called'
   fi
   rm -f "$WEBROOT/.well-known/acme-challenge/$acme_name"
   [[ "$acme_result" == "$acme_expect" ]] || \
     abort 'Nginx did not serve the exact ACME probe bytes; certbot was NOT called'
   echo '[CHECK] Nginx HTTP-01 webroot probe passed (correct bytes, HTTP 200)'
   # For ACME challenge files only, use conventional public-web permissions;
   # Certbot manages the private key permissions in /etc/letsencrypt itself.
   ( umask 022
     certbot certonly --webroot -w "$WEBROOT" -d "$HOST" \
       --cert-name "$HOST" --agree-tos --non-interactive \
       --register-unsafely-without-email
   ) || abort 'TLS issuance failed after verified local ACME probe'
 fi
 cert_ok || abort 'Certificate does not include pdf subdomain'
 if ! id gallerypdf >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$STATE" --shell /usr/sbin/nologin gallerypdf
 fi
 chown gallerypdf:gallerypdf "$STATE";chmod 0700 "$STATE"
 install -o root -g root -m 0755 "$SOURCE_DIR/gateway.py" "$APP/gateway.py"
 python3 -m py_compile "$APP/gateway.py"
 write_unit;UNIT_CREATED=1;chmod 0644 "$UNIT";systemctl daemon-reload
 STARTED=1;systemctl enable --now "$SERVICE"
 systemctl is-active --quiet "$SERVICE" || abort 'Local PDF service failed'
 curl -fsS --max-time 3 -H "Host: $HOST" \
  http://127.0.0.1:18867/_pdf_gateway_health >/dev/null || abort 'Local health failed'
 write_tls
 if (( ! ADDED )); then ln -s "$VHOST" "$LINK";ADDED=1;fi
 nginx -t;systemctl reload nginx;RELOADED=1
 [[ "$(we_chat_hash)" == "$wechat_before" ]] || abort 'WeChat site changed unexpectedly'
 curl -fsS --max-time 8 --resolve "$HOST:443:127.0.0.1" \
  "https://$HOST/_pdf_gateway_health" >/dev/null || abort 'TLS health failed'
 trap - ERR EXIT INT TERM
 echo '[SUCCESS] Tencent PDF gateway HTTPS installed, Gallery failover NOT switched on.'
}
case "$MODE" in
 --preflight) preflight ;;
 --install) install_new ;;
 --rollback)
  [[ "$(id -u)" == 0 ]] || abort 'sudo required'
  [[ -f "$VHOST" ]] || abort 'No isolated PDF vhost to remove'
  grep -q 'GALLERY_PDF_GATEWAY_MANAGED_V1' "$VHOST" ||
    abort 'Vhost not managed by this installer: refuse removal'
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "$LINK" "$VHOST"
  if [[ -f "$UNIT" ]] && grep -q 'Gallery owner-only PDF alternative gateway' "$UNIT"; then
    rm -f "$UNIT"; systemctl daemon-reload
  fi
  nginx -t && systemctl reload nginx
  echo '[OK] PDF-only vhost removed; osg-wechat-relay untouched.' ;;
 *) abort 'Usage: sudo bash install.sh [--preflight|--install|--rollback]' ;;
esac
