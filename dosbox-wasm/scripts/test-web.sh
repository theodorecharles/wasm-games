#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"

EMSDK_DIR="${EMSDK_DIR:-/home/ted/emsdk}" \
WASM_FRAMEWORK_DIR="$framework_dir" \
"$repo_dir/scripts/build-web.sh"

node --check "$repo_dir/web/dist/dosbox.js"
node --check "$repo_dir/web/dist/game-adapter.js"
node "$repo_dir/scripts/test-adapter.js" "$repo_dir/web/dist"
node "$repo_dir/scripts/test-data-manifest.js" "$repo_dir/web/dist"
node "$repo_dir/scripts/test-native-runtime.js" "$repo_dir/web/dist"
if [[ "${DOSBOX_TEST_INSTALLED_GAMES:-0}" == "1" ]]; then
  for variant in jill1 jill2 jill3 jazz duke1 duke2 gta nfs simcity2000; do
    timeout 45s node "$repo_dir/scripts/test-installed-runtime.js" \
      "$repo_dir/web/dist" "$variant" "${DOSBOX_DATA_ROOT:-$repo_dir/../data/dosbox}" 20000
  done
fi
wasm-validate "$repo_dir/web/dist/dosbox.wasm"
jq -e '.variants | keys == ["duke1", "duke2", "gta", "jazz", "jill1", "jill2", "jill3", "nfs", "simcity2000"]' "$repo_dir/web/dist/wasm-game.json" >/dev/null
jq -e '.variants | {jill1: (.jill1.files | length), jill2: (.jill2.files | length), jill3: (.jill3.files | length), jazz: (.jazz.files | length), duke1: (.duke1.files | length), duke2: (.duke2.files | length), gta: (.gta.files | length), nfs: (.nfs.files | length), simcity2000: (.simcity2000.files | length)} == {jill1: 28, jill2: 27, jill3: 34, jazz: 66, duke1: 55, duke2: 7, gta: 89, nfs: 360, simcity2000: 30}' "$repo_dir/web/dist/wasm-game-data.json" >/dev/null
jq -e '.controller.mode == "disabled" and .persistence.root == "/persistent/dosbox/{variant}"' \
  "$repo_dir/web/dist/wasm-game.json" >/dev/null

for forbidden in index.html service-worker.js manifest.webmanifest wasm-game-framework.js wasm-game-framework.css; do
  test ! -e "$repo_dir/web/$forbidden"
done
cmp "$framework_dir/dist/wasm-game-framework.js" "$repo_dir/web/dist/shared-shell/wasm-game-framework.js"
cmp "$framework_dir/dist/wasm-game-bootstrap.js" "$repo_dir/web/dist/shared-shell/wasm-game-bootstrap.js"

proprietary_pattern='\.(jn[123]|sha|vcl|ddt|dma|dem|mac|epc|0sc|0fn|mus|int|dn1|cmp|f[1-5]|rat|fon|fxt|gry|raw|sdt|qfs|inv|fsh|tgv|asf|cfm|pdn|pbs|fmm|rpl|sc2|scn|bnk)$|(^|/)(JILL[123]?|JAZZ|DN1|NUKEM2|TNFS|SC2000)\.EXE$|(^|/)GTA\.BAT$'
if git -C "$repo_dir" ls-files | grep -Ei "$proprietary_pattern"; then
  printf 'A proprietary DOS game file is tracked.\n' >&2
  exit 1
fi
if find "$repo_dir/web/dist" -type f | grep -Ei "$proprietary_pattern"; then
  printf 'A proprietary DOS game file entered the web build.\n' >&2
  exit 1
fi
rg -q 'case SDLK_w: event.key.keysym.sym = SDLK_UP' "$repo_dir/vendor/dosbox/src/gui/sdlmain.cpp"
rg -Fq 'emscripten_sleep(1)' "$repo_dir/vendor/dosbox/src/dosbox.cpp"
rg -q 'QueueWasmControllerEvent' "$repo_dir/vendor/dosbox/src/gui/sdlmain.cpp"
rg -q 'DOSBox_WasmAudioCallbacks' "$repo_dir/vendor/dosbox/src/hardware/mixer.cpp"
rg -q 'sASYNCIFY=1' "$repo_dir/scripts/build-web.sh"
rg -q 'IDBFS' "$repo_dir/web/dist/dosbox.js"
rg -q 'createDosBoxModule' "$repo_dir/web/dist/dosbox.js"

WASM_FRAMEWORK_DIR="$framework_dir" "$repo_dir/scripts/test-static.sh"
git -C "$repo_dir" diff --check
printf 'DOSBox native build, framework 0.9.4, IDBFS, keyboard/mouse, audio/canvas, HTTP, and game-data checks passed.\n'
