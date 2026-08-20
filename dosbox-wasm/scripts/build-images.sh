#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
framework_dir="${WASM_FRAMEWORK_DIR:-$repo_dir/../wasm-game-framework}"
required_version="0.9.4"
required_commit="c4ad3b9e075f881d32f044299fbfeee703a9169d"
running_container=''

cleanup() {
  [[ -n "$running_container" ]] && docker stop -t 1 "$running_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

smoke_image() {
  local image="$1" variant="$2" port
  running_container="$(docker run -d --rm -p 127.0.0.1::8088 "$image")"
  port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8088/tcp") 0).HostPort}}' "$running_container")"
  for _ in $(seq 1 100); do
    curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 && break
    sleep 0.05
  done
  curl -fsS "http://127.0.0.1:$port/wasm-game-config.js" | grep -Fq "WASM_GAME_VARIANT = \"$variant\""
  curl -fsS "http://127.0.0.1:$port/wasm-game.json" | jq -e --arg variant "$variant" '
    .controller.mode == "disabled" and
    .persistence.root == "/persistent/dosbox/{variant}" and
    (if $variant == "suite" then .variants | length == 9 else .variants[$variant] != null end)
  ' >/dev/null
  curl -fsS "http://127.0.0.1:$port/service-worker.js" | grep -Fq 'wasm-game-shell-0.9.4'
  docker stop -t 1 "$running_container" >/dev/null
  running_container=''
}

[[ "$(node -p "require('${framework_dir}/package.json').version")" == "$required_version" ]]
[[ "$(git -C "$framework_dir" rev-parse HEAD)" == "$required_commit" ]]

EMSDK_DIR="${EMSDK_DIR:-/home/ted/emsdk}" WASM_FRAMEWORK_DIR="$framework_dir" \
  "$repo_dir/scripts/build-web.sh"
"$framework_dir/scripts/build-base-image.sh" "wasm-game-framework:$required_version"

images=(
  'dosbox-wasm:dev suite'
  'jill1-wasm:dev jill1'
  'jill2-wasm:dev jill2'
  'jill3-wasm:dev jill3'
  'jazz-wasm:dev jazz'
  'duke1-wasm:dev duke1'
  'duke2-wasm:dev duke2'
  'gta1-wasm:dev gta'
  'nfs1-wasm:dev nfs'
  'simcity2000-wasm:dev simcity2000'
)
for specification in "${images[@]}"; do
  image="${specification%% *}"
  variant="${specification#* }"
  WASM_GAME_FRAMEWORK_IMAGE="wasm-game-framework:$required_version" \
    "$framework_dir/scripts/build-static-image.sh" "$repo_dir/web/dist" "$image" "$variant"
  [[ "$(docker run --rm --entrypoint node "$image" -p "require('/opt/wasm-game-framework/package.json').version")" == "$required_version" ]]
  [[ "$(docker run --rm --entrypoint sh "$image" -c 'printf %s "$WASM_GAME_VARIANT"')" == "$variant" ]]
  docker run --rm --entrypoint sh "$image" -c \
    'test ! -e /opt/game-site/index.html && test -z "$(find /data -mindepth 1 -print -quit)" && test -f /opt/game-site/dosbox.wasm'
  smoke_image "$image" "$variant"
  printf 'Verified %s (%s).\n' "$image" "$variant"
done

running_container="$(docker run -d --rm -p 127.0.0.1::8088 -e WASM_GAME_PASSWORD='dosbox-smoke-password' dosbox-wasm:dev)"
password_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8088/tcp") 0).HostPort}}' "$running_container")"
for _ in $(seq 1 100); do
  curl -fsS "http://127.0.0.1:$password_port/healthz" >/dev/null 2>&1 && break
  sleep 0.05
done
curl -fsS "http://127.0.0.1:$password_port/auth/status" | jq -e '.required == true and .authenticated == false' >/dev/null
[[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$password_port/game-data/status")" == 401 ]]
docker stop -t 1 "$running_container" >/dev/null
running_container=''
printf 'Verified optional password gate in dosbox-wasm:dev.\n'
