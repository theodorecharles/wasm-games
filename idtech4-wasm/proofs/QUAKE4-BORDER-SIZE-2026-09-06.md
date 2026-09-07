# Quake 4 per-fragment mip sizes — 2026-09-06

The large llvmpipe border error is fixed in source and an isolated candidate.
**The strict software-driver gate still fails:** nine smaller implicit-filter
comparisons remain. No pixel tolerance, anisotropy setting, border color or
texture-filtering rule was relaxed. There is no live deployment.

## Cause and repair

The [unchanged negative recheck](quake4-border-llvmpipe-recheck-2026-09-06.json)
reproduces 14/128 failed cases, maximum channel error 117, on Mesa 25.2.8
llvmpipe/LLVM 20.1.2. All are implicit/projected cases whose neighboring
fragments select different mip levels. The paired
[AMD recheck](quake4-border-amd-recheck-2026-09-06.json) passes.

The [independent size probe](../tests/gl-border-size.c) does not load the
border helper or a game. It allocates complete mip chains and renders varying
LOD queries in desktop GL and GLES. On old llvmpipe, `textureSize(image, level)`
returns the wrong dimensions for **680/968 pixels**; the output confirms that
the requested LOD itself is correct. Deriving each mip size from the uniform
base dimensions passes all 968 pixels, including rectangular, non-power-of-two
and one-pixel-wide textures. See the
[old-software result](quake4-border-size-llvmpipe-2026-09-06.json).

