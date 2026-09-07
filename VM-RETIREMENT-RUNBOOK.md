# VM retirement and Windows-96 migration

Newest: [19:36 stateful migration / VM shutdown handoff](SESSION-HANDOFF-20260907.md).
Prod/Dev are now shut off with autostart disabled and disks/definitions retained.
Trashcan owns API/AIM and the sole live importer; Pump retains the music files.
Read Windows96 `documentation/STATEFUL_HANDOFF_20260907.md` before any recovery.
Do not restart old writers: their snapshots are no longer production authority.
The old workflows/runners are disabled; GitHub has no old VM runner registered.
The checkpoints below are historical. Picard game-container retirement remains.

CURRENT: 2026-09-07 15:53 UTC. The classic Steam icon/control/layout and working
Help frontend update is live; see Windows96 documentation/STEAM_VISUAL_RELEASE_20260907.md
for the follow-up source, corrected snapshot defect and index-only rollback.
The updated Windows96 desktop, Steam and 39 game
routes are LIVE at https://games.tedcharles.net/ on Trashcan. NPM host70 now points
to 4.20.69.67:8099. This is a staged public preview, not completed VM retirement:
AIM/WebSocket and /api/ requests deliberately still reach the existing Prod VM
through the new router, preserving the only live account/music writers. Neither
VM is shut down. Host79 remains disabled. See the final public-release checkpoint;
earlier “not public” statements below describe historical checkpoints only.
The user authorized migrating everything needed from both VMs to Trashcan,
then shutting down the VMs. Preserve source data and VM disks for rollback.
Latest public release: Steam has39 enabled launch links,2 diagnostic-only entries,
4 catalog-only entries. IE5/XP remain excluded from public release. The historical
"41 runtime-backed games" count incorrectly included
HL2/CoD2 diagnostics. Their unfinished engines remain required. See the final section.

## Access and proxy inventory

- Production: `ted@4.20.69.195` (`pumpvm`), SSH works with the existing local
  `/home/ted/.ssh/id_ed25519` key. Noninteractive sudo requires a password.
- Development: `ted@4.20.69.219` (`pumpdev`), same SSH/access conditions.
- Destination: `ted@4.20.69.67` (Trashcan), SSH now works after the user installed
  the public key. Docker access works; noninteractive sudo still requires a
  password. Its sole local SSD has about 602 GiB free, insufficient for the
  599 GiB MP3 library plus apps/games/headroom. The user explicitly authorized
  keeping music on Pump and connecting Trashcan to it over NFS instead.
- Nginx Proxy Manager is on Picard, `4.20.69.132`, per the user. SSH rejects the
  available key for `ted` initially; now both `ted` and `root` SSH work. The
  `NginxProxyManager` container has its own LAN IP `4.20.69.107` on `br0`; its
  appdata is `/srv/appdata/pump/NginxProxyManager`, mounted at `/config`.
- Both `https://games.tedcharles.net/` and
  `https://games-dev.tedcharles.net/` returned HTTP 200 through Cloudflare.
  NPM SQLite records now confirm host 70 (`games`) forwards HTTP to
  `4.20.69.195:8080`, certificate 137, forced SSL, WebSockets enabled. Host 79
  (`games-dev`) forwards HTTP to `4.20.69.219:8080`, certificate 151, SSL not
  forced, WebSockets enabled. Both are enabled, no custom locations/advanced
  config/cache/access lists. No proxy configuration has been changed.
  Hosts 76/77 (`api-dev`/`www-dev`) still target the now-retired photography
  backend/frontend on `.219:3001/3000`; retain/retire these deliberately.
- Both Windows-96 configurations and PM2 processes use port 8080 and public path
  `/`. Historical deployment docs mentioning a development subdirectory are not
  evidence of current proxy routing.

## Confirmed source inventory

| Host | Required running apps | Data |
| --- | --- | --- |
| pumpvm | PM2 `windows-96`, `music-import`; Windows-96 production Actions runner | `/home/ted/windows-96`, `/mnt/user/appdata/windows-96-prod` |
| pumpdev | PM2 `windows-96`; development runner definition exists but was not running | `/home/ted/windows-96`, `/mnt/user/appdata/windows-96-dev` |

Neither VM has any Docker containers (including stopped ones). Both use PM2
under `ted`. No user crontab exists; visible system cron files/timers appear to
be OS maintenance. Root-only cron/configuration remains unaudited without admin
access. VM-specific OS services do not automatically need migration as apps.

Production Windows-96 is at `2e9fb68bc24809184328c0df05a16fd9fc49af2e` with
uncommitted changes to ecosystem config, music indexing/server code, package
metadata and WindowsContainer; untracked music importer/helper scripts exist.
These changes **must be preserved** before deploying repository code over it.
Development was at `5cb409aaec5a0290a8110869804ef6fb69c76484`, initially clean.
The local clone at `/home/ted/Development/windows-96` now preserves the production
edits and contains uncommitted security work. Both live VM checkouts subsequently
received the narrow credential/notification patch documented below; do not reset
them to the original revisions.

GitHub workflows deploy master/devel on self-hosted runners labeled
`[self-hosted, prod|dev, windows-96]`, running
`/home/ted/windows-96/update.sh`. Migrate deployment automation deliberately;
do not activate two runners with copied credentials or let pushes overwrite
the dirty production checkout.

Both VMs mount Pump `4.20.69.100:/mnt/user/mp3s` over NFS. `du -sk` measured
628,143,404 KiB (about 599 GiB) for the library. The NFS filesystem's 367 TiB
capacity is **not** the library size or Trashcan capacity. Production Windows-96
appdata is 2,152,382 KiB; development appdata is 2,178,932 KiB. These include AIM
SQLite databases, music-library SQLite databases and guest VM disk images.
Preserve environment separation. Use consistent database backups/final syncs;
do not assume live SQLite file copies alone provide a consistent snapshot.

## Galleria retirement — completed app shutdown, data retained

The user explicitly identified Galleria processes as redundant and authorized
removing them. On 2026-09-07 UTC:

- Removed production PM2 `galleria-website`, verified its executable was
  `/home/ted/Galleria-Website/backend/dist/server.js` before removing it.
- Removed development PM2 `backend` and `frontend`, verified their working
  directories were the photography site's backend/frontend before removing them.
- Ran `pm2 save` on both hosts and verified saved process lists contain only the
  required remaining apps. Their PIDs/status were unchanged: production
  Windows-96 1330, music-import 1339; development Windows-96 1344.
- Private mode-0600 pre-change PM2 exports exist on each host at
  `/home/ted/.pm2/pre-galleria-retirement-20260907.json`. These contain environment
  values; never print them, copy them into a public repo or publish them.
- Application code, uploaded files and databases were not deleted.
- Galleria deployment runner services have **not** been disabled. Development
  `actions.runner.theodorecharles-Galleria.photo-dev.service` was running;
  production Galleria/photo runner definitions were enabled but not in the
  running-service list. Admin access is needed to retire them properly and
  prevent a future deployment from recreating apps before VM shutdown.

## Next gates

Latest user decisions: do not recreate a development desktop service or retain
`games-dev`. Preserve that VM's code/data as an archive. Serve the production
desktop/Steam at the root of `games.tedcharles.net`, and all game endpoints under
paths (`/doom1/`, `/doom2/`, `/doom3/`, etc.). Previous references above to
isolated live dev/prod destinations describe the old plan; only production
will be live. Verify prefix routing including WebSockets before public cutover.

1. Establish Trashcan and Picard access; inspect actual free space and routes.
2. Finish source/root service inventory, preserve local production modifications,
   back up databases, and choose nonconflicting isolated dev/prod endpoints.
3. Connect the existing Pump music library by NFS (user-approved storage change);
   copy/verify appdata, owner game data and required app deployments into explicit
   destination paths. Do not delete sources. Preserve importer write semantics
   only if required by its inspected code, and never run duplicate importers.
4. Verify Windows-96 HTTP assets, AIM/WebSockets, music streaming/range requests,
   guest VM images, games and restart persistence before switching NPM upstreams.
5. Confirm public domains and deployment automation work on Trashcan. Stop old
   writers, final-sync data, retain rollback, then shut down the two exact VMs.

The broader Steam library/per-game launch settings, AIM/Paint/screensavers and
guest VM input repairs remain active in [GOAL-SCOPE.md](GOAL-SCOPE.md).

## New verified staging checkpoint

- Confirmed VM hypervisor is Bang, `root@4.20.69.200`; root SSH works.
  Libvirt `Dev`, UUID `8c62bb1c-7f70-a5fe-a5ec-dfea91c85a05`, guest-agent IP
  `4.20.69.219`, MAC `52:54:00:e0:94:7f`; `Prod`, UUID
  `c290b596-9f9f-4de6-dd83-51625d30e4e1`, IP `4.20.69.195`, MAC
  `52:54:00:cf:79:fa`. Both running, autostart enabled, each 8 vCPUs/8 GiB RAM.
  After final verified cutover, gracefully shut down **these exact UUIDs** and
  disable their autostart; retain disks and definitions. Pump's Locutus is
  unrelated and must not be stopped. QEMU guest agent works on both source VMs.
- Root SSH to Pump (`4.20.69.100`) works with the existing key. Its NFS mp3s
  export allowed only `.195` and `.219`, explaining failed Trashcan mounts.
  Added only `.67` with the existing rw/sync/root-squash/anonymous-ID settings
  in both `/boot/config/shares/mp3s.cfg` and `/etc/exports`; activated only that
  client/export with `exportfs -i`. No NFS service restart or broad export reload.
  Originals remain at those paths plus `.before-windows96-20260907` suffix.
- Trashcan volume `windows96-pump-music-ro-v42-20260907` successfully mounts
  `4.20.69.100:/mnt/user/mp3s`, NFS 4.2, read-only. Early failed probes left empty
  driver-volume definitions; do not confuse those with a copied music library.
  The share grants rw because the original importer needs it; the tested web
  container mounts it ro and no second importer has started.
- Private staging/archives are at
  `/home/ted/.local/state/windows-96-migration-20260907` on the workstation and
  `/home/ted/windows-96-migration-20260907` on Trashcan. These contain credentials,
  Git metadata and user databases; never publish or print them. Production
  application/guest images and consistent database snapshots are copied.
  Development app and all appdata are copied too. Workstation-to-Trashcan
  checksum verification completed with no application/appdata file differences
  (only directory metadata and workstation-only export patch files). This was
  the initial archive checkpoint, not verification of later live changes.
  Root frontend node_modules and logs were excluded from
  these app archives; server dependencies, Git metadata, dirty source and built
  frontend assets were preserved. Original VM disks remain the full rollback.
- Source SQLite online backups are under
  `/home/ted/.local/state/windows96-retirement-20260907/initial` on each VM.
  `quick_check=ok`: prod 18 AIM accounts/83,823 music tracks; dev 5/83,780.
  These are initial snapshots, not a final write-frozen cutover sync.
- Container `windows96-prod-candidate-20260907` on Trashcan is bound only to
  `127.0.0.1:8096`, restart=no, non-root uid/gid 1000, read-only root/app, no
  capabilities, no-new-privileges, read-only music and guest disks, writable
  copied appdata. Native Node runtime matches source v23.11.1, image digest
  `node@sha256:86191b94d2a163be41f3dc7fe5e5fcaca8ba2f1be7275d98a06343483c17414a`.
  This is a lift-and-shift compatibility checkpoint, not an endorsement of that
  old Node version for the final hardened release.
- Compatibility passes: better-sqlite3 and bcrypt load; HTML byte-identical to
  source; five linked assets match; Windows 98 and Windows 3.1 first-4096-byte
  Range responses match; real music Range bytes match via Pump NFS; AIM WebSocket
  handshake works without creating accounts/messages. Candidate reports 720
  artists and 83,823 tracks. No real-browser functionality pass yet.
- Source `/api/music/health` falsely reports dbExists=false without MUSIC_DB_PATH,
  although its service loads 720 artists via config. Candidate explicit env fixes
  this deployment diagnostic discrepancy; do not call the original library empty.
- No public NPM records changed. No legacy Picard game containers stopped. No
  host VMs created on Trashcan. No originals deleted.

## Important code findings before final public deployment

- Existing Windows-96 source contains hardcoded API/bot credentials. Do not echo
  them, run notification scripts or publish copied config. Remove hardcoded
  credentials from the maintained source, configure secrets privately and tell
  the owner to rotate exposed credentials (history remains exposed).
- `update.sh` uses a hard reset and sends external notifications. Do not run it
  over the dirty source checkout or use it blindly as the migration deploy path.
- The old HTTP server has unsafe path containment and incomplete Range handling;
  address/test before exposing new functionality. The current candidate is private.
- WASM launchers/adapters contain root-relative assets/API/WebSocket URLs.
  New per-game public paths require tested prefix support, not only NPM location
  entries. Do not cut over old game subdomains to unverified prefixes.

## Credential and notification checkpoint — 2026-09-07 UTC

User explicitly deferred credential rotation and requested preserving active
integrations using private environment files. User then retired Telegram entirely;
do not migrate its token, recreate notifications, or make Telegram API calls.

Completed:

- Removed the Telegram code and literals from maintained `update.sh`; no Telegram
  integration references remain in the maintained Windows-96 source tree. Removed
  both Telegram values from the private runtime env file as well. Historical Git
  objects and private original backups still contain old literals; no history
  rewrite or credential revocation was performed.
- Removed the OpenAI key fallback from `server/aim.js`. The existing key is loaded
  server-side via `server/runtime-env.js`; missing keys make the optional bot
  explicitly offline. Removed server logs of raw authentication/chat payloads and
  full OpenAI errors. This does not yet fix the remaining AIM security findings.
- Runtime env is mode 0600 at `/home/ted/.config/windows96/runtime.env` on Prod,
  Dev, and Trashcan, containing only the existing `OPENAI_API_KEY`. Source copy is
  private under the workstation migration directory's `secrets/runtime.env`.
  No key values were added to PM2 serialized configuration. Do not print these
  files; they are not committed. `MUSIC_RELOAD_TOKEN` and exact allowed-origin
  settings in `.env.example` are planned, not yet enforced/installed.
- Both live VMs received the patched `aim.js`, new `runtime-env.js`, notification-
  free `update.sh`, and staged-output `webpack.config.js`. Verified old AIM source
  hashes matched the preserved baseline before replacement. Original AIM/update
  files are mode 0600 in each VM's
  `/home/ted/.local/state/windows96-retirement-20260907/pre-security`.
- Restarted only PM2 `windows-96` with `WINDOWS96_ENV_FILE` set and saved PM2.
  Prod PID 63316, Dev PID 63410, each one deliberate restart, online. Production
  `music-import` remains PID 1339 with zero restarts; no duplicate importer started.
  Desktop HTTP 200, music artists API 200, unauthenticated AIM WebSocket handshakes
  pass on both VMs. No new accounts, chat messages, or upstream OpenAI calls were
  made, so this is not a fresh end-to-end bot-response test.
- Updater now refuses dirty/detached checkouts, uses fast-forward-only Git updates,
  stages frontend output before activation, preserves previous assets, restores
  the old frontend on a restart failure, and targets only the desktop PM2 app.
  It does not delete the PM2 app or automatically start the importer. This remains
  a legacy in-place source/dependency updater, **not a transactional server-code
  rollback**. Do not run it over the dirty live checkouts or use it for migration.
- Nine local tests pass: `node --test tests/deployment.test.js tests/runtime-env.test.js`
  in the Windows-96 repo. Deployment tests use isolated mocked Git/npm/PM2 commands;
  they are failure-path regression tests, not a production build/deploy test.
  Bash/Node syntax and `git diff --check` pass.

Still pending:

- The private Trashcan candidate still runs the original archived app code and
  does not yet mount the new env file. Recreate it with hardened source and a
  read-only external secret mount before public deployment; preserve archives.
- HTTP path containment, symlink traversal, malformed URL/Range handling; AIM
  origin/input/rate-limit and chat HTML/XSS repairs; bounded/exact-origin analytics;
  authenticated music reload with matching importer token; remaining lifecycle
  and start-script issues. Do not report all security findings fixed.
- Old self-hosted runner services remain active/enabled. No commits or GitHub push
  of this tranche occurred. Retire/control the runners before pushing/deploying;
  their remote master versions could otherwise reintroduce unsafe code.
- NPM cutover, game-prefix support, final write-frozen data sync, Picard game stops,
  and Bang VM shutdown/autostart disable remain unperformed.

## HTTP/AIM security deployment checkpoint — 2026-09-07 04:29 UTC

This supersedes the pending code/candidate/development-proxy statements in the
earlier checkpoints. It does **not** complete the full Steam/migration goal.

### Implemented and deployed to production and private candidate

- Replaced the HTTP routing/streaming layer with pre-normalization URL validation,
  resolved-path and open-file containment checks, safe query handling, MIME types,
  deliberate cache rules, generic failures, and stream cleanup on disconnect.
  Byte ranges support suffix/open-ended/clamped ends and huge integer offsets;
  invalid ranges return 416, HEAD does not stream, unknown units/multipart ranges
  are ignored safely. Music and v86 first-4096-byte responses match the original.
- Exact browser-origin policy, bounded WebSocket payloads/connection count/message
  rate, bounded authentication work and attempts, validation of every supported
  message type, authenticated-only message handling, login-race/identity guards,
  bounded bot queues/budget, and timer cleanup. Raw auth/chat/client payload logs
  were removed. No production accounts were created by verification.
- Removed AIM chat's `dangerouslySetInnerHTML`. Only attribute-free b/i/u/br become
  Preact nodes; other markup is inert escaped text, including persisted messages.
- Analytics accepts only bounded JSON/event batches and exact allowed origins,
  strips sensitive fields and URL query/fragment data, limits requests, times out
  upstream calls, and returns meaningful failures without leaking upstream bodies.
- Found and fixed an additional serious exposure: `src/index.tsx` imported the
  private server config into the frontend. The archived production bundle was
  confirmed to contain the real analytics username AND password. The frontend
  now fetches `/api/client-config`, explicitly limited to an enabled boolean.
  New browser assets were checked against the actual OpenAI/analytics secrets;
  neither secret is present. Historical bundles/browser caches remain exposed
  until the owner rotates the credentials; no rotation was performed.
- `OPENOBSERVE_USERNAME` and `OPENOBSERVE_PASSWORD` joined the preserved OpenAI key
  in the private env file. Added a new random `MUSIC_RELOAD_TOKEN`, shared only by
  web/importer. Public reloads are denied, internal bearer reloads work and are
  rate-limited. Replacement music caches are loaded before swapping out the old
  service. Health reports actual service readiness/counts, no local paths/errors.
- Legitimate dot-prefixed media paths are allowed while static dotfiles, private
  file types, import artifacts, escapes and out-of-root symlinks remain blocked.
  The real library has 8 dotted album folders/94 affected track paths. All 94 were
  checked over HTTP after the compatibility adjustment: **94/94 HTTP 200**.

### Actual deployment state

- Production remains `4.20.69.195:8080`. Current PM2 desktop PID **65089**, importer
  PID **64604**, both online. PM2 saved configuration contains env-file paths, not
  OpenAI/analytics/reload secret values. Env file remains mode 0600 at
  `/home/ted/.config/windows96/runtime.env`. Production config.json had analytics
  credentials removed; paths/other settings were preserved.
