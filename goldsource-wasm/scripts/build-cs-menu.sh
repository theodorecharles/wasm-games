#!/usr/bin/env bash
# Builds the Counter-Strike menu library (Velaron/mainui_cpp fork) with the
# no-quit patch applied, producing native/cs-menu-framework.wasm.
#
# The cs16-client cmake build compiles the menu as a static archive (the
# emsdk CMake platform disables shared libraries), so the archive is linked
# into a wasm side module by hand with the same flags the engine's waf build
# uses for libmenu (-fPIC -sSIDE_MODULE=1 -Oz).
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Original sources are our forks (see sources.json) so the project controls the
# exact upstream. Override these to point elsewhere if needed.
cs16_repo="${CS16_CLIENT_REPO:-https://github.com/theodorecharles/cs16-client}"
mainui_repo="${MAINUI_CPP_REPO:-https://github.com/theodorecharles/mainui_cpp}"
cs16_commit="${CS16_CLIENT_COMMIT:-d6ff2a863cf38d17f3610114d32bc3bd77ff3afa}"
menu_patch="${CS_MENU_PATCH:-${repo_dir}/games/counter-strike/patches/cs16/main-menu.patch}"
output="${CS_MENU_OUTPUT:-${repo_dir}/native/cs-menu-framework.wasm}"

build_context="$(mktemp -d -t goldsource-cs-menu-build.XXXXXX)"
cleanup() { rm -rf -- "${build_context}"; }
trap cleanup EXIT

git clone --depth 1 "${cs16_repo}" "${build_context}/src" >/dev/null 2>&1
git -C "${build_context}/src" fetch --depth 1 origin "${cs16_commit}" >/dev/null 2>&1 || true
git -C "${build_context}/src" checkout --quiet "${cs16_commit}" 2>/dev/null || \
  echo "WARNING: pinned commit ${cs16_commit} unavailable; using default HEAD" >&2
git -C "${build_context}/src" config submodule.3rdparty/mainui_cpp.url "${mainui_repo}"
git -C "${build_context}/src" submodule update --init --recursive 3rdparty/mainui_cpp >/dev/null 2>&1
git -C "${build_context}/src/3rdparty/mainui_cpp" apply --check "${menu_patch}"
git -C "${build_context}/src/3rdparty/mainui_cpp" apply "${menu_patch}"

cat > "${build_context}/Dockerfile" << 'EOF'
FROM emscripten/emsdk:4.0.17
WORKDIR /cs
COPY src .
RUN emcmake cmake -S . -B build -DMAINUI_USE_STB=ON \
      -DBUILD_CLIENT=OFF -DBUILD_SERVER=OFF \
      -DCMAKE_CXX_FLAGS=-fPIC -DCMAKE_C_FLAGS=-fPIC && \
    cmake --build build --config Release --target menu && \
    em++ -sSIDE_MODULE=1 -Oz -o menu_emscripten_wasm32.wasm \
      build/3rdparty/mainui_cpp/menu_emscripten_wasm32.a
EOF

docker build --pull --progress=plain -f "${build_context}/Dockerfile" -t goldsource-cs-menu:build "${build_context}"
container_id="$(docker create goldsource-cs-menu:build)"
docker cp "${container_id}:/cs/menu_emscripten_wasm32.wasm" "${output}"
docker rm -f "${container_id}" >/dev/null
echo "Built ${output} from cs16-client ${cs16_commit} (mainui_cpp with patches/cs16/main-menu.patch)."
