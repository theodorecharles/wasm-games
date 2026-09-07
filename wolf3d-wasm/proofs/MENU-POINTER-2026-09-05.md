# Wolf3D/Spear menu input — 2026-09-05

## Result and scope

Isolated Chrome candidates now accept mouse-driven New Game/difficulty selection,
render both games' first levels, pause on Escape and resume through a mouse click
on Back to Game. The lab services are unchanged. This is menu/startup acceptance,
not full gameplay or pointer-capture acceptance.

The final package also repairs Wolf3D's two-line episode hit boxes. Its native,
build, HTTP and both games' Chrome first-level/pause/resume checks pass.
The preceding package's complete first-level checks are retained.

## Reproduced causes and changes

- Current lab images already contain the earlier A/D strafe-only repair, but
  Chrome reproduced a hidden cursor and an ignored Sound click. The package
  selected `menuCursor: none` and excluded the legacy relative menu mouse path.
- `menu-pointer.patch` adds a native atomic pointer mailbox to `HandleMenu`.
  The adapter forwards uncaptured absolute menu coordinates, with a browser
  cursor and a 320×240 coordinate space. Native menus occupy its upper 320×200;
  mapping them across the full canvas as 320×200 would offset hit testing.
  Quick release clicks remain latched until the worker polls them. Disabled
  items, mismatched press/release rows, cancellation and menu transitions are
  handled explicitly. Captured gameplay deltas retain their existing path.
- Wolf3D episode entries have two text lines, with spacer items between titles
  but no trailing spacer after Episode 6. Both lines now select their title;
  ordinary disabled menu rows are still ignored. The native availability dialog
  remains responsible for unavailable episodes.
- The first pointer-only candidate exposed a separate fast-key failure: two
  quick Escape attempts left the Sound panel open. `IN_ProcessEvents` drained
  keydown and keyup before the menu sampled the keyboard array. The browser-only
  `menu-key-pump.patch` stops a menu/paused-state poll after each keydown, leaving
  its release for the next poll. Gameplay event draining is unchanged.
- Source preparation no longer deletes every Markdown file from its checkout.
  Build jobs default to four; the build now gates source, pointer, movement and
  menu-key regressions. HTTP tests explicitly select each requested variant.

## Reproducibility and tests

Pinned source: `3d41ccce8f8fecbed83aa9d8d42734c2c7e62374`.
SDK: `emscripten/emsdk:6.0.6`; framework 0.9.6.

- 40 production pointer-mailbox/hit-test cases pass; using the preceding
  one-row episode call fails six caption cases.
- 28 extracted production movement/config-direction cases pass across both
  variant defines; omitting the existing arrow-direction restoration fails 24.
- 12 extracted production event-pump cases pass; six fail before the fix.
- All three canonical patches reconstruct all 13 patched files byte-for-byte.
  The original `browser.patch` remains byte-identical, including its non-UTF-8
  upstream comment; it was not decoded and rewritten.
- Both native clients rebuild; their Wasm exports and public JavaScript
  wrappers contain `WolfWasm_BrowserMenuPointer`. Both adapter contracts,
  package validation, JavaScript syntax and both variant HTTP/PWA/range/private
  data checks pass. Six staged artifact hashes match the final image.

The native builds use the canonical make commands inside the SDK, with a clean
between variants. The full `build-web.sh` wrapper was not invoked in that SDK
container (it lacks ImageMagick); unchanged app/framework assets were reused
from the validated staged package. These tests do not establish concurrent
scheduling correctness, actual held-key browser movement or actor physics.

Final image: `local/wolf4sdl-wasm:menu-captions-candidate`,
`sha256:f5a1129956f16a900f6987e381baaf8e40963d1d36da4cf450b78105af29ce67`.
Wolf candidate is on port 32880; Spear is on 32881. Both mount owner data
read-only. Prior test containers are stopped and retained, not deleted.
See [build record](menu-captions-build-2026-09-05.json).

## Chrome evidence

The Chrome-control skill was used for normal launcher buttons, native menu
clicks, keyboard Escape and screenshots. Browser evaluation read only
application-authored DOM state/logs; no engine globals or forced map loads.

The preceding combined pointer/key package (`73f42d352686…`) verifies:

- Wolf3D: Sound click opens its panel; quick Escape returns to the main menu;
  disabled Save Game is ignored before a game starts. Mouse New Game → Episode 1
  title → Bring 'em on renders the first room, pistol and HUD (100 health, 8
  rounds). Escape pauses; clicking Back to Game restores the same world.
- Spear: mouse New Game → Bring 'em on renders the first level, foreground
  vegetation, pistol and HUD (100 health, 8 rounds). Escape pauses; clicking
  Back to Game restores the world.
- Both report browser cursor policy, computed cursor `default` and uncaptured
  input. OS cursor rasterization is not inferred from screenshots. Native audio
  preparation reports 46/40 effects respectively; this is not audible listening.

See [Chrome record](menu-keys-chrome-2026-09-05.json),
[Wolf world](wolf-menu-keys-world-2026-09-05.jpg),
[Wolf pause](wolf-menu-keys-pause-2026-09-05.jpg),
[Spear world](spear-menu-keys-world-2026-09-05.jpg) and
[Spear pause](spear-menu-keys-pause-2026-09-05.jpg).

The pointer-only negative checkpoint and its failed Escape attempts are retained
in [the initial record](wolf-menu-pointer-initial-chrome-2026-09-05.json).
Its temporary music change was restored to AdLib/Sound Blaster.

The final caption-aware image (`f5a1129956f1…`) was then reloaded and tested at
both candidate origins. Clicking Episode 6's **Confrontation subtitle** reaches
difficulty selection; Escape returns with Episode 6 selected. Clicking Episode
1's **Escape from Wolfenstein subtitle**, then Bring 'em on, starts the normal
first room. Spear's mouse New Game/difficulty path starts its normal first level.
Both final clients again pass Escape pause and mouse Back to Game resume, with
the same world/HUD rendered. No controls or audio settings were changed in this
final pass. Spear additionally passes a mouse Sound submenu entry and quick
Escape back to the root pause menu. Both are left paused.

See [final Chrome record](menu-captions-chrome-2026-09-05.json),
[Episode 6 return](wolf-menu-caption-six-return-2026-09-05.jpg),
[final Wolf world](wolf-menu-captions-world-2026-09-05.jpg),
[final Wolf pause](wolf-menu-captions-pause-2026-09-05.jpg),
[final Spear world](spear-menu-captions-world-2026-09-05.jpg) and
[final Spear pause](spear-menu-captions-pause-2026-09-05.jpg).

## Remaining acceptance

- Non-row native interfaces (mouse sensitivity, Change View, confirmation and
  custom-binding editors) still use their original keyboard interaction;
  row-menu pointer integration does not make every dialog mouse-operable.
- Gameplay capture and mouse-look lifecycle, genuinely held movement, firing,
  save/load persistence, fullscreen, audible mix and extended play.
- The controls mask reports configured policy, not proof of observed controls.
  No blanket Wolf3D/Spear completion or live-service deployment is claimed.
