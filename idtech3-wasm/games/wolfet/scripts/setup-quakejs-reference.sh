#!/bin/sh
# Optional reference checkout used to compare browser behavior with QuakeJS.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUAKEJS_DIR="${ETJS_QUAKEJS_DIR:-$ROOT/quakejs}"
UPSTREAM_URL="https://github.com/inolen/quakejs.git"
UPSTREAM_REF="977b188e05b239b6c48d7ecda9d04e9ca03f1578"

if [ ! -d "$QUAKEJS_DIR/.git" ]; then
  if [ -e "$QUAKEJS_DIR" ]; then
    echo "$QUAKEJS_DIR exists but is not a Git checkout" >&2
    exit 1
  fi
  git clone --filter=blob:none "$UPSTREAM_URL" "$QUAKEJS_DIR"
fi

git -C "$QUAKEJS_DIR" checkout --detach "$UPSTREAM_REF"
echo "QuakeJS reference ready at $QUAKEJS_DIR"
