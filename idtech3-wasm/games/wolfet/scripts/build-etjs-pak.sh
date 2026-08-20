#!/bin/sh
# Package ETJS-owned data without mixing it into the original game archives.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/assets/etjs"
DEST="$ROOT/runtime/legacy/etjs.pk3"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required to build the ETJS data pak" >&2
  exit 1
fi
if [ ! -d "$SOURCE" ]; then
  echo "missing ETJS assets: $SOURCE" >&2
  exit 1
fi

mkdir -p "$ROOT/runtime/legacy"
rm -f "$DEST"
(cd "$SOURCE" && zip -q -9 -r "$DEST" .)
echo "wrote $DEST"