- Before restarting the importer, verified no ffmpeg conversion and zero pending
  import files (the remaining `_IMPORT/Ye` directory was empty). Stopped the old
  importer, atomically moved the old dist outside served roots, activated the new
  frontend, restarted the web app and the single importer with the shared env,
  and saved PM2. Never started an importer on Trashcan.
- Production rollback: private mode-0700 directory
  `/home/ted/.local/state/windows96-retirement-20260907/pre-http-security` contains
  old server/native dependencies, private config/env and old dist. Do not publish
  these: the old browser bundle contains exposed analytics credentials. Original
  application data and databases were not removed or replaced.
- Trashcan new app directory: `/home/ted/windows-96-candidate-20260907`, private,
  separate from immutable initial archives. It contains current source/build and
  preserved server dependencies. Runtime container
  `windows96-prod-candidate-20260907`, ID prefix **4f763faad777**, binds only
  `127.0.0.1:8096`, mounts `/home/ted/.config/windows96/runtime.env` read-only at
  `/run/secrets/windows96.env`, and keeps the previous data/RO music/RO guest-image
  mounts. Read-only root/app, non-root uid 1000, capabilities dropped, no-new-
  privileges, restart=no. Still uses the temporary matching Node 23 image; an
  upgrade is required before calling the whole runtime hardening complete.
- Previous candidate was stopped and renamed
  `windows96-prod-candidate-before-security-20260907`; it is retained, not running.
  Last new-candidate measurement: 0.00% CPU, about 140 MiB RAM. No Chrome was launched.
  Temporary workstation SSH tunnel PID 3402110/session 98112 was terminated and
  completion observed; no verification subprocess is left running.

### Verification and remaining gates

- `npm run build -- --display errors-only` passes. Entire native test suite passes
  on Trashcan's matching Node runtime: **25/25**, with fresh temporary SQLite users
  and external integrations disabled. Local frontend-only suite: 24 pass, native
  AIM test explicitly skipped because server dependencies are not installed there.
  Latest dotted-path HTTP adjustment also passed all 7 HTTP tests locally and in
  the matching container. `git diff --check` passes.
- Two test-environment issues were investigated, not hidden: deployment fixtures
  need executable temporary storage (test containers used `exec` on their temporary
  mount only), and aborted-stream tests now inspect actual media file handles
  instead of counting unrelated lazy socket/event FDs. The final matching-runtime
  run passed all 25 tests; aborted downloads leave zero media handles open.
- `scripts/verify-http-candidate.js` passes nine internal checks on candidate and
  production, including authenticated reload. Eight public checks pass through
  `https://games.tedcharles.net`; internal reload token was explicitly cleared for
  public checks. Production HTML/assets/music/v86 ranges work; public AIM WebSocket
  upgrade through NPM succeeds. No upstream OpenAI requests or analytics test
  events were sent. Full bot/analytics delivery remains unproven.
- `scripts/verify-dotted-music-paths.js` proves all 94 real dotted paths work.
- Browser skill read; existing browser binding reported unavailable and browser
  discovery returned an empty list. Did not launch another browser or bypass the
  supported browser surface. Visual UI/gameplay verification is still pending.
- Source changes are **not committed or pushed**. Old runner services remain
  active/enabled. Control/retire them and update deployment automation before
  publishing. Do not let a legacy workflow reintroduce old code/secrets.
- Still audit/fix remaining runtime/dependency issues, AIM reconnection/account
  correctness, trusted-proxy attribution/rate-limit scope, importer shutdown and
  failure cleanup, and the old start script. The current limiter intentionally
  trusts socket peers, not spoofable forwarding headers; NPM clients share a quota
  until deliberate trusted-proxy support is configured.
- Full Steam app, canonical profiles/options, all game endpoints/data on Trashcan,
  path-prefix support, Game Lab fixes/deploy/cleanup, desktop app completeness,
  VMware cursor/input repairs and final host migration remain active and unfinished.

### Development public route retired (not VM shutdown)

- Disabled only NPM proxy host **79** (`games-dev.tedcharles.net` -> `.219:8080`),
  after checking its exact domain/upstream/state. Production host **70** stays
  enabled and still points to `.195:8080`. Nginx config test and reload passed;
  pre-existing deprecated-http2 warnings reference unrelated host 48.
- NPM private backup inside its container:
  `/config/windows96-retirement-20260907/{database.sqlite,79.conf,79.conf.original}`.
  Directory is mode 0700 and database/config backups are private. The original
  generated 79.conf was moved out of the active nginx glob. SQLite row is retained
  with enabled=0; no proxy/certificate record was deleted. Re-enable deliberately
  through NPM for rollback, or restore that exact route/config if necessary.
- Authored helper is workstation-private
  `/home/ted/.local/state/windows-96-migration-20260907/retire-games-dev.sh`, also
  copied to Picard `/root/retire-games-dev-20260907.sh`. It uses exact guarded
  targets, backs up first, and restores the route if nginx validation/reload fails.
- Public games-dev now returns Cloudflare **525**, because its origin TLS route
  was retired but DNS still exists. It no longer serves the old desktop/bundle.
  **DNS cleanup remains**, as do development runners, related retired photography
  routes 76/77, and final Dev VM shutdown. Dev's archived/VM app still has the older
  HTTP/frontend code; do not accidentally re-enable its public route.

## Steam implementation checkpoint — 2026-09-07 05:01 UTC

Concrete progress this turn; the full migration/product goal remains active.

### Implemented in Windows-96 and shared framework

- Replaced the seven game app IDs/component registrations and 14 desktop/Start
  shortcuts with one Steam app. Removed the old automatic-popup GameApp and empty
  Games folder. Existing saved game windows migrate to a single Steam selection;
  unknown IDs are ignored. Steam focuses/unminimizes as a singleton, initial
  size/position fits the viewport, and window contents can shrink without forcing
  the frame to overflow. Final-window close now persists an empty list after
  restoration; restoration timer is cleaned on unmount.
- Period-inspired olive Steam UI: searchable library, all/favorites/ready/recent
  collections, game overview/launch-options/build-information pages, per-game
  preferences, favorites, reset defaults and launch history. No dead Store/login
  controls or Steam credentials. Real game players open in dedicated user-clicked
  tabs, preserving fullscreen/pointer-lock/isolation and leaving the desktop open.
- `scripts/sync-steam-library.js` extracted manifests from all **30 exact pinned
  image IDs**, creating only stopped temporary containers and removing them after
  extraction. 45 catalog entries: **41 runtime-backed + 4 explicitly unimplemented
  emulators**. Root-plus-variant controls come from those images, not source WIP;
  record image ID and raw manifest digest. Generated control fixtures prove this.
- Every game URL uses its canonical single-domain path and carries scoped,
  allowlisted settings (`wgGame`, `wgProfile`, `wgFps`, `wgPlayer`,
  `wgFullscreen`, `wgDynamicQuality`, `wgController`). Counter-Strike does not
  inherit the old browser-local 127.0.0.1:4192 development override; proper
  same-origin signaling must be deployed before it is enabled.
- Shared framework source now validates URL preferences against the actual
  selected manifest, applies them before adapter init, and uses per-variant
  preference keys with non-destructive legacy family fallback. Switching a suite
  variant clears old launch overrides. Save/game-data filesystem paths unchanged.
  **This framework change is not yet packaged into the runtime images.**
- `public/steam/deployment.json` deliberately has zero ready records. Play requires
  a launchable entry and matching image ID, manifest hash and launchOptions:1.
  Do not enable it just because the UI or game HTML responds. Prefix routing,
  runtime/data/options and gameplay still need verification.

### Staged deployment and tests

- Built into fresh `/tmp/windows96-steam-build.EssPjY`, checked catalog checksums
  and copied the clean output to the existing private candidate. Current served
  directory is `/home/ted/windows-96-candidate-20260907/dist` on Trashcan. The
  candidate's source tree was **not** synchronized by this frontend-only stage;
  the authoritative new source is the local Windows-96 checkout. Do not rebuild
  on the candidate from its older frontend source.
- Prior candidate dist retained outside served roots at private
  `/home/ted/.local/state/windows96-retirement-20260907/candidate-before-steam-dist`.
  The app container remains `windows96-prod-candidate-20260907`, binding only
  127.0.0.1:8096. No container restart or importer start was needed. No new
  long-lived process, game engine, browser, tunnel or host VM was started.
- Checked all 8 text/browser files in the clean staged build against the actual
  active OpenAI/analytics/reload credential values: no matches. Confirmed required
  private env credentials remain available and no Telegram env variables remain.
  No values were logged, no rotation/revocation/history rewrite occurred.
- Candidate HTTP checks pass for desktop, all 3 local script links, 45-entry
  catalog, empty deployment gate, Quake III image bytes and health. Catalog SHA:
  `2c606b1b0aa03c70b587b2b12ea5c1a571da5eb867ca21fb7f8b942d197014a2`.
- Windows-96 `npm test`: **35 pass, 1 explicitly skipped native AIM test** locally.
  Earlier matching-runtime security suite was 25/25; no new server changes this
  turn. Component tests exercise all 135 game/page combinations plus functional
  profile/favorite/reset/link behavior; not a substitute for visual browser tests.
  **112** game/default/profile combinations round-trip through the actual shared
  runtime parser. New Telegram regression guards maintained deployment/runtime
  files. Framework full `npm test`, including two new launch tests, passes.
- Production build and diff whitespace checks pass. Compiler diagnostics for new
  Steam/helper/icon files are zero. Full repository type-check is not clean:
  TypeScript 3.9 cannot parse currently resolved Node type dependencies, plus
  pre-existing app diagnostics remain (1,453 other/compiler diagnostics observed).
- Browser skill used; discovery still returns an empty list. No standalone Chrome
  launched; actual layout, focus and gameplay browser verification remain pending.
- Durable implementation details: Windows-96
  `documentation/STEAM_RUNBOOK.md`. All source changes remain **uncommitted and
  unpushed**. Control the legacy self-hosted runners before publishing.

### Quake III icon fixed in current local Game Lab

- Copied installed Steam app 2200 PNG byte-for-byte to lab `icons/quake3.png`,
  updated its shortcut and both provenance inventories. Old source ICO retained
  for rollback, not referenced. SHA-256:
  `887189c52279f6fd2088c6961544bd9c65ef7e82d920ecb229406a4733e21812`.
- Live http://127.0.0.1:8080/games.json points Quake III to quake3.png; served icon
  hash matches. Portal's existing read-only repo bind picked up the change without
  restarting engines. New Steam catalog also uses it.
- Lab `./validate.sh --images` passes: 45 shortcuts, 30 runnable endpoints,
  32 Compose services, 30 image contracts and 29 inventoried icons. This does not
  close the known running-image drift or replace the nine DOSBox artwork fallbacks.

### Next concrete work / unchanged migration gates

1. Finish targeted network-prefix support in framework, family adapters, workers,
   PWA scopes and gateway. Do not mechanically rewrite native virtual-FS paths.
2. Package shared launch-option changes and prefix fixes into current exact game
   images; copy/verify the ~38 GiB owner game data on Trashcan, preserving saves.
   Prepared Blood/Duke input images and normal lab deployment drift still need
   actual deployment/browser verification; old local proof cleanup is outstanding.
3. Verify each canonical game path/options/data and then enable its exact Steam
   ready record. Public desktop is still Prod .195; NPM game-prefix cutover has
   not happened. No old Picard games or Bang Dev/Prod VMs were stopped this turn.
4. Continue DOS game artwork, AIM/app/Paint/screensaver/VMware correctness and
   remaining security/runtime/importer lifecycle work from prior checkpoints.
5. Freeze and synchronize live data, retire/control old runners, switch NPM only
   after acceptance, then gracefully shut down exact Bang VMs and disable their
   autostart. Keep music on Pump/NFS and all rollback data. DNS games-dev cleanup
   remains. No host VMs on Trashcan.

## Full game-data copy and first real game-path deployment — 2026-09-07 05:38 UTC

This supersedes the earlier statements that game data is not copied and no
runtime image contains the new framework launch/prefix support. It does not
complete the broader migration, game portfolio or Windows-96 quality goal.

### Game data copied and verified

- Copied the entire `/home/ted/wasm-game-data` tree to the same path on Trashcan.
  **80,680 regular-file payloads, 40,717,752,501 bytes, zero SHA-256 mismatches.**
  Source originals remain. No game-data directory was excluded, including old
  proof data and the root-owned WolfET session files.
- Read-only Docker helper, network=none, root filesystem read-only, capabilities
  dropped except DAC_READ_SEARCH, allowed reading both root-owned and uid-1000
  private source directories without changing their permissions. The complete
  link/special-file audit found only two Quake II expansion PAK symlinks, pointing
  into the workstation's Steam Quake 2 installation. Mounted that exact install
  read-only and copied link contents so Trashcan has regular self-contained PAKs.
  No sockets/FIFOs were present. Transfer used streaming sparse/dereferenced tar.
- Destination files belong to ted/uid 1000; top-level game-data directory is
  mode 0700. Full source/destination inventories are private JSON in workstation
  `/home/ted/.local/state/windows-96-migration-20260907/` and destination inventory
  in Trashcan `/home/ted/.local/state/windows96-retirement-20260907/`.
  Source/destination inventory names are `game-data-{source,destination}-sha256.json`.
  Compact public-safe receipt is lab `deploy/steam/game-data-copy-receipt.json`.
- Both hash passes refused files changing during read. Initial full comparison
  matched every path, byte length and SHA-256. Any later writes require a controlled
  final delta sync; do not blindly overwrite new destination state at cutover.
- Transfer and hash sessions completed successfully; temporary Docker copy/hash/
  extraction containers were removed. No transfer/hash helper remains running.
  Last Trashcan free space: **557 GiB**. Music remains on Pump/NFS as authorized.

### Shared prefix foundation and id Tech 1 integration

- Added validated `WASM_GAME_BASE_PATH`, browser `publicUrl`/`publicBasePath`,
  scoped document assets/base/config, data and validator-module URLs, wake/auth
  clients, favicon/PWA paths, service-worker scope/cache namespace/cleanup and
  password cookie path. No client-supplied forwarded-prefix header is trusted.
- Added a real stripping-proxy/server integration test covering locked variants,
  owner-data readiness/bytes, password login cookie scope, manifests/assets and
  worker cleanup isolation. Root deployment compatibility tests remain passing.
- Patched only id Tech 1 adapter network operations (manifest/support fetches,
  engine script sources, wake and WebSocket URLs). Native FS/save paths untouched.
  Native supervisor now rejects cross-variant wake requests on locked endpoints
  before starting any match, and initializes its advertised variant correctly.
- Adapter regression passes all seven variants, existing input/profile/persistence
  cases and 21 additional prefixed single-player cases. Source Dockerfile requires
  the new framework URL helper to prevent pairing this adapter with an old shell.
- Framework full `npm test` passes including four new launch/prefix tests and its
  existing runtime/server/persistence/media/auth/package suites. Windows-96 remains
  **35 tests passed, 1 native AIM test explicitly skipped locally**. No new
  Windows-96 server/frontend changes were deployed in this tranche.

### Exact images and candidate processes

- New image `local/windows96:idtech1-prefix-20260907` overlays only shared
  framework/browser/server, game adapter and supervisor files on the exact prior
  id Tech 1 image. All 28 base layers preserved; native engine binaries not rebuilt.
  Extracted base adapter and supervisor hashes matched the committed pre-edit
  baseline before packaging. Build context is workstation
  `/tmp/windows96-idtech1-prefix.W5f30E`; Dockerfile and provenance are lab
  `deploy/steam/Dockerfile.idtech1-prefix` and `idtech1-release.json`.
- Local containerd image-store manifest/index ID:
  `sha256:c75f8a6fc06fdcbe133bb0629d2ef3fb32f1b2639f4ae4524a8803f8d1519d66`.
  After verified save/load, Trashcan's classic Docker reports the **config ID**:
  `sha256:f5b43f806afc912001c3d30f475bca918d01e4568d4346dcc8b6ea72ae6b123a`.
  Both identities are recorded; do not conflate digest types during future gates.
  Actual candidate Node version is **22.23.2**.
- Seven exact config-ID containers on Trashcan:
  `windows96-game-doom`, `windows96-game-doom2`, `windows96-game-tnt`,
  `windows96-game-plutonia`, `windows96-game-heretic`, `windows96-game-hexen`,
  `windows96-game-chex`. Respectively loopback ports 28101–28107 -> container8088;
  base paths `/doom1/`, `/doom2/`, `/tnt/`, `/plutonia/`, `/heretic/`, `/hexen/`,
  `/chex/`. Each has a locked variant, uid1000, RO root, bounded writable /tmp,
  cap-drop ALL, no-new-privileges, one CPU/1GiB/pids128 limits, restart=no.
  Each mounts the copied `/home/ted/wasm-game-data/crispy` at /data.
- `windows96-router-candidate-20260907`: pinned inspected nginx **1.31.3** image
  config ID `sha256:f0ba77f796e57c6fa89ae7f4fdad1665d6fcbd8e3f211535120542b337f9959e`.
  Host networking but **listens only on 127.0.0.1:8097**, non-root, RO root/config,
  /tmp tmpfs, dropped caps, no-new-privileges, 128MiB/one CPU/pids32, restart=no.
  Root -> existing private desktop at8096; seven game paths -> respective ports;
  34 pending game paths return503 and four unimplemented entries return501.
- Existing container names and intended ports were checked before creation.
  Trashcan has no Compose plugin; used the workstation's Compose client over
  `docker --host ssh://ted@4.20.69.67 compose ...`. Local/remote generated specs
  are lab `deploy/steam/compose.candidate.json` and Trashcan
  `/home/ted/windows96-game-deployment-20260907/compose.candidate.json`.

### Real endpoint acceptance and remaining work

- `deploy/steam/verify-candidate.mjs` passes all seven deployed routes through the
  actual gateway: no-slash redirects retain query; canonical HTML/script/style/
  icon paths respond; COOP/COEP headers survive; wrong `game`/`variant` queries
  cannot switch the game; owner WADs structurally validate; byte ranges and WASM
  magic/MIME work; raw owner paths stay private; PWA URL and worker scope remain
  under each game; the **served** framework parser accepts each supported profile.
- Cross-variant `/wake` requests return409 before starting a native process.
  All seven native supervisors remain **sleeping, zero humans, zero bots**.
  Latest idle sample: 0.00% CPU each; game containers about27–39MiB each and router
  about3.3MiB. No background Chrome, game match or VM was started.
- One verifier assumption was corrected using real evidence: Chex's canonical
  data manifest requires PWAD, not IWAD. The verifier now checks its exact policy
  and actual range bytes; final run passed. Recorded results are
  `deploy/steam/verification-20260907.json` locally and in the remote deploy folder.
- Browser skill used; discovery still returns []. No visual/playback/input test
  was fabricated. **Steam's ready list remains empty** pending browser acceptance
  and regenerated image provenance; the staged UI still has its previous catalog.
