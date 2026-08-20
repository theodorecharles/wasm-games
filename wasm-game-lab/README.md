# WASM Game Lab

Private workstation portal for the current browser-game portfolio. The portal
keeps its Windows XP desktop interface; each shortcut opens a canonical family
or locked container on a loopback port. The Game Lab is deliberately separate
from `wasm-game-framework` and is not a publishable product repository.

## Validate

```bash
./validate.sh
./validate.sh --images
```

The first command validates all 43 shortcuts, 28 runnable game-service
contracts, 29 Compose services including the portal, canonical manifest
variants, each variant's effective controller and persistence policy, exact
loopback ports, `/data` mounts, and 28 inventoried icons without starting a
container. `--images` additionally inspects all 28 canonical runtime images for
their exact per-service framework release, source or immutable image identity,
and locked variant metadata; it also does not start a container. OpenRCT2 uses
framework `v0.9.6` at `ad0226db55a2925bb250c6e31ca6786bd0dc73bd`.

## Data and launch

Persistent files live under `../data` by default. Override that root with
`WASM_DATA_ROOT`. `prepare-data.sh` refreshes locally installed Steam files and
preserves data that is not installed on this workstation. GoldSource packaging
is opt-in with `PACKAGE_GOLDSOURCE=1`; Duke 3D uses `DUKE3D_SOURCE`; Jill, Jazz,
Duke 1/2, and the GTA DOS demo can use `DOS_GAMES_ROOT`. Prepared Need for Speed
and SimCity 2000 directories use `NFS_DATA_ROOT` and `SC2000_DATA_ROOT`. Prey
PK4s are staged from the local Steam installation into `../data/prey/base`.
OpenRCT2 uses the external `openrct2-data` Docker volume populated by its own
launcher/importer; RCT2 is required and RCT1 can be added to the same library.
Nothing under `../data` is served directly or copied into this repository or an
image.

Do not run a swap while a manual browser test or user-facing container is in
progress. Follow [RUNBOOK.md](RUNBOOK.md). Once the scheduled handoff is ready:

```bash
WASM_GAME_LAB_APPLY=1 ./start.sh
```

`start.sh` refuses to change services unless that explicit flag is present.

The cross-repository resume point for the current development pass is
[SESSION_HANDOFF.md](SESSION_HANDOFF.md).
`./stop.sh` stops only the Compose project described here.

## Status

The portfolio uses exactly two product labels: `Live` and `Still in
development`. Wolfenstein: Enemy Territory is `Live`; every other current entry
is `Still in development`. The desktop dot reports only whether a local HTTP
endpoint answered and does not change product status.

The current inventory uses the public
[`source-wasm`](https://github.com/theodorecharles/source-wasm) and
[`cod2-wasm`](https://github.com/theodorecharles/cod2-wasm) repositories and
their current local 0.9.1 image tags. It also adds NES, SNES, PlayStation, and
PlayStation 2 shortcuts from
[`emulation-wasm`](https://github.com/theodorecharles/emulation-wasm). Those four
entries are intentionally non-launching: the project has no JS/WASM runtime
artifacts and refuses to publish placeholder images, so the Lab declares no
Compose service or image contract for them. Their gray × is an availability
marker, not a third product status.

See [ICON_PROVENANCE.md](ICON_PROVENANCE.md) for asset provenance and current
fallbacks.
