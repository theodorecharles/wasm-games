#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
TARGET="$SOURCE_ROOT/wolfet-wasm"
GAME="$ROOT/games/wolfet"
LOCK="$ROOT/sources.lock.json"
FRAMEWORK_VERSION="$(node -p "require('$LOCK').framework.version")"
FRAMEWORK_COMMIT="$(node -p "require('$LOCK').framework.commit")"
TEMP_ROOT="$(mktemp -d -t idtech3-wolfet-source.XXXXXX)"

cleanup() {
  find "$TEMP_ROOT" -mindepth 1 -depth -delete 2>/dev/null || true
  rmdir "$TEMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

test -d "$GAME"
test -f "$GAME/Dockerfile"
test -f "$GAME/web/game-adapter.js"
test -f "$GAME/web/wasm-game.json"

TREE="$TEMP_ROOT/tree"
mkdir -p "$TREE"
cp -a "$GAME/." "$TREE/"

test "$(node -p "require('$TREE/framework-lock.json').version")" = "$FRAMEWORK_VERSION"
test "$(node -p "require('$TREE/framework-lock.json').commit")" = "$FRAMEWORK_COMMIT"
test "$(node -p "require('$TREE/web/wasm-game.json').menuCursor")" = "native"
test "$(sha256sum "$TREE/patches/etlegacy-wasm.patch" | awk '{print $1}')" = \
  "$(node -p "require('$LOCK').wolfet.enginePatchSha256")"
test "$(sha256sum "$TREE/patches/etlegacy-modes.patch" | awk '{print $1}')" = \
  "$(node -p "require('$LOCK').wolfet.modePatchSha256")"
test "$(sha256sum "$TREE/patches/etlegacy-eth32nix.patch" | awk '{print $1}')" = \
  "$(node -p "require('$LOCK').wolfet.eth32PatchSha256")"
test "$(sha256sum "$TREE/patches/etlegacy-human-slot.patch" | awk '{print $1}')" = \
  "$(node -p "require('$LOCK').wolfet.humanSlotPatchSha256")"
test "$(sha256sum "$TREE/patches/etlegacy-etjs-ui.patch" | awk '{print $1}')" = \
  "$(node -p "require('$LOCK').wolfet.uiPatchSha256")"
grep -q "$(node -p "require('$LOCK').wolfet.engineCommit")" "$TREE/scripts/setup-etlegacy.sh"

for size in 192 512; do
  icon="$TREE/web/img/et-$size.png"
  expected="$(node -p "require('$LOCK').wolfet.icon${size}Sha256")"
  test -f "$icon"
  test "$(sha256sum "$icon" | awk '{print $1}')" = "$expected"
done

test ! -e "$TREE/web/index.html"
test ! -e "$TREE/web/service-worker.js"
test ! -e "$TREE/web/app.webmanifest"
test ! -e "$TREE/runtime/etmain/pak0.pk3"
test ! -e "$TREE/web/client/etjs.wasm"

mkdir -p "$SOURCE_ROOT"
if [ -d "$TARGET" ]; then
  find "$TARGET" -mindepth 1 -depth -delete
else
  mkdir -p "$TARGET"
fi
cp -a "$TREE/." "$TARGET/"
echo "WolfET in-tree source ready at $TARGET"
