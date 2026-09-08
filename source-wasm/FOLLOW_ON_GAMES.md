# Follow-on Source games: local data audit

Audited **2026-09-07, America/New_York**. Base Half-Life 2 remains the active task in [HL2_RUNBOOK.md](HL2_RUNBOOK.md); Portal and the HL2 follow-ons are queued. This audit did not download, change branches, extract data, build another game, or change any preview.

Steam records one library: `/home/ted/.steam/debian-installation`. Below, `common/` means that library's `steamapps/common/`; manifests are `steamapps/appmanifest_<AppID>.acf`. A manifest or directory by itself is not proof of a complete, compatible install.

| Game / AppID | Manifest build; branch evidence; StateFlags | Local install and content | Assessment |
| --- | --- | --- | --- |
| Lost Coast / **340** | **16425450**; no `BetaKey` recorded; **68** | Manifest install directory is `common/Half-Life 2`; `lostcoast/` contains native `bin/` files and a save directory. **No gameinfo, VPKs, or BSP maps** were found there. | Required game data is absent from the advertised location. Do not treat this manifest as a usable Lost Coast install. |
| Episode One / **380** | **17324704**; no `BetaKey` recorded; **68** | `common/Half-Life 2/episodic/`: `gameinfo.txt`, **20 loose BSPs**, `ep1_pak_dir.vpk` plus **000–009**. Directory has **5,533 entries**, including **2,725 voice entries**. | Substantial content is present; all referenced archive spans fit existing files. Whole-content CRC/depot verification and engine compatibility remain unproven. |
| Episode Two / **420** | **17324709**; no `BetaKey` recorded; **68** | `common/Half-Life 2/ep2/`: `gameinfo.txt`, **22 loose BSPs**, `ep2_pak_dir.vpk` plus **000–020**. Directory has **11,097 entries**, including **1,872 voice entries**. | Same bounded structural check passes. Its gameinfo also requires Episode One and shared HL2 content; campaign completeness is not established. |
| Portal / **400** | **19017868**; English, no `BetaKey` recorded; **4** | Separate `common/Portal/`: `portal/gameinfo.txt`, `portal/steam.inf`, **26 loose BSPs**, `portal_pak_dir.vpk` plus **000–005**, and its own `hl2/` + `platform/` packs. Portal pack has **3,524 entries**, including **360 voice entries**; another **300 loose voice WAVs** exist. | Has its own independent shared-base data. Structural checks and selected CRCs pass; this is not a full integrity or playability certificate. |

No recorded `BetaKey` means the local manifests do not identify a selected beta. It is not evidence that these builds match the HL2 `steam_legacy` recipe. Numeric StateFlags are retained as observed rather than used to infer readiness. `steam.inf` client/server versions are separate values from Steam build IDs.

## Packs and dependencies already present

Episode One's gameinfo orders its own packs before shared HL2 data. Episode Two orders `ep2`, then `episodic`, then HL2. Both share an install directory with **HL2 AppID 220, build 12694556, explicitly `steam_legacy`**. Thus their newer manifest builds currently coexist with a legacy shared base; do not assume this mixed version arrangement is coherent.

The existing HL2 base supplies these six directory packs and numbered archives: `hl2_pak` **000**, `hl2_misc` **000–003**, `hl2_textures` **000–011**, `hl2_sound_misc` **000–002**, `hl2_sound_vo_english` **000–004**, and `platform_misc` **000**. The active HL2 extraction and its exact voice repair receipt are documented in the main runbook. Follow-on recipes must establish their own dependency versions and precedence.

Portal carries its own shared pack set, under `common/Portal/`:

| Pack prefix | Numbered archives | Directory entries |
| --- | --- | ---: |
| `portal/portal_pak` | 000–005 | 3,524 |
| `hl2/hl2_misc` | 000–003 | 18,796 |
| `hl2/hl2_textures` | 000–011 | 5,232 |
| `hl2/hl2_sound_misc` | 000–003 | 3,255 |
| `hl2/hl2_sound_vo_english` | 000–004 | 2,553 |
| `platform/platform_misc` | 000 | 417 |

Every listed prefix has its `_dir.vpk`. All referenced numbered archives exist as regular files and cover the directory entries' declared offsets and lengths. Portal's gameinfo does not require an `hl2_pak` overlay. Its shared packs differ from those in the HL2 legacy install and should remain a separate dataset.

The gameinfo files mention separate `ep1_sound_vo_english`, `ep2_sound_vo_english`, and `portal_sound_vo_english` packs, which are absent. Each game's main pack contains voice entries, and a sampled voice payload passed CRC, so absence of a separate voice pack alone does **not** establish missing audio. Full per-game content/depot validation is still needed.

## Verification limits and engine work

The audit used [vpk-reader.mjs](scripts/vpk-reader.mjs) for directory parsing, archive bounds, and selected payload CRCs. Sampled voice, material, and model payloads passed in all three main game packs. Portal's shared `vertexlit_and_unlit_generic_vs20.vcs` passed CRC and has **shader bytecode version 6**. Its shared `al_pickherup.wav` also passed the expected CRC; this copy does not exhibit the original HL2 voice-pack failure. No full archive CRC sweep was performed.

Opening maps `episodic/maps/ep1_citadel_00.bsp`, `ep2/maps/ep2_outland_01.bsp`, and `portal/maps/testchmb_a_00.bsp` all have **VBSP version 20** headers. These headers and the sampled shader version are necessary clues, not proof of runtime compatibility.

Pinned engine source `63f8364` has `hl2`, `episodic`, and `portal` client/server targets in `game/{client,server}/wscript`. The episodic VPCs enable `HL2_EPISODIC`; Portal enables both `PORTAL` and `HL2_EPISODIC`. There are no separate `ep1`, `ep2`, or `lostcoast` build target names. Episode One and Two are candidates for the `episodic` target with distinct game directories; Lost Coast using `hl2` remains an untested inference.

[build-side-modules.sh](scripts/build-side-modules.sh) currently selects `--build-games=hl2`. No follow-on module set has been built or validated. Each target emits `libclient.so` and `libserver.so`, with flattened WASM output paths: future builds need separate frozen directories and matching module pairs. Current [data policy](scripts/source-data-policy.mjs), [data generator](scripts/generate-game-data.mjs), and [web manifest](web/wasm-game.json) expose HL2 and Portal only; Lost Coast and episode variants need explicit policies, start maps, and persistence namespaces.

After HL2 acceptance, Portal requires a separate, pinned data receipt with full validation of its own packs and a Portal-target module build. Episode data needs its shared-base compatibility resolved; Lost Coast needs its missing game data located or provisioned first. No existing install should be changed based on this audit alone.

## Recorded installed depot manifests

These are local Steam manifest claims, not depot verification results.

| AppID | Depot ID → manifest ID |
| --- | --- |
| 340 | `340 → 4714758009482017207` |
| 380 | `389 → 1776767667551246449`; `380 → 2711482073477362647` |
| 420 | `420 → 5401366820066204187` |
| 400 | `404 → 1961797017312074949`; `409 → 5466869569815608374`; `410 → 106212190778449766`; `401 → 3169084482272098670` |
