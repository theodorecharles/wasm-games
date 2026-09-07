# Classic native bot clients

These clients are packaged by the managed Classic deathmatch service. See the
[managed checkpoint](../proofs/CLASSIC-MANAGED-2026-09-05.md) for the installed
artifacts, browser/native tests and remaining limits. Original and Smooth
browser engine binaries are unchanged.

The native build uses the same prepared Crispy source as the browser build.
GNU ld wraps the local `G_BuildTiccmd` producer, lobby entry point and text-screen
sleep. The managed controller starts eight seconds after the first human joins;
bots alone keep waiting, and a second human can join during that grace. Bots send
ordinary network movement, aim, attack, use and respawn commands. Weapon effects,
damage, pickups, physics and network consistency remain the engine's work.
The command wrapper preserves the engine's consistency byte and uses a separate
AI random generator; it must not call the synchronized game RNG or mutate actors.

Navigation uses read-only geometry/thing queries and a bounded grid search.
Direct usable doors are distinguished from arbitrary scripted barriers, and Use
presses are spaced far enough apart not to repeatedly reverse a raising door.
This is basic deathmatch AI, not campaign AI or a general ACS-script solver.

## Build and test

On a native Linux toolchain with CMake, a C compiler, SDL 2 and SDL_net headers:

```sh
bash idtech1-wasm/scripts/build-classic-bots.sh
IDTECH1_NATIVE_BOT_DIR="$PWD/idtech1-wasm/.work/classic-bots-native/bin" \
  IDTECH1_BOT_TEST_MS=60000 \
  node idtech1-wasm/scripts/test-classic-bots.mjs doom2
```

`docker/Dockerfile.classic-bot-toolchain` supplies those build dependencies.
`IDTECH1_BOT_BUILD_DIR` can redirect all build output to a disposable directory.
Source preparation validates the existing pinned/patched checkout. Neither the
build nor test stages files into `web/dist`.

The test requires Docker and the existing `idtech1-wasm:dev` runtime image.
It starts an isolated Chocolate UDP relay and two real native bot clients,
mounts owner IWADs read-only, and removes only its own temporary session and
container. Set `IDTECH1_DATA_DIR` to override the installed data directory.
There are no monsters. Passing requires both bots to move, observed attack
commands, and at least one health reduction; health reduction alone is not
proof of a kill or a specific damage source.

Add `--wasm` for an unchanged shipped Wasm third client, and `--smooth` to use
its Smooth profile. This diagnostic transports native packets over loopback UDP
with the production relay framing. Its fake DOM/2D presentation is **not Chrome,
WebSocket end-to-end, GPU, pointer, or audible-audio acceptance**. The third
client also moves and fires, so the two-bot-only run is a separate requirement.
Reports contain artifact hashes and samples; failures also emit JSON and exit
nonzero. Add `--require-frag` to require native opponent kill credit. Current
one-minute Doom combat failure and the separate three-minute passing follow-up
are both retained in the managed checkpoint, not presented as a clean 7/7 run.

`scripts/test-classic-bot-matrix.mjs` runs all seven two-bot cases; add `--wasm`
for the fourteen Original/Smooth compatibility cases. Its default duration is
60 seconds per case with two isolated cases in parallel. `IDTECH1_BOT_TEST_JOBS`
and `IDTECH1_BOT_TEST_MS` control that diagnostic workload.

## Managed tests and remaining quality work

`scripts/test-managed-classic.mjs` exercises readiness, reservations, idle sleep,
failure cleanup and repeated wake in an isolated container. Add `--joins` for
the fourteen real Wasm/WebSocket cases, two-human admission and late/stale
rejection. Add `--missing-bots` for failed-start cleanup. Use
`IDTECH1_TEST_FROM_IMAGE=1` with `IDTECH1_TEST_IMAGE` to test installed image
contents, or supply `IDTECH1_NATIVE_BOT_DIR` for source-bind development mode.

Native weapon pickup/out-of-ammo selection is unchanged; tactical weapon
preferences remain future quality work. Read-only attack-tic, frag/death,
weapon and all-player-health telemetry supports combat/endurance testing.
Faster navigation, additional maps and longer bot sessions need more coverage.
Actual Chrome automatic capture, sustained keyboard movement and audible
listening remain unaccepted; click capture and network WebAudio start pass.
Do not substitute Zandronum for the classic profiles or modify owner IWADs or
customized configurations to make a test pass.
