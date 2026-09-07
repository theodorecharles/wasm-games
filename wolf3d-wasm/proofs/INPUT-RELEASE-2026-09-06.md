# Wolf3D / Spear quick-input release — 2026-09-06

## Result

The quick-key/quick-mouse fix is deployed on Wolf3D **8011** and Spear **8012**.
Both normal origins, with their existing cached data, now show forward W-tap
movement and primary-click firing from 8 rounds to 7 in real Chrome. This
addresses the missed-input discrepancies recorded during the earlier
[palette release](PALETTE-RELEASE-2026-09-06.md); those historical observations
remain intact. Menus and Escape/pointer resume also pass on both live origins.

Only these two services were recreated using `--no-deps`. The scoped audit
verifies all **150 other containers**, all **18 owner installation files**,
the same mounts/ports and retained rollback images. No browser storage reset,
save creation/overwrite or binding change was used for this acceptance.

## Native cause and implementation

Live Wolf's Customize menu already maps mouse b0 to Fire:
[binding inspection](wolf-input-live-bindings-2026-09-06.jpg). The issue was
not repaired by changing that binding.

Inspection of the installed Emscripten 6.0.6 SDL implementation showed that
`SDL_PollEvent` updates its held-button state while translating queued events.
Wolf gameplay drains the complete queue before sampling keyboard/mouse controls.
A down/up pair between frames therefore leaves the held state released and
can disappear before the gameplay poll. Menus already had a separate key-pump
repair, but gameplay still used held state alone.

The fifth canonical patch, `gameplay-input-edges.patch`, records gameplay key
and mouse press edges until one controls sample consumes them. Held state is
not rewritten or prolonged. Mouse left/right/middle bit mapping is preserved;
keyboard button bindings, WASD/arrow movement and quick run/forward chords use
the sampled state. Focus loss, key clearing and capture loss discard stale
edges; menu/loading events do not become gameplay presses. Mouse polling still
uses the existing native capture gate; this patch does not bypass pointer lock.

The adapter exposes read-only DOM diagnostics for processed key/mouse edges,
the last mouse sample and native flags. Flags 7 mean native GrabInput, mouse
enabled and left-button Fire mapping. **They do not mean browser pointer lock.**
The legacy engine sets GrabInput during SDL startup even when Chrome's actual
pointer-lock element is null. That remaining capture discrepancy is separate.

## Verification

- Extracted production C++ event/poll tests under UBSan pass **81 Wolf**, **81
  Spear** and **73 desktop** cases. Removing the key-edge behavior fails 13
  cases; removing mouse-edge sampling fails 7. This covers short presses,
  held/released states, chords, bit mapping, consumption, transitions and bounds.
  See [native fixture evidence](gameplay-input-native-2026-09-06.json).
- Existing 28 movement, 40 menu-pointer, 12 menu-key and 44 browser/39 desktop
  palette cases pass. Both adapter contracts, including diagnostics, pass.
- All five patches reconstruct all 13 patched source files exactly from
  `3d41ccce8f8fecbed83aa9d8d42734c2c7e62374`. Original `browser.patch` remains
  byte-identical. Source preparation now identifies complete applied prefixes
  instead of reverse-checking each overlapping patch independently. Six prefix
  states, repeated runs, local Markdown preservation and overlapping-edit
  refusal are tested. No source reset or local-edit overwrite is used.
- Full canonical `scripts/test-web.sh` clean-builds both native variants with
  SDK 6.0.6. Both Wasm modules, adapters and framework/data boundaries pass.
  Canonical images pass all 16 installed site-file hashes, four effective-shell
  hashes and HTTP/PWA/range/private-data gates. Each live endpoint matches 14
  public asset hashes and reports the correct variant with owner data ready.
- Lab `validate.sh --images` passes: 45 shortcuts, 30 runtime endpoints,
  32 services, 30 contracts and 28 icons.

Build container `wolf-family-input-build-20260906` finished with exit 0.
Successful log: `/tmp/wolf-family-input-build-bundle-20260906.log`;
image log: `/tmp/wolf-family-input-images-20260906.log`.
Two earlier attempts stopped before compilation because a temporary test clone
hit Git ownership checks; the test now clones an offline bundle instead.
Those failed logs are retained and are not successful-build evidence.