This matches the first-lane extraction and explicit per-element-LOD FIXME in
[Mesa 25.2.8's query implementation](https://raw.githubusercontent.com/chaotic-cx/mesa-mirror/mesa-25.2.8/src/gallium/auxiliary/gallivm/lp_bld_sample_soa.c).
The [OpenGL mip-size rule](https://registry.khronos.org/OpenGL/specs/gl/glspec46.core.pdf)
allows the equivalent integer expression `max(baseSize >> level, 1)` for these
complete chains. `Q4BorderSize` now uses that expression in both texel bounds
and filter-coordinate calculation. Texel fetches, derivative/LOD computation,
bilinear/trilinear mixing and anisotropic taps are unchanged.

The [AMD probe](quake4-border-size-amd-2026-09-06.json) and
[host Mesa 26.1.6 software probe](quake4-border-size-host-software-2026-09-06.json)
pass both query forms. The later software driver does not reproduce this size
bug, but does reproduce the separate small filtering differences below.

## Verification and remaining discrepancy

- [Repaired old-llvmpipe sampling](quake4-border-size-fixed-llvmpipe-2026-09-06.json):
  all 128 desktop and 128 GLES same-footprint cases match native border taps
  within one channel value. The old versions failed 14 cases in each path.
- [Old-llvmpipe full matrix](quake4-border-size-matrix-llvmpipe-2026-09-06.json):
  all 16 settings, 2,048 desktop plus 2,048 GLES same-footprint comparisons,
  maximum channel difference one and no mismatches.
- [AMD full matrix](quake4-border-size-matrix-amd-complete-2026-09-06.json):
  the same 4,096 comparisons pass, and every strict sampling gate passes.
- [Shipped shader inventory](quake4-border-size-inventory-amd-2026-09-06.json):
  33/33 pairs compile/link through actual packaged shader preprocessing.
  [Targeted conversion tests](quake4-border-size-shaders-amd-2026-09-06.json):
  12 pairs and seven fail-closed controls pass. Runtime metadata tests pass
  26 cases; unchanged save-preview readback passes 60 GLES and three desktop cases.
- Invalid repeat, edge substitution and hard outside cutoff still fail the
  unchanged negative controls. Isotropic-only sampling still fails the
  anisotropic footprints where expected.

**Do not report the llvmpipe test as fully passing.** At anisotropy one,
comparison with the driver's implicit filtering still differs in 9/128 cases,
maximum channel error five (GLES four). Same-footprint explicit native taps
match, but the exact remaining implicit-filter cause has not been established.
The [unmodified host-software run](quake4-border-host-software-recheck-2026-09-06.json)
already had this smaller discrepancy before the repair.

`test-q4-border-sampling.mjs` and `gl-border-sampling.c` are unchanged.
The matrix runner now retains every completed setting and its failing exit
status before failing at the end; it does not bypass a gate. Its old-software
record has exactly one failing setting (one), and its process exits nonzero.

## Package boundary

[Package audit](quake4-border-size-package-2026-09-06.json) verifies the exact
canonical patch tree, HTTP bytes and **46 unchanged installed files**. The
only changed installed file is `openQ4-client_wasm32.js`, and a byte comparison
proves its only difference is the serialized shader helper. Relinking produced
the same Wasm hash as the retained save-preview candidate.

- Canonical patch: `4f46d62aa5a13c7fd7b7c843e7c755f4df00e8968660d1ab30192cba1707168d`.
- Helper: `582ff67bbe204a32226df63852271a8607cd05f99598c543daa2721d81aaeeb3`.
- JS: `1d6d837a8d3dbdcfdbf103add753e7744460bed786e8a2e09f2da4cfe23d1c74`.
- Unchanged Wasm: `621a9856013abb6eab614646e119dd81907272b4561ae4c6831d9a600edf4961`.
- Isolated container: `q4-border-size-proof-20260906`, localhost **32957**.
- Image: `sha256:b274ab80ab6370c3f9b3ead029d88db47c58a57259dcfa90b443221056cd00ef`.
- [Candidate recipe](quake4-border-size-candidate-2026-09-06.Dockerfile) derives
  from the retained readback image. The root filesystem and owner PK4 mount are
  read-only; all 32 required owner files are ready. The prior candidate remains.

Prepared source and `build/web` contain the new helper/JS; the combined
`build/site` is not restaged in this checkpoint. Staging gains the independent
mip-size probe and a packaged-helper guard. No RTCW, Blood, Doom 3, framework,
adapter, save format or game-module change is part of this repair.

## Chrome observation

The Chrome-control skill launched the exact candidate through the ordinary
launcher, Single Player, Story Campaign and Start Game at the default Corporal
difficulty. Enter passed the native continue prompt. The intro ran naturally
through space, dropship and crash into `game/airdefense1`: a visible first-person
world, sky, pistol and health 72. Escape opened the native pause menu; Return
to Game resumed the world. A second pause and Quit Current Game/Yes returned
to the normal main menu. The owned test tab was then returned to `about:blank`.

The [space-intro image](quake4-border-size-intro-2026-09-06.jpg) visibly contains
gray polygonal regions. Their cause, correctness against native rendering and
whether the previous candidate also has them were **not established here**.
Do not treat this screenshot or the first-person milestone as full renderer
quality acceptance. Existing missing-media, unsupported ARB/MLock/MSAA and
audio-feature warnings remain in the recorded log; this was not a warning-free
run or a listening test. Fullscreen stays null and capture stays false; held
movement, mouselook/capture, browser save/reload and full campaign remain open.

- [Menu](quake4-border-size-menu-2026-09-06.jpg)
- [New Game](quake4-border-size-new-game-2026-09-06.jpg)
- [Native continue gate](quake4-border-size-continue-2026-09-06.jpg)
- [First-person world](quake4-border-size-world-2026-09-06.jpg)
- [Native pause](quake4-border-size-pause-2026-09-06.jpg)
- [Resumed world](quake4-border-size-resume-2026-09-06.jpg)
- [Quit to main menu](quake4-border-size-quit-menu-2026-09-06.jpg)

Each image has an adjacent same-stem JSON with the actual DOM-backed engine
state, canvas dimensions, log and timestamp. The intro itself reports the
engine enum `gameplay`; its screenshot, not that enum, distinguishes it from
the later first-person world. No hidden engine state or synthetic input was
used in browser evaluation.

The [evidence audit](../scripts/test-q4-border-size-evidence.mjs) checks all
eight screenshot/DOM pairs, the unchanged oracle hashes, independent negative
size results, both full matrices and their distinct pass/fail statuses. Its
[integrity index](quake4-border-size-evidence-2026-09-06.json) pins the retained
artifacts. The DOSBox baseline audit also rechecks all 105 pre-existing
containers and 696 curated owner files unchanged after this work.

## Reproduce

From the repository root (prepared source and owned build container required):

```sh
node idtech4-wasm/scripts/test-q4-border-size.mjs
node idtech4-wasm/scripts/test-q4-border-sampling.mjs
node idtech4-wasm/scripts/test-q4-border-matrix.mjs
node idtech4-wasm/scripts/test-q4-border-size-package.mjs
node idtech4-wasm/scripts/test-q4-border-size-evidence.mjs
docker exec -u 0:0 -w /src/idtech4-wasm d3wasm-build-session \
  node scripts/test-q4-border-sampling.mjs
```

The final command is still expected to exit nonzero for the nine retained
implicit-filter differences. It is not a regression in the per-fragment size
repair. Broader renderer quality/performance and browser-control gates remain.
