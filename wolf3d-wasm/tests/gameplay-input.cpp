#include <atomic>
#include <cstdio>
#include <cstring>
#include <deque>
#include <stdexcept>
using boolean = bool;
using ScanCode = int;
using SDLMod = int;
#ifdef WOLF_SDK_KEYCODES
#include "wolf-sdk-keycodes.h"
#endif
enum { SDL_ACTIVEEVENT=1, SDL_KEYDOWN=2, SDL_KEYUP=3, SDL_MOUSEMOTION=4,
    SDL_MOUSEBUTTONDOWN=5, SDL_MOUSEBUTTONUP=6, SDL_QUIT=12 };
#ifndef WOLF_SDK_KEYCODES
enum { SDLK_RETURN=13, SDLK_PAUSE=19, SDLK_DOWN=274, SDLK_UP=273,
    SDLK_LEFT=276, SDLK_RIGHT=275, SDLK_KP_ENTER=271, SDLK_KP2=258,
    SDLK_KP4=260, SDLK_KP6=262, SDLK_KP8=264, SDLK_F4=285,
    SDLK_F12=293, SDLK_SCROLLOCK=302, SDLK_LSHIFT=304, SDLK_RSHIFT=303,
    SDLK_LCTRL=306, SDLK_RCTRL=305, SDLK_LALT=308, SDLK_RALT=307, SDLK_LAST=323 };
enum { KMOD_NUM=0x1000, KMOD_SHIFT=3, KMOD_CAPS=0x2000 };
#endif
enum { SDL_APPINPUTFOCUS=2, SDL_APPACTIVE=4, SDL_GRAB_ON=1, SDL_GRAB_OFF=0 };
enum { SDL_BUTTON_LEFT=1, SDL_BUTTON_MIDDLE=2, SDL_BUTTON_RIGHT=3 };
#define SDL_BUTTON(button) (1 << ((button)-1))
#define lengthof(array) (sizeof(array)/sizeof((array)[0]))
#define EMSCRIPTEN_KEEPALIVE
enum { sc_None=0, key_None=0, sc_Alt=SDLK_LALT, sc_Escape=27,
    sc_W='w', sc_A='a', sc_S='s', sc_D='d' };
