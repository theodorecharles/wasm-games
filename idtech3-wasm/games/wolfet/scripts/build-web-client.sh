#!/bin/sh
# Compile the patched ET: Legacy client to WebAssembly (etjs.js / etjs.wasm).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ETJS_BUILD_JOBS="${ETJS_BUILD_JOBS:-2}"
case "$ETJS_BUILD_JOBS" in
  ''|*[!0-9]*|0) echo "ETJS_BUILD_JOBS must be a positive integer" >&2; exit 1 ;;
esac
export EMCC_CORES="${EMCC_CORES:-$ETJS_BUILD_JOBS}"
export BINARYEN_CORES="${BINARYEN_CORES:-$ETJS_BUILD_JOBS}"
if [ ! -d "$ROOT/etlegacy/.git" ]; then
  echo "ET: Legacy source is not prepared; run: npm run setup:engine" >&2
  exit 1
fi
if ! command -v emcmake >/dev/null 2>&1 || ! command -v emmake >/dev/null 2>&1; then
  echo "Emscripten is not active. Source emsdk_env.sh, then retry." >&2
  exit 1
fi
mkdir -p "$ROOT/web/client" "$ROOT/etlegacy/build-web"
cd "$ROOT/etlegacy/build-web"
if [ -f "$ROOT/etlegacy/src/cgame/eth32nix.c" ] &&
   [ -f build.ninja ] &&
   ! grep -q eth32nix.c build.ninja; then
  rm -f CMakeCache.txt
fi
if [ ! -f CMakeCache.txt ] || [ ! -f build.ninja ]; then
  emcmake cmake "$ROOT/etlegacy" \
    -GNinja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER_LAUNCHER= \
    -DCMAKE_CXX_COMPILER_LAUNCHER=
fi
emmake cmake --build . --target etl -j"$ETJS_BUILD_JOBS"
node "$ROOT/scripts/patch-etjs-gl.js" "$ROOT/web/client/etjs.js"
node "$ROOT/scripts/verify-web-client.js" "$ROOT/web/client"
echo "wrote $ROOT/web/client/etjs.js"
