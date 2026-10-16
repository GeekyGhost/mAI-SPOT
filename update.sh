#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ -x runtime/node/bin/node ]; then export PATH="$PWD/runtime/node/bin:$PATH"; fi
if ! command -v node >/dev/null 2>&1; then
  echo "Run ./launch.sh once to set up Node.js, then close the Spot and run this updater."
  exit 1
fi
# Parse the compound command before the updater replaces this script.
{
  node scripts/update.mjs "$@"
  exit $?
}
