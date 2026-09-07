#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <initializer_list>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif
#define CONSTEXPR constexpr
#define FORCE_INLINE inline
#define Bmemset std::memset
#define Bstrlen std::strlen
#define KEYFIFOSIZ 64
static char g_keyAsciiFIFO[KEYFIFOSIZ];
static uint8_t g_keyAsciiPos, g_keyAsciiEnd;
static int consoleScan = 41, osdCalls, osdLast;
static bool consoleConsumes;
static int OSD_OSDKey() { return consoleScan; }
static int OSD_HandleChar(int code) { ++osdCalls; osdLast = code; return !consoleConsumes; }
static char typebuf[128];
static int advanced, returned, submitted;
static bool submitTrigger, returnTrigger;
static void I_AdvanceTriggerClear() { ++advanced; }
static void I_ReturnTriggerClear() { ++returned; returnTrigger = false; }
static void I_TextSubmitClear() { ++submitted; submitTrigger = false; }
static bool I_TextSubmit() { return submitTrigger; }
static bool I_ReturnTrigger() { return returnTrigger; }
enum { asc_BackSpace = 8, asc_Enter = 13, asc_Escape = 27, INPUT_NUMERIC = 1 };
#define KB_GetCh keyGetChar
#include "native-text.inc"
static int checks;
static void check(bool okay, const char *label) {
    ++checks;
    if (!okay) { std::fprintf(stderr, "text input mismatch: %s\n", label); std::exit(1); }
}
static void inject(const char *text) {
    for (; *text; ++text) check(Build_WasmTextEvent(*text) == 1, "ASCII queue insertion");
}
static void edit(const char *expected, int result = 0, int limit = 127, int flags = 0) {
    check(I_EnterText(typebuf, limit, flags) == result, "editor result");
    check(std::strcmp(typebuf, expected) == 0, "editor content");
}
int main() {
    check(keyGetChar() == 0, "empty FIFO");
    inject("Tt zY 7!"); edit("Tt zY 7!");
    inject("\b\b42\r"); edit("Tt zY 42", 1);
    check(advanced == 1, "Enter clears advance trigger");
    inject("\x1b"); edit("Tt zY 42", -1);
    check(returned == 1, "Escape clears return trigger");
    typebuf[0] = 0;
    inject("\b\b\tABCDEF"); edit("ABC", 0, 3);
    typebuf[0] = 0;
    inject("a1b2!3 4"); edit("1234", 0, 127, INPUT_NUMERIC);
    submitTrigger = true; edit("1234", 1);
    returnTrigger = true; edit("1234", -1);
    check(submitted == 1 && returned == 2, "non-keyboard editor triggers preserved");
    keyFlushChars();
    for (int code : { -2147483647, -1, 0, 128, 255, 65535, 2147483647 })
        check(Build_WasmTextEvent(code) == 0 && keyGetChar() == 0, "invalid range rejected");
    check(Build_WasmTextEvent('`') == 0 && keyGetChar() == 0, "console toggle not inserted");
    for (int scan : { -1, 128, 255, 2147483647 }) {
        consoleScan = scan;
        check(Build_WasmTextEvent('q') == 1 && keyGetChar() == 'q', "extended console binding safe");
    }
    consoleScan = 16;
    check(Build_WasmTextEvent('q') == 0, "rebound console toggle excluded");
    consoleScan = 41;
    consoleConsumes = true;
    int callsBefore = osdCalls;
    check(Build_WasmTextEvent('x') == 2, "console owns character");
    check(osdCalls == callsBefore + 1 && osdLast == 'x' && keyGetChar() == 0, "console character not duplicated");
    consoleConsumes = false;
    // Exercise every possible head offset, full capacity, overflow, and wrap.
    for (int offset = 0; offset < KEYFIFOSIZ; ++offset) {
        keyFlushChars();
        for (int i = 0; i < offset; ++i) {
            check(Build_WasmTextEvent('a') == 1, "advance head");
            check(keyGetChar() == 'a', "advance tail");
        }
        for (int i = 0; i < KEYFIFOSIZ - 1; ++i)
            check(Build_WasmTextEvent('A' + i % 26) == 1, "fill capacity");
        callsBefore = osdCalls;
        check(Build_WasmTextEvent('!') == 0 && osdCalls == callsBefore, "overflow rejected before console");
        for (int i = 0; i < KEYFIFOSIZ - 1; ++i)
            check(keyGetChar() == 'A' + i % 26, "FIFO order across wrap");
        check(keyGetChar() == 0, "drained FIFO");
    }
    inject("discard"); keyFlushChars();
    check(keyGetChar() == 0 && g_keyAsciiPos == 0 && g_keyAsciiEnd == 0, "native flush");
    std::printf("{\"passed\":true,\"checks\":%d}\n", checks);
}