enum { di_north, di_east, di_south, di_west };
enum { bt_attack, bt_strafe, bt_use, bt_run, bt_strafeleft, bt_straferight, NUMBUTTONS, bt_nobutton };
enum { BASEMOVE=35, RUNMOVE=70 };
struct SDL_Event {
    int type=0;
    struct { struct { int sym=0; } keysym; } key;
    struct { int gain=0, state=0; } active;
    struct { int button=0; } button;
    struct { int xrel=0, yrel=0; } motion;
};
std::deque<SDL_Event> events;
volatile boolean Keyboard[SDLK_LAST];
ScanCode LastScan;
char LastASCII;
bool Paused, NeedRestore, fullscreen, mouseenabled=true;
int WolfWasmRuntimeState=2, modState=0, mouseState=0;
int WebMouseDeltaX=0, WebMouseDeltaY=0, WebControllerButtons=0;
std::atomic<bool> GrabInput(true);
unsigned char ASCIINames[128]={}, ShiftNames[128]={};
int dirscan[4]={SDLK_UP,SDLK_RIGHT,SDLK_DOWN,SDLK_LEFT};
int buttonscan[NUMBUTTONS]={SDLK_LCTRL,SDLK_LALT,32,SDLK_LSHIFT,0,0};
int buttonmouse[4]={bt_attack,bt_strafe,bt_use,bt_nobutton};
bool buttonstate[NUMBUTTONS];
int controlx,controly,tics=1;
SDLMod SDL_GetModState() { return modState; }
int SDL_GetMouseState(void*,void*) { return mouseState; }
void SDL_WM_GrabInput(int) {}
void FreeLatchMem() {}
void LoadLatchMem() {}
void Quit(const char*) { throw std::runtime_error("unexpected Quit"); }
void IN_ClearKeysDown();
int SDL_PollEvent(SDL_Event *out) {
    if(events.empty())return 0;
    *out=events.front();events.pop_front();
    // Emscripten SDL.handleEvent updates buttonState as queued events are
    // translated by pollEvent, before the native processEvent consumes them.
    if(out->button.button>=1 && out->button.button<=3) {
        if(out->type==SDL_MOUSEBUTTONDOWN)mouseState |= SDL_BUTTON(out->button.button);
        if(out->type==SDL_MOUSEBUTTONUP)mouseState &= ~SDL_BUTTON(out->button.button);
    }
    return 1;
}
#include "gameplay-input-production.h"
int IN_MouseButtons() { return INL_GetMouseButtons(); }
#include "gameplay-controls-production.h"
void key(int type,int code) { SDL_Event e;e.type=type;e.key.keysym.sym=code;events.push_back(e); }
void mouse(int type,int button) { SDL_Event e;e.type=type;e.button.button=button;events.push_back(e); }
void reset() {
    IN_ClearKeysDown();events.clear();mouseState=0;modState=0;GrabInput=true;
    WebControllerButtons=0;WolfWasmRuntimeState=2;
    std::memset(buttonstate,0,sizeof(buttonstate));controlx=controly=0;tics=1;
}
int main() {
    int cases=0,failed=0;
    auto check=[&](const char* label,bool pass) { ++cases;if(!pass)++failed;
        std::printf("{\"label\":\"%s\",\"passed\":%s}\n",label,pass?"true":"false"); };
#ifdef WOLF4SDL_WEB
    const bool edges=true;
#else
    const bool edges=false;
#endif
    for(int code : std::initializer_list<int>{sc_W,sc_S,sc_A,sc_D,SDLK_UP,SDLK_DOWN,SDLK_LEFT,SDLK_RIGHT,SDLK_LCTRL,SDLK_LSHIFT}) {
        reset();key(SDL_KEYDOWN,code);key(SDL_KEYUP,code);IN_ProcessEvents();
        check("quick-key-held-state-released",!Keyboard[code] && events.empty());
        check("quick-key-gameplay-sample",bool(IN_GameplayKeyDown(code))==edges);
        IN_FinishGameplayInput();check("quick-key-consumed-once",!IN_GameplayKeyDown(code));
        key(SDL_KEYDOWN,code);IN_ProcessEvents();IN_FinishGameplayInput();
        check("held-key-survives-frame",IN_GameplayKeyDown(code));
        key(SDL_KEYUP,code);IN_ProcessEvents();check("held-key-release",!IN_GameplayKeyDown(code));
    }
    reset();key(SDL_KEYDOWN,SDLK_RCTRL);key(SDL_KEYUP,SDLK_RCTRL);IN_ProcessEvents();
    check("normalized-right-control-edge",bool(IN_GameplayKeyDown(SDLK_LCTRL))==edges);
    check("normalized-right-control-held-release",!Keyboard[SDLK_LCTRL]);
    for(int button : {1,2,3}) {
        const int mask=button==1?1:button==2?4:2;
        reset();mouse(SDL_MOUSEBUTTONDOWN,button);mouse(SDL_MOUSEBUTTONUP,button);IN_ProcessEvents();
        check("quick-mouse-held-state-released",mouseState==0 && events.empty());
        check("quick-mouse-remapped-sample",IN_MouseButtons()==(edges?mask:0));
        PollMouseButtons();check("quick-mouse-game-action",buttonstate[buttonmouse[button==1?0:button==2?2:1]]==edges);
        IN_FinishGameplayInput();check("quick-mouse-consumed-once",IN_MouseButtons()==0);
        mouse(SDL_MOUSEBUTTONDOWN,button);IN_ProcessEvents();IN_FinishGameplayInput();
        check("held-mouse-survives-frame",IN_MouseButtons()==mask);
        mouse(SDL_MOUSEBUTTONUP,button);IN_ProcessEvents();check("held-mouse-release",IN_MouseButtons()==0);
    }
    reset();key(SDL_KEYDOWN,SDLK_UP);key(SDL_KEYDOWN,SDLK_LSHIFT);
    key(SDL_KEYUP,SDLK_UP);key(SDL_KEYUP,SDLK_LSHIFT);IN_ProcessEvents();
    PollKeyboardButtons();PollKeyboardMove();
    check("quick-run-forward-chord",controly==(edges?-70:0));
    IN_FinishGameplayInput();controlx=controly=0;std::memset(buttonstate,0,sizeof(buttonstate));
    PollKeyboardButtons();PollKeyboardMove();check("no-next-frame-ghost-movement",controly==0 && !buttonstate[bt_run]);
#ifdef WOLF4SDL_WEB
    reset();key(SDL_KEYDOWN,sc_W);key(SDL_KEYDOWN,sc_A);key(SDL_KEYUP,sc_W);key(SDL_KEYUP,sc_A);IN_ProcessEvents();
    PollKeyboardMove();check("quick-W-A-strafe-chord",controly==-35 && controlx==0 && buttonstate[bt_strafeleft]);
    reset();mouse(SDL_MOUSEBUTTONDOWN,1);mouse(SDL_MOUSEBUTTONDOWN,3);
    mouse(SDL_MOUSEBUTTONUP,1);mouse(SDL_MOUSEBUTTONUP,3);IN_ProcessEvents();check("quick-two-button-chord",IN_MouseButtons()==3);
    reset();key(SDL_KEYDOWN,sc_W);key(SDL_KEYUP,sc_W);mouse(SDL_MOUSEBUTTONDOWN,1);mouse(SDL_MOUSEBUTTONUP,1);
    IN_ProcessEvents();IN_ClearKeysDown();check("menu-transition-discards-edges",!IN_GameplayKeyDown(sc_W) && IN_MouseButtons()==0);
    reset();key(SDL_KEYDOWN,sc_W);mouse(SDL_MOUSEBUTTONDOWN,1);mouse(SDL_MOUSEBUTTONUP,1);IN_ProcessEvents();
    SDL_Event focus;focus.type=SDL_ACTIVEEVENT;focus.active.state=SDL_APPINPUTFOCUS;focus.active.gain=0;
    processEvent(&focus);check("focus-loss-clears-keys-and-edges",!IN_GameplayKeyDown(sc_W) && IN_MouseButtons()==0);
    reset();mouse(SDL_MOUSEBUTTONDOWN,1);mouse(SDL_MOUSEBUTTONUP,1);IN_ProcessEvents();
    WolfWasm_BrowserSetInputCaptured(0);check("capture-loss-discards-mouse-edge",IN_MouseButtons()==0 && !GrabInput);
    for(int state : {1,4,5}) {
        reset();WolfWasmRuntimeState=state;mouse(SDL_MOUSEBUTTONDOWN,1);mouse(SDL_MOUSEBUTTONUP,1);
        key(SDL_KEYDOWN,sc_W);key(SDL_KEYUP,sc_W);while(!events.empty())IN_ProcessEvents();
        WolfWasmRuntimeState=2;check("non-game-events-do-not-leak",!IN_GameplayKeyDown(sc_W) && IN_MouseButtons()==0);
    }
#endif
    reset();key(SDL_KEYDOWN,-1);key(SDL_KEYUP,-1);key(SDL_KEYDOWN,SDLK_LAST);key(SDL_KEYUP,SDLK_LAST);IN_ProcessEvents();
    check("invalid-key-bounds",!IN_GameplayKeyDown(-1) && !IN_GameplayKeyDown(SDLK_LAST));
    std::fprintf(stderr,"%d cases, %d failures\n",cases,failed);
    return failed?1:0;
}
