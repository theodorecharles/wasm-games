#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
site_dir="${1:-${repo_root}/out/cod2-wasm-core/site}"
framework_dir="${2:-${COD2_WASM_FRAMEWORK_DIR:-/home/ted/Development/wasm-game-framework}}"
source_dir="${COD2_WASM_SOURCE_DIR:-${repo_root}/.work/source}"
site_dir="$(cd "${site_dir}" && pwd)"
framework_dir="$(cd "${framework_dir}" && pwd)"

node --check "${site_dir}/game-adapter.js"
node --check "${site_dir}/cod2_core_probe.js"
node "${repo_root}/scripts/test-adapter.js" "${site_dir}"
node "${repo_root}/scripts/test-bot-foundation.js" "${source_dir}" "${repo_root}"
node "${framework_dir}/scripts/check-game-package.js" "${site_dir}"

node - "${site_dir}" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const site = process.argv[2];
const expected = [
  'cod2-diagnostic.svg', 'cod2_core_probe.js', 'cod2_core_probe.wasm', 'game-adapter.js',
  'wasm-game-data.json', 'wasm-game-framework.json', 'wasm-game.json'
];
assert.deepEqual(fs.readdirSync(site).sort(), expected);
const config = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game.json')));
assert.deepEqual(Object.keys(config.variants), ['cod2-mp']);
assert.equal(config.engine, 'IW 2.0 reconstruction');
assert.equal(config.identity, false);
assert.equal(config.graphics, false);
assert.equal(config.pointerLock, false);
assert.equal(config.fullscreen, false);
assert.equal(config.controller?.mode, 'disabled');
assert.equal(config.persistence, false);
assert.equal(config.variants['cod2-mp'].description, 'Still in development — Call of Duty 2 does not launch in this build.');
const data = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game-data.json')));
const files = data.variants['cod2-mp'].files;
assert.equal(files.length, 28);
assert.equal(files.reduce((sum, file) => sum + file.size, 0), 3685129248);
assert.equal(files.filter(file => file.diagnosticCache === true).length, 1);
for (const file of files) {
  assert.match(file.key, /^[a-z0-9-]+$/);
  assert.match(file.path, /^main\/[a-z0-9_]+\.iwd$/);
  assert.match(file.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(file.magic, [80, 75, 3, 4]);
}
const framework = JSON.parse(fs.readFileSync(path.join(site, 'wasm-game-framework.json')));
assert.equal(framework.version, '0.9.6');
NODE

node - "${repo_root}" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const lock = JSON.parse(fs.readFileSync(path.join(root, 'source-lock.json')));
assert.equal(lock.reconstruction.baselineCommit, 'f70e697476fceeb4f53de677e1c5d5fe12a00b36');
assert.equal(lock.reconstruction.repository, 'https://github.com/theodorecharles/cod2-wasm.git');
assert.equal(lock.reconstruction.upstream, 'https://github.com/opencod2/opencod2.git');
assert.equal(lock.reconstruction.licenseFilePresent, false);
assert.equal(lock.auditedAlternative.upstream, 'https://github.com/xtnded/cod2.git');
assert.equal(lock.auditedAlternative.commit, '8eccf06c80423f099fb01745529bee6bb43cc84a');
assert.equal(lock.auditedAlternative.license, 'GPL-2.0');
assert.equal(lock.auditedAlternative.licenseSha256, 'fac9da110d1433f4df0cb9f5dda9449e9aff6ee236ed240fa29e3e92926c363a');
assert.equal(lock.auditedAlternative.selected, false);
NODE

node - "${site_dir}" <<'NODE'
const assert = require('node:assert/strict');
const path = require('node:path');
const site = process.argv[2];
(async () => {
  const factory = require(path.join(site, 'cod2_core_probe.js'));
  const output = [];
  await factory({
    locateFile(name) { return path.join(site, name); },
    print(value) { output.push(String(value)); },
    printErr(value) { output.push(String(value)); }
  });
  assert.ok(output.some(line => line.includes('native MD4 block checksum: 9028dc2c')));
  assert.ok(output.some(line => line.includes('native keyed checksum: 4cdcd263')));
  assert.ok(output.some(line => line.includes('probe complete')));
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE

[[ "$(od -An -tx1 -N4 "${site_dir}/cod2_core_probe.wasm" | tr -d ' \n')" == "0061736d" ]]
test -f "$(dirname "${site_dir}")/CMakeFiles/cod2_client_objects.dir/web_main.c.o"
test "$(find "$(dirname "${site_dir}")/CMakeFiles/cod2_client_objects.dir" -type f -name '*.o' | wc -l)" = "395"

for forbidden in index.html '*.css' service-worker.js app.webmanifest asset-validator.js owner-manifest.json; do
  if find "${site_dir}" -maxdepth 1 -name "${forbidden}" -print -quit | grep -q .; then
    echo "downstream may not publish ${forbidden}" >&2
    exit 1
  fi
done
if find "${site_dir}" -type f -iname '*.iwd' -print -quit | grep -q .; then
  echo "an IWD entered the public package" >&2
  exit 1
fi
while IFS= read -r tracked; do
  if [[ -e "${repo_root}/${tracked}" ]]; then
    echo "a generated/runtime or downstream shell artifact is tracked: ${tracked}" >&2
    exit 1
  fi
done < <(git -C "${repo_root}" ls-files | grep -Ei '\.(iwd|wasm|data)$|(^|/)index\.html$|(^|/).*\.css$|service-worker|\.webmanifest$' || true)
! rg -n '/local-data/|owner-manifest|asset-validator|WolfWasmShell|wolfwasm-' "${site_dir}" "${repo_root}/site"
! rg -n '"engine"[[:space:]]*:[[:space:]]*"IW 3|description=.*IW 3' \
  "${repo_root}/Dockerfile" "${repo_root}/site"
git -C "${repo_root}" diff --check
echo "Call of Duty 2 static, package, adapter, diagnostic, and data-boundary contracts passed"
