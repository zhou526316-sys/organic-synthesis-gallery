#!/usr/bin/env bash
# Regression for Certbot HTTP-01 404 caused by old umask077 directories.
# All paths below are temporary CI fixtures; never touch production Nginx.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd -P)/install.sh"
grep -F 'install -d -o root -g root -m 0755 "$WEBROOT"' "$script" >/dev/null
grep -F 'install -d -o root -g root -m 0755 "$WEBROOT"' "$script" >/dev/null
grep -F 'Local ACME webroot challenge returned an error; certbot was NOT called' "$script" >/dev/null
grep -F "Nginx HTTP-01 webroot probe passed" "$script" >/dev/null
grep -F 'umask 022' "$script" >/dev/null
grep -F 'certbot certonly --webroot' "$script" >/dev/null
grep -F 'cert_ok || abort' "$script" >/dev/null

tmp="$(mktemp -d -p /tmp gallery-acme-perms.XXXXXXXX)"
trap 'sudo rm -rf -- "$tmp"' EXIT
chmod 0755 "$tmp"
root="$tmp/webroot"
app="$tmp/app"
sudo env ACME_FIX_ROOT="$root" ACME_FIX_APP="$app" bash -c '
set -Eeuo pipefail
umask 077
mkdir -p "$ACME_FIX_ROOT" "$ACME_FIX_APP"
test "$(stat -c %a "$ACME_FIX_ROOT")" = "700"
test "$(stat -c %a "$ACME_FIX_APP")" = "700"
install -d -o root -g root -m 0755 \
  "$ACME_FIX_ROOT" \
  "$ACME_FIX_ROOT/.well-known" \
  "$ACME_FIX_ROOT/.well-known/acme-challenge" \
  "$ACME_FIX_APP"
printf "gallery-acme-readable" > "$ACME_FIX_ROOT/.well-known/acme-challenge/regression-test"
chmod 0644 "$ACME_FIX_ROOT/.well-known/acme-challenge/regression-test"
'
for dir in "$root" "$root/.well-known" "$root/.well-known/acme-challenge" "$app"; do
  test "$(stat -c %a "$dir")" = "755"
done
actual="$(sudo -u nobody cat "$root/.well-known/acme-challenge/regression-test")"
test "$actual" = "gallery-acme-readable"
echo 'ACME_PERMISSION_REGRESSION_PASS: root-only 0700 directories repaired; unprivileged process can read the challenge'
