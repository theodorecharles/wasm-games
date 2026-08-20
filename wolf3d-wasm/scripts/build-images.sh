#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
namespace="${DOCKER_NAMESPACE:-}"
tag="${DOCKER_TAG:-dev}"

if [[ -n "$namespace" ]]; then
    namespace="${namespace%/}/"
fi

"$repo_dir/scripts/build-image.sh" "${namespace}wolf3d-wasm:${tag}" wolf3d
"$repo_dir/scripts/build-image.sh" "${namespace}spear-wasm:${tag}" spear

printf 'Built Wolf4SDL image set: %swolf3d-wasm:%s and %sspear-wasm:%s\n' \
    "$namespace" "$tag" "$namespace" "$tag"
