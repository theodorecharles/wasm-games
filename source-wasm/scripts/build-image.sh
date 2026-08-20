#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${1:-source-wasm-wasm:dev}"
framework_root="${WASM_GAME_FRAMEWORK_ROOT:-}"
if [[ -n "${framework_root}" && -x "${framework_root}/scripts/build-static-image.sh" ]]; then
  "${framework_root}/scripts/build-static-image.sh" "${root}/web" "${image}"
  exit 0
fi
echo "Building ${image} from Dockerfile (expects wasm-game-framework:0.9.6 or WASM_GAME_FRAMEWORK_IMAGE)"
docker build --build-arg "FRAMEWORK_IMAGE=${WASM_GAME_FRAMEWORK_IMAGE:-wasm-game-framework:0.9.6}" --tag "${image}" "${root}"
