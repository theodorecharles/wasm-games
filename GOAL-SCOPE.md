# Active portfolio and Windows-96 scope

LATEST2026-09-07 17:21UTC: IE5 is now a live PIA-only public preview, at the owner's
explicit request to publish it immediately. Steam/icons/39 game routes remain
unchanged. See the newest SESSION-HANDOFF and Windows96 IE5_PUBLIC_RELEASE runbook;
earlier statements excluding IE5 are historical. XP/app/migration scope remains open.

Newest checkpoint: [2026-09-07 release/GitHub handoff](SESSION-HANDOFF-20260907.md).
Eight more icon replacements are public; all accumulated work was pushed and
verified on GitHub at the owner's stopping-point request. Remaining features/migration
are explicitly listed there; they are not complete.

Updated 2026-09-06/07 at the user's request. This extends the active goal; it
does not mark any unfinished game or app as complete.

CURRENT checkpoint 2026-09-07 15:53 UTC: updated Windows96/Steam is LIVE at
games.tedcharles.net on Trashcan, with39 enabled game routes and6 unfinished entries.
Classic Steam artwork, scoped control/layout fixes and real Help are also live.
Earlier private-only/ready0 references are historical. AIM/API/music writers still
use Prod through a deliberate temporary bridge; neither VM is retired. IE5/XP
remain excluded publicly. See Windows96 documentation/STEAM_VISUAL_RELEASE_20260907.md
and the Lab deploy/steam/PUBLIC-RELEASE-RUNBOOK.md before any deployment action.

## Immediate Game Lab work

- Put the latest available repaired builds on the normal Game Lab ports.
- Stop superseded game proof/build containers; keep rollback images and owner
  data. Only current lab services should remain running.
  Completed locally2026-09-07:86 obsolete containers stopped,32 current Lab
  services remain.85 stopped containers retain their writable layers/volumes;
  one auto-removing container has a committed rollback image and private original
  config. No images or persistent data were pruned. Picard retirement is separate
  and still awaits verified public cutover.
- Replace Quake III's incorrect icon and the generic DOSBox shortcut icons with
  the corresponding games' artwork, recording provenance.
  Quake III is now fixed in the live local portal (2026-09-07): the installed
  Steam application 2200 red-logo PNG is served and byte-verified. All nine DOS
  shortcuts now use seven actual game artworks, with byte-verified provenance;
  Jill's three episodes share its trilogy icon. The same artwork is deployed in
  the private Steam catalog and DOS launchers. Generic high-resolution DOSBox PWA
  installation icons remain a documented fallback, not the portal shortcuts.
  The seven normal DOS services also use the replacement images, with their
  original ports, mounts and restart policies verified unchanged.
  Normal Quake III and both RTCW services now also use their replacement images;
  actual served adapter/engine hashes and original ports/mounts/restarts pass.
  Normal WolfET now uses its rebuilt browser/native-module image too, with its
  original ports/volumes/restart policy preserved and non-root/read-only isolation.
  Wolf3D/Spear now also use rebuilt config-persistence/prefix images at8011/8012;
  both original mount/port/restart contracts and all18 owner-file hashes pass.
  All six id Tech 4 normal services now also use their current repaired native
  payloads plus tested launcher-prefix overlays. Their original ports, bind and
  anonymous mounts, and restart policies pass; no owner-data writes were needed.
  Normal OpenRCT2 now also uses its prefix/worker-cleanup image at8026 with the
  original installation mount and restart policy; all native payloads and owner
  file hashes are unchanged. Normal idTech1/2 reconciliation is now complete:
  all five services use their prefix releases, with original ports/data mounts/
  restart policies and all18 owner-file hashes preserved. Every running normal
  runtime image now matches its contract, including the intentionally diagnostic
  HL2/CoD2 images. This does not establish new browser acceptance.
- Repair and verify Duke 3D's stuck mouse firing and Blood's missing captured
  mouse fire. A source regression reproduces missing captured click delivery;
  the corrected adapter bridge is now packaged and deployed on both normal
  local Game Lab ports and private Trashcan routes. The earlier prepared image
  accidentally left the dispatched `/adapters/` copies stale; that is fixed and
  regression-tested against the served bytes. Browser gameplay remains pending.
- Wolf/Spear's configuration-persistence recovery patch is now canonical and
  rebuilt into both deployed engines, with the original WIP snapshot retained.
  Real native config read/write and binding precedence tests pass for both games;
  browser reload, saves, capture/fullscreen and visual acceptance remain open.
  Blood's separate crash investigation remains deferred unless the user resumes it.

