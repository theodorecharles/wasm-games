#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_source_dir="${COD2_WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}"
repository="${COD2_WASM_IMAGE_REPO:-local/cod2-wasm}"
tag="${COD2_WASM_IMAGE_TAG:-dev}"
framework_image="${COD2_WASM_FRAMEWORK_IMAGE:-wasm-game-framework:0.9.6}"
expected_commit="ebb1ebe35ad8224a9080279a6529414db42d3284"
revision="$(git -C "${repo_root}" rev-parse --verify HEAD 2>/dev/null || printf local)"

"${repo_root}/scripts/build-web.sh"
framework_parent="$(mktemp -d -t cod2-wasm-framework-image.XXXXXX)"
framework_dir="${framework_parent}/framework"
git -C "${framework_source_dir}" worktree add --quiet --detach "${framework_dir}" "${expected_commit}"
cleanup() {
  git -C "${framework_source_dir}" worktree remove --force "${framework_dir}" >/dev/null 2>&1 || true
  rm -rf -- "${framework_parent}"
}
trap cleanup EXIT

test "$(node -p "require('${framework_dir}/package.json').version")" = "0.9.6"
test "$(git -C "${framework_dir}" rev-parse HEAD)" = "${expected_commit}"
"${framework_dir}/scripts/build-base-image.sh" "${framework_image}"

docker build --build-arg "FRAMEWORK_IMAGE=${framework_image}" --build-arg GAME_VARIANT=suite \
  --build-arg "VCS_REF=${revision}" -t "${repository}:${tag}" "${repo_root}"
docker build --build-arg "FRAMEWORK_IMAGE=${framework_image}" --build-arg GAME_VARIANT=cod2-mp \
  --build-arg "VCS_REF=${revision}" -t "${repository}:cod2-mp-${tag}" "${repo_root}"

for image in "${repository}:${tag}" "${repository}:cod2-mp-${tag}"; do
  test "$(docker run --rm --entrypoint node "${image}" -p "require('/opt/wasm-game-framework/package.json').version")" = "0.9.6"
  docker run --rm --entrypoint sh "${image}" -c \
    "test -f /opt/game-site/cod2_core_probe.wasm && \
     test -f /opt/game-site/wasm-game.json && \
     test ! -e /opt/game-site/index.html && \
     test ! -e /opt/game-site/service-worker.js && \
     test ! -e /opt/game-site/app.webmanifest && \
     ! find /opt/game-site -type f -iname '*.iwd' -print -quit | grep -q ."
done

echo "Built ${repository}:${tag} and ${repository}:cod2-mp-${tag}"
