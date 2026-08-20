#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
variant="${VARIANT:-${1:-}}"
case "${variant}" in
  nes|snes|ps1|ps2) ;;
  *) printf 'usage: VARIANT=nes|snes|ps1|ps2 %s\n' "$0" >&2; exit 2 ;;
esac

framework_status="$(node -p "require('${repo_dir}/framework-lock.json').status")"
framework_commit="$(node -p "require('${repo_dir}/framework-lock.json').commit || ''")"
if [[ "${framework_status}" != "released" || ! "${framework_commit}" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'The wasm-game-framework release lock is not finalized; persistence, controllers, and media-library provisioning are required.\n' >&2
  exit 1
fi

"${repo_dir}/scripts/verify-source-lock.mjs"
variant_file="${repo_dir}/cmake/variants/${variant}.cmake"
if [[ ! -f "${variant_file}" ]]; then
  printf '%s native host is not implemented; refusing to manufacture a runtime artifact.\n' "${variant}" >&2
  exit 1
fi

if [[ -z "${EMSDK_DIR:-}" || ! -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
  printf 'Set EMSDK_DIR to an Emscripten SDK checkout.\n' >&2
  exit 1
fi

source "${EMSDK_DIR}/emsdk_env.sh" >/dev/null
build_dir="${repo_dir}/build/${variant}"
output_dir="${repo_dir}/build-web/${variant}"
emcmake cmake -S "${repo_dir}" -B "${build_dir}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DEMULATION_VARIANT="${variant}"
cmake --build "${build_dir}" --parallel
mkdir -p "${output_dir}"
cp "${build_dir}/emulator.js" "${build_dir}/emulator.wasm" "${output_dir}/"
node --check "${output_dir}/emulator.js"
if [[ "${variant}" == "ps1" ]]; then
  wasm-validate --enable-threads "${output_dir}/emulator.wasm"
else
  wasm-validate "${output_dir}/emulator.wasm"
fi
printf 'built %s native runtime\n' "${variant}"
