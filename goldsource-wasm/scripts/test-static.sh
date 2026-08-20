#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$(cd "${repo_dir}/../wasm-game-framework" && pwd)}"
data_dir="$(mktemp -d -t goldsource-static-data.XXXXXX)"
log_file="$(mktemp -t goldsource-static-server.XXXXXX.log)"
port="${GOLDSOURCE_TEST_PORT:-4183}"
server_pid=""
cleanup() {
  if [[ -n "${server_pid}" ]]; then kill "${server_pid}" 2>/dev/null || true; fi
  rm -rf -- "${data_dir}"
  rm -f -- "${log_file}"
}
trap cleanup EXIT

npm --prefix "${repo_dir}" run build
npm --prefix "${repo_dir}" test
WASM_GAME_SITE_ROOT="${repo_dir}/web" \
WASM_GAME_SHELL_ROOT="${framework_dir}/dist" \
WASM_GAME_DATA_ROOT="${data_dir}" \
WASM_GAME_HTTP_PORT="${port}" \
node "${framework_dir}/server/static-server.js" >"${log_file}" 2>&1 &
server_pid="$!"

for _ in {1..50}; do
  if curl -fsS "http://127.0.0.1:${port}/wasm-game.json" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:${port}/" | grep -Fq '/shared-shell/wasm-game-bootstrap.js'
curl -fsS "http://127.0.0.1:${port}/" | grep -Fq '/shared-shell/wasm-game-framework.js'
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/shared-shell/wolfwasm-shell.js")" = "404"
curl -fsS "http://127.0.0.1:${port}/" | grep -Fq 'data-shell-launch-fullscreen'
curl -fsS "http://127.0.0.1:${port}/app.webmanifest?variant=half-life" | grep -Fq '/game-data/files/icon-512?variant=half-life'
curl -fsS "http://127.0.0.1:${port}/service-worker.js" | grep -Fq 'wasm-game-shell-0.9.6'
curl -fsS "http://127.0.0.1:${port}/game-data/status?variant=half-life" | grep -Fq '"ready":false'
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/data/valve-owner.pk3")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/game-data/files/valve?variant=half-life")" = "409"
echo "Verified canonical framework document, variant gate, and non-public /data boundary."
