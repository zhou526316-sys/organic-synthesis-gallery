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
MAIN_PATCHED=0
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
dump_http_route_diagnostic(){
  # Read-only, redacted: show effective nginx file paths and listen/name
  # directives only. Do not print nginx -T bodies, credentials or URLs.
  echo '[DIAG] Effective Nginx configuration file paths (filtered):' >&2
  local dump
  dump="$(nginx -T 2>/dev/null)" || { echo '[DIAG] nginx -T unavailable' >&2; return 0; }
  printf '%s\n' "$dump" | sed -n 's/^# configuration file \(.*\):$/\1/p' |
    grep -E '^/etc/nginx/(nginx\.conf|sites-enabled/|conf\.d/)' | head -30 >&2 || true
  echo '[DIAG] Nginx parent include directives for supported site directories:' >&2
  printf '%s\n' "$dump" | awk '
   /^# configuration file / { file=$0; sub(/^# configuration file /,"",file); sub(/:$/,"",file) }
   file=="/etc/nginx/nginx.conf" && /^[[:space:]]*include[[:space:]]/ &&
     /sites-enabled|conf[.]d/ {
      line=$0;sub(/^[[:space:]]*/,"",line);
      if (length(line)<220) print file " " line
   }' | head -25 >&2 || true
  echo '[DIAG] HTTP listener and server-name directives (no config bodies):' >&2
  printf '%s\n' "$dump" | awk '
   /^# configuration file / { file=$0; sub(/^# configuration file /,"",file); sub(/:$/,"",file) }
   /^[[:space:]]*listen[[:space:]]/ {
      line=$0; sub(/^[[:space:]]*/,"",line);
      if (line ~ /(^listen 80[ ;]|:80[ ;]|\\[::\\]:80[ ;])/) print file " " line
   }
   /^[[:space:]]*server_name[[:space:]]/ {
      line=$0; sub(/^[[:space:]]*/,"",line);
      if (length(line)<180) print file " " line
   }' | head -45 >&2 || true
  echo '[DIAG] Active Nginx service and HTTP listening process (no site contents):' >&2
  systemctl show nginx -p MainPID -p ActiveState --no-pager >&2 || true
  ss -ltnp '( sport = :80 )' 2>/dev/null | head -8 >&2 || true
  echo '[DIAG] This diagnostic is read-only; do not publish nginx.conf contents.' >&2
}
write_acme(){
 cat > "$VHOST" <<'NGINX'
# GALLERY_PDF_GATEWAY_MANAGED_V1
server {
 listen 80;
 # Existing relays may bind 127.0.0.1:80 specifically. Such a listener
 # takes precedence over the wildcard 0.0.0.0:80 virtual host even when
 # the HTTP Host header names this PDF vhost. Match both address groups.
 listen 127.0.0.1:80;
 listen [::]:80;
 server_name pdf.gczhouwld.com;
 root /var/www/gallery-pdf-acme;
 access_log off;
 # Independent route marker: proves runtime Host+listen selection, no disk IO.
 location = /_gallery_pdf_route_probe {
  default_type text/plain;
  return 200 "gallery-pdf-acme-vhost-ready";
 }
 # Explicitly scoped public ACME directory; never exposes private state.
 location ^~ /.well-known/acme-challenge/ {
  alias /var/www/gallery-pdf-acme/.well-known/acme-challenge/;
  default_type text/plain;
  add_header X-Gallery-Pdf-ACME pdf-static always;
 }
 location / { return 404; }
}
NGINX
}
write_tls(){
 write_acme
 cat >> "$VHOST" <<'NGINX'
server {
 listen 443 ssl;
 # Join a possible more-specific loopback:443 listener group owned by relay,
 # without changing the existing WeChat vhost, ports or certificate.
 listen 127.0.0.1:443 ssl;
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
# Wait for the actual Python HTTP listener, not systemd's Type=simple
# process spawn. Keep all probes localhost-only, anonymous and bounded.
# Trusted localhost HTTPS probe; never disable certificate validation.
# Check both routing and exact anonymous gateway health before public exposure.
verify_local_tls(){
 local attempt response last_rc current_fingerprint served_fingerprint effective_dump
 response=""
 last_rc=0
 for attempt in 1 2 3 4 5 6 7 8; do
   last_rc=0
   response="$(curl --noproxy '*' --http1.1 --fail --silent \
     --connect-timeout 2 --max-time 5 \
     --resolve "$HOST:443:127.0.0.1" \
     "https://$HOST/_pdf_gateway_health" 2>/dev/null)" || last_rc=$?
   if (( last_rc == 0 )) &&
      [[ "$response" == '{"ok":true,"role":"private-pdf-ingress","authenticated":false}' ]]; then
     echo "[CHECK] LOCAL_TLS_SNI_PASS: trusted HTTPS PDF hostname and exact gateway health (attempt $attempt)."
     return 0
   fi
   (( attempt < 8 )) && sleep 1
 done
 echo "[DIAG] LOCAL_TLS_SNI_FAILED after bounded checks, curl_exit=$last_rc; expected PDF vhost not proven." >&2
 echo '[DIAG] HTTPS :443 listener addresses (no Nginx config body):' >&2
 ss -ltnH '( sport = :443 )' 2>/dev/null | head -8 >&2 || true
 echo '[DIAG] HTTPS Nginx listen directives from loaded PDF and relay vhosts:' >&2
 effective_dump="$(nginx -T 2>/dev/null || true)"
 printf '%s\n' "$effective_dump" | awk '
   /^# configuration file / { file=$0; sub(/^# configuration file /,"",file); sub(/:$/,"",file) }
   /^[[:space:]]*listen[[:space:]]/ && /443/ &&
     (file ~ /gallery-pdf-gateway$/ || file ~ /osg-wechat-relay$/) {
       line=$0; sub(/^[[:space:]]*/,"",line);
       if (length(line) < 180) print file " " line
   }' | head -20 >&2 || true
 # Compare public certificate fingerprints; never emit PEM, key or tokens.
 current_fingerprint="$(openssl x509 -in "$CERT" -noout -fingerprint -sha256 2>/dev/null || true)"
 served_fingerprint="$(timeout 6 openssl s_client -connect 127.0.0.1:443 \
   -servername "$HOST" < /dev/null 2>/dev/null |
   openssl x509 -noout -fingerprint -sha256 2>/dev/null || true)"
 if [[ -n "$current_fingerprint" && -n "$served_fingerprint" ]]; then
   if [[ "$current_fingerprint" == "$served_fingerprint" ]]; then
     echo '[DIAG] TLS_LOOPBACK_LEAF_MATCH: peer presented PDF certificate; investigate trust or upstream response.' >&2
   else
     echo '[DIAG] TLS_LOOPBACK_CERT_MISMATCH: local peer presented another certificate despite SNI.' >&2
   fi
 else
   echo '[DIAG] TLS_LOOPBACK_CERT_UNAVAILABLE: peer leaf or installed certificate could not be inspected.' >&2
 fi
 return 1
}
wait_local_gateway(){
 local try_number response journal_snippet signature
 for try_number in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
   response="$(curl --noproxy '*' --http1.1 --silent --fail \
     --connect-timeout 1 --max-time 2 -H "Host: $HOST" \
     http://127.0.0.1:18867/_pdf_gateway_health 2>/dev/null || true)"
   if [[ "$response" == '{"ok":true,"role":"private-pdf-ingress","authenticated":false}' ]]; then
     echo "[CHECK] LOCAL_GATEWAY_READY: private PDF service health HTTP 200 with exact anonymous response (attempt $try_number)."
     return 0
   fi
   if (( try_number < 15 )); then sleep 1; fi
 done
 echo '[DIAG] LOCAL_GATEWAY_NOT_READY after bounded health retries; no public PDF routing enabled.' >&2
 echo '[DIAG] systemd state (service-only metadata; no full journal):' >&2
 systemctl show "$SERVICE" --no-pager -p ActiveState -p SubState -p Result \
   -p ExecMainCode -p ExecMainStatus -p NRestarts -p MainPID >&2 || true
 echo '[DIAG] Local TCP listener:' >&2
 ss -ltnH '( sport = :18867 )' 2>/dev/null | head -3 >&2 || true
 # Read a short, recent portion of this service's journal but emit ONLY
 # whitelisted error CLASS NAMES, never raw traceback, URL, cookie or token.
 journal_snippet="$(journalctl -u "$SERVICE" --since '-90 seconds' \
   --no-pager -o cat 2>/dev/null | tail -40 || true)"
 for signature in PermissionError FileNotFoundError ModuleNotFoundError \
   ImportError SyntaxError MemoryError OSError sqlite3.OperationalError \
   AddressInUseError ConnectionRefusedError 'Address already in use' \
   'Failed at step' \
   'Operation not permitted' 'Read-only file system'; do
   if grep -Fq "$signature" <<< "$journal_snippet"; then
     echo "[DIAG] SERVICE_ERROR_CLASS=$signature" >&2
   fi
 done
 return 1
}
on_error(){
 local rc=$?
 trap - ERR EXIT INT TERM
 if (( rc == 0 )); then return; fi
 echo '[ROLLBACK] Restoring previous Nginx sites (WeChat vhost never overwritten).' >&2
 if (( MAIN_PATCHED )); then
  if ! python3 -B "$SOURCE_DIR/nginx_include.py" remove; then
   echo '[STOP] Managed parent include could not be removed. Preserve PDF site for manual review; no reload.' >&2
   exit "$rc"
  fi
 fi
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
 [[ -f "$SOURCE_DIR/gateway.py" && -f "$SOURCE_DIR/nginx_include.py" ]] ||
   abort 'Missing reviewed gateway.py or nginx_include.py next to installer'
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
   # PRE-RELOAD proof: nginx -t can pass while nginx.conf explicitly includes
   # only the WeChat relay. Never reload or call Certbot for an unloaded site.
   nginx -t || abort 'Staged isolated PDF site has invalid Nginx syntax'
   local effective_nginx_dump
   effective_nginx_dump="$(nginx -T 2>/dev/null)" ||
     abort 'Cannot inspect effective Nginx include graph before reload'
   if [[ "$effective_nginx_dump" != *'# GALLERY_PDF_GATEWAY_MANAGED_V1'* ]]; then
     echo '[CHECK] Dedicated sites-enabled PDF site not in effective include graph.' >&2
     # Strict fallback: add only one reversible marked include NEXT TO an exact
     # existing relay include in /etc/nginx/nginx.conf, after private backup.
     # Any unfamiliar structure fails closed; relay vhost content is immutable.
     python3 -B "$SOURCE_DIR/nginx_include.py" apply ||
       abort 'No approved safe parent include anchor; certbot was NOT called'
     MAIN_PATCHED=1
     nginx -t || abort 'Guarded parent include failed syntax; certbot was NOT called'
     effective_nginx_dump="$(nginx -T 2>/dev/null)" ||
       abort 'Cannot inspect guarded Nginx configuration'
   fi
   if [[ "$effective_nginx_dump" != *'# GALLERY_PDF_GATEWAY_MANAGED_V1'* ]]; then
     dump_http_route_diagnostic
     abort 'PDF vhost still absent from effective nginx config; certbot was NOT called'
   fi
   echo '[CHECK] Managed PDF vhost found in effective nginx -T configuration.'
   nginx -t;systemctl reload nginx;RELOADED=1
   # nginx -T only proves that the candidate configuration parses. Confirm
   # the live master/worker is actually serving THIS vhost, not the relay's
   # 404 response (for example during an incomplete graceful reload).
   local route_expect route_result route_i
   route_expect="gallery-pdf-acme-vhost-ready"
   route_result=""
   for route_i in 1 2 3 4 5 6; do
     route_result="$(curl --noproxy '*' --http1.1 --silent        --connect-timeout 2 --max-time 4        --resolve "$HOST:80:127.0.0.1"        "http://$HOST/_gallery_pdf_route_probe" || true)"
     [[ "$route_result" == "$route_expect" ]] && break
     (( route_i < 6 )) && sleep 1
   done
   if [[ "$route_result" != "$route_expect" ]]; then
     echo '[DIAG] LIVE_VHOST_ROUTE_MISMATCH: marked PDF vhost loaded by nginx -T but route marker was NOT served.' >&2
     echo '[DIAG] Host/port selection or running nginx worker config is mismatched; certbot was NOT called.' >&2
     dump_http_route_diagnostic
     abort 'Runtime PDF vhost route marker failed; certbot was NOT called'
   fi
   echo '[CHECK] LIVE_VHOST_ROUTE_PASS: running Nginx returned exact PDF-vhost marker.'
   # Confirm that the actual unprivileged Nginx listener serves a real
   # HTTP-01 challenge before requesting a public CA certificate.
   # This does not contact Let's Encrypt and cannot consume a CA limit.
   local acme_name acme_expect acme_result
   # A URL-safe disposable challenge identifier; the old literal trailing
   # "$" was ambiguous when diagnosing a 404 through multiple vhosts.
   acme_name="gallery-acme-probe-$(date +%s)-$$"
   acme_expect="gallery-private-pdf-http01-$$"
   printf '%s' "$acme_expect" > "$WEBROOT/.well-known/acme-challenge/$acme_name"
   chmod 0644 "$WEBROOT/.well-known/acme-challenge/$acme_name"
   # Confirm the running Nginx worker can traverse all parent directories,
   # not only the three 0755 directories reported by prior preflight logs.
   local worker_user
   worker_user="$(ps -eo user=,args= | awk '/nginx: worker process/{print $1; exit}' || true)"
   if [[ -n "$worker_user" ]] && command -v runuser >/dev/null &&
      ! runuser -u "$worker_user" -- test -r "$WEBROOT/.well-known/acme-challenge/$acme_name"; then
     echo '[DIAG] ACME file is not readable by the active Nginx worker; directory ancestry:' >&2
     namei -l "$WEBROOT/.well-known/acme-challenge/$acme_name" >&2 || true
     rm -f "$WEBROOT/.well-known/acme-challenge/$acme_name"
     abort 'Nginx worker cannot read ACME challenge; certbot was NOT called'
   fi
   # File readiness can lag a graceful Nginx reload; bound the local check
   # to six attempts and never call the public CA without exact byte match.
   local acme_i
   acme_result=""
   for acme_i in 1 2 3 4 5 6; do
     acme_result="$(curl --noproxy '*' --http1.1 --silent \
       --connect-timeout 2 --max-time 4 --resolve "$HOST:80:127.0.0.1" \
       "http://$HOST/.well-known/acme-challenge/$acme_name" || true)"
     [[ "$acme_result" == "$acme_expect" ]] && break
     (( acme_i < 6 )) && sleep 1
   done
   if [[ "$acme_result" != "$acme_expect" ]]; then
     echo '[DIAG] LIVE_VHOST_ROUTE_PASS but ACME_STATIC_FILE_FAILED: static alias, Nginx filesystem policy or worker access needs review.' >&2
     echo '[DIAG] HTTP :80 listener addresses (no Nginx config secrets):' >&2
     ss -ltnH '( sport = :80 )' 2>/dev/null | head -8 >&2 || true
     echo '[DIAG] File ancestry:' >&2
     namei -l "$WEBROOT/.well-known/acme-challenge/$acme_name" >&2 || true
     dump_http_route_diagnostic
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
 if ! wait_local_gateway; then
   abort 'Local PDF gateway did not become ready; service-only diagnostics above, PDF fallback remains DISABLED'
 fi
 write_tls
 if (( ! ADDED )); then ln -s "$VHOST" "$LINK";ADDED=1;fi
 nginx -t;systemctl reload nginx;RELOADED=1
 [[ "$(we_chat_hash)" == "$wechat_before" ]] || abort 'WeChat site changed unexpectedly'
 if ! verify_local_tls; then
   abort 'TLS health failed with trusted SNI/Host check; PDF fallback remains DISABLED'
 fi
 trap - ERR EXIT INT TERM
 echo '[SUCCESS] Tencent PDF gateway HTTPS installed, Gallery failover NOT switched on.'
}
case "$MODE" in
 --preflight) preflight ;;
 --diagnose) dump_http_route_diagnostic ;;
 --install) install_new ;;
 --rollback)
  [[ "$(id -u)" == 0 ]] || abort 'sudo required'
  [[ -f "$VHOST" ]] || abort 'No isolated PDF vhost to remove'
  grep -q 'GALLERY_PDF_GATEWAY_MANAGED_V1' "$VHOST" ||
    abort 'Vhost not managed by this installer: refuse removal'
  # Remove optional one-line parent include BEFORE deleting its target.
  [[ -f "$SOURCE_DIR/nginx_include.py" ]] ||
    abort 'Missing isolated nginx parent include helper; refuse rollback'
  python3 -B "$SOURCE_DIR/nginx_include.py" remove ||
    abort 'Could not safely remove managed parent include; site preserved'
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "$LINK" "$VHOST"
  if [[ -f "$UNIT" ]] && grep -q 'Gallery owner-only PDF alternative gateway' "$UNIT"; then
    rm -f "$UNIT"; systemctl daemon-reload
  fi
  nginx -t && systemctl reload nginx
  echo '[OK] PDF-only vhost removed; osg-wechat-relay untouched.' ;;
 *) abort 'Usage: sudo bash install.sh [--preflight|--diagnose|--install|--rollback]' ;;
esac
