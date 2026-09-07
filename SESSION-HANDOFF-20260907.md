# Public release and GitHub handoff — 2026-09-07

LATEST19:06UTC: Windows Update / XP Royale is LIVE on the public desktop. Refresh
and open Windows Update → Install Windows XP. The opt-in reversible theme uses
173 original Royale bitmap states across38 parts plus the exact supplied Bliss.
Install/cancel/restore/persistence, open Notepad preservation, desktop/mobile
layout and maximize/restore were tested. Source implementation Windows96c79e170;
155 tests pass,0 fail,1 existing native-AIM integration skip. Public index SHA256
`fe956783cf59760be91a14a38733c01c686a723a97de18f160ef4f826fa95905`; JS bundle
`main.44835852d63e46fb3580.js`, CSS`main.fdede87eb43d41351562.css`. Both public
bundle byte hashes match the tested build. All39 public routes/manifest/isolation
checks, AIM/browser upgrades and wrong-origin rejection pass19:06:12UTC.

Static-only staging `/home/ted/windows96-royale-public-20260907/` on Trashcan,
including the previous index, manifest and published receipt. Router/catalog
unchanged;176 new hashed assets added, old assets retained. No service/container,
VPN, PM2 supervisor, API writer or VM restarted. PIA lifecycle remains healthy;
the renderer has no leftover Chrome from these tests. See Windows96
`documentation/WINDOWS_UPDATE_ROYALE_RUNBOOK.md` and its JSON release receipt for
the guarded publisher/rollback and remaining fidelity work. Do NOT replay the
old IE5 publisher against the new index. Classic app/Start-flag icons, full native
control/font fidelity, dead-end apps, gameplay and final writer/VM migration
remain unfinished. Do not call the broader goal complete.

Google's CAPTCHA was reproduced again on r4 at18:39:39UTC despite correct Mac UA
and language header. No CAPTCHA/VPN workaround was introduced. This release does
not solve Google compatibility. Public UI verified the new update app without
changing the owner's public theme preference; the install/restore tests used a
local static preview. Temporary test tabs/server are to be closed at handoff.

LATEST18:08UTC: IE5 lifecycle recovery is live under one host PM2 supervisor.
Cold-stack and hot-VPN-restart tests passed, including actual namespace drift;
post-recovery network/sandbox/public39-route checks pass. The supervisor is saved
for startup while preserving all15 existing PM2 dump entries. No game/frontend/
writer/VM change. See Windows96 `documentation/IE5_LIFECYCLE_20260907.md` for exact
source, current container IDs and maintenance steps. Stop ONLY the supervisor
before intentional IE5 container/image/rule maintenance; it now repairs outages.
Full Trashcan reboot is NOT tested. Google CAPTCHAs, XP/app/visual work and final
writer/VM migration remain unfinished. Older lifecycle-draft notes below are
superseded; the image remains r4 from the language-header fix.

FOLLOW-UP17:50UTC: owner reported repeated Google CAPTCHAs in IE5. Reproduced
one Google unusual-traffic challenge while proving the actual Mac Chrome UA was
sent. Found/fixed a malformed Accept-Language header and deployed renderer r4
only; exact image `sha256:e44cb693d7a1564ef66c4b0c1cf3547143bb5b09cba3f4ef8daf9978cd1ec990`.
Sandbox/runtime/header checks, child identity and39-route public smoke pass;
Google compatibility remains unresolved, not claimed fixed. See Windows96
`documentation/IE5_GOOGLE_CAPTCHA_20260907.md`. No VPN/proxy/frontend/game/writer
change. Lifecycle supervisor work was interrupted and remains local untested,
undeployed drafts; no PM2 supervisor was added. Resume those carefully against
the new image, not the old r3 pin. XP/app/migration work is still unfinished.

LATEST17:21:51UTC: the owner requested immediate IE5 publication, and it is LIVE
at games.tedcharles.net. Refresh and open Internet Explorer5 or tedcharles.net.
PIA-only sandboxed browsing, actual input/resize, favorites/history and hidden-tab
suspension are included; max2 anonymous temporary sessions. All39 game routes,
AIM and the public browser protocol pass. No games/writers/VMs were restarted.
See Windows96 `documentation/IE5_PUBLIC_RELEASE_20260907.md` for exact images,
hashes, proofs and rollback. Its latest source is the release checkpoint, not
the older private source commits below. AppArmor is persisted; automatic VPN/
proxy restart coordination and visual desktop QA remain open. Chrome was closed;
no extra workstation browser was launched. Old VM deployment workflows remain
disabled. XP Royale, other apps and final writer/VM migration are still unfinished.

