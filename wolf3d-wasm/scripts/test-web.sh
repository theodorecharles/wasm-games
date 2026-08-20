#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$repo_dir/build-web/dist"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"

"$repo_dir/build-web.sh"

for required in wolf3d.js wolf3d.wasm spear.js spear.wasm wolf3d.ico wolf3d-192.png wolf3d-512.png \
    game-adapter.js wasm-game.json wasm-game-data.json \
    wasm-game-framework.json \
    shared-shell/index.html shared-shell/wasm-game-framework.js shared-shell/wasm-game-framework.css \
    shared-shell/wasm-game-bootstrap.js shared-shell/wasm-game-framework.json; do
    if [[ ! -f "$dist_dir/$required" ]]; then
        printf 'Missing generated web artifact: %s\n' "$required" >&2
        exit 1
    fi
done

if [[ -e "$dist_dir/index.html" || -e "$repo_dir/web/shell.html" ]]; then
    printf 'Wolf3D must use the canonical framework document, not downstream HTML.\n' >&2
    exit 1
fi
if find "$dist_dir" -maxdepth 1 -type f \( -iname '*.wl6' -o -iname '*.sod' -o -iname '*.data' \) -print -quit | grep -q .; then
    printf 'Game-data artifact found in %s\n' "$dist_dir" >&2
    exit 1
fi

for marker in WolfWasm_BrowserRuntimeState WolfWasm_BrowserSetInputCaptured WolfWasm_BrowserOpenMenu; do
    if ! grep -Fq "$marker" "$repo_dir"/*.cpp; then
        printf 'Wolf3D native browser seam is missing: %s\n' "$marker" >&2
        exit 1
    fi
done
for marker in 'globalThis.WasmGameAdapter' 'ctx.dataClient.load' 'ctx.framework.createOwnerDataSet' \
    'ctx.framework.mountOwnerFiles' 'inputCaptureChanged(captured)'; do
    if ! grep -Fq "$marker" "$dist_dir/game-adapter.js"; then
        printf 'Wolf3D adapter is missing framework contract: %s\n' "$marker" >&2
        exit 1
    fi
done

node -e '
const fs=require("fs");
const c=JSON.parse(fs.readFileSync(process.argv[1]));
const m=JSON.parse(fs.readFileSync(process.argv[2]));
const p=JSON.parse(fs.readFileSync(process.argv[3]));
if(c.id!=="wolf4sdl-family"||c.defaultVariant!=="wolf3d"||c.displayMode!=="4:3"||c.graphics!==false||c.identity!==false||c.fullscreen!==true)process.exit(1);
if(Object.keys(c.variants).join(",")!=="wolf3d,spear"||Object.keys(m.variants).join(",")!=="wolf3d,spear")process.exit(1);
for(const key of ["wolf3d","spear"]){
  if(!c.variants[key].pwa||c.variants[key].pwa.icons.length!==2||m.variants[key].files.length!==8||m.variants[key].files.some(f=>!f.sha256))process.exit(1);
}
if(p.package!=="@wasm-game-framework/browser"||p.version!=="0.9.4"||!p.bootstrapSha256)process.exit(1);
' "$dist_dir/wasm-game.json" "$dist_dir/wasm-game-data.json" "$dist_dir/wasm-game-framework.json"

node --check "$dist_dir/wolf3d.js"
node --check "$dist_dir/spear.js"
node --check "$dist_dir/game-adapter.js"
node --check "$dist_dir/shared-shell/wasm-game-framework.js"
node --check "$dist_dir/shared-shell/wasm-game-bootstrap.js"
node "$repo_dir/scripts/test-adapter-contract.js"
node "$framework_dir/scripts/check-game-package.js" "$dist_dir"
cmp "$repo_dir/web/game-adapter.js" "$dist_dir/game-adapter.js"
cmp "$repo_dir/web/wasm-game.json" "$dist_dir/wasm-game.json"
cmp "$framework_dir/dist/wasm-game-framework.js" "$dist_dir/shared-shell/wasm-game-framework.js"
cmp "$dist_dir/shared-shell/wasm-game-framework.json" "$dist_dir/wasm-game-framework.json"
file "$dist_dir/wolf3d.wasm"
file "$dist_dir/spear.wasm"
if cmp -s "$dist_dir/wolf3d.wasm" "$dist_dir/spear.wasm"; then
    printf 'Wolfenstein 3D and Spear of Destiny unexpectedly produced the same native module.\n' >&2
    exit 1
fi
printf 'Static Wolf4SDL web build passed both native variants, framework 0.9.4, audio, and game-data boundary checks.\n'
