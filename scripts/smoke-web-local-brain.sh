#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
BRIDGE_LOG="${TMP_DIR}/bridge.log"
FRONTEND_LOG="${TMP_DIR}/frontend.log"
BRIDGE_PID=""
FRONTEND_PID=""

BRAIN_HOST="${BRAIN_HOST:-127.0.0.1}"
BRAIN_PORT="${BRAIN_PORT:-5001}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-5173}"

stop_process_tree() {
  local pid="$1"
  local child

  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    return
  fi

  while read -r child; do
    [[ -n "${child}" ]] && stop_process_tree "${child}"
  done < <(pgrep -P "${pid}" || true)

  kill "${pid}" >/dev/null 2>&1 || true
  wait "${pid}" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?
  [[ -n "${FRONTEND_PID}" ]] && stop_process_tree "${FRONTEND_PID}"
  [[ -n "${BRIDGE_PID}" ]] && stop_process_tree "${BRIDGE_PID}"
  if [[ ${exit_code} -ne 0 ]]; then
    echo
    echo "[smoke] bridge log:"
    cat "${BRIDGE_LOG}" || true
    echo
    echo "[smoke] frontend log:"
    cat "${FRONTEND_LOG}" || true
  fi
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT INT TERM

wait_http() {
  local url="$1"
  local label="$2"
  local timeout_seconds="${3:-120}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl --silent --show-error --output /dev/null --fail "${url}"; then
      return 0
    fi
    if (( "$(date +%s)" - started_at > timeout_seconds )); then
      echo "[smoke] timeout waiting for ${label}: ${url}" >&2
      return 1
    fi
    sleep 1
  done
}

assert_html_doc() {
  local file="$1"
  local label="$2"
  if ! grep -Eiq "<!doctype html>|<html" "${file}"; then
    echo "[smoke] ${label} does not look like an HTML entry document" >&2
    return 1
  fi
}

echo "[smoke] starting local bridge on ${BRAIN_HOST}:${BRAIN_PORT}"
(
  cd "${ROOT_DIR}"
  exec env YEMU_BRIDGE_HOST="${BRAIN_HOST}" \
  YEMU_BRIDGE_PORT="${BRAIN_PORT}" \
  node "${ROOT_DIR}/bridge/bin/bridge.cjs" >"${BRIDGE_LOG}" 2>&1
) &
BRIDGE_PID=$!

wait_http "http://${BRAIN_HOST}:${BRAIN_PORT}/health" "bridge health"

curl --silent --show-error --fail \
  --request POST \
  --output "${TMP_DIR}/login.json" \
  "http://${BRAIN_HOST}:${BRAIN_PORT}/api/v1/user/auto-login"

if ! grep -q '"user_id":1' "${TMP_DIR}/login.json"; then
  echo "[smoke] local auto-login response is invalid" >&2
  exit 1
fi

curl --silent --show-error --fail \
  --output "${TMP_DIR}/capabilities.json" \
  "http://${BRAIN_HOST}:${BRAIN_PORT}/workspace/capabilities"

if ! grep -q '"binding_enabled":true' "${TMP_DIR}/capabilities.json"; then
  echo "[smoke] workspace capabilities response is invalid" >&2
  exit 1
fi

echo "[smoke] starting web frontend on ${WEB_HOST}:${WEB_PORT}"
(
  cd "${ROOT_DIR}"
  exec node "${ROOT_DIR}/node_modules/vite/bin/vite.js" \
    --config vite.config.web.ts \
    --host "${WEB_HOST}" \
    --port "${WEB_PORT}" >"${FRONTEND_LOG}" 2>&1
) &
FRONTEND_PID=$!

wait_http "http://${WEB_HOST}:${WEB_PORT}/" "frontend root"

curl --silent --show-error \
  --output "${TMP_DIR}/web_root.html" \
  "http://${WEB_HOST}:${WEB_PORT}/"
assert_html_doc "${TMP_DIR}/web_root.html" "web root"

status_code="$(curl --silent --show-error \
  --output "${TMP_DIR}/web_route.html" \
  --write-out "%{http_code}" \
  "http://${WEB_HOST}:${WEB_PORT}/project/smoke-route")"
if [[ "${status_code}" != "200" ]]; then
  echo "[smoke] browser-router route fallback failed: status=${status_code}" >&2
  exit 1
fi
assert_html_doc "${TMP_DIR}/web_route.html" "web route fallback"

echo "[smoke] PASS: web + local brain smoke checks completed"
