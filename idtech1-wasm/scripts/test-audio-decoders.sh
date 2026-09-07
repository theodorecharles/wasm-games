#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dr_libs_source="$(bash "${repo_dir}/scripts/fetch-audio-decoders.sh")"
test_dir="$(mktemp -d -t zandronum-codecs.XXXXXX)"
trap 'rm -rf -- "${test_dir}"' EXIT
mkdir "${test_dir}/fixtures"
unzip -q -j "${repo_dir}/web/dist/zandronum.pk3" \
    sounds/DSDGACT.flac sounds/cnnctsnd.ogg sounds/dstaunt.wav -d "${test_dir}/fixtures"
em++ -O2 -sUSE_VORBIS=1 -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1 \
    -I "${repo_dir}/wasm/zandronum-audio" -I "${dr_libs_source}" \
    "${repo_dir}/scripts/test-audio-decoders.cpp" "${repo_dir}/wasm/zandronum-audio/decode.cpp" \
    --embed-file "${test_dir}/fixtures@/fixtures" -o "${test_dir}/decode-test.js"
node "${test_dir}/decode-test.js" /fixtures/DSDGACT.flac /fixtures/cnnctsnd.ogg /fixtures/dstaunt.wav
