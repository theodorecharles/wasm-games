# Prey menu media, archive reads and letter keys — 2026-09-05

Follow-up to [intro/deferred-media recovery](PREY-AUDIO-INTRO-2026-09-05.md).
The preceding turn is progress: it restores actual intro voices, normal world
rendering and console recovery after the first map. This checkpoint addresses
the remaining pre-map menu defaults and uppercase key identity.

## Repairs

- `pak003.pk4` contains sound declarations and the real menu score;
  `pak004.pk4` contains console/font textures. They now mount before native
  initialization. Only `pak001.pk4` and `pak002.pk4` remain deferred. The
  already-tested declaration refresh/default adoption and cache retries remain
  at the first map transition, and pack override order is unchanged.
- Prey's worker wraps the SDK's read-only WORKERFS reader with one 64 KiB block
  per file, an LRU limit of 16 files and a 1 MiB retained-memory bound. Small
  minizip header reads reuse the block; bulk reads delegate directly. Reads
  across boundaries/EOF, file identity, errors and retries preserve exact bytes.
  This does not copy retail archives into the Wasm heap or modify owner data.
- Browser `event.key` may contain uppercase letters under Shift/Caps Lock.
  SDL gameplay identity is normalized to lowercase while the separate text
  event retains its original case. Layout remapping is preserved. This fixes
  uppercase W/S being distinct from the normal lowercase movement bindings;
  it does not establish that short simulated presses demonstrate movement.

## Regressions and build

- [Input negative](prey-input-case-legacy-2026-09-05.json): three uppercase
  cases fail. [Updated real-SDL Wasm fixture](prey-input-case-native-2026-09-05.json):
  all 43 keyboard/text cases pass, including unchanged uppercase text.
- [Cache negative](prey-archive-cache-legacy-2026-09-05.json): 10,000 tiny
  reads require 10,000 backing reads.
  [Production cache + exact SDK reader fixture](prey-archive-cache-native-2026-09-05.json):
  all 65 checks pass; the same tiny-read sequence requires one backing read.
  The fixture supplies deterministic Blob regions and a synchronous reader;
  it is not a full ZIP/browser performance benchmark.
- The cache is a staging gate. All 46 deferred-media cases, native client
  rebuild, four exact patch trees and complete family staging pass.
  [Packaged hashes](prey-menu-cache-build-2026-09-05.json) identify the isolated
  port-32877 candidate. Other native artifacts and the live port-8087 service
  are unchanged; the preceding candidate is retained stopped.

Canonical Prey patch:
`8de2c5170b32158362e5271f9e2bb28b37d5ccc77aeeb8afb5ea73637f47d56b`.

## Chrome checkpoint

The fresh candidate loads both menu-media packs before native initialization
finishes, retaining their previous checksums. Native initialization is
24,971.1 → 26,846.6 ms (about 1.88 s), versus 46,381.2 → 52,590.3 ms (about
6.21 s) in the preceding checkpoint. These are two observed runs, not a
controlled repeated benchmark or page-navigation-to-ready comparison.

At menu readiness the cache reports 127,070 requests, 123,347 block hits,
4,811 backing reads and 720,896 resident bytes within its 1 MiB cap. The
counts include split reads and bulk delegations; hits are not a simple
one-hit-per-request percentage.

Before New Game, native `printSoundShader guisounds_menu_music` reports the
parsed `sound/consolemainmenu.sndshd` definition and `listSounds prey_overture`
lists the actual stereo OGG score without a default flag. The page audio
context runs and schedules sources, with no missing-sound warnings or worker
errors in the captured startup. [Startup console](prey-menu-cache-console-2026-09-05.jpg)
is readable before any map or image reload.

[Full Chrome record](prey-menu-cache-chrome-2026-09-05.json) and
[normal world](prey-menu-cache-world-2026-09-05.jpg) also confirm:

- The two remaining gameplay packs mount at 170,418.3 and 170,534.6 ms, about
  289.8 ms after the mount begins, with unchanged retail checksums. Declaration
  refresh completes and Roadhouse enters gameplay at 183,346.9 ms. All four
  bounded post-map frames finish. The internal map-load counter reports
  11,198 ms (excluding deferred mounting and declaration refresh).
- Normal intro animation/fade reaches the textured, lit bathroom. The three
  real intro OGG voices retain 4,288 / 3,750 / 5,618 ms durations with no
  default flags. Only the engine's `_default.wav` fallback warning appears
  during the transition; menu/intro shader-name-as-WAV failures are absent.
- A read-only query first confirms `w = _forward`. For a bounded binding
  check, `w` temporarily maps to an echo command. Uppercase W and lowercase w
  each execute that same native binding once. `w = _forward` is restored and
  queried successfully afterward; no other binding or effect setting changes.
- Escape pauses safely after the checks, with no worker errors.

No audible-listening or held-key movement claim is made. The browser's prior
sub-millisecond tap attempts are not a sustained-input test. Mouse capture and
broader gameplay still need acceptance. A source follow-up also finds the
same uppercase forwarding pattern in Doom 3/RoE's export, which needs its own
regression before applying a fix. Blood remains deferred and the
user-confirmed RTCW renderer is untouched.
