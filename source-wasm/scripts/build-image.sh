#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${1:-source-wasm-wasm:dev}"
framework_root="${WASM_GAME_FRAMEWORK_ROOT:-${WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}}"
framework_image="${WASM_GAME_FRAMEWORK_IMAGE:-wasm-game-framework:0.9.6}"
if ! docker image inspect "${framework_image}" >/dev/null 2>&1; then
  "${framework_root}/scripts/build-base-image.sh" "${framework_image}"
fi
echo "Building ${image} from Dockerfile with ${framework_image}"
docker build --build-arg "FRAMEWORK_IMAGE=${framework_image}" --tag "${image}" "${root}"
