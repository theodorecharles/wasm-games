# id Tech 4 physical Ctrl/Alt input — 2026-09-05

## Reproduced defect and repair

Actual Doom 3 native `bind CTRL` reports `_attack`, but the browser adapter's
keydown handler returned early whenever `event.ctrlKey` or `event.altKey` was
true. Those flags are already true on a physical Control/Alt keydown, so the
adapter discarded the press while still forwarding the release. This affects
the shared adapter used by all six suite variants.

`site/game-adapter.js` now distinguishes physical ControlLeft/Right and
AltLeft/Right from modified **other** keys. It forwards those modifier edges;
Ctrl/Alt/Meta shortcut letters remain suppressed, Meta stays browser-owned,
and no browser-shortcut `preventDefault` is added. No key rebinding, synthetic
held input, worker/engine change or renderer change is part of this repair.

The expanded actual-adapter fixture passes **402 new cases** across Doom 3,
Doom 3 MP, RoE, Quake 4, Quake 4 MP and Prey: 32 modifier-flag combinations
plus 35 reserved-shortcut combinations per variant. It also verifies releases
and absence of unintended shortcut suppression. Existing suite adapter
contracts still pass. The [positive/negative proof](idtech4-modifier-keys-2026-09-05.json)
restores only the old guard in a disposable source copy; that negative control
fails `ControlLeft` with `ctrlKey=true`, matching the initial unmodified failure.
These are real adapter handlers with fixture DOM/worker APIs, not six native
game or held-input acceptance claims.

```sh
node scripts/test-modifier-keys.mjs
```

## Immutable local v6 package

- Image `local/idtech4-wasm:doom3-sabot-candidate-v6`:
  `sha256:729fd8035b80280ace9c9c29cb71ec3649820f20deee190f42e717f8cc26dfc5`.
- Adapter `ef44838bdad4bc65530ad030942e0f8ad7088f82c1a49b025c6368738a367b8a`.
- Native dedicated/game, Wasm/JS, worker, runtime, roster and bot archive are
  byte-identical to v5. The [package proof](idtech4-modifier-package-2026-09-05.json)
  verifies **nine actual image files**, now including the adapter. The lock
  records that adapter as both a package input and output; staging runs its
  positive and negative regression fixtures before building.
- Snapshot, population, voting, source-reproduction, roster, worker and actual-map
  status regressions pass during packaging. All [47 packaged lifecycle checks](idtech4-modifier-http-2026-09-05.json)
  pass on v6. No registry push, live service replacement or production staging
  overwrite; earlier image tags remain unchanged. Public release gates remain.

## Actual Chrome

`d3-modifier-chrome-proof-20260905`, on **32925**, uses the unmodified v6 image,
read-only owner data/root and a test-only 90-second idle. `ModifierMarine`
joins through normal Play at `/?proof=modifier-keys`. The native roster reaches
one human/two healthy bots (its earliest ready sample can still use the initial
`Player` name before userinfo updates; browser logs identify `ModifierMarine`).

[Actual Ctrl telemetry](idtech4-modifier-ctrl-chrome-2026-09-05.json) starts
with no input and records one physical SDL scan 224 press and release, with
no text injection. The first tap is 1.1 ms, not a held-fire test. A native
`bind CTRL` query confirms `_attack` without rebinding. After entering spectator
mode, a bounded tap check changes [Spectating](idtech4-modifier-spectator-before-2026-09-05.jpg)
to [Following a real bot](idtech4-modifier-spectator-after-2026-09-05.jpg).
[The native-action record](idtech4-modifier-native-action-2026-09-05.json) retains
the log and measured 0.7–1.3 ms event pairs. This verifies an actual native
action through the repaired path; sustained fire, pointer-lock movement and
full visual/audio acceptance remain separate gates.

[Actual Chrome Alt](idtech4-modifier-alt-chrome-2026-09-05.json) likewise records
both scan 226 edges and no text. The [combined acceptance record](idtech4-modifier-chrome-acceptance-2026-09-05.json)
checks both input sequences, retains the visual native-action observation and
confirms the real `ModifierMarine` roster with two healthy bots.

An automatic map cycle interrupts the first cleanup attempt. The subsequent
[confirmed restoration](idtech4-modifier-restored-confirmed-2026-09-05.json),
not the earlier incomplete attempt, verifies `ui_spectate=PLAY` and the
unchanged `CTRL=_attack`. [Native disconnect](idtech4-modifier-disconnect-2026-09-05.json)
then returns the client to the menu; its tab is `about:blank`.
[Natural idle cleanup](idtech4-modifier-final-idle-2026-09-05.json) confirms
zero peers, no dedicated child or temporary session and a cleared bot target.
The v5 comparison container on 32920 and v6 on 32925 are both sleeping.

The earlier [Delta Lab comparison](D3-DELTA-DIAGNOSTIC-2026-09-05.md) remains
a renderer investigation, not a closed issue or a reason to alter shaders.