- Detailed reproducible deployment instructions: lab `deploy/steam/README.md`.
  Source changes remain uncommitted/unpushed. Existing local Game Lab runtime
  images/contracts and old proof-container cleanup were not changed by this
  separate candidate deployment (Quake III icon remains fixed from prior turn).
- Next: extend targeted adapters/worker/native-WebSocket prefix support and image
  packaging to the other34 runtime-backed games, using the already copied data.
  Update contracts/catalog using correct portable image identity before enabling
  records. Browser gameplay/input/persistence checks, DOS artwork, Blood/Duke
  deployed input verification, local container cleanup, Windows-96 app/AIM/Paint/
  screensaver/VMware work, remaining security/lifecycle issues all remain active.
- Public NPM still points games to Prod. No public prefix cutover, Picard game
  stops, Bang VM shutdown, final freeze/sync, runner retirement or games-dev DNS
  removal occurred. Before public cutover, complete trusted-proxy/TLS forwarding,
  readiness and deliberate restart-policy changes. Keep all rollback data and
  unrelated services intact; no host VMs on Trashcan.

## Blood/Duke actual adapter packaging and deployment — 2026-09-07 05:55 UTC

- Found a real fault in the earlier captured-mouse release: its Dockerfile
  updated top-level adapters, but the family dispatcher loaded old copies from
  `/adapters/blood.js` and `/adapters/duke3d.js`. Extracted the exact pinned images
  using stopped helper containers; the old dispatched Blood adapter fails the
  captured press/release regression. The top-level adapters matched our patched
  source, proving why inspecting just those files was insufficient.
- Fixed the release Dockerfile to update both locations. Added network-only
  publicUrl integration to the family dispatcher and Blood/Duke scripts, data
  manifest fetch and WASM/data locateFile callbacks. Native `/game` and persistent
  paths remain unchanged. Both root and prefixed adapter suites pass, including
  capture, physical release, blur/cancel, controller/text/scan and persistence.
- New wrapper `lab/deploy/steam/Dockerfile.build-prefix` overlays framework and
  adapters only. Both exact prior 11-layer bases are preserved. Extracted new
  dispatched adapters match source and pass the entire input suite. Context:
  `/tmp/windows96-build-prefix.ua3LW1`. Every extraction helper was removed.
- Exact image identities, old base IDs and adapter hashes are in
  `lab/deploy/steam/build-release.json`. Blood tag
  `local/windows96:blood-prefix-20260907`, local index `4bafdd9df428…`, remote
  config `df5cf37359da…`; Duke tag `local/windows96:duke3d-prefix-20260907`, local
  index `74abb3dd0265…`, remote config `c63efb9b9ab1…`. Full layer arrays agree
  after Docker save/load. Transfer session 43213 completed, no transfer remains.
- Added Trashcan `windows96-game-blood` port28108 and `windows96-game-duke3d`
  port28109, each ->8088. `/blood/` and `/duke3d/` now route through the private
  8097 gateway. Each container is non-root1000, RO root, dropped caps, bounded
  tmpfs/resources, restart=no; only its own data subtree is mounted read-only.
  Both are browser-only engines; no native match was started.
- Nine-route acceptance passes: shared checks plus real Build data availability,
  every required file range, RFF/GRP magic, exact dispatched adapter hashes,
  legacy/dispatched equality, classic/modernized JS/WASM, Blood `.data` packs,
  real served launch parser, worker/PWA prefix isolation. Static server POST
  `/wake` correctly returns405 (not404); test expectation corrected to its actual
  method-rejection contract. Results: `verification-build-20260907.json`.
- Gateway config validated with restricted nginx -t helper and router alone
  recreated because rsync may replace the single-file bind inode. Seven prior
  game containers left intact. Previous config retained as
  `/home/ted/windows96-game-deployment-20260907/nginx.before-build-prefix.conf`.
- Normal local Game Lab `wasm-blood` and `wasm-duke3d` were also recreated from
  these new images, at their original 8007/18007 ports with original data mounts
  and restart policy. Only these two services changed. Lab Compose/contracts now
  name their new releases and explicit integration-overlay receipt; 30-image lab
  validation passes. `verify-build-local.mjs` downloads the actual dispatched
  HTTP files, checks exact release hashes, runs all input contracts, checks live
  image identity/root mode/owner data. Both pass; results saved in
  `verification-build-local-20260907.json`. Old images and owner files retained.
- Browser skill followed; discovery remains empty. No Chrome/tunnel started.
  Actual gameplay/firing/pointer-lock is **not** claimed verified. Steam ready
  list remains empty; its catalog provenance still needs regeneration. Remaining
  32 runtime-backed games, public cutover, old proof cleanup, source runners,
  VM shutdown and all broader Windows-96 product/security work remain active.

## Quake-family prefix and native relay acceptance — 2026-09-07 06:06 UTC

- Added Quake, Quake II, The Reckoning and Ground Zero to the private candidate,
  now **13 runtime-backed routes deployed / 28 pending / 4 unimplemented**.
  Containers `windows96-game-quake`, `windows96-game-quake2`,
  `windows96-game-quake2-xatrix`, `windows96-game-quake2-rogue`, loopback ports
  28110–28113 ->8088. Paths `/quake1/`, `/quake2/`, `/quake2-xatrix/`,
  `/quake2-rogue/`. Only this family's data subdirectory is mounted read-only.
- Source changes: family and native-engine adapters prefix script/manifest/
  WebSocket network URLs using the shared helper. Wake client already applies
  publicUrl centrally. Native `/data` and `/persistent/idtech2/...` paths remain
  unchanged. Quake adapter tests now cover root and prefixes; expansion campaign
  tests assert exact engine/variant/expansion metadata and prefixed relay URLs.
  Both adapter suites pass including existing native-source/config assertions.
- Supervisor now initializes and enforces the locked engine **and expansion**
  before waking/switching. Both HTTP and datagram-WebSocket wake call the guard.
  Wrong-engine and cross-expansion HTTP requests return409; wrong-engine WS
  closes1013 after a test packet without spawning a server. Suite mode remains
  supported. New public status includes the deployment variant. Future full
  source Docker builds require publicUrl in the bundled shared framework.
- Stopped extraction helpers confirmed all four base images' dispatcher,
  Quake/Quake II adapters and supervisor matched pre-edit source. They were
  removed. Wrapper `lab/deploy/steam/Dockerfile.idtech2-prefix` preserves all12
  base layers/native modules/browser engine assets. Context:
  `/tmp/windows96-idtech2-prefix.i3l9Ax`. Exact local and remote IDs, old bases
  and overlay hashes are in `idtech2-release.json`; full layer arrays agree after
  save/load. Transfer session48244 completed; no image transfer remains running.
- Images `local/windows96:quake1-prefix-20260907`, `quake2-prefix-20260907`,
  `quake2-xatrix-prefix-20260907`, `quake2-rogue-prefix-20260907`. Remote config
  IDs respectively `9de07f2e0279…`, `d23bd3fc610a…`, `26363d73f7a8…`,
  `940a8752b908…`; use full IDs from the release receipt and generated Compose.
- Actual native acceptance discovered Docker's default tmpfs is noexec, so
  Yamagi's portable copied `/tmp/.../q2ded` failed Permission denied even though
  all data/assets checks passed. Fixed deployment with ordinary /tmp explicitly
  noexec and a separate `/run/idtech2` tmpfs allowing exec, uid/gid1000 mode0700,
  nosuid/nodev,256MiB, selected by TMPDIR. All games still use RO root, cap-dropALL,
  no-new-privileges,1CPU/1GiB limits and restart=no. Owner data remains read-only.
- New opt-in `verify-idtech2-native.mjs --exercise-private`, run **on Trashcan**,
  verifies exact container/image/private ports/project/RO mounts before testing.
  Starts one native server at a time through the actual prefixed HTTP route;
  sends native protocol status packets through the gateway WebSocket relay;
  verifies returned maps and native process uid1000. Successful maps: Quake dm2,
  Quake II q2dm1, xatrix xswamp, rogue rbase1. Native/relay checks PASS all4.
- The test closes its WebSockets, refuses a restart if another peer/human exists,
  validates container identity again, then restarts that private candidate only.
  Final native state sleeping, no disposable sessions left. Initial failed test
  session8078 and final passing session50213 both ended; no test/game match was
  left running. Results: `verification-idtech2-native-20260907.json`.
- Reran the complete **13-route** gateway verifier after native cleanup; all pass.
  Result `verification-idtech2-20260907.json`. Also reran the lab's 30-image
  validator and both normal Blood/Duke served-byte input suites; all pass.
  Stats taken during owner-data validation showed transient CPU usage; do not
  describe that sample as idle. Destination still has557GiB free.
  A subsequent quiet sample showed0.00% CPU for Quake/xatrix/rogue/Blood/Duke/
  router and0.05% for Quake II; six new game containers use about221MiB combined
  and router3.3MiB. Final stats session92644 completed.
- Gateway config backup `nginx.before-idtech2-prefix.conf` retained on Trashcan;
  nginx-t passed, router alone recreated after config replacement. No public
  proxy change. Local ordinary Quake-family lab services/contracts have **not**
  yet been updated to these new images; only local Blood/Duke changed this turn.
- Browser remains unavailable; no separate Chrome launched. Protocol/native
  acceptance is not browser rendering, pointer-lock, multiplayer movement or
  persistence acceptance. Steam gate stays closed and catalog remains its older
  provenance. No commits/push, old proof cleanup, Picard stops, runner retirement,
  final source freeze/sync, VM shutdown, public TLS/proxy/DNS cutover or further
  Windows-96 app/security changes occurred. Full remaining scope stays active.
- Next useful actions: migrate the remaining28 runtime-backed games using the
  same exact-image/prefix approach (idtech3/Q3/RTCW and static DOSBox families),
  reconcile ordinary lab images/proofs, regenerate Steam provenance, then browser
  acceptance/cutover and the remaining desktop/AIM/Paint/screensaver/VMware work.

## DOS deployment, real game icons and refreshed Steam stage — 2026-09-07 06:38 UTC

Current totals: **22 runtime-backed routes deployed / 19 pending / 4 unimplemented**.
Steam still has 45 entries and zero ready records. Public routing is unchanged.

### DOS source, images and native checks

- Added network-only publicUrl integration to the DOS adapter's manifest,
  script, WASM locateFile and sound/pointer-config requests. DOS filesystem and
  `/persistent/dosbox/{variant}` paths are untouched. Root and prefixed scenarios
  pass for all9 variants, with physical/controller ownership, typing/WASD,
  focus/repeat/cancel coverage and five negative controls.
- Seven original game artworks were downloaded and visually inspected, without
  AI generation or local resizing. Jill's3 episodes share the GOG trilogy icon;
  Jazz/Duke1/Duke2/SimCity use their GOG icons, GTA uses original Steam app12170
  (not Vice City12110), NFS uses the 1994 Road & Track wordmark via Commons.
  Exact URLs and SHA-256 values: `dosbox-wasm/GAME_ICON_PROVENANCE.json` and lab
  `icon-provenance.json`. All9 portal/Steam shortcuts and DOS favicons now use
  these assets. Generic192/512 DOSBox PWA installation icons remain an explicit
  fallback. Old icons are retained; no owner data was deleted.
- `lab/deploy/steam/Dockerfile.dosbox-prefix` packages framework, canonical
  adapter/config/helpers and artwork over seven exact bases, preserving all10
  or11 original layers and the compiled engine bytes. Context:
  `/tmp/windows96-dosbox-prefix.FQ55VN`. All stopped extraction helpers removed.
  Five modern base adapters matched pre-edit source; GTA/NFS/SimCity adapters
  were older and now also gain the already-existing input/focus and sound-config
  repairs. All7 original data manifests matched canonical source.
- Exact local index/config IDs, original base IDs, old/new adapter hashes and
  original JS/WASM/artwork hashes are in `lab/deploy/steam/dosbox-release.json`.
  Image tags: `local/windows96:{dosbox,jazz,duke1,duke2,gta,nfs,simcity2000}-prefix-20260907`.
  Transfer session57857 ended successfully; no image transfer remains.
- Extracted both new payload versions to context `probe-modern` / `probe-legacy`.
  `node dosbox-wasm/scripts/test-native-runtime.js <probe> --adapter-keyboard`
  passes92 native BIOS key cases per version. `--files` passes90KB multipart
  writes,32-bit seek, header backpatch and close/reopen. An initial invocation
  mistakenly combined exclusive `--files --keyboard-only` flags; corrected.
  File-only mode no longer requires the unused diagnostic `_DOSBox_WasmCpuCycles`
  export absent in the modern payload. Other mode assertions are unchanged.
  Native WASM hashes remain70486266d6a7… (modern) and968e799bacb2… (legacy), full
  hashes in receipt. These tests use mocked host canvas/audio; they do **not**
  establish browser rendering or IndexedDB persistence after reload.
- DOS build-web now installs the artwork with source `game-icons/.` into an
  existing destination, avoiding nested directories on repeated builds. Executed
  those install commands twice in a temporary directory: all7 assets byte-match,
  no nesting; test directory removed. Builds also reject a shared framework
  missing publicUrl/readLaunchPreferences, rather than ship an unusable adapter.

### Private Trashcan and normal Game Lab deployment

- Added `windows96-game-{jill1,jill2,jill3,jazz,duke1,duke2,gta,nfs,simcity2000}`,
  loopback28114–28122 ->8088, corresponding same-name public paths. Each exact
  config-pinned container locks its variant/base path, runs uid1000 with RO root,
  cap-dropALL/no-new-privileges,1CPU/1GiB,pids64,restart=no,64MiB noexec tmpfs.
  Only its own `/home/ted/wasm-game-data/dosbox/<variant>` is mounted RO at
  `/data/<variant>`. Engines execute in the browser, not as host/native matches.
- All22 real gateway routes pass after deployment and after Steam activation.
  `verification-dosbox-20260907.json` includes data readiness and required-file
  ranges/magic, locked variants, worker/PWA/isolation/prefix checks, exact adapter
  and full original JS/WASM hashes, actual favicon/game artwork, unsupported DOS
  option rejection and unchanged per-variant persistence paths. Small source
  files clamp ranges; extensionless paths may return canonical launcher HTML,
  never owner bytes. Raw `/data` remains404. Remaining19 routes503,4 entries501.
- Gateway previous config retained as `nginx.before-dosbox-prefix.conf` remotely.
  Restricted nginx-t passed; router alone was recreated after single-file config
  replacement. Prior13 game containers remained intact. No public NPM edit.
- Updated normal lab Compose/contracts for7 DOS services and9 shortcut icons.
  Recreated only dosbox/jazz/duke1/duke2/gta/nfs/simcity2000 with --pull never and
  --no-deps. Ports8016/8020–8025, original RW data mounts and unless-stopped policy
  are unchanged. Old image IDs are retained for rollback in
  `dosbox-local-before-20260907.json`; do not overwrite that before-state receipt.
- `verify-dosbox-local.mjs` checks live image/port/mount/restart identities,
  actual served adapter/config/helper bytes, all9 data-ready variants and icons.
  It runs all9 root plus9 prefixed adapter scenarios against each of7 HTTP-served
  payloads. Allpass; receipt `verification-dosbox-local-20260907.json`.
  Lab `./validate.sh --images` passes45 shortcuts,30 runnable endpoints,
  32 services,30 image contracts and36 inventoried icons. Local id Tech1/Quake
  image reconciliation and superseded proof-container cleanup remain pending.

### Steam catalog and private frontend activation

- `generate-candidate.mjs` now emits `image-contracts.candidate.json`, replacing
  14 service contracts covering22 deployed games without altering unrelated
  normal lab contracts. Steam sync accepts this optional contract document after
  the lab directory. It extracts from exact local image IDs, retains localImageId
  and records portable runtimeConfigId as imageId for the deployment gate.
  Regenerated all30 manifests/45 entries and image-derived test fixtures; all
  stopped helper containers removed. Future migrations must use candidate
  contracts, not accidentally restore old baseline catalog provenance.
- Windows96 `npm test`:36 passed,1 native AIM socket skip;135 component page
  combinations and112 actual profile/default parser round trips covered. New
  tests enforce all9 DOS game icons and prevent Telegram integration returning.
  Production webpack build passes; the old full TypeScript toolchain remains
  unresolved, not silently counted as passing.
- Fresh build `/tmp/windows96-steam-dosbox.RIw6gi/dist` uploaded to private
  `/home/ted/.local/state/windows96-retirement-20260907/steam-dosbox-build`.
  Scanned24 text assets against the four actual active credentials:zero matches;
  candidate private env0600, no Telegram variables. Before activation, all22
  catalog identities matched actual running images and raw manifest bytes.
- Activated only candidate `dist/` at06:34 UTC; previous dist retained outside
  served roots in the same private state directory as
  `candidate-before-dosbox-steam-dist`. Candidate container/app-data unchanged;
  bind of whole app exposes the new frontend without restart. The candidate's
  frontend source is **still older**; this remains frontend-only staging.
- HTTP root/catalog45/ready0 verified, then full22-route verifier rechecked each
  catalog image ID against its route and each manifest SHA against served bytes.
  All9 DOS Steam icons also byte-match their runtime artworks. Separate receipt
  `verification-steam-stage-20260907.json` compares live container image/port and
  raw on-disk manifest bytes to Steam provenance for all22. Both receipts copied
  locally; public site/production desktop shortcuts remain unchanged.
- Browser skill used, but discovery still returns[]; no separate Chrome/tunnel
  was launched. No visual gameplay, capture or reload-persistence claim. Browser
  acceptance remains required before adding any Steam ready record.
- Rechecked private env files: Prod and Trashcan have all4 required active
  credentials,0600,no Telegram keys. Dev remains the earlier minimal OpenAI-only
  env,0600,no Telegram keys; it did not receive the later public-server hardening
  and its public proxy is disabled. An overly broad four-key assertion initially
  failed on Dev; inspected presence without printing values and confirmed this
  expected older state. Do not copy production secrets into retired Dev merely
  to satisfy that assertion. Historical private backups/Git objects still retain
  old secrets; the owner deferred rotation, and no history rewrite was attempted.
- Final quiet Trashcan sample:22 game containers about625MiB combined, router
  3.3MiB,desktop110MiB. All sampled0.00% CPU except QuakeII0.01%;557GiB remains
  free. No build/native-test/image-transfer subprocess remains from this tranche.
- Final workstation audit also found an **older automation helper** PID3283697,
  started22:50 UTC, parent node_repl PID100941, running the app's cua_node trusted
  worker. It held3.3GiB RSS and a fresh2-second sample measured188.3% CPU. This
  was not a game container or standalone Chrome. Browser troubleshooting guidance
  was read; discovery still[]. Used the supported js_reset **solely to terminate
  this resource-consuming owned helper**, not as a browser-discovery retry. PID
  3283697 is now absent. No user browser/container was stopped and no runtime was
  reinitialized afterward. All previous JavaScript/browser bindings are cleared;
  future browser work starts with one fresh skill bootstrap. Do not assume an
  old `agent` or `browser` binding still exists.

