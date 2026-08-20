#!/usr/bin/env bash
set -euo pipefail

portal_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$portal_dir/validate.sh" --images
if [[ "${WASM_GAME_LAB_APPLY:-0}" != 1 ]]; then
  printf 'Validated only. Set WASM_GAME_LAB_APPLY=1 after completing RUNBOOK.md handoff steps.\n' >&2
  exit 2
fi
docker compose -f "$portal_dir/compose.yaml" up -d
printf 'WASM Game Lab: http://127.0.0.1:8080/\n'
