#include <cstdio>
#include <cstring>
#include <SDL2/SDL.h>
#include <emscripten/emscripten.h>

// SDL_VideoInit calls this exact SDK function before selecting a video driver.
// Doom 3 initializes video; Prey's direct-worker path does not. Exercise the
// real keymap setup without pretending to create a browser window in Node.
extern "C" int SDL_KeyboardInit(void);
static int InitD3TestKeyboard(Uint32 flags) {
    const int result=SDL_Init(flags);
    return result ? result : SDL_KeyboardInit();
}
struct TestConsole { bool active=false; bool Active() const {return active;} } consoleObject;
TestConsole *console=&consoleObject;
int rootMenu,subMenu,reports=0;
struct TestSession {
    bool mapSpawned=false;
    void *guiActive=nullptr,*guiMainMenu=&rootMenu;
    int exits=0;
    void ExitMenu() {++exits;guiActive=nullptr;}
} sessLocal;
void D3WASM_ReportBrowserState(){++reports;}

// Reuse the common input/text vectors against the exact Doom 3 exports.
#define SDL_Init InitD3TestKeyboard
#define PREYWASM_BrowserKey D3WASM_BrowserKey
#define PREYWASM_BrowserText D3WASM_BrowserText
#define main SharedInputCases
#include "prey-input.cpp"
#undef main
#undef SDL_Init
#undef PREYWASM_BrowserKey
#undef PREYWASM_BrowserText

int main() {
    const int result=SharedInputCases();
    if(result)return result;
    if(InitD3TestKeyboard(SDL_INIT_TIMER|SDL_INIT_EVENTS)!=0)return 1;
    struct EscapeCase {const char *label;bool map;void *gui;bool console;bool down;bool exits;};
    const EscapeCase escapes[]={
        {"initial-menu-escape",false,&rootMenu,false,true,false},
        {"gameplay-escape",true,nullptr,false,true,false},
        {"paused-root-escape",true,&rootMenu,false,true,true},
        {"paused-root-keyup",true,&rootMenu,false,false,false},
        {"submenu-escape",true,&subMenu,false,true,false},
        {"console-escape",true,&rootMenu,true,true,false},
        {"console-only-escape",true,nullptr,true,true,false}
    };
    for(const auto &test:escapes) {
        SDL_FlushEvents(SDL_FIRSTEVENT,SDL_LASTEVENT);
        sessLocal.mapSpawned=test.map;sessLocal.guiActive=test.gui;
        sessLocal.exits=0;reports=0;consoleObject.active=test.console;
        D3WASM_BrowserKey(SDL_SCANCODE_ESCAPE,0,test.down,0);
        SDL_Event event={};
        const int count=SDL_PeepEvents(&event,1,SDL_GETEVENT,SDL_KEYDOWN,SDL_KEYUP);
        const bool passed=test.exits ? (count==0 && sessLocal.exits==1 && reports==1 && !sessLocal.guiActive) :
            (count==1 && event.type==(test.down?SDL_KEYDOWN:SDL_KEYUP) && event.key.keysym.sym==SDLK_ESCAPE && !sessLocal.exits && !reports);
        std::printf("{\"label\":\"%s\",\"passed\":%s}\n",test.label,passed?"true":"false");
    }
    const char pairs[][2]={{'W','w'},{'w','W'}};
    for(int i=0;i<2;i++) {
        SDL_FlushEvents(SDL_FIRSTEVENT,SDL_LASTEVENT);
        D3WASM_BrowserKey(SDL_SCANCODE_W,pairs[i][0],1,0);
        D3WASM_BrowserKey(SDL_SCANCODE_W,pairs[i][1],0,0);
        SDL_Event events[2]={};
        const int count=SDL_PeepEvents(events,2,SDL_GETEVENT,SDL_KEYDOWN,SDL_KEYUP);
        const bool passed=count==2 && events[0].key.keysym.sym==SDLK_w && events[1].key.keysym.sym==SDLK_w;
        std::printf("{\"label\":\"case-change-before-keyup-%d\",\"passed\":%s}\n",i,passed?"true":"false");
    }
    SDL_Quit();
}
