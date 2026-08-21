#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${XASH_SOURCE_DIR:-}"
source_parent=""
output="${XASH_FRAMEWORK_OUTPUT:-${repo_dir}/native/xash-framework.wasm}"
glue_output="${XASH_FRAMEWORK_GLUE_OUTPUT:-${repo_dir}/native/xash-framework.js}"
repository="https://github.com/theodorecharles/xash3d-fwgs.git"
expected_commit="f85aa0c8f7d46c27191132b44d872c8e331308de"

if [[ -z "${source_dir}" || ! -d "${source_dir}/.git" ]]; then
  source_parent="$(mktemp -d -t goldsource-xash-source.XXXXXX)"
  source_dir="${source_parent}/source"
  git clone --filter=blob:none --no-checkout "${repository}" "${source_dir}"
  git -C "${source_dir}" checkout --detach "${expected_commit}"
  git -C "${source_dir}" submodule update --init --recursive
fi
if [[ "$(git -C "${source_dir}" rev-parse HEAD)" != "${expected_commit}" ]]; then
  echo "Xash source must be exactly ${expected_commit}." >&2
  exit 2
fi
if git -C "${source_dir}" submodule status --recursive | grep -Eq '^[-+U]'; then
  echo "Initialize every pinned Xash submodule before building." >&2
  exit 2
fi

build_context="$(mktemp -d -t goldsource-xash-build.XXXXXX)"
container_id=""
cleanup() {
  if [[ -n "${container_id}" ]]; then docker rm -f "${container_id}" >/dev/null 2>&1 || true; fi
  rm -rf -- "${build_context}" ${source_parent:+"${source_parent}"}
}
trap cleanup EXIT

cp -a "${source_dir}" "${build_context}/source"
for patch_file in "${repo_dir}"/patches/*.patch; do
  git -C "${build_context}/source" apply --check "${patch_file}"
  git -C "${build_context}/source" apply "${patch_file}"
done
docker build --pull --progress=plain \
  -f "${repo_dir}/native/Dockerfile" \
  -t goldsource-xash-framework:build "${build_context}"
container_id="$(docker create goldsource-xash-framework:build)"
mkdir -p "$(dirname "${output}")"
docker cp "${container_id}:/xash3d-fwgs/out/xash.wasm" "${output}"
# The same build produces the mainui menu library; vendor it so the adapter
# can ship our patched menu (no quit UI) instead of the npm prebuilt.
menu_wasm="$(docker cp "${container_id}:/xash3d-fwgs/out" "${build_context}/out" >/dev/null 2>&1 && ls "${build_context}/out" | grep -E '^(lib)?menu.*\.wasm$' | head -1 || true)"
if [[ -n "${menu_wasm}" ]]; then
  cp "${build_context}/out/${menu_wasm}" "${repo_dir}/native/menu-framework.wasm"
  echo "Menu library: ${menu_wasm} -> native/menu-framework.wasm"
else
  echo "WARNING: no menu library found in build output" >&2
  ls "${build_context}/out" >&2 || true
fi
raw_glue="${build_context}/raw.js"
if ! docker cp "${container_id}:/xash3d-fwgs/out/raw.js" "${raw_glue}" 2>/dev/null; then
  docker cp "${container_id}:/xash3d-fwgs/out/xash.js" "${raw_glue}"
fi
node "${repo_dir}/scripts/patch-xash-glue.mjs" "${raw_glue}" "${glue_output}"
echo "Built ${output} and ${glue_output} from Xash3D-FWGS ${expected_commit} with Emscripten 4.0.23."
