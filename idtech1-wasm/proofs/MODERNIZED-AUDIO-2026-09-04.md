# Modernized multiplayer audio — 2026-09-04

Installed at `http://127.0.0.1:8010/`. Zandronum now mixes native music and
effects into SDL/WebAudio output. The final image passes 25 real-Wasm cases
using its HTTP-served executable files and support pack. These tests use fake
DOM/2D/WebAudio endpoints: **they do not establish audible Chrome playback,
browser performance, or full gameplay acceptance**.

Chrome was subsequently reopened with explicit user approval. The
[Chrome checkpoint](MODERNIZED-CHROME-2026-09-04.md) records real browser audio
scheduling, seven rendered matches, and a later adapter-only input repair.
Audible listening remains open. RTCW's user-confirmed renderer is unchanged.

## Repair

The previous client selected the null sound renderer through `NO_SOUND=ON`.
The [old-image control](modernized-audio-legacy-2026-09-04.json) reproduces zero
audio devices and zero non-silent page buffers in Doom II, Heretic, and Hexen,
while native joins, movement, firing, and menus still work.

The browser build now selects an independent `BROWSER_SOUND` implementation:

- Native OPL synthesizes MIDI music. Browser MIDI choices are restricted to
  this supported device, including normalization of saved desktop settings.
- An SDL mixer handles raw effects and decoded WAV/FLAC/Ogg samples, bounded
  voices, sample-rate conversion, pitch, loops, volume, pause, and native
  listener/rolloff-based positioning. Music and effects have separate gains.
- Completed effects retire their native channels during game updates, not
  inside the audio callback. The retained channel pointer remains valid while
  the engine queries its final playback position.
- The serial, non-pthread browser build uses serial critical sections instead
  of SDL 1.2's unavailable mutex implementation. Desktop/threaded paths retain
  their existing locks. This avoids the native OPL initialization failure.
- Decoder input is bounded to 64 MiB and decoded output to 16 million float
  samples, with channel/rate limits and finite-sample checks. Raw 8-bit effects
  remain unsigned; stream callback 8-bit PCM is signed. Seek/duration arithmetic
  uses widened intermediates.

`NO_SOUND=ON` remains intentional: it excludes desktop FMOD/voice-chat
dependencies; `BROWSER_SOUND` now supplies actual browser output. Do not treat
that CMake switch alone as evidence that the current client is silent.
This backend does not provide full FMOD DSP/environmental-reverb parity or
microphone/VoIP support.

## Evidence

[Final-image matrix](modernized-audio-2026-09-04.json):

| Mode | Titles | Cases |
| --- | --- | ---: |
| Music and effects | Doom, Doom II, TNT, Plutonia, Heretic, Hexen, Chex | 7 |
| Music only | Doom II, Heretic, Hexen | 3 |
| Effects only | Doom II, Heretic, Hexen | 3 |
| Native volume controls muted | Doom II, Heretic, Hexen | 3 |
| `-nosound` | Doom II, Heretic, Hexen | 3 |
| Initially suspended audio, then resumed | Doom II, Heretic, Hexen | 3 |
| Music/effects plus 30-second sustained run | Doom II, Heretic, Hexen | 3 |

The matrix verifies finite, bounded PCM, independent music/effect contribution,
advancing callbacks, silence when requested, and effect-channel accounting.
Maximum observed queued lead was 0.1661 seconds. The sustained cases continued
rendering/game tics and audio callbacks; peak active effects were 14, 19, and
23 respectively. The suspended test manually resumes its fake context; it
does not prove Chrome autoplay permission or a real user-gesture unlock.

Every case also joins the native server with two bots and verifies movement,
attack press/release, Escape menus, capture-loss menu hooks, and console
open/close. Each group reruns engine/IWAD selection, connected-player conflict,
stale-relay rejection, and idle shutdown. The test containers use isolated
loopback ports and read-only owner-data mounts, then remove themselves.

Actual Wasm codec tests decode three shipped open-source support-pack samples:
`DSDGACT.flac` (11,025 Hz mono, 7,073 frames), `cnnctsnd.ogg` (44,100 Hz stereo,
130,552 frames), and `dstaunt.wav` (11,025 Hz mono, 13,160 frames). Invalid/short
headers are rejected; truncated containers either reject cleanly or return
finite shorter PCM. Integer sample-format boundary tests also pass.

