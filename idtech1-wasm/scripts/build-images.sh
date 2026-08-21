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

native_build="${ZANDRONUM_NATIVE_BUILD_DIR:-${repo_dir}/.work/zandronum-native}"
if [[ ! -x "${native_build}/zandronum-server" ]]; then
    "${repo_dir}/scripts/build-zandronum.sh"
fi

context="$(mktemp -d -t idtech1-image.XXXXXX)"
cleanup() {
    find "${context}" -mindepth 1 -depth -delete 2>/dev/null || true
    rmdir "${context}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
mkdir -p "${context}/game-site" "${context}/server" "${context}/zandronum"
cp -a "${repo_dir}/web/." "${context}/game-site/"
cp "${repo_dir}/server/package.json" "${repo_dir}/server/package-lock.json" \
   "${repo_dir}/server/supervisor.js" "${repo_dir}/server/classic-ws-proxy.js" \
   "${repo_dir}/server/zandronum-ws-proxy.js" "${context}/server/"
cp "${native_build}/zandronum-server" "${native_build}/zandronum.pk3" \
   "${native_build}/brightmaps.pk3" "${native_build}/skulltag_actors.pk3" \
   "${context}/zandronum/"
cp "${repo_dir}/docker/Dockerfile" "${context}/Dockerfile"

build() {
    local image="$1"
    local variant="$2"
    local image_ref="${namespace}${image}:${tag}"
    docker build \
      --build-arg "FRAMEWORK_IMAGE=${WASM_GAME_FRAMEWORK_IMAGE}" \
      --build-arg "GAME_VARIANT=${variant}" \
      --tag "${image_ref}" "${context}"
    local installed_variant
    installed_variant="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${image_ref}" | awk -F= '$1=="WASM_GAME_VARIANT"{print $2}')"
    [[ "${installed_variant}" == "${variant}" ]]
    [[ "$(docker run --rm --entrypoint node "${image_ref}" -p "require('/opt/wasm-game-framework/package.json').version")" == "${required_framework_version}" ]]
    docker run --rm --entrypoint sh "${image_ref}" -c \
      "test -f /opt/shared-shell/wasm-game-framework.js && \
       test -f /opt/shared-shell/wasm-game-framework.css && \
       test -f /opt/shared-shell/wasm-game-bootstrap.js && \
       test -x /usr/games/chocolate-server && \
       test -x /opt/zandronum/zandronum-server && \
       test -f /opt/idtech1-server/supervisor.js && \
       test ! -e /opt/shared-shell/wolfwasm-shell.js && \
       test ! -e /opt/game-site/index.html && \
       test ! -e /opt/game-site/service-worker.js && \
       test ! -e /opt/game-site/app.webmanifest"
    [[ "$(docker run --rm --entrypoint /usr/games/chocolate-server "${image_ref}" --version)" == \
       'Chocolate Doom 3.1.1' ]]
    [[ "$(docker inspect --format '{{json .Config.Entrypoint}}' "${image_ref}")" == \
       '["/usr/bin/tini","--","node","/opt/idtech1-server/supervisor.js"]' ]]
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
