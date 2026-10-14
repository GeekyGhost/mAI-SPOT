#!/usr/bin/env bash
# mAI Spot launcher for macOS and Linux.   ./launch.sh       start your Spot
#                                          ./launch.sh dev   developer mode (hot reload)
# Everything stays inside this folder: Node.js (if it has to fetch one), packages, npm's cache, your data.
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
NODE_VER="v22.12.0"
NODE_DIR="$ROOT/runtime/node"
export npm_config_cache="$ROOT/runtime/npm-cache" npm_config_update_notifier=false npm_config_fund=false

node_ok() { command -v node >/dev/null 2>&1 && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>18||(a===18&&b>=18)?0:1)"; }

if [ -x "$NODE_DIR/bin/node" ]; then
  export PATH="$NODE_DIR/bin:$PATH"
elif ! node_ok; then
  case "$(uname -s)" in Darwin) os=darwin; ext=tar.gz ;; Linux) os=linux; ext=tar.xz ;; *) echo "Unsupported OS"; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;; esac
  echo "[setup] Downloading Node.js $NODE_VER into runtime/node (one time, about 30 MB)..."
  mkdir -p "$ROOT/runtime"
  curl -fL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-$os-$arch.$ext" -o "$ROOT/runtime/node.$ext"
  tar -xf "$ROOT/runtime/node.$ext" -C "$ROOT/runtime"
  rm -rf "$NODE_DIR" "$ROOT/runtime/node.$ext"
  mv "$ROOT/runtime/node-$NODE_VER-$os-$arch" "$NODE_DIR"
  export PATH="$NODE_DIR/bin:$PATH"
fi
echo "[setup] Using Node.js $(node -v)"

MODE=""
[ "$1" = "dev" ] && MODE="--dev"
export PORT="${PORT:-8088}"
node scripts/preflight.mjs $MODE

echo
echo "  Your Spot: http://localhost:$PORT   (keep this running; Ctrl+C to stop)"
echo
( sleep 5; (command -v open >/dev/null && open "http://localhost:$PORT") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT") || true ) >/dev/null 2>&1 &
exec node server.mjs $MODE
