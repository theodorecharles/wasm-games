#include "idlib/precompiled.h"
#include "sound/snd_local.h"
#include "sys/posix/posix_public.h"
#include <emscripten.h>

// Linked as a test-only side module against the actual engine. No renderer,
// game assets or main loop are started. Device enumeration, choice generation
// and tokenization below are the engine's compiled production implementations.
extern "C" EMSCRIPTEN_KEEPALIVE int Q4DeviceGuiProbe() {
    idLib::common = common;
    idLib::sys = sys;
    idLib::cvarSystem = cvarSystem;
    idLib::fileSystem = fileSystem;
    idStr::InitMemory();
    idStr names, values;
    idSoundHardware_OpenAL::BuildDeviceChoiceStrings("", names, values);
    idLexer lexer(LEXFL_ALLOWPATHNAMES | LEXFL_ALLOWMULTICHARLITERALS |
        LEXFL_ALLOWBACKSLASHSTRINGCONCAT | LEXFL_NOERRORS);
    // NOERRORS only records errors without invoking the uninitialized UI or
    // aborting the test process. The production ChoiceWindow flags are unchanged.
    lexer.LoadMemory(values.c_str(), values.Length(), "<ChoiceVals>");
    idToken token;
    int strings = 0;
    while (lexer.ReadToken(&token)) {
        if (token.type == TT_STRING) ++strings;
    }
    return lexer.HadError() ? -1 : strings;
}

// Exercise idException and stack cleanup across a real MAIN_MODULE/SIDE_MODULE
// runtime. This does not simulate an in-game error or prove GUI recovery.
extern "C" EMSCRIPTEN_KEEPALIVE int Q4ExceptionProbe() {
    int destroyed = 0;
    struct Guard {
        int &count;
        ~Guard() { ++count; }
    };
    try {
        Guard guard{destroyed};
        throw idException("q4-recoverable-probe");
    } catch (const idException &error) {
        return destroyed == 1 && idStr::Cmp(error.error, "q4-recoverable-probe") == 0;
    }
    return 0;
}

extern "C" void Q4WASM_BrowserKey(int, int, int, int);
extern "C" EMSCRIPTEN_KEEPALIVE int Q4BrowserKeyboardProbe() {
    Posix_InitPThreads();
    Sys_ClearEvents();
    Q4WASM_BrowserKey(40, 0, 1, 0); // Enter, browser SDL scancode
    Q4WASM_BrowserKey(40, 0, 0, 0);
    const sysEvent_t down = Sys_GetEvent();
    const sysEvent_t character = Sys_GetEvent();
    const sysEvent_t up = Sys_GetEvent();
    if (down.evType != SE_KEY || down.evValue != K_ENTER || !down.evValue2) return -1;
    if (character.evType != SE_CHAR || character.evValue != '\r') return -2;
    if (up.evType != SE_KEY || up.evValue != K_ENTER || up.evValue2) return -3;
    if (Sys_GetEvent().evType != SE_NONE) return -4;
    const int count = Sys_PollKeyboardInputEvents();
    if (count != 2) return -5;
    int key = 0;
    bool pressed = false;
    Sys_ReturnKeyboardInputEvent(0, key, pressed);
    if (key != K_ENTER || !pressed) return -6;
    Sys_ReturnKeyboardInputEvent(1, key, pressed);
    if (key != K_ENTER || pressed) return -7;
    Sys_EndKeyboardInputEvents();
    return 1;
}
