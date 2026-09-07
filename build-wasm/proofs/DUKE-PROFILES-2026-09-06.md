# Duke selectable profiles — 2026-09-06

Later renderer follow-up: [texture dimensions and palette precision](DUKE-NPOT-2026-09-06.md)
restores the cropped logo/pistol/hand and small save-menu text in isolated
32984. The 32982 observations below remain the historical profile checkpoint.

Status: **implemented and Chrome-checked in an isolated package, not deployed
or complete Modernized acceptance**. The launcher now offers actual Classic
and Modernized engines. Both reach the first level and fire with real mouse
clicks. Modernized's up/down pitch and horizontal turning are also observed
at the native player, not just at the input queue.

## Implementation

| Profile | Engine assets | Native renderer | Backbuffer / display | Settings |
| --- | --- | --- | --- | --- |
| Classic, still the default | `duke3d.js`, `duke3d.wasm` | Software, mode 0 / 8 bpp | 800×600 / 4:3 | Existing default config and `settings.cfg` |
| Modernized | `duke3d-modernized.js`, `duke3d-modernized.wasm` | Polymost OpenGL via WebGL 2, mode 3 / 32 bpp | 1280×720 / 16:9 | `modernized.cfg`, native companion `modernized_settings.cfg` |

- The Duke adapter selects the correct script and Wasm together, updates the
  launch description and canvas aspect, supports a validated `?profile=...`,
  and freezes selection once loading starts. Unknown/prototype-name choices
  fall back to Classic. Changing engines requires a fresh page load.
- The framework stores the selector preference. Its graphics control is
  nested inside Advanced settings, so both Duke flags must be enabled. The
  first isolated package left that ancestor hidden; its negative screenshot
  and package are retained. Blood still advertises only Classic.
- Modernized uses the existing native `-cfg` mechanism. A minimal settings
  file is created only if missing, avoiding the native invitation to import
  Classic settings. Existing settings are not overwritten by the adapter.
  Both profiles deliberately retain the existing persistence root and save
  directory; save interchange has **not** been accepted yet.
- Native GPU builds start at 1280×720; the software branch still starts at
  800×600. Existing browser full mouse look remains enabled after configuration
  loading. This is a fixed 16:9 profile, not adaptive desktop-resolution output.
- `build-web.sh` now builds/packages a separate GPU target without replacing
  the Classic outputs. `test-web.sh` requires and validates both targets and
  their native exports. The isolated candidate build and exact package were
  tested here; the full family build was not rerun.

## Actual Chrome observations

All actions used the existing Chrome-control connection, real launcher/menu
clicks and Escape, DOM-authored native telemetry, and screenshots. No browser
engine globals, synthetic input, draw observer or security bypass was used.

1. Open Advanced settings and select Modernized in the real combobox, without
   a profile query. The description and canvas change before Play.
2. Native menu and E1L1 report mode 3, 32 bpp, 1280×720. The displayed canvas
   is 1424×801, preserving 16:9. World, clouds/skyline, fence, pistol and HUD
   remain visible with the prior projection repair.
3. A real left click changes ammo 48→47. Moving downward for a second click
   publishes `(0,72)` and changes native pitch 185→162, with position and yaw
   unchanged. Moving right publishes `(90,0)` and changes yaw 422→477, with
   position and pitch unchanged. Those shots consume two more rounds, to 45.
4. Escape opens native menu 50. Save Game opens native menu 350 and its new
   slot preview, exposing the rendering defects below. The unused new slot
   was canceled with Escape; no save was confirmed or overwritten.
5. Reload the same origin: the visible selector remembers Modernized. Select
   Classic through the combobox and launch: native mode 0 / 8 bpp / 800×600,
   cached owner data, native menu, first level, ammo 48→47, and Escape menu 50.
6. Reload that origin with `profile=modernized`, launch again, and observe
   mode 3 / 32 bpp / 1280×720, cached owner data, `modernized.cfg` in the native
   log, and no configuration-import prompt.

Native input capture remains false in this Chrome environment. The actual
mouse-look proof exercises the existing unlocked relative-motion fallback;
it does **not** claim successful pointer lock or fullscreen. Web Audio reports
running, but that is not listening acceptance. Initial camera pitches differ
between the Classic and GPU captures; these are not pixel-parity comparisons.

## Remaining renderer defects and acceptance gates

- Small save-menu text is visibly malformed; a stray textured patch appears
  at the upper-left edge after menu interaction. Screenshots retain these
  failures. The saved-view preview itself appears, but text/preview UI is not
  visually accepted.
- Pistol/hand and other sprite fidelity need review against Classic. The
  custom fragment shader currently has no desktop alpha-test discard; that
  is a source-level gap, **not yet the established cause** of the observed
  small-text or sprite defects. GL diagnostics still include unused `-1`
  uniform-location warnings. Do not claim a fully clean renderer.
- Held movement, normal pointer capture/fullscreen, audio listening, native
  save/full page reload/load, wider gameplay and promotion remain open.
- Blood Modernized is still unimplemented. The user's Blood pitchfork-crash
  deferral remains in force. RTCW SP stays protected and unchanged.

## Retained package and validation

Current candidate: `duke-polymost-profiles-visible-proof-20260906`, localhost
port **32982**, image
`sha256:2ccfad751cbf756e3722a8b0e8912eec9d66a269a7de6a22aab9db59ad31e318`.
Container `fb547d5f757df12cc2ef711fd90c0992c6719e57d44fa84aa1ae5bd687590efc`
started `2026-09-06T19:44:53.424804364Z`.

The [package audit](duke-profiles-visible-package-2026-09-06.json) verifies
all 23 installed files, six served asset hashes, localhost binding, read-only
root/data, and unchanged live Duke/RTCW identities. Two new Modernized assets
are added; only the Duke adapter and launcher manifest change among existing
files. The other **19 files, including both Classic engine files and all
Blood files, are byte-identical to live**. No draw observer is included.

The hidden-selector candidate on 32981 remains intact. The prior 800×600 GPU
skyline baseline on 32980 also remains intact. No service was stopped/replaced.

- `test-variant-adapters.js`: Blood plus six Duke scenarios pass, including
  both selection routes, invalid/prototype query fallback, existing config
  preservation, script/Wasm pairing and runtime selection freeze.
- `test-family-adapter.js`, `verify-site-contract.js`, shell/JS syntax,
  `wasm-validate`, and both working-tree whitespace checks pass.
- [Source audit](duke-profiles-source-2026-09-06.json): all 1,702 prepared files
  match pin `f8639031546ccea8964c2d63c9d09944c8a4a67c` plus canonical patches;
  tree `5b5f5b6ce3ec65602ed6854fa4b2751738e5dd63`. Preparation remains
  idempotent and preserves developer notes.
- Exact production GLES texture and projection tests reran on AMD: 40 pixel
  and 27 clipping checks, with all five deliberately broken variants failing.
  These routines are unchanged from the preceding two-driver proof.
- [Evidence audit](duke-profiles-evidence-2026-09-06.json): **17 new Chrome
  pairs / 37 hashes**, including the hidden-selector and save-menu failures.
  Native pitch/yaw changes are asserted, while image interpretation remains
  a visual review. `modernizedAccepted` intentionally remains false.

All build/test processes from this pass finished. The owned Chrome tab is at
the current Modernized native main menu on 32982, after the same-origin
Classic→Modernized reload. Source edits are uncommitted; unrelated work and
live services were preserved.
