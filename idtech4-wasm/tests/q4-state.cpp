#include <emscripten.h>
#include <cstdlib>
#include <map>
#include <string>

// Surrounding session/window state only. The browser-state classifier and
// message publisher are extracted verbatim from the native engine.
struct idWinVar {
    float value = 0;
    mutable std::string text;
    const char *c_str() const { text = std::to_string(value); return text.c_str(); }
};
struct idWindow {
    std::map<std::string,idWinVar> variables;
    idWinVar *GetWinVarByName(const char *name, bool = false) {
        auto found = variables.find(name);
        return found == variables.end() ? nullptr : &found->second;
    }
};
struct idUserInterface {
    idWindow window;
    bool hasDesktop = true;
    int ingame = 1;
    idWindow *GetDesktop() { return hasDesktop ? &window : nullptr; }
    int GetStateInt(const char *, const char *) const { return ingame; }
};
struct Session {
    bool mapSpawned = false, browserLoadingContinue = false;
    int browserLoadingContinueFrames = 0;
    idUserInterface *guiActive = nullptr, *guiMainMenu = nullptr, *guiTest = nullptr;
    bool IsMapSpawned() const { return mapSpawned; }
    bool IsGUIActive() const { return guiActive || guiTest; }
    bool IsBrowserLoadingContinueActive() const { return browserLoadingContinue; }
} sessLocal;
struct Console { bool active = false; bool Active() const { return active; } } consoleFixture;
static Console *console = &consoleFixture;
#include "q4-state-production.h"

static void report(const char *label, bool force = true) {
    EM_ASM({ globalThis.q4StateCase = UTF8ToString($0); },label);
    if (force) q4wasmLastBrowserState = -1;
    Q4WASM_ReportBrowserState();
}

int main() {
    EM_ASM({ globalThis.postMessage = message => console.log(JSON.stringify({label:globalThis.q4StateCase,...message})); });
    idUserInterface menu, dialog, test;
    menu.window.variables = {{"curr",{}},{"active",{}},{"video_check",{}}};
    sessLocal.guiMainMenu = &menu;
    report("no-map-menu");
    console->active = true; report("no-map-console");
    console->active = false; sessLocal.mapSpawned = true; report("gameplay");
    console->active = true; report("gameplay-console");
    sessLocal.guiActive = &menu; report("console-over-menu");
    console->active = false; report("root-pause-menu");
    menu.window.variables["curr"].value = 2; report("load-submenu");
    menu.window.variables["curr"].value = 18; report("save-submenu");
    menu.window.variables["curr"].value = 4; report("settings-submenu");
    menu.window.variables["curr"].value = 0;
    menu.window.variables["active"].value = 1; report("menu-animation");
    menu.window.variables["active"].value = 0;
    menu.window.variables["video_check"].value = 1; report("menu-logo-video");
    menu.window.variables.erase("video_check"); report("unknown-menu-schema");
    menu.window.variables["video_check"].value = 0;
    menu.ingame = 0; report("menu-no-ingame-flag"); menu.ingame = 1;
    menu.hasDesktop = false; report("missing-desktop"); menu.hasDesktop = true;
    sessLocal.guiActive = &dialog; report("message-box");
    sessLocal.guiActive = &menu; sessLocal.guiTest = &test; report("test-gui");
    sessLocal.guiTest = nullptr; sessLocal.guiActive = nullptr;
    sessLocal.browserLoadingContinue = true; report("continue-stale-input-guard");
    sessLocal.browserLoadingContinueFrames = 2; report("continue-ready",false);
    console->active = true; report("continue-before-console");
    sessLocal.mapSpawned = false; report("continue-without-map");
    sessLocal.mapSpawned = true; console->active = false;
    sessLocal.browserLoadingContinue = false; report("return-gameplay");
    report("unchanged-gameplay",false);
    sessLocal.guiActive = &menu; report("cache-root-ready");
    menu.window.variables["active"].value = 1; report("cache-root-animation",false);
    report("unchanged-animation",false);
    menu.window.variables["active"].value = 0; report("cache-root-ready-again",false);
}
