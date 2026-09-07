# Blood Modernized and integrated Build-family checkpoint — 2026-09-06

Blood now has selectable Classic (800×600 software) and Modernized
(1280×720 widescreen Polymost/OpenGL) profiles. Both retain full mouse look.
The initial isolated package passes real Chrome pitch/yaw, movement, menu
round trips, named save/full reload/load and Modernized-to-Classic save loading.
The complete four-module family build also succeeds. This is the pre-release
checkpoint; the later [scoped live release](BUILD-RELEASE-2026-09-06.md)
supersedes its deployment status. **Not full-game acceptance.** The reported
Blood crash remains deferred as requested.

## Implementation

- `web/blood-adapter.js` selects separate JS/Wasm/preload files and display
  geometry, locks selection after launch and preserves campaign/intro/autostart
  arguments. Modernized uses `modernized.cfg` and native matching cvar files;
  Classic keeps `nblood.cfg`. Owner-data cache and native save directory remain
  shared. Existing profile settings are not replaced with defaults.
- `games/blood/patches/browser.patch` supplies browser-only GPU/software defaults
  and publishes native player pitch/horizon/view-angle telemetry. The shared
  Polymost shader/texture/alpha/projection repairs from Duke are reused.
- `build-web.sh` builds both games in both profiles and stages both Blood
  preload resources. Only the native `nblood.pk3` resource is bundled, not
  proprietary Blood data. The public manifest and adapter/package checks cover
  both profiles for both games.
- Both Modernized builders now force the final link only when `rev.o` already
  exists. The old unconditional `make -W` skipped creation of this required
  object on a fresh build. The full build completed with fresh Modernized
  object directories for both games.
- A pinned SDK 6.0.6 toolchain recipe adds ImageMagick for source-derived PWA
  artwork. The builder accepts its v6 `convert` or v7 `magick` command. The
  family whitespace check is scoped to this family instead of unrelated dirty
  files elsewhere in the monorepo.

## Chrome evidence: initial isolated 32987

The Chrome-control skill supplied actual browser clicks, key taps, screenshots
and read-only DOM-authored diagnostics. No engine-global input injection,
synthetic events, draw observer or capture bypass was used.
[Evidence audit](blood-modernized-evidence-2026-09-06.json): **30 Chrome pairs,
63 hashed files**. The audit distinguishes a misleading filename (`episode`
still shows the main menu after an ineffective mouse click) from the actual
keyboard-selected episode. Blood's native menus use keyboard navigation.

1. Native menus and E1M1 render at 1280×720, mode 3 / 32 bpp. The starting
   room, pitchfork, cobwebs and HUD are visible.
2. Real downward motion changes Q16 player look from `0` to `-22740992`;
   upward motion brings it to `-6094848`. Horizontal motion changes the native
   sprite angle `0→859`. A W tap changes position from
   `(-14976,33280,-29360,859)` to `(-15062,33316,-35504,859)`.
3. Escape pauses and resumes. F2 opens Save Game; the empty first slot visibly
   accepts `B`, then `7`. Enter writes the new **B7 / game0000.sav** save.
   No existing save was overwritten.
4. Full page reload remembers Modernized and restores owner data from cache.
   The native load list retains B7. Loading restores the exact position
   `(-15062,33316,-35504,859)` and Q16 look/horizon/view tuple
   `(-6094848,-1922325,-6094848,56320000)`. The screenshots are visually
   consistent but **not byte-identical**; no pixel-identity claim is made.
5. Actual launcher selection returns to Classic, mode 0 / 8 bpp at 800×600.
   Classic loads B7 at the same native position. A W tap in either profile
   advances to `(-15148,33352,-35504,859)`. Switching back opens GPU mode again.

The initial package exposed a false diagnostic after reloading bindings:
`bloodControlsMask=28` despite W actually moving. Native cvar replay can place
W/S in the secondary binding slot; the old diagnostic inspected only primary
slots. The canonical fix checks both slots without changing actual bindings.
[Native/Wasm regression](blood-controls-slots-2026-09-06.json) passes 512
presence/slot/mouselook combinations per target; the primary-only control fails
on both. The initial browser evidence deliberately retains that old false
warning rather than rewriting it into a pass.

The first 32987 package remains retained with its B7 browser save. Its
[package audit](blood-modernized-package-2026-09-06.json) preserves Classic
Blood and both Duke modules byte-for-byte relative to the preceding candidate.
The [source snapshot](blood-modernized-source-2026-09-06.json) is the pre-slot-fix
tree `98041d1a6e9bbfccc7f85000fdb1ba8edd20c1fe`.

## Full canonical build and current candidate

The [current source audit](blood-modernized-slots-source-2026-09-06.json)
matches all 1,702 pinned/patched files, tree
`4a724072809f49588749b7b51e6d761c551933de`, and proves preparation remains
idempotent and preserves developer Markdown.

`build-web.sh` completed all four native modules and framework staging.
`BUILD_WASM_SKIP_BUILD=1 scripts/test-web.sh` and `scripts/test-static.sh` pass;
all four binaries also pass actual `WebAssembly.validate`. The existing
adapter suite covers 13 profile/input scenarios. The shared production shaders
pass [7,680 color and 7,680 depth checks on AMD](blood-modernized-alpha-amd-2026-09-06.json),
with missing-discard failures. These are shader tests, not whole-map acceptance.

The first assembled image on 32988 reused an older framework base even though
the staged shell was current. A new package audit catches that mismatch at the
**effective served shell**, not only the unused staged copy. Its stale-base
negative fails as expected. The current image includes the existing framework
worktree's runtime/bootstrap fixes; no sibling framework source was edited.
Its runtime, shell, bootstrap-console and document test files all pass.

[Current package audit](build-family-package-2026-09-06.json) verifies all
26 staged/installed files, native HTTP assets, both private read-only data
mounts, the actual served shell bytes and successful build/test completion.
Container: `build-family-current-proof-20260906`, localhost **32989**.
Image: `sha256:b50185ae5750bfa4d571ddcb7677b07af8b01f33000b0e3573f995a68f5e6500`.
It contains both games and both profiles; the preceding 32988 package is
retained as the stale-shell negative, not the release candidate.

## Open gates

The [integrated Chrome audit](build-family-evidence-2026-09-06.json) passes
16 pairs / 35 hashed files. All four modules render the first level and respond
to W. Both Duke profiles fire, visibly reducing ammo 48→47. Modernized Blood
pauses/resumes and replays its native cvar file after full reload with the fixed
controls mask 31 / valid=true. Classic Blood uses the public first-map autostart
path in this integrated pass, not native campaign-menu/music acceptance.
Initial-room/control checks are not broader campaign/combat or full
renderer-fidelity acceptance. Left-click
delivery was observed in the first package but its screenshots do not retain
an attack animation; do not count that as new weapon acceptance. Held controls,
pointer capture/fullscreen and audio listening remain open. Audio contexts run
and native music logs appear, but that is not a listening test. Existing SDK
`glUniform1f` location `-1` and unsupported texture-cache warnings remain visible.
The deferred firing crash is still open. No live service was replaced during
this candidate checkpoint; see the later release linked above.

Recheck with `node build-wasm/scripts/test-blood-modernized-evidence.mjs`,
`node build-wasm/scripts/test-blood-controls-mask.mjs`,
`node build-wasm/scripts/test-source.mjs`, and
`node build-wasm/scripts/test-family-modernized-evidence.mjs`.
The frozen package audit includes the pre-release live-image baseline and must
not be rerun as a post-release unchanged-live assertion.
