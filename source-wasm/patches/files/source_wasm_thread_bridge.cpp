// Authored integration for the pinned Source pthread side-module runtime.
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <pthread.h>
#include <stdint.h>
#include <string.h>
#include "source_wasm_thread_bridge.h"
#include "cdll_int.h"
#include "host.h"
#include "sys_dll.h"
#include "vgui_baseui_interface.h"
#include "tier1/convar.h"
#include "icvar.h"
#include "cmd.h"
#include "inputsystem/iinputsystem.h"

extern bool scr_drawloading;
extern IVEngineClient *engineClient;
extern IInputSystem *g_pInputSystem;

namespace {
const uint32_t kMagic = 0x53574231;
const uint32_t kCapacity = 16;
const uint32_t kPayloadBytes = 504;
struct Command { uint32_t type, length; char payload[kPayloadBytes]; };
struct Mailbox {
    uint32_t magic, version, capacity, slotBytes;
    uint32_t writeSequence, readSequence, pauseRequested, reserved;
    Command commands[kCapacity];
};
static_assert(sizeof(Command) == 512, "Browser command ABI changed");
static_assert(sizeof(Mailbox) == 32 + 16 * 512, "Browser mailbox ABI changed");
Mailbox mailbox = { kMagic, 1, kCapacity, sizeof(Command), 0, 0, 0, 0, {} };
pthread_t owner;
bool initialized = false;
uint32_t sequence = 0;
int lastState = -1;
uint32_t saveSequence = 0;
uint32_t activeSaveSequence = 0;
uint32_t screenshotSequence = 0;

bool IsOwner() { return initialized && pthread_equal(owner, pthread_self()); }

int ReadState() {
    if (IsInErrorExit()) return 6;
    if (!host_initialized || scr_drawloading) return 1;
    IEngineVGuiInternal *ui = EngineVGui();
    if (!ui || !ui->IsInitialized()) return 1;
    if (ui->IsGameUIVisible()) return 2;
    if (!engineClient || !engineClient->IsInGame() || engineClient->IsLevelMainMenuBackground()) return 1;
    const int player = engineClient->GetLocalPlayer();
    player_info_t info = {};
    if (player <= 0 || !engineClient->GetPlayerInfo(player, &info)) return 1;
    return engineClient->IsPaused() ? 4 : 3;
}

bool ApplyPreferences(char *payload) {
    char *profile = strchr(payload, '\n');
    if (!profile || !g_pCVar) return false;
    *profile++ = '\0';
    const size_t length = strlen(payload);
    if (!length || length > 32) return false;
    for (size_t i = 0; i < length; ++i) {
        const unsigned char c = payload[i];
        if (c < 32 || c > 126 || c == '<' || c == '>' || c == '"' || c == '`') return false;
    }
    int selected;
    if (!strcmp(profile, "default")) selected = 0;
    else if (!strcmp(profile, "quality")) selected = 1;
    else if (!strcmp(profile, "performance")) selected = 2;
    else return false;
    const char *names[] = { "name", "mat_picmip", "r_rootlod", "mat_reducefillrate" };
    const char *values[][3] = { { "0", "0", "0" }, { "-1", "0", "0" }, { "2", "2", "1" } };
    ConVar *variables[4];
    for (int i = 0; i < 4; ++i) {
        variables[i] = g_pCVar->FindVar(names[i]);
        if (!variables[i]) return false;
    }
    variables[0]->SetValue(payload);
    for (int i = 1; i < 4; ++i) variables[i]->SetValue(values[selected][i - 1]);
    return true;
}
}

void SourceWasmBridge_Init() {
    if (initialized) return;
    owner = pthread_self();
    initialized = true;
    EM_ASM({
        postMessage({cmd: 'callHandler', handler: 'sourceWasmBridgeReady', args: [$0, $1, 1]});
    }, &mailbox, sizeof(mailbox));
    SourceWasmBridge_PublishState();
}