## Windows-96 product and deployment goal

Repository: https://github.com/BuiltByTed/windows-96.

- Inspect the repository and trace its existing deployment flow.
- Replace the existing game desktop shortcuts/apps with a period-styled fake
  Steam application containing the full game portfolio. This will eventually
  replace Game Lab, not remove the underlying game engines.
- Steam needs a real library and a dedicated detail page for every game.
  Each detail page exposes that game's supported renderer/profile and other
  wasm-game options before launch. Persist per-game preferences and actually
  apply them to the launched runtime; derive controls from canonical manifests
  and supported launcher configuration rather than inventing nonfunctional settings.
  The Steam library implementation is now staged on the private Trashcan
  candidate: 45 entries, image-derived controls, independent preferences,
  favorites/search/recent launches and legacy-window migration. Shared runtime
  URL-setting parsing and prefix support are now packaged and privately deployed
  for all seven id Tech 1 games, Blood/Duke 3D, all four Quake/Quake II variants
  and all nine DOS games, plus Quake III, RTCW SP/MP, WolfET, Wolf3D/Spear and
  all six id Tech 4 entries, all four GoldSrc games and OpenRCT2. Steam's staged catalog
  now pins the actual replacement image/config identities and served manifest
  hashes for all39 deployed game-engine entries.
  Native acceptance caught and fixed Zandronum's read-only config-directory
  failure: normal/private idTech1 deployments now give uid1000 a bounded8MiB
  noexec tmpfs at `/home/ubuntu/.config`. Both multiplayer engines start for all
  seven games on each host; all native sessions are asleep again. No engine or
  owner file changed. Modernized bot counts were not independently queried.
  Real native Quake-family map replies through prefixed WebSocket routes pass;
  all tested native sessions are shut down again. Both shipped DOS engine versions
  pass native keyboard and DOS file-I/O fixtures; browser reload persistence is
  not yet verified. Quake III and RTCW MP also pass real prefixed WebSocket
  status/map replies under uid1000, with both returned to sleeping afterward.
  RTCW renderer binaries/QVMs/menu packs are unchanged; Quake III has a narrow
  browser WebSocket path/TLS glue change, not a renderer rebuild.
  GoldSrc's 13 native browser assets and the Counter-Strike native engine/bot
  payload are unchanged. Both private and normal-lab CS hosts run nine bots on
  de_dust2 behind a protected same-origin signaling gateway; these hosts remain
  always-on, not idle-managed. Prefixed signaling is verified, WebRTC gameplay
  and public ICE/TLS reachability are not. Direct CS admin HTTP is not published.
  OpenRCT2 is now privately deployed at `/openrct2/`, including its complete
  2,975-file RCT1+RCT2 installation and22 private park objects. Its real native
  payloads are unchanged; prefix/worker failure-cleanup and actual HTTP/media
  checks pass. Browser gameplay/save-reload acceptance is still pending. The current
  Half-Life2 and CoD2MP images are diagnostics, not playable game engines. Steam
  now explicitly disables them and explains that distinction; the unfinished
  engines remain required work, not completed migrations. The portfolio contains
  39 game-engine entries,2 diagnostic entries and4 catalog-only emulators.
  Public launch gates intentionally remain disabled
  until complete browser acceptance. See the newest VM retirement checkpoint and
  Windows-96's `documentation/STEAM_RUNBOOK.md`.
  WolfET's matching browser/native-module rebuild, isolated idle proof and actual
  Trashcan `/wolfet/` route now pass. Its native Goldrush match filled all12 bot
  slots and replied through the prefixed WebSocket; gameplay cvars were queried
  from the engine. Both WolfET instances are asleep again. Browser rendering,
  input, reload persistence and human-join bot replacement remain unverified.
  Doom 3 multiplayer now also passes actual native info/challenge replies through
  its prefixed WebSocket using the packaged client transport. Two real bots are
  verified; isolated native HTTP/lifecycle tests pass58 checks. Its private match
  was returned to sleeping. Single-player Doom3/RoE cannot wake multiplayer.
- Deploy the current game containers and required owner data to
  `ted@4.20.69.67` (trashcan), with isolated networking and preserved data.
  Initial full game-data copy is complete: 80,680 files / 40,717,752,501 bytes,
  all SHA-256 matched, including dereferenced Quake II expansion PAK links.
  Originals are retained. Thirty-nine locked game containers, a Counter-Strike
  companion and a private gateway are deployed; final controlled delta sync/public
  cutover are still pending.
