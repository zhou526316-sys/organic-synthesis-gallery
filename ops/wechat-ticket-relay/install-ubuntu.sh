#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-relay.gczhouwld.com}"
APP_ID="${WECHAT_MP_APP_ID:-wx28b0fa5a3e28387c}"
RELAY_PORT="${RELAY_PORT:-8788}"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo ./install-ubuntu.sh" >&2
  exit 1
fi

if [[ ! -f Dockerfile || ! -f server.mjs ]]; then
  echo "Run this script from ops/wechat-ticket-relay in the repository." >&2
  exit 1
fi

echo "[1/6] Installing runtime packages..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io nginx certbot python3-certbot-nginx openssl curl
systemctl enable --now docker
systemctl enable --now nginx

echo "[2/6] Reading WeChat AppSecret (input is hidden)..."
read -r -s -p "WeChat MP AppSecret: " APP_SECRET < /dev/tty
echo
if [[ -z "${APP_SECRET}" ]]; then
  echo "AppSecret cannot be empty." >&2
  exit 1
fi

RELAY_KEY="$(openssl rand -hex 32)"
install -d -m 700 /etc/osg-wechat-relay
umask 077
cat >/etc/osg-wechat-relay/env <<EOF
WECHAT_MP_APP_ID=${APP_ID}
WECHAT_MP_APP_SECRET=${APP_SECRET}
RELAY_SHARED_KEY=${RELAY_KEY}
PORT=${RELAY_PORT}
EOF
chmod 600 /etc/osg-wechat-relay/env
unset APP_SECRET

echo "[3/6] Building relay container..."
docker build -t osg-wechat-ticket-relay:latest .
docker rm -f osg-wechat-ticket-relay >/dev/null 2>&1 || true
docker run -d \
  --name osg-wechat-ticket-relay \
  --restart unless-stopped \
  --env-file /etc/osg-wechat-relay/env \
  -p 127.0.0.1:${RELAY_PORT}:${RELAY_PORT} \
  osg-wechat-ticket-relay:latest >/dev/null

echo "[4/6] Checking local relay health..."
for _ in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:${RELAY_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "http://127.0.0.1:${RELAY_PORT}/health"
echo

echo "[5/6] Configuring nginx for ${DOMAIN}..."
cat >/etc/nginx/sites-available/osg-wechat-relay <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${RELAY_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sfn /etc/nginx/sites-available/osg-wechat-relay /etc/nginx/sites-enabled/osg-wechat-relay
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[6/6] Base installation complete."
echo
echo "Next:"
echo "1) Make sure DNS A record ${DOMAIN} points to this server and ports 80/443 are open."
echo "2) Run: sudo certbot --nginx -d ${DOMAIN} --redirect --agree-tos --register-unsafely-without-email"
echo "3) Verify: curl https://${DOMAIN}/health"
echo "4) To copy the relay shared key into GitHub secret WECHAT_TICKET_RELAY_KEY, run:"
echo "   sudo awk -F= '/^RELAY_SHARED_KEY=/{print substr(\$0,index(\$0,"=")+1)}' /etc/osg-wechat-relay/env"
echo "5) Set GitHub secret WECHAT_TICKET_RELAY_URL=https://${DOMAIN}/wechat/jsapi-ticket"
