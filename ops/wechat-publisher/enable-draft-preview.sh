#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-relay.gczhouwld.com}"
SITE="/etc/nginx/sites-available/osg-wechat-relay"
PREVIEW_DIR="/var/www/osg-wechat-preview"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo ./enable-draft-preview.sh" >&2
  exit 1
fi

if [[ ! -f "${SITE}" ]]; then
  echo "Nginx site not found: ${SITE}" >&2
  exit 1
fi

install -d -m 755 "${PREVIEW_DIR}"

if ! grep -q "location ^~ /wechat-preview/" "${SITE}"; then
  python3 - "${SITE}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = "    location / {\n"
block = """    location ^~ /wechat-preview/ {
        alias /var/www/osg-wechat-preview/;
        try_files $uri =404;
        default_type text/html;
        add_header Cache-Control "no-store, max-age=0" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

"""
if needle not in text:
    raise SystemExit("Could not find nginx location / block")
path.write_text(text.replace(needle, block + needle, 1))
PY
fi

nginx -t
systemctl reload nginx

cat >"${PREVIEW_DIR}/index.html" <<'EOF'
<!doctype html><meta charset="utf-8"><title>WeChat Draft Preview</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:680px;margin:60px auto;padding:0 20px;color:#333}p{line-height:1.8}</style>
<h1>WeChat Draft Preview</h1>
<p>预览页由公众号草稿写入成功后自动生成。</p>
EOF

echo "Preview hosting enabled:"
echo "https://${DOMAIN}/wechat-preview/"
