#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="${IDTECH4_WORK_ROOT:-${repo_root}/.work}"
framework_dir="${WASM_GAME_FRAMEWORK_DIR:-${work_root}/wasm-game-framework}"
doom_web="${work_root}/dhewm3/build/web"
quake_web="${work_root}/openq4/build/web"
prey_web="${work_root}/prey2006/output/emscripten"
site="${repo_root}/build/site"

test "$(node -p "require('${framework_dir}/package.json').version")" = "0.9.2"
test "$(git -C "${framework_dir}" rev-parse HEAD)" = "53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f"
for required in \
  "${doom_web}/dhewm3-base.js" "${doom_web}/dhewm3-base.wasm" \
  "${doom_web}/dhewm3-roe.js" "${doom_web}/dhewm3-roe.wasm" \
  "${quake_web}/openQ4-client_wasm32.js" "${quake_web}/openQ4-client_wasm32.wasm" \
  "${quake_web}/baseoq4/game-sp_wasm32.wasm" "${quake_web}/baseoq4/game-mp_wasm32.wasm" \
  "${quake_web}/baseoq4/pak0.pk4" "${quake_web}/baseoq4/pak1.pk4" \
  "${prey_web}/prey06.js" "${prey_web}/prey06.wasm"; do
  test -s "${required}" || { echo "Missing ${required}; run scripts/build-all.sh first." >&2; exit 1; }
done

case "${site}" in
  "${repo_root}/build/site") ;;
  *) echo "Unsafe generated site path: ${site}" >&2; exit 1 ;;
esac
rm -rf -- "${site}"
mkdir -p "${site}/baseoq4"

install -m 0644 "${repo_root}/site/wasm-game.json" "${site}/wasm-game.json"
install -m 0644 "${repo_root}/site/game-adapter.js" "${site}/game-adapter.js"

for artifact in d3-worker.js dhewm3-base.js dhewm3-base.wasm dhewm3-roe.js dhewm3-roe.wasm doom3.ico doom3-pwa.svg roe.png; do
  install -m 0644 "${doom_web}/${artifact}" "${site}/${artifact}"
done
for artifact in q4-worker.js openQ4-client_wasm32.js openQ4-client_wasm32.wasm quake4.ico quake4-pwa.svg quake4-background.png; do
  install -m 0644 "${quake_web}/${artifact}" "${site}/${artifact}"
done
install -m 0644 "${prey_web}/prey06.js" "${site}/prey06.js"
install -m 0644 "${prey_web}/prey06.wasm" "${site}/prey06.wasm"
install -m 0644 "${repo_root}/site/prey-worker.js" "${site}/prey-worker.js"
install -m 0644 "${work_root}/prey2006/neo/sys/win32/rc/res/prey.ico" "${site}/prey.ico"
node "${repo_root}/scripts/extract-ico-png.mjs" "${site}/prey.ico" "${site}/prey-256.png"
for artifact in game-sp_wasm32.wasm game-mp_wasm32.wasm mod.json pak0.pk4 pak1.pk4; do
  install -m 0644 "${quake_web}/baseoq4/${artifact}" "${site}/baseoq4/${artifact}"
done

node "${repo_root}/scripts/merge-data-manifests.mjs" \
  "${work_root}/dhewm3/web/wasm-game-data.json" \
  "${work_root}/openq4/docker/wasm-game-data.json" \
  "${repo_root}/site/prey-data.json" \
  "${site}/wasm-game-data.json"

install -m 0644 "${work_root}/dhewm3/COPYING.txt" "${site}/DHEWM3-COPYING.txt"
install -m 0644 "${work_root}/openq4/docs/QUAKE4-SDK-EULA.rtf" "${site}/QUAKE4-SDK-EULA.rtf"
install -m 0644 "${work_root}/openq4/docs/REDISTRIBUTION.md" "${site}/QUAKE4-REDISTRIBUTION.md"
install -m 0644 "${repo_root}/site/IDTECH4-NOTICES.txt" "${site}/IDTECH4-NOTICES.txt"
install -m 0644 "${work_root}/prey2006/.github/COPYING.txt" "${site}/PREY2006-COPYING.txt"

