# Wolf3D / Spear binding-label release — 2026-09-06

## Result

Deployed on Wolf3D **8011** and Spear **8012**. Customize now shows Shift,
Ctrl, Alt and arrow-key names instead of blank fields. Both normal origins,
using their existing cached data, pass native menu/label inspection, first-level
entry, W movement, primary firing **8→7**, pause and Back to Game.

On isolated Wolf 32994, the native editor changed Fire from Ctrl to F;
F fired **7→6**, and Ctrl was restored through the same editor. No live bindings
were changed, browser storage cleared, or saves created/overwritten. Editing
and restoration here are same-session evidence, not persistence acceptance.

Only `wolf3d` and `spear` were recreated with `--no-deps`. The scoped audit
preserves all **155 other containers**, all **18 owner files**, exact mounts
and ports, and the previous images as rollback tags. See the immutable
[before](bindings-release-before-2026-09-06.json) and
[after](bindings-release-after-2026-09-06.json) records.

## Cause and changes

The installed Emscripten 6.0.6 SDL compatibility headers use masked SDL2-style
special-key values: Up is 1106, left Shift 1249, and `SDLK_LAST` 1536. Wolf's
name table still used legacy SDL1 numeric positions, with only its first 322
entries initialized. Indexing it with the SDK's special keys returned null;
ASCII Space continued to work. This was a key-name lookup problem, not missing
saved bindings. The [before screenshot](wolf-bindings-before-2026-09-06.jpg)
records the old behavior.

The sixth canonical patch, `browser-key-names.patch`, switches special-key
names using the active SDK's constants, bounds printable-table lookup, and
uses `?` for unsupported/invalid codes. It also corrects the old printable
`g` and `%` names. Existing binding values and config formats are unchanged.

The browser-controller seam used the same legacy special-key numbers. It now
translates those seven arrow/modifier codes to the SDK constants before
updating native key state; ASCII remains unchanged. This bridge has native
regression coverage, **not physical-controller acceptance**. The manifest still
disables controller selection.

The shared framework now publishes bounded, read-only capture attempt/status,
error and request-context diagnostics. Promise rejection details survive a
later generic error event. The request/capture policy itself was not changed.
Only these two newly built game images receive this framework update.

## Verification

- [Binding regressions](key-bindings-native-2026-09-06.json): **161 Wolf / 161
  Spear** cases under host UBSan, compiling the SDK's real key enums and compat
  aliases. The old name table fails 34 cases; old controller translation fails
  14. Printable names, special keys, invalid bounds, bridge press/release and
  unchanged ASCII are covered. Platform integer declarations are host stubs;
  the key definitions themselves are copied from the actual SDK and hashed.
- [Expanded gameplay regressions](gameplay-input-sdk-2026-09-06.json): 81 Wolf,
  81 Spear, 73 desktop, plus **81 SDK-key Wolf / 81 SDK-key Spear**. Missing-key
  and missing-mouse controls fail 13 and 7 cases. The earlier input release's
  mock-key fixture remains a historical record; these new modes cover the real
  SDK ABI as well.
- All six patches reconstruct all 13 patched source files exactly from
  `3d41ccce8f8fecbed83aa9d8d42734c2c7e62374`. Seven source-preparation prefixes,
  repeat runs, local-note preservation and overlapping-edit refusal pass.
  Original `browser.patch` remains byte-identical.
- Full canonical `scripts/test-web.sh` clean-built both variants using SDK
  6.0.6. Menu-pointer 40, movement 28, menu-key 12, browser palette 44 and
  desktop palette 39 cases pass, as do both adapter contracts and Wasm checks.
  Retained build container `wolf-family-keys-build-20260906` exited 0; log
  `/tmp/wolf-family-keys-build-20260906.log`.
- The final framework diagnostics-only update passes the complete framework
  `npm test`, including async rejection, stale settlement and legacy-event
  checks. Final log `/tmp/wolf-bindings-framework-final-tests-20260906.log`.
  The framework package was reinstalled into the generated distribution, then
  both images were rebuilt without recompiling unchanged native modules.
- Both final images pass all 16 installed site-file hashes, four effective-shell
  hashes, HTTP/PWA/range/private-data gates and 14 public HTTP asset hashes per
  live endpoint. Image log `/tmp/wolf-family-keys-context-images-20260906.log`.
  Lab `validate.sh --images` passes 45 shortcuts, 30 runtime endpoints/contracts,
  32 services and 28 icons.

## Chrome evidence and limits

The Chrome-control skill supplied real menu/launcher clicks and key presses;
evaluation only read application-authored DOM state. No injected native input,
forced maps, synthetic events or pointer-lock bypass was used.

