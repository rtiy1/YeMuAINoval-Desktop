#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/bridge"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

# npm workspaces hoist bridge dependencies to the repository root. The bridge
# runs from extraResources after packaging, so stage its small runtime graph
# beside the compiled bridge instead of relying on the app's node_modules.
npm --prefix "$BUILD_DIR" install \
  --omit=dev \
  --ignore-scripts \
  --no-package-lock \
  pino@^9.0.0 \
  which@^4.0.0

rm -rf "$BRIDGE/node_modules"
mkdir -p "$BRIDGE/node_modules"
cp -R "$BUILD_DIR/node_modules/." "$BRIDGE/node_modules/"

test -f "$BRIDGE/node_modules/pino/package.json"
test -f "$BRIDGE/node_modules/which/package.json"
echo "bridge runtime dependencies ready"