metadata_dir="$(mktemp -d -t idtech4-framework.XXXXXX)"
trap 'rm -rf -- "${metadata_dir}"' EXIT
"${framework_dir}/scripts/install-browser-package.sh" "${metadata_dir}" copy >/dev/null
install -m 0644 "${metadata_dir}/wasm-game-framework.json" "${site}/wasm-game-framework.json"

node --check "${site}/game-adapter.js"
node --check "${site}/d3-worker.js"
node --check "${site}/q4-worker.js"
node --check "${site}/prey-worker.js"
node --check "${site}/dhewm3-base.js"
node --check "${site}/dhewm3-roe.js"
node --check "${site}/openQ4-client_wasm32.js"
node --check "${site}/prey06.js"
node -e 'for (const path of process.argv.slice(1)) JSON.parse(fs.readFileSync(path, "utf8"))' \
  "${site}/wasm-game.json" "${site}/wasm-game-data.json" "${site}/baseoq4/mod.json"
node -e '
  const data = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const [variant, policy] of Object.entries(data.variants || {})) {
    if (policy.validator !== false) throw new Error(`${variant}: exact hash policy must declare validator:false`);
  }
' "${site}/wasm-game-data.json"
for wasm in \
  "${site}/dhewm3-base.wasm" "${site}/dhewm3-roe.wasm" \
  "${site}/openQ4-client_wasm32.wasm" \
  "${site}/baseoq4/game-sp_wasm32.wasm" "${site}/baseoq4/game-mp_wasm32.wasm" \
  "${site}/prey06.wasm"; do
  test "$(od -An -tx1 -N4 "${wasm}" | tr -d ' \n')" = "0061736d"
done
node "${repo_root}/scripts/test-wasm-memory.mjs" "${site}"
node "${repo_root}/scripts/test-renderer-artifacts.mjs"
test "$(md5sum "${site}/baseoq4/pak0.pk4" | awk '{print $1}')" = "17550cb028326cdf1cee440bc5d73d74"
test "$(md5sum "${site}/baseoq4/pak1.pk4" | awk '{print $1}')" = "c3434e1d28bebdc367d6e50f3b1fda3a"
test "$(stat -c '%s' "${site}/baseoq4/pak0.pk4")" = "4285437"
test "$(stat -c '%s' "${site}/baseoq4/pak1.pk4")" = "641646791"
unzip -tqq "${site}/baseoq4/pak0.pk4"
unzip -tqq "${site}/baseoq4/pak1.pk4"
test ! -e "${site}/index.html"
test ! -e "${site}/app.webmanifest"
test ! -e "${site}/service-worker.js"

expected_files="$(cat <<'EOF'
DHEWM3-COPYING.txt
IDTECH4-NOTICES.txt
PREY2006-COPYING.txt
QUAKE4-REDISTRIBUTION.md
QUAKE4-SDK-EULA.rtf
baseoq4/game-mp_wasm32.wasm
baseoq4/game-sp_wasm32.wasm
baseoq4/mod.json
baseoq4/pak0.pk4
baseoq4/pak1.pk4
d3-worker.js
dhewm3-base.js
dhewm3-base.wasm
dhewm3-roe.js
dhewm3-roe.wasm
doom3-pwa.svg
doom3.ico
game-adapter.js
openQ4-client_wasm32.js
openQ4-client_wasm32.wasm
prey-256.png
prey-worker.js
prey.ico
prey06.js
prey06.wasm
q4-worker.js
quake4-background.png
quake4-pwa.svg
quake4.ico
roe.png
wasm-game-data.json
wasm-game-framework.json
wasm-game.json
EOF
)"
actual_files="$(find "${site}" -type f -printf '%P\n' | sort)"
test "${actual_files}" = "${expected_files}"

node "${repo_root}/scripts/test-adapter.mjs" "${site}"
node "${repo_root}/scripts/test-workers.mjs" "${site}"
node "${framework_dir}/scripts/check-game-package.js" "${site}"

printf 'Staged id Tech 4 family site at %s\n' "${site}"
