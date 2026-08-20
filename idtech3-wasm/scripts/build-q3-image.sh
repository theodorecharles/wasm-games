#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
SOURCE="$SOURCE_ROOT/quakejs"
IMAGE="${1:-${Q3_IMAGE:-quake3-wasm:devel}}"
FRAMEWORK_DIR="$(sh "$ROOT/scripts/assert-framework.sh")"
FRAMEWORK_VERSION="$(node -p "require('$ROOT/sources.lock.json').framework.version")"

sh "$ROOT/scripts/build-q3-site.sh"
"$FRAMEWORK_DIR/scripts/build-base-image.sh" "wasm-game-framework:$FRAMEWORK_VERSION"

CONTEXT="$(mktemp -d -t idtech3-q3-image.XXXXXX)"
cleanup() { find "$CONTEXT" -mindepth 1 -depth -delete 2>/dev/null || true; rmdir "$CONTEXT" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
mkdir -p "$CONTEXT/game-site" "$CONTEXT/quakejs" "$CONTEXT/q3-server" "$CONTEXT/q3-framework"
cp -a "$ROOT/dist/quake3/." "$CONTEXT/game-site/"
node "$ROOT/games/quake3/scripts/rewrite-quakejs-dedicated.js" \
  "$SOURCE/build/ioq3ded.js" "$CONTEXT/quakejs/ioq3ded.js"
cp "$ROOT/games/quake3/server/package.json" "$ROOT/games/quake3/server/package-lock.json" \
  "$ROOT/games/quake3/server/supervisor.js" "$ROOT/games/quake3/server/access.js" \
  "$ROOT/games/quake3/server/server.cfg" "$CONTEXT/q3-server/"
cp "$SOURCE/ioq3/build/release-linux-x86_64/baseq3/vm/qagame.qvm" "$CONTEXT/q3-server/qagame.qvm"
cp "$FRAMEWORK_DIR/server/lifecycle.js" "$CONTEXT/q3-framework/lifecycle.js"
cp "$ROOT/games/quake3/docker/Dockerfile" "$CONTEXT/Dockerfile"

docker build --build-arg "FRAMEWORK_IMAGE=wasm-game-framework:$FRAMEWORK_VERSION" --tag "$IMAGE" "$CONTEXT"
test "$(docker run --rm --entrypoint node "$IMAGE" -p "require('/opt/wasm-game-framework/package.json').version")" = "$FRAMEWORK_VERSION"
test "$(docker run --rm --entrypoint node "$IMAGE" -p "require('/opt/game-site/framework-install.json').version")" = "$FRAMEWORK_VERSION"
test "$(docker run --rm --entrypoint node "$IMAGE" -p "require('/opt/game-site/framework-install.json').commit")" = \
  "$(node -p "require('$ROOT/sources.lock.json').framework.commit")"
echo "built $IMAGE"