Read this before older checkpoints. The owner requested the icon replacements,
a GitHub sync of all accumulated work, and a stopping point. The broader app and
migration scope is **not complete**. Do not turn this checkpoint into an automatic
VM shutdown, new deployment, or claim that every planned feature shipped.

## Final source-sync follow-up — 16:57 UTC

Windows96 now also includes commit `7e89625`, pushed and verified against GitHub:
the private IE5 child-target identity fix, five new tests and an actual confined
Chromium proof. Full Windows96 suite:107 passed,0 failed,1 existing native-AIM
integration skip. All four repos were fetched with no incoming master changes;
the Lab/framework implementation commits below remain current.

Read Windows96 `documentation/IE5_IDENTITY_CHECKPOINT_20260907.md` before resuming.
The cross-site frame now matches the configured Mac identity. Dedicated-worker
UA/client hints match, but its deprecated platform property still exposes Linux;
the limitation is explicitly recorded, not hidden by a global JavaScript patch.
The runtime proof used a temporary candidate helper in the existing confined
renderer, **not a rebuilt/deployed image**. It closed its browser and left no
Chrome process. No public frontend, catalog, game, API writer, VM, or container
was restarted; public IE5 remains unavailable. Pending browser UI improvements
were planned only and are not included in the commit.

The four-repository exact private PIA credential scan again found zero matches.
Gitleaks also found no leaks in the newly staged IE5 patch. Both old Windows96
GitHub VM deployment workflows remain disabled. This is a tested source checkpoint
and GitHub sync, not completion of the broader Windows96/migration goal.

## Live now

https://games.tedcharles.net/ serves Windows96 and the classic Steam library from
Trashcan. There are 45 entries: 39 enabled game routes, two disabled diagnostic
engines (HL2/CoD2), and four unimplemented emulator entries. Steam has per-game
pages/options, search/favorites/recent history, period artwork and working Help.

At 16:25:36 UTC the static catalog gained eight icon replacements: Blood's red
hand, Duke 3D's radiation symbol, original CoD2 star, original Chex Quest cover
artwork, and actual NES/SNES/PS1/PS2 logo renditions. All nine DOS entries already
use game artwork (seven files; the Jill trilogy shares one). Quake III uses its
red Steam logo. Both public Steam and the local Lab serve the byte-verified assets.
Source-port/homemade icons are retained only as unused rollback artifacts.
Generic launcher/PWA fallbacks and genuine shared Doom/Wolf family artwork are
separate; this does not claim every engine's install icon was rebuilt.

The eight-icon update changed no non-icon catalog fields, game images, launch
options, readiness gates, frontend JS/CSS, API routing, or user data, and restarted
no service. Chrome visual verification showed the new Blood/Duke artwork and
39-ready library. No gameplay was started. Screenshot:
`../windows-96/documentation/screenshots/steam-icons-20260907.png`.

## Exact deployment / rollback

- Active frontend: Trashcan `/home/ted/windows96-public-release-20260907/dist`.
- Latest UI source snapshot: `/home/ted/windows96-steam-visual-20260907-r4/`.
  Index SHA256 remains
  `51319ff422a4b1d8247125b92823bcb7afbcf2763622416019cafc996fddb9eb`.
- Icon follow-up: `/home/ted/windows96-icon-release-20260907/`, with original
  payload, inventory, receipt and `before/library-0.json` (dist),
  `before/library-1.json` (public source). Current catalog SHA256:
  `53a55073d7ee9e171f9e109f93cc2322a0e7b7302d914d0e62ebf9a1b268f038`.
  To roll back only icons, first verify this exact current hash, then atomically
  restore those two saved JSON files to their matching targets. Keep assets and
  mounted directories intact. The publisher is guarded and one-shot.
- NPM Picard host70 still points to Trashcan `.67:8099`; host79/games-dev disabled.
  Public `/api/` and AIM WebSockets STILL bridge to Prod `.195:8080`.
  Do not stop Prod or its music importer while this bridge remains.
- Public `/api/browser` remains503. IE5/PIA is private only.

## GitHub and secrets

All four repositories were pushed and their remote master commit IDs verified:
wasm-games `d8d76ab`, wasm-game-lab `5b98063`, wasm-game-framework `5284c74`,
and windows-96 `2a001ba`. These are the implementation checkpoint commits;
this handoff's final verification update follows in a documentation-only commit.
Lab's `codex/proven-browser-roster` branch was also pushed to `5b98063`, and its
local master was fast-forwarded to the same commit. All four working trees were
clean after the implementation push. Framework GitHub CI and Pages deployment
both completed successfully for `5284c74`.

