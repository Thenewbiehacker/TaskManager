#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
elif [ -x "/Users/devangagarwal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE_BIN="/Users/devangagarwal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Node.js 24 or newer is required." >&2
  exit 1
fi
exec "$NODE_BIN" "$PROJECT_DIR/src/server.mjs"
