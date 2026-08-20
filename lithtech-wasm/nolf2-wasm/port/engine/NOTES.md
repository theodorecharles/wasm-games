# Jupiter Linux host (in progress)

Retail SP path the engine already implements:

1. `CClientMgr::Init` loads REZs (`-rez GAME.REZ -rez GAME2.REZ -rez SOUND.REZ -rez Engine.REZ`).
2. `dsi_InitClientShellDE` requires `IClientShell` from static `define_interface(CTO2GameClientShell, IClientShell)`.
3. `OnEngineInitialized` → `SetRenderMode` → `CInterfaceMgr::Init` → `GS_SPLASHSCREEN`.
4. Splash uses `CreateSurfaceFromBitmap("Interface\\Menu\\Art\\splash.pcx")`.
5. Then `SCREEN_ID_MAIN` (real LTGUI menu).
6. New game: `Attributes\\Missions.txt` via `TO2MissionButeMgr`, then `SetupServerSinglePlayer` + `StartGameFromLevel`.
7. Server loads ObjectDLL (`ObjectDLLSetup` / `IServerShell`).

Linux glue we must supply (not fake):

- SDL `main` instead of `WinMain`
- `RenderStruct` (SDL/GL) including DrawPrim for LTGUI
- InputMgr + default bindings
- `GetEngineHook("cres_hinstance")` → non-NULL so `LoadString` hits `port/cres/cres_loadstring.cpp` (5288 official EN strings)
- Sound driver
- `LoadWorldData` for `.dat` render blocks
- `--whole-archive` nolf2_cshell nolf2_object