- Editing: [F binding](wolf-bindings-edit-f-2026-09-06.jpg),
  [7-round baseline](wolf-bindings-world-ready-2026-09-06.jpg),
  [F shot to 6](wolf-bindings-f-shot-2026-09-06.jpg),
  [Ctrl restored](wolf-bindings-restored-2026-09-06.jpg).
- Final candidate labels: [Wolf](wolf-bindings-final-visible-2026-09-06.jpg),
  [Spear](spear-bindings-visible-2026-09-06.jpg).
- Live Wolf: [labels](wolf-bindings-live-visible-2026-09-06.jpg),
  [world](wolf-bindings-live-world-2026-09-06.jpg),
  [forward](wolf-bindings-live-forward-2026-09-06.jpg),
  [shot](wolf-bindings-live-fire-2026-09-06.jpg),
  [pause](wolf-bindings-live-pause-2026-09-06.jpg),
  [resume](wolf-bindings-live-resumed-2026-09-06.jpg).
- Live Spear: [labels](spear-bindings-live-visible-2026-09-06.jpg),
  [world](spear-bindings-live-world-2026-09-06.jpg),
  [forward](spear-bindings-live-forward-2026-09-06.jpg),
  [shot](spear-bindings-live-fire-2026-09-06.jpg),
  [pause](spear-bindings-live-pause-2026-09-06.jpg),
  [resume](spear-bindings-live-resumed-2026-09-06.jpg).

Every screenshot has a same-stem JSON observation. The
[integrity record](bindings-chrome-evidence-2026-09-06.json) hashes **39 pairs /
82 files**, including four native/release records. Its script checks 28 core
candidate/live observations and additional editing provenance. Visual names,
movement and ammo were reviewed manually, not inferred from counters or OCR.

The early `wolf-bindings-world` image caught a black transition, so it is not
rendered-world proof. `wolf-capture-click` and `wolf-bindings-final-resume-fire`
caught enemy-death animations; they are retained but not accepted as stable
post-resume gameplay. Final Spear's additional post-resume shot shows 7→6.

### Capture remains open

Both final candidates and live endpoints return **WrongDocumentError** on
gameplay mouse-lock requests. The captured request context shows a trusted
pointer event, connected canvas belonging to the same document, a visible and
focused page, and active transient activation. This rules out those simple
request-context explanations, but does **not** establish the underlying
browser/platform cause. The shared diagnostics do not turn rejection into
successful capture.

Actual `document.pointerLockElement` remains null. Native flags 7 still reflect
the legacy startup GrabInput setting, not browser capture. The SDK's
`SDL_WM_GrabInput` implementation is a no-op. There is also a separate native
launch-intent timing gap: its exported intent only reflects state 5 after the
worker exits the menu, not necessarily during the initiating trusted click.
Escape keyup may request capture while the worker still reports gameplay.
These remain follow-up work; no native capture-state bypass was added here.

Wolf's final isolated launcher was also tested with Launch fullscreen selected;
the observed fullscreen element remained null. Fullscreen, real held controls,
binding persistence/additional binding types, save/full-reload/load, audible
mix, physical gamepads and extended gameplay remain unaccepted.

## Exact deployment and rollback

- Wolf: `wolf3d-wasm:dev` / `local/wolf3d-wasm:keys-context-20260906`,
  `sha256:8cf8bfa5554c763718a0b423f8b248b15acae777a67e69fbb190aba633a885f5`.
- Spear: `spear-wasm:dev` / `local/spear-wasm:keys-context-20260906`,
  `sha256:94477cd29268528896f64ad1dce7a9b032a7013913b16e83b18e9d696be47a88`.
- Wolf rollback: `local/wolf3d-wasm:before-bindings-20260906`,
  `sha256:c98f904e614d64d59bdba5aab6a31ca5a0ab8426e145b4292b62f00e46fe1636`.
- Spear rollback: `local/spear-wasm:before-bindings-20260906`,
  `sha256:4e4bb23794fca5ce5c258e24ef097280a391e518b24175cb811bea51c4e2e2d1`.
- Effective framework: `local/wasm-game-framework:wolf-capture-context-20260906`,
  `sha256:73821385112cb6df46f650859a4cc0e6718b3e6aef07f70cf1d58e08c287f330`.

Final isolated candidates remain on **32996/32997** with read-only owner binds;
earlier diagnostic candidates 32994/32995 and prior releases remain retained.
The owned Chrome tab is blank. If rollback is needed, restore only the two
recorded rollback images and matching lab `image-contracts.json` IDs, validate,
then recreate only `wolf3d spear` with `--no-deps`. Preserve anonymous volumes,
mounts, owner data and browser storage. Do not rerun the historical input or
palette release audits against this newer distribution.
