#!/bin/sh
# Build the small native helper used for ET's Huffman-compressed connect packet.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CC_BIN="${CC:-cc}"

if [ ! -f "$ROOT/etlegacy/src/qcommon/huffman.c" ]; then
  echo "ET: Legacy source is not prepared; run: npm run setup:engine" >&2
  exit 1
fi

"$CC_BIN" -O2 -I"$ROOT/tools/huffinc" \
  "$ROOT/tools/huffpack.c" \
  "$ROOT/etlegacy/src/qcommon/huffman.c" \
  -o "$ROOT/tools/huffpack"

echo "wrote $ROOT/tools/huffpack"
