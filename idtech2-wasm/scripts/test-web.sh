#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$repo_dir/web/dist"
q1_build_dir="${IDTECH2_Q1_BUILD_DIR:-$repo_dir/build-web}"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"

"$repo_dir/scripts/build-web.sh"

for required in quake1.js quake1.wasm quake2.js quake2.wasm quake.ico quake2.ico \
    quake-192.png quake-512.png quake2-192.png quake2-512.png \
    game-adapter.js adapters/quake.js adapters/quake2.js wasm-game.json wasm-game-data.json \
    shared-shell/wasm-game-framework.js shared-shell/wasm-game-framework.css \
    shared-shell/wasm-game-bootstrap.js shared-shell/wasm-game-framework.json; do
    [[ -f "$dist_dir/$required" ]] || { printf 'Missing family web artifact: %s\n' "$required" >&2; exit 1; }
done

for forbidden in index.html quake1.html owner-data.js service-worker.js app.webmanifest \
    wolfwasm-shell.js wolfwasm-shell.css wolfwasm-bootstrap.js quake1.data; do
    [[ ! -e "$dist_dir/$forbidden" ]] || { printf 'Downstream owns forbidden shell artifact: %s\n' "$forbidden" >&2; exit 1; }
done
if find "$dist_dir" -type f \( -iname '*.pak' -o -iname '*.data' -o -iname '*.pk3' \) -print -quit | grep -q .; then
    printf 'Game data was found in the generated site.\n' >&2
    exit 1
fi
if grep -R -E 'quake1\.data|/local-data/|/home/ted/|WolfWasmShell|wolfwasm-' \
    "$dist_dir/quake1.js" "$dist_dir/quake2.js" "$dist_dir/game-adapter.js" "$dist_dir/adapters"; then
    printf 'Generated code contains an obsolete loader, workstation path, or legacy framework API.\n' >&2
    exit 1
fi
if grep -E -- '--preload-file|-DQUAKE_DATA_DIR|set\(QUAKE_DATA_DIR|/home/ted/' \
    "$repo_dir/CMakeLists.txt" "$repo_dir/scripts/build-web.sh"; then
    printf 'Build configuration contains a game-data preload or workstation path.\n' >&2
    exit 1
fi
grep -Fq '"SHELL:-lidbfs.js"' "$repo_dir/CMakeLists.txt"
grep -Fq '"-lidbfs.js"' "$repo_dir/engines/quake2/CMakeLists.txt"
if [[ -f "$q1_build_dir/CMakeCache.txt" ]] && grep -E 'QUAKE_DATA_DIR|/home/ted/\.steam/' "$q1_build_dir/CMakeCache.txt"; then
    printf 'Generated CMake cache retains a game-data path.\n' >&2
    exit 1
fi

for source in "$dist_dir/game-adapter.js" "$dist_dir/adapters/quake.js" "$dist_dir/adapters/quake2.js" \
    "$repo_dir/engines/quake2/web/pre.js"; do
    node --check "$source"
done
node --check "$dist_dir/quake1.js"
node --check "$dist_dir/quake2.js"
node --check "$dist_dir/shared-shell/wasm-game-framework.js"
node --check "$dist_dir/shared-shell/wasm-game-bootstrap.js"
node "$repo_dir/scripts/test-family-adapter.js"
node "$repo_dir/scripts/test-engine-adapters.js"
node "$framework_dir/scripts/check-game-package.js" "$dist_dir"
if command -v wasm-validate >/dev/null 2>&1; then
    wasm-validate "$dist_dir/quake1.wasm"
    wasm-validate "$dist_dir/quake2.wasm"
else
    for wasm in "$dist_dir/quake1.wasm" "$dist_dir/quake2.wasm"; do
        [[ "$(od -An -tx1 -N4 "$wasm" | tr -d ' \n')" == "0061736d" ]]
    done
fi

