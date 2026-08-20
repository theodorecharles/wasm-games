# NOLF 1 source-base audit

## What we have

Official **No One Lives Forever Source Code v1.003** (15 May 2001), vendored at
`vendor/nolf-source`. That tree is the game DLLs and the LithTech 2.1 SDK:

| Piece | Present | Notes |
| --- | --- | --- |
| `cshell` client game (`CreateClientShell`) | yes | Win32 / MFC-stub / DirectInput-era UI |
| `object.lto` server game | yes | Win32 |
| `cres` string resources | yes | Win32 RC |
| LithTech 2.1 SDK headers | yes | `ILTClient`, `ILTServer`, `IClientShell` |
| Shared helpers (`CRC32`, bute wrappers) | yes | headers + sources; CRC32 pulls the engine FS |
| StdLith / ButeMgr / RezMgr implementations | headers + Win32 `.lib` only in 1.003; **RezMgr v1 reader now in `native/`** | on-disk format taken from owner-authorized GPL Jupiter EX `libs/rezmgr` |
| `lithtech.exe` engine | **no** | Jupiter EX runtime is NOLF 2's engine (world DAT v85). NOLF 1 worlds are DAT **v66** |

The official readme states the workspace builds `cres.dll`, `cshell.dll`, and
`object.lto` for use with an existing NOLF 1.003 install. It does not build the
engine.

## What a browser port still needs

LithTech owns the window, renderer (D3D7-era), REZ filesystem, world/model
formats, Miles sound, input, and the client/server loop. None of that source
is in the 1.003 dump. haekb's NOLF 1 Modernizer is a maintained Windows patch
of the same game DLLs and also lacks engine source.

Owner authorized the GPL Jupiter EX Build 69 tree
(`https://github.com/jsj2008/lithtech`, vendored at `vendor/lithtech`) as a
library/reference drop for this NOLF **1** port. That tree is **not** LithTech
2.1: it is the NOLF 2-era engine. Its `libs/rezmgr` on-disk format matches
NOLF 1 `RezMgr Version 1` archives. Its world loader rejects anything other
than `CURRENT_WORLD_VERSION 85`; retail NOLF 1 `.DAT` worlds are version **66**.

NOLF 2 work stays in the sibling `nolf2-wasm` tree. Do not mix the game
sources.

## Honest milestone

1. Official 1.003 game source is in-tree.
2. Owner-authorized Jupiter EX tree is vendored for RezMgr / StdLith / engine reference.
3. Owner GOTY 1.003 REZ archives are staged outside Git and allowlisted.
4. The host opens those archives with a RezMgr v1 reader and blits the official
   `MENU/ART/SPLASH` title card (Cate Archer + NOLF wordmark) at 640×480.
5. Attributes (`ATTRIBUTES/MISSIONS`, `ATTRIBUTES/WEAPONS`) come from the
   archives, not a full-file byte scan.
6. There is still no LithTech 2.1 `CreateClientShell` / D3D renderer. Gameplay
   after the splash is a stand-in until a 2.1 host exists.

Next real work is a LithTech 2.1 host that implements the 1.003 `ILTClient`
surface and can load DAT v66 worlds. Do not expect Jupiter's clientmgr to run
NOLF 1 levels unchanged.
