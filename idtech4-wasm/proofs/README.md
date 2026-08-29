# id Tech 4 browser checkpoints

These records separate browser-observed runtime milestones from compile and
static-contract results. They do not mark a game playable unless its proof says
so explicitly.

- `d3wasm-checkpoint.json` records the 2026-08-21 Doom 3/RoE conversion state:
  the true d3wasm WebGL 1 engine is pinned, exactly patch-reconstructable, and
  clean-built for both games. Chrome formally proved Doom 3 campaign gameplay,
  real keyboard movement, audio, console resume, and same-session save/reload.
  Final-build cross-reload persistence was interrupted before its result, and
  automated Chrome could not grant pointer lock for the formal mouse gate.
  Resume from `../RESUME-RUNBOOK.md`; do not repeat the long campaign proof.
- `prey-checkpoint.json` records the 2026-08-21 Prey/d3wasm integration state:
  menu input works and the first campaign map loads completely, but the first
  sustained gameplay render remains black and must be debugged before Prey can
  be promoted from **Still in development**.
