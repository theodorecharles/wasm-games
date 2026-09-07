# Doom 3 Delta lighting: sound-clock regression — 2026-09-06

The previously camera-confounded Delta roundtrip blackout is now reproduced
with native camera/health telemetry. Removing the v7 multiplayer mixer repair
freezes sound-driven material values; after Delta→Tomiko→Delta, those values
are zero and broad room surfaces disappear into black. The repaired path
keeps the clock and material values advancing and returns to lit Delta.
This verifies a specific lighting regression, not full renderer acceptance.

The repair remains the existing MP-only `AsyncUpdate` call in
[`d3wasm-browser.patch`](../patches/d3wasm-browser.patch), documented in the
[audio checkpoint](D3-MP-AUDIO-2026-09-06.md). No shader, material, retail
asset, sound-constant default or production artifact changed in this follow-up.

## Isolated controls

Both test-only images derive from the same immutable v7 candidate. Their
JavaScript, adapter, worker, native server, bot roster and bot asset hashes
match each other; **only their browser Wasm differs**.

- Repaired diagnostic: **32951**, image
  `05b5e75ed163207a27f2516bbd135e307053884d8c264073d2556583ffda5f35`.
- Legacy diagnostic: **32952**, image
  `8f36361851c221d76968c7668a3fbcce72a254e4417a9bec99d383b99ec288bd`.

The [diagnostic patch](../tests/d3-light-clock-diagnostic.patch) instruments
`CurrentAmplitude` and the actual `SingleView` camera after `ShakeAxis` and
`RenderScene`. `D3LIGHT` logs contain time, native sound clock, actual health,
spectator flag, origin/axes/FOV, amplitude call count and original amplitude
values. Logging is bounded to twice a second, plus a mode switch. Test-only
`lightzero` and `lightnormal` commands zero/restore the returned material
amplitude and close the native console; they do not move/heal the player or
stop the sound clock. `nonzero` and `maxAmplitude` describe values **before**
that override. Normal mode is `-1`; forced zero is `0`.

The legacy image additionally applies only the
[six-line mixer removal](../tests/d3-light-clock-legacy.patch).
Its roundtrip uses default mode `-1` throughout, with **no amplitude command**.
No existing cheat flags or server cheat settings were changed.

The [package audit](d3-light-clock-package-2026-09-06.json) checks nine image
files per image, reapplies both patches to temporary copies, compares all
529 source files and verifies the four release-candidate artifacts remain
unchanged. Emscripten **6.0.6** builds both full browser engines successfully.
The checked-out diagnostic source is retained in its final **legacy** form at
`.work/d3-light-clock-diagnostic-20260906`; it is not a release source tree.

## Same-camera amplitude switch

At 11:06:51 UTC, actual Chrome records
[normal](d3-light-clock-pair-normal-2026-09-06.jpg) →
[zero](d3-light-clock-pair-zero-2026-09-06.jpg) →
[restored](d3-light-clock-pair-restored-2026-09-06.jpg) within **306 ms**.
All three native camera origins, axes and FOV values match exactly, health
remains **33**, and the player is not spectating. The room's floor, walls and
ceiling lights visibly vanish in zero mode and return in native mode.

The [three](d3-light-clock-pair-normal-2026-09-06.json)
[native](d3-light-clock-pair-zero-2026-09-06.json)
[records](d3-light-clock-pair-restored-2026-09-06.json) each contain 192 original
nonzero amplitude calls. The clock continues 3,620,864→3,641,344→3,649,536 and
browser playback starts continue 12,428→12,440→12,464. This establishes the
effect of zero material amplitude, **not** an exact simulation of the old mixer.
The independent legacy control below supplies that missing test.

An earlier [zero screenshot](d3-light-clock-zero-2026-09-06.jpg) was taken
after a bot kill, with health -20 and a changed camera. It is rejected as a
lighting comparison, not counted as supporting evidence.

## Actual native map roundtrips

Both clients use normal Play and the native New Vote → Change Map UI. Each
Delta→Tomiko→Delta sequence contains two passed votes. Native status confirms
one human/two bots and the same native process/session within each roundtrip.

