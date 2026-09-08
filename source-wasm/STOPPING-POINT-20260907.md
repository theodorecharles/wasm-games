# Half-Life 2 deployment stopping point

The user requested deployment to `ted@4.20.69.67`, availability in Windows 96 Steam, and then a stop. The later instruction **“no more chrome testing”** applies: no Chrome tools or tests were used after it. Development is stopped at this checkpoint; resume only when requested.

## Deployed release

- Host: `ted@4.20.69.67` (`trashcan`). Container: `windows96-game-half-life2`.
- Image tag: `local/windows96-source-hl2:20260907-r1`.
- Remote Docker image ID: `sha256:c23b103de760591ebebe79c3b8290a14bc23053004d20b667905b8dbe2a5f4e1`.
- Local OCI image ID: `sha256:022a3c163d18aa61d422d725d42939b91262ca705627df7c188f2742b1bb6f19`. The verified Docker archive loads the same image configuration into the remote classic image store.
- Archive SHA256: `e51ed663ea0b34835d9c29c630c55dc73d758388c4eda0c82384449ff6037a75` (68,664,292 bytes).
- Upstream: `127.0.0.1:28141`; Windows 96 router path: `/hl2/`; Steam identity and variant: `hl2`.
- Public launch: [Half-Life 2](https://games.tedcharles.net/hl2/). Refresh Windows 96/Steam to load the updated catalog. Public HTTPS checks returned 200 for the catalog, readiness gate, launch page and manifest, with isolation headers intact.
- Release manifest SHA256: `02d58012cfcd3624e579faf592613c94e422881896f89a996a70cf9ab7e58910`. It advertises only HL2, labels the game a playable preview, and hides unverified quality/FPS controls.
- Owner data: `/home/ted/wasm-game-data/source/hl2-steam-legacy-complete`, mounted read-only at `/data/owner`. All **31,002 files / 3,688,096,474 bytes** match their local SHA256 values. The public owner index contains 31,001 entries; the private receipt is excluded.
- Container runs as UID/GID 1000, with a read-only filesystem, dropped capabilities, no new privileges, a loopback port, and restart policy `unless-stopped`.

The image contains the browser runtime and framework, not the native engine source or owner data. The archive, exact start command, and verification receipts are retained remotely in `/home/ted/.local/state/hl2-deployment-20260907`. Steam deployment snapshots and its guarded activation script are in `/home/ted/windows96-hl2-steam-release-20260907`.

Steam activation changes only the HL2 catalog record, its readiness record, and the existing `/hl2/` router entry. The other 39 ready entries are preserved; the ready count is now 40. The existing Windows 96 desktop build, Paint work, and persistent desktop data were not redeployed.

## Included repairs and verification

The release uses the frozen v10 client/server/engine plus the final v12 renderer: corrected vertex addressing and dynamic lightmaps; SDL callback format conversion; explicit save-to-device completion; matching camera depth buffers; and isolation of the two incompatible scene parsers. Normal server configuration registration is restored. The final renderer preserves one scene-output encoding and corrects only presentation from an sRGB source to a linear default framebuffer, guarded by actual attachment encodings.

Before the no-Chrome instruction, the native menu, opening, train, facial motion, and save/reload/load had been observed. The repaired server reached its menu, and the native console confirmed `sk_citizen_health = 40` instead of the earlier unregistered zero default. The camera framebuffer changed from incomplete mismatched dimensions to a complete 256×256 color/depth pair.

Final automated checks passed: 43 native/data cases plus adapter and owner suites; actual headless EGL/GLES shader rendering for gray, RGB, alpha and Y flip; native build and all 26 WASM validations; local packaged-image checks; and remote health, all native HTTP hashes, manifest/index hashes, exact raw/base64 map and voice ranges, and isolation headers. Windows 96 integration also passed its targeted tests and metadata/route checks. No final integrated Chrome test was performed.

## Remaining work, deliberately stopped

- Confirm the final release's overall brightness and station monitor appearance in gameplay.
- Confirm audible quality after the sample-format repair; correct callback negotiation was measured, but final listening acceptance remains open.
- Verify a fresh NPC scene after parser isolation and restored skill settings. Older saves can retain zero-health NPCs.
- Measure and improve facial smoothness if still needed. Unmeasured timing diagnostics are preserved separately and excluded from the deployed image. Facial morphing remains enabled.
- Broader combat, physics, transitions, performance, repeated loads, and campaign stability are not accepted as complete.
- Lost Coast, Episode One, Episode Two and Portal remain queued in [FOLLOW_ON_GAMES.md](FOLLOW_ON_GAMES.md).

Detailed development evidence remains in [HL2_RUNBOOK.md](HL2_RUNBOOK.md), [HL2_GAMMA_AUDIT.md](HL2_GAMMA_AUDIT.md), and [FINAL-PRESENTATION-AUDIT.md](FINAL-PRESENTATION-AUDIT.md). Runtime packaging is documented in [RUNTIME-IMAGE.md](RUNTIME-IMAGE.md).

Local private receipts: `/home/ted/.local/state/hl2-resume-20260907/runtime-r1-http-receipt.json` and its `deployment/` directory. Final native artifacts: `/home/ted/.local/share/source-wasm/hl2-side-63f8364-20260907/adapter-module-v12present`.

Windows 96's integration record is `documentation/HL2_STEAM_RELEASE_20260907.md` in `/home/ted/Development/windows-96`. Public HTTPS evidence is retained in the local private `windows96-steam-release/public-https-receipt.json`. The private native builder and temporary packaged-image HTTP test container were stopped after verification; the remote game service remains running. No commits or pushes were made for this deployment.

## Subsequent GitHub publication

The user subsequently requested pushing the pending work. This publication records the authored HL2 integration, tests, build recipes, deployment notes and deferred diagnostics, together with the separate Windows 96 checkpoint. It does not resume development, run Chrome tests, or redeploy paused Windows 96 changes. Native engine sources, compiled runtime images and owned game data remain outside GitHub.