- No host virtual machines on Trashcan: use only PM2 processes and Docker
  containers. Windows-96's emulated VMware guests remain a browser-side v86 app,
  not hypervisor guests on the destination host.
- The goal's attached host notes were read: pumpvm is `ted@4.20.69.195` and
  pumpdev is `ted@4.20.69.219`, SSH port 22. Inspect actual deployment configuration
  before selecting or modifying either host.
- Migrate **everything running on both development and production VMs** to
  trashcan, then shut down both VMs after verified cutover. This explicitly
  includes services beyond Windows-96, deployment runners, scheduled jobs,
  application databases, uploaded files and copying all of Pump's `/mnt/user/mp3s`.
  Exception: the user identified the Galleria/photography processes as redundant
  and authorized retiring them rather than migrating them. Their three PM2 app
  entries were removed and the remaining process lists saved on 2026-09-07 UTC;
  code/data are retained. See [VM-RETIREMENT-RUNBOOK.md](VM-RETIREMENT-RUNBOOK.md).
  Root/QGA inventory is now complete for system services/cron/containers: no
  Docker containers or custom crontabs on either VM. All three redundant
  photography/Galleria runners are now also stopped/disabled with files retained;
  Windows96 runners and PM2 apps were verified unchanged. User-session/manual
  workloads still need a final check. A safer importer is implemented and passes
  22 isolated filesystem/audio/SQLite/watcher tests, but is not deployed live yet.
  Measure source sizes, destination capacity/filesystem limits, existing data
  and required headroom first. Preserve development/production separation,
  verify copies and service cutover, and retain rollback before any source
  cleanup. Do not infer authorization to delete originals from the copy request.
  Storage decision, 2026-09-07 UTC: Trashcan has only about 602 GiB free versus
  the MP3 library's 599 GiB. The user authorized keeping music on Pump and
  connecting Trashcan to it instead. Use the existing Pump NFS library; do not
  fill Trashcan's root disk attempting the formerly requested full music copy.
- Inspect Nginx Proxy Manager on Picard (`4.20.69.132`) for
  `games.tedcharles.net`, the possible `games-dev.tedcharles.net` route and other
  VM-backed services. Preserve TLS, WebSockets and route behavior during cutover.
  Update proxies only after their replacement upstreams pass acceptance checks.
- Latest hosting decision: use **one** public site, `games.tedcharles.net`.
  Windows-96/Steam occupies the root; games use dedicated paths such as
  `/doom1/`, `/doom2/`, `/doom3/`, not individual subdomains. Verify full prefix
  compatibility (assets, runtime config, WebSockets, saves, iframe isolation).
  The user explicitly does not want `games-dev` retained or recreated. Archive
  development code/data for recovery, but migrate only the production desktop
  service. Retire the development NPM route and runner during verified cutover.
- Picard hosts old, unrelated WASM game implementations. The user authorized
  replacing all of those with our game containers on Trashcan and spinning down
  the old Picard game containers. Inventory exact targets/routes, then stop them
  and disable automatic restarts during verified replacement cutover. Preserve
  their data/images for rollback. Do not stop NPM or unrelated Picard services.

## Added Windows-96 quality scope

- Fix the audited security findings before public cutover. Preserve active keys
  in private server-side environment files; the owner explicitly deferred key
  rotation. Do not imply removing literals fixes exposed Git history. Telegram
  is retired entirely, not an integration to migrate. The narrow live credential
  and notification patch, followed by deployed HTTP/AIM/analytics/music-reload and
  frontend secret/XSS repairs, are recorded in the VM retirement runbook. The
  development proxy is now disabled. Remaining runtime/dependency, lifecycle,
  proxy-attribution and visual verification gates are not complete.
  Private runtime/dependency upgrade completed2026-09-07: sealed Node24.20.0
  desktop with new locked native modules, zero reported npm server-dependency
  vulnerabilities,1CPU/1GiB/128PID limit and fresh frontend.41 native/server tests
  pass under actual isolation; copied18-user/83,823-track datasets retain logical
  contents. This is private only, not a whole-system security sign-off or public
  cutover; the live Prod VM/importer remain unchanged.
- Audit correctness, persistence, focus/input, window management and app lifecycle.
- Improve AIM's behavior and make its UI and interactions more period accurate.
  Clearly distinguish simulated/offline behavior from any real messaging service.
- Inventory every dead-end application and finish useful, coherent interactions
  instead of leaving nonfunctional buttons and placeholder windows.
- Make Paint functional, including drawing tools, color selection, undo/redo and
  useful file handling consistent with the desktop's storage model.