| Control/view | Native clock behavior | Nonzero calls / calls | Health | Visible result |
| --- | --- | --- | --- | --- |
| Legacy fresh Delta | Frozen at 61,440 | 90 / 90 | 100 | Lit room |
| Legacy returned Delta | Frozen at 135,168 | 0 / 90 | 100 | Broad black surfaces |
| Repaired fresh Delta | Advances to 589,824 | 87 / 87 | 100 | Lit corridor |
| Repaired returned Delta | Advances to 2,756,608 | 30 / 30 | 100 | Lit corridor |

Legacy [fresh image](d3-light-clock-legacy-first-2026-09-06.jpg) and
[returned image](d3-light-clock-legacy-return-2026-09-06.jpg) have identical
recorded origin `[296,708,68.267296]`, axes and FOV. Their
[fresh](d3-light-clock-legacy-first-2026-09-06.json) and
[returned](d3-light-clock-legacy-return-2026-09-06.json) logs each retain eight
consecutive samples spanning over three seconds at a frozen clock. All eight
returned samples have 100 health, the same camera and zero amplitudes.
Playback remains zero throughout. The clock advances during map loading,
then freezes again; **it is not always zero, nor does a fresh load always
have zero brightness**. The returned screenshot coincides with the beginning
of the native match-start restart; it is not a long settled-frame oracle.
The subsequent retained observation includes a respawn effect and is not used
as the clean visual comparison. [Tomiko](d3-light-clock-legacy-vote-status-2026-09-06.json)
and [Delta](d3-light-clock-legacy-return-status-2026-09-06.json) status agree on
`startedAt=1788693000702` and the same native PID/session.

Repaired [fresh Delta](d3-light-clock-fixed-delta-2026-09-06.jpg),
[Tomiko](d3-light-clock-fixed-tomiko-2026-09-06.jpg) and
[returned Delta](d3-light-clock-fixed-return-2026-09-06.jpg) show textured,
lit geometry and 100-health HUDs. Fresh and returned Delta camera origins
differ only by **0.000030 units in Z**, with equal axes/FOV. The
[return log](d3-light-clock-fixed-return-2026-09-06.json) includes the entire
three-map sequence and the native match-start restart. Its last eight samples
advance from 2,596,864 to 2,756,608 with nonzero amplitudes. Playback starts
increase **1,136→4,815→6,544** across the three observations. Native
[start](d3-light-clock-fixed-start-status-2026-09-06.json),
[Tomiko](d3-light-clock-fixed-tomiko-status-2026-09-06.json) and
[return](d3-light-clock-fixed-return-status-2026-09-06.json) status retain
`startedAt=1788693348949`, native PID/session and healthy bot population.
The legacy and repaired clients use different rooms; their cross-build images
are not a same-camera pair.

## Checks, cleanup and remaining gates

```sh
node scripts/test-d3-light-clock-package.mjs
node scripts/test-d3-light-clock-evidence.mjs
node scripts/test-d3-mp-audio.mjs
```

The [evidence validator](d3-light-clock-acceptance-2026-09-06.json) checks 28
retained file hashes, native camera/health and clock sequences, both roundtrips,
package identity, normal disconnect and idle cleanup. Its guards reject dead
and moved comparison cameras. It preserves manually inspected screenshot
hashes but does not perform pixel/OCR or listening acceptance. The existing
exact native/Wasm mixer regression is rerun: all 20 cases pass per target;
removing the repair again fails precisely mode-0 join, multiplayer and rejoin.

Both clients disconnect natively. The repaired client returns to the
[intact native menu](d3-light-clock-fixed-disconnect-2026-09-06.jpg).
At 11:20:32 UTC both [repaired](d3-light-clock-fixed-final-idle-2026-09-06.json)
and [legacy](d3-light-clock-legacy-final-idle-2026-09-06.json) services are
naturally sleeping with zero peers/bots/humans, no native child and no temporary
session. All four owned Chrome tabs are `about:blank`. Read-only roots and
read-only owner-data mounts were preserved; no live service was replaced.

The releasable candidate remains uninstrumented **v7 on 32950**, not either
diagnostic image. Full-map visuals, sustained controls/capture, audible quality,
malformed-packet browser recovery and SP/RoE campaign/save regression remain
before promotion. This narrows the earlier
[Delta diagnostic](D3-DELTA-DIAGNOSTIC-2026-09-05.md); it does not erase its
death/spectator caveats or close the earlier eight-client blank-view report.
RTCW SP and the user-deferred Blood crash remain untouched.
