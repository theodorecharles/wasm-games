# Midtown Madness 2 WASM Runbook

## Objective

Produce a standalone browser implementation compatible with the required
Midtown Madness 2 data, with original single-player and
multiplayer exposed separately. OpenMM2 is presently a reference for structures
and behavior, not a shippable WebAssembly engine.

## Current checkpoint

- Downstream workspace: `/home/ted/Development/wasm/midtown-madness2-wasm`.
- Branch: `devel`; upstream fetch is enabled and upstream push is disabled.
- Source base under evaluation: OpenMM2 at `dc87b5f`.
- OpenMM2 describes itself as mostly abandoned because of technical limits.
- It builds a 32-bit Windows `dinput.dll` proxy, loads the real system DLL,
  identifies the original executable, and hooks/calls functions at fixed
  addresses inside `Midtown2.exe`.
- That execution model cannot run in WebAssembly and is not a standalone source
  port. The original executable cannot be embedded, translated, or distributed
  as a shortcut around this blocker.
- Game data remains outside Git and Docker.

## Absolute downstream-only rule

Do not open upstream pull requests, issues, discussions, or comments. Do not
contact maintainers. Do not push to `upstream`. Publish downstream work only in
`theodorecharles/midtown-madness2-wasm` after the standalone-source gates pass.

## Clean implementation boundary

- Never commit game executables, disc images, maps, models, textures, sound, or
  other game data.
- Do not generate or commit decompiled code, binary translations, copied data
  tables, or address-derived blobs from the original executable.
- Use documented file formats, independently written parsers, observed
  black-box behavior, and source components with clear provenance.
- Review OpenMM2 file-level notices before reusing code in the downstream.
- Selected game data must remain browser-local or privately mounted and must
  never be accepted through an unauthenticated public PUT endpoint.

## Milestone order

1. Document exactly which OpenMM2 subsystems are standalone source and which
   depend on original-process addresses, hooks, or Windows DLL forwarding.
2. Select or create a clean standalone engine boundary with portable math,
   containers, asset parsers, renderer, world simulation, and input.
3. Parse one required archive and render one static scene without loading
   or executing `Midtown2.exe`.
4. Reproduce a native interactive drive with portable SDL and OpenGL/GLES.
5. Add an Emscripten/WebGL 2 target and cooperative main loop.
6. Reach an authentic, asset-driven menu and a single-player drive.
7. Restore traffic, AI, audio, HUD, input, save/profile persistence, and aspect
   behavior.
8. Implement or adapt multiplayer from a documented protocol boundary; preserve
   the original mode separately from campaign AI.
9. Add the shared player-name launcher, graphics ceilings, 30/60/120 FPS dynamic
   quality, browser-local caching, Docker, and server lifecycle.

## Browser acceptance gate

Reserve `http://127.0.0.1:8013/` and test it alone. Do not create a placeholder
page merely to satisfy the Chromium checklist. The first browser artifact is
meaningful only when real engine code parses game data and renders a scene.
Record screenshots and logs under ignored `artifacts/runtime/`.

## Current blocker

OpenMM2's core architecture is injection into the original 32-bit Windows
process. Until a standalone portable engine slice exists, there is nothing
Emscripten can turn into a working game. Report this as a
feasibility/reimplementation lane, not a nearly finished port.
