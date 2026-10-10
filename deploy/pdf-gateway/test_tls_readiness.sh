#!/usr/bin/env bash
# Offline deterministic checks for trusted TLS retry and fail-closed diagnostics.
set -Eeuo pipefail
source_file="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
tmp="$(mktemp -d /tmp/gallery-tls-readiness.XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
sed -n '/^verify_local_tls(){/,/^}/p' "$source_file" > "$tmp/verify.sh"
grep -F 'verify_local_tls(){' "$tmp/verify.sh" >/dev/null
# shellcheck disable=SC1091
source "$tmp/verify.sh"
HOST=pdf.gczhouwld.com
CERT="$tmp/pdf.crt"
printf 'mock' > "$CERT"
counter="$tmp/count"
printf '0' > "$counter"
sleep(){ :; }
curl(){
 local count
 count="$(cat "$counter")"
 count="$((count+1))"
 printf '%s' "$count" > "$counter"
 [[ " $* " == *" --noproxy * "* ]] || return 99
 [[ "$*" != *" --insecure"* ]] || return 99
 [[ "$*" != *" -k "* ]] || return 99
 case "$count" in
  1) return 60 ;;
  2) printf 'wrong response'; return 0 ;;
  *) printf '{"ok":true,"role":"private-pdf-ingress","authenticated":false}'; return 0 ;;
 esac
}
result="$(verify_local_tls)"
[[ "$result" == *'LOCAL_TLS_SNI_PASS'* ]]
[[ "$(cat "$counter")" == 3 ]]
# Failure result must be bounded and contain only classifications.
curl(){ return 60; }
ss(){ printf '%s\n' 'LISTEN 0 511 127.0.0.1:443'; }
nginx(){ printf '%s\n' 'Some private system line /token=do-not-print'; }
openssl(){
 if [[ "$1" == "x509" ]]; then
   printf '%s\n' 'sha256 Fingerprint=MOCK_PUBLIC'
 else
   printf '%s\n' 'mock cert bytes'
 fi
}
timeout(){ shift; "$@"; }
failure=""
if failure="$(verify_local_tls 2>&1)"; then
 echo '[FAIL] Expected TLS mismatch not accepted'; exit 1
fi
[[ "$failure" == *'LOCAL_TLS_SNI_FAILED'* ]]
[[ "$failure" == *'curl_exit=60'* ]]
[[ "$failure" == *'TLS_LOOPBACK_LEAF_MATCH'* ]]
[[ "$failure" != *'do-not-print'* ]]
echo 'PDF_TLS_READINESS_PASS: verified retries, no proxy or insecure bypass, sanitized failure details'
