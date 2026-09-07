#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}"
data_dir="$(mktemp -d -t idtech1-static-data.XXXXXX)"
log_file="$(mktemp -t idtech1-static-server.XXXXXX.log)"
port="${IDTECH1_TEST_PORT:-4177}"
server_pid=""
cleanup() {
    if [[ -n "${server_pid}" ]]; then kill "${server_pid}" 2>/dev/null || true; fi
    rm -rf -- "${data_dir}"
    rm -f -- "${log_file}"
}
trap cleanup EXIT

node "${repo_dir}/scripts/verify-site-contract.js"
node "${repo_dir}/scripts/test-adapter-contract.js"
node "${repo_dir}/scripts/test-classic-udp.mjs"
node --check "${repo_dir}/scripts/test-classic-bots.mjs"
node --check "${repo_dir}/scripts/test-classic-bot-matrix.mjs"
node --check "${repo_dir}/scripts/test-managed-classic.mjs"
node --check "${repo_dir}/server/classic-match.js"
node --check "${repo_dir}/server/supervisor.js"
bash -n "${repo_dir}/scripts/build-classic-bots.sh"
bash -n "${repo_dir}/scripts/build-images.sh"
node "${repo_dir}/scripts/test-crispy-source.mjs"
node "${repo_dir}/scripts/test-zandronum-source.mjs"
node "${repo_dir}/scripts/test-data-validator.mjs" --write-fixtures "${data_dir}/fixtures"
node "${framework_dir}/scripts/check-game-package.js" "${repo_dir}/web"
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
curl -fsS "http://127.0.0.1:${port}/" | grep -Fq '/shared-shell/wasm-game-framework.js'
curl -fsS "http://127.0.0.1:${port}/" | grep -Fq '/shared-shell/wasm-game-bootstrap.js'
curl -fsS "http://127.0.0.1:${port}/" | grep -Fq 'data-shell-launch-fullscreen'
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/shared-shell/wolfwasm-shell.js")" = "404"
curl -fsS "http://127.0.0.1:${port}/app.webmanifest?variant=doom" | grep -Fq '/assets/doom-512.png'
curl -fsS "http://127.0.0.1:${port}/app.webmanifest?variant=heretic" | grep -Fq '/assets/heretic-512.png'
curl -fsS "http://127.0.0.1:${port}/service-worker.js" | grep -Fq 'wasm-game-shell-0.9.6'
curl -fsS "http://127.0.0.1:${port}/data-validator.mjs" | grep -Fq 'validateIdTech1Data'
for notice in THIRD-PARTY-AUDIO.txt dist/dr-libs-LICENSE.txt dist/vorbis-LICENSE.txt dist/ogg-LICENSE.txt; do
    test -s "${repo_dir}/web/${notice}"
    curl -fsS "http://127.0.0.1:${port}/${notice}" -o "${data_dir}/audio-notice.txt"
    cmp "${repo_dir}/web/${notice}" "${data_dir}/audio-notice.txt"
done
curl -fsS "http://127.0.0.1:${port}/game-data/status?variant=doom2" | grep -Fq '"ready":false'
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/data/DOOM2.WAD")" = "404"
test "$(curl -sS -o "${data_dir}/wrong-response.json" -w '%{http_code}' -X PUT \
  --data-binary "@${data_dir}/fixtures/doom2-wrong-family.wad" \
  "http://127.0.0.1:${port}/game-data/setup/iwad?variant=doom2")" = "422"
grep -Fq 'different game family' "${data_dir}/wrong-response.json"
curl -fsS -X PUT --data-binary "@${data_dir}/fixtures/doom2-valid.wad" \
  "http://127.0.0.1:${port}/game-data/setup/iwad?variant=doom2" | grep -Fq '"identity":"doom2"'
curl -fsS "http://127.0.0.1:${port}/game-data/status?variant=doom2" | grep -Fq '"ready":true'
curl -fsS "http://127.0.0.1:${port}/game-data/files/iwad?variant=doom2" -o "${data_dir}/served-doom2.wad"
cmp "${data_dir}/fixtures/doom2-valid.wad" "${data_dir}/served-doom2.wad"
echo "Verified framework 0.9.6 document, PWA/fullscreen shell, audio notices, structural validator upload/status/download, and private /data boundary."
