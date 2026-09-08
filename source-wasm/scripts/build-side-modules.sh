#!/usr/bin/env bash
set -euo pipefail

# Run inside the prepared, pinned SDK described in SIDE-MODULE-BUILD.md.
# Native input and output are required private paths outside this checkout.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
reference_file="${script_dir}/../side-module-reference.json"
relink_only=0
case "${1:-}" in
  --relink-only) relink_only=1; shift ;;
  '') ;;
  *) echo "Usage: SOURCE_ENGINE_ROOT=... SOURCE_WASM_WEB_DIR=... $0 [--relink-only]" >&2; exit 2 ;;
esac
[[ $# -eq 0 ]] || { echo 'Unexpected arguments' >&2; exit 2; }
: "${SOURCE_ENGINE_ROOT:?Set SOURCE_ENGINE_ROOT to the private pinned source checkout}"
: "${SOURCE_WASM_WEB_DIR:?Set SOURCE_WASM_WEB_DIR to a private artifact directory}"
engine_root="$(realpath "${SOURCE_ENGINE_ROOT}")"
build_dir="$(realpath -m "${SOURCE_WASM_BUILD_DIR:-${engine_root}/build-side-hl2}")"
web_dir="$(realpath -m "${SOURCE_WASM_WEB_DIR}")"
install_dir="${build_dir}/install"
jobs="${SOURCE_WASM_JOBS:-12}"
[[ "${jobs}" =~ ^[1-9][0-9]*$ ]] || { echo 'SOURCE_WASM_JOBS must be positive' >&2; exit 2; }

for private_dir in "${engine_root}" "${build_dir}" "${web_dir}"; do
  case "${private_dir}/" in
    "${repo_root}/"*) echo "Native source and artifacts must stay outside this checkout: ${private_dir}" >&2; exit 1 ;;
  esac
done
for required in emcc em++ emar emranlib python3 git node sha256sum; do
  command -v "${required}" >/dev/null || { echo "Missing build tool: ${required}" >&2; exit 1; }
done
emscripten_root="${SOURCE_WASM_EMSCRIPTEN_ROOT:-}"
if [[ -z "${emscripten_root}" ]]; then
  emscripten_root="$(dirname "$(readlink -f "$(command -v emcc)")")"
fi

python3 - "${reference_file}" "${engine_root}" "${emscripten_root}" <<'PY'
import hashlib
import json
import pathlib
import subprocess
import sys

reference = json.loads(pathlib.Path(sys.argv[1]).read_text())
engine = pathlib.Path(sys.argv[2])
sdk = pathlib.Path(sys.argv[3])
version = subprocess.check_output(['emcc', '--version'], text=True).splitlines()[0]
if f" {reference['emsdkVersion']} " not in version:
    raise SystemExit(f"Expected Emscripten {reference['emsdkVersion']}; got {version}")
for directory, expected in [(engine, reference['sourceCommit'])] + [
    (engine / name, commit) for name, commit in reference['submodules'].items()
]:
    actual = subprocess.check_output([
        'git', '-c', f'safe.directory={directory}', '-C', str(directory), 'rev-parse', 'HEAD'
    ], text=True).strip()
    if actual != expected:
        raise SystemExit(f'Wrong source pin at {directory}: {actual}; expected {expected}')
for name, expected in reference['sdkPatchedFiles'].items():
    file = sdk / name
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Expected prepared SDK patch missing or different: {file}; see SIDE-MODULE-BUILD.md')
PY

export CC=emcc CXX=em++ AR=emar RANLIB=emranlib
export PKG_CONFIG_PATH="${engine_root}/emscripten/pkgconfig${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}"
cd "${engine_root}"
if [[ "${relink_only}" -eq 0 ]]; then
  python3 "${script_dir}/apply-side-module-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-thread-bridge.py" "${engine_root}"
  python3 "${script_dir}/apply-renderer-address-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-texture-upload-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-srgb-write-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-render-target-depth-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-present-transfer-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-server-cvar-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-scene-token-patches.py" "${engine_root}"
  python3 "${script_dir}/apply-audio-contract-patches.py" "${engine_root}"
  python3 waf configure -T release --notests -4 --togles --emscripten \
    --disable-warns --build-games=hl2 --prefix="${install_dir}" -o "${build_dir}"
  python3 waf install -j "${jobs}"
else
  python3 "${script_dir}/apply-side-module-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-thread-bridge.py" --check "${engine_root}"
  python3 "${script_dir}/apply-renderer-address-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-texture-upload-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-srgb-write-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-render-target-depth-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-present-transfer-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-server-cvar-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-scene-token-patches.py" --check "${engine_root}"
  python3 "${script_dir}/apply-audio-contract-patches.py" --check "${engine_root}"
fi
[[ -f "${build_dir}/launcher_main/libhl2_launcher.a" ]] || { echo 'Missing launcher archive; run the full build first' >&2; exit 1; }

python3 - "${reference_file}" "${install_dir}" <<'PY'
import json
import pathlib
import sys
reference = json.loads(pathlib.Path(sys.argv[1]).read_text())
directory = pathlib.Path(sys.argv[2])
actual = sorted(p.name for p in directory.glob('*.so'))
expected = sorted(reference['sideModules'])
if actual != expected:
    raise SystemExit(f'Side-module set differs: missing={sorted(set(expected)-set(actual))}, extra={sorted(set(actual)-set(expected))}')
for name in actual:
    with (directory / name).open('rb') as file:
        if file.read(8) != b'\x00asm\x01\x00\x00\x00':
            raise SystemExit(f'Expected wasm side module: {name}')
PY

mkdir -p "${web_dir}"
stage_dir="$(mktemp -d "${web_dir}/.side-build.XXXXXX")"
trap 'rm -rf "${stage_dir}"' EXIT
side_libraries=()
for library in "${install_dir}"/*.so; do
  name="${library##*/lib}"
  side_libraries+=("-l${name%.so}")
