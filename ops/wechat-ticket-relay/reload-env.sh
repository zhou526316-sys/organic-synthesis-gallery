#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/osg-wechat-relay/env"
IMAGE="osg-wechat-ticket-relay:latest"
CONTAINER="osg-wechat-ticket-relay"
PORT="8788"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo ./reload-env.sh" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "Missing image ${IMAGE}; run install-ubuntu.sh first." >&2
  exit 1
fi

echo "Recreating ${CONTAINER} so Docker reloads ${ENV_FILE}..."
docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
docker run -d \
  --name "${CONTAINER}" \
  --restart unless-stopped \
  --env-file "${ENV_FILE}" \
  -p "127.0.0.1:${PORT}:${PORT}" \
  "${IMAGE}" >/dev/null

for _ in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done

echo "Local health:"
curl --fail --silent "http://127.0.0.1:${PORT}/health"
echo

RELAY_KEY="$(awk -F= '/^RELAY_SHARED_KEY=/{print substr($0,index($0,"=")+1)}' "${ENV_FILE}")"
if [[ -z "${RELAY_KEY}" ]]; then
  echo "RELAY_SHARED_KEY is missing from ${ENV_FILE}" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
STATUS="$(curl --silent --show-error -o "${TMP}" -w '%{http_code}' \
  -H "Authorization: Bearer ${RELAY_KEY}" \
  "http://127.0.0.1:${PORT}/wechat/jsapi-ticket")"

if [[ "${STATUS}" == "200" ]]; then
  echo "WeChat ticket probe: PASS (HTTP 200)"
else
  echo "WeChat ticket probe: FAIL (HTTP ${STATUS})"
  cat "${TMP}"
  echo
  exit 1
fi
