# Local handoff runbook

## Current image contract

- Portal: `127.0.0.1:8080`.
- Core ports: Blood `8007`, id Tech 1 suite `8010`, Wolf3D `8011`, CoD2
  `8014`, DOSBox Jill suite `8016`, GoldSource suite `8017`, Source/HL2 `8019`,
  Quake `8081`, Quake II `8082`, Quake III `8083`, Quake 4 SP `8084`, RTCW SP
  `8085`, Doom 3 SP `8086`, Prey (2006) `8087`, and WolfET `8088`.
- New locked DOS endpoints: Jazz Jackrabbit `8020`, Duke Nukem `8021`, Duke
  Nukem II `8022`, Grand Theft Auto (DOS Demo) `8023`, The Need for Speed
  `8024`, and SimCity 2000 `8025`. OpenRCT2 is `8026`.
- Alternate-mode ports: Duke3D `18007`, Quake 4 MP `18084`, RTCW MP `18085`,
  Doom 3 MP `18086`, and Resurrection of Evil `18087`.
- All published ports are loopback-only. Every game image receives only its
  persistent `/data` layout; the portal has no route into those directories.
- The portfolio has 43 shortcuts, 28 runnable game services, and one portal
  service. id Tech 1, Jill 1–3, and GoldSource use canonical suites. Locked
  images serve the remaining runnable single-title entries.
- `image-contracts.json` records each service's exact framework release,
  canonical repository, local tag or digest, and locked variant. OpenRCT2 uses
  framework `0.9.6` at `ad0226db55a2925bb250c6e31ca6786bd0dc73bd`
  and immutable local image ID
  `sha256:e00af4e3735efae516493824168208c57f1c41b47d43a679beb777957d942493`.
  WolfET uses the accepted public `wolfet-wasm` revision
  `15a0975af2add91717c79fa6134bbbec95df45e8` and immutable Docker Hub digest
  `sha256:782b71fbf80cf5a2b6c0987c28e1d010355d66bb8f4c5be360cd187761fca760`;
  its downstream `framework-lock.json` carries the exact framework pin.
- NES, SNES, PlayStation, and PlayStation 2 are catalog-only development
  shortcuts. `emulation-wasm` declares every variant `runtimeReady: false` and
  intentionally publishes no placeholder runtime image, so these entries have
  no Compose service, port, `/data` bind, or image contract.
- WolfET is the only `Live` entry. Every other shortcut has the exact status
  `Still in development`.

## Read-only pre-swap checks

These commands do not start, stop, or replace a container:

```bash
./validate.sh
./validate.sh --images
docker compose -f compose.yaml config --images
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
```

`./validate.sh --images` must be clean before a swap. In particular, the local
id Tech 4 tags must be the canonical `local/idtech4-wasm:{doom3-dev,
doom3-mp-dev,roe-dev,quake4-dev,quake4-mp-dev,prey-dev}` images and must each
advertise framework 0.9.1 plus its locked variant. A temporary build tag such as
`local/idtech4-wasm:prey-prey-dev` is not a reason to bypass validation; finish
the local tag handoff first, then rerun the audit.

Known product boundaries:

- Source/HL2 and CoD2 are honest diagnostic milestones, not playable engines.
- Their canonical public repositories are
  `https://github.com/theodorecharles/source-wasm` and
  `https://github.com/theodorecharles/cod2-wasm`; their locked local images are
  `local/source-wasm:hl2-dev` and `local/cod2-wasm:cod2-mp-dev`.
- The id Tech 4 variants, including Prey, still need their browser renderer
  milestone before they can be called playable.
- The new DOS variants remain in development until serialized browser
  acceptance covers provisioning, restoration, nested paths, controls, audio,
  and fullscreen behavior.
- Counter-Strike: Source is not supported by `source-wasm` and has no shortcut.
- OpenRCT2's current milestone has accepted title graphics, audio, native mouse
  input, dynamic resize, GOG ingestion, and scenario entry. Native park
  save/reload and the optional RCT1 scenario path are the next manual checks.
- The four console-emulation shortcuts are visibly unavailable until
  `emulation-wasm` produces real runtime artifacts. Do not invent a Compose
  service or image tag to make them appear runnable.
- No distributable authentic icon exists for the nine DOS variants, so their
  canonical source-native DOSBox icon is used. CoD2 and Chex Quest retain the
  documented diagnostic/family fallbacks. Prey uses its pinned source-native
  icon.

## Game-data preparation

`./prepare-data.sh` stages only into the sibling `${WASM_DATA_ROOT:-../data}`
tree. It does not query remote hosts or place game archives, PK3/PK4/WAD
data, or DOS files in this repository or an image.

- `DOS_GAMES_ROOT` may contain `JILL`, `JILL2`, `JILL3`, `JAZZ`, `DUKE1`,
  `DUKE2`, and `GTA` (lowercase variant directory names are also accepted).
- `NFS_DATA_ROOT` and `SC2000_DATA_ROOT` must point to the prepared directories
  documented by `../dosbox-wasm/RUNBOOK.md`; the original archives are not
  copied.
- Prey is sourced from the local Steam `Prey 2006/base` directory and staged at
  `../data/prey/base` using the exact canonical PK4 list.
- OpenRCT2 owns the external `openrct2-data` Docker volume. Use its launcher to
  ingest the RCT2 GOG `.exe` and companion `.bin`; the RCT1 pair can be selected
  in the same import. Do not copy that transformed library into Git or the
  container image.
- Existing game data is left in place when a source variable or installation
  is unavailable.

## Safe later swap

Perform this only after the active browser-test session releases the portfolio:

1. Save the read-only `docker ps` inventory above and identify exact containers
   holding any required port. Do not use a broad stop, remove, or prune.
2. Build or normalize any replacement image under its canonical tag. Ensure the
   exact WolfET digest in `image-contracts.json` is present locally, then run
   `./validate.sh --images`. Do not continue on a missing image, stale framework
   version, wrong variant, wrong OCI framework label, stale declared source
   revision, or wrong WolfET revision.
3. Optionally stage desired game data with `./prepare-data.sh` and rerun both
   validators.
4. Stop/remove only the released old Game Lab containers whose exact names were
   captured in step 1. Leave unrelated and user-owned containers untouched.
5. Start the declared project with `WASM_GAME_LAB_APPLY=1 ./start.sh`.
   `pull_policy: never` guarantees that this uses only the audited local tags.
6. Check the portal and each unique `games.json` port with `curl`, then request
   the serialized browser slot and manually test one game at a time.

## Rollback

Run `./stop.sh` only for the Compose project described here, then recreate the
exact containers captured in the pre-swap inventory using their previous images
and binds. Compose does not remove the host data directories; do not delete them
during rollback.
