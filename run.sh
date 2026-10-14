#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
elif [ -n "${NITC_NODE_BIN:-}" ] && [ -x "$NITC_NODE_BIN" ]; then
  NODE_BIN="$NITC_NODE_BIN"
else
  echo "Node.js 24 or newer is required (no node binary found; set NITC_NODE_BIN to a Node 24+ binary)." >&2
  exit 1
fi
NODE_VERSION=$("$NODE_BIN" --version 2>/dev/null || echo "unknown")
if ! "$NODE_BIN" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "Node.js 24 or newer is required (found $NODE_VERSION)." >&2
  exit 1
fi
exec "$NODE_BIN" "$PROJECT_DIR/src/server.mjs" "$@"
