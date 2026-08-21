#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${IDTECH1_BUILD_DIR:-${repo_dir}/build-web}"
dsda_build_dir="${DSDA_BUILD_DIR:-${repo_dir}/build-dsda-web}"
dist_dir="${repo_dir}/web/dist"

if ! command -v emcc >/dev/null 2>&1; then
    emsdk_dir="${EMSDK_DIR:-${EMSDK:-}}"
    if [[ -z "${emsdk_dir}" || ! -f "${emsdk_dir}/emsdk_env.sh" ]]; then
        echo "Activate Emscripten first, or set EMSDK_DIR to an emsdk checkout." >&2
        exit 1
    fi
    # shellcheck disable=SC1091
    source "${emsdk_dir}/emsdk_env.sh" >/dev/null
fi

crispy_source="$(${repo_dir}/scripts/fetch-crispy-source.sh)"

echo "Configuring the independent downstream wasm/CMakeLists.txt"
emcmake cmake -S "${repo_dir}/wasm" -B "${build_dir}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DIDTECH1_SOURCE_DIR="${crispy_source}"
cmake --build "${build_dir}" --parallel "${IDTECH1_BUILD_JOBS:-$(nproc)}"

echo "Configuring DSDA-Doom from its pinned native source baseline"
dsda_source="$(${repo_dir}/scripts/fetch-dsda-source.sh)"
libtess2_source="$(${repo_dir}/scripts/fetch-libtess2-source.sh)"
emcmake cmake -S "${dsda_source}/prboom2" -B "${dsda_build_dir}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/ \
    -DDSDAPWADDIR=. \
    -DENABLE_PACKAGING=OFF \
    -DWITH_IMAGE=OFF \
    -DWITH_MAD=OFF \
    -DWITH_FLUIDSYNTH=OFF \
    -DWITH_XMP=OFF \
    -DWITH_VORBISFILE=OFF \
    -DWITH_PORTMIDI=OFF \
    -DDSDA_WASM_TESS2_SOURCE="${libtess2_source}"
cmake --build "${dsda_build_dir}" --parallel "${IDTECH1_BUILD_JOBS:-$(nproc)}"

cmake -E remove_directory "${dist_dir}"
mkdir -p "${dist_dir}"
install -d "${repo_dir}/web/assets"
for game in doom heretic hexen; do
    install -m 0644 "${crispy_source}/data/${game}.png" "${repo_dir}/web/assets/${game}.png"
    test -s "${repo_dir}/web/assets/${game}-192.png"
    test -s "${repo_dir}/web/assets/${game}-512.png"
done
for game in doom heretic hexen; do
    install -m 0644 "${build_dir}/dist/crispy-${game}.js" "${dist_dir}/"
    install -m 0644 "${build_dir}/dist/crispy-${game}.wasm" "${dist_dir}/"
    node --check "${dist_dir}/crispy-${game}.js"
    test "$(od -An -tx1 -N4 "${dist_dir}/crispy-${game}.wasm" | tr -d ' \n')" = "0061736d"
done
install -m 0644 "${dsda_build_dir}/dsda-doom.js" "${dist_dir}/"
install -m 0644 "${dsda_build_dir}/dsda-doom.wasm" "${dist_dir}/"
install -m 0644 "${dsda_build_dir}/dsda-doom.wad" "${dist_dir}/"
"${repo_dir}/scripts/fetch-chex-support.sh"
node --check "${dist_dir}/dsda-doom.js"
test "$(od -An -tx1 -N4 "${dist_dir}/dsda-doom.wasm" | tr -d ' \n')" = "0061736d"
test "$(od -An -tc -N4 "${dist_dir}/dsda-doom.wad" | tr -d ' \n')" = "PWAD"
test -s "${dist_dir}/chex.deh"
test "$(sha256sum "${dist_dir}/chex.deh" | awk '{print $1}')" = "8c0345089fb227fa7f71c25a6c6e31ff5bd4bea0580f286cd74e05918d72dd40"
grep -Fq 'You may do anything you like with this file.' "${dist_dir}/chexdeh.txt"
"${repo_dir}/scripts/build-zandronum.sh"
node --check "${dist_dir}/zandronum.js"
test "$(od -An -tx1 -N4 "${dist_dir}/zandronum.wasm" | tr -d ' \n')" = "0061736d"
for asset in zandronum.pk3 brightmaps.pk3 skulltag_actors.pk3; do
    test -s "${dist_dir}/${asset}"
done
node --check "${repo_dir}/web/game-adapter.js"
node --check "${repo_dir}/web/data-validator.mjs"
node "${repo_dir}/scripts/verify-site-contract.js"

if find "${dist_dir}" -type f \( -iname '*.wad' ! -name 'dsda-doom.wad' -o -name '*.data' \) -print -quit | grep -q .; then
    echo "Refusing staged browser output containing game data." >&2
    exit 1
fi

echo "Verified game-data-free web artifacts in ${repo_dir}/web"
