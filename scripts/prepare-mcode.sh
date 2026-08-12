#!/usr/bin/env bash
# Prepare a self-contained packages/mcode/node_modules for the packaged
# desktop app. bun install inside the npm workspace hoists to the repo root,
# so install in an isolated copy; resources/mcode has no parent node_modules.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCODE="$ROOT/packages/mcode"

BUN_BIN="${BUN_BIN:-}"
if [[ -z "${BUN_BIN}" ]]; then
  for candidate in \
    "${ROOT}/node_modules/bun/bin/bun" \
    "${ROOT}/node_modules/bun/bin/bun.exe"; do
    if [[ -x "${candidate}" ]]; then
      BUN_BIN="${candidate}"
      break
    fi
  done
fi
if [[ -z "${BUN_BIN}" ]]; then
  BUN_BIN="$(command -v bun || true)"
fi
if [[ -z "${BUN_BIN}" ]]; then
  echo "bun is required to prepare packages/mcode" >&2
  exit 1
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

cp -R "$MCODE" "$BUILD_DIR/mcode"
cd "$BUILD_DIR/mcode"
"$BUN_BIN" install
cd "$ROOT"

rm -rf "$MCODE/node_modules"
mkdir -p "$MCODE/node_modules"
tar -C "$BUILD_DIR/mcode/node_modules" -cf - . | tar -C "$MCODE/node_modules" -xf -

# Backfill anything the isolated install skipped (bun self-package, the
# signal-exit v4 pin used by mcode's graceful shutdown).
if [ -d "$ROOT/node_modules/signal-exit" ]; then
  mkdir -p "$MCODE/node_modules/signal-exit"
  cp -R "$ROOT/node_modules/signal-exit/." "$MCODE/node_modules/signal-exit/"
fi
if [ ! -d "$MCODE/node_modules/bun" ] && [ -d "$ROOT/node_modules/bun" ]; then
  mkdir -p "$MCODE/node_modules/bun"
  cp -R "$ROOT/node_modules/bun/." "$MCODE/node_modules/bun/"
fi

test -f "$MCODE/node_modules/bun/bin/bun.exe" \
  || test -f "$MCODE/node_modules/bun/bin/bun" \
  || { echo "mcode/node_modules/bun missing" >&2; exit 1; }
echo "mcode node_modules ready ($(find "$MCODE/node_modules" -mindepth 1 -maxdepth 1 | wc -l) top-level entries)"
