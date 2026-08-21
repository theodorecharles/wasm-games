#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_dir="$(cd "$repo_dir/../.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$workspace_dir/wasm-game-framework}"
data_dir="$(mktemp -d -t idtech2-static-data.XXXXXX)"
log_file="$(mktemp -t idtech2-static-server.XXXXXX.log)"
port="${IDTECH2_TEST_PORT:-4182}"
server_pid=""
cleanup() {
    if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
    cmake -E remove_directory "$data_dir"
    cmake -E rm -f "$log_file"
}
trap cleanup EXIT

node "$repo_dir/scripts/verify-site-contract.js"
WASM_GAME_SITE_ROOT="$repo_dir/web/dist" \
WASM_GAME_SHELL_ROOT="$framework_dir/dist" \
WASM_GAME_DATA_ROOT="$data_dir" \
WASM_GAME_HTTP_PORT="$port" \
node "$framework_dir/server/static-server.js" >"$log_file" 2>&1 &
server_pid="$!"

for _ in {1..100}; do
    if curl -fsS "http://127.0.0.1:$port/wasm-game.json" >/dev/null 2>&1; then break; fi
    sleep 0.1
done
curl -fsS "http://127.0.0.1:$port/" | grep -Fq '/shared-shell/wasm-game-framework.js'
curl -fsS "http://127.0.0.1:$port/" | grep -Fq '/shared-shell/wasm-game-bootstrap.js'
curl -fsS "http://127.0.0.1:$port/" | grep -Fq 'data-shell-launch-fullscreen'
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/shared-shell/wolfwasm-shell.js")" = "404"
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=quake" | grep -Fq '/quake-512.png'
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=quake2" | grep -Fq '/quake2-512.png'
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=quake2-xatrix" | grep -Fq '/quake2-512.png'
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=quake2-rogue" | grep -Fq '/quake2-512.png'
curl -fsS "http://127.0.0.1:$port/service-worker.js" | grep -Fq 'wasm-game-shell-0.9.6'
curl -fsS "http://127.0.0.1:$port/game-data/status?variant=quake" | grep -Fq '"ready":false'
curl -fsS "http://127.0.0.1:$port/game-data/status?variant=quake2" | grep -Fq '"ready":false'
curl -fsS "http://127.0.0.1:$port/game-data/status?variant=quake2-xatrix" | grep -Fq '"ready":false'
curl -fsS "http://127.0.0.1:$port/game-data/status?variant=quake2-rogue" | grep -Fq '"ready":false'
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/game-data/files/pak0.pak?variant=quake")" = "409"
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/data/id1/pak0.pak")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/local-data/pak0.pak")" = "404"

printf 'Verified canonical document/PWA/fullscreen, all four variant gates, and private game-data boundary.\n'
