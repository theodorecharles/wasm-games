#!/usr/bin/env bash
set -euo pipefail

namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"
if [[ -n "$namespace" ]]; then namespace="${namespace%/}/"; fi
data_dir="$(mktemp -d -t build-wasm-image-data.XXXXXX)"
active_container=""
cleanup() {
    if [[ -n "$active_container" ]]; then docker stop "$active_container" >/dev/null 2>&1 || true; fi
    cmake -E remove_directory "$data_dir"
}
trap cleanup EXIT

smoke() {
    local image="$1"
    local expected_variant="$2"
    local manifest_icon="$3"
    local file_key="$4"
    local query_variant="$expected_variant"
    local container="build-wasm-http-$$_${expected_variant}"
    [[ "$expected_variant" != "suite" ]] || query_variant="blood"
    active_container="$container"
    docker run --rm -d --name "$container" -p 127.0.0.1::8088 -v "$data_dir:/data" \
        "${namespace}${image}:${tag}" >/dev/null
    local host_port=""
    for _ in {1..100}; do
        host_port="$(docker port "$container" 8088/tcp 2>/dev/null | sed -n 's/.*://p' | head -1)"
        if [[ -n "$host_port" ]] && curl -fsS "http://127.0.0.1:$host_port/wasm-game.json" >/dev/null 2>&1; then break; fi
        sleep 0.1
    done
    [[ -n "$host_port" ]]
    local base="http://127.0.0.1:$host_port"
    curl -fsS "$base/" | rg -Fq '/shared-shell/wasm-game-framework.js'
    curl -fsS "$base/wasm-game-config.js" | rg -Fq "WASM_GAME_VARIANT = \"$expected_variant\""
    curl -fsS "$base/app.webmanifest?variant=$query_variant" | rg -Fq "$manifest_icon"
    curl -fsS "$base/game-data/status?variant=$query_variant" | rg -Fq '"ready":false'
    test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/game-data/files/$file_key?variant=$query_variant")" = "409"
    test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/data/$file_key")" = "404"
    docker stop "$container" >/dev/null
    active_container=""
    printf 'HTTP-smoked %s (%s).\n' "${namespace}${image}:${tag}" "$expected_variant"
}

smoke build-wasm suite /blood-512.png blood.rff
smoke blood-wasm blood /blood-512.png blood.rff
smoke duke3d-wasm duke3d /duke3d-512.png duke3d.grp

password_container="build-wasm-password-$$_suite"
active_container="$password_container"
docker run --rm -d --name "$password_container" -p 127.0.0.1::8088 \
    -e WASM_GAME_PASSWORD='build-wasm-smoke-password' \
    -v "$data_dir:/data" "${namespace}build-wasm:${tag}" >/dev/null
password_port=""
for _ in {1..100}; do
    password_port="$(docker port "$password_container" 8088/tcp 2>/dev/null | sed -n 's/.*://p' | head -1)"
    if [[ -n "$password_port" ]] && curl -fsS "http://127.0.0.1:$password_port/healthz" >/dev/null 2>&1; then break; fi
    sleep 0.1
done
[[ -n "$password_port" ]]
curl -fsS "http://127.0.0.1:$password_port/auth/status" | \
    jq -e '.required == true and .authenticated == false' >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$password_port/game-data/status?variant=blood")" = "401"
docker stop "$password_container" >/dev/null
active_container=""
printf 'Verified optional password gate in %sbuild-wasm:%s.\n' "$namespace" "$tag"
