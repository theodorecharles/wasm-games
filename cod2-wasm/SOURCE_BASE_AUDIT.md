# CoD2 native source-base audit

This audit compares the current OpenCoD2 checkpoint at
`f70e697476fceeb4f53de677e1c5d5fe12a00b36` with `xtnded/cod2` at
`8eccf06c80423f099fb01745529bee6bb43cc84a`. No existing WebAssembly port or
generated WebAssembly artifact is an input.

## Result

`xtnded/cod2` is the preferable provenance boundary for a future clean GPL
restart, but it is not currently a usable native or WebAssembly engine base.
The present OpenCoD2 tree is materially farther along technically and remains
the local diagnostic checkpoint. It must not be published without a documented
source license.

The correct engine-family label for Call of Duty 2 is **IW 2.0**. **IW 3.0** is
the later Call of Duty 4 generation.

## Evidence

| Question | `xtnded/cod2` | Current OpenCoD2 checkpoint |
| --- | --- | --- |
| Pinned commit | `8eccf06c80423f099fb01745529bee6bb43cc84a` | `f70e697476fceeb4f53de677e1c5d5fe12a00b36` |
| Git ancestry | No merge base with OpenCoD2 | No merge base with `xtnded/cod2` |
| Repository license | `COPYING.txt`, GPL-2.0, SHA-256 `fac9da110d1433f4df0cb9f5dda9449e9aff6ee236ed240fa29e3e92926c363a` | No repository-level license file |
| Reconstruction inventory | Summary reports 383 source files; 1,500 tracked files | 951 files at pinned upstream baseline; downstream selects 395 WebAssembly objects |
| Native CMake | Three target names, each with only `unix/unix_main.cpp`; build fails in that file | Native reconstruction has a broad source graph and platform-specific build paths |
| Emscripten | Configures, then fails in `unix/unix_main.cpp` on undeclared `Com_Printf`, `Win_LocalizeRef`, `sys_info`, and related symbols | 395 selected translation units compile; final engine link is blocked by cross-kind generated symbols |
| SP coverage | Partial `game`, `cgame`, and `ui`; no SP `client` or `server` | Partial `game`, `cgame`, and `ui`; no SP `client` or `server` |
| MP coverage | `client_mp`, `server_mp`, `game_mp`, `cgame_mp`, `ui_mp` exist but are not part of a complete CMake source target | Those MP families are compiled by the downstream object target |
| State model | More than 21,000 decompiler-style global references plus raw 32-bit assumptions; no portable typed-state replacement | Generated data/literal/import blobs allow object compilation but cause the current WebAssembly link collision |

## Reproduction

The native and WebAssembly results were produced from fresh temporary
checkouts/build directories:

```bash
git clone --no-tags https://github.com/xtnded/cod2.git /tmp/xtnded-cod2
git -C /tmp/xtnded-cod2 checkout 8eccf06c80423f099fb01745529bee6bb43cc84a
cmake -S /tmp/xtnded-cod2 -B /tmp/xtnded-native -G Ninja
cmake --build /tmp/xtnded-native
emcmake cmake -S /tmp/xtnded-cod2 -B /tmp/xtnded-wasm -G Ninja
cmake --build /tmp/xtnded-wasm
```

Both builds stop in the first target source. The `CoD2SP_s` name does not prove
single-player support because its target uses the same lone source as
`CoD2MP_s` and `cod2_lnxded`.

## Clean GPL restart boundary

A GPL restart should pin `xtnded/cod2`, copy its GPL notice into produced source
distributions, and create committed downstream patches that:

1. establish complete, mode-specific source lists;
2. replace undeclared decompiler globals with reviewed declarations and typed
   state;
3. isolate Carbon, AGL, Win32, threading, filesystem, audio, and networking
   dependencies behind browser platform seams;
4. build a native IW 2.0 multiplayer executable before introducing Emscripten;
5. add the Emscripten main loop, WebGL renderer path, audio, input, and lazy IWD
   access without importing the current unlicensed generated transformations.

Until that work reaches the current 395-object milestone, replacing the active
checkpoint would reduce technical coverage without producing a runnable engine.
