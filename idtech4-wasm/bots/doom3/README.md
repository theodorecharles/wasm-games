# Doom 3 SABot native/browser candidate

Experimental and separate from production preparation/staging. A matching
Wasm/native pair now runs bots alongside real Chrome clients; a self-contained
local acceptance image also passes packaged bot/lifecycle checks. The earlier
accepted human-only image and live services remain unchanged.
The v3 candidate adds automatic capacity/refill and exact native/Wasm snapshot
and population tests. Eight real Chrome clients and normal departure/refill
pass; see the [population checkpoint](../../proofs/D3-SABOT-POPULATION-2026-09-05.md).
See [browser/package evidence](../../proofs/D3-SABOT-BROWSER-2026-09-05.md) and
[native runtime evidence](../../proofs/D3-SABOT-NATIVE-2026-09-05.md).

## Provenance

The nine bot source files and `d3_sabot_a7.pk4` come from
[idTech4A++](https://github.com/glKarin/com.n0n3m4.diii4a/tree/dea1eb9f122cfae042961cfc32a3474e59354589),
pinned at `dea1eb9f122cfae042961cfc32a3474e59354589` in
[source-lock.json](source-lock.json). The upstream comments credit TinMan and
cusTom3; glKarin maintains this reference integration. The source identifies
SABot alpha 8 while the asset archive retains its alpha-7 filename. Preserve
these original credits. The repository provides a GPLv3 `LICENSE`; its Doom 3
tree also carries `COPYING.txt` with the original additional terms.

The archive contains bot definitions/scripts and navigation for all five stock
deathmatch maps, not the retail game data. It has no separate license/notice
inside the ZIP. The local acceptance image includes this pinned archive and
the unmodified upstream license notices; it is not a public release and is
never pushed by the build helper. Production staging remains unchanged. Before
public distribution, complete corresponding-source packaging and resolve
asset-specific redistribution scope. Do not treat a code-license statement as
proof that arbitrary retail assets can be redistributed.

The native engine starts at the already pinned original source revision
`31e877e7e4e691ed9f98603da9cd95ac59540cf3`. This is not a renderer replacement.
[native-prototype.patch](native-prototype.patch) records both the integration
hooks and our changes to the imported bot files. It must be applied **after**
copying the nine exact upstream files; it is not a production browser patch.
`population.patch` is then applied to both native and Wasm trees to maintain
the requested bot population without taking occupied human slots, followed by
`voting.patch` to exclude non-voting bots from the human voting majority.

## Reproduce without overwriting existing work

The reference checkout is `.work/idtech4a-bot-reference`; its sparse paths are
`doom3/neo/game`, `doom3/neo/framework`, `doom3/neo/sys`,
`doom3/neo/tools/compilers/aas`, and `Q3E/src/main/assets/pak/doom3`.
Check out the exact pinned revision, not the moving branch tip. Preparation
checks the revision and every imported file/archive checksum.

From the workspace root:

```sh
node idtech4-wasm/scripts/prepare-d3-sabot.mjs
```

This clones the pinned commit from `.work/d3wasm-roe-game`, copies the verified
reference files, and applies the checked patch into a **new**
`.work/d3-sabot-reproduced-source`. It refuses an existing destination. Pass a
different new destination as its argument for another reproduction.

Build with the same Debian bookworm native toolchain used for managed Doom 3
(CMake, Ninja, GCC, SDL2, OpenAL, Vorbis/Ogg, JPEG, zlib and curl development
packages):

```sh
docker run --rm --user 1000:1000 \
  -v /home/ted/Development/wasm-games:/src \
  -e D3_SABOT_SOURCE=/src/idtech4-wasm/.work/d3-sabot-reproduced-source \
  -e D3_SABOT_NATIVE=/src/idtech4-wasm/.work/d3-sabot-reproduced-build \
  local/idtech4-managed-native-toolchain:bookworm \
  bash scripts/build-d3-sabot-native.sh
```

The build helper does not install anything into `build/native`. The original
tested prototype resides separately in `.work/d3-managed-sabot-source` and
`.work/d3-managed-sabot`.

```sh
D3_SABOT_NATIVE="$PWD/idtech4-wasm/.work/d3-sabot-reproduced-build" \
  D3_SABOT_SECONDS=90 \
  node idtech4-wasm/scripts/test-d3-sabot-native.mjs
```

The probe creates a random, network-isolated container and disposable session.
Only `base/pak000.pk4` through `pak008.pk4` from the owner's Doom 3 directory
and the pinned bot archive enter it; owner configs, game DLLs and other mods
do not. It issues native server/bot/status commands, never movement or combat
inputs, and removes only its own container/session afterward.

Optional variables: `D3_OWNER_DATA`, `D3_SABOT_MAP=game/mp/d3dm1` through `d3dm5`,
`D3_SABOT_PROOF` for JSON output, and `D3_SABOT_CYCLE=1` with at least 65 seconds
to cycle all five maps and return to the first. Set `D3_SABOT_AUTO=1` to test
automatic population with no explicit `addBots` commands. Navigation autogeneration stays
disabled; missing/incompatible navigation must fail, not silently degrade.

## Reproduce the browser and local acceptance image

```sh
node idtech4-wasm/scripts/prepare-d3-sabot.mjs --wasm
node idtech4-wasm/scripts/test-d3-sabot-source.mjs --wasm
```

This creates `.work/d3-sabot-wasm-reproduced-source` from Wasm revision
`48f8f65d1216db3ee0b11872bb3b413febadc669`, applies the checked canonical browser
patch, imports the same nine bot files, applies the shared native port except
its three Wasm-specific files, then applies `wasm-hooks.patch` and
`population.patch` and `voting.patch`. It reproduces
all 39 modified/imported files of `.work/d3wasm-sabot` exactly (26 native).
Neither preparation mode overwrites an existing destination.

Inside the pinned Emscripten 6.0.6 environment, with the workspace mounted at
`/src` and work directory `/src/idtech4-wasm`:

```sh
bash scripts/build-d3-sabot-wasm.sh
```

`D3_SABOT_WASM_SOURCE`, `D3_SABOT_WASM_BUILD` and `JOBS` override the isolated
source/build paths and job count. The helper uses the checked-in Ninja wrapper;
it does not install into `build/site`. The accepted tested artifacts reside in
`.work/d3wasm-sabot/build-wasm`, `.work/d3wasm/build-wasm-roe` and
`.work/d3-managed-sabot`. The canonical expansion patch and its artifact pair
are now locked and included explicitly in the candidate.

```sh
node idtech4-wasm/scripts/build-d3-sabot-candidate.mjs \
  local/idtech4-wasm:doom3-sabot-another-check
```

The helper requires the exact locked artifacts and accepted base image, refuses
an existing image tag, builds in its own disposable directory, and verifies
patched outputs and the actual image's eleven key files (including both engine
pairs and the adapter)
by SHA-256. It does
not push, launch services or change live images. It also runs the exact-code
snapshot, population and voting fixtures, requiring a native C++ compiler and the
Emscripten 6.0.6 compiler (`EMXX`, or `.work/host-tools/emxx-6`).
`browser-runtime.patch` applies
only to that isolated package. Its worker mounts `base/zz_sabot.pk4` for MP
only; its runtime uses `server/sabot-roster.cjs` to report actual native brains
with bounded framing and a 15-second freshness limit. The target is two bots
until seven humans join, then one; eight humans leave zero bots. Native player
entities, not loading relay peers, determine this target. Departures refill it.
A missing/stale or wrong-sized roster fails health polling; three consecutive
failed polls sleep the match. A fresh zero-bot roster is healthy at capacity.
There is no synthetic count or bot-name-prefix inference.

