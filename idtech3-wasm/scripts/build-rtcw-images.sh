#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
SOURCE="$SOURCE_ROOT/iortcw"
OUTPUT="$ROOT/dist/rtcw"
SP_IMAGE="${RTCW_SP_IMAGE:-rtcw-sp-wasm:devel}"
MP_IMAGE="${RTCW_MP_IMAGE:-rtcw-mp-wasm:devel}"
FRAMEWORK_DIR="$(sh "$ROOT/scripts/assert-framework.sh")"
FRAMEWORK_VERSION="$(node -p "require('$ROOT/sources.lock.json').framework.version")"
RTCW_SOURCE_COMMIT="$(node -p "require('$ROOT/sources.lock.json').rtcw.downstreamCommit")"

sh "$ROOT/scripts/prepare-source.sh" rtcw
sh "$ROOT/scripts/fetch-rtcw-omnibot.sh"
python3 "$ROOT/scripts/pack-rtcw-menus.py"
"$SOURCE/scripts/build-web-sp.sh"
"$SOURCE/scripts/build-web-mp.sh"
if [ -d "$OUTPUT" ]; then
  find "$OUTPUT" -mindepth 1 -depth -delete
fi
mkdir -p "$OUTPUT"
cp "$ROOT/games/rtcw/site/wasm-game.json" "$ROOT/games/rtcw/site/wasm-game-data.json" \
  "$ROOT/games/rtcw/site/framework-install.json" "$ROOT/games/rtcw/site/game-adapter.js" "$OUTPUT/"
cp -a "$ROOT/games/rtcw/site/menus" "$OUTPUT/menus"
cp "$SOURCE/SP/misc/wolf.svg" "$OUTPUT/rtcw.svg"
cp "$SOURCE/SP/misc/wolf512.png" "$OUTPUT/rtcw-512.png"
install -m 0644 "$SOURCE/web/sp/client/sp/iowolfsp.js" "$OUTPUT/iowolfsp.js"
install -m 0644 "$SOURCE/web/sp/client/sp/iowolfsp.wasm" "$OUTPUT/iowolfsp.wasm"
install -m 0644 "$SOURCE/web/sp/client/mp/iowolfmp.js" "$OUTPUT/iowolfmp.js"
install -m 0644 "$SOURCE/web/sp/client/mp/iowolfmp.wasm" "$OUTPUT/iowolfmp.wasm"
for mode in sp mp; do
  mkdir -p "$OUTPUT/qvm/$mode"
  for qvm in "$SOURCE/web/sp/client/$mode/main/vm/"*.qvm; do
    install -m 0644 "$qvm" "$OUTPUT/qvm/$mode/$(basename "$qvm")"
  done
done

"$FRAMEWORK_DIR/scripts/build-base-image.sh" "wasm-game-framework:$FRAMEWORK_VERSION"
WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:$FRAMEWORK_VERSION" \
  "$FRAMEWORK_DIR/scripts/build-static-image.sh" "$OUTPUT" "$SP_IMAGE" rtcw-sp

CONTEXT="$(mktemp -d -t idtech3-rtcw-mp-image.XXXXXX)"
cleanup() { find "$CONTEXT" -mindepth 1 -depth -delete 2>/dev/null || true; rmdir "$CONTEXT" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
mkdir -p "$CONTEXT/game-site" "$CONTEXT/iortcw" "$CONTEXT/rtcw-server" "$CONTEXT/omni-bot"
cp -a "$OUTPUT/." "$CONTEXT/game-site/"
git -C "$SOURCE" archive HEAD | tar -x -C "$CONTEXT/iortcw"
cp -a "$ROOT/games/rtcw/server/." "$CONTEXT/rtcw-server/"
cp -a "$ROOT/games/rtcw/omni-bot/." "$CONTEXT/omni-bot/"
cp "$ROOT/games/rtcw/docker/Dockerfile.mp" "$CONTEXT/Dockerfile"

docker build --platform linux/amd64 \
  --build-arg "FRAMEWORK_IMAGE=wasm-game-framework:$FRAMEWORK_VERSION" \
  --build-arg "FRAMEWORK_VERSION=$FRAMEWORK_VERSION" \
  --build-arg "RTCW_SOURCE_COMMIT=$RTCW_SOURCE_COMMIT" \
  --tag "$MP_IMAGE" "$CONTEXT"
test "$(docker run --rm --entrypoint node "$MP_IMAGE" -p \
  "require('/opt/wasm-game-framework/package.json').version")" = "$FRAMEWORK_VERSION"
docker run --rm --entrypoint sh "$MP_IMAGE" -c '
  test -x /opt/rtcw-native/iowolfded.x86_64
  test -x /opt/rtcw-native/qagame.mp.x86_64.so
'
test "$(docker run --rm --entrypoint node "$MP_IMAGE" -p \
  "require('/opt/game-site/framework-install.json').version")" = "$FRAMEWORK_VERSION"
echo "built $SP_IMAGE and $MP_IMAGE"