The push includes source, tests, artwork, deployment helpers, receipts and
unfinished feature code; ignored build caches, owner game/music data, private
environments and credentials remain excluded.

Before pushing, the old Windows96 workflows `prod-update.yml` (204718922) and
`devel-update.yml` (204718562) were disabled using GitHub's workflow API. Both were
verified `disabled_manually`. The Prod runner was idle; no runner service, PM2
writer or VM was stopped. This is **not** new Trashcan auto-deployment. Do not
re-enable the old workflows without replacing their VM deployment targets.

Current tracked/nonignored files passed the exact private PIA credential scan
across all four repositories. Gitleaks8.30.1 scanned an isolated snapshot and
reported49 generic-key matches; review found only artifact hashes, game-data keys,
controller key names, a WebSocket test nonce and vendored ATAPI sense-key code.
No confirmed credential was found. This is not a history rewrite or a guarantee
against all secrets. Previously exposed credentials still require owner rotation;
the owner explicitly deferred rotation. Private environment files remain outside
Git. No game/music payload or private database was uploaded.

## Verification at this checkpoint

- Windows96: `npm test`:102 passed,0 failed,1 skipped (real AIM socket integration
  requires its explicit integration environment).
- Shared framework: complete `npm test` passed.
- Lab: `bash validate.sh`:45 shortcuts,32 services,30 contracts,44 icon inventory
  entries; public/Lab byte checks pass for18 affected/prior-fixed entries.
- Public smoke: all39 HTML/manifest/isolation/relative-redirect checks pass;
  AIM101 handshake passes; public browser remains503.
- Build/DOSBox/CoD2/idTech1/idTech2/Wolf3D adapter regression commands passed.
  Source-family complete `npm test` passed. These are not full browser gameplay QA.
- Additional direct GoldSource adapter,33 endpoint-policy and6 cleanup cases
  passed. Quake3 transport/adapter and RTCW adapters passed. All7 WolfET prefix/
  transport cases passed with `NODE_PATH` pointing to the existing RTCW server's
  `node_modules` (plain invocation initially lacked `ws`; no production change).
- Whitespace checks passed for authored code/docs. Upstream SVG whitespace/CRLF
  and unified-patch blank context lines were intentionally preserved byte-for-byte.
- Default idTech3 and GoldSource `npm test` stop at their legacy framework
  `ebb1ebe...` pin guards because the integration uses a newer working framework
  overlay. Do not weaken the guards or rewrite old receipts to make them green.
  Next packaging work should reconcile the canonical framework lock/release with
  the explicit overlay receipts and rerun the complete suites.

## Still unfinished — resume only when directed

1. Public IE5 integration and final network/sandbox acceptance. Private renderer
   uses PIA; no unrestricted public browser release. Host AppArmor persistence and
   consolidated renderer evidence also remain. See Windows96 IE5/PIA runbooks.
2. Windows Update / exact XP Royale assets and persistent theme, Bliss wallpaper;
   Paint, 3D Maze/Pipes, AIM period styling, dead-end apps and v86 cursor fixes.
   Working Help and Steam are shipped; these other requested features are not.
3. Final AIM/music writer and consistent DB handoff from Prod, new deployment
   automation, then retire old Picard game containers and both Bang VMs. Neither
   VM has been retired. Keep music on Pump; there is no Trashcan VM requirement.
4. Pump RW importer proof:22 tests passed; separate cross-client hash/lock proof
   passed. Synthetic fixtures were cleaned up; production-role image
   `local/windows96:importer24-20260907` is prepared but NOT running. Never start it
   beside Prod's existing importer. See `MUSIC_IMPORT_RUNBOOK.md` for the exact
   image ID, NFS/FUSE cleanup caveat and handoff sequence.
5. Full gameplay/save/reload/input QA, including fresh Blood/Duke mouse checks.
   Blood's separate crash remains deferred for the owner's reproduction.
   HL2/CoD2 engines and the four emulator runtimes remain unimplemented.

Detailed scope: [GOAL-SCOPE.md](GOAL-SCOPE.md). Deployment authority and older
receipts: [VM-RETIREMENT-RUNBOOK.md](VM-RETIREMENT-RUNBOOK.md) and the sibling Lab's
`deploy/steam/PUBLIC-RELEASE-RUNBOOK.md`. Do not replay historical one-shot helpers.