The current local package is `local/idtech4-wasm:doom3-sabot-candidate-v8`;
it adds the [saved trace-cache ownership repair](../../proofs/D3-TRACE-CACHE-2026-09-06.md)
to v7's [MP inline sound mixer repair](../../proofs/D3-MP-AUDIO-2026-09-06.md),
v6's [physical Ctrl/Alt repair](../../proofs/IDTECH4-MODIFIER-KEYS-2026-09-05.md)
and the [voting and actual-map status fixes](../../proofs/D3-SABOT-VOTING-2026-09-05.md).
The package builder now also runs the adapter's positive/negative modifier
fixtures against its exact staged file and native/Wasm mixer positive/negative
controls against its source, plus base/RoE native/Wasm trace-cache ownership
controls. Only the two Wasm binaries change in v8's thirteen-file campaign
audit; loaders, renderer source, adapter and native server remain unchanged.
Earlier v6/v7 images remain unchanged.
Earlier v2
and v3 images remain unchanged as two-client and eight-client evidence.
The earlier `doom3-sabot-candidate` tag failed acceptance because its staging
patch was skipped; **do not use it**. The build helper now creates an isolated
Git root before applying patches and requires exact patched-output hashes.

```sh
D3_HTTP_BOTS=1 D3_HTTP_POPULATION=1 node idtech4-wasm/scripts/test-d3-managed-http.mjs \
  local/idtech4-wasm:doom3-sabot-candidate-v8 /home/ted/wasm-game-data/doom3
node idtech4-wasm/scripts/test-d3-mp-audio.mjs
node idtech4-wasm/scripts/test-d3-trace-cache.mjs
node idtech4-wasm/scripts/test-modifier-keys.mjs
node idtech4-wasm/scripts/test-d3-sabot-roster.mjs
node idtech4-wasm/scripts/test-d3-sabot-worker.mjs
node idtech4-wasm/scripts/test-d3-sabot-snapshot.mjs
node idtech4-wasm/scripts/test-d3-sabot-population.mjs
node idtech4-wasm/scripts/test-d3-sabot-voting.mjs
node idtech4-wasm/scripts/test-d3-sabot-map-status.mjs
D3_CLASS_BOTS=1 node idtech4-wasm/scripts/test-d3-class-schema.mjs
```

