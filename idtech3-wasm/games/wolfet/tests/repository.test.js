'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function trackedUnder(subpath) {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  const relative = path.relative(repoRoot, path.join(ROOT, subpath || '')).replace(/\\/g, '/');
  const listed = execFileSync('git', ['ls-files', '--', relative || '.'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const prefix = relative ? relative + '/' : '';
  return listed.split('\n').filter(Boolean).map((line) => (
    prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line
  )).join('\n') + '\n';
}

describe('reproducible source repository', () => {
  it('documents both deployment modes and their operator-facing behavior', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.match(readme, /ETJS_MODE/);
    assert.match(readme, /vanilla/i);
    assert.match(readme, /arcade/i);
    assert.match(readme, /aimbot/i);
    assert.match(readme, /Status: \*\*Live\*\*/);
    assert.match(readme, /WASM_GAME_PASSWORD/);
  });

  it('keeps reference workspaces, game data, builds, and credentials out of Git', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    [
      '/etlegacy/',
      '/quakejs/',
      '/runtime/etmain/*.pk3',
      '/runtime/legacy/*.pk3',
      '/web/client/*',
      '/runtime/.rcon-password'
    ].forEach((rule) => assert.match(ignore, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    const tracked = trackedUnder();
    assert.doesNotMatch(tracked, /^web\/shared-shell\//m,
      'WolfET must consume the exact framework dependency without committing its HTML or CSS');
  });

  it('pins the Splash Damage archive and all installed game files by SHA-256', () => {
    const fetcher = fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-game-data.sh'), 'utf8');
    assert.match(fetcher, /cdn\.splashdamage\.com\/downloads\/games\/wet\/et260b\.x86_full\.zip/);
    assert.match(fetcher, /2a8fef8e8558efffcad658bb9a8b12df8740418b3514142350eba3b7641eb3e0/);
    assert.match(fetcher, /712966b20e06523fe81419516500e499c86b2b4fec823856ddbd333fcb3d26e5/);
    assert.match(fetcher, /d1abab70f6e3e3af8f34dfb4d94542c8bd592b0a1a582f0107d2162ee23c679b/);
  });

  it('stages declarative data, icon, and PWA policy before the runtime image', () => {
    const game = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'wasm-game.json'), 'utf8'));
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'wasm-game-data.json'), 'utf8'));
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    const server = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
    const entrypoint = fs.readFileSync(path.join(ROOT, 'docker', 'entrypoint.sh'), 'utf8');
    assert.equal(game.icon, '/img/et-512.png');
    assert.equal(game.iconPixelated, true);
    assert.equal(game.persistence.root, '/persistent/wolfet');
    assert.equal(game.controller.mode, 'disabled');
    assert.ok(fs.existsSync(path.join(ROOT, 'web', 'img', 'et-192.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'web', 'img', 'et-512.png')));
    const tracked = trackedUnder('web/img');
    assert.match(tracked, /^web\/img\/et\.ico$/m);
    assert.match(tracked, /^web\/img\/et-192\.png$/m);
    assert.match(tracked, /^web\/img\/et-512\.png$/m,
      'the reproducible Docker build must contain its declared PWA icons');
    assert.equal(data.namespace, 'wolfet');
    assert.equal(data.files.length, 6);
    assert.equal(data.files.find((file) => file.key === 'etmain-pak0.pk3').size, 228138631);
    assert.match(dockerfile, /check-game-package\.js \/game-site/);
    assert.match(dockerfile, /stage-framework-runtime\.js \/framework \/game-site \/framework-dist \/framework-runtime/);
    assert.match(server, /FRAMEWORK_RUNTIME_ROOT/);
    assert.match(server, /sendFile\(req, res, PWA_MANIFEST_PATH\)/);
    assert.match(server, /sendFile\(req, res, SERVICE_WORKER_PATH/);
    assert.doesNotMatch(server, /function pwaManifest|function serviceWorkerSource/);
    assert.doesNotMatch(entrypoint, /web\/img/,
      'the entrypoint must not author downstream icons or PWA metadata');
  });

  it('provisions official data on the host and only serves same-origin URLs to browsers', () => {
    const dedicated = fs.readFileSync(path.join(ROOT, 'server', 'dedicated.js'), 'utf8');
    const host = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    const downloader = fs.readFileSync(path.join(ROOT, 'web', 'js', 'pk3-download.js'), 'utf8');
    assert.match(dedicated, /function ensureGameData\(\)/);
    assert.match(dedicated, /fetch-game-data\.sh/);
    assert.match(host, /dedicated\.ensureGameData\(\)/);
    assert.match(client, /url: '\/etmain\/pak0\.pk3'/);
    assert.match(client, /url: '\/legacy\/legacy_v2\.84\.0\.pk3'/);
    assert.match(host, /cacheKey: def\.name \+ '@sha256:' \+ def\.hash/);
    assert.match(client, /file\.cacheKey \|\| file\.name/);
    assert.match(downloader, /Range: 'bytes='/);
    assert.doesNotMatch(client, /splashdamage\.com/i);
  });

  it('pins and completely represents the current ET: Legacy engine delta', () => {
    const setup = fs.readFileSync(path.join(ROOT, 'scripts', 'setup-etlegacy.sh'), 'utf8');
    assert.match(setup, /a44ab4f396370a694109da33df901d85f6fe9626/);
    const patch = path.join(ROOT, 'patches', 'etlegacy-wasm.patch');
    assert.ok(fs.statSync(patch).size > 300000);
    const modesPatch = path.join(ROOT, 'patches', 'etlegacy-modes.patch');
    assert.ok(fs.statSync(modesPatch).size > 1000);
    assert.match(setup, /etlegacy-modes\.patch/);
    const eth32Patch = path.join(ROOT, 'patches', 'etlegacy-eth32nix.patch');
    const slotPatch = path.join(ROOT, 'patches', 'etlegacy-human-slot.patch');
    const uiPatch = path.join(ROOT, 'patches', 'etlegacy-etjs-ui.patch');
    assert.ok(fs.statSync(eth32Patch).size > 1000);
    assert.ok(fs.statSync(slotPatch).size > 1000);
    assert.ok(fs.statSync(uiPatch).size > 1000);
    assert.match(setup, /etlegacy-eth32nix\.patch/);
    assert.match(setup, /etlegacy-human-slot\.patch/);
    assert.match(setup, /etlegacy-etjs-ui\.patch/);
    assert.match(setup, /install_eth32nix/);
    assert.ok(fs.existsSync(path.join(ROOT, 'eth32nix', 'eth32nix_aim.c')));
    if (fs.existsSync(path.join(ROOT, 'etlegacy', '.git'))) {
      execFileSync('git', ['-C', path.join(ROOT, 'etlegacy'), 'apply', '--reverse', '--check', uiPatch]);
      execFileSync('git', ['-C', path.join(ROOT, 'etlegacy'), 'apply', '--reverse', '--check', slotPatch]);
    }
  });

  it('builds and requires the matching native qagame module', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'build-server-mod.sh'), 'utf8');
    const dedicated = fs.readFileSync(path.join(ROOT, 'server', 'dedicated.js'), 'utf8');
    assert.match(pkg.scripts['build:server-mod'], /build-server-mod\.sh/);
    assert.match(pkg.scripts.setup, /build:server-mod/);
    assert.match(script, /--target qagame/);
    assert.match(script, /INSTALL_EXTRA=OFF/);
    assert.match(script, /qagame\.mp\.x86_64\.so/);
    assert.match(dedicated, /assertServerMod/);
    assert.match(dedicated, /SERVER_MOD_HASH/);
  });

  it('packages an amd64 deployment image without proprietary game data', () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    const dockerignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
    const entrypoint = fs.readFileSync(path.join(ROOT, 'docker', 'entrypoint.sh'), 'utf8');
    const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'docker.yml'), 'utf8');

    assert.match(dockerfile, /FROM \$\{ETLEGACY_IMAGE\} AS runtime/);
    assert.match(dockerfile, /platforms: linux\/amd64|EXPOSE 8088\/tcp 27960\/udp/);
    assert.match(dockerfile, /COPY third_party third_party/);
    assert.match(dockerfile, /COPY web-port web-port/);
    assert.match(dockerfile, /COPY patches\/etlegacy-eth32nix\.patch/);
    assert.match(dockerfile, /COPY patches\/etlegacy-human-slot\.patch/);
    assert.match(dockerfile, /COPY patches\/etlegacy-etjs-ui\.patch/);
    assert.match(dockerfile, /COPY eth32nix eth32nix/);
    assert.match(dockerfile, /ETJS_MODE=arcade/);
    assert.match(dockerfile, /ETJS_SLOTS=12/);
    assert.match(dockerfile, /KEEP_ALIVE=false/);
    assert.match(dockerfile, /IDLE_TIMEOUT=15m/);
    assert.match(dockerignore, /runtime\/etmain\/\*\.pk3/);
    assert.match(dockerignore, /runtime\/legacy\/\*\.pk3/);
    assert.match(entrypoint, /ETJS_DATA_ROOT="\$DATA_ROOT"/);
    assert.match(entrypoint, /fetch-game-data\.sh/);
    assert.match(entrypoint, /ETJS_LEGACY_PAK_SOURCE/);
    assert.match(entrypoint, /DATA_ROOT\/custom_maps/);
    assert.match(entrypoint, /DATA_ROOT\/announcer/);
    assert.match(entrypoint, /installed locally supplied UT2004 announcer/);
    assert.match(dockerfile, /unzip zip/);
    assert.match(entrypoint, /DATA_OWNER_UID/);
    assert.match(entrypoint, /KEEP_ALIVE/);
    assert.match(entrypoint, /for seed_ui_file in "\$SEED_ROOT"\/legacy\/ui\/\*/);
    assert.match(entrypoint, /runtime\/legacy\/ui\/\$\(basename "\$seed_ui_file"\)/);
    assert.match(workflow, /--platform linux\/amd64/);
    assert.match(workflow, /refs\/heads\/devel\) etjs_image_tag="dev"/);
    assert.match(workflow, /refs\/heads\/master\) etjs_image_tag="latest"/);
    assert.match(workflow, /DOCKERHUB_USERNAME/);
    assert.match(workflow, /DOCKERHUB_TOKEN/);
    assert.match(workflow, /Require Docker Hub credentials/);
    assert.match(workflow, /exit 1/);
  });

  it('ships a Community Applications-ready Unraid template', () => {
    const template = fs.readFileSync(path.join(ROOT, 'templates', 'wolfet-wasm.xml'), 'utf8');
    const profile = fs.readFileSync(path.join(ROOT, 'ca_profile.xml'), 'utf8');

    assert.match(template, /<Container version="2">/);
    assert.match(template, /<Repository>tedcharles\/wolfet-wasm:latest<\/Repository>/);
    assert.match(template, /<WebUI>http:\/\/\[IP\]:\[PORT:8088\]\/<\/WebUI>/);
    assert.match(template, /Target="\/data"[^>]*\/mnt\/user\/appdata\/wolfet-wasm/);
    assert.match(template, /Target="8088"[^>]*Mode="tcp"/);
    assert.match(template, /Target="27960"[^>]*Mode="udp"/);
    ['ETJS_MODE', 'ETJS_SLOTS', 'KEEP_ALIVE', 'IDLE_TIMEOUT', 'ETJS_OMNIBOT', 'WASM_GAME_PASSWORD']
      .forEach((name) => assert.match(template, new RegExp('Target="' + name + '"')));
    assert.match(template, /amd64\/x86_64/);
    assert.match(template, /unraid-templates\/master\/wolfet-wasm\.xml/);
    assert.match(template, /unraid-templates\/master\/wolfet-wasm\.png/);
    assert.match(profile, /<CommunityApplications>/);
    assert.match(profile, /<Profile>[^<]+<\/Profile>/);
    assert.match(profile, /unraid-templates\/master\/wolfet-wasm\.png/);
  });

  it('publishes Docker images only on the dedicated Mac mini runner', () => {
    const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'docker.yml'), 'utf8');
    assert.match(workflow, /runs-on: \[self-hosted, macOS, ARM64, wolfet-wasm\]/);
    assert.doesNotMatch(workflow, /docker\/setup-qemu-action/);
    assert.match(workflow, /etjs_docker="\/Applications\/Docker\.app\/Contents\/Resources\/bin\/docker"/);
    assert.match(workflow, /export HOME="\$etjs_action_home"/);
    assert.match(workflow, /cliPluginsExtraDirs/);
    assert.match(workflow, /"\$etjs_docker" --config "\$etjs_docker_config" image inspect/);
    assert.match(workflow, /tonistiigi\/binfmt:latest --install amd64/);
    assert.match(workflow, /--platform linux\/amd64/);
    assert.match(workflow, /etjs_action_home="\$\(mktemp -d\)"/);
    assert.doesNotMatch(workflow, /docker[^\n]*login/);
    assert.match(workflow, /index\.docker\.io\/v1\//);
    assert.match(workflow, /unset etjs_docker_auth/);
    assert.match(workflow, /buildx build/);
    assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
    assert.doesNotMatch(workflow, /type=gha/);
  });

  it('does not ship the old shared RCON password', () => {
    const dedicatedSource = fs.readFileSync(path.join(ROOT, 'server', 'dedicated.js'), 'utf8');
    const rconSource = fs.readFileSync(path.join(ROOT, 'server', 'rcon.js'), 'utf8');
    assert.doesNotMatch(dedicatedSource, /ETJS_RCON \|\| ['"]etjs['"]/);
    assert.doesNotMatch(rconSource, /password\) \|\| ['"]etjs['"]/);
    assert.match(dedicatedSource, /randomBytes\(24\)/);
    assert.match(dedicatedSource, /RUNTIME_ROOT, '\.rcon-password/);
  });
});
