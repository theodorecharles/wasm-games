# Blue Shift save/reload and native save-key hints — 2026-09-05

Actual Chrome confirms a Blue Shift menu save survives a full page reload,
appears with its preview, and restores the tram scene. F6 quick save and F7
quick load also work. A separate native-menu defect falsely displayed
`<KEY NOT FOUND>` for both actions; the repaired local candidate displays F6/F7.
Live services and original owner data are unchanged. This is not complete
campaign, mouse-capture, audio or other-variant save acceptance.

## Save/reload evidence

The run uses the retained stored-WAD candidate at `127.0.0.1:32931`, normal
Play → New Game → Medium, then Escape → Save/load game → Save game →
New saved game. No existing slot is overwritten. The
[new-slot screen](blue-shift-save-new-menu-2026-09-05.jpg) and
[native save/status log](blue-shift-save-before-reload-2026-09-05.json) record
`save/save000.sav` written at 22:05:18, map `ba_tram1`, `host_framerate=0`
and `sys_timescale=1.0`.

After [normal disconnect](blue-shift-save-departure-2026-09-05.json), the page
is navigated again at 02:06:36 UTC; Play creates a fresh native engine.
The [load menu](blue-shift-save-reloaded-menu-2026-09-05.jpg) shows the saved
LIVING QUARTERS OUTBOUND row and its tram preview. Clicking Load game produces
[native restore evidence](blue-shift-save-reloaded-2026-09-05.json):
`save/save000.sav` and `save/ba_tram1.HL1` load at 22:07:56,
`Game started` follows at 22:07:57, and resources complete at 22:07:59.
The [restored world](blue-shift-save-reloaded-world-2026-09-05.jpg) has textured
tram/terrain and the 100-health HUD. This crosses a real browser page reload;
it is not just a same-engine memory restore or a direct map command.

Trusted Chrome F6 produces [Quick Saving and `save/quick.sav`](blue-shift-quicksave-key-2026-09-05.json)
at 22:08:45. F7 produces [Quick Loading and native restore](blue-shift-quickload-key-2026-09-05.json)
at 22:10:50, returning to gameplay. The
[final native status](blue-shift-save-final-status-2026-09-05.json) confirms
the same map, default timing, F7=`loadquick` and normal disconnect. Both test
tabs are cleared after native departure; the new saves remain on this isolated
browser origin. No game bindings are changed during these checks.

The [saved-evidence verifier](../scripts/test-save-evidence.mjs) checks native
write/restore ordering, fresh initialization, gameplay, map/timing queries,
quick-save/load and normal departure. Its
[report](goldsource-save-chrome-2026-09-05.json) hashes the underlying records
and manually reviewed images, and explicitly leaves capture/full-campaign
acceptance false. The image hashes do not substitute for visual inspection.

## Menu defect and repair

The pinned engine's `engine/client/keys.c` binds F6=`savequick` and
F7=`loadquick`; `engine/server/sv_cmds.c` registers both commands. In contrast,
`3rdparty/mainui/menus/SaveLoad.cpp` queried only exact bindings `save quick`
and `load quick`. Native console queries and the actual F6/F7 save/load above
show that the controls were present: the help text was wrong.

[The menu patch](../patches/xash-save-hints.patch) first looks up the current
command, then falls back to the old spelling. It preserves custom bindings,
does not hard-code F6/F7 in the menu, and does not assign keys. Missing bindings
still remain missing. The browser native-build patch list and source inventory
include the new patch.

[Ten compiled lookup cases](../scripts/test-save-hints.mjs) cover current,
legacy, both-present, first/last key, lowest-key selection, case-insensitive
lookup, similar-but-incorrect names, one-sided and fully unbound cases. The
exact old lookup expressions fail the first case (`-1/-1` instead of the two
bound keys). The postimage passes, and the same harness also passes against
the [actual applied native source](goldsource-save-hints-native-2026-09-05.json).
Full GoldSource `npm test`, including these cases, passes.

The menu-only rebuild uses the retained native builder image
`334b4091e695ecbe357dccfcb8810385297ab50531f2dd4431d39159a02ad771`, engine
commit `f85aa0c8f7d46c27191132b44d872c8e331308de`, mainui submodule commit
`0659b939376770ff09b23069c7d56662a96a393e`, and `emmake ./waf build --targets=menu`.
The stopped builder `goldsource-save-hints-build-20260905` retains the applied
source/output. The full native build script applies the patch for fresh builds.

## Packaged Chrome check and retained candidate

[Package verification](goldsource-save-hints-package-2026-09-05.json) checks
all 13 native/support artifacts. Only the generic menu library changes;
the adapter bundle differs solely in that library's immutable URL. Twenty-five
other files, including all game modules, engine, renderers, CS menu, art/config,
private-data manifest and three shared-shell files, match the prior candidate.
All four owner-data readiness checks pass; private data/report routes stay 404.

Actual Chrome launches Blue Shift normally on the new candidate and opens the
native Save/load menu. The [repaired hint screen](blue-shift-save-hints-fixed-2026-09-05.jpg)
now displays F6 and F7. Its [native/DOM trace](blue-shift-save-hints-fixed-2026-09-05.json)
still contains the known `WrongDocumentError` capture failure; this menu repair
does not claim to address mouse look. The
[final native queries/departure](blue-shift-save-hints-final-status-2026-09-05.json)
confirm unchanged F6/F7 bindings, default timing and normal disconnect.
Save persistence was exercised on 32931;
32932 separately verifies the changed native menu, with unchanged persistence
and game/engine bytes established by the package comparison.

- Candidate: `http://127.0.0.1:32932/?game=blue-shift`.
- Image: `local/goldsource-wasm:save-hints-candidate`, SHA-256
  `967561eca15081284748f7a46178a1f5d8f8024a3aa182e4a95e2a406ca9c2ce`.
- Container: `goldsource-save-hints-chrome-proof-20260905`, read-only root,
  isolated `/tmp`, loopback HTTP, existing durable private data mounted read-only.
- New menu SHA-256: `70eabf13cfa662df6bc10ffc59e78e43eabd61c0d769d31a4a941fc79daa31cf`.
- New adapter bundle SHA-256: `8f0c2f02d4a8b00bad9610a8fe75519f2558a6dd49a4783d26da8af3b5077eff`.
- Build stage and original menu backup: `/tmp/goldsource-save-hints.386yU7`.
  Source patch/test and generated web/native output are in the working tree;
  the built image and durable owner-data mount do not depend on that temporary stage.

Recheck commands (from `goldsource-wasm`):

```sh
npm test
MENU_HINT_LEGACY=1 node scripts/test-save-hints.mjs # expected failure
SAVE_EVIDENCE_PROOF=proofs/goldsource-save-chrome-2026-09-05.json \
  node scripts/test-save-evidence.mjs
```

The [stored-WAD checkpoint](GOLDSOURCE-STORED-WAD-2026-09-05.md) describes the
matched private data manifest; the repository source manifest still describes
the original installed archives. Do not pair the rebuilt web site with different
owner-data hashes. Live GoldSource/CS processes retain their original IDs,
images, start times and restart counts.

Remaining: sustained capture/mouse look, held movement/fire, audible playback,
actual log-selection acceptance, extended normal campaigns/map transitions,
Half-Life/Opposing Force save/reload, and live promotion. Existing GL, missing
media/localization/sound and configuration warnings remain visible in the logs.
