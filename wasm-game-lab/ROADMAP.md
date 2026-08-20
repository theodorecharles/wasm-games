# WASM Game Lab roadmap

This private roadmap records candidate work without advertising an unfinished
public repository. A title normally enters `games.json` only after it has a
canonical image and an honest runnable or diagnostic endpoint. A catalog-only
entry is permitted when its canonical project explicitly declares
`runtimeReady: false`, publishes no placeholder image, and the Lab marks it
non-launching.

## Active

| Priority | Target | Planned home | Current basis |
| --- | --- | --- | --- |
| 1 | Current 42-shortcut portfolio | Current family repositories | Framework 0.9.1 is pinned at `68bfbd1`; finish serialized browser acceptance while retaining honest statuses |
| 2 | OpenRCT2 / RollerCoaster Tycoon 2 | `openrct2-wasm` | Mature native SDL/CMake engine; game data still needs to be installed |
| 3 | Grand Theft Auto III | `renderware-wasm` | `re3` plus `librw`; classic PC game data still needs to be supplied |

## Admitted in the 0.9.1 refresh

NES, SNES, PlayStation, and PlayStation 2 now have source-authored system-icon
shortcuts from `emulation-wasm`. All remain `Still in development` and are
explicitly non-launching because no runtime artifacts or non-placeholder images
exist. Source/HL2 and CoD2 remain honest diagnostics on their current public
repositories and 0.9.1 locked images.

## Experimental after the active queue

| Target | Planned home | Entry condition |
| --- | --- | --- |
| Soldier of Fortune 1 | `idtech2-wasm` or a focused sibling | Advance the native SoF rewrite past placeholder GHOUL characters/props, then port its SDL2/OpenGL 2.1 SP client |
| Soldier of Fortune 2 | `idtech3-wasm` | Reapply the SoF2 compatibility layer to a current OpenJK base, use a separate SoF2Plus server, and preserve MP bots |
| Need for Speed 3 | `opennfs-wasm` | Prove OpenNFS native gameplay beyond asset loading, then begin the Emscripten seam using the available NFS3 data |

## Parked

| Target | Reason |
| --- | --- |
| Midtown Madness 1 | Open1560 is executable-free but still depends on 509,827 lines of x86 MASM and 4,456 assembly procedures; the browser archive probe works, but the game cannot link under Emscripten yet |
| Midtown Madness 2 | OpenMM2 is a 32-bit Windows in-process hook/proxy rather than a standalone engine |
| SimTower | The available archive is a Windows 3.1/WinG installer, not a DOS game; OpenSkyscraper is an incomplete inspired simulation rather than the original engine |
| Max Payne 1 and 2 | No complete native engine or reimplementation is public; available ports reuse native binaries |
| Unreal Tournament 2004 | Public repositories expose UnrealScript, SDK code, and patch documentation, but not the complete maintained UE2.5 engine |
| Grand Theft Auto 2 | No DOS version or suitable installed standalone engine was found |
| Grand Theft Auto: San Andreas | Current reconstruction builds an injected Windows DLL; standalone engine remains a future goal |
| SimCity 3000 | No complete standalone native engine was found; current work is asset extraction/research rather than the full simulation |
| SimCity 4 | Installation exists, but no complete standalone native engine was found |

## Selection rule

Prefer a complete native source port that can retain original gameplay, menus,
audio, input, and saves. A partial asset viewer can justify an experimental
probe, but not a playable project claim. Existing browser ports are not used as
the implementation base unless the user explicitly authorizes that project.
