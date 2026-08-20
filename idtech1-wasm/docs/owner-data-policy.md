# Game-data policy

The browser build and container images contain no game IWAD. The shared WASM
Game Framework is the only `/data` boundary: it accepts an allowlisted file,
validates it before an atomic write to the persistent volume, and exposes it
only through the selected title's same-origin `/game-data` route. The browser
then runs the same downstream validator before caching the file in
origin-private IndexedDB.

The checked-in `web/wasm-game-data.json` is a top-level suite manifest with an
independent policy under each variant key. The root declaration selects
`/data-validator.mjs`; each file supplies its game family and required IWAD or
PWAD identification. Suite readiness is intentionally
per-title: one installed IWAD is sufficient for its selected title, while a
locked single-title image ignores every other policy. The adapter fetches this
same-origin manifest and constructs the browser validator/cache policy from the
selected variant. It contains no WAD parser or digest allowlist of its own.

## Structural policy

Every file has a 12-byte through 64 MiB upload envelope. The validator reads
only the 12-byte WAD header and at most 65,536 16-byte directory entries. It
checks integer arithmetic, directory bounds, every lump range, duplicate names
without last-write-wins parsing, and the declared `IWAD`/`PWAD` policy. It then
uses these audited family signatures:

- Doom: `IWAD`, `POSSA1`, `E1M1`, and `E3M1`; `E4M1` is an Ultimate Doom
  metadata signal.
- Doom II: `IWAD`, `POSSA1`, `MAP01`, `MAP30`, `MAP31`, `MAP32`, and
  `D_RUNNIN`, excluding TNT's `DOTNTDR`/`BTNTCRAT` and Plutonia's
  `CAMO1`/`MC1`.
- TNT and Plutonia: `IWAD`, the `MAP01`/`MAP30`/`MAP31`/`MAP32` set, and
  their respective two distinguishing lumps.
- Heretic: `IWAD`, `IMPXA1`, `E1M1`, `E2M1`, and `E3M1`; `EXTENDED` is
  reported as metadata.
- Hexen: `IWAD`, `ETTNA1`, `MAP01`, `SKY1`, `CLUS1MSG`, and `BEHAVIOR`.
- Chex Quest: `PWAD`, `E1M1`, `POSSH0M0`, and `SARGE2E8`, with no `MAP01`.

SHA-256 is computed as informative fingerprint metadata. Known fingerprints
receive a release label, but a digest is never an acceptance gate. This admits
structurally compatible classic, rerelease, and enhanced revisions without
weakening cross-family rejection. Chex's `chex.deh` compatibility patch remains
a separately required, checksum-pinned build artifact.

The manifest content version and validator version are part of both server and
browser-cache revalidation keys. Bump `version` whenever the structural rules
change. Keep all format knowledge in `data-validator.mjs`, never in the shared
framework or `game-adapter.js`.

## Redistributable support files

`scripts/fetch-chex-support.sh` fetches `chexdeh.zip` from the established
`/idgames` mirror at `gamers.org`, checks the archive SHA-256
`eeed61747165a4a90c792cf4ae4572593ff36a8f87d365af5107f68ed4000bad`,
and stages only `chex.deh` plus its `chexdeh.txt` notice. The notice says the
file may be used without restriction. The staged patch itself is pinned to
SHA-256 `8c0345089fb227fa7f71c25a6c6e31ff5bd4bea0580f286cd74e05918d72dd40`.

`dsda-doom.wad` is generated from the pinned GPL DSDA-Doom source checkout. It
is engine support data, not an IWAD.

No Doom shareware or Chex Quest game archive is a default, downloaded by the
build, or added to an image.
