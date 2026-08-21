#!/usr/bin/env bash
set -euo pipefail

namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"
if [[ -n "$namespace" ]]; then namespace="${namespace%/}/"; fi
data_dir="$(mktemp -d -t idtech2-image-data.XXXXXX)"
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
    local query_variant="$expected_variant"
    local container="idtech2-http-$$_${expected_variant}"
    [[ "$expected_variant" != "suite" ]] || query_variant="quake"
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
    curl -fsS "$base/" | grep -Fq '/shared-shell/wasm-game-framework.js'
    curl -fsS "$base/health" | grep -Fq '"state":"sleeping"'
    curl -fsS "$base/status" | grep -Fq '"peers":0'
    curl -fsS "$base/wasm-game-config.js" | grep -Fq "WASM_GAME_VARIANT = \"$expected_variant\""
    curl -fsS "$base/app.webmanifest?variant=$query_variant" | grep -Fq "$manifest_icon"
    curl -fsS "$base/game-data/status?variant=$query_variant" | grep -Fq '"ready":false'
    test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/game-data/files/pak0.pak?variant=$query_variant")" = "409"
    test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/data/pak0.pak")" = "404"
    docker stop "$container" >/dev/null
    active_container=""
    printf 'HTTP-smoked %s (%s).\n' "${namespace}${image}:${tag}" "$expected_variant"
}

smoke idtech2-wasm suite /quake-512.png
smoke quake1-wasm quake /quake-512.png
smoke quake2-wasm quake2 /quake2-512.png
smoke quake2-xatrix-wasm quake2-xatrix /quake2-512.png
smoke quake2-rogue-wasm quake2-rogue /quake2-512.png
