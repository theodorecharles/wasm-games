# Codex runbook: put the working Linux SurrealEngine into WASM

This tree is a **reset**. A previous browser port was thrown out because it did
not look like Unreal Tournament. Do not revive that approach.

The only proven artifact is a **native Linux SurrealEngine** that already
plays UT99 Deck16 correctly (Vulkan, `LoginPlayer` succeeds, materials look
like UT). The job is to get **that** program into the browser, not to invent
another stub renderer.

## Success

Open the WASM build, press Play, and **DM-Deck16][** looks like the native
window: paneled olive/teal-gray metal, teal water basin with the lift hole,
recognizable Deck16 architecture, first-person spawn. Not TV-static grain,
not a black frame, not a pulsing brown/purple stub, not a pile of dark
floating slabs.

Compare side by side with:

```bash
cd /home/ted/Development/wasm/openut-wasm/build-native
export LD_LIBRARY_PATH="$PWD:${LD_LIBRARY_PATH:-}"
export ZWIDGET_DISPLAY_BACKEND=X11   # optional; Wayland also works
./SurrealEngine --url='DM-Deck16][' --noentrymap \
  "/home/ted/.steam/debian-installation/steamapps/common/Unreal Tournament"
```

If no folder is passed, `./SurrealEngine` opens the SurrealEngine launcher.
Settings live in `~/.config/SurrealEngine/Settings.json`.

Native already printed `LoginPlayer ok (default)` and
`launching Unreal Tournament v436` from that Steam tree.

## What is in this workspace

| Path | What it is |
| --- | --- |
| `RUNBOOK.md` | This file |
| `vendor/SurrealEngine/` | SurrealEngine source that compiled |
| `build-native/` | Successful Linux Release build: `SurrealEngine`, `libSurrealVideo.so`, `SurrealEngine.pk3` |

There is **no** working WASM tree here on purpose. The failed WebGL device,
adapter, `build-web/`, Docker site files, and framework vendoring were
removed so they are not used as a template.

Retail UT99 is **not** in this repo. Use the owner's Steam install:

`/home/ted/.steam/debian-installation/steamapps/common/Unreal Tournament`

Never commit, upload, or bake those files into git or an image.

## Constraints (non-negotiable)

1. **Do not modify wasm-game-framework** (upstream or a vendor copy). If the
   framework cannot do something, stop and say so. Do not patch it.
2. **Do not send patches upstream** to SurrealEngine. This is a downstream
   port. Local edits in `vendor/SurrealEngine` are fine if they are required
   for Emscripten and `#ifdef __EMSCRIPTEN__` (or equivalent) so Linux still
   builds and still looks like UT.
3. **Do not use third-party SurrealEngine Emscripten ports as
   implementation input.** SurrealEngine's own Vulkan/D3D11/OpenGL devices
   and this native binary are the reference.
4. **Do not put retail game data in git.**
5. The product, if it is still a framework game, is a 0.9.6-style package
   (`wasm-game.json`, adapter, `callMain`, mount game at `/game`). Rebuild
   that contract from the framework docs, not from the deleted tree.

## Native rebuild (already done; keep it green)

Debian/Ubuntu packages that were required:

```bash
sudo apt install \
  libasound2-dev libopenal-dev libsdl3-dev \
  libxkbcommon-dev waylandpp-dev libxi-dev libglib2.0-dev
```

Already present on this machine: `g++`, `cmake`, `libvulkan-dev`,
`libx11-dev`, `libdbus-1-dev`, `libfontconfig-dev`.

```bash
cmake -S vendor/SurrealEngine -B build-native -DCMAKE_BUILD_TYPE=Release
cmake --build build-native --target SurrealEngine -j$(nproc)
```

`vendor/SurrealEngine/Docs/Building.md` is the upstream Linux guide.

`GameApp.cpp` was changed so a positional game folder plus `--url` /
`--noentrymap` **skips the launcher** and boots the map. That is how the
native command above works. Keep that.

## What the native program is doing (copy this, don't approximate)

- **Window:** SurrealWidgets (X11 / Wayland / SDL3). Vulkan surface.
- **Renderer:** `SurrealEngine/RenderDevice/Vulkan/` via SurrealGPU.
  `DrawComplexSurface` in `VulkanRenderDevice.cpp` is the world path:
  `U = (P·TextureU − Pan) * (1 / (UScale * USize))`, plus lightmap /
  macro / detail. Lightmaps come from `Light/LightSystem_Light.cpp`
  as `TextureFormat::RGBA32_F`.
- **Textures:** `RenderSubsystem::UpdateTextureInfo` (upstream uses
  `texture->DrawScale()` for `UScale`). Palettes are real `UPalette`
  objects. P8 is indexed, not grayscale.
- **Game:** UT99 **v436**, map **`DM-Deck16][`**, `--noentrymap`.
- **Pawn:** `Engine::LoginPlayer` → `GameInfo.Login` script.
  Native: `LoginPlayer ok (default)`. Viewport has a `UPlayerPawn`.
  `PlayerCalcView` places a first-person camera. Lightmaps + HUD work.
- **Clipper:** `VisibleFrame` uses `Clipper.IsAABBVisible` and
  `Clipper.CheckSurface`. That is how you get one visible world instead
  of every BSP node at once.

Read these before writing a line of WebGL:

- `vendor/SurrealEngine/SurrealEngine/RenderDevice/Vulkan/VulkanRenderDevice.cpp`
  (`DrawComplexSurface`, `DrawGouraudPolygon`, `DrawTile`)
- `vendor/SurrealEngine/SurrealEngine/RenderDevice/Vulkan/TextureManager.cpp`
- `vendor/SurrealEngine/SurrealEngine/Render/RenderSubsystem.cpp`
  (`UpdateTextureInfo`, `DrawGame`)
- `vendor/SurrealEngine/SurrealEngine/Render/VisibleFrame.cpp`
- `vendor/SurrealEngine/SurrealEngine/Render/VisibleNode.cpp`
- `vendor/SurrealEngine/SurrealEngine/Engine.cpp` (`Run`, `LoginPlayer`, `LoadMap`)
- `vendor/SurrealEngine/SurrealEngine/GameApp.cpp`

## Why the last WASM attempt failed (do not repeat)

A custom `WebGLRenderDevice` was bolted on and then patched in circles.
Symptoms and the actual causes:

| What you saw | What was going on |
| --- | --- |
| Brown/purple pulse | Factory stub, not the engine |
| “Data isn't installed” | Docker volume empty; Steam tree was never mounted |
| Water then click → black | Console `KeyEvent` / `bNoDrawWorld` without a pawn; `setCanvasSize` / SDL resize destroyed the WebGL context |
| TV-static / diamond grain | (1) `UTexture::USize()` often `1` or `DrawScale()` garbage on wasm32, so `UMult ≈ 1` or huge; (2) `CheckSurface` was `#ifdef`'d out because the software clipper used a different clip space than WebGL, so **every** BSP face drew and z-fought; (3) camera inches from a surface |
| Black after enabling lightmaps | Lightmaps are `RGBA32_F`; upload/decode was wrong or first pixel 0, shader `* light * 2` crushed the frame |
| Login always `GameInfo login failed:` with **empty** `Error` | `CallEvent(Login)` returned `Nothing` without running the real script (gate / missing fn / native throw swallowed in `Frame.cpp`). Real UT `Login` always writes `Error` before `return None`. Class retries (`TMale2` / spectator) cannot fix a no-op `CallEvent` |
| `TickFrame exception: Property offset out of bounds!` | `PropertyDataBlock::Ptr` on wasm32. Same offsets work on native x86_64. Do not paper over this by skipping `DrawGame` |
| World-space / “triplanar” UVs | Removed static, produced dark broken slabs. **Not** how SurrealEngine textures BSP. Do not ship this |

`vendor/SurrealEngine` still contains leftover `#ifdef __EMSCRIPTEN__` from
that attempt (`Engine.cpp` fallback cameras and pawn hacks,
`VisibleFrame.cpp` clipper skip, `RenderSubsystem.cpp` `UScale = 1`,
`CMakeLists.txt` WebGL sources, SDL2 canvas hacks). **Treat the running
native binary as truth.** Prefer deleting those ifdefs over extending them.
Linux must still compile and still look like UT after any cleanup.

## What to do instead

### 1. Keep native as the oracle

After every engine change, rebuild `build-native` and launch Deck16.
If native regresses, stop. The port is wrong.

### 2. Port the **Vulkan** world path to WebGL2, don't invent one

The OpenGL device under `RenderDevice/OpenGL/` is incomplete; native does
not use it. Vulkan `DrawComplexSurface` + `GetUMult` / `GetVMult` is the
spec.

Requirements for the browser device:

- Same UV formula as Vulkan. `USize` / `VSize` must be **mip
  `Width`/`Height`**, never a property that returns `1`.
- Per-texture palette at upload time. Cache it (`LoadedPalette` or
  equivalent). Do **not** grab “the first palette in the package”.
- UT P8 palettes are **BGRA** on disk.
- Lightmaps: consume `LightSystem::GetLevelLightmap` (`RGBA32_F`), sample
  in the shader like Vulkan (`* 2`). If a lightmap is missing, unlit
  diffuse — do not multiply by black.
- Depth + the **same** visible-set as native (`CheckSurface` / AABB).
  If the software clipper disagrees with WebGL clip space, **fix the
  matrices** so they match (native uses
  `clipzrange::negative_positive_w` and CPU `Project` in one failed
  experiment; Vulkan does GPU MVP). Do not disable the clipper.
- Do not resize the canvas backing store after the GL context exists
  (Emscripten `setCanvasSize` / `SDL_SetWindowSize` / `SDL_WINDOW_RESIZABLE`
  will kill the context).
- SDL2 is the Emscripten display backend (`ZWIDGET_DISPLAY_BACKEND=SDL2`).
  Alpha size 0. No fullscreen SDL resize.

### 3. Make `LoginPlayer` succeed on wasm32

Native proves the script and data are fine. WASM fails because the VM
never really logs in.

Debug in this order:

1. Log `FindEventFunction(Game, "Login")`, `Game->Level()->bBegunPlay()`,
   `IsEventEnabled(Login)`, and whether `pawnClass` is non-null.
2. Stop swallowing `std::exception` inside `Frame::Call` **during Login**
   so you see `Property offset out of bounds!` instead of a silent
   `Nothing`.
3. Fix the offset / `bBegunPlay` / CDO `CollisionRadius` path that
   `UActor::Spawn` hits (`GetDefaultObject<UActor>()`).
4. Only if Login still cannot run: possess a pawn the way
   `PossessSavedPlayer` does. That is a last resort, not the plan.
   A pawn whose `Physics` is `PHYS_Walking` with broken collision falls
   through the map. A pawn with default `console->bNoDrawWorld() == true`
   skips `DrawScene` (black frame).

### 4. Emscripten build

`emsdk` on this machine: `/home/ted/emsdk` (`emsdk_env.sh`).
`vendor/SurrealEngine/CMakeLists.txt` already has an `EMSCRIPTEN` branch
(it used to compile `openut.js`). Re-author that branch to link the
**new** device, not the deleted one.

Useful flags from the last build that did at least *boot* the engine:
`USE_SDL=2`, WebGL2, `ALLOW_MEMORY_GROWTH`, `FORCE_FILESYSTEM`, `idbfs.js`,
`NO_EXIT_RUNTIME`, `MODULARIZE` / `EXPORT_NAME=OPENUT`, `INVOKE_RUN=0`,
`DISABLE_EXCEPTION_CATCHING=0`, preload `SurrealEngine.pk3`.

Target `wasm32`. Property layout bugs will show up here even when native
x86_64 is fine.

### 5. Data and launch

Mount the Steam tree at `/game` (must contain `System/Core.u`,
`Engine.u`, `Botpack.u` / `UnrealTournament.u`, and `Maps/DM-Deck16][.unr`).
Launch like native:

`--url=DM-Deck16][` `--noentrymap` and a positional `/game`.

Chrome caches `/runtime/openut.wasm` (`max-age` or just the URL). Bump a
query string on `locateFile` when you ship a new wasm.

Docker that was used for testers: host **8101** → container 8088, volume
for game data at `/data`. Do **not** publish onto 8088 (WolfET) or 8015
(Jill). Rebuild the image only after the canvas looks like native.

### 6. Verify like a player

- Native Deck16 and WASM Deck16 at the same spawn: same metal, same
  water, same room.
- Click / look must not black the world.
- `LoginPlayer ok` (or a possessed pawn that does not fall through the
  floor). First-person, not a debug overview camera.
- Hard-refresh the tester URL after every wasm copy.

If you cannot match native visually, the port is not done. Do not call
world-space UVs or an unlit grain field “good enough.”

## Suggested order of work

1. Rebuild and run native Deck16. Screenshot it. That is the spec.
2. Strip abandoned EMSCRIPTEN hacks from `vendor/SurrealEngine` until
   `build-native` still runs and still looks like UT.
3. Implement WebGL2 device as a faithful subset of
   `VulkanRenderDevice::DrawComplexSurface` (diffuse + lightmap first).
4. Make clip space and `CheckSurface` agree. Confirm one world, no
   z-fight diamonds.
5. Make `LoginPlayer` actually run. Confirm first-person.
6. Wire Emscripten + adapter + `/game` mount. Cache-bust the wasm.
7. Only then: HUD, audio, input polish.

## Machine notes

- OS: Debian forky, `g++` 15.3, CMake 4.3.
- GPU: AMD Radeon 890M (RADV), Vulkan 1.4. Display `:1`, Wayland.
- Steam UT99 GOTY 436 is installed and already used successfully.
- `~/.config/SurrealEngine/Settings.json` already lists that UT folder.