## Chrome observations and limits

The Chrome-control skill supplied real launcher/menu clicks, W and Escape taps,
primary clicks and screenshots. Evaluation read only application-authored DOM
state/logs. No injected engine input, forced map load or capture bypass was used.

- Wolf candidate: [start](wolf-input-world-2026-09-06.jpg),
  [forward](wolf-input-forward-2026-09-06.jpg),
  [8→7 shot](wolf-input-fire-one-2026-09-06.jpg),
  [pause](wolf-input-pause-2026-09-06.jpg),
  [resume](wolf-input-resumed-2026-09-06.jpg),
  [post-resume 8→7 shot](wolf-input-resume-fire-2026-09-06.jpg).
- Spear candidate: [start](spear-input-world-2026-09-06.jpg),
  [forward](spear-input-forward-2026-09-06.jpg),
  [8→7 shot](spear-input-fire-one-2026-09-06.jpg),
  [pause](spear-input-pause-2026-09-06.jpg),
  [resume](spear-input-resumed-2026-09-06.jpg),
  [post-resume 7→6 shot](spear-input-resume-fire-2026-09-06.jpg).
- Live Wolf: [start](wolf-input-live-world-2026-09-06.jpg),
  [forward](wolf-input-live-forward-2026-09-06.jpg),
  [8→7 shot](wolf-input-live-fire-one-2026-09-06.jpg),
  [pause](wolf-input-live-pause-2026-09-06.jpg),
  [resume](wolf-input-live-resumed-2026-09-06.jpg).
- Live Spear: [start](spear-input-live-world-2026-09-06.jpg),
  [forward](spear-input-live-forward-2026-09-06.jpg),
  [8→7 shot](spear-input-live-fire-one-2026-09-06.jpg),
  [pause](spear-input-live-pause-2026-09-06.jpg),
  [resume](spear-input-live-resumed-2026-09-06.jpg),
  [post-resume 7→6 shot](spear-input-live-resume-fire-2026-09-06.jpg).

Two Wolf follow-up screenshots are inconclusive for ammo comparisons:
`wolf-input-fire-two` and `wolf-input-live-resume-fire` show lives decreasing
from 3 to 2 and ammo resetting to 8 before observation. Their press counters
increment, but they are **not** counted as proof of those shots. They are retained.

Each screenshot has a same-stem JSON observation. The
[integrity record](input-chrome-evidence-2026-09-06.json) hashes 30 pairs plus
three native/release records. Automated checks validate origin, state, cache
source, counters and file integrity, not visual ammo OCR or movement semantics.
All final-build records show actual pointer lock absent. Capture/fullscreen,
genuinely held Chrome input, custom-binding labels/editing, save/load, audible
mix and extended play remain open. This is not full-game acceptance.

## Exact release and rollback

- Wolf: `wolf3d-wasm:dev` / `local/wolf3d-wasm:input-edges-20260906`, image
  `sha256:c98f904e614d64d59bdba5aab6a31ca5a0ab8426e145b4292b62f00e46fe1636`.
- Spear: `spear-wasm:dev` / `local/spear-wasm:input-edges-20260906`, image
  `sha256:4e4bb23794fca5ce5c258e24ef097280a391e518b24175cb811bea51c4e2e2d1`.
- Retained rollback `local/wolf3d-wasm:before-input-20260906`, image
  `sha256:3424e05557beb19fae09b34342fc91ef01655d55e779f5d5150046ffc898aad0`.
- Retained rollback `local/spear-wasm:before-input-20260906`, image
  `sha256:4be9738a26a29d6928b7e546fa477d64cca3f36ba2eb777b9f5a4c3cbf9c3345`.

See the immutable [before](input-release-before-2026-09-06.json) and
[after](input-release-after-2026-09-06.json) audits. Isolated candidates remain
on 32992/32993 with read-only owner-data binds. The owned Chrome tab is blank.

If rollback is needed, restore only these two recorded image IDs/tags and the
matching `image-contracts.json` entries, validate, then recreate only `wolf3d`
and `spear` with `--no-deps`. Preserve all mounts and anonymous volumes; do not
clear browser storage or use a broad stack restart. Earlier palette/menu
release audits describe their original inventory and should not be rerun as
current-dist acceptance after this newer build.
