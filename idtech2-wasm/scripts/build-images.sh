#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_dir="$(cd "$repo_dir/../.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$workspace_dir/wasm-game-framework}"
namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"
required_framework_version="0.9.6"
required_framework_commit="ebb1ebe35ad8224a9080279a6529414db42d3284"
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "$framework_dir" rev-parse HEAD)"

if [[ "$framework_version" != "$required_framework_version" || "$framework_commit" != "$required_framework_commit" ]]; then
    printf 'id Tech 2 WASM requires wasm-game-framework %s at %s; found %s at %s.\n' \
        "$required_framework_version" "$required_framework_commit" "$framework_version" "$framework_commit" >&2
    exit 1
fi

"$repo_dir/scripts/test-web.sh"
"$repo_dir/scripts/test-static.sh"
"$repo_dir/scripts/fetch-server-dependencies.sh" >/dev/null

if [[ -z "${WASM_GAME_FRAMEWORK_IMAGE:-}" ]]; then
    WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:$framework_version"
    "$framework_dir/scripts/build-base-image.sh" "$WASM_GAME_FRAMEWORK_IMAGE"
    export WASM_GAME_FRAMEWORK_IMAGE
fi
if [[ -n "$namespace" ]]; then namespace="${namespace%/}/"; fi

frikbot_dir="$repo_dir/.work/mods/frikbot"
threezb2_dir="$repo_dir/.work/mods/3zb2"
context="$(mktemp -d -t idtech2-image.XXXXXX)"
cleanup() {
    find "$context" -mindepth 1 -depth -delete 2>/dev/null || true
    rmdir "$context" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

mkdir -p "$context/game-site" "$context/server" "$context/frikbot/bin" \
    "$context/3zb2/assets"
cp -a "$repo_dir/web/dist/." "$context/game-site/"
cp "$repo_dir/server/package.json" "$repo_dir/server/package-lock.json" \
    "$repo_dir/server/supervisor.js" "$repo_dir/server/datagram-ws-proxy.js" \
    "$context/server/"
cp "$frikbot_dir/src/build/tmp/bin/nqserver" "$context/frikbot/bin/nqserver"
cp "$frikbot_dir/progs.dat" "$context/frikbot/progs.dat"
cp "$threezb2_dir/release/game.so" "$context/3zb2/game.so"
cp -a "$threezb2_dir/misc/." "$context/3zb2/assets/"
cp "$repo_dir/docker/Dockerfile" "$context/Dockerfile"

build() {
    local name="$1"
    local variant="$2"
    local image_ref="${namespace}${name}:${tag}"
    docker build \
      --build-arg "FRAMEWORK_IMAGE=${WASM_GAME_FRAMEWORK_IMAGE}" \
      --build-arg "GAME_VARIANT=${variant}" \
      --tag "$image_ref" "$context"
    local installed_variant
    installed_variant="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image_ref" | awk -F= '$1=="WASM_GAME_VARIANT"{print $2}')"
    [[ "$installed_variant" == "$variant" ]]
    docker run --rm --entrypoint sh "$image_ref" -c \
      "test -f /opt/shared-shell/wasm-game-framework.js && \
       test -f /opt/game-site/quake1.wasm && \
       test -f /opt/game-site/quake2.wasm && \
       test -x /opt/frikbot/bin/nqserver && \
       test -f /opt/frikbot/progs.dat && \
       test -x /usr/lib/yamagi-quake2/q2ded && \
       test -f /opt/3zb2/game.so && \
       test -f /opt/idtech2-server/supervisor.js && \
       test ! -e /opt/game-site/index.html && \
       test ! -e /opt/game-site/service-worker.js && \
       ! find /opt/game-site -type f \( -iname '*.pak' -o -iname '*.data' \) -print -quit | grep -q ."
    [[ "$(docker inspect --format '{{json .Config.Entrypoint}}' "$image_ref")" == \
       '["/usr/bin/tini","--","node","/opt/idtech2-server/supervisor.js"]' ]]
    printf 'Verified %s (%s, managed multiplayer, framework %s).\n' "$image_ref" "$variant" "$required_framework_version"
}

build idtech2-wasm suite
build quake1-wasm quake
build quake2-wasm quake2
build quake2-xatrix-wasm quake2-xatrix
build quake2-rogue-wasm quake2-rogue

DOCKER_NAMESPACE="$namespace" DOCKER_TAG="$tag" "$repo_dir/scripts/test-images.sh"
