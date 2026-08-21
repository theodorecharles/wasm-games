#!/usr/bin/env bash
# Build the GoldSource engine web bundle once, then build one Docker image per
# game under games/. Each games/<name>/Dockerfile receives the shared bundle
# staged as game-site/ and bakes in WASM_GAME_VARIANT=<name>.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}"
registry="${DOCKER_REGISTRY:-ghcr.io/theodorecharles}"
tag="${DOCKER_TAG:-latest}"
required_framework_version="0.9.6"
required_framework_commit="ebb1ebe35ad8224a9080279a6529414db42d3284"
framework_version="$(node -p "require('${framework_dir}/package.json').version")"
framework_commit="$(git -C "${framework_dir}" rev-parse HEAD)"

if [[ "${framework_version}" != "${required_framework_version}" || "${framework_commit}" != "${required_framework_commit}" ]]; then
  echo "GoldSource WASM requires wasm-game-framework ${required_framework_version} at ${required_framework_commit}; found ${framework_version} at ${framework_commit}." >&2
  exit 1
fi

# Build the shared web bundle (game-adapter.js + artifacts/) into web/.
npm --prefix "${repo_dir}" run build
npm --prefix "${repo_dir}" test

# Framework base image (serves the static site on container port 8088).
if [[ -z "${WASM_GAME_FRAMEWORK_IMAGE:-}" ]]; then
  WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:${framework_version}"
  "${framework_dir}/scripts/build-base-image.sh" "${WASM_GAME_FRAMEWORK_IMAGE}"
fi
export WASM_GAME_FRAMEWORK_IMAGE

# Build one image per game folder that has a Dockerfile.
for game_dir in "${repo_dir}"/games/*/; do
  game="$(basename "${game_dir}")"
  [[ -f "${game_dir}/Dockerfile" ]] || continue
  image="${registry}/${game}-wasm:${tag}"

  context_dir="$(mktemp -d -t "wasm-${game}.XXXXXX")"
  mkdir -p "${context_dir}/game-site"
  cp -a "${repo_dir}/web/." "${context_dir}/game-site/"
  cp "${game_dir}/Dockerfile" "${context_dir}/Dockerfile"

  echo ">>> building ${image} (variant ${game})"
  docker build \
    --build-arg "FRAMEWORK_IMAGE=${WASM_GAME_FRAMEWORK_IMAGE}" \
    --build-arg "GAME_VARIANT=${game}" \
    --tag "${image}" \
    "${context_dir}"
  rm -rf -- "${context_dir}"
done
