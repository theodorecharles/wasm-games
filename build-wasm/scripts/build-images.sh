#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9e075f881d32f044299fbfeee703a9169d"
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "$framework_dir" rev-parse HEAD)"

if [[ "$framework_version" != "$required_framework_version" || "$framework_commit" != "$required_framework_commit" ]]; then
    printf 'Build WASM requires wasm-game-framework %s at %s; found %s at %s.\n' \
        "$required_framework_version" "$required_framework_commit" "$framework_version" "$framework_commit" >&2
    exit 1
fi

"$repo_dir/scripts/test-web.sh"
"$repo_dir/scripts/test-static.sh"

if [[ -z "${WASM_GAME_FRAMEWORK_IMAGE:-}" ]]; then
    WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:$framework_version"
    "$framework_dir/scripts/build-base-image.sh" "$WASM_GAME_FRAMEWORK_IMAGE"
    export WASM_GAME_FRAMEWORK_IMAGE
fi
if [[ -n "$namespace" ]]; then namespace="${namespace%/}/"; fi

build() {
    local name="$1"
    local variant="$2"
    local image_ref="${namespace}${name}:${tag}"
    "$framework_dir/scripts/build-static-image.sh" "$repo_dir/build-web/dist" "$image_ref" "$variant"
    local installed_variant
    installed_variant="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image_ref" | awk -F= '$1=="WASM_GAME_VARIANT"{print $2}')"
    [[ "$installed_variant" == "$variant" ]]
    [[ "$(docker run --rm --entrypoint node "$image_ref" -p "require('/opt/wasm-game-framework/package.json').version")" == "$required_framework_version" ]]
    docker run --rm --entrypoint sh "$image_ref" -c \
      "test -f /opt/shared-shell/wasm-game-framework.js && \
       test -f /opt/shared-shell/wasm-game-framework.css && \
       test -f /opt/shared-shell/wasm-game-bootstrap.js && \
       test -f /opt/game-site/blood.wasm && \
       test -f /opt/game-site/blood.data && \
       test -f /opt/game-site/duke3d.wasm && \
       test ! -e /opt/shared-shell/wolfwasm-shell.js && \
       test ! -e /opt/game-site/index.html && \
       test ! -e /opt/game-site/service-worker.js && \
       test ! -e /opt/game-site/app.webmanifest && \
       ! find /opt/game-site -type f \( -iname '*.grp' -o -iname '*.rts' -o -iname '*.rff' -o -iname '*.art' \) -print -quit | grep -q ."
    printf 'Verified %s (%s, framework %s).\n' "$image_ref" "$variant" "$required_framework_version"
}

build build-wasm suite
build blood-wasm blood
build duke3d-wasm duke3d

DOCKER_NAMESPACE="$namespace" DOCKER_TAG="$tag" "$repo_dir/scripts/test-images.sh"
