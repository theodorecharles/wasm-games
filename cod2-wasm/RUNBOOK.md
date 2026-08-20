# Call of Duty 2 WASM runbook

Status: **Still in development**

## Immutable inputs

`source-lock.json` pins wasm-game-framework 0.9.2 at
`53bc7e6eeef1ae35dcf3b25dea4e3ec0ab46726f` and records reconstructed-source
baseline `f70e697476fceeb4f53de677e1c5d5fe12a00b36`. Builds create an isolated
framework worktree at that exact commit.

Do not restore or use the removed inherited `src/web` implementation,
`build/web_gen` output, another Call of Duty 2 WebAssembly port, or a compiled
third-party browser artifact. Do not contact or submit anything upstream.

The pinned reconstruction baseline contains no repository-level `LICENSE` or
`COPYING` file. Keep the Docker images local until the repository maintainer
documents the distribution terms; this publication boundary is independent of
the native link blocker below.

## Source-base audit

`xtnded/cod2` is pinned at
`8eccf06c80423f099fb01745529bee6bb43cc84a` and carries `COPYING.txt` with
GPL-2.0. It has no Git commit ancestry with the current OpenCoD2 baseline. Its
`reconstruction_summary.txt` reports 383 reconstructed source files, but its
CMake file adds `CoD2SP_s`, `CoD2MP_s`, and `cod2_lnxded` from the same lone
`unix/unix_main.cpp` file. Fresh native GCC and Emscripten builds both fail in
that first file on undeclared engine symbols before any reconstructed source
family compiles.

The GPL tree contains `client_mp` and `server_mp`, plus partial `game`, `cgame`,
and `ui` directories; it has no single-player `client` or `server` directory.
Its named SP executable is therefore not evidence of a complete SP engine. The
tree also retains decompiler-style global names and raw 32-bit assumptions. It
does not contain the current reconstruction's generated data/import model, but
it has not yet replaced that model with typed portable state.

The current OpenCoD2 baseline remains the local technical checkpoint because
395 selected translation units compile as WebAssembly objects. Do not publish
it without a documented source license. A future GPL restart must begin from
the pinned `xtnded/cod2` tree and recreate portable declarations, source-set
selection, platform seams, and typed state without copying unlicensed generated
transformations. See [SOURCE_BASE_AUDIT.md](SOURCE_BASE_AUDIT.md).

## Source and mode audit

The reconstructed source contains multiplayer `client_mp`, `server_mp`,
`game_mp`, `cgame_mp`, and `ui_mp` families. It contains no corresponding SP
families or SP target. The framework therefore exposes only `cod2-mp`.

The engine-family label is IW 2.0. IW 3.0 belongs to the later Call of Duty 4
generation and is rejected by the static contract test.

The selected reconstructed client, renderer, UI, scripting, qcommon, input,
networking, platform, generated-data, and compatibility sources compile to 395
WebAssembly object files. Native assembly and duplicate bundled zlib sources
are excluded; the browser target uses Emscripten SDL2 and zlib.

## Multiplayer bot foundation

The source tree contains a clean-room control seam for the existing native
test-client lifecycle. It does not supply bot AI, waypoint graphs, or a bot
population script.

`SV_AddTestClient` still owns admission and `ClientBegin`. Bot intent lives in
the fixed 64-entry `s_botCmdState` sidecar rather than `client_t`, preserving
the reconstruction's pinned 32-bit layouts. `SV_BotUserMove` now emits a normal
`usercmd_t` with `svs.time`, the current offhand, the selected weapon, encoded
view angles, and clamped forward/right movement before calling
`SV_ClientThink`.

The server exposes these GSC player methods:

```text
self isBot()
self botStop()
self botMovement(forward, right)
self botAngles((pitch, yaw, roll))
self botWeapon("weapon_name")
self botAction("+fire") / self botAction("-fire")
```

Actions use the reconstructed native `CL_CmdButtons` contract: fire, melee,
activate, reload, use/reload, lean, prone, crouch, stand/jump, ADS, binoculars,
hold breath, frag, and smoke. The ABI rejects non-test clients and clamps each
movement axis to `[-127, 127]`. Add/drop resets the sidecar so intent cannot
leak when a client slot is reused.