Next: remaining19 runtime-backed games (Wolf/Spear2; Q3/RTCW SP/RTCW MP/WolfET4;
Doom3-family/Quake4/Prey6; GoldSrc4; HL2,CoD2MP,OpenRCT2), then browser acceptance
and gated public cutover. Preserve Wolf/Spear persistence WIP and the deferred
Blood crash. All broader Windows96/AIM/Paint/screensaver/VMware, remaining security,
runner/root-cron audit, final freeze/sync, games-dev DNS cleanup, old Picard stops
and Bang VM shutdown remain active. No source commit/push occurred. The goal is
not complete or blocked; source VMs and old Picard games are still running.

## Quake III / RTCW prefix deployment and native acceptance — 2026-09-07 07:16 UTC

Current totals: **25 runtime-backed routes deployed / 16 pending / 4 unimplemented**.
Steam has45 entries and zero ready records. Public routing/source VMs unchanged.
Previous goal turn was progress; this turn deployed3 more games and reconciled
their normal local Game Lab services. The complete portfolio/product/security/
VM-retirement scope remains active, not reduced to these passing checks.

### Source and exact image packaging

- Extracted the current exact Quake III, RTCW SP, RTCW MP and WolfET images with
  stopped helper containers; removed all helpers afterward. Context:
  `/tmp/windows96-idtech3-prefix-6v4vc5`. Q3 and RTCW adapters matched source;
  both multiplayer supervisors matched committed source before edits. WolfET
  adapter/client are older than source (client reference19 versus26); its server
  index/dedicated sources match. WolfET has **not** been repackaged or deployed.
- Q3 adapter now prefixes script/manifest/QVM network requests and supplies a
  same-origin WS/WSS endpoint. Its historical compiled client had a hard-coded
  `ws://host:port` connection without URL path support. New canonical
  `games/quake3/scripts/public-websocket.js` patches exactly that declaration,
  preserving native/server fallback. Reversing that replacement yields the old
  client bytes exactly: no compiled renderer/game change. The normal full rewrite
  script calls this seam too and fails on missing/duplicate/already-patched seams.
- RTCW adapter prefixes its scripts/WASM/menu packs/QVMs/manifest/WebSocket
  URLs. Native `/game` and distinct `/persistent/rtcw-sp` / `rtcw-mp` roots remain
  unchanged. All RTCW browser JS/WASM, QVMs and menu packs in both images match
  the previous images byte-for-byte. SP remains GL4ES; MP keeps its existing
  lightmap/array-state repair. No engine rebuild was performed.
- Q3 supervisor accepts Q3_RUNTIME_ROOT for its private NODEFS PAK copies.
  Q3 and RTCW MP status now report exact variant and live relay-peer counts;
  RTCW config returns its prefixed wsPath. These counts guard native test cleanup.
  Added shared API checks to Q3/RTCW MP source Dockerfiles for future packaging.
- Wrappers `lab/deploy/steam/Dockerfile.quake3-prefix` and
  `Dockerfile.rtcw-prefix` preserve15/10/15 base layers. Exact IDs and browser
  payload hashes: `idtech3-release.json`. Final tags:
  `local/windows96:quake3-prefix-20260907`, `rtcw-sp-prefix-20260907`,
  `rtcw-mp-prefix-20260907`. Portable config IDs respectively
  `be30b5644626…`, `d50e74dda1ed…`, `1ec1fb8d5d17…`; use the full receipt values.
- A second Q3/MP package added peer counts before native testing. All layers
  except the supervisor layer match the first wrapper images, verified against
  the retained remote image IDs. The local containerd index for the untagged
  intermediate image was no longer inspectable, so it was not assumed present.
  The initial receipt-refresh command failed; corrected using the authoritative
  remote old image and fail-fast shell sequencing. Intermediate before-state is
  retained in the context and receipt. Final image transfer session77243 ended.

### Tests and deployment

- Adapter tests cover root HTTP and prefixed HTTPS URLs, exact engine assets,
  WS/WSS path generation, unchanged native save paths, Q3 join/error/retry state,
  RTCW delayed resume/capture and backend-specific renderer arguments. They also
  accept an explicit downloaded adapter path for actual served-byte testing.
  Transport seam tests cover browser configuration and unchanged native fallback.
- The family's default npm test correctly refuses the modified framework under
  its old immutable baseline lock. Created a clean shared local comparison clone
  at `/tmp/idtech3-framework-lock.w8r15D`; full family suite passes with
  `WASM_GAME_FRAMEWORK_DIR` set to that path. Corrected a test that unnecessarily
  required the directory name to contain wasm-game-framework; it now validates
  package identity. Baseline-lock assertions were not bypassed. The **actual
  modified framework's entire npm test also passes separately**, including real
  stripped-prefix server tests. Full source rebuild pins still need the controlled
  framework/source release; this overlay is explicitly recorded in image contracts.
- RTCW96-case native lightmap-state fixture/16 emitted draw routes pass and reject
  the old code. The family suite also passes all28 WolfET source regression tests;
  those results do not establish that the older shipped WolfET client is current.
- Added private `windows96-game-quake3`, `windows96-game-rtcw-sp`,
  `windows96-game-rtcw-mp`, loopback28123–28125 ->8088, paths `/quake3/`, `/rtcw/`,
  `/rtcw-mp/`. Exact names/ports were checked unused. Owner family data mounted RO;
  uid1000, RO root, dropped caps, no-new-privileges,1CPU and restart=no throughout.
- Quake III uses a768MiB noexec uid1000/mode0700 `/run/quake3` tmpfs and1536MiB
  total memory limit: its NODEFS runtime needs actual copies of the483MiB PAK set,
  not absolute symlinks escaping that virtual mount. RTCW MP uses a128MiB private
  executable `/run/rtcw` tmpfs for its copied/dlopen'd native game module,1GiB
  total memory. Both retain ordinary noexec64MiB /tmp. SP is browser-only,1GiB.
- Nginx -t passed; router alone recreated after file-bind replacement. Previous
  config retained remotely as `nginx.before-idtech3-prefix.conf`. No old22 game
  services were replaced. The two newly created multiplayer wrappers were updated
  once for peer counts only after confirming sleeping/no humans/no prior upgrades.
- New opt-in `verify-idtech3-native.mjs --exercise-private`, run on Trashcan,
  validates exact private image/project/port/mount/restart identities before wake.
  Real QuakeJS dedicated q3dm11 and ioRTCW mp_depot getstatus replies arrived
  through the prefixed WebSocket gateway. Both dedicated runtimes verified uid1000.
  The test closes its socket, refuses cleanup with other peers/humans, revalidates
  container identity, restarts only that candidate and checks its runtime empty.
  Both finish sleeping, zero humans/peers/bots. Receipt:
  `verification-idtech3-native-20260907.json` (successful session46589 ended).
- Initial native test session69016 got both real server replies but its argv[0]-
  only RTCW process probe did not recognize the running engine; teardown still
  returned both servers to sleeping. Probe now uses kernel command/executable
  identity as well and verifies uid1000. No renderer or native engine change was
  made to get that test to pass. QuakeIII's first run returned q3dm6, finalq3dm11.
- Combined25-route acceptance passes, with complete Q3/RTCW engine/QVM/menu
  hashes, native headers, data ranges, isolation, worker/PWA scope, actual served
  launch parser and catalog provenance. QuakeIII's standalone provisioning policy
  reports variant `default` inside namespace `quake3`; corrected a verifier that
  incorrectly assumed every policy was a multi-variant collection. Its launcher
  remains locked to quake3. Receipt `verification-idtech3-20260907.json` copied
  locally along with the native receipt.16 pending routes503,4 unimplemented501.
- Updated only normal local wasm-quake3/wasm-rtcw-sp/wasm-rtcw-mp to these images.
  Confirmed original exact baselines and sleeping multiplayer servers first.
  Preserved ports8083/8085/18085, original RW data mounts and restart policies.
  `idtech3-local-before-20260907.json` retains before-state; source images/data
  remain available. `verify-idtech3-local.mjs` passes actual HTTP adapter tests,
  all payload hashes, data readiness and unchanged deployment metadata. Result:
  `verification-idtech3-local-20260907.json`. No other normal lab services changed.

### Steam stage, resource cleanup and next work

- Candidate contracts now override17 services covering25 games. Regenerated all
  30 exact-image manifests/45 Steam entries. Tests remain36 passed/1 native AIM
  skip. Only image provenance changed, not options or frontend component code;
  updated candidate `dist/steam/library.json` atomically without rebuilding JS.
  Previous catalog retained outside served roots at
  `/home/ted/.local/state/windows96-retirement-20260907/candidate-steam-library-before-idtech3.json`.
  Staged JSON has zero matches to the four actual active credentials.
- Fresh25-entry live container/config/raw-manifest comparison passes; receipt
  `verification-steam-idtech3-stage-20260907.json`.45 catalog entries,ready0.
  Candidate frontend source remains older; authoritative current Steam source
  is in the local Windows96 worktree. Do not rebuild from the candidate old src.
- Browser skill fully read and one fresh bootstrap attempted following the prior
  resource cleanup. getForUrl reported no browser; troubleshooting guidance read,
  discovery[]. `agent` is now initialized but no browser binding exists. Reuse it
  on later discovery; do not repeatedly bootstrap/reset. No standalone Chrome or
  SSH tunnel started. Fresh automation helpers are about63/134MiB RSS at0.1/0.2%
  lifetime CPU, not the previous3.3GiB/188% runaway session.
- Final quiet new-game sample: Q334.1MiB/0.00%, RTCW SP18.1MiB/0.00%, RTCW MP
  56.0MiB/0.04%, router3.3MiB/0.00%. No native match, image transfer or test process
  remains. Browser rendering/capture/persistence and public TLS acceptance are
  still unverified; do not enable ready records from protocol checks alone.
- All source remains uncommitted/unpushed. No public proxy edit, Picard game stop,
  Bang VM shutdown, runner retirement, final data freeze/sync or additional
  desktop/AIM/Paint/screensaver/VMware/security changes occurred in this tranche.

Next useful work: WolfET's custom server/browser integration (old image extracted
and differences identified), then the remaining15 other runtime-backed games:
Wolf/Spear2, id Tech4 family6, GoldSrc4, HL2, CoD2MP and OpenRCT2. Also finish
ordinary id Tech1/2 lab reconciliation and superseded proof-container cleanup.
Keep the full GOAL-SCOPE.md acceptance requirements intact; migration/VM shutdown
and Windows96 product/security work are still required, not optional follow-ups.

## Telegram retirement recheck — 2026-09-07 07:31 UTC

Reconfirmed the user's instruction to remove Telegram entirely, not migrate it.
Read-only checks found no Telegram references in maintained runtime/deployment
files on Prod (23 files), Dev (18 files), or the Trashcan candidate (21 files).
All three private runtime environment files remain mode0600 with zero Telegram
keys and the existing OpenAI key still configured. Both VMs' running Windows96
processes and Prod's music importer have no Telegram environment keys; all are
online. The Trashcan candidate is running with no Telegram container environment
keys. No credentials or environment values were printed.

Local deployment/private-env tests pass9/9 and the Telegram retirement regression
passes1/1. This recheck made no service changes, sent no Telegram API requests,
and did not rotate/revoke credentials. Historical Git objects and private original
backups are still retained; removal from active code is not Git-history cleanup.
The broader migration/security/product goal remains unfinished.

## WolfET rebuild and isolated runtime proof — 2026-09-07 08:06 UTC

The prior Telegram-only recheck did not advance the remaining deployment work.
This continuation made concrete build/runtime progress. Counts remain **25 private
routes deployed /16 runtime-backed games pending /4 unimplemented /Steam ready0**.
WolfET now has a repaired, locally verified replacement image, but its Trashcan
service, gateway route, Steam image contract and normal local Lab replacement are
not activated yet. Do not count an image import as a deployed game.

Build repairs and actual artifacts:

- The deleted `theodorecharles/etlegacy` fork broke source preparation. The exact
  locked commit `a44ab4f396370a694109da33df901d85f6fe9626` was confirmed in official
  `etlegacy/etlegacy`; setup and family lock now use that URL without changing the
  revision or any of the five engine patches.
- The source-only workspace was missing `third_party/minizip` and `cjson`, despite
  its Dockerfile requiring them. `setup-web-deps.sh` now fetches immutable zlib
  v1.3.1 commit `51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf` and cJSON v1.7.19 commit
  `c859b25da02955fef659d658b8f324b5cde87be3`, retains their licenses, and refuses to
  overwrite differing existing vendor files. Docker stages consume those sources.
- Both the current browser engine and matching native qagame module built
  successfully in separate uid1000 containers, each capped at1CPU. Build scripts
  default to2 jobs and bound Emscripten/Binaryen parallelism. The source checkout
  and compiled outputs are `/tmp/windows96-wolfet-current.D1TFMW/wolfet-wasm`.
- New WASM is2,909,315bytes, SHA256
  `c1c5101947f0ad0c3824d73cc1ae7444f925bcf9dc34b437a47b7f68928d8c15`.
  New JS is235,029bytes, SHA256
  `17b32b471953898e93ec537597c028c13e2f14febc4fcbefaad4f30a93050367`.
  `verify-web-client.js` validates WASM, JS syntax and nine JS-to-WASM export
  mappings without starting an engine. It requires console/UI/config-save cvars;
  the old shipped image fails because its engine lacks `etjs_console`,
  `etjs_eth32save` and `cl_aimbotmenu`. Dropping only the new adapter over that old
  WASM would not have repaired the full integration.

Integration/security changes:

- Loader/client network URLs now use the shared public-path helper: dependencies,
  config, wake/admin/diagnostics, menus, PK3s, JS/WASM and WS/WSS. Native `/etmain`,
  `/legacy` and persistence filesystem paths remain unchanged. Asset metadata URLs
  must match their exact parent/name, including when prefixed.
- Extracted generic `server/pwa.js` in wasm-game-framework so WolfET can use the
  same manifest/worker implementation. Documents, config globals, icons, worker
  scopes and cache retirement respect the public path and do not evict siblings.
  The unchanged0.9.6 source lock still predates these uncommitted framework APIs;
  a controlled framework release/pin update remains necessary before claiming the
  normal locked source-only build is reproducible end-to-end. The candidate
  wrapper explicitly stages the actual modified framework and records its bytes.
- HTTP no longer exposes entire native runtime directories. Registered PK3s and
  seven browser menu files are allowed; native modules, server configs, logs,
  sessions, traversal and out-of-root symlinks are denied. Encoded paths cannot
  bypass the password gate. Missing assets return404, not launcher HTML. Range,
  suffix/HEAD and aborted-stream handling are covered. Forwarded requests with
  trust disabled do not gain local admin authority.
- WebSocket payloads are binary-only and bounded to a UDP datagram; oversized or
  text frames cannot wake a server. Pending wake completion after disconnect
  cannot resurrect/send into a closed UDP connection.
- The read-only-root image bakes the application-owned Omni-Bot config. Startup
  skips rewriting identical bytes. Native data still needs a **writable WolfET
  data mount** for configs/session/XP state and the application-owned PK3/module
  refresh; do not blindly copy other families' fully read-only data policy.
- Actual native startup exposed the stock executable's32-console-line limit:
  the last `+set` was appended to `g_friendlyFire`. Final post-map settings now
  execute from generated `runtime/etmain/etjs_postmap.cfg`, keeping launch
  arguments below the limit. The HTTP asset allowlist does not expose this file.

Image/package evidence in wasm-game-lab `deploy/steam/`:

- `Dockerfile.wolfet-prefix`, `prepare-wolfet-prefix.mjs`,
  `wolfet-build-receipt.json`, `verify-wolfet-image.mjs`,
  `verification-wolfet-image-20260907.json`.
- Tag `local/windows96:wolfet-prefix-20260907`;
  local index/image ID
  `sha256:e6fb78b62b1350122ce8e021f88735da97562c32f19b25cf6384588d9f64ce5a`;
  portable config ID
  `sha256:60d9741415e70f3eff86d70580401b26e9f5569df502aec24b5edef8d34b621a`
  confirmed from Docker-save manifest.json. All23 old base layers are preserved.
  The final context is `/tmp/windows96-wolfet-current.D1TFMW/context-postmap`;
  its71-file inventory excludes owner archives, runtime passwords/logs and saves.
- HTTP served both adapters and both compiled engine files with exact receipt
  hashes. Under uid1000, cap-dropALL, no-new-privileges, read-only root,1CPU,
  1536MiB and a private loopback port, the real dedicated server woke on
  `fueldump`, returned a real WebSocket status/map response, and reported actual
  cvars arcade1/speed400/friendlyFire0/forcedRespawn1. It then idled to sleeping
  with0 humans/peers using a10s test timeout. The test used a disposable copy of
  five SHA-verified official archives; original owner files were untouched.
- This is not browser gameplay or full bot-fill acceptance. The packet proof
  used the image's internal `/ws`; the actual Trashcan-prefixed gateway still
  needs its own protocol test. No rendering/capture/IDBFS-reload claim was made.
- 7 prefix/transport tests pass (root, `/wolfet/`, nested prefix, actual HTTP
  auth/assets/ranges/boundaries and real bounded UDP/WS transport).58 existing
  browser/input/structural tests pass in the prepared tree with copied official
  pak0/music fixtures.6 lifecycle/startup-limit tests pass. Modified framework
  full suite passes; the full idtech3 suite passes with the pristine comparison
  framework `/tmp/idtech3-framework-lock.w8r15D` for its existing lock guard.
- Initial native proof failed because the verifier's embedded regexp was
  incorrectly escaped, not because the native server failed. Fixed with
  `String.raw` and executable/uid verification; final repeated proof passes.
  Diagnostic stdout/stderr are captured privately and RCON-redacted on failure.
- All three task build/test containers are removed. Compiled files, logs,
  acceptance data and rollback images remain; there is no native match or build
  process left. Acceptance data contains a locally generated RCON password:
  never publish `/tmp/windows96-wolfet-current.D1TFMW` wholesale.

Image transfer/import to Trashcan completed. A fresh remote Docker inspection
confirmed config/image ID `60d9741415e70f3eff86d70580401b26e9f5569df502aec24b5edef8d34b621a`,
uid1000 and31 total layers. No WolfET service or route was started there. There
are no outstanding tool sessions from this tranche.

Next: preserve the copied WolfET project-owned runtime files before refresh,
deploy only its private loopback service (planned28126), extend
the route/contracts/verifiers for this custom server, and test real prefixed
native behavior before counting it as deployed. Verify bot-fill as well as idle
shutdown. Then refresh Steam's actual image-derived contract and staged catalog,
and reconcile the normal local WolfET service without discarding its data or
changing unrelated services. Browser acceptance and all15 other pending runtimes,
ordinary id Tech1/2 Lab reconciliation, old proof cleanup, public cutover,
VM retirement and the full Windows96 app/security scope remain required.

## WolfET activated on Trashcan and normal Game Lab — 2026-09-07 08:28 UTC

This supersedes the preceding WolfET image-only checkpoint. Current counts are
**26 deployed private game routes,15 pending runtime-backed games, four
unimplemented entries, Steam ready0**. Public cutover has not happened; neither
Bang VM nor the old Picard games was shut down in this tranche. No GitHub push,
credential rotation or browser launch occurred.

