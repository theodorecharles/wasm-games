# Wolf3D / Spear dialog and menu release — 2026-09-06

## Result

The regular Wolf3D (8011) and Spear (8012) services now contain the cumulative
row-menu pointer/key repairs plus new palette-presentation and screen-clear
repairs. Only these two services were recreated with `--no-deps`. The release
audit preserves all 147 other containers, all 18 owner installation files,
the exact existing mounts (including anonymous volumes), and the old images.

Both isolated final candidates pass real Chrome menu navigation, visible
Change View and Mouse Sensitivity dialogs, clean cancellation, native New
Game/difficulty entry, first-level rendering, forward W taps, primary mouse
fire (8 rounds to 7), Escape pause and pointer Back to Game resume. Wolf's
Episode 1 subtitle also works. This is bounded first-level acceptance, not
full campaign/capture/held-control/listening acceptance.

Post-deployment HTTP identity, lab validation and live Chrome menu/dialog/
first-level/pause/resume follow-up pass. Live input differs from the fresh
candidates: Wolf's W tap moves, but two primary-click attempts stay at 8 rounds;
Spear fires 8→7, but its single W tap does not visibly move. Input reliability
remains open. Candidate results are not substituted for these live results.

## Reproduction and native cause

The previous caption-aware candidate on 32880 displayed a solid red canvas
in both dialogs. Repeated observation confirmed Change View stayed blank;
Escape still worked. Returning left the dialog instructions in the bottom
40 native pixels below the normal 320×200 menu. Retained negative screenshots:
[blank view](wolf-dialog-view-settled-2026-09-06.jpg),
[stale instructions](wolf-dialog-view-escape-2026-09-06.jpg), and
[blank sensitivity](wolf-dialog-sensitivity-red-2026-09-06.jpg).

Inspection of the installed Emscripten 6.0.6 SDL 1 implementation established:

- `SDL_SetPalette` updates the color table but does not repaint the canvas.
  These dialogs draw under a faded palette, then fade in without drawing
  again. Blinking row menus eventually repaint, hiding the same underlying
  problem. Browser-only `VL_WebPresentPalette` now locks/unlocks the indexed
  surface after forced palette changes. Non-forced per-frame palette changes
  retain their existing behavior; desktop/true-color paths are unchanged.
- SDK `SDL_FillRect` paints only its canvas backing. The native indexed buffer
  retains old pixels that are uploaded again on the next native update.
  Browser `VL_ClearScreen` now uses the existing pitch-aware native bar-fill
  path, clearing the indexed buffer as well.

The canonical fourth patch is `browser-palette-present.patch`. No SDK source
was edited. The original non-UTF-8 `browser.patch` remains byte-identical.
All four patches reconstruct all 13 changed files exactly from pinned source
`3d41ccce8f8fecbed83aa9d8d42734c2c7e62374`.

## Tests and build repair

- Extracted production C++ palette/clear tests: 44 browser and 39 desktop
  cases pass under UBSan. Missing-presentation and canvas-only-clear controls
  each fail six of 44 cases. See [native record](palette-native-2026-09-06.json).
  These mocked SDL tests do not replace the real Chrome result.
- Existing 40 pointer, 28 movement and 12 key-pump cases pass.
- The complete canonical `scripts/test-web.sh` now builds both variants from
  clean objects, validates native Wasm, adapters, static assets and data bounds.
  ImageMagick 6 `convert` is accepted alongside `magick`; detection occurs
  before removing generated dist files. The SDK's missing `file` command is
  replaced by actual `WebAssembly.validate`, not a skipped check.
- `build-images.sh` builds the native pair once; per-image checks still run.
  The default image path rebuilds the pinned framework base instead of quietly
  reusing a stale base. A package gate hashes all 16 installed site assets and
  the four effective `/opt/shared-shell` files against the current framework
  0.9.6 distribution. Both image HTTP/PWA/range/private-data checks pass.
- Release audit checks 14 public files at each candidate and live endpoint,
  both Wasm modules, variant lock and owner-data readiness. The two staged
  shared-shell metadata/template copies are not public routes; metadata is
  checked at its actual root route. See [before](palette-release-before-2026-09-06.json)
  and [after](palette-release-after-2026-09-06.json).

Retained build container: `wolf-family-palette-build-20260906`, exit 0.
Build log: `/tmp/wolf-family-palette-build-20260906.log`; image log:
`/tmp/wolf-family-palette-images-20260906.log`. Toolchain:
`local/build-wasm-toolchain:6.0.6`, image
`9bc6c7b128b567c4001321ef4167356b672e8129673991f6aec946ba53a393e0`.
Framework base: `local/wasm-game-framework:build-family-20260906`.
The earlier first attempt completed native compilation but exited 127 on
missing `file`; only the later clean successful runs are acceptance evidence.
Earlier `menu-release-20260906` images lack the new native fix and are not
the deployed release.

## Chrome scope

The Chrome-control skill supplied normal launcher clicks, native canvas menu
clicks, keyboard arrows/Enter/Escape/W, and screenshots. Evaluation only read
application-authored DOM datasets/logs. No engine calls, forced map loads,
storage manipulation or capture bypass was used.

