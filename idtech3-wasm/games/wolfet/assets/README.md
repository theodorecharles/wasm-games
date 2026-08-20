# wolfet-wasm-owned assets

The short announcer clips under `etjs/sound/announcer/` were generated for this
project from synthesized speech and normalized as mono WAV files. They are not
ripped from Unreal Tournament, ETPub, ETLegacy, or the original Wolfenstein:
Enemy Territory data.

`npm run build:pak` packages the `etjs/` subtree as ignored
`runtime/legacy/etjs.pk3`, keeping these project-owned additions separate from
the official game archives.

The public image never includes Unreal Tournament audio. Optional replacement
clips named `doublekill.wav`, `multikill.wav`, `megakill.wav`, `ultrakill.wav`,
and `monsterkill.wav` can be placed in `/data/announcer/`. On startup the
container replaces the generated fallback clips in its private ETJS overlay.