- Implement convincing classic screensavers, including 3D Maze and 3D Pipes,
  with proper idle activation, dismissal and cleanup so they do not burn CPU
  after closing.
- Repair the fake VMware application's guest VM behavior, particularly mouse
  cursor offsets. Verify coordinate mapping across guest resolutions, scaled
  displays, window resize/maximize, browser zoom and capture/release transitions.
- Identify further high-value authenticity/usability improvements during the
  audit, and verify the result in the browser.
- Add a full interactive web browser app named **Internet Explorer 5**, with
  classic IE5 UI and the actual IE logo sourced from the web. The historical
  IE4/5 SVG is now downloaded, unchanged/hash-pinned with provenance, and
  registered in Windows96's icon system. The browser itself remains unfinished.
  Use modern server-side rendering on Trashcan (Playwright or equivalent), not
  an iframe-only shell or the insecure legacy engine. Include normal browsing,
  navigation, input, favorites/history, isolated visitor sessions and proper
  resource cleanup. Enforce network-level private/LAN protection, explicitly
  including 4.20.69.0/24 despite its public numbering, with bounded sessions and
  no exposed generic browser-control API. See Windows96's
  `documentation/INTERNET_EXPLORER_5_RUNBOOK.md` for acceptance and next actions.
  Follow-up explicit requirements: resize the actual backend browser viewport
  when the IE window changes size, keeping streamed frames/input coordinates
  synchronized; use a normal Mac Chrome user agent with matching browser
  identity metadata, not IE or HeadlessChrome identification.
  New explicit security requirement: browser traffic MUST exit through a
  dedicated Private Internet Access VPN, including browser DNS, with no direct
  fallback if the VPN fails. Browser pages must have no network access to the
  homelab/host/loopback/metadata/private ranges. Enforce independently with
  renderer-network restrictions, a validating egress proxy and VPN kill switch.
  PIA credentials were supplied by the owner and saved privately outside all
  repositories; never reproduce values in code/docs/logs. VPN connectivity,
  observed public exit identity and deliberate VPN-down denial require proof
  before the browser is made reachable.
  Security milestone2026-09-07: private PIA gateway/validating proxy/renderer
  namespace firewall built and tested on Trashcan. Matching PIA public exit,
  direct/private/DNS denial, gateway-stop and normal-uplink-retained route-failure
  kill switches, and recovery all passed with a non-browser network probe.
  Private test services are stopped pending browser integration; no Chromium or
  public IE5 endpoint exists yet. See Windows96's `documentation/IE5_PIA_RUNBOOK.md`
  and Lab `verification-ie5-pia*20260907.json` receipts. Actual browser sandbox,
  session/identity/interaction acceptance remain required.
  The former Back to Homepage shortcut must be labelled `tedcharles.net` and
  open `https://tedcharles.net/` inside IE5, without navigating away from Windows96.
- After the IE5 work, add a fake Windows Update app that installs a Windows XP
  theme through a period-style update flow. Persist the upgraded theme per
  browser (local storage or a suitable cookie), across reloads/return visits.
  Use the actual Royale theme package at
  `https://archive.org/details/WindowsXPRoyaleTheme`: extract its real image assets
  and theme definitions to reproduce Royale accurately, not an approximate blue
  recoloring. Use the owner's supplied Bliss wallpaper at
  `https://images.hdqwalls.com/download/windows-xp-bliss-4k-lu-2932x2932.jpg`.
  The owner corrected "breeze" to "bliss". Preserve provenance and original
  downloads privately; inspect archive contents safely without executing any
  supplied installer. Keep the existing Windows96 theme available and preserve
  user settings/data through the simulated upgrade. This is a theme change,
  not an actual OS/guest VM installation. Do not delay the current IE5 milestone
  by starting a competing theme rewrite before it reaches a stopping point.

## Sequence and acceptance

Prioritize destination access/capacity and the complete VM/proxy inventory for
the newly requested VM retirement. Continue the lab deployment/input/icon/cleanup
and Windows-96 implementation without losing either scope. Preserve existing
work, avoid fake success states, and
record tests and remaining limitations. A GitHub push is not a deployment;
HTTP readiness is not gameplay or app-functionality acceptance.

Public milestone priority, 2026-09-07: the user specifically asked when the
Windows96 updates will appear on games.tedcharles.net. Prioritize verified
Windows96/Steam public release with functioning existing game access, then ship
further app improvements incrementally. Do not gate that release on finishing
Paint/screensavers/all dead-end apps or the unfinished new engines/emulators.
This changes sequencing, not the full scope or the need for real acceptance.