The post-link target is an 8-player population with `sv_maxclients 12`.
Independently authored server logic should count humans plus bots, fill to
eight, and drop a bot after each human admission. Do not set `sv_maxclients` to
eight: a full bot population would leave no slot in which a human can connect.
No third-party bot scripts or waypoint graphs may be copied, fetched, tracked,
or included in an image; a future AI/navigation layer must have its own source
and data boundary.

## Exact native blocker

The explicit `cod2_client` target reaches `wasm-ld` and fails because the
reconstruction's native generated data representation relies on symbol aliases
which WebAssembly cannot encode:

- `data32.c` and `literals32.c` contain a native 32-bit data image with both
  data addresses and code pointers;
- `import_pointers_native.c` represents targets uniformly as functions,
  including symbols which are data;
- compatibility placeholders collide with reconstructed functions and statics;
- the native build relies on `--defsym`, multiple definitions, and common-symbol
  merging;
- WebAssembly separates linear-memory data from function-table references and
  rejects cross-kind symbols.

Set `COD2_ATTEMPT_CLIENT_LINK=1` when intentionally reproducing that failure:

```bash
COD2_ATTEMPT_CLIENT_LINK=1 ./scripts/build-web.sh
```

Do not claim a native menu or gameplay until this generator model is repaired
and an engine executable reaches `Com_Init`.

## Framework package

The staged public directory contains only:

```text
cod2-diagnostic.svg
cod2_core_probe.js
cod2_core_probe.wasm
game-adapter.js
wasm-game-data.json
wasm-game-framework.json
wasm-game.json
```

The JS/WASM pair is built locally from `core_probe.c` and the reconstructed MD4
source. It is a diagnostic, not the engine. The adapter reports `launcher`,
then `loading`, then `crashed`; it never reports `menu` or `gameplay` and never
requests input capture, fullscreen, identity, or graphics controls.

The framework owns the document, CSS, service worker, PWA manifest, setup UI,
and viewport. The package checker is mandatory:

```bash
node ../wasm-game-framework/scripts/check-game-package.js \
  out/cod2-wasm-core/site
```

## Required data boundary

`site/wasm-game-data.json` pins 28 `main/*.iwd` paths, sizes, ZIP signatures,
and SHA-256 values totaling 3,685,129,248 bytes. Docker stores this tree under
`/data/main`. The framework setup endpoint is the only write path, and the
allowlisted `/game-data/files/:key` endpoint is the only read path. `/data`,
`/local-data`, and direct `main/*.iwd` URLs must remain inaccessible.

The adapter uses the canonical container-to-IndexedDB client for only the
706-byte `localized_english_iw11.iwd` diagnostic representative. Do not load
the complete archive set into MEMFS. A runnable engine needs an archive-aware
lazy filesystem or another bounded synchronous bridge.

No IWD enters Git, the public site, or a Docker image. Generated JS/WASM stays
under ignored `out/` output.

## Verification

```bash
./scripts/test-web.sh
./scripts/build-docker.sh
./scripts/test-http.sh
```

These checks cover:

- the full reconstructed object compile and native diagnostic output;
- clean-room bot ABI registration, exact native input masks, current-time
  command submission, slot-reset behavior, and absence of bot scripts/waypoints;
- framework v0.9.2 package and adapter validation;
- exact state transitions and safe repeat start;
- canonical PWA metadata and neutral ready-state copy;
- suite and `cod2-mp` locked images;
- COOP/COEP, WASM range requests, setup status, exact mounted-data validation,
  private cache headers, and inaccessible `/data` routes;
- absence of tracked/generated IWD, WASM, data, HTML, CSS, service-worker, and
  web-manifest artifacts.

Chromium testing is intentionally deferred until the shared serialized browser
slot is granted. At this milestone it can verify only launcher, setup/cache,
diagnostic output, PWA, and security behavior; it cannot verify gameplay.

## Next milestone

1. Build a wasm-aware generated-data/import tool that classifies each
   relocation as function-table or linear-memory data.
2. Eliminate every cross-kind and duplicate symbol deterministically.
3. Link `cod2.js`/`cod2.wasm` and reach `Com_Init` using a bounded lazy archive
   subset.
4. Add authoritative native state and capture-intent exports only after a real
   menu and controllable snapshot exist.
5. Then validate WebGL, resize/projection, menu pointer mapping, WASD/mouse,
   Escape, network parsing, audio, persistence, and recovery in that order.
