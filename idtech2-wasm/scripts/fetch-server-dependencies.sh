#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="${IDTECH2_SERVER_SOURCE_DIR:-$repo_dir/.work/mods}"
jobs="${IDTECH2_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"
frikbot_dir="$work_dir/frikbot"
threezb2_dir="$work_dir/3zb2"

checkout() {
    local repository="$1"
    local commit="$2"
    local destination="$3"
    if [[ ! -d "$destination/.git" ]]; then
        mkdir -p "$(dirname "$destination")"
        git clone --filter=blob:none "$repository" "$destination"
        git -C "$destination" checkout --detach "$commit"
    fi
    [[ "$(git -C "$destination" remote get-url origin)" == "$repository" ]]
    [[ "$(git -C "$destination" rev-parse HEAD)" == "$commit" ]]
}

checkout https://github.com/0xBrsm/FrikBotNex.git \
    deeae8b7eaa5d63572d1065eddddce7ea299d7ac "$frikbot_dir"
checkout https://github.com/yquake2/3zb2.git \
    334a1e635b9dc4926bcb7aa37d02b341ee99a96a "$threezb2_dir"

if [[ ! -x "$frikbot_dir/src/build/tmp/bin/nqserver" ]]; then
    (cd "$frikbot_dir" && OUT="$frikbot_dir/src/build/tmp/bin/nqserver" \
        bash src/build/build-server.sh)
fi
[[ -f "$frikbot_dir/progs.dat" ]]

if [[ ! -f "$threezb2_dir/release/game.so" ]]; then
    make -C "$threezb2_dir" -j "$jobs"
fi
[[ -f "$threezb2_dir/misc/assets.zip" ]]

printf '%s\n' "$frikbot_dir" "$threezb2_dir"
