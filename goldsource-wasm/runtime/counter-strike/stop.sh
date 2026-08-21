#!/usr/bin/env bash
set -euo pipefail

container_name="${CS_CONTAINER_NAME:-wasm-games-counter-strike-host}"
if docker container inspect "${container_name}" >/dev/null 2>&1; then
  docker stop "${container_name}"
else
  printf 'Counter-Strike host %s is not present.\n' "${container_name}"
fi
