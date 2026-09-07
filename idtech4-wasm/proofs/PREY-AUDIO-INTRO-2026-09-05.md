# Prey audio and Roadhouse intro — 2026-09-05

Later [menu/cache checkpoint](PREY-MENU-CACHE-2026-09-05.md) repairs pre-mount
menu audio/fonts, accelerates archive reads and verifies uppercase binding
identity. The source and image hashes below identify this earlier checkpoint.

Status: black-screen cause traced to the intro's first voice-completion wait.
The worker OpenAL bridge and page receiver are implemented and pass native
Wasm/adapter checks; the full Prey client rebuild, four exact patch trees and
full staging pass. The first audio candidate renders the normal mirror intro
but uses placeholder sounds: deferred sound declaration files were never
discovered. The follow-up below repairs that metadata/cache lifecycle and
passes its native regressions. Packaged Chrome now confirms real intro samples,
normal visible world, automatic console recovery and pause/resume. Sustained
movement, mouse capture and audible listening remain unaccepted. No live
service is replaced.

## Actual failure

The preceding [image checkpoint](D3-IMAGE-ACCOUNTING-2026-09-05.md) shows a
textured, lit world behind the black view effect. In a fresh Chrome session on
that exact ownership image, native `listThreads` places `map_roadhouse::main`
at `script/map_roadhouse.script(3858)`. The
[native record](prey-intro-silence-legacy-chrome-2026-09-05.json) also shows
`g_stopTime 0` and advancing integer game time. The old `g_frametime` diagnostic
misformats its detailed timing fields, which are not used as evidence. Its
setting is restored to zero and verified through the live console DOM after
the bounded proof log fills. Escape pauses without worker errors.

Read-only inspection of the owner's `pak000.pk4` script identifies line 3858
as the first `waitForSilence`, immediately after starting `rh_intro1`. The
script deliberately fades to black first and does not reach its later fade-in
until those voice waits finish. Native `hhAnimatedEntity::StartSoundShader`
only schedules silence when the sound has a positive length. With the worker's
OpenAL device disabled, no sound is started and the waiting callback never
arrives. This is not a stopped game clock or evidence of missing world draws.

## Repair

Prey now compiles `neo/sys/openal_emscripten.cpp`, adapted from the repository's
existing corrected Quake 4 worker bridge, only for `PREYWASM_CLIENT`. It keeps
the required device/source/queue state in the worker and transfers PCM and
source operations to the existing page-owned WebAudio renderer. The shared
adapter now creates that receiver for Prey as well as Doom 3/RoE and Quake 4.

No owner script, silence callback, fade, view effect, audio volume or graphics
quality setting is bypassed. The original audio-driven intro ordering remains
the acceptance target. Desktop builds and other native game artifacts are
unchanged.

## Verification

- [Actual Wasm negative/positive audio test](prey-audio-native-2026-09-05.json):
  unmodified SDK OpenAL fails to open a device without a window AudioContext;
  the compiled Prey bridge opens it, returns a terminated device list and
  correct context state, transfers exact PCM, handles source/queue controls
  and cleanup, and naturally completes a quarter-second voice sample.
  This is not full-engine script acceptance or audible listening.
- The six-variant adapter suite initially fails Prey's missing page bridge;
  the updated source passes, including PCM decoding and source start/stop.
- The full 449-step Prey rebuild passes with pinned Emscripten 6.0.6.
  `test-prey-audio.mjs` is now a `build-all.sh` gate and reuses the core OpenAL
  API fixture also used by Quake 4.

Initial audio-only Prey patch:
`13271a3d78ba0db828a1f75f8596bfef98bc3d289391719a32c87305971c8b44`.

## Deferred media follow-up

The [initial audio Chrome record](prey-audio-initial-chrome-2026-09-05.json)
shows a running page audio context and normal visible mirror/Tommy/bathroom
without a view-effect bypass. However, `rh_intro1.wav`, `rh_intro2.wav` and
`rh_intro3.wav` default: those are shader names incorrectly treated as sample
paths. This is partial rendering progress, not correct dialogue acceptance.

