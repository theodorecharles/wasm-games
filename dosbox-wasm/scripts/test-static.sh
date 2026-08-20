#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
site_dir="$repo_dir/web/dist"
port="${TEST_PORT:-18116}"
data_dir="$(mktemp -d /tmp/dosbox-wasm-data.XXXXXX)"
log_file="$(mktemp /tmp/dosbox-wasm-server.XXXXXX.log)"

node "$repo_dir/scripts/test-adapter.js" "$site_dir"
node "$framework_dir/scripts/check-game-package.js" "$site_dir"

cleanup() {
  [[ -n "${server_pid:-}" ]] && kill "$server_pid" 2>/dev/null || true
  find "$data_dir" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$data_dir" 2>/dev/null || true
  rm -f "$log_file"
}
trap cleanup EXIT

WASM_GAME_SITE_ROOT="$site_dir" \
WASM_GAME_SHELL_ROOT="$framework_dir/dist" \
WASM_GAME_DATA_ROOT="$data_dir" \
WASM_GAME_HTTP_PORT="$port" \
node "$framework_dir/server/static-server.js" >"$log_file" 2>&1 &
server_pid=$!

for _ in $(seq 1 100); do
  curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 && break
  sleep 0.05
done

curl -fsS "http://127.0.0.1:$port/" | grep -Fq '/shared-shell/wasm-game-framework.js'
curl -fsS "http://127.0.0.1:$port/service-worker.js" | grep -Fq 'wasm-game-shell-0.9.4'
curl -fsS "http://127.0.0.1:$port/wasm-game.json" | jq -e '
  (.variants | keys) == ["duke1", "duke2", "gta", "jazz", "jill1", "jill2", "jill3", "nfs", "simcity2000"] and
  .controller.mode == "disabled" and
  .persistence.root == "/persistent/dosbox/{variant}"
' >/dev/null
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=jill2" | jq -e '.id == "/apps/dosbox/jill2"' >/dev/null
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=nfs" | jq -e '.id == "/apps/dosbox/nfs"' >/dev/null
curl -fsS "http://127.0.0.1:$port/app.webmanifest?variant=simcity2000" | jq -e '.id == "/apps/dosbox/simcity2000"' >/dev/null
curl -fsSI "http://127.0.0.1:$port/dosbox.wasm" | grep -qi 'content-type: application/wasm'
for variant in jill1 jill2 jill3 jazz duke1 duke2 gta nfs simcity2000; do
  curl -fsS "http://127.0.0.1:$port/game-data/status?variant=$variant" | \
    jq -e --arg variant "$variant" '.variant == $variant and .ready == false and (.files | length > 0)' >/dev/null
done
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/data/")" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/local-data/")" = 404

printf 'Verified framework 0.9.4 shell, nine variants, disabled-controller/persistence policy, PWA metadata, provisioning gates, and private /data boundary.\n'
