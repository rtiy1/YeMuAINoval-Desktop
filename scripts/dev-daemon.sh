#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/../node_modules/.bin:$PATH"

source "$SCRIPT_DIR/dev-home.sh"

export YEMU_LISTEN="${YEMU_LISTEN:-127.0.0.1:6768}"
configure_dev_yemu_home

if [ -z "${YEMU_LOCAL_MODELS_DIR}" ]; then
  export YEMU_LOCAL_MODELS_DIR="$HOME/.paseo/models/local-speech"
  mkdir -p "$YEMU_LOCAL_MODELS_DIR"
fi

echo "══════════════════════════════════════════════════════"
echo "  YeMu AI Novel Dev Daemon"
echo "══════════════════════════════════════════════════════"
echo "  Home:    ${YEMU_HOME}"
echo "  Models:  ${YEMU_LOCAL_MODELS_DIR}"
echo "  Listen:  ${YEMU_LISTEN}"
echo "══════════════════════════════════════════════════════"

export YEMU_CORS_ORIGINS="${YEMU_CORS_ORIGINS:-*}"
export YEMU_NODE_INSPECT="${YEMU_NODE_INSPECT:---inspect=0}"

if [ "${YEMU_SKIP_DEV_SERVER_BUILD:-0}" = "1" ]; then
  exec npm run dev:server:watch
fi

exec sh -c 'npm run build:server-deps && npm run dev:server:watch'