Deployment and provenance:

- `windows96-game-wolfet` now runs on Trashcan loopback28126 behind `/wolfet/`.
  Portable image/config ID remains
  `sha256:60d9741415e70f3eff86d70580401b26e9f5569df502aec24b5edef8d34b621a`;
  local index/image ID remains
  `sha256:e6fb78b62b1350122ce8e021f88735da97562c32f19b25cf6384588d9f64ce5a`.
  No image rebuild was needed in this tranche.
- Lab `deploy/steam/idtech3-release.json` now includes WolfET, with exact adapter,
  client, compiled JS/WASM and manifest hashes from the71-file build receipt.
  `generate-candidate.mjs` generates26 services plus the private router and45
  explicit routes. Its candidate contract overrides18 normal service contracts.
- WolfET has a read-only root, uid/gid1000, dropped capabilities,
  no-new-privileges,1CPU,1536MiB,pids128 and64MiB non-executable `/tmp`. Only its
  own `/home/ted/wasm-game-data/wolfet:/data` is writable for RCON/config/session/XP
  state and project-owned module/PK3 refresh. No UDP port is published on Trashcan.
  `ETJS_TRUST_PROXY=0`,12slots,arcade mode,Omni-Bot enabled,keepAlivefalse,5m idle.
- Before activation, the entire39-file,549,250,760-byte remote tree was copied
  and SHA-verified under
  `/home/ted/.local/state/windows96-retirement-20260907/wolfet-before-activation/data`.
  It had no symlinks and every entry belonged to uid1000. Source data is retained.
- Previous remote Nginx/Compose/routes/contracts/release/catalog are preserved
  under the private `.../windows96-retirement-20260907/wolfet-config-before/`.
  The updated Nginx config passed `nginx -t`; the router alone was recreated
  because its single-file bind would otherwise keep the old replaced inode.
- Steam extraction inspected the30 local image manifests using stopped helper
  containers, which were removed. The45-entry catalog was tested and atomically
  installed into the existing private frontend dist; all26 replacement config
  IDs and actual raw/served manifest hashes match. No ready record was enabled.
  Do not rebuild the candidate frontend from its older remote source tree.

Actual verification, not browser gameplay:

- `verify-candidate.mjs` now handles WolfET's real custom server contract:
  sleeping status without a fabricated bots field, variantwolfet and
  namespacewolfet-official, PK3 magic arrays with offsets, `/client/etjs` engine
  paths, prefixed asset URLs with unchanged native `/etmain`/`/legacy` parents,
  no proxy-admin authority and private runtime files inaccessible over HTTP.
  Its first run caught an incorrect verifier assumption about slashless native
  parents; corrected against the actual native filesystem contract. All26 routes
  now pass assets, data, bounded ranges, PWA scopes, launch parser and hashes.
- New opt-in `verify-wolfet-native.mjs` checks exact private container/image,
  project, mounts, loopback port and isolation before starting anything. Actual
  native Goldrush reached12bots/0humans, returned a getstatus packet through
  `/wolfet/ws`, and ran `/legacy/server/etlded` as uid1000. Direct in-container
  RCON queries returned arcade1/speed400/friendlyFire0/forcedRespawn1; the password
  was never printed or published. Text frames close1003, oversized frames1009,
  and SOCKFS port announcements cannot wake the sleeping match.
- After closing its socket and checking zero humans/peers, the verifier restarted
  only the same private WolfET container. Final state sleeping,0humans,0peers.
  This is an explicit test cleanup, not a claim that the deployed5m idle timer
  elapsed; the prior isolated10s idle-shutdown proof remains the automatic-idle
  evidence. Human-join bot replacement, rendering, capture and browser reload
  persistence are not verified.
- New read-only `verify-steam-images.mjs` compares all26 actual running container
  IDs/configurations, raw image-mounted manifests and served manifests to the
  staged catalog. All match, with ready0. Windows96 `npm test`:36passed,1native
  AIM socket test skipped. Lab `./validate.sh --images`:45shortcuts,30runnable
  endpoints,32services,30image contracts,36icons pass. All three repo diff checks
  pass. No standalone Chrome or browser automation was started.

Normal local Game Lab reconciliation:

- `wasm-wolfet` now uses the same rebuilt image at normal root URL8088. Original
  loopback HTTP8088/UDP27960, `/data` bind, both inherited anonymous volumes and
  `unless-stopped` restart policy are verified unchanged. Added non-root,
  read-only-root, cap-drop/no-new-privileges and the same bounded resources.
- The old instance was sleeping/0humans before stopping it. Its original runtime
  files were root-owned. A narrowly mounted, network-disabled, temporary Docker
  helper copied all39files/549,250,760bytes into
  `/home/ted/.local/state/windows-96-migration-20260907/wolfet-local-before-activation/data`,
  recorded original uid/gid/modes in private `metadata.json`, checked every SHA,
  then changed only this WolfET tree to uid/gid1000 without changing file bytes.
  This avoided needing a root runtime. The helper and its disposable volumes
  were removed automatically. The old image and all owner data/rollback copies
  are retained. Ownership can be restored from that private inventory if needed.
- `wolfet-local-before-20260907.json` records only sanitized container/mount/port
  rollback metadata, not environment secrets. `verify-wolfet-local.mjs` verifies
  actual served adapters and rebuilt compiled JS/WASM; the export/cvar verifier
  validates syntax/WASM and all nine mappings without instantiating the game.
  All six data assets are valid, root URL configuration is correct, proxy admin
  stays denied and native state is sleeping. The old inherited OCI source label
  is now explicitly a base revision in the normal contract, not a false claim
  that the newly built overlay comes from that old source revision.
- Final sampled usage: local19.68MiB/0.02%CPU, Trashcan19.09MiB/0.00%CPU. No native
  match, migration helper, compiler or transient test container remains running.

New durable receipts in Lab `deploy/steam/`, also copied to Trashcan's
`/home/ted/windows96-game-deployment-20260907/`:

- `verification-wolfet-20260907.json` (all26 HTTP routes)
- `verification-wolfet-native-20260907.json` (actual12bot native match/transport)
- `verification-wolfet-local-20260907.json` (normal Lab actual served bytes)
- `verification-steam-wolfet-stage-20260907.json` (all26 image/catalog links)
- Updated `wolfet-build-receipt.json` records activation, not only import.

Next concrete tranche: inspect Wolf3D/Spear's current launcher/server/build and
preserve their existing configuration-persistence recovery work; add real prefix
and launch-option support, test source/actual image contracts, then deploy their
two private routes and update Steam. Other pending runtimes: six idTech4 entries
(Doom3/MP/ROE,Quake4/MP,Prey), four GoldSrc entries,HalfLife2,CoD2MP,OpenRCT2.
Ordinary idTech1/2 Lab image reconciliation and old proof-container cleanup remain.
The framework0.9.6 lock still predates the staged helper changes and needs a
controlled release/pin update; do not claim a clean source-only pinned rebuild.
Keep browser acceptance, Windows96/AIM/Paint/screensavers/v86 correctness/security,
final source-write freeze/delta sync, old runner/cron retirement, trustedproxy/TLS,
NPM/DNS/public cutover and safe VM/Picard shutdown in scope. The two WolfET data
trees now have independent generated runtime state; do not blindly overwrite
post-copy writes with the old full-data sync. Telegram remains retired; other
credentials stay in private environment files and rotation is owner-deferred.

## Wolf3D / Spear rebuilt and deployed — 2026-09-07 08:53 UTC

Concrete progress this tranche: both games now run privately on Trashcan and on
their normal local Lab ports using freshly rebuilt config/prefix images. Current
count is **28 deployed,13 pending runtime-backed, four unimplemented, ready0**.
The public site remains on the old production VM. No VM/Picard shutdown, public
cutover, push, key rotation or browser launch happened.

Source and build state:

- The preserved config WIP was already applied inside ignored
  `wolf3d-wasm/.work/wolf4sdl` but was absent from the canonical six-patch series.
  Promoted it byte-for-byte as `patches/browser-config-persistence.patch`; the
  original `proofs/CONFIG-PERSISTENCE-WIP-2026-09-06.patch` is retained unchanged.
  Added eighth `browser-config-record-validation.patch` for truncated config
  preflight and stale-tail truncation. Source reconstructions match13 files;
  all nine preparation prefixes, repeat runs, local notes and overlapping-edit
  refusal pass. No user work was discarded.
- Config writes now happen at nine accepted native menu changes. The appended
  version marker distinguishes intended WASD/custom directions from the old
  unversioned double-bound WASD defaults. Explicit key bindings take precedence
  over fallback browser movement. New host UBSan tests use the actual native
  read/write/menu-save/movement functions, packed record types and real SDK key
  constants with temporary POSIX files:24cases per variant pass. Old unconditional
  direction reset fails3; omitted menu saves fails6. Structural menu wiring is
  checked, not browser/native-UI interaction. Full browser durability is open.
- Adapter policy/script/WASM URLs use `ctx.framework.publicUrl`; native `/game`
  and `/persistent/wolf4sdl/{variant}` are unchanged. Current Steam controls
  remain fullscreen-only, with no invented renderer/player/controller setting.
- Complete compiler/test workflow passes on SDK6.0.6,1CPU/4GiB,uid1000,networknone.
  The clean native build used the pristine pinned framework at
  `/tmp/idtech3-framework-lock.w8r15D`; packaging explicitly stages the current
  modified framework. Its older source lock is not proof of that newer overlay.
  Current normal source-only builders still need a controlled framework release/
  pin update. Do not claim this prerequisite is resolved.
- Build root `/tmp/windows96-wolf4sdl-current.MNQ9qy` retains source, copied cache,
  `dist-before`, freshly compiled `dist`, final `context-current`, logs and
  `images.tar`. The first `context` is incomplete; never use it. Copying the old
  source hit an unreadable Git promisor marker, but all actual source files and
  exact commit/patch reconstruction were subsequently verified in the build.
- Initial build attempts stopped on read-only SDK cache and non-executable
  temporary native-fixture storage. The final build mounts the task-owned cache
  at the SDK's actual cache path and explicitly permits executable test fixtures
  in bounded `/tmp`. Full `test-web.sh` then passes. All build containers exited
  and were removed; these were tooling fixes, not bypassed failing game tests.
- Existing menu40/movement28/menu-key12/palette44web+39desktop/input81 per browser
  and SDK variant+73desktop/binding161 per variant still pass, with old-behavior
  negative controls. Both installed images pass16 site hashes/four effective-shell
  hashes, valid distinct WASM and root HTTP/PWA/range/private-data tests.

Exact deployed identities:

- Wolf3D tag `local/windows96:wolf3d-prefix-20260907`, local index
  `sha256:3b04a40de1596cd34235d59f619bf23449db0594251d4bf52e22c59a3235e94e`,
  portable config `sha256:b019836f06168ae45218555bd20221225a8873b3f71420fea4eaf8348f773212`.
- Spear tag `local/windows96:spear-prefix-20260907`, local index
  `sha256:175854f469ed947afbb60b16004cd027540af81ff2bce2adaf1e6a90a01ae7ae`,
  portable config `sha256:b5f80b6730be6e4a8ceb1d72edbbf0d9749a3352eceaa65c090e46cd0f92bedf`.
- Both preserve their10 base layers and add5 overlay layers. Portable config
  hashes are confirmed from Docker-save manifest/config bytes and remote Docker
  inspection, not inferred from local index IDs. Release and30-file build
  receipts live in Lab `deploy/steam/wolf4sdl-{release,build-receipt}.json`.
- Native hashes: Wolf WASM
  `ec31b0b55523201f67f7413b2331b8f7893e1b52913216bef4598d5b161d1523`,
  Spear WASM `6c0c707fe7e91b50f498d5d6b38607d0a94eec362f4a61a12460c5fe3785356d`.

Deployment and verification:

- Trashcan `windows96-game-wolf3d`28127`/wolf3d/` and
  `windows96-game-spear`28128`/spear/`, locked variants, loopback-only,
  uid1000/read-only-root/capdropALL/no-new-privileges,1CPU/512MiB,pids64,
  non-executable64MiB `/tmp`; owner-data binds are read-only. Both are browser-only
  engines, so no native server is awakened by their static HTTP service.
- Remote source tree contains18files/5,259,528bytes,uid1000,no symlinks. All eight
  required files per route validate. Cross-variant file keys, raw owner paths and
  native wake endpoints are rejected. Original normal local ports8011/8012,
  bind/anonymous volumes and restart policies are verified unchanged, as are
  all18 original owner SHA256s. The normal services now also have non-root and
  read-only-root/capability/resource isolation.
- Previous remote Nginx/Compose/routes/contracts/catalog are private under
  `/home/ted/.local/state/windows96-retirement-20260907/wolf4sdl-config-before/`.
  Nginx-t passes; only the single-file-bind router was recreated. Steam's tested
  catalog was installed atomically. It has45 entries and all28 actual running
  image/config and raw/served manifest links pass. Candidate ready remains0.
- Receipts: `verification-wolf4sdl-20260907.json` (all28 routes),
  `verification-steam-wolf4sdl-stage-20260907.json`,
  `verification-wolf4sdl-local-20260907.json`,
  `verification-wolf4sdl-config-native-20260907.json`,
  `verification-wolf3d-image-20260907.json`, `verification-spear-image-20260907.json`.
  Scripts, receipts and deployment contracts are copied to the remote deployment
  directory. Normal rollback metadata is `wolf4sdl-local-before-20260907.json`.
- Source and actual-served adapter tests cover both variants at root, single and
  nested prefixes without running a browser engine. Windows96 npm tests36pass/
  1nativeAIMskip; Lab image validation45shortcuts/30endpoints/32services/30contracts/
  36icons passes. Browser skill selection for local8011 returned no browser and
  discovery[] at08:53UTC. Existing `agent` was reused; no reset or alternative
  automation process was launched. Visual/capture/fullscreen/IndexedDB reload
  and full save/reload/load acceptance remain open; previous capture errors are
  not claimed fixed by these changes.
- Final sampled services: normal Wolf16.39MiB/Spear17.45MiB, remote14.3/14.34MiB,
  all0.00%CPU. No compiler or temporary HTTP/image verification container remains.

Next: the13 remaining runtime-backed entries are six idTech4 (Doom3/MP/ROE,
Quake4/MP,Prey), four GoldSrc,HalfLife2,CoD2MP,OpenRCT2. Start with the shared
idTech4 integration so its six entries get real prefix/WebSocket/launch settings,
using the existing source tests and copied owner data. Also retain framework pin
repair, old-proof cleanup, normal idTech1/2 reconciliation, Windows96 app/AIM/
Paint/screensaver/v86 correctness/security, final write-frozen data delta,
runner/cron inventory, trustedproxy/TLS/NPM/DNS cutover and safe source retirement.
This checkpoint does not narrow the expanded scope or mark the goal complete.

## id Tech 4 deployment checkpoint — 2026-09-07 09:28 UTC

This goal turn made deployment progress after the narrow Telegram-only recheck:
six more runtime-backed games are deployed and verified privately, and their
normal local Game Lab services now use the actual current repaired images.
Totals are34 deployed,7 pending runtime-backed and4 unimplemented (45 catalog
entries). Steam ready remains0. No public cutover, VM shutdown, Picard container
retirement or Git push occurred; all broader scope remains active.

| Service / public path | Trashcan loopback port | Normal local port |
| --- | --- | --- |
| Doom3 `/doom3/` | 28129 | 8086 |
| Doom3MP `/doom3-mp/` | 28130 | 18086 |
| RoE `/roe/` | 28131 | 18087 |
| Quake4 `/quake4/` | 28132 | 8084 |
| Quake4MP `/quake4-mp/` | 28133 | 18084 |
| Prey `/prey/` | 28134 | 8087 |

Packaging and source evidence:

- All six normal containers were still on older images despite current tags in
  the lab contracts. Replacement baselines are the six exact
  `local/wasm-game-lab:{variant}-20260906-refresh` contract IDs, not those old
  running containers. The three Doom images retain the current paired SABot/
  save/trace/audio fixes; Q4 and Prey retain their current repaired engines too.
  Fifteen selected engine/module/bot SHA256s match current compiled source
  outputs or exact SABot lock artifacts. No native payload was rebuilt here.
- New canonical `idtech4-wasm/scripts/public-path-runtime.mjs` supplies guarded
  URL-only transformations of staged launchers/workers, shared by the normal
  family stage and Lab image wrapper. It preserves historical SABot source pins.
  Data, worker, framework, bot, Q4 module/PK4 and WS/WSS requests remain inside
  root/single/nested prefixes; native `/owner-data`, `/baseoq4`, `/save/{variant}`
  paths do not acquire URL prefixes. Foreign or escaping framework URLs reject.
  Q4's large packages stay Blob-backed; hash verification streams them.
- Source supervisor now refuses MP status/wake/join for locked Doom3/RoE SP.
  Managed Doom3MP/suite retain their existing native behavior. Unknown/malformed
  WebSocket paths now receive404/400 rather than hanging. Both changes are in
  the deployed managed images; their original bot-aware runtime/native modules
  are preserved, not replaced by the older non-bot canonical runtime file.
- Historical `build/site` is deliberately not overwritten. Its older adapter
  still fails the known Ctrl/Alt regression; current canonical source and all
  six extracted installed image adapters pass. The new full stage fails early
  if the old framework lacks publicUrl; controlled framework release/pin repair
  is still required. Do not bypass this or claim source-only builds are current.
- All baseline site/native hashes and all replacement package bytes were
  inspected. Managed images preserve17 native baseline layers; Q4 preserves13,
  Prey12, with only5/6 overlay layers. Six new local index IDs and portable config
  IDs are in Lab `deploy/steam/idtech4-release.json`, with baseline tags/IDs and
  payload/adapter/manifest hashes. `idtech4-build-receipt.json` contains exact
  context/source receipts. Config digests were hashed from actual Docker-save
  config blobs and matched on remote import; they are not local index digests.
- The guarded first Q4 context correctly refused its older inactive Doom worker.
  Final Q4/Prey staging touches only the selected worker; managed current suites
  also refresh their other current workers. The failed context was retained as
  `quake4-context-incomplete`, never used for a build. Native/candidate pins were
  not weakened to make that mismatch pass. Post-promotion context regeneration
  now selects the retained baseline from the release receipt, avoiding a second
  overlay on the already-promoted image. All28 managed /23 static context files
  reproduce byte-for-byte for Doom3/Quake4 after promotion.

Deployment, tests and artifacts:

- Private containers:uid1000,read-only root,capdropALL,nnp,1CPU/1GiB,pids128,
  noexec256MiB `/tmp`,restartno,pullnever. Each has only its required read-only
  owner-data bind(s). No owner-data rewrites/chowns or retail-pack image copies.
  Normal local services have the same isolation, retaining all original ports,
  bind/anonymous-volume identities and restart policies. Local verification
  checks actual HTTP-served adapter/native bytes and data readiness for all six.
