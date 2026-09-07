# Blood firing investigation — 2026-09-04

The reported crash remains **open and not reproduced**. The user identified
the starting pitchfork in the first room of the first level, then requested
that we move on if reproduction failed; they plan to reproduce it tomorrow.
No speculative engine crash fix or diagnostic executable was deployed.

## Native evidence (not Chrome acceptance)

- [Production pitchfork matrix](blood-pitchfork-production-2026-09-04.json):
  eight passing cases against the live HTTP-served executable. Each starts
  E1M1 through the normal menus, then exercises right-Control or left mouse,
  held attacks after movement or repeated taps, at 44.1 or 48 kHz for ten
  seconds. Rendering, simulation and audio continue after release.
- [Observed pitchfork matrix](blood-pitchfork-observed-2026-09-04.json): the
  same eight cases on a separate diagnostic build, additionally checking
  native weapon animation, attack state and completed firing callbacks.
  These starting-weapon cases do not use god mode or give-all cheats.
- [Broad weapon matrix](blood-weapons-2026-09-04.json): 34 passing cases,
  769 completed weapon callbacks, covering primary/alternate attacks, keyboard,
  walking, ammunition changes and a no-input control. Setup cheats are used
  only in the cases explicitly recorded. Throwable weapons include their
  release/drop gestures and explosion settling time.

These tests execute real native Wasm with fake DOM, rendering and WebAudio
endpoints. They do not prove actual Chrome input/capture, audible playback,
or absence of a browser-specific crash. Initial harness failures concerned
PCM clipping thresholds, the attack bit mask and incomplete throw gestures;
they were not reproduced engine crashes.

The live Blood image remains
`sha256:ef1fe7905bb41c0bbf9ad805d58fc520e70a54a0fe9a85b8deb35a6d61bd2328`
at port 8007. Executable hashes are recorded in every production case. All
32 lab container IDs were unchanged by this investigation. The previously
deployed mouse-button forwarding repair remains installed.

## Reproducible diagnostics and source repair

`scripts/test-blood-runtime.mjs` runs individual cases;
`scripts/test-blood-weapons.mjs --pitchfork --production` tests the live
starting weapon. `scripts/build-blood-diagnostic.sh` builds an isolated
instrumented executable with named Wasm functions. Set `BUILD_RUNTIME_DIR`
to that build's `dist` directory to run the observed pitchfork or broad matrix.
`tests/blood-diagnostics.patch` and `.cpp` are test-only and are deliberately
excluded from the production patch series and production web directory.

The prepared source checkout had a Git alternates reference into a deleted
temporary directory. It was preserved intact at
`/tmp/blood-fire.7WO7sd/source-broken` and replaced with a self-contained
checkout of the same pin and ordered canonical patches. Comparison found no
changed code, only five missing upstream Markdown files. Source preparation
now preserves Markdown, including developer notes. The new static regression
checks exact reconstruction and idempotence.

[Source proof](blood-source-2026-09-04.json) compares 1,702 tracked files:
pin `f8639031546ccea8964c2d63c9d09944c8a4a67c`, reconstructed tree
`d8ffa413389f55f96d3dfeec76610755c9d43081`. Static checks pass. Full staged-web
verification was not rerun and unrelated framework files were not rolled out.
Detailed build logs, comparisons and the source backup remain under
`/tmp/blood-fire.7WO7sd`; the canonical diagnostic artifacts are under
`.work/blood-diagnostic.phiyQl/dist` and are not deployed.
