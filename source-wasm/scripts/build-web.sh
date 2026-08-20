#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
engine_root="${SOURCE_ENGINE_ROOT:-${repo_root}/vendor/source-engine}"
web_dir="${SOURCE_WASM_WEB_DIR:-${repo_root}/web}"
jobs="${SOURCE_WASM_JOBS:-$(nproc)}"
framework_root="${WASM_GAME_FRAMEWORK_ROOT:-${repo_root}/vendor/wasm-game-framework}"

if ! command -v emcc >/dev/null 2>&1; then
  emsdk_root="${SOURCE_WASM_EMSDK:-${EMSDK_DIR:-/home/ted/emsdk}}"
  [[ -f "${emsdk_root}/emsdk_env.sh" ]] || { echo "activate Emscripten or set SOURCE_WASM_EMSDK" >&2; exit 1; }
  export EMSDK_QUIET=1
  # shellcheck disable=SC1091
  source "${emsdk_root}/emsdk_env.sh"
fi

command -v emcc >/dev/null
command -v em++ >/dev/null

[[ -f "${engine_root}/wscript" ]] || { echo "missing engine tree at ${engine_root}" >&2; exit 1; }
[[ -f "${engine_root}/ivp/ivp_physics/wscript" ]] || { echo "ivp is incomplete" >&2; exit 1; }

export CC="${CC:-emcc}"
export CXX="${CXX:-em++}"
export AR="${AR:-emar}"
export RANLIB="${RANLIB:-emranlib}"
export EMSCRIPTEN=1

mkdir -p "${engine_root}/.wasm-build" "${web_dir}"
cd "${engine_root}"
chmod +x ./waf || true

python3 ./waf configure \
  -T release \
  --disable-warns \
  --togles \
  --emscripten \
  --build-games "${SOURCE_WASM_GAMES:-hl2}" \
  --prefix="${engine_root}/.wasm-build/prefix" \
  -o "${engine_root}/.wasm-build"

python3 ./waf build -j "${jobs}"

factory_wasm="$(find "${engine_root}/.wasm-build" -name 'source-engine.wasm' | head -n 1)"
factory_js="$(find "${engine_root}/.wasm-build" -name 'source-engine.js' | head -n 1)"
if [[ -z "${factory_js}" ]]; then
  # Waf cxxprogram emits the modularize JS without a .js suffix.
  candidate="$(find "${engine_root}/.wasm-build" -name 'source-engine' -type f | head -n 1)"
  if [[ -n "${candidate}" ]] && grep -q 'createSourceEngineModule' "${candidate}"; then
    factory_js="${candidate}"
  fi
fi
if [[ -z "${factory_js}" || -z "${factory_wasm}" ]]; then
  echo "engine factory was not produced" >&2
  find "${engine_root}/.wasm-build" \( -name '*.js' -o -name '*.wasm' -o -name 'source-engine' \) | head
  exit 1
fi

install -m 0644 "${factory_js}" "${web_dir}/source-engine.js"
install -m 0644 "${factory_wasm}" "${web_dir}/source-engine.wasm"
if [[ -f "${factory_js%.js}.worker.js" ]]; then
  install -m 0644 "${factory_js%.js}.worker.js" "${web_dir}/source-engine.worker.js"
fi

# A private review output may contain only the generated factory.  Keep the
# browser package self-contained by carrying over the repository-owned
# adapter/contract assets without overwriting any caller-provided files.
for asset in game-adapter.js wasm-game.json wasm-game-data.json data-validator.mjs icon.svg; do
  if [[ ! -f "${web_dir}/${asset}" ]]; then
    install -m 0644 "${repo_root}/web/${asset}" "${web_dir}/${asset}"
  fi
done

node "${framework_root}/scripts/check-game-package.js" "${web_dir}"
printf 'Built Source engine factory at %s\n' "${web_dir}/source-engine.js"
