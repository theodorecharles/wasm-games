#!/usr/bin/env bash
set -euo pipefail

image="${1:-wolf3d-wasm:dev}"
variant="${2:-wolf3d}"

case "$variant" in
    wolf3d)
        title="Wolfenstein 3D"
        short_name="Wolf3D"
        native_module="wolf3d.wasm"
        first_key="audiohed.wl6"
        private_file="wolf3d/AUDIOHED.WL6"
        ;;
    spear)
        title="Spear of Destiny"
        short_name="Spear"
        native_module="spear.wasm"
        first_key="audiohed.sod"
        private_file="wolf3d/spear/AUDIOHED.SOD"
        ;;
    *) printf 'Unknown Wolf4SDL variant: %s.\n' "$variant" >&2; exit 2 ;;
esac
active_cid=""

cleanup() {
    if [[ -n "$active_cid" ]]; then
        docker rm -f "$active_cid" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

port="${WOLF3D_TEST_PORT:-$(node -e "const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>{console.log(server.address().port);server.close()})")}"
active_cid="$(docker run -d --rm -p "127.0.0.1:${port}:8088" "$image")"
base="http://127.0.0.1:${port}"

ready=false
for _ in $(seq 1 100); do
    if curl -fsS "$base/" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 0.1
done
if [[ "$ready" != true ]]; then
    docker logs "$active_cid" >&2 || true
    printf 'Wolf3D image did not become ready: %s\n' "$image" >&2
    exit 1
fi

root="$(curl -fsS "$base/")"
grep -Fq '/shared-shell/wasm-game-framework.css' <<<"$root"
grep -Fq '/shared-shell/wasm-game-bootstrap.js' <<<"$root"

test "$(curl -fsS "$base/wasm-game-framework.json" | node -pe 'JSON.parse(fs.readFileSync(0)).version')" = "0.9.4"
test "$(curl -fsS "$base/wasm-game-config.js" | sed -n 's/.*= "\([^"]*\)";.*/\1/p')" = "$variant"
curl -fsS "$base/app.webmanifest?variant=$variant" | node -e '
const manifest = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
if (manifest.name !== process.argv[1] || manifest.short_name !== process.argv[2]) process.exit(1);
if (!Array.isArray(manifest.icons) || manifest.icons.length !== 2) process.exit(1);
' "$title" "$short_name"
curl -fsS "$base/service-worker.js" | grep -Fq 'wasm-game-shell-0.9.4'

headers="$(curl -fsSI "$base/$native_module" | tr -d '\r')"
grep -Fq 'Cross-Origin-Opener-Policy: same-origin' <<<"$headers"
grep -Fq 'Cross-Origin-Embedder-Policy: require-corp' <<<"$headers"
grep -Fq 'X-Content-Type-Options: nosniff' <<<"$headers"
test "$(curl -fsS -H 'Range: bytes=0-3' "$base/$native_module" | od -An -tx1 | tr -d ' \n')" = "0061736d"

test "$(curl -fsS "$base/game-data/status" | node -pe 'const status=JSON.parse(fs.readFileSync(0)); `${status.variant}:${status.ready}:${status.files.length}`')" = "$variant:false:8"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/game-data/files/$first_key")" = "409"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/data")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/data/$private_file")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/local-data/")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/local-data/$private_file")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$base/wasm-game.json")" = "405"

docker rm -f "$active_cid" >/dev/null
active_cid=""
printf '%s image HTTP, PWA, range, framework 0.9.4, and private-data contracts passed: %s\n' "$title" "$image"
