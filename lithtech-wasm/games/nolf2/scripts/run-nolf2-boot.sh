#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${NOLF2_DATA:-/home/ted/wasm-game-data/nolf2/game}"
BIN="$ROOT/build-port/nolf2_boot"
if [ ! -x "$BIN" ]; then
  echo "build nolf2_boot first: cmake -S port -B build-port && cmake --build build-port --target nolf2_boot" >&2
  exit 1
fi
export LD_LIBRARY_PATH="$ROOT/third_party/sdl2/lib:${LD_LIBRARY_PATH:-}"
exec env NOLF2_DATA="$DATA" "$BIN" "$@"