Full static tests pass: adapter/package/HTTP/private-data contracts and exact
Crispy/Zandronum source reconstruction. The prior menu and startup repairs
remain in the installed image.

## Reproduction and source

[Exact reconstruction](zandronum-audio-source-2026-09-04.json) compares all 2,785
tracked/patched source files and records hashes for the three downstream audio
source files and decoder headers/licenses:

- Zandronum upstream: `bdd0f7beb43d9786cc13502395f60aa84d34e28d`;
- canonical patch SHA-256:
  `6a6698cb2f11599d5d516d6d948d5f6114905c724f21264a648bb142f2381d01`;
- reconstructed tree: `efb8dd482bb55a3f71f7a83fd6504ebc503d53d8`;
- dr_libs: `dfe8377631000664666519fdb83da193fd8037f4`;
- SDK port dependencies: libvorbis 1.3.7 and libogg 1.3.5, fetched through the
  pinned Emscripten 6.0.6 recipes with archive hash verification.

The authored mixer/decoders live in `wasm/zandronum-audio/`; source integration
is in `patches/zandronum-wasm.patch`. The guarded decoder fetch and license
installation are part of `build-zandronum.sh`. The toolchain Dockerfile
prebuilds the Vorbis port; no host packages were installed. All three decoder
licenses and `THIRD-PARTY-AUDIO.txt` are served with the image.

From this family directory:

```sh
docker build -f docker/Dockerfile.toolchain -t local/idtech1-toolchain:6.0.6 docker
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace/idtech1-wasm" -w /workspace/idtech1-wasm \
  -e IDTECH1_BUILD_JOBS=8 local/idtech1-toolchain:6.0.6 \
  bash -c 'bash scripts/build-zandronum.sh && bash scripts/test-audio-decoders.sh'
node scripts/test-zandronum-source.mjs
bash scripts/test-static.sh
IDTECH1_TEST_IMAGE=local/idtech1-wasm:audio-candidate \
  node scripts/test-zandronum-audio-matrix.mjs
IDTECH1_TEST_IMAGE=local/idtech1-wasm:menu-input-candidate \
  IDTECH1_TEST_FROM_IMAGE=1 IDTECH1_TEST_GAMES=doom2,heretic,hexen \
  node scripts/test-managed-matches.mjs --expect-silent
```

The image commands test the retained local images; rebuilding native files does
not update an image automatically. The full image build continues to copy the
canonical web tree. This deployment used a targeted layer over the menu repair,
preserved in `/tmp/idtech1-audio.LDzz9q/image/Dockerfile`.

## Deployment and rollback

[Live verification](modernized-audio-live-2026-09-04.json):

- Image: `sha256:5bec163905562b4455349e92c774eab83bb28c219d45a0bf2d4567b15f3cb0be`,
  tagged `idtech1-wasm:dev` and `local/idtech1-wasm:audio-candidate`.
- Container: `dffaf24a3d363bc16b984af7bff64ac0c5864335459e79cc69e166ff272cf26e`.
- Rollback retained as `local/idtech1-wasm:menu-input-candidate`, image
  `sha256:408d66793b0f11c9a3a327ef41c0841800a27e468b3417e46e62384055cd110d`.

The pre/post file audit covers 54 old files and 58 new files. Only Zandronum's
JS/Wasm changed; four notice/license files were added and no audited files
were removed. Classic/DSDA engines, support packs, server executables, relay,
adapter, and framework files remain byte-identical. Framework 0.9.6 stays at
its existing exact pin and local menu-cursor development delta.

The service was sleeping with zero humans before the targeted Compose update.
Pre/post lab image audits pass; all 31 other container IDs are unchanged.
Live executable/support-pack hashes match all 25 native cases, all seven
owner-data gates are ready, and `/data/DOOM.WAD` returns 404. Data binds, ports,
and restart policy are unchanged. Served assets require cache revalidation;
the framework service worker does not cache `/dist` engine assets.

No owner game data or saves were deleted or embedded in images. Detailed
build/test logs, inventories, hashes, and live verifier remain in
`/tmp/idtech1-audio.LDzz9q`. Work remains local and uncommitted.

Remaining: audible Chrome playback, real pointer/menu/fullscreen acceptance,
Original/Smooth solo-with-bots, and the wider portfolio checklist. This is an
audio implementation/native-validation checkpoint, not completion of id Tech 1
or the portfolio goal.
