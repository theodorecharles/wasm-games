#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}"
namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"
required_version="$(node -p "require('${repo_dir}/framework-lock.json').version")"
required_commit="$(node -p "require('${repo_dir}/framework-lock.json').commit || ''")"
required_status="$(node -p "require('${repo_dir}/framework-lock.json').status")"

if [[ "${required_status}" != "released" || ! "${required_commit}" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'framework-lock.json is not finalized; refusing to build images.\n' >&2
  exit 1
fi
if [[ "$(node -p "require('${framework_dir}/package.json').version")" != "${required_version}" || \
      "$(git -C "${framework_dir}" rev-parse HEAD)" != "${required_commit}" ]]; then
  printf 'emulation-wasm requires wasm-game-framework %s at %s.\n' "${required_version}" "${required_commit}" >&2
  exit 1
fi

if [[ -z "${WASM_GAME_FRAMEWORK_IMAGE:-}" ]]; then
  WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:${required_version}"
  "${framework_dir}/scripts/build-base-image.sh" "${WASM_GAME_FRAMEWORK_IMAGE}"
  export WASM_GAME_FRAMEWORK_IMAGE
fi
[[ -z "${namespace}" ]] || namespace="${namespace%/}/"

node --input-type=module - "${repo_dir}/images.json" "$@" <<'NODE' |
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const requested = process.argv.slice(3);
const known = new Set(config.images.flatMap(image => [image.name, image.variant]));
for (const value of requested) {
  if (!known.has(value)) throw new Error(`unknown image or variant: ${value}`);
}
const selected = requested.length
  ? config.images.filter(image => requested.includes(image.name) || requested.includes(image.variant))
  : config.images;
for (const image of selected) process.stdout.write(`${image.name}\t${image.variant}\n`);
NODE
while IFS=$'\t' read -r image variant; do
  site_dir="${repo_dir}/.work/site-${variant}"
  node "${repo_dir}/scripts/prepare-site.mjs" "${variant}" "${site_dir}"
  image_ref="${namespace}${image}:${tag}"
  "${framework_dir}/scripts/build-static-image.sh" "${site_dir}" "${image_ref}" "${variant}"
  docker run --rm --entrypoint sh "${image_ref}" -c \
    "test ! -e /opt/game-site/index.html && test ! -e /opt/game-site/service-worker.js && test ! -e /opt/game-site/app.webmanifest"
  printf 'verified %s (%s)\n' "${image_ref}" "${variant}"
done