The first test creates/removes its own authenticated containers; it exercises
real bot movement and lifecycle, not Chrome player input. The worker test uses
the pinned archive and real SHA-256 with a fixture engine; SP/RoE mount isolation
is not full campaign acceptance.

## Remaining integration gates

- The 144-class source tables match, and Chrome's real `listClasses` agrees.
  Two humans join two bots without the first-snapshot crash. Exact snapshot
  methods now pass 59,797 checks in each native/Wasm fixture, including truncated
  and invalid packets, with an unguarded-reader negative control. This does not
  establish complete browser recovery from injected malformed network packets.
- MP-only mounting and SP/RoE isolation pass worker checks. The exact v7
  [campaign/save checkpoint](../../proofs/D3-CAMPAIGN-SAVES-2026-09-06.md) adds
  real Chrome intros, first-map gameplay, native named-save/full-page reload/
  load, changed-position restoration and pause/resume for both campaigns.
  V8 also loads those exact v7 saves twice without the trace-cache warning;
  consult its newer checkpoint for the new-save/normal-exit verification.
  Full progression, arbitrary older-save compatibility and sustained controls remain
  before broad campaign acceptance or production promotion.
- Exact population methods pass 2,214 checks in each native/Wasm fixture,
  including humans before bots, capacity, departures, orphans and map resets.
  The native five-map cycle now passes with automatic refill and no `addBots`.
  Real Chrome independently verifies six/seven/eight humans with two/one/zero
  bots and refills one/two bots on normal departures. Managed full map changes
  now pass the native UI vote/new-map join with one human and two bots.
  The [v7 sound-clock checkpoint](../../proofs/D3-LIGHT-CLOCK-2026-09-06.md)
  reproduces the old-mixer Delta roundtrip blackout and verifies the repair
  with native clock/amplitude/camera controls. This is not a full-map visual
  pass or acceptance of the earlier eight-client blank-view case.
- Prove direct bot model/combat visuals, sustained aiming/movement and audible
  audio. Kill messages and actual native damage/scores are narrower evidence.
- Bots are game-level fake clients, not AsyncServer network clients. Native UDP
  status omits them; the candidate reads actual native telemetry separately.
  Add actual names to this roster. Quiet, explicitly flushed `sabot status`
  output now replaces verbose polling while preserving native diagnostics.
- Resolve duplicate script-constant warnings in the upstream archive without
  hiding warnings or changing SP/RoE scripts.
- Investigate native startup clip-model warnings;
  do not suppress warnings to make acceptance pass.
- Preserve the original renderer and all unrelated user edits.
