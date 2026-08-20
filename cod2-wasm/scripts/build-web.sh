#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${COD2_WASM_BUILD_DIR:-${repo_root}/out/cod2-wasm-core}"
site_dir="${build_dir}/site"
framework_source_dir="${COD2_WASM_FRAMEWORK_DIR:-${repo_root}/../wasm-game-framework}"
expected_version="0.9.2"
expected_commit="53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f"

actual_version="$(git -C "${framework_source_dir}" show "${expected_commit}:package.json" | node -pe 'JSON.parse(fs.readFileSync(0)).version')"
actual_commit="$(git -C "${framework_source_dir}" rev-parse 'v0.9.2^{}')"
[[ "${actual_version}" == "${expected_version}" ]] || { echo "expected framework ${expected_version}, found ${actual_version}" >&2; exit 1; }
[[ "${actual_commit}" == "${expected_commit}" ]] || { echo "framework v0.9.2 resolves to ${actual_commit}, expected ${expected_commit}" >&2; exit 1; }

framework_parent="$(mktemp -d -t cod2-wasm-framework.XXXXXX)"
framework_dir="${framework_parent}/framework"
git -C "${framework_source_dir}" worktree add --quiet --detach "${framework_dir}" "${expected_commit}"
cleanup() {
    git -C "${framework_source_dir}" worktree remove --force "${framework_dir}" >/dev/null 2>&1 || true
    rm -rf -- "${framework_parent}" "${metadata_dir:-}"
}
trap cleanup EXIT

if ! command -v emcmake >/dev/null 2>&1; then
    emsdk_root="${COD2_WASM_EMSDK:-${EMSDK:-/home/ted/emsdk}}"
    [[ -f "${emsdk_root}/emsdk_env.sh" ]] || { echo "activate Emscripten or set COD2_WASM_EMSDK" >&2; exit 1; }
    export EMSDK_QUIET=1
    # shellcheck disable=SC1091
    source "${emsdk_root}/emsdk_env.sh"
fi

emcmake cmake \
    -S "${repo_root}/downstream/wasm" \
    -B "${build_dir}" \
    -DCMAKE_BUILD_TYPE=Release
cmake --build "${build_dir}" --target cod2_client_objects cod2_core_probe --parallel

if [[ "${COD2_ATTEMPT_CLIENT_LINK:-0}" == "1" ]]; then
    cmake --build "${build_dir}" --target cod2_client --parallel
fi

mkdir -p "${site_dir}"
rm -f -- "${site_dir}/index.html" "${site_dir}/asset-validator.js" \
    "${site_dir}/owner-manifest.json" "${site_dir}/service-worker.js" "${site_dir}/app.webmanifest"
install -m 0644 \
    "${repo_root}/site/cod2-diagnostic.svg" \
    "${repo_root}/site/game-adapter.js" \
    "${repo_root}/site/wasm-game-data.json" \
    "${repo_root}/site/wasm-game.json" \
    "${site_dir}/"

metadata_dir="$(mktemp -d -t cod2-wasm-framework-metadata.XXXXXX)"
"${framework_dir}/scripts/install-browser-package.sh" "${metadata_dir}" copy >/dev/null
install -m 0644 "${metadata_dir}/wasm-game-framework.json" "${site_dir}/wasm-game-framework.json"

node "${framework_dir}/scripts/check-game-package.js" "${site_dir}"
"${repo_root}/scripts/test-static.sh" "${site_dir}" "${framework_dir}"

echo "Compiled the reconstructed multiplayer object graph and canonical diagnostic package."
echo "The client link remains blocked; this build does not launch the game."
