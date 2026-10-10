#!/usr/bin/env bash
# Mock only the bounded localhost readiness function from the production
# installer: verifies startup races and safe diagnostics, no systemd mutation.
set -Eeuo pipefail
source_file="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
tmp="$(mktemp -d /tmp/gallery-gateway-readiness.XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
sed -n '/^wait_local_gateway(){/,/^}/p' "$source_file" > "$tmp/wait.sh"
grep -Fq 'wait_local_gateway(){' "$tmp/wait.sh"
grep -Fq 'LOCAL_GATEWAY_NOT_READY' "$tmp/wait.sh"
grep -Fq 'journalctl -u "$SERVICE"' "$tmp/wait.sh"
# shellcheck disable=SC1091
source "$tmp/wait.sh"
HOST=pdf.gczhouwld.com
SERVICE=gallery-pdf-gateway
counter="$tmp/count"
printf '0' > "$counter"
curl(){
 local count
 count="$(cat "$counter")"
 count="$(( count + 1 ))"
 printf '%s' "$count" > "$counter"
 case "$count" in
  1) return 7 ;;
  2) printf '%s' '{"ok":false,"role":"private-pdf-ingress","authenticated":false}' ;;
  *) printf '%s' '{"ok":true,"role":"private-pdf-ingress","authenticated":false}' ;;
 esac
}
sleep(){ :; }
success="$(wait_local_gateway)"
[[ "$success" == *'LOCAL_GATEWAY_READY'* ]]
[[ "$(cat "$counter")" == 3 ]]
# Failure path: never leak anything from journal, only whitelisted class names.
curl(){ return 7; }
systemctl(){
 printf 'ActiveState=failed\nSubState=failed\nExecMainStatus=1\nNRestarts=3\n'
}
ss(){ printf 'State\n'; }
journalctl(){ printf '%s\n' 'PermissionError: /private/token=forbidden' 'Authorization: Bearer should-not-appear'; }
if failure="$(wait_local_gateway 2>&1)"; then
 echo '[FAIL] Permanently unavailable service was accepted'; exit 1
fi
[[ "$failure" == *'LOCAL_GATEWAY_NOT_READY'* ]]
[[ "$failure" == *'ActiveState=failed'* ]]
[[ "$failure" == *'SERVICE_ERROR_CLASS=PermissionError'* ]]
[[ "$failure" != *'should-not-appear'* ]]
[[ "$failure" != *'token=forbidden'* ]]
# Enforce explicit installer gate (no early curl that aborts on ECONNREFUSED).
grep -Fq 'if ! wait_local_gateway; then' "$source_file"
if grep -Fq "abort 'Local health failed'" "$source_file"; then
 echo '[FAIL] Immediate health abort reintroduced'; exit 1
fi
echo 'PDF_GATEWAY_STARTUP_READINESS_PASS: delayed healthy service accepted; permanent failure classified without leaking journal'