- New staged worker fixtures execute actual shipped JS for prefix/TLS/import/
  data/module/bot/native-argument/persistence-restore ordering. Each actual image
  adapter passes all six variants and four profile cases at root/single/nested
  prefixes, including wake failures and existing input/audio/capture wiring.
  These use instrumented native/FS/DOM fixtures, not a real renderer or IndexedDB.
  Historical exact SABot worker8, relay17, network37 and worker persistence tests
  also pass. The original stale adapter still supplies a real failing control.
- `verification-idtech4-managed-http-20260907.json`:58 isolated real managed
  server checks pass, including two moving bots, native map/protocol readiness,
  auth/data/variant rejection, concurrency, genuine idle shutdown/rewake,
  unexpected-child recovery and spawn-failure cleanup. Test containers were
  resource-bounded and removed. No persistent server/bot CPU work was left.
- `verification-idtech4-20260907.json`:all34 private gateway routes pass,
  including real owner-data validation/ranges, exact active JS/WASM/module/PK4
  hashes, isolation/PWA scopes, locked variants and actual served launch parser.
  `verification-steam-idtech4-stage-20260907.json`:all34 actual container/config
  IDs and raw/served manifests match the45-entry catalog, ready0.
- `verification-idtech4-native-20260907.json`:Doom3MP runs its real d3dm1 map and
  two bots, and the actual packaged browser transport exchanges native info and
  connection-challenge packets through `/doom3-mp/api/doom3/socket`. This is not
  a native client join/snapshot/input/rendering claim. The probe socket closes;
  after confirming zero native humans/browser peers, only that exact private
  candidate was restarted to immediately restore sleeping/bots0/peers0. Timed
  idle is proved separately by the isolated test, not this restart.
- The source/packaging tests run in this tranche pass, apart from the explicitly
  retained stale generated adapter negative control. Framework full npmtest passes; Windows96 tests36pass,
  1nativeAIMskip; Lab validates45shortcuts/30endpoints/32services/30contracts/36icons.
  No frontend-code rebuild; only Steam catalog provenance was atomically updated.
  The remote frontend source is still older than this workstation.
- Pre-activation remote Compose/Nginx/routes/contracts/catalog are private under
  `/home/ted/.local/state/windows96-retirement-20260907/idtech4-config-before/`.
  Nginx-t passed and only the router was recreated for its changed single-file
  bind. An initial deployment attempt while image import was still live failed
  safely on missing images; import was not restarted. All six config IDs were
  then reverified before successful activation. No existing game was stopped by
  that failed attempt. Local before-state is `idtech4-local-before-20260907.json`.
- Final build root was moved off RAM-backed `/tmp` to
  `/home/ted/.local/state/windows-96-migration-20260907/idtech4-build-20260907`;
  it retains all six contexts/logs, original Doom site, transformed fixtures and
  failed Q4 context. Exact package extractions are at sibling
  `idtech4-package-20260907`. Archive is sibling`idtech4-images-20260907.tar`,
  2,155,590,656bytes,SHA256
  `f84bfff42c398cf49d2eef9754bb71e63d9685739f0e4c5e0ebabbefc9f6c769`, matching the
  remote `/home/ted/windows96-game-deployment-20260907/idtech4-images-20260907.tar`.
  Scripts, receipts and contracts are copied to that remote deployment directory.
- Final sampled normal services use~35–72MiB each, all0.00%CPU. Private services
  use~17–64MiB each,0.00–0.03%CPU. No compiler or temporary native/HTTP/probe
  container remains. Browser capture/fullscreen/save-reload-load is not newly
  verified by these HTTP/native tests; no standalone Chrome was started.

Next:four GoldSrc entries,Half-Life2,CoD2MP,OpenRCT2 are the seven remaining
runtime-backed routes. Start with GoldSrc's shared prefix/signaling/module/data
contract and existing maintained tests/current images. Preserve all broader
Windows96/AIM/dead-end apps/Paint/screensavers/v86 correctness and security work;
framework release/pins, normal idTech1/2 reconciliation, old-proof cleanup, final
write-frozen data delta, importer/runner/cron inventory/migration, trusted-proxy/
TLS/NPM/DNS cutover and safe Picard/Bang retirement remain required. Telegram is
retired; other active credentials remain private env values with owner-deferred
rotation. Do not push into still-active old VM runners. Goal remains active.

## Telegram guard and GoldSrc work-in-progress handoff — 2026-09-07 09:48 UTC

Telegram remains retired; no new notification service or token migration is
needed. Windows96's dedicated `tests/telegram-retirement.test.js` replaces the
seven-file check in the Steam test with a recursive maintained-source scan,
including package manifests, both Actions workflows, start/stop/update hooks and
the example env file. Negative controls cover bot dependencies, API calls and
environment keys. Failures print filenames rather than source contents that
could contain a credential. `npm test`:37 pass,0 fail,1 existing real-AIM skip;
`git diff --check` passes. This follow-up did not change running services, rotate
credentials, rewrite history or push. Previous live-env retirement evidence
remains in the 07:31 checkpoint above.

GoldSrc source work was already in progress when this request was handled. It is
**not built or deployed**; counts stay34 deployed/7 pending/4 unimplemented/ready0.
Preserve the four modified files in `goldsource-wasm`:

- `src/framework-adapter.js`: framework `publicUrl` for owner manifests, extras,
  all imported native asset URL values and default WebSocket signaling. Native
  filesystem/dynamic-library keys are unchanged. Local bridge fallback is now
  restricted to root-path HTTP loopback development, not public or prefixed
  pages. Pending WebSocket/peer cancellation cleanup was added but needs stronger
  race/failure-path tests before promotion.
- `scripts/build-web.mjs`: optional `GOLDSOURCE_WEB_DIR` stages into a new output
  directory and refuses to overwrite an existing alternate destination. The
  accepted generated `web/game-adapter.js` and compiled native bytes are untouched.
- `scripts/test-adapter-contract.mjs`: four variants at root, single and nested
  prefixes; actual adapter contract passes.
- `scripts/test-cs-endpoint-policy.mjs`:33 passing cases and an expected-failing
  explicit-endpoint negative control. Latest tested adapter source SHA256 is
  `9ef173746553dc61ff36ed13ae5ccc3126f2ce22c90c1ac72d41ba1d22e6511a`.

Normal GoldSrc suite and the always-on Counter-Strike YaPB host are untouched.
The CS engine and signaling bridge share one Go/CGO process. A proposed small
idle supervisor around that existing binary is only a design, not implemented.
The disposable `windows96-cs-rodir-probe-20260907` tried a non-root, read-only,
network-none native start using `-rodir /xashds` and `/tmp` as the working directory;
it exited1 and did not prove this layout works. Only an HTTP-listening log line
was captured. The exact exited container
`18c8c1cb613e8a624a342fc7b2c90274a7f3d8a7f51f8064585fc32ff713c9be`
was removed at09:47; it had no owner-data mounts and no recoverable runtime data.
No newly started test container or background browser remains from this work.

Resume with adapter connection-cleanup tests, explicit staged package/native
identity checks, and a deliberate CS signaling/RTC/idle lifecycle decision.
Do not rebuild the old framework lock as though it contained the new publicUrl
helpers. Do not treat `/websocket` HTTP proxy success as WebRTC gameplay proof.
Use the repaired stored-WAD owner data at
`/home/ted/wasm-game-data/goldsource-stored-wad-20260906/data`, not the original
deflated-WAD archives. No GoldSrc ports or images have been activated on Trashcan.

## GoldSrc activated and Game Lab reconciled — 2026-09-07 10:13 UTC

This continuation made deployment progress beyond the previous Telegram guard:
**38/41 runtime-backed games deployed privately;3 pending,4 unimplemented,
45 catalog entries,Steam ready0.** Public Prod/NPM, Picard games and Bang VMs are
unchanged. No commit/push or credential rotation occurred.

| Game | Path | Trashcan loopback port |
| --- | --- | --- |
| Half-Life | `/half-life/` | 28135 |
| Blue Shift | `/blue-shift/` | 28136 |
| Opposing Force | `/opposing-force/` | 28137 |
| Counter-Strike | `/counter-strike/` | 28138 |

Containers `windows96-game-{id}` use one suite image, individually locked by
variant. All are uid1000,ROroot,cap-drop ALL,nnp,1CPU/1GiB/128pids,64MiB noexec
tmpfs and restart=no. The copied repaired stored-WAD data root above is mounted
at `/data:ro`. All4 policies pass readiness/hash/range and query-resistant locks.
Native FS paths and persistence roots are unchanged.

Exact identities (also in Game Lab `deploy/steam/goldsource-release.json`):

- `local/windows96:goldsource-prefix-20260907`: local index
  `sha256:78fd81dc1d742fc6f6d7c03ca0aad1df462694641c9c4f8bde5dcb5cb94f442c`;
  portable config `sha256:742b2334d4eac617051099bff1babfbc0357c97dd67419e05f7ecd9b1ad9b614`.
 14 baseline layers and all13 immutable WASM/PK3 assets are preserved. All30
  actual site files and gateway/framework/dependency files match recorded hashes.
  Canonical generated `web/game-adapter.js` now matches deployed SHA256
  `80d6c3ae11372629c118544d250f4b33ed6ad3fa25e21e7028e69fc1b89c1c6d`.
- `local/windows96:counter-strike-host-20260907`: local index
  `sha256:14eecdd989b563d264d89ddc946e03fc15bc044f5914da3de0d4466f8ca9595a`;
  portable config `sha256:781cc18171f82fc370a9b2daf959e45dd8a4a1ba071860c7b659d960bd6c147f`.
  Explicit linux/386 build preserves21 baseline layers. Engine/filesystem/YaPB
  DLLs, liblist and de_dust2 graph are unchanged. The first default-platform build
  was superseded; only this386 config is deployed. Original base tags remain.

Counter-Strike networking and resource behavior:

- New `goldsource-wasm/server/supervisor.cjs` fronts shared static8089 on8088.
  Pinned `ws`8.21.3 has a lockfile. Only exact `/websocket` upgrades are bridged,
  after origin, optional framework password-session and ready-data checks.
  Wrong game variants are denied. Native admin/config/RCON/log routes return404.
 64KiB payloads,16 peers/pending admissions, bounded send queues/message rate and
  ping cleanup constrain signaling. Shared session secret covers the child server.
- `windows96-counter-strike-host` uses a dedicated Docker network. Its HTTP4192
  is **not published**; only RTC4.20.69.67:28140/TCP+UDP is bound/advertised.
  Native27015 is also not published. This is LAN staging, not public ICE/NAT/TLS
  proof. Ordinary HTTP reverse proxying does not itself transport WebRTC.
- Both private and normal hosts remain **always-on**, nine bots on de_dust2;
  no idle supervisor was implemented or claimed. Private restart=on-failure:3,
  normal restart=unless-stopped. Both are uid1000,ROroot,cap-drop ALL,nnp,
 1CPU/768MiB/128pids. Only YaPB conf/log/pwf/train are bounded noexec tmpfs.
  `start-isolated.sh` seeds immutable defaults, then runs the accepted original
  native start script. Bot learning resets on recreation; previous local runtime
  was backed up privately. No owner game archive was changed/deleted.
- The abandoned `-rodir` approach is not deployed: overriding baked BASEDIR
  fixed its first error but game discovery still failed. Both probes were removed.
  Restricting actual writable bot directories passed real3- and9-bot startup.

Verification and activation:

- Maintained GoldSrc tests pass with `GOLDSOURCE_FRAMEWORK_RECEIPT` pointing at
  the frozen build receipt and optional `GOLDSOURCE_WEB_DIR` at its `web` directory.
  The receipt checks12 actual framework source/dist files plus generated metadata.
  Without a receipt the original strict framework lock still applies. A controlled
  framework version/pin release remains required, not bypassed or falsely attested.
- Adapter contracts cover4 variants at root/single/nested prefixes. Endpoint
  policy33 cases plus expected-failing negative control pass. Six cleanup cases
  cover constructor/timeout/native init failure, retry, disposal and stale async
  offers. Start failure/beforeunload now release signaling/RTC state.
- Gateway26 real HTTP/WS fixtures pass origin/variant/password/data checks,
  protected routes, invalid/oversized/binary messages, forwarding and cleanup.
  `test-goldsource-images.mjs` passes9 packaged/native checks with nine bots and
  a real signaling offer; all its temporary containers/network were removed.
  Its first internal-only Docker network prevented loopback port publication;
  that failed run cleaned up, and the corrected bridge-network run passed.
- `verification-goldsource-20260907.json`:all38 private routes pass, including
  all13 served GoldSrc native hashes per route. `verification-steam-goldsource-stage-20260907.json`:
 38 actual running containers/raw manifests/served manifests/catalog pins match.
  `verification-goldsource-native-20260907.json`:real offer through prefixed
  gateway,9 bots/graph, protected topology and test-peer cleanup. Ready stays0.
- Normal Game Lab now uses both new images. Game8017/mount/restart and RTC4191
  TCP+UDP are preserved. Direct4192/admin publication was deliberately removed;
  CS shortcut now uses same-origin signaling without `server=`. Old runtime was
  backed up after confirming zero active signaling connections.
  `verification-goldsource-local-20260907.json` checks all4 policies, actual
  adapter/native bytes,9 bots and same-origin offer. `validate.sh` now guards
  the protected topology;45 shortcuts/30 endpoints/32 services/30 contracts/36
  icons pass. Windows96 tests37pass/1existing real-AIM skip.
- Steam catalog replacement was atomic and passed active credential-value scan.
  Previous remote configs/catalog are private at
  `.local/state/windows96-retirement-20260907/goldsource-config-before/`.
  Nginx-t passed; router was recreated for the updated single-file bind.
- Browser skill reused the existing runtime at10:06: selection unavailable,
  supported discovery[]. `agent` is still initialized, `browser` undefined.
  No reset, standalone/background Chrome or tunnel was started. Browser rendering,
  capture/fullscreen/save-reload-load and actual RTC gameplay remain unverified.

Artifacts and next work:

- Workstation private state `/home/ted/.local/state/windows-96-migration-20260907/`:
  `goldsource-build-20260907` (frozen context/receipt), `goldsource-package-20260907`
  (actual image extractions), `goldsource-local-before`0700 (old configs and bot
  runtime). Compact receipts/scripts are in Game Lab `deploy/steam/` and copied
  to Trashcan `/home/ted/windows96-game-deployment-20260907/`.
- `goldsource-images-20260907.tar`:600,783,360bytes,SHA256
  `258e0f25ea974a48b2424897bfcd55ce3e132019a0c0420db1a7305b4a611a9f`, matching
  the remote archive. `prepare-goldsource-prefix.mjs NEW_CONTEXT` reproduces the
  web context without changing accepted native bytes. Build target game against
  `goldsource-wasm:dev`; target host against `wasm-games/counter-strike-yapb:4.4.957`
  with explicit `--platform linux/386`. `record-goldsource-release.mjs` verifies
  archive/config identities and actual package bytes before deployment.
- Last samples: normal web0%CPU/62MiB,CS3.59%/167MiB; private web0%/28–48MiB,
  CS5.12%/166MiB. Do not report CS asleep. All newly created proof containers are
  gone; candidate contains38 game containers,one CS companion,one router.
  Older portfolio proof-container cleanup remains pending.
- Next runtime routes:Half-Life2,CoD2MP,OpenRCT2. Preserve the entire broader goal:
  browser acceptance,period-correct AIM/desktop apps/Paint/screensavers,v86 bugs,
  framework release/pins,normal idTech1/2 reconciliation,obsolete proof cleanup,
  importer/runner/cron migration,write-frozen final sync,trustedproxy/TLS/NPM/DNS
  cutover and safe Picard/Bang retirement. Telegram stays retired; other secrets
  stay private env with owner-deferred rotation. Do not push into active old VM
  runners. Goal remains active.

## Diagnostic-status correction and HL2 security tests — 2026-09-07 10:49 UTC

Current private inventory: **38 deployed game routes, OpenRCT2 awaiting migration,
2 diagnostic-only entries,4 catalog-only emulators,45 total,Steam ready0.** The
earlier "41 runtime-backed games" wording was wrong: only39 entries have actual
game engines. This correction does not finish or remove HL2/CoD2 engine work.

Telegram remains retired. Fresh read-only checks on Prod,Dev andTrashcan found
mode0600 private env files with no Telegram keys and OpenAI still configured.
Both VM desktops and Prod's importer are online with no Telegram PM2 env keys;
the candidate is running with its private secret mount and no Telegram container
env keys. Checked active updater/ecosystem/package/AIM/env-loader files have no
integration references. No Telegram API calls, credential rotation, revocation or
history rewriting occurred. Dedicated retirement/private-env/updater tests11/11
pass; full Windows96 tests now38pass/1existing real-AIM skip.

Actual diagnostic inventory and private metadata activation:

- `wasm-source-hl2`, image6375d98742b7… at8019, contains a114-byte
  `source-boundary.wasm`, not the experimental Source engine. `wasm-cod2`,
  image397e0cdb057e… at8014, contains a9,795-byte checksum probe; its multiplayer
  engine cannot link. Actual running-image identities, manifest/payload hashes
  and descriptions are recorded in Lab `deploy/steam/diagnostic-status-audit-20260907.json`.
- `games.json` records diagnostic-only status and explicit missing-engine notes.
  Steam sync retains actual image/manifest provenance and supported option data,
  but sets both entries `launchable:false`. Canonical CoD2 additionally declares
  runtimeReady=false/diagnostic-only; canonical Source declares
  runtimeReady=false/experimental. These canonical manifests are **not rebuilt
  or deployed** into the two current diagnostic images.
- Private Steam's catalog was replaced atomically after active-secret-value
  checks. All45 entries, all image/option identities and ready0 are preserved.
  Existing frontend shows the explicit notes and unavailable-game state; no new
  frontend bundle was built. Source and candidate source trees remain distinct.
- Private `/hl2/` and `/cod2-mp/` now return501 with an honest diagnostic/unfinished
  engine message; OpenRCT2 remains503 and four catalog-only emulators501.
  Only those two router messages/statuses changed. Nginx-t passed, then only the
  router was recreated. All38 game-container contracts stayed byte-identical.
- One-shot staging script `deploy/steam/stage-diagnostic-status.mjs` verifies
  exact baseline images/wasm hashes, unchanged deployed contracts and the exact
  two-route diff. Remote recovery files are at
  `/home/ted/.local/state/windows96-retirement-20260907/diagnostic-status-before/`.
  Do not rerun over that existing backup directory.
- `verification-diagnostic-status-20260907.json` passes all38 prefixed route,
  served asset/manifest/isolation/policy checks and the corrected1/2/4 pending
  categories. `verification-steam-diagnostic-status-20260907.json` verifies all38
  actual running non-root containers/raw and served manifests/catalog identities.
  Both receipts are in Labdeploy/steam and the remote deployment directory.
- Normal Game Lab still permits inspecting the two diagnostic containers at
  their original ports, but now discloses their status in tooltip/accessibility
  text and counts. Live8080 serves exact updated games.json/portal.js bytes.
  Its validator passes45shortcuts/30endpoints/32services/30contracts/36icons;
  the new DOM-only diagnostic test verifies disclosures, inspection links,
  catalog-only non-launch and an expected-failing negative control. No browser
  or native engine is booted by that test.

