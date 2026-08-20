#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="${IDTECH3_SOURCE_ROOT:-$ROOT/.sources}"
SOURCE="$SOURCE_ROOT/wolfet-wasm"
IMAGE="${1:-${WOLFET_IMAGE:-wolfet-wasm:devel}}"
FRAMEWORK_VERSION="$(node -p "require('$ROOT/sources.lock.json').framework.version")"

sh "$ROOT/scripts/assert-framework.sh" >/dev/null
sh "$ROOT/scripts/prepare-wolfet-source.sh"
docker build --platform linux/amd64 --tag "$IMAGE" "$SOURCE"

test "$(docker image inspect "$IMAGE" --format '{{.Architecture}}')" = "amd64"
docker run --rm --entrypoint sh "$IMAGE" -c "
  test \"\$(node -p \"require('/opt/wolfet-wasm/framework-lock.json').version\")\" = '$FRAMEWORK_VERSION'
  test -f /opt/wolfet-wasm/.generated/shared-shell/index.html
  test -f /opt/wolfet-wasm/.generated/shared-shell/wasm-game-framework.js
  test -f /opt/wolfet-wasm/.generated/framework-runtime/service-worker.js
  test ! -e /opt/wolfet-wasm/web/index.html
  test ! -e /opt/wolfet-wasm/web/service-worker.js
  test ! -e /opt/wolfet-wasm/web/app.webmanifest
"
echo "built $IMAGE from games/wolfet"
