# Deathmatch selection repair — 2026-09-04

The [later menu/input checkpoint](MODERNIZED-MENUS-2026-09-04.md) supersedes
the live image/container and adapter IDs below while preserving this selection
repair. The IDs and reports here describe this historical deployment.

Installed at `http://127.0.0.1:8010/`. The final image passes real native-server/
Wasm joins for all seven Modernized titles, each with one client and two bots.
This is not Chrome acceptance: Chrome is still closed and permission to reopen
it remains unanswered. The diagnostic uses fake DOM/2D presentation and cannot
prove browser rendering, pointer capture, fullscreen, or audible output.

## Confirmed defects

1. The generic framework wake client reuses any running service without POSTing
   launch metadata. After a Classic launch, Modernized could receive the
   Classic endpoint even though it loads the Zandronum client.
2. The family supervisor compared engines but not variants. A Modernized
   Heretic wake immediately following Doom returned HTTP 200 with the same
   running Doom server, unchanged start time, and Doom IWAD. The
   [old-image negative control](managed-matches-legacy-2026-09-04.json)
   reproduces this independently of any browser.
3. Previously, a conflicting engine request could stop a connected match, and
   relay URLs did not identify the match the client had selected.

The adapter now POSTs its exact engine/variant on every deathmatch launch and
rejects an incompatible response before loading the native client. It preserves
specific server errors, including a busy-match explanation. Framework pins and
the generic shared wake API are unchanged; match selection is family-specific.

The supervisor serializes selection, validates all seven variants, and treats
both engine and variant as match identity. Same-match launches reuse the server.
An incompatible request returns 409 while players are connected or a launch is
reserved, rather than evicting them. The default launch reservation is 45 seconds
and protects the interval before the browser opens its relay. It clears when a
relay connects. After players leave, another title can be selected without
waiting for the normal five-minute idle timeout.

Each started match receives a fresh ID in its WebSocket URL. The relay rejects
stale IDs or an engine mismatch; a delayed old client cannot attach to a newer
match. IDs identify match generations, not accounts or authentication secrets.
The configured idle lifecycle remains owned by the shared framework.

## Verification

[Final-image integration report](managed-matches-2026-09-04.json):

- launch reservation rejects a competing title;
- concurrent same-match requests reuse one server and relay ID;
- a connected relay prevents a conflicting launch;
- switching Doom → Heretic after disconnect selects the new IWAD/server;
- stale relay URLs and invalid variants are rejected;
- Classic and Modernized select their respective engines;
- Doom, Doom II, TNT, Plutonia, Heretic, Hexen, and Chex all authenticate the
  native level, receive the complete snapshot, report three players, advance
  frames, move, and fire/release through the real WebSocket-to-UDP relay;
- the server sleeps after the client disconnects.

The final seven cases each report three players and 464–508 advancing client
frames; W movement succeeded in each. The diagnostic waits for the complete
snapshot, not merely `GS_LEVEL`, which is set earlier. It can try another WASD
direction if a random deathmatch spawn faces a wall. Native JS/Wasm/support
hashes are embedded in each case.

The isolated tests use a two-second idle timeout and one-second launch lease
to exercise transitions quickly. Production retains five minutes and 45
seconds. Every test container gets a read-only owner-data bind and is removed
after its own run; it never targets the live lab service.

`scripts/test-adapter-contract.js` covers all 21 title/profile selections,
matching native client/relay arguments, busy responses, and mismatched variants.
The complete `scripts/test-static.sh` suite passes, including the prior classic
startup source reconstruction and configuration migration checks.

Re-run against the retained final image:

```sh
IDTECH1_TEST_IMAGE=local/idtech1-wasm:match-selection-candidate \
  IDTECH1_TEST_FROM_IMAGE=1 node scripts/test-managed-matches.mjs --expect-menu-bug
IDTECH1_TEST_IMAGE=local/idtech1-wasm:opl-startup-candidate \
  node scripts/test-managed-matches.mjs --legacy
./scripts/test-static.sh
```

The first command explicitly expects this retained client's pre-repair menu
defects while verifying selection and native joins. The second command is a
negative control: passing means the old selection bug
was reproduced. Without `IDTECH1_TEST_FROM_IMAGE`, the positive integration
runner mounts the current supervisor source into its disposable container.

## Deployment and preservation

- Live image: `sha256:c43203b29bce3a03b40b650064b5306bc6e80f5e04f4e4572989eb6614f801d9`,
  tagged `idtech1-wasm:dev` and `local/idtech1-wasm:match-selection-candidate`.
- Live container: `3bb33033cf43e976fa1dec56630ff3cb34d59c1b16f38b4fd071c51bc640abec`.
- Retained pre-selection image:
  `sha256:a9a8e915e3b764066fddcfbc0b25cb7dad9b3f0f1461739b38298ebf3be1a9f1`,
  tag `local/idtech1-wasm:opl-startup-candidate`. This includes the earlier
  classic OPL/configuration repair.
- Adapter SHA-256:
  `1b32a4db81c1459ae41536a6446209849a34d9f327f125f72d15f006fdec6171`.
- Supervisor SHA-256:
  `e2df4a5c7db5a93d78934dbebb0d1154744a7a71984561f8fb682ccf65aa7f52`.

A targeted image layer replaces only the adapter and supervisor. A 69-file
comparison confirms that all engine artifacts, support assets, native servers,
relay implementations, and shared framework files remain byte-identical.
Source changes also flow through the canonical full image build.

Pre/post lab image audits pass. All 31 other running lab containers retain
their IDs; RTCW was untouched. Live HTTP checks confirm the adapter and engine
bytes, seven ready owner-data gates, and private `/data/DOOM.WAD` = 404. The owner
bind is unchanged and no WADs/saves were deleted or embedded in images.

Logs, inventories, the targeted Dockerfile, and hash comparisons are retained
in `/tmp/idtech1-match-selection.w8QzTs`. Changes are local and uncommitted.

## Remaining acceptance and features

- The observed owner console-only symptom still needs a fresh Chrome retest;
  this proves concrete selection defects and native joins, not every possible
  browser startup failure.
- Modernized menu cursor/capture behavior remains open.
- Classic deathmatch still uses a two-human Chocolate lobby and has no bots;
  the requested solo-with-bots behavior is not implemented by this change.
- The current Zandronum build explicitly uses `NO_SOUND=ON`; Modernized
  multiplayer audio is not working/proven. Do not confuse it with DSDA
  single-player sound, which the owner already confirmed after unmuting Chrome.
