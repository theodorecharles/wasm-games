#include <cassert>
#include <cstddef>

enum { SE_KEY = 1, SE_CHAR, SE_MOUSE };
struct sysEvent_t { int evType, evValue, evValue2; };
static bool Session_IsLoadingContinueKey(int key) { return key == 13; }
static bool Session_IsLoadingContinueChar(int ch) { return ch >= 32; }
static int clears = 0, queueClears = 0, userClears = 0, unmute = 0;
static bool continueInput = true, grabbed = true;
static int com_ticNumber = 120;
void openQ4_SetLoadingContinueInputActive(bool active) { continueInput = active; }
void Sys_ClearInputEvents() { ++queueClears; }
void Sys_GrabMouseCursor(bool active) { grabbed = active; }
struct idKeyInput { static void ClearStates() { ++clears; } };
struct idMath { static int ClampInt(int lo, int hi, int n) { return n < lo ? lo : n > hi ? hi : n; } };
struct Cvar { int value = 0; int GetInteger() { return value; } } com_loadingContinueAutoAdvance;
struct Common {
    int time = 1000;
    bool initialized = false;
    int asyncCalls = 0;
    bool IsInitialized() { return initialized; }
    void Async() { ++asyncCalls; }
    int GetPresentationTime() { return time; }
    void Printf(const char *) {}
} commonObject;
static Common *common = &commonObject;
struct idAsyncNetwork { static Cvar serverDedicated; };
Cvar idAsyncNetwork::serverDedicated;
static int throttles = 0, throttleResets = 0, com_frameRealTime = 0;
void Common_ResetPresentationThrottle() { ++throttleResets; }
void Common_ThrottlePresentationFrame() { ++throttles; }
int Sys_Milliseconds() { return common->time; }
struct Usercmd { void Clear() { ++userClears; } } usercmdObject;
static Usercmd *usercmdGen = &usercmdObject;
struct Sound { void SetMute(bool mute) { assert(!mute); ++unmute; } } soundObject;
static Sound *soundSystem = &soundObject;
struct Gui { int redraws = 0; void StateChanged(int) { ++redraws; } } guiObject;

// Only the surrounding engine services are substituted. The methods under
// test below are extracted verbatim from production Session.cpp.
struct idSessionLocal {
    bool browserLoadingContinue = true;
    int browserLoadingContinueFrames = 0;
    int browserLoadingContinueStartTime = 1000;
    int lastGameTic = 0, latchedTicNumber = 0, wipes = 0, soundWorldUpdates = 0;
    Gui *guiLoading = &guiObject;
    void StartWipe(const char *) { assert(browserLoadingContinue); ++wipes; }
    void SetPlayingSoundWorld() { assert(!browserLoadingContinue); ++soundWorldUpdates; }
    void FinishBrowserLoadingContinue();
    bool HandleBrowserLoadingContinueEvent(const sysEvent_t *);
    bool BrowserLoadingContinueFrame();
};
#include "q4-continue-production.h"

int main() {
    openQ4_BeginPresentationFrame();
    assert(common->asyncCalls == 0 && throttles == 1);
    common->initialized = true;
    openQ4_BeginPresentationFrame();
    assert(common->asyncCalls == 1 && com_frameRealTime == common->time);
    Session_BeginBlockingLoadPresentationFrame();
    assert(common->asyncCalls == 2);
    idAsyncNetwork::serverDedicated.value = 1;
    openQ4_BeginPresentationFrame();
    assert(common->asyncCalls == 3 && throttleResets == 1);
    idSessionLocal session;
    const sysEvent_t enter {SE_KEY, 13, 1}, release {SE_KEY, 13, 0};
    const sysEvent_t mouse {SE_MOUSE, 50, 50}, invalid {SE_KEY, -1, 1};
    assert(session.HandleBrowserLoadingContinueEvent(&enter));
    assert(session.browserLoadingContinue && session.wipes == 0);
    assert(session.BrowserLoadingContinueFrame());
    assert(session.HandleBrowserLoadingContinueEvent(&enter));
    assert(session.browserLoadingContinue);
    assert(session.BrowserLoadingContinueFrame());
    assert(session.browserLoadingContinueFrames == 2 && !grabbed);
    for (int i = 0; i < 10000; ++i) {
        ++com_ticNumber;
        assert(session.BrowserLoadingContinueFrame());
        assert(session.lastGameTic == com_ticNumber && session.latchedTicNumber == com_ticNumber);
    }
    assert(session.browserLoadingContinueFrames == 2);
    assert(session.HandleBrowserLoadingContinueEvent(&release));
    assert(session.HandleBrowserLoadingContinueEvent(&mouse));
    assert(session.HandleBrowserLoadingContinueEvent(&invalid));
    assert(session.browserLoadingContinue);
    assert(session.HandleBrowserLoadingContinueEvent(&enter));
    assert(!session.browserLoadingContinue && !continueInput);
    assert(session.wipes == 1 && session.soundWorldUpdates == 1);
    assert(clears == 1 && queueClears == 1 && userClears == 1 && unmute == 1);
    assert(!session.HandleBrowserLoadingContinueEvent(&enter));
    assert(!session.BrowserLoadingContinueFrame());
    session.FinishBrowserLoadingContinue();
    assert(session.wipes == 1);

    idSessionLocal timeout;
    com_loadingContinueAutoAdvance.value = 100;
    timeout.BrowserLoadingContinueFrame();
    common->time = 1099;
    timeout.BrowserLoadingContinueFrame();
    assert(timeout.browserLoadingContinue);
    common->time = 1100;
    timeout.BrowserLoadingContinueFrame();
    assert(!timeout.browserLoadingContinue && timeout.wipes == 1);

    idSessionLocal text;
    com_loadingContinueAutoAdvance.value = 0;
    text.BrowserLoadingContinueFrame();
    text.BrowserLoadingContinueFrame();
    const sysEvent_t character {SE_CHAR, 32, 0};
    assert(text.HandleBrowserLoadingContinueEvent(&character));
    assert(!text.browserLoadingContinue);
}
