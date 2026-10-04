#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-relay.gczhouwld.com}"
RELAY_PORT="${RELAY_PORT:-8788}"
USER_NAME="${SUDO_USER:-ubuntu}"
USER_HOME="$(getent passwd "${USER_NAME}" | cut -d: -f6)"
PUBLISHER_REPO="${PUBLISHER_REPO:-${USER_HOME}/organic-synthesis-gallery-publisher}"
IMAGE="osg-wechat-ticket-relay:autopublisher"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

if [[ ! -f /etc/osg-wechat-relay/env ]]; then
  echo "Missing /etc/osg-wechat-relay/env; existing relay installation is required." >&2
  exit 1
fi

if [[ ! -d "${PUBLISHER_REPO}/.git" ]]; then
  git clone https://github.com/zhou526316-sys/organic-synthesis-gallery.git "${PUBLISHER_REPO}"
fi

git -C "${PUBLISHER_REPO}" pull --ff-only origin main

install -d -m 755 /var/www/osg-wechat-preview
install -d -m 700 /var/lib/osg-wechat-publisher

bash "${PUBLISHER_REPO}/ops/wechat-publisher/enable-draft-preview.sh"

docker build -t "${IMAGE}" "${PUBLISHER_REPO}/ops/wechat-ticket-relay"

docker rm -f osg-wechat-ticket-relay >/dev/null 2>&1 || true

docker run -d \
  --name osg-wechat-ticket-relay \
  --restart unless-stopped \
  --env-file /etc/osg-wechat-relay/env \
  -e PUBLISHER_REPO=/repo \
  -e PUBLISHER_PREVIEW_DIR=/preview \
  -e PUBLISHER_PREVIEW_BASE_URL="https://${DOMAIN}/wechat-preview" \
  -p "127.0.0.1:${RELAY_PORT}:${RELAY_PORT}" \
  -v "${PUBLISHER_REPO}:/repo" \
  -v /var/www/osg-wechat-preview:/preview \
  -v /var/lib/osg-wechat-publisher:/var/lib/osg-wechat-publisher \
  "${IMAGE}" >/dev/null

docker exec osg-wechat-ticket-relay git config --global --add safe.directory /repo\n\nfor _ in {1..30}; do\n  if curl --fail --silent "http://127.0.0.1:${RELAY_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl --fail --silent "http://127.0.0.1:${RELAY_PORT}/health"
echo

set -a
source /etc/osg-wechat-relay/env
set +a

echo "Autopublisher endpoint is live. Running one initial sync..."
curl -fsS --max-time 360 \
  -X POST "http://127.0.0.1:${RELAY_PORT}/wechat/publisher/run" \
  -H "Authorization: Bearer ${RELAY_SHARED_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"action":"sync_daily_draft"}'
echo

echo "AUTOPUBLISHER ENABLED"
