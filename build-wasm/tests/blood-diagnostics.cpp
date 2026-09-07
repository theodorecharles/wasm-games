// Test-only observer, included by a disposable diagnostic build, never the
// production build. Commands use the game's existing single-player console.
#ifdef __EMSCRIPTEN__
static unsigned int testWeaponCallbacks;
extern "C" void NBlood_WasmTestCallback(void *player)
{
    if (player == gMe) ++testWeaponCallbacks;
}

extern "C" EMSCRIPTEN_KEEPALIVE void NBlood_WasmTestCommand(int command)
{
    if (command == 0) OSD_Dispatch("god");
    if (command == 1) OSD_Dispatch("give all");
    if (command == 2) OSD_Dispatch("give ammo");
}

extern "C" EMSCRIPTEN_KEEPALIVE int NBlood_WasmTestState(int field)
{
    if (!gGameStarted || !gMe || !gMe->pXSprite) return -1;
    switch (field)
    {
        case 0: return gMe->curWeapon;
        case 1: return gMe->weaponQav;
        case 2: return gMe->weaponState;
        case 3: return gMe->input.buttonFlags.byte;
        case 4: return gMe->weaponTimer;
        case 5: return gMe->pXSprite->health;
        case 6: return gMe->godMode;
        case 7: return gMe->weaponAmmo;
        case 8: return testWeaponCallbacks;
    }
    if (field >= 16 && field < 28) return gMe->ammoCount[field - 16];
    return -1;
}
#endif
