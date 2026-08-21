#!/usr/bin/env bash
set -euo pipefail

container_name="${CS_CONTAINER_NAME:-wasm-games-counter-strike-host}"
runtime_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
image="${CS_SERVER_IMAGE:-wasm-games/counter-strike-yapb:4.4.957}"
base_image="${CS_BASE_IMAGE:-yohimik/cs-web-server@sha256:1618f2cf059f2f5857f09701846767ce4089efcc41d776a47acdfa6f994ccda2}"
bridge_port="${CS_BRIDGE_PORT:-4190}"
webrtc_port="${CS_WEBRTC_PORT:-4191}"
public_ip="${CS_PUBLIC_IP:-127.0.0.1}"
map_name="${CS_MAP:-de_dust2}"
max_players="${CS_MAXPLAYERS:-16}"
bot_quota="${CS_BOTS:-9}"
bot_difficulty="${CS_BOT_DIFFICULTY:-2}"

if ! [[ "${bot_quota}" =~ ^[0-9]+$ ]] || (( bot_quota < 0 || bot_quota >= max_players )); then
  printf 'CS_BOTS must be a non-negative integer lower than CS_MAXPLAYERS.\n' >&2
  exit 64
fi
if ! [[ "${bot_difficulty}" =~ ^[0-4]$ ]]; then
  printf 'CS_BOT_DIFFICULTY must be 0 through 4.\n' >&2
  exit 64
fi

if ! docker image inspect "${image}" >/dev/null 2>&1; then
  CS_SERVER_IMAGE="${image}" CS_BASE_IMAGE="${base_image}" \
    "${runtime_dir}/build-host-image.sh" >/dev/null
fi

if docker container inspect "${container_name}" >/dev/null 2>&1; then
  printf 'Counter-Strike host %s already exists.\n' "${container_name}"
  docker ps --filter "name=^/${container_name}$" --format '{{.Names}} {{.Status}}'
  exit 0
fi

docker run --rm -d \
  --name "${container_name}" \
  --platform linux/386 \
  -p "${bridge_port}:${bridge_port}/tcp" \
  -p "${webrtc_port}:${webrtc_port}/tcp" \
  -p "${webrtc_port}:${webrtc_port}/udp" \
  -e "ADDR=:${bridge_port}" \
  -e "IP=${public_ip}" \
  -e "PORT=${webrtc_port}" \
  -e "CS_BOTS=${bot_quota}" \
  -e "CS_BOT_DIFFICULTY=${bot_difficulty}" \
  "${image}" \
  +map "${map_name}" +maxplayers "${max_players}"

printf 'Counter-Strike host started: bridge ws://%s:%s/websocket, map %s, YaPB bots %s.\n' \
  "${public_ip}" "${bridge_port}" "${map_name}" "${bot_quota}"
