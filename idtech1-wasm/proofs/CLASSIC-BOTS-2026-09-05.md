# Classic native bot prototype — 2026-09-05

**Not deployed.** The live Classic launcher still has no bots. This checkpoint
validates a native-client approach without replacing the Original/Smooth
browser engines or changing the production relay/supervisor.

## Implementation

`bots/classic-bot.c` produces ordinary movement, aim, attack, use and respawn
commands in real headless native Crispy clients. The native engine still owns
weapons, damage, pickups, movement and the synchronized simulation. The wrapper
preserves the original consistency byte and uses private AI randomness.
It does not write actor positions/angles, inject damage or advance the game RNG.

The source remains pinned at `7775ef82d1e9dfd50eb9d2824acefaeff7247458`, with
the same canonical browser patches. A separate native CMake build uses GNU ld
wrappers for the local command producer and lobby entry point. It builds Doom,
Heretic and Hexen clients; the Doom family covers five IWADs including Chex's
existing DEH patch. Browser JS/Wasm artifacts were not rebuilt or staged over.

The bounded grid navigation received three observed corrections:

- Treat only known usable direct doors as openable, respecting their side.
  Hexen's one-way ACS barrier was incorrectly treated as an ordinary door.
- Space Use presses apart. Heretic's manual door logic reverses a raising door
  on another press; rapid pulses closed it before player clearance was reached.
- Check the destination body's overlap with solid props, and temporarily
  explore supplies/portals when a pursuit route cannot make progress.
  Heretic's previous bots stayed on opposite sides of a wall without attacking.

A broader corner-footprint experiment blocked valid routes in all three engine
families and was removed. It is not part of the final implementation.

## Native evidence

[Machine-readable evidence](classic-bots-2026-09-05.json) identifies the final
bot hashes, representative telemetry, and the unchanged Wasm artifacts.
The [build/test notes](../bots/README.md) explain how to repeat the diagnostics.

All seven first maps pass separate 60-second **two-native-bot-only** smoke
tests against isolated Chocolate UDP servers. There are no monsters or third
clients in these seven cases. Each bot moves more than 96 world units, both
bots have sampled attack commands, and at least one bot loses health.

| IWAD | Bot travel spans, world units | Minimum sampled health, slots 0 / 1 |
| --- | --- | --- |
| Doom | 3706 / 2223 | 6 / 21 |
| Doom II | 1059 / 1037 | 5 / 10 |
| TNT | 936 / 865 | 5 / 30 |
| Plutonia | 3190 / 1921 | 100 / 28 |
| Heretic | 1830 / 1884 | 76 / 88 |
| Hexen | 3198 / 2350 | 23 / 12 |
| Chex Quest | 1533 / 1582 | 5 / 15 |

Travel span is the larger axis range, not cumulative distance. Health changes
and sampled attacks are smoke-test evidence, not a frag count, a proof of each
damage source, or acceptance of long-match AI quality. Heretic and Plutonia each
have only one sampled attack per bot in their one-minute runs.

The fourteen-case unchanged-Wasm Original/Smooth matrix passes **13/14** at
60 seconds. Heretic Smooth fails the native-bot health-change assertion: both
bots remain at 100 health, and their sampled attacks target the third player.
The current telemetry does not expose that third player's health. Connection
and runtime checks complete before this assertion; it is not a desync report.

A separate **120-second Heretic Smooth follow-up passes**, using exactly the
same bot binaries and criteria. It records 6,692 Wasm frames with three players,
and minimum native bot health of 61 / 16. Thus all seven titles have a passing
case in both profiles, but the original one-minute matrix remains a recorded
failure, not a clean 14/14 result. The evidence preserves both outcomes.
Those three-player cases do not replace the two-bot-only tests: the diagnostic
Wasm peer also moves and fires. No new native engine/AI fix was inferred solely
from the one-minute health assertion.

The 32-case native single-player startup/control/audio regression matrix passes.
The native build script, static/source/package/HTTP suite, loopback diagnostic
transport framing/isolation/cleanup test, and read-only lab image audit pass.
The transport helper lives in `scripts/helpers`, avoiding the inherited `lib`
ignore rule that would otherwise hide a required diagnostic source file.

## Still required

Managed bot packaging and supervisor startup/readiness/failure/idle cleanup are
not implemented. Preserve two-human lobby admission when introducing automatic
start: Chocolate's synchronized matches do not support normal late joining.
The diagnostic `-nodes 3` threshold is not the production policy.

Weapon preferences, explicit kill/respawn telemetry, longer endurance and
additional maps, native network audio, transition capture, actual browser relay
joins and Chrome gameplay acceptance remain open. These diagnostics use fake
DOM/2D presentation and a loopback UDP transport, not browser WebSockets.

## Preservation and handoff

The live image remains
`sha256:28359634e0a1412b59a93b7022d0efed8c936c1e0d1074080536767ee04bdc35`,
container `f5bce3a532fad70306ff18b7118eba8168f641b657f4b8cae5618daaef5973ad`.
Its managed server is sleeping with zero humans/relay peers. No production
service was recreated; all 32 lab container IDs match the preceding deployment
inventory. Owner IWADs were mounted read-only in the tests.
Only each diagnostic's generated temporary configuration/session and disposable
container were removed during cleanup. Owner saves/configuration were not used
as writable test output.

Build outputs, raw reports and failed-iteration logs are retained under
`/tmp/idtech1-classic-bots.AoTmOO`. The toolchain image is
`local/idtech1-classic-bot-toolchain:dev`; it is not a deployed game image.
All changes remain local and uncommitted. Blood crash reproduction remains
deferred to the user's next repro; RTCW's user-confirmed renderer is unchanged.
