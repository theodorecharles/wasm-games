# Game Lab Fix TODO

Working fix list from the 2026-08-29 lab test session. Full details, evidence,
and root causes: [`GAME-LAB-TEST-ISSUES.md`](GAME-LAB-TEST-ISSUES.md).

## P0 — hard blockers (game completely unplayable)

- [ ] **idtech2:** q2ded refuses to run as root — server wake 500 (Quake II DM, Reckoning, Ground Zero)
- [ ] **idtech1:** Chocolate/Crispy startup freeze; deathmatch never starts (no bots); Modernized cursor + DM console-only
- [ ] **idtech3:** rebuild stale images (rtcw-sp, rtcw-mp, quake3) from current pinned source, then retest
- [ ] **idtech4 Quake 4 SP+MP:** renderer aborts under WebGL2 (needs d3wasm-style renderer or ES feature mapping); OpenAL init fails
- [ ] **dosbox input:** arrows may be delivered as Escape (Jill 1-3, Duke 1-2, Jazz); Jazz text input dead
- [ ] **dosbox performance:** GTA ~1fps + no sound (confirmed on re-test); NFS game never starts (menu only)
- [ ] **build-wasm:** bind left mouse click to fire (Blood + Duke3D)
- [ ] **Blood:** investigate crash after firing weapon
- [ ] **pointer-lock lifecycle:** capture on gameplay start / menu close, release on Escape to main menu (idtech2, idtech3, goldsource, wolf3d)
- [ ] **goldsource:** no mouse look (HL/BS/OF); BS+OF slow startup regression; log text selection broken; rebuild stale image first
- [ ] **Counter-Strike:** MAX_MODELS limit exceeded crash killed the host game server; WebRTC bridge times out
- [ ] **wolf3d** (confirmed on Wolf3D + Spear): A/D bound to turn AND strafe; menu unusable (no mouse cursor); rebuild stale images
- [ ] **dosbox mouse:** SimCity 2000 + NFS cursor renders offset from pointer
- [ ] **Prey:** New Game from main menu freezes (loading slowly vs stuck)

## P1 — feature requests

- [ ] Rebuild stale images: goldsource, wolf3d, spear, cod2, source/HL2, openrct2
- [ ] **build-wasm:** add Modernized profile (widescreen, OpenGL, full mouse look) for Blood + Duke3D
- [ ] **OpenRCT2:** add RCT2 entry (verify RCT2 data in combined library or add shortcut)
- [ ] **RTCW SP:** hide the "Multiplayer" main-menu button on the SP entry
- [ ] **Doom 3 MP:** connect to a managed dedicated deathmatch server with bots (like WolfET) instead of the server browser

## P2 — verify after fixes

- [ ] Retest rebuilt images: wolf3d, spear, cod2, HL2, openrct2, goldsource, idtech3
- [ ] Retest remaining idtech1 titles: Doom II, TNT, Plutonia, Heretic, Hexen, Chex
- [ ] Retest DOSBox input after keymap fix: Jill 1-3, Jazz, Duke 1-2, Duke 2

## Done

- [x] Test all launchable games in the lab (session complete 2026-08-29)
- [x] Finalize GAME-LAB-TEST-ISSUES.md handoff doc
- [x] Retest sound on Modernized Doom, Wolf3D, WolfET (was a local Chrome mute)
- [x] Retest GTA (still broken — real issue) and NFS (starts now; new issues found)
- [x] Test Duke 2 (same issues as Duke 1) and Spear of Destiny (same as Wolf3D)
- [x] Start Doom 3 SP/MP services; Doom 3 SP passes, MP needs managed server