HL2 experimental source repairs, tested locally only:

- `source-wasm/scripts/owner-file.js` now bounds all owner transfers to32 before
  opening files; encoded transfers to8, held through drain/disconnect; each
  base64 read requires a valid range of at most1MiB. Encoded200 responses are
  no-store so a range chunk cannot be cached as the entire resource. Ordinary
  raw ranges remain206 with exact Content-Range. HEAD, suffix/open/clipped ranges,
  If-Range, empty files, invalid/multiple/unsafe-integer ranges and read failures
  are handled without unbounded allocation or descriptor leaks.
- `scripts/start.js` denies hidden paths/symlinks/native binaries, awaits serving
  errors and emits generic errors, denies unsupported owner methods, cancels
  upstream proxies on disconnect and validates distinct valid ports. SIGTERM/INT
  reap its child; unexpected child exit, including exit0, fails the supervisor.
- Full Source `npm test` passes. Six deterministic file-serving tests include
  short reads, slow output, admission limits, abort/EOF/failure and slot cleanup.
  Expanded real authenticated HTTP fixture verifies protected index/owner files,
  encoded and raw ranges, hidden/traversal paths, real aborted-request descriptor
  cleanup and actual parent-only shutdown/child-failure behavior. All fixtures
  and their temporary processes were cleaned up.
- Actual adapter fixtures now cover root,single andnested prefixes for script/
  wasm/data cache-key URLs, encoded owner filenames, eager/whole/ranged/prefetched
  reads and failures. Native `/game` and `/save/hl2` roots stay unchanged. CoD2's
  corresponding3-prefix diagnostic fixtures pass without treating its crashed
  diagnostic state as gameplay. No new native compilation or image build ran.

Exact next work:

1. OpenRCT2's existing image308d433f0442… at8026 is a real engine. Its owner root
   is `/home/ted/wasm-game-data/openrct2/volumes/combined-rct1-rct2-20260906`.
   Canonical adapter/worker prefix edits remain **WIP**, syntax-checked only:
   worker/public imports use framework.publicUrl and native URLs are absolute;
   FS/save roots are unchanged. Finish root/nested worker/audio/persistence
   fixtures, preserve all19 packaged files and native JS/WASM/data bytes, then
   package/deploy with frozen framework receipts and exact owner-media hashes.
2. Source canonical web has private ignored source-engine.js/wasm fromAug21,
   distinct from current114-byte diagnostic; latest historical v26 image is
   Aug16. Its actual rendering/gameplay acceptance and private artifact provenance
   remain unresolved. Do not bake/publish private engine source or retail data,
   deploy the heavy Emscripten builder as a runtime, or call it a playable release.
3. CoD2's checksum diagnostic is not a multiplayer implementation. The real
   engine link and source/license investigation remain open.
4. Browser discovery was not retried this turn; last supported discovery was
   empty at10:06. No new Chrome, tunnel, retained probe or background build was
   started. Browser rendering/input/capture/fullscreen/reload durability remain
   unverified. Normal idTech1/2 reconciliation and old proof cleanup, all Windows96
   apps/AIM/Paint/screensavers/v86/security work, framework release, importer/
   runner/cron migration, final frozen delta, public TLS/NPM/DNS cutover and safe
   Picard/Bang retirement are still required. No push or source shutdown occurred.

## OpenRCT2 activated on Trashcan and normal Lab — 2026-09-07 11:18 UTC

This turn made deployment progress: **all39 existing game-engine entries are
privately hosted on Trashcan;2 diagnostics and4 catalog-only entries remain,
45 total,Steam ready0.** This is not browser-gameplay acceptance or public cutover.
HL2/CoD2 real engines and the entire Windows96/product/security/migration scope
remain unfinished. The goal attachment was read before continuing.

Deployment:

- `windows96-game-openrct2` now serves `/openrct2/` through the private router,
  upstream `127.0.0.1:28139`. uid1000,ROroot,cap-drop ALL,nnp,1CPU/512MiB/128pids,
  64MiB noexec tmpfs,restart=no. Its exact copied installation root
  `/home/ted/wasm-game-data/openrct2/volumes/combined-rct1-rct2-20260906` is `/data:ro`.
- Normal `wasm-openrct2` now uses the same image at8026 with original RW installation
  bind and unless-stopped restart preserved. It has the same non-root/ROroot/resource
  limits. Zero established HTTP connections were checked before recreation.
  No native server exists: this container serves the worker-based browser engine.
- Image `local/windows96:openrct2-prefix-20260907`: local index
  `sha256:1a71185a7e362c8dc1e8654a4e8d4dc290b763b03be31755ba8d549f6c10345a`,
  portable config `sha256:b7be4971beae1a7247f1628a78701b9889e8fc4f2912e2b8b082a9d1803e6db4`.
  Baseline `openrct2-wasm:dev`308d433f0442… and all16 base layers are retained.
  All19 site files and all actual shared-shell/server files were byte-verified.
  Only adapter,worker,framework JS/bootstrap/metadata changed; native
  `runtime/openrct2.{js,wasm,data}` and owner policies/validators/transformer/artwork
  are unchanged. Exact hashes are in Lab `deploy/steam/openrct2-release.json` and
  `openrct2-build-receipt.json`. Historical framework0.9.6/ebb1 pin does not attest
  the modified shared runtime; frozen dist/server receipts do. Controlled release
  and updated framework pins remain required before broad publication.

Implementation and evidence:

- Adapter imports/audio/worker and native JS/WASM/data URLs use framework public
  paths. Native URLs sent to the worker are absolute; native FS roots `/RCT`,
  `/OpenRCT2/object` and `/save/openrct2` remain unchanged. Worker validates the
  base path before imports and retains exact framework interface checks.
- First-frame timeout, transfer failure and early or late worker errors now
  terminate the worker, close audio once, clear the timeout and ignore stale
  messages. Failed startup cannot leave the old native worker running.
- `scripts/test-public-paths.mjs` passes27 actual adapter/worker fixtures across
  root/single/nested prefixes, media/constructor/transfer/timeout/worker failures,
  late error/telemetry/audio, worker imports/native URLs, WORKERFS/private objects,
  persistence-before-main and unchanged native arguments. Runs with
  `node --experimental-vm-modules`; also verified against actual image extraction.
  It mocks engine/IndexedDB seams, not proof of gameplay or browser durability.
- Existing audio,hot-cache and installation-object tests pass. Source-native
  fixtures pass14 FileIndex cases,8 RCT1 path cases,28 ghost lifecycle cases,
  16 browser+16 desktop dialog cases and48 ride-music callback cases. No native
  engine rebuild ran. Historical release/refresh fixtures were not rewritten.
- `test-openrct2-image.mjs` passed root,/openrct2/ andnested /games/openrct2/ through
  a real stripping HTTP proxy and uid1000/RO containers. All3 temporary containers
  and their test proxies are removed. Actual image/site/native/shared-shell hashes,
  isolation, PWA, full media metadata and owner-file GET/HEAD ranges pass.
- Owner tree SHA256 matches before/after on workstation andTrashcan:
  `c3727938632f8a603adc10e01aea49ec39db0f37c89edec847da3979719507e8`.
  2,977 total files/1,228,935,377 bytes; the installation comprises2,975 media files/
  1,228,645,759 bytes,497 RCT1 files and22 private park objects. Full per-file
  manifests remain in private migration state as `openrct2-data-{source,destination}[-after]-20260907.json`.
  No owner file was changed or deleted. The preexisting full migration copy was
  verified, not recopied blindly over a live tree.
- Actual private all39 route checks pass in `verification-openrct2-20260907.json`;
  actual all39 containers/raw and served manifests/catalog matches pass in
  `verification-steam-openrct2-stage-20260907.json`. Local8026 exact image/site/
  media/ports/mount/restart proof is `verification-openrct2-local-20260907.json`.
  First aggregate run stopped at the old family allowlist; OpenRCT2's explicit
  branch/HTTP verifier was added and the entire39-route check rerun successfully.
- Steam catalog was replaced atomically with only OpenRCT2 provenance changed,
  active-secret-value scan passed,ready0 retained. Nginx-t passed; only the private
  router was recreated for its new upstream. Existing other game services were
  unchanged. Full Lab validator including actual30 images and diagnostic DOM
  guard passes; Windows96 tests38pass/1existing real-AIM skip.
- Browser skill was read and the existing initialized agent reused at11:17.
  Selection for actual local8026 failed; supported discovery returned[]. No reset,
  standalone Chrome,tunnel or extra browser was started. Browser gameplay/input/
  audio/capture/fullscreen/save-reload-load remain unverified. Last server samples:
  normal0%CPU/11.52MiB,private0%CPU/22.72MiB. No retained test process is running.

Recovery and next actions:

- Frozen build and actual image extraction are private under workstation
  `.local/state/windows-96-migration-20260907/openrct2-build-20260907` and
  `openrct2-package-20260907`. The five newly generated native fixture directories
  were moved from /tmp into the frozen build's `native-fixtures/` directory.
- Image archive `openrct2-image-20260907.tar` is361,869,312 bytes, SHA256
  `fc22c5a66e8ffc6d8efe075b8f7ee5dd5aaf24d9771471c89614008f27a06272`, verified
  equal on both hosts before loading. Rebuild/record scripts and Dockerfile are
  in Labdeploy/steam. Do not overwrite an existing frozen context.
- One-shot private staging is `stage-openrct2-candidate.mjs`; recovery configs/
  catalog are remote `.local/state/windows96-retirement-20260907/openrct2-config-before/`.
  Local rollback compose/contract/full inspect are in private `openrct2-local-before/`,
  with a sanitized public receipt. Keep old image/data; do not rerun backups into
  existing directories. Normal and candidate manifests now reference this image.
- Next useful work is normal idTech1/2 image reconciliation and exact-target old
  proof-container cleanup, then remaining VM service/importer/runner/cron inventory
  and Windows96 app work. Missing browser access is not a whole-goal blocker while
  this work remains. Browser acceptance/public TLS+NPM+DNS/final frozen data delta
  and safe Picard/Bang retirement are still required. Do not push into active old
  VM runners. No public route change,VM shutdown,credential rotation or push occurred.

## Normal Lab reconciled,86 obsolete containers stopped, native config fixed —2026-09-07 11:54UTC

This continuation made concrete deployment progress after the preceding narrow
Telegram-only recheck, which did not advance the broader goal. The host attachment
was read before continuing. Current private inventory remains39 game-engine routes,
2 diagnostics,4 catalog-only entries,45 total,Steam ready0. No public cutover.

Normal workstation deployment:

- idtech1,quake1,quake2,quake2-xatrix andquake2-rogue now run the exact existing
  prefix images in Lab `idtech1-release.json` / `idtech2-release.json`. Original
  ports8010/8081/8082/18082/28082, bind paths/access modes and unless-stopped
  restart policies are unchanged. Quake1 was still running377e6f14e823… despite
  the Compose contract declaring the newer39ca047455608… baseline; that drift is
  corrected. Its old image is retained. No native engine payload changed.
- All five now use uid1000:1000,ROroot,cap-drop ALL,nnp,1CPU/1GiB/128pids. The
  Quake-family services use noexec64MiB `/tmp` plus uid1000 mode0700 executable
  256MiB `/run/idtech2`, selected via TMPDIR for Yamagi's portable modules.
- `idtech12-local.mjs --backup` saved original full inspect/configs, expected
  image artifact inventories and owner hashes privately before recreation.
  All five were sleeping with no humans/peers or established HTTP connections.
  Only these five normal service configurations changed;27 other definitions
  were checked unchanged. Full target/base layers and native hashes were checked.
- Final `idtech12-local.mjs --verify native-config` passes120 served-file hashes
  across five services, exact native/server artifact inventories,11 ready owner
  variants, launch-profile parsing and original ports/mount/restart/isolation.
  Quake's old site-local shared-shell copies are shadowed by the server's reserved
  `/shared-shell/` mapping; actual HTTP bytes match the updated shared root.
  The initial verifier incorrectly treated both copies as served; corrected to
  test the actual route mapping, not weaken the shared-runtime hash requirement.
- All18 owner files/619,072,555 bytes, file modes and the two original Steam PAK
  symlinks are unchanged after deployment and native tests. Ordered inventory
  SHA256 `604cad09ba8746e6696da995d2e314013c98cb2943dbbe177384844dcae2c3a8`.
  Receipt `verification-idtech12-local-native-config-20260907.json` supersedes
  the earlier same-turn static-only receipt for the final runtime settings.
- `verify-idtech2-native.mjs --exercise-local` passes real native dm2/q2dm1/
  xswamp/rbase1 replies over each normal WebSocket, wrong-engine rejection,
  native uid1000, then restores all four to sleeping with zero temporary sessions.
  The existing explicit `--exercise-private` mode remains supported.

Real idTech1 failure found and fixed, locally and on Trashcan:

- Classic startup passed but native Zandronum exited255 with "Failed to create
  ~/.config directory: Read-only file system". Previous HTTP/asset/private-route
  checks did not prove native Modernized startup; they missed this deployment bug.
- The pinned native source `m_specialpaths.cpp:GetUserFile` calls NicePath, whose
  implementation uses getpwuid(getuid()). uid1000's home is `/home/ubuntu` in this
  image. HOME/XDG_CONFIG_HOME overrides would not fix this native code path.
- Normal idtech1 and all seven private idtech1 services now have an8MiB noexec
  uid1000/gid1000 mode0700 tmpfs at `/home/ubuntu/.config`. Only disposable native
  server configuration becomes writable; engine/root remain read-only. No HOME
  variable, image, catalog identity, owner file or credential was changed.
  Lab `compose.yaml` and `generate-candidate.mjs` encode this requirement.
- `verify-idtech1-native.mjs --exercise-local` and `--exercise-private` both pass
  all14 selections: seven games times Classic/Zandronum. Classic verifies three
  real native processes and two waiting lobby clients. Modernized verifies native
  map startup; its bot count was not independently queried. All processes uid1000.
  Every touched service was restored to sleeping, with no native process or Classic
  temporary session left. Nine private owner files match the preserved source.
- Only seven private service tmpfs configurations changed. Exact image identities,
  original ports/data mounts/restarts and all other generated service definitions
  were verified unchanged. No router recreation, frontend/catalog build or reload.
  Full39-route verification passed again after native testing, ready0 retained.
  Receipts: `verification-idtech1-native-{local,private}-20260907.json`,
  `verification-idtech1-config-contract-20260907.json`,
  `verification-idtech1-native-config-20260907.json` in Labdeploy/steam.
  Canonical explanation is `idtech1-wasm/proofs/READ-ONLY-NATIVE-2026-09-07.md`.

Obsolete workstation container retirement:

- Audited all118 running containers.86 were September5/6 proof/build containers:
  85 serving idle old launchers and one tail-only Emscripten build session. Process
  names showed no native game/compile work; remote established TCP count was zero.
  The exact86 full IDs, image identities and restart settings were frozen in
  `local-proof-retirement-plan-20260907.json`;71 other existing containers were
  protected (32 normal running services and39 already-stopped/unrelated containers).
- All86 were stopped.85 retain their stopped containers, writable layers and
  anonymous volumes; restart=no is explicit. The one auto-removing container,
  `nervous_engelbart`4e9cc0c7b71f…, had only the/data mountpoint in docker diff and
  no anonymous volumes. Its layer was committed before stopping to
  `local/wasm-game-lab:retired-q4-split-buffers-20260907`, image
  `sha256:6b939c695f15442cbb9c7f549e0cc5e456ff88d04a6a5af02ebe7b82984a9fe7`.
  Original config/logs/binds are retained privately for reconstruction. Docker
  automatically removed that one container; no image, volume or bind-data prune.
- All original image IDs and anonymous volumes were checked present after stopping.
  Only ephemeral tmpfs was released. Final old-container working-set sample was
  2,382MiB, CPU0.04% aggregate; this primarily removed memory/process overhead,
  not a measured high-CPU workload. No Chrome was started or closed by this turn.
- The retirement verification initially compared Docker mount-array ordering and
  failed after all stops completed. Ordering was normalized and separate read-only
  `--verify` completed; the stop/commit operation was not repeated.
- Final fresh inventory finds exactly32 running containers, all current normal
  Lab services; all30 runtime contracts and both supporting image tags match their
  actual image IDs. No obsolete proof/build container is running. Full Lab validator
  including actual images and diagnostic DOM negative control passes. Counter-Strike
  remains its intentional always-on bot host, not an idle-managed engine.

Recovery and remaining work:

- Workstation private state:
  `/home/ted/.local/state/windows-96-migration-20260907/idtech12-local-before/`
  contains full normal inspect/configs, expected artifact hashes and owner before/
  after/native hashes; `local-proof-retirement-20260907/` contains full old-container
  inventory, original stats, the automatic-removal recovery image record and logs.
  Directories0700, private inspect/owner/log files0600. Do not overwrite checkpoints.
- Trashcan private state:
  `/home/ted/.local/state/windows96-retirement-20260907/idtech1-native-config-before/`
  retains original compose/routes/contracts/full inspect and post-native owner hashes.
  Current Compose and native verifier are in `/home/ted/windows96-game-deployment-20260907`.
- `verification-local-proof-retirement-20260907.json` and
  `verification-all-normal-images-20260907.json` capture completed cleanup/current
  normal IDs. The retirement plan intentionally retains pre-update normal IDs;
  don't repeat that one-shot action or confuse them with current service IDs.
- No test process/container remains. No new browser discovery was attempted;
  the last supported discovery was empty11:17UTC. Actual browser launch/input/
  rendering/fullscreen/IDBFS save-reload is still required; native checks do not
  substitute for it. Browser absence does not block all other goal work.
- Next useful work: complete VM runner/root-cron/importer/service inventory and
  migration, plus Windows96 AIM/app/Paint/screensaver/v86/security work. Framework
  release/pins, actual HL2/CoD2 engines and emulators remain unfinished. Final frozen
  data delta, public TLS/NPM/DNS cutover and safe Picard/Bang retirement still follow
  verified acceptance. No Picard stop, Bang VM shutdown, public route change,
  credential rotation, Git-history rewrite or GitHub push occurred. Old VM Actions
  runners remain active: do not push into them blindly. Goal remains active.

## VM root audit, runner retirement and importer repair — 2026-09-07 12:28 UTC

Previous goal turn made progress: it verified the partial runner cleanup and
identified the exact verification failure. This turn finished that retirement
and implemented/tested importer repairs. The attached host transcript was reread.

Root-level inventory completed using Bang's working QEMU guest agent for the
two exact known UUIDs; passwordless VM sudo remains unavailable. Lab's
`deploy/steam/audit-vm-workloads.mjs --audit-via-bang v2` inspected loaded/local
systemd services, timers, cron files/spools, root/ted crontabs, Docker state,
process names, listeners, PM2 and runner definitions. Sanitized receipt:
`vm-workloads-20260907.json`. Raw unit/config/PM2 content is private only under
workstation state `vm-workload-audit-20260907-v2` and VM state
`root-workload-audit-20260907-v2`; do not publish these raw files. Both VMs have
zero Docker containers (including stopped), no custom crontabs, empty cron/at
spools and nine OS-maintenance timers. Exim listens on loopback only. Still check
manual tmux/user-systemd workloads and optional local Exim hooks/queue before
claiming every possible VM workload has been handled.