void SourceWasmBridge_BeforeFrame() {
    if (!IsOwner() || !host_initialized) return;
    IEngineVGuiInternal *ui = EngineVGui();
    if (!ui || !ui->IsInitialized()) return;
    for (uint32_t count = 0; count < kCapacity; ++count) {
        const uint32_t read = __atomic_load_n(&mailbox.readSequence, __ATOMIC_RELAXED);
        const uint32_t write = __atomic_load_n(&mailbox.writeSequence, __ATOMIC_ACQUIRE);
        if (read == write || uint32_t(write - read) > kCapacity) break;
        const Command &slot = mailbox.commands[read % kCapacity];
        const uint32_t type = slot.type, length = slot.length;
        char payload[kPayloadBytes];
        const bool valid = length > 0 && length < kPayloadBytes;
        if (valid) { memcpy(payload, slot.payload, length); payload[length] = '\0'; }
        // Release only after copying; the producer may now reuse this slot.
        __atomic_store_n(&mailbox.readSequence, read + 1, __ATOMIC_RELEASE);
        bool accepted = false;
        if (valid && !memchr(payload, '\0', length)) {
            if (type == 1) { Cbuf_AddText(payload); Cbuf_AddText("\n"); accepted = true; }
            else if (type == 2) accepted = ApplyPreferences(payload);
        }
        EM_ASM({
            postMessage({cmd: 'callHandler', handler: 'sourceWasmCommandResult', args: [$0 >>> 0, $1]});
        }, read + 1, accepted ? 1 : 0);
    }
}

void SourceWasmBridge_AfterFrame() {
    if (!IsOwner()) return;
    // Apply capture loss after this frame's native Escape/input commands, so
    // it opens the menu rather than toggling a menu that Escape already opened.
    IEngineVGuiInternal *ui = EngineVGui();
    if (host_initialized && ui && ui->IsInitialized() &&
        __atomic_exchange_n(&mailbox.pauseRequested, 0, __ATOMIC_ACQ_REL)) {
        if (g_pInputSystem) g_pInputSystem->ResetInputState();
        ui->SetNotAllowedToShowGameUI(false);
        ui->ActivateGameUI();
    }
    SourceWasmBridge_PublishState();
}

void SourceWasmBridge_PublishState() {
    if (!IsOwner()) return;
    const int state = ReadState();
    if (state == lastState) return;
    lastState = state;
    // Loading does not imply capture intent. A real gameplay report allows
    // the framework to capture on the user's next trusted canvas interaction.
    EM_ASM({
        postMessage({cmd: 'callHandler', handler: 'sourceWasmState', args: [$0 >>> 0, $1, $2]});
    }, ++sequence, state, state == 3 ? 1 : 0);
}

void SourceWasmBridge_SaveBegin(const char *filename, bool screenshot) {
    if (!IsOwner()) return;
    if (++saveSequence == 0) ++saveSequence;
    __atomic_store_n(&activeSaveSequence, saveSequence, __ATOMIC_RELEASE);
    if (screenshot) __atomic_store_n(&screenshotSequence, saveSequence, __ATOMIC_RELEASE);
    EM_ASM({
        postMessage({cmd: 'callHandler', handler: 'sourceWasmSaveEvent',
            args: [$0 >>> 0, 0, $1, UTF8ToString($2)]});
    }, saveSequence, screenshot ? 1 : 0, filename);
}

void SourceWasmBridge_SaveCoreComplete() {
    const uint32_t completed = __atomic_exchange_n(&activeSaveSequence, 0, __ATOMIC_ACQ_REL);
    if (!completed) return;
    EM_ASM({
        postMessage({cmd: 'callHandler', handler: 'sourceWasmSaveEvent', args: [$0 >>> 0, 1]});
    }, completed);
}

uint32_t SourceWasmBridge_TakeScreenshotSequence() {
    return __atomic_exchange_n(&screenshotSequence, 0, __ATOMIC_ACQ_REL);
}

void SourceWasmBridge_SaveScreenshotComplete(uint32_t completed) {
    if (!completed) return;
    EM_ASM({
        postMessage({cmd: 'callHandler', handler: 'sourceWasmSaveEvent', args: [$0 >>> 0, 2]});
    }, completed);
}
#endif
