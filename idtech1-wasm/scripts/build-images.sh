#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$(cd "${repo_dir}/../wasm-game-framework" && pwd)}"
namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"
required_framework_version="0.9.4"
required_framework_commit="c4ad3b9e075f881d32f044299fbfeee703a9169d"
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "${framework_dir}" rev-parse HEAD)"

if [[ "${framework_version}" != "${required_framework_version}" || "${framework_commit}" != "${required_framework_commit}" ]]; then
    echo "id Tech 1 WASM requires wasm-game-framework ${required_framework_version} at ${required_framework_commit}; found ${framework_version} at ${framework_commit}." >&2
    exit 1
fi

if [[ -z "${WASM_GAME_FRAMEWORK_IMAGE:-}" ]]; then
    WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:${framework_version}"
    "${framework_dir}/scripts/build-base-image.sh" "${WASM_GAME_FRAMEWORK_IMAGE}"
    export WASM_GAME_FRAMEWORK_IMAGE
fi

if [[ -n "${namespace}" ]]; then
    namespace="${namespace%/}/"
fi

build() {
    local image="$1"
    local variant="$2"
    local image_ref="${namespace}${image}:${tag}"
    "${framework_dir}/scripts/build-static-image.sh" \
      "${repo_dir}/web" "${image_ref}" "${variant}"
    local installed_variant
    installed_variant="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${image_ref}" | awk -F= '$1=="WASM_GAME_VARIANT"{print $2}')"
    [[ "${installed_variant}" == "${variant}" ]]
    [[ "$(docker run --rm --entrypoint node "${image_ref}" -p "require('/opt/wasm-game-framework/package.json').version")" == "${required_framework_version}" ]]
    docker run --rm --entrypoint sh "${image_ref}" -c \
      "test -f /opt/shared-shell/wasm-game-framework.js && \
       test -f /opt/shared-shell/wasm-game-framework.css && \
       test -f /opt/shared-shell/wasm-game-bootstrap.js && \
       test ! -e /opt/shared-shell/wolfwasm-shell.js && \
       test ! -e /opt/game-site/index.html && \
       test ! -e /opt/game-site/service-worker.js && \
       test ! -e /opt/game-site/app.webmanifest"
    echo "verified ${image_ref} (${variant}, framework ${required_framework_version})"
}

build idtech1-wasm suite
build idtech1-doom-wasm doom
build idtech1-doom2-wasm doom2
build idtech1-tnt-wasm tnt
build idtech1-plutonia-wasm plutonia
build idtech1-heretic-wasm heretic
build idtech1-hexen-wasm hexen
build idtech1-chex-wasm chex
