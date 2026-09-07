#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$(bash "${repo_dir}/scripts/fetch-crispy-source.sh")"
build_dir="${IDTECH1_BOT_BUILD_DIR:-${repo_dir}/.work/classic-bots-native}"

# Native SDL 2/SDL_net headers and a native C compiler are required. This never
# stages over web/dist or repins/rebuilds the browser engines.
cmake -S "${repo_dir}/bots" -B "${build_dir}" \
    -DIDTECH1_SOURCE_DIR="${source_dir}" -DCMAKE_BUILD_TYPE=Release
cmake --build "${build_dir}" --target crispy-doom crispy-heretic crispy-hexen \
    --parallel "${IDTECH1_BUILD_JOBS:-$(nproc)}"
for game in doom heretic hexen; do
    test -x "${build_dir}/bin/classic-bot-${game}"
    sha256sum "${build_dir}/bin/classic-bot-${game}"
done

# These generated build manifests prevent packaging stale local binaries after
# changing the command producer or lobby policy. Paths are relative to the repo.
(
    cd "${repo_dir}"
    sha256sum bots/classic-bot.c bots/classic-bot-lobby.c bots/CMakeLists.txt \
        scripts/build-classic-bots.sh
) > "${build_dir}/bin/source.sha256"
(
    cd "${build_dir}/bin"
    sha256sum classic-bot-doom classic-bot-heretic classic-bot-hexen
) > "${build_dir}/bin/binaries.sha256"