cmp "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cmp "$repo_dir/web/quake-adapter.js" "$dist_dir/adapters/quake.js"
cmp "$repo_dir/engines/quake2/web/game-adapter.js" "$dist_dir/adapters/quake2.js"
cmp "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cmp "$repo_dir/web/wasm-game-data.json" "$dist_dir/wasm-game-data.json"
cmp "$framework_dir/dist/wasm-game-framework.js" "$dist_dir/shared-shell/wasm-game-framework.js"
cmp "$framework_dir/dist/wasm-game-framework.css" "$dist_dir/shared-shell/wasm-game-framework.css"
cmp "$framework_dir/dist/wasm-game-bootstrap.js" "$dist_dir/shared-shell/wasm-game-bootstrap.js"

for marker in Q1_BrowserSetInputCaptured Q1_BrowserControlsValid Q1_BrowserRuntimeState Q1_BrowserCaptureIntent \
    Q1_BrowserDispatchMenuKey SNDDMA_BrowserResumeAudio SNDDMA_BrowserAudioState \
    Q1_BrowserResize Q1_BrowserRenderWidth Q1_BrowserRenderHeight Q1_BrowserModernized Q1_BrowserPixelAspectX1000 \
    Q1_BrowserSensitivityX100 Q1_BrowserDemoPlayback Q1_BrowserMenuActive \
    Q1_BrowserControllerKey Q1_BrowserControllerLook \
    Q1_BrowserControllerReleaseAll Q1_BrowserWriteConfiguration; do
    grep -Fq "$marker" "$repo_dir/WinQuake/"*.c || { printf 'Missing Quake native seam: %s\n' "$marker" >&2; exit 1; }
done
grep -Fq 'host_framecount > frame_before' "$repo_dir/WinQuake/sys_emscripten.c"
grep -Fq '#ifndef WEBQUAKE' "$repo_dir/WinQuake/menu.c"
if grep -Fq 'SDL_SetRelativeMouseMode(SDL_TRUE)' "$repo_dir/WinQuake/vid_emscripten.c"; then
    printf 'Quake must not capture relative input during engine initialization.\n' >&2
    exit 1
fi

grep -Fq 'grab = grab && q2web_input_captured' "$repo_dir/engines/quake2/src/client/vid/glimp_sdl2.c"
for marker in Q2Web_ConfigureControls Q2Web_RuntimeState Q2Web_ResizeViewport Q2Web_ApplyQuality \
    Q2Web_ControllerKey Q2Web_ControllerReleaseAll Q2Web_WriteConfiguration; do
    grep -Fq "$marker" "$repo_dir/engines/quake2/src/backends/web/main.c" || { printf 'Missing Quake II native seam: %s\n' "$marker" >&2; exit 1; }
done
grep -Fq 'Q2Web_AudioNonzeroCallbacks' "$repo_dir/engines/quake2/src/client/sound/sdl.c"
for marker in 'WasmGameFramework.mountOwnerFiles' "root: '/data/baseq2'" "mode: 'memfs'"; do
    grep -Fq "$marker" "$repo_dir/engines/quake2/web/pre.js" || { printf 'Missing Quake II mount seam: %s\n' "$marker" >&2; exit 1; }
done
if strings "$dist_dir/quake2.wasm" | grep -F 'Yamagi Quake II' >/dev/null; then
    printf 'Quake II browser binary retains source-port title branding.\n' >&2
    exit 1
fi
for marker in 'Quake II WebAssembly' 'Quake II OpenGL ES3 Renderer' 'Quake II Initialized'; do
    strings "$dist_dir/quake2.wasm" | grep -F "$marker" >/dev/null || { printf 'Missing Quake II native marker: %s\n' "$marker" >&2; exit 1; }
done

node "$repo_dir/scripts/verify-site-contract.js"
file "$dist_dir/quake1.wasm" "$dist_dir/quake2.wasm"
git -C "$repo_dir" diff --check
printf 'Quake and Quake II builds passed framework, native seam, input/audio/state, and data-boundary checks.\n'