done

emcc \
  -sUSE_BZIP2=1 -sUSE_SDL=2 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1 -sUSE_LIBPNG=1 -sMALLOC=mimalloc \
  -sMAIN_MODULE=1 -sINITIAL_MEMORY=2047mb -sSHARED_MEMORY=1 -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
  -sFULL_ES3=1 -sSTACK_SIZE=4mb \
  -sPROXY_TO_PTHREAD=1 '-sOFFSCREENCANVASES_TO_PTHREAD=#canvas' -sOFFSCREENCANVAS_SUPPORT=1 \
  -sMODULARIZE=1 -sEXPORT_NAME=createSourceEngineModule \
  --pre-js "${script_dir}/side-module-pre.js" \
  '-sEXPORTED_RUNTIME_METHODS=["FS","IDBFS","callMain","ccall","cwrap","PThread","HEAPU8","HEAP32"]' \
  -sFORCE_FILESYSTEM=1 -lidbfs.js \
  -L "${install_dir}" "${build_dir}/launcher_main/libhl2_launcher.a" \
  "${side_libraries[@]}" -o "${stage_dir}/source-engine.js"

node --check "${stage_dir}/source-engine.js"
cp "${install_dir}"/*.so "${stage_dir}/"
cp "${reference_file}" "${stage_dir}/side-module-reference.json"
(
  cd "${stage_dir}"
  sha256sum source-engine.js source-engine.wasm *.so side-module-reference.json > SHA256SUMS
)
install -m 0644 "${stage_dir}"/*.so "${stage_dir}/source-engine.wasm" \
  "${stage_dir}/side-module-reference.json" "${stage_dir}/SHA256SUMS" "${web_dir}/"
install -m 0644 "${stage_dir}/source-engine.js" "${web_dir}/source-engine.js"
printf 'Built 25 side modules and the matching main module in %s\n' "${web_dir}"