Read-only archive inspection finds 180 sound declaration files in deferred
`pak003.pk4`, including the Roadhouse dialogue definitions. The native
declaration manager scanned its folders before this archive mounted.
`Reload()` only revisits already-known files, and its parser rejects previously
implicit declarations as cross-file duplicates even when a real file arrives.

The browser-only follow-up discovers all registered declaration folders once
after a successful first deferred mount, following old-map unload and cache
invalidation but before the new loading GUI/map. Previously implicit entries
retain their identity, adopt their real source file and join its reload list;
ordinary same-/cross-file duplicate rejection is preserved. Early default
images and sound samples are purged at level load for a normal retry, and a
successful image load clears its default flag. Generated images, valid media,
native desktop cache behavior and owner data are unchanged.

[Exact source fixture](prey-deferred-media-native-2026-09-05.json): all 46
browser/desktop cases pass; the
[preceding source](prey-deferred-media-legacy-2026-09-05.json) fails eight.
These are production registration/folder/cache functions with fixture file
listings and image loaders, not full native ZIP/lexer/audio/GPU acceptance.
The test is now a staging gate. The 424-step client rebuild, four exact patch
trees and full staging pass. [Packaged hashes](prey-deferred-media-build-2026-09-05.json)
identify the isolated candidate, with owner archives read-only.

Current canonical Prey patch:
`f15f6c37e1fe0fa64e9d4f10769a0b311fa34b2fa43411eb5c711f9ed82f6bff`.

## Packaged Chrome result

[Full scoped record](prey-deferred-media-chrome-2026-09-05.json),
[normal world](prey-deferred-media-world-2026-09-05.jpg) and
[recovered console](prey-deferred-media-console-2026-09-05.jpg):

- Native menu ready at 52,591 ms; New Game → Normal mounts all four deferred
  archives and reports declaration refresh at 112,502.4 ms. Gameplay begins
  at 133,818.2 ms and all four bounded post-map frames complete.
- `listSounds gf_intro` lists the three actual `sound/vo/intro/gf_intro*.wav`
  samples as OGG, with lengths 4,288 / 3,750 / 5,618 ms and no default flags.
  `printSoundShader rh_intro1` identifies the real Roadhouse dialogue file,
  parsed and currently referenced. The first-voice wait is gone; the native
  thread list reaches the later mirror/ambient sequence.
- The normal fade reveals Tommy, mirror, sink and textured bathroom. Native
  console font recovery requires no `reloadImages` command. Read-only cvar
  queries confirm `g_skipViewEffects 0` and `g_stopTime 0`.
- The page audio context is running with decoded buffers and progressing source
  starts. This is real sample-loading/render-path evidence, not a claim that
  this agent listened to or judged the sound mix.
- Escape pauses at 349,979.2 ms, resumes at 399,405.5 ms into the visible world,
  and pauses again. No worker errors are recorded.

Movement is **not accepted**: 24 uppercase and then 24 lowercase quick browser
keypresses do not change `(-282 -340 68.25)`. DOM events show sub-millisecond
down/up intervals, so this is not a sustained-key test. Separately, uppercase
ASCII is forwarded as an uppercase SDL key rather than an unshifted letter;
that input mapping needs a regression/follow-up. No movement binding was
changed. Mouse capture, sustained controls, audible listening and a fuller
campaign pass remain open. Startup menu sounds also still default before
the gameplay archive mounts; the current repair targets post-mount recovery.

The active test container is `prey-deferred-media-proof-20260905-v2`, port
32877. An initial container creation raced the preceding test container's
shutdown and lacked published networking; it is retained stopped and not used
as Chrome evidence. The v2 container uses the same verified image and read-only
owner bind. The original live port-8087 service is unchanged.

The older ownership image is retained. Blood reproduction stays deferred and
the user-confirmed RTCW renderer is untouched. Automatic early console-texture
recovery is now Chrome-verified in the deferred-media follow-up.
