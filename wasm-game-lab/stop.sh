#!/usr/bin/env bash
set -euo pipefail

portal_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker compose -f "$portal_dir/compose.yaml" down
