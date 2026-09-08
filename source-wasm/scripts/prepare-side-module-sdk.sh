#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_ENGINE_ROOT:?Set SOURCE_ENGINE_ROOT to the private pinned reference source}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
reference_file="${script_dir}/../side-module-reference.json"
emscripten_root="${SOURCE_WASM_EMSCRIPTEN_ROOT:-}"
if [[ -z "${emscripten_root}" ]]; then
  emscripten_root="$(dirname "$(readlink -f "$(command -v emcc)")")"
fi
python3 - "${reference_file}" <<'PY'
import json
import pathlib
import subprocess
import sys
reference = json.loads(pathlib.Path(sys.argv[1]).read_text())
version = subprocess.check_output(['emcc', '--version'], text=True).splitlines()[0]
if f" {reference['emsdkVersion']} " not in version:
    raise SystemExit(f"Expected SDK {reference['emsdkVersion']}; got {version}")
PY

embuilder --pic build sdl2 sdl2-mt
python3 - "${emscripten_root}" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) / 'cache/ports/sdl2/SDL-release-2.32.0/src'
patches = [
    (root / 'audio/emscripten/SDL_emscriptenaudio.c',
     'freq = EM_ASM_INT', 'freq = MAIN_THREAD_EM_ASM_INT'),
    (root / 'video/SDL_video.c',
     '    EM_ASM({\n        alert(UTF8ToString($0) + "\\n\\n" + UTF8ToString($1));',
     '    MAIN_THREAD_EM_ASM({\n        err(UTF8ToString($0) + "\\n\\n" + UTF8ToString($1));'),
]
updates = []
for file, original, replacement in patches:
    text = file.read_text()
    if replacement in text and original not in text:
        continue
    if text.count(original) != 1:
        raise SystemExit(f'Expected one clean SDL patch anchor: {file}')
    updates.append((file, text.replace(original, replacement, 1)))
for file, text in updates:
    file.write_text(text)
    print(f'Patched {file}')
PY
embuilder --force --pic build sdl2 sdl2-mt

expected_webgl_sha="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sdkPatchedFiles"]["src/lib/libwebgl.js"])' "${reference_file}")"
actual_webgl_sha="$(sha256sum "${emscripten_root}/src/lib/libwebgl.js")"
if [[ "${actual_webgl_sha%% *}" != "${expected_webgl_sha}" ]]; then
  patch --batch --dry-run "${emscripten_root}/src/lib/libwebgl.js" "${SOURCE_ENGINE_ROOT}/emscripten/libwebgl.patch"
  patch --batch "${emscripten_root}/src/lib/libwebgl.js" "${SOURCE_ENGINE_ROOT}/emscripten/libwebgl.patch"
fi
printf 'Prepared Emscripten SDL and WebGL patches. The build script verifies hashes.\n'