Three redundant deployment runners are now stopped/disabled, files retained:

- Prod Galleria-Website/galleria-website-deployer and photography-website/photo-prod.
- Dev Galleria/photo-dev.
- Protected Prod Windows96 runner remains active/running/enabled PID1184.
  Protected Dev Windows96 runner remains inactive/dead/enabled PID0; do not
  repeat the historical inaccurate claim that both are currently running.
- Prod PM2 windows-96 PID65089 and music-import PID64604, and Dev windows-96
  PID63410, were verified online/unchanged after retirement.

The first retirement invocation disabled both Prod targets and then failed a
verifier: systemctl daemon-reload resets volatile ExecStart timestamps/embedded
PID even for untouched services. Explicit MainPID, state and command identity
were unchanged. Its final QGA result was saved privately before the assertion.
The corrected helper compares stable command identity plus actual MainPID/state.
`retire-galleria-runners.mjs --verify-prod-and-retire-dev` performed only read-only
verification for Prod (did not repeat the stop), then retired the exact Dev target.
Receipt `verification-galleria-runner-retirement-20260907.json` proves all three;
private before/after configs remain in `galleria-runner-retirement-20260907` under
both local and VM migration state directories. No original code/credentials or
Windows96 runner were removed. Windows96 production automation still requires
deliberate migration before pushes/deployment changes.

Importer changes are LOCAL/ISOLATED-TESTED, not live:

- Replaced failure copy-then-unconditional-delete with claimed durable job folders,
  verified working copies, and non-destructive quarantine. Conversion never touches
  the retained original. Late uploads and same-path new uploads remain recoverable.
- Added serial debounced album queue, genuine metadata concurrency limits,
  SIGINT/SIGTERM draining, exclusive NFS lock and ten-minute PM2 kill timeout.
- Added traversal/symlink/special-file and conversion-collision guards. Different
  existing library files are never overwritten. Publication copies into the target
  directory then uses no-clobber linking; actual Pump/NFS semantics still need proof.
- SQLite album writes are transactional; track IDs survive reindexing. Nested disc
  directories work. Direct bounded FFmpeg execution replaces fluent-ffmpeg.
- Successful recovery archives deliberately retain originals AND working copies;
  this adds storage usage. No automatic archive deletion/retention policy. Crashed
  jobs/locks require explicit inspection, not automatic replay or lock stealing.
- All18 core tests passed locally. All22 core+real native integration tests passed
  on Prod in private temporary fixtures using its existing Node/native dependencies
  and FFmpeg: real audio conversion/tagging, database rollback/stable IDs and actual
  polling watcher/authenticated reload/SIGTERM. No live data or importer was used.
  Fixture source at `/home/ted/.local/state/windows96-retirement-20260907/importer-fixture-v1`.
- Full local Windows96 suite:56 passes,1 native AIM skip,0 failures. This suite
  does not replace browser acceptance. See Windows96's new
  `documentation/MUSIC_IMPORT_RUNBOOK.md` for recovery and deployment requirements.

The user's newest question is when visible Windows96 updates will go live.
Security fixes are already deployed, but Steam/new desktop features are still
private; games.tedcharles.net still targets the old Prod VM. No reliable release
time has been established. Next public milestone is verified Windows96/Steam
with existing game access preserved, followed by incremental AIM/Paint/screensaver/
VMware/dead-end-app improvements. Do not require finishing every new engine or
app before releasing the desktop. Full scope stays active. No public cutover,
Picard container stop, Bang shutdown, credential rotation/history rewrite, or
GitHub push happened this turn. The new importer is not deployed or migrated yet.

Subsequent scope addition in this turn: the user requested a full server-rendered
interactive browser named Internet Explorer 5, with period IE styling and an
Internet Explorer icon fetched from the web. The IE4/5 logo is now downloaded
unchanged from Wikimedia Commons, inspected and SHA-256 pinned with provenance,
and registered in the Windows96 icon registry. No app component/browser service
or public endpoint exists yet; no browser process was started. The complete
requirements, isolation concerns (especially this homelab's public-numbered
4.20.69.0/24) and implementation next steps are in Windows96's new
`documentation/INTERNET_EXPLORER_5_RUNBOOK.md` and GOAL-SCOPE.md. This addition
does not delay the separate incremental Windows96/Steam public milestone until
every newly requested app is complete. Full goal remains active.

## Private desktop/runtime upgrade — 2026-09-07 13:05 UTC

Updated the private Trashcan desktop only. Public games.tedcharles.net still
targets the old Prod VM; no NPM cutover, Picard stop, Bang shutdown or push.
Container `windows96-prod-candidate-20260907` now runs image
`local/windows96:runtime24-20260907`, config ID
`sha256:172f9b5e799b3574aed17e3366560a276d571f53339c0211a11d8b031fde00e8`.
Node24.20.0, uid1000, read-only root, all capabilities dropped, no-new-privileges,
1CPU/1GiB/128PIDs and loopback8096; unchanged private router is loopback8097.
Server/native dependencies are sealed in the image, NOT a whole-app bind mount.

The served frontend is now
`/home/ted/windows96-public-release-20260907/dist` (read-only), with public assets
from that release's `source/public`. The old
`/home/ted/windows-96-candidate-20260907/dist` is NOT served. Do not replay the
historical one-shot catalog staging helpers against that old path. New Lab helper
`deploy/steam/desktop-dist.mjs` resolves and validates the actual Docker mount;
its three tests pass. Private config is a0600 byte-identical copy at
`/home/ted/.config/windows96/runtime-config-20260907.json`. Existing env, appdata,
read-only nested guest images and read-only Pump NFS music mounts are unchanged.

Windows96 has a pinned multistage Dockerfile (default desktop; separate importer
and verify targets), locked Node24 server dependencies, and the async adapter for
music-metadata11.15.0. New better-sqlite3=13.0.3, bcrypt=6.0.0, ws=8.21.3,
chokidar=3.6.0; retained openai=4.104.0 API line. Fresh pre-upgrade resolution
reported four vulnerable dependency nodes; the new locked server graph reports
zero npm advisories. This is not a live-old-installed-tree, frontend or OS audit.

Verification:

- Native Node24 image suite:41 passed,0 skipped/failed. Repeated under actual
  read-only root, no network,1CPU/1GiB/128PIDs and noexec tmpfs:41 passed again.
  Includes real AIM sockets, FFmpeg conversion, SQLite and polling importer.
- Local full Windows96 suite:56 passed,1 native-dependency skip,0 failed.
- SQLite-consistent private copies:18 AIM users and83,823 music tracks, quick_check
  and ordered logical record hashes match across the runtime upgrade. Old-bcrypt
  test-only hash verified with bcrypt6; no owner password was tested or printed.
- Eight deployed HTTP/media/security check groups passed in isolated proof, after
  activation, and again with exact image/source hashes, mounts/permissions and
  runtime limits verified. All39 private game routes pass; Steam ready remains0,
  browserGameplayVerified=false, two diagnostics and four catalog-only entries.
- Audited release transfer:1,384 files/56,845,344 bytes, all SHA-256 checked, no
  active secret values found. The frontend build itself contains510 files.

Old candidate is STOPPED/retained as
`windows96-prod-candidate-before-runtime24-20260907`; proof container
`windows96-runtime24-proof-20260907` is also STOPPED/retained. Native test fixture
was automatically removed. Trashcan running-container count remains44; no new
Chrome process was started. Source/recovery/deployment details are in Windows96
`documentation/RUNTIME24_RUNBOOK.md`; sanitized Lab receipts are
`verification-desktop-runtime24-{proof,active,routes}-20260907.json` and
`verification-windows96-dependencies-{before,after}-20260907.json`.
Private raw inspect, config and database hashes remain outside repositories.

Supported browser discovery was unavailable around12:35UTC (empty discovery).
Asked the owner once to connect through Settings / Computer use; no reply yet.
Do not substitute headless tests for browser gameplay/desktop acceptance. Public
desktop milestone, final frozen data deltas, importer NFS semantics/handoff and
Windows96 deployment-runner migration remain unfinished. The new importer is
not live and the original production importer still runs.

Latest IE5 requirements: resizing must change the actual remote Chrome viewport,
with acknowledged frame dimensions and race-safe pointer mapping. Present normal
Mac Chrome UA plus matching client hints/platform metadata, based on the deployed
Chrome version. Planned initial transport is compressed image frames over a
WebSocket, not streamed markup or encoded video; audio/video support remains
additional work. No interactive browser app/service is deployed yet.

## IE5 local source and next Royale scope — 2026-09-07 13:26 UTC

Windows96 now has a local IE5 component, resizable app registration and browser
session/viewport/identity adapters. The original Back to Homepage app/desktop
shortcut is renamed `tedcharles.net`, uses the actual IE icon, and opens
`https://tedcharles.net/` in IE5 instead of redirecting the outer desktop. Browser
windows are excluded from automatic restoration so reloads do not silently start
new remote browsers or persist visited URLs in saved open-window metadata.

Internal adapters call real Playwright APIs when supplied a browser, but tests
used fake pages/CDP contexts only. They implement Mac Chrome reduced UA plus
macOS platform/client hints, actual viewport resizing, resize coalescing,
dimension/frame/input bounds and revision-keyed stale-input rejection. The UI
observes the content viewport, sends narrow input/navigation/resize messages and
paints JPEG frames. Initial planned transport is compressed image frames over a
same-origin WebSocket, not markup/video streaming. Locally saved favorites,
per-window history and clear disconnected/media/clipboard limitations are present.

IMPORTANT: `/api/browser` does NOT exist yet. No renderer launcher/listener,
network-enforced egress proxy or authenticated session transport is implemented
or deployed. The local preview cannot browse sites yet; it reports unavailable
service. Do not deploy its replacement homepage shortcut as finished until the
backend/acceptance works. Public and private deployed desktop assets remain the
13:05 checkpoint, with no new Chrome or browser container. See Windows96
`documentation/INTERNET_EXPLORER_5_RUNBOOK.md` for exact source files/protocol/next
actions, particularly 4.20.69.0/24 denial and real target-wide UA verification.

Verification:18 browser unit tests+3 component/shortcut tests passed; full local
suite77 passed,1 existing native AIM dependency skip,0 failed. Changed IE/Homepage/
remote-browser files have zero TypeScript diagnostics, but the full old repository
still has3,869 other diagnostics. Production build passed510 assets/0 errors/4
warnings at `/tmp/windows96-ie5-verified-build-20260907.nk2T0G`, not deployed.

Initial inline webpack build encountered recursive inherited Node eval arguments
in old worker tooling.102 exact owned build processes were stopped and verified
gone; their102 empty temporary directories were removed. No unrelated services
were touched. New `scripts/verify-ie5-build.js` uses a real script entry point and
no parallel Terser workers; bounded rerun completed, no build process remains.

Newest user addition is NEXT AFTER IE5: a fake Windows Update app which installs
a persistent per-browser XP Royale theme. Use exact assets/theme definitions
from `https://archive.org/details/WindowsXPRoyaleTheme`, not a generic blue skin.
Use the supplied Bliss image
`https://images.hdqwalls.com/download/windows-xp-bliss-4k-lu-2932x2932.jpg`;
the user corrected "breeze" to "bliss". Archive page reached and has a ZIP; the
wallpaper web fetch timed out. Neither resource downloaded/extracted yet; no
Windows Update/XP theme implementation. Scope and safe extraction/persistence
requirements saved in GOAL-SCOPE.md and Windows96
`documentation/WINDOWS_UPDATE_ROYALE_RUNBOOK.md`. No new competing theme rewrite
should displace the current IE5 milestone. Full goal remains active.

## IE5 PIA-only network verified privately — 2026-09-07 14:16 UTC

Newest owner security requirement: the browser must have no homelab access and
must use Private Internet Access, including browser DNS, with no direct fallback.
Owner-supplied credentials are in private0700/0600 files under
`/home/ted/.config/windows96-pia/` on workstation and Trashcan. Values were not put
in repository files, Docker environment values, receipts or documentation. The
VPN receives read-only secret-file mounts; proxy/renderer receive no credentials.
No credential rotation was performed. Current tracked/nonignored working-tree
scan across all four project repositories found zero copies of those values;
this is not a history rewrite or deletion of the owner's chat message.

New Windows96 source: `browser/compose.pia.json`, `Dockerfile.egress`,
`egress-policy.js`, `egress-proxy.js`, `renderer-network.sh`, `pia-post-rules.txt`,
`verify-network.js`; verification/secret-safe inspection scripts under `scripts/`.
Bounded builds on Trashcan use source directory
`/home/ted/windows96-ie5-20260907/` and pinned Node24/Gluetun images. Source hashes
in the final recovery receipt match deployed proxy/probe/post-rule files.

New dedicated internal bridge172.30.96.0/28: gateway/proxy.2, renderer/probe.3.
Only the PIA gateway joins a separate uplink. Proxy is UID21096, cap-dropALL,
read-only,0.5CPU/192MiB/32PIDs, binds internal3128 and accepts only renderer.3.
Gateway is1CPU/256MiB/64PIDs. All services have no published ports/restart=no.
The renderer entrypoint programs its own namespace, then drops to UID1000 with
all five capability sets zero and no-new-privileges. It cannot directly reach
TCP/UDP/DNS/IPv6/loopback destinations, only the proxy.

The proxy validates protocols/ports/addresses, rejects special/private ranges
and explicitly4.20.69.0/24, validates DNS answers and pins literal dial targets.
UID-specific gateway rules precede generic established-flow rules, preventing
old proxy sockets from following the ordinary WAN route after tunnel failure.
Separate kernel rules restrict DNS53/853, including the gateway resolver's own
traffic, to loopback/tun0. Upstream is DNS-over-TLS through the tunnel; no host,
Docker or LAN resolver/plaintext-upstream exception is configured.

Actual private deployment verification (no Chromium involved):

- PIA authentication succeeds. Confined HTTPS probe exit matches the gateway
  exit and differs from Trashcan's ordinary public exit (hashes only in receipts).
-9 direct TCP targets,6 private proxy targets and5 UDP/DNS targets denied,
  including active loopback TCP/UDP fixtures. A positive unconfined unit fixture
  confirms the probe detects reachable listeners rather than always returning
  failure. Runtime UID/capabilities and internal network are checked.
- Gateway-stop kill switch passes: an already-open TLS socket, new literal-IP
  request and new DNS-based request cannot escape.
- Stronger forced-route failure passes: freeze the gateway processes, remove
  VPN routes while retaining the normal uplink/interfaces, confirm public route
  lookup selects eth0. The separate proxy continues running, but its existing
  open TLS socket and both new-request cases are still denied. Test cleanup
  unpauses/stops the gateway and removes only exact disposable probe/helpers.
- Restart/recreate recovery passes, including five deployed source hash checks.
  Final source suite85 passed,1 pre-existing native AIM dependency skip,0 failed.

The initial manually/attach-coordinated failure probes expired without a signal
and were NOT successes. New bounded detached execution/log polling coordinates
interrupts without human/model timing or Docker-over-SSH attach buffering. Only
the successful runs wrote the sanitized Lab receipts:
`verification-ie5-pia-20260907.json`,
`verification-ie5-pia-route-failure-20260907.json`, and
`verification-ie5-pia-recovery-20260907.json`.

At this checkpoint the new task-owned containers
`windows96-ie5-pia-20260907` and `windows96-ie5-egress-20260907` are BOTH STOPPED,
unpaused and restart=no. Images, networks, private credentials and VPN volume
are retained for integration; no test build/probe/Chrome process remains. On
restart, wait for gateway healthy and explicitly RECREATE the proxy: Docker can
give a restarted gateway a new namespace while a running proxy retains the old
one. The supervisor checks actual namespace IDs. Do not add public enablement
or automatic restarts until lifecycle coordination is implemented and tested.

No public/private desktop asset change, NPM cutover, unrelated container/PM2 stop,
VM shutdown, importer handoff or Git push occurred in this checkpoint. Public
games.tedcharles.net remains the old Prod desktop; the private Node24/39-route
candidate is unchanged. `/api/browser` still does NOT exist. These tests prove
the network harness, NOT real Chrome sandboxing, Mac identity, input/rendering,
session separation or site compatibility.

Exact restart/test commands and threat boundaries are in Windows96
`documentation/IE5_PIA_RUNBOOK.md`, linked from its updated IE5 runbook. Next:
non-root sandboxed browser launcher and bounded same-origin session/frame/input
service on this network, then real browser acceptance before enabling IE5.
Royale remains after IE5; public desktop/Steam migration, importer/runner handoff,
final deltas, Picard retirement and Bang VM shutdown remain unfinished. Full goal
is active, not complete or blocked.

## Public desktop/Steam released — 2026-09-07 15:21 UTC

Owner explicitly requested publishing current work without waiting for every
feature. DONE: games.tedcharles.net serves the updated Windows96/Steam frontend
from Trashcan, with39 game launch links enabled and canonical game paths. Six
unfinished entries remain disabled. IE5 and Royale are excluded from this public
release. No full-gameplay QA claim. Browser gameplay tests continue incrementally.

NPM host70 now targets4.20.69.67:8099; new bounded non-root host-network router is
`windows96-router-public-20260907`, ID
`dc305deb00ac5889ca04ba581d2cc2c5abf6f674fe0a4a664f8028c842571ce2`.
Only NPM `.107` and localTrashcan `.67` can reach its listener. Existing private
router8097 remains unchanged. Public frontend is the13:05 Node24 release, not the
unpublished IE5 build. New public ready39 manifest overrides candidate ready0.
Desktop,39 game containers,CS companion/public router now restart unless-stopped.

IMPORTANT temporary bridge: `/api/`, `/ws/aim` and legacy root WebSocket still
go toProd `.195:8080`, preserving the only live AIM/music database writers. No
database freeze/copy/overwrite occurred. Music bytes and guest images use Trashcan
read-only mounts. Do NOT shut down Prod/importer yet. This decouples public UI
release from the remaining data/automation migration. No GitHub push occurred.

All39 public HTML pages/manifests/isolation headers/relative redirects pass;
AIM WebSocket101 and public IE5 endpoint503 pass. Existing8-group HTTP/security/
media suite passes publicly, with83,823 music tracks. Browser skill connected
after owner's reboot: fresh public tab showed Steam,45 entries/39 enabled,
Doom profile/frame-rate options and canonical launch URL. Initial double-click
also produced an unavailable-app Help window, dismissed; investigate separately.

Exact route/source/rollback instructions and read-only verification receipt:
Lab `deploy/steam/PUBLIC-RELEASE-RUNBOOK.md` and
`verification-public-preview-20260907.json`. NPM only-host70 config/database
backup: `/config/windows96-public-preview-20260907/`0700insideNPM. Rollback only
host70 upstream+saved70.conf, NOT wholeNPMdatabase; oldProd remains running intact.
Full goal continues: actual gameplay/app improvements, IE5/XP, importer/runner
handoff/finaldelta, oldPicard retirement/Bang shutdown. No more waiting for these
before the public desktop milestone: that milestone is now LIVE.
