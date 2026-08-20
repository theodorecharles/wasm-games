#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
data_dir="$(mktemp -d -t build-wasm-static-data.XXXXXX)"
log_file="$(mktemp -t build-wasm-static-server.XXXXXX.log)"
port="${BUILD_WASM_TEST_PORT:-4184}"
server_pid=""
cleanup() {
    if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
    cmake -E remove_directory "$data_dir"
    cmake -E rm -f "$log_file"
}
trap cleanup EXIT

node "$repo_dir/scripts/verify-site-contract.js"
node "$repo_dir/scripts/test-variant-adapters.js"
node "$framework_dir/scripts/check-game-package.js" "$repo_dir/build-web/dist"
WASM_GAME_SITE_ROOT="$repo_dir/build-web/dist" \
WASM_GAME_SHELL_ROOT="$framework_dir/dist" \
WASM_GAME_DATA_ROOT="$data_dir" \
WASM_GAME_HTTP_PORT="$port" \
node "$framework_dir/server/static-server.js" >"$log_file" 2>&1 &
server_pid="$!"

for _ in {1..100}; do
    if curl -fsS "http://127.0.0.1:$port/wasm-game.json" >/dev/null 2>&1; then break; fi
    sleep 0.1
done
base="http://127.0.0.1:$port"
curl -fsS "$base/" | rg -Fq '/shared-shell/wasm-game-framework.js'
curl -fsS "$base/" | rg -Fq '/shared-shell/wasm-game-bootstrap.js'
curl -fsS "$base/" | rg -Fq 'data-shell-launch-fullscreen'
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/shared-shell/wolfwasm-shell.js")" = "404"
curl -fsS "$base/app.webmanifest?variant=blood" | rg -Fq '/blood-512.png'
curl -fsS "$base/app.webmanifest?variant=duke3d" | rg -Fq '/duke3d-512.png'
curl -sSI "$base/favicon.ico?variant=blood" | rg -Fiq 'location: /blood.ico'
curl -sSI "$base/favicon.ico?variant=duke3d" | rg -Fiq 'location: /duke3d.ico'
curl -fsS "$base/service-worker.js" | rg -Fq 'wasm-game-shell-0.9.4'
curl -fsS "$base/game-data/status?variant=blood" | rg -Fq '"ready":false'
curl -fsS "$base/game-data/status?variant=duke3d" | rg -Fq '"ready":false'
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/game-data/files/blood.rff?variant=blood")" = "409"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/game-data/files/duke3d.grp?variant=duke3d")" = "409"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/data/DUKE3D.GRP")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/local-data/DUKE3D.GRP")" = "404"

printf 'Verified canonical document/PWA/fullscreen, both variant gates, and private owner-data boundary.\n'
