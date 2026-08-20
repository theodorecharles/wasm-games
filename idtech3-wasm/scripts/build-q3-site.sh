#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
SOURCE="$SOURCE_ROOT/quakejs"
OUTPUT="${IDTECH3_Q3_SITE:-$ROOT/dist/quake3}"
JOBS="${JOBS:-4}"

sh "$ROOT/scripts/prepare-source.sh" quake3
# The upstream checkout commits lburg's generated parser. A fresh Git clone
# can give gram.y a newer sub-second mtime and make(1) then asks for an absent
# yacc even though regeneration is unnecessary.
touch "$SOURCE/ioq3/code/tools/lcc/lburg/gram.c"
make -C "$SOURCE/ioq3" -j"$JOBS" \
  BUILD_CLIENT=0 BUILD_SERVER=0 BUILD_GAME_SO=0 BUILD_GAME_QVM=1 \
  BUILD_BASEGAME=1 BUILD_MISSIONPACK=0

case "$OUTPUT" in
  "$ROOT"/dist/*) ;;
  *) echo "Q3 output must be inside $ROOT/dist" >&2; exit 1 ;;
esac
if [ -d "$OUTPUT" ]; then
  find "$OUTPUT" -mindepth 1 -depth -delete
fi
mkdir -p "$OUTPUT/qvm"
cp "$ROOT/games/quake3/site/wasm-game.json" \
  "$ROOT/games/quake3/site/wasm-game-data.json" \
  "$ROOT/games/quake3/site/framework-install.json" \
  "$ROOT/games/quake3/site/game-adapter.js" "$OUTPUT/"
node "$ROOT/games/quake3/scripts/rewrite-quakejs.js" \
  "$SOURCE/build/ioquake3.js" "$OUTPUT/ioquake3.js"
cp "$SOURCE/ioq3/misc/quake3.ico" "$OUTPUT/quake3.ico"
cp "$SOURCE/ioq3/misc/quake3.svg" "$OUTPUT/quake3.svg"
cp "$SOURCE/ioq3/misc/quake3-tango.png" "$OUTPUT/quake3-background.png"
cp "$SOURCE/ioq3/misc/quake3_flat.iconset/icon_256x256@2x.png" "$OUTPUT/pwa-512.png"
QVM="$SOURCE/ioq3/build/release-linux-x86_64/baseq3/vm"
cp "$QVM/ui.qvm" "$QVM/cgame.qvm" "$OUTPUT/qvm/"

test ! -e "$OUTPUT/index.html"
test ! -e "$OUTPUT/service-worker.js"
test ! -e "$OUTPUT/app.webmanifest"
echo "built canonical QuakeJS site at $OUTPUT"