- Wolf: [visible view](wolf-palette-view-visible-2026-09-06.jpg),
  [smaller view after Left](wolf-palette-view-smaller-2026-09-06.jpg),
  [clean cancellation](wolf-palette-view-cancel-clean-2026-09-06.jpg),
  [sensitivity](wolf-palette-sensitivity-visible-2026-09-06.jpg).
  Right adjusts the slider; Left restores its original value; Enter returns
  to Control. Customize opens and Escape returns, without changing bindings.
  Several keyboard-binding labels appear blank in that editor; this remains
  a separate follow-up, not a claimed fully accepted custom-binding UI.
- Wolf: [first room](wolf-palette-world-2026-09-06.jpg),
  [movement](wolf-palette-forward-2026-09-06.jpg),
  [7 rounds after firing](wolf-palette-fire-observed-2026-09-06.jpg),
  [pause](wolf-palette-pause-2026-09-06.jpg),
  [resume](wolf-palette-resumed-2026-09-06.jpg).
- Spear: [visible view](spear-palette-view-visible-2026-09-06.jpg),
  [clean cancellation](spear-palette-view-cancel-clean-2026-09-06.jpg),
  [sensitivity](spear-palette-sensitivity-visible-2026-09-06.jpg),
  [first level](spear-palette-world-2026-09-06.jpg),
  [movement](spear-palette-forward-2026-09-06.jpg),
  [7 rounds after firing](spear-palette-fire-observed-2026-09-06.jpg),
  [pause](spear-palette-pause-2026-09-06.jpg),
  [resume](spear-palette-resumed-2026-09-06.jpg).

Each screenshot has a matching same-stem JSON observation. The release audit
hashes the required 16 candidate pairs. Normal browser clicks did not establish
pointer lock; the controls mask and scheduled audio are not held-control or
audible-listening proof. No saves were created or overwritten in this pass.
Isolated candidates retain owner-data read-only binds on 32990/32991.

### Post-deployment Chrome

Twenty live pairs verify the normal 8011/8012 origins with existing cached
owner data, without clearing browser storage or changing native settings.
Both pass mouse Change View, visible instructions, Escape clean menu return,
native New Game/difficulty, first-level world/HUD, Escape pause and mouse
Back to Game. Wolf also passes the Episode 1 subtitle click.

- Wolf [view](wolf-palette-live-view-2026-09-06.jpg),
  [clean return](wolf-palette-live-view-return-2026-09-06.jpg),
  [world](wolf-palette-live-world-2026-09-06.jpg),
  [pause](wolf-palette-live-pause-2026-09-06.jpg),
  [resume](wolf-palette-live-resumed-2026-09-06.jpg),
  [forward movement](wolf-palette-live-forward-2026-09-06.jpg).
  The unfortunately named `wolf-palette-live-fired` record is an **attempt**,
  not success: ammo remains 8, as it does after a separate
  [second attempt](wolf-palette-live-fire-recheck-2026-09-06.jpg). The cause is
  not yet established; persisted bindings and event delivery need inspection.
- Spear [view](spear-palette-live-view-2026-09-06.jpg),
  [clean return](spear-palette-live-view-return-2026-09-06.jpg),
  [world](spear-palette-live-world-2026-09-06.jpg),
  [firing 8→7](spear-palette-live-fire-observed-2026-09-06.jpg),
  [pause](spear-palette-live-pause-2026-09-06.jpg),
  [resume](spear-palette-live-resumed-2026-09-06.jpg).
  Its single live W tap did not visibly move, unlike the isolated candidate.

[Evidence integrity record](palette-chrome-evidence-2026-09-06.json) hashes all
47 final-build Chrome pairs (27 candidate, 20 live) plus three native/release
records: 97 hashes. Its script checks identity/state coverage, not screenshot
semantics or ammo OCR. No live save was created/overwritten. The owned Chrome
tab was returned to `about:blank` after the checks.

## Exact images and scoped rollback

Wolf: `local/wolf3d-wasm:palette-release-20260906`,
`sha256:3424e05557beb19fae09b34342fc91ef01655d55e779f5d5150046ffc898aad0`.
Spear: `local/spear-wasm:palette-release-20260906`,
`sha256:4be9738a26a29d6928b7e546fa477d64cca3f36ba2eb777b9f5a4c3cbf9c3345`.
The normal `wolf3d-wasm:dev` / `spear-wasm:dev` tags and lab image contracts
point to these exact IDs. Lab image validation passed before and after.

Retained rollback tags:

- `local/wolf3d-wasm:before-palette-20260906` →
  `sha256:9a304102e0f4a92dcf6153fb677e6c5e715b7fdbbbdac6d4413f940911c55aba`.
- `local/spear-wasm:before-palette-20260906` →
  `sha256:7cc618d3203d8af89174107f656c7bede2483d5ca3f9fd32854674d509dd98fc`.

If rollback is required, restore only these two normal tags from their retained
rollback tags and update only their `imageId` fields in the lab contract to
the old IDs. Run `./validate.sh --images`, then
`docker compose up -d --no-deps wolf3d spear` from the lab. Do not run broad
stack stop/start, renew anonymous volumes, delete owner data, or clear browser
storage. Existing owner data is `/home/ted/wasm-game-data/wolf3d` for both.

Remaining: live Wolf firing/Spear quick-movement discrepancies, custom-binding
labels/editing, confirmation dialogs, save/full-reload/load, pointer
capture/fullscreen, held controls, audible mix and extended play.
