#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repository="${COD2_WASM_IMAGE_REPO:-local/cod2-wasm}"
tag="${COD2_WASM_IMAGE_TAG:-dev}"
active_cid=""
started_port=""

cleanup() {
  if [[ -n "${active_cid}" ]]; then docker rm -f "${active_cid}" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

start_image() {
  local image="$1"
  shift
  local port
  port="$(node -e "const n=require('node:net');const s=n.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
  active_cid="$(docker run -d --rm -p "127.0.0.1:${port}:8088" "$@" "${image}")"
  for _ in $(seq 1 180); do
    if curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then started_port="${port}"; return; fi
    sleep 0.1
  done
  docker logs "${active_cid}" >&2 || true
  return 1
}

stop_image() {
  docker rm -f "${active_cid}" >/dev/null
  active_cid=""
}

test_image() {
  local image="$1" expected_variant="$2" port base headers
  start_image "${image}"
  port="${started_port}"
  base="http://127.0.0.1:${port}"
  curl -fsS "${base}/" | grep -q '/shared-shell/wasm-game-framework.css'
  curl -fsS "${base}/" | grep -q '/shared-shell/wasm-game-bootstrap.js'
  test "$(curl -fsS "${base}/wasm-game-framework.json" | node -pe 'JSON.parse(fs.readFileSync(0)).version')" = "0.9.6"
  test "$(curl -fsS "${base}/wasm-game-config.js" | sed -n 's/.*= "\([^"]*\)";.*/\1/p')" = "${expected_variant}"
  test "$(curl -fsS "${base}/app.webmanifest?variant=cod2-mp" | node -pe 'JSON.parse(fs.readFileSync(0)).short_name')" = "CoD2 WASM"
  headers="$(curl -fsSI "${base}/cod2_core_probe.wasm")"
  grep -qi '^Cross-Origin-Opener-Policy: same-origin' <<<"${headers}"
  grep -qi '^Cross-Origin-Embedder-Policy: require-corp' <<<"${headers}"
  grep -qi '^X-Content-Type-Options: nosniff' <<<"${headers}"
  test "$(curl -fsS -H 'Range: bytes=0-3' "${base}/cod2_core_probe.wasm" | od -An -tx1 | tr -d ' \n')" = "0061736d"
  test "$(curl -fsS "${base}/game-data/status?variant=cod2-mp" | node -pe 'const x=JSON.parse(fs.readFileSync(0)); `${x.variant}:${x.ready}:${x.files.length}`')" = "cod2-mp:false:28"
  test "$(curl -s -o /dev/null -w '%{http_code}' "${base}/game-data/files/iw-00?variant=cod2-mp")" = "409"
  test "$(curl -s -o /dev/null -w '%{http_code}' "${base}/data/main/iw_00.iwd")" = "404"
  test "$(curl -s -o /dev/null -w '%{http_code}' "${base}/local-data/main/iw_00.iwd")" = "404"
  test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "${base}/wasm-game.json")" = "405"
  stop_image
}

test_required_data_mount() {
  local data_root="${COD2_DATA_ROOT:-/home/ted/wasm-game-data/cod2}"
  local port base status headers
  [[ -f "${data_root}/main/iw_00.iwd" ]] || return 0
  start_image "${repository}:cod2-mp-${tag}" -v "${data_root}:/data:ro"
  port="${started_port}"
  base="http://127.0.0.1:${port}"
  status="$(curl -fsS "${base}/game-data/status?variant=cod2-mp")"
  test "$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(`${x.variant}:${x.ready}:${x.files.length}`)' "${status}")" = "cod2-mp:true:28"
  headers="$(curl -fsSI "${base}/game-data/files/localized-english-iw11?variant=cod2-mp")"
  grep -qi '^Cache-Control: private, max-age=31536000, immutable' <<<"${headers}"
  test "$(curl -fsS -H 'Range: bytes=0-3' "${base}/game-data/files/localized-english-iw11?variant=cod2-mp" | od -An -tx1 | tr -d ' \n')" = "504b0304"
  test "$(curl -s -o /dev/null -w '%{http_code}' "${base}/main/localized_english_iw11.iwd")" = "404"
  stop_image
}

test_image "${repository}:${tag}" suite
test_image "${repository}:cod2-mp-${tag}" cod2-mp
test_required_data_mount
echo "Call of Duty 2 Docker HTTP, PWA, range, required-data, and /data isolation contracts passed"
