# NOLF 2 source-base audit

## What we have

Official NOLF 2 toolkit source, vendored from
https://github.com/wilkie/no-one-lives-forever-2 into `vendor/nolf2-source`.

That tree is the **game** (TO2 client/server/FX) plus shared libraries and the
Jupiter **SDK**:

| Piece | Present | Notes |
| --- | --- | --- |
| Client shell / object / FX game code | yes | Win32 |
| Shared CRC32, bute wrappers | yes | CRC32 opens files through the engine FS |
| StdLith, ButeMgr, CryptMgr, Lith | yes | real `.cpp` sources, unlike NOLF 1 |
| Engine SDK headers | yes | `Engine/sdk/inc` |
| `Engine.REZ` sample | yes | 102 KiB toolkit resource |
| Jupiter `lithtech.exe` runtime | **no** | only `server.lib` and headers |

`Engine/sdk/Legal.txt` identifies this as the LithTech Development System /
NOLF 2 toolkit, not a full engine grant.

## Jupiter EX engine (owner-authorized)

The owner authorized vendoring https://github.com/jsj2008/lithtech
(`vendor/lithtech`, commit 0eab182). That tree’s README calls it the
“apparent GPL release” of Jupiter EX Build 69 plus NOLF2 game code.

`sdk/Legal.txt` in that tree is still the LithTech copyright notice; there is
no COPYING file. Work stays local.

Linux fixes in that vendor tree (32-bit `DWORD`, `S_ISDIR`, `_splitpath`)
are required for RezMgr to read retail `GAME.REZ` on LP64.

## Honest milestone

1. Official toolkit source is in-tree.
2. Owner retail REZ archives are staged outside Git
   (`GAME.REZ`, `GAME2.REZ`, `SOUND.REZ`, `GAMEDLL.REZ`, `Engine.REZ`).
3. A RezMgr validator and wasm compile of official `CRC32.cpp` plus
   `libs/stdlith/helpers.cpp` prove the native seam compiles.
4. There is no Jupiter host, so the adapter must not report `menu` or
   `gameplay`.
