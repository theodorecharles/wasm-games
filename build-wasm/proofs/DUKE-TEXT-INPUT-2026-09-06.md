# Duke save-name input and persistence — 2026-09-06

Status: **fixed in canonical source and isolated 32986, not deployed**.
Both Classic and Modernized can name a new save, confirm it, reload the page,
and load that save at its exact recorded position/view. Classic also loads the
Modernized-created save. This closes the text-delivery failure reproduced in
the [preceding alpha checkpoint](DUKE-ALPHA-2026-09-06.md), not full-game acceptance.

## Correction

The browser adapter delivered physical scan states but bypassed SDL's separate
character queue. Duke's `I_EnterText` reads `KB_GetCh`, so a delivered T scan
could not insert a letter. Ordinary desktop/browser Duke also leaves SDL text
input disabled; simply permitting a compatibility keypress was insufficient.

`browser-text-input.patch` adds `Build_WasmTextEvent` to the shared native layer.
It routes ASCII through the console handler and bounded native FIFO, excludes
the console-toggle character, rejects invalid character values, and bounds
the console-key table lookup even with extended/rebound scan codes. Native
desktop code and physical quick-tap handling are unchanged.

The Duke adapter uses layout-resolved `event.key` on keydown, including Shift
and Caps Lock, and translates Enter/Escape/Backspace/Tab to control characters.
It suppresses duplicate SDL/keypress delivery, including unknown physical
scans and FIFO/console rejection. Keyup does not insert another character.
Ctrl/Meta/Alt shortcuts retain browser default actions; composition, dead keys,
and non-ASCII text are not truncated into the ASCII bitmap-font editor.
Both Duke modules were rebuilt; Blood's adapter does not use the new hook.

## Verification

- [Native/Wasm tests](duke-text-full-native-2026-09-06.json) compile the actual
  FIFO, new seam and Duke editor bodies. Each target passes **12,296 checks**:
  typing/editing, Enter/Escape, numeric/length limits, console routing, invalid
  inputs, extended console bindings, every ring-head offset, capacity/overflow,
  order and flush. Native ASan/UBSan and Wasm UBSan/SAFE_HEAP pass. Removing
  insertion fails the editor-content control on both. Console and non-keyboard
  trigger endpoints are recording stubs, not whole-engine console acceptance.
- The actual adapter suite covers text/scan separation, layout/case, repeat,
  controls, modifiers, composition, unknown scans, native rejection and older
  modules, alongside existing profile/capture/persistence tests. Family and
  manifest contracts, generated-JS syntax and both Wasm validations pass.
- [Source audit](duke-text-source-2026-09-06.json): all 1,702 prepared files
  match the pin and ordered patches, tree
  `1f312ca675092f3f1f2a72ce5a67d494e3e58fd1`; preparation remains idempotent
  and preserves developer notes. The full family packaging build was not rerun.

The Chrome-control skill supplied real clicks, keyboard taps, screenshots and
DOM-authored native telemetry through the existing connection. No engine
globals, synthetic input or capture-security bypass was used.
[Evidence audit](duke-text-evidence-2026-09-06.json): **26 Chrome pairs / 55 hashes**.

1. Modernized: E1L1 renders at 1280×720, mode 3 / 32 bpp. W moves XY from
   `(-31243,7160)` to `(-31206,7313)`; firing changes ammo 48→47. A new slot
   visibly progresses blank→T→TEX→Backspace→TE→TEXT7. Enter writes
   `save0000.esv`; the game resumes normally.
2. Full same-origin page reload restores owner data from cache. Native Load
   Game shows TEXT7 and its preview; Y confirms loading. The exact native
   position/view `(-31206,7313,-158314,422,106)` and ammo 47 return. Saved and
   restored screenshots are byte-identical.
3. Switching to Classic starts 800×600, mode 0 / 8 bpp. It loads TEXT7 at the
   same native position/view. W advances to `(-31169,7466,-158314,422,106)`.
   A separate C7 save writes `save0001.esv`. Another full page reload retains
   both names/previews; loading C7 restores its distinct exact position/view
   and an identical screenshot. Neither existing save was overwritten.

Useful images: [typed name](duke-text-modern-name-2026-09-06.jpg),
[Backspace result](duke-text-modern-backspace-2026-09-06.jpg),
[Modernized restored](duke-text-modern-restored-2026-09-06.jpg),
[both persisted saves](duke-text-classic-reload-list-2026-09-06.jpg),
[Classic restored](duke-text-classic-restored-2026-09-06.jpg).
The `modern-loaded` proof stem records the confirmation prompt; `modern-restored`
is the completed load. The audit checks that distinction, not filenames alone.

## Candidate and remaining work

[Package audit](duke-text-package-2026-09-06.json) verifies all 23 installed
files and six HTTP assets. Relative to 32985, only the adapter and both Duke
JS/Wasm pairs change. Relative to the live base, two Modernized assets are
added, four files change, and 17 remain identical. Both modules export the new
hook. The old strict Classic-unchanged package audit remains the default;
this rebuild explicitly uses its `--text-input` mode.

Container `duke-polymost-profiles-text-proof-20260906` serves localhost
`http://127.0.0.1:32986/?game=duke3d&profile=modernized` (or `profile=classic`).
Image: `sha256:f8b946e377699f674493e9286ed8dde3bcd0d60c41b7f3230d3dae8035e407bf`.
It has a read-only root and read-only owner-data mount. The
[packaging recipe](duke-text-2026-09-06.Dockerfile) layers both rebuilt modules
over the retained base. The two browser test saves remain available.

Recheck with `node build-wasm/scripts/test-browser-text-input.mjs`,
`node build-wasm/scripts/test-variant-adapters.js`,
`node build-wasm/scripts/test-source.mjs`, and
`node build-wasm/scripts/test-duke-text-evidence.mjs`.

Still open: wider gameplay/sprite fidelity, held controls, capture/fullscreen,
audio listening, Blood Modernized and deployment. Existing SDK messages about
uniform location -1 remain visible in Modernized logs; this is not a clean-
console claim. Blood's crash reproduction remains deferred as requested.
