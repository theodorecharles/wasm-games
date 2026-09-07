#include <cstdio>
#include <cstring>
#include <string>

#define EMSCRIPTEN_KEEPALIVE
enum {SE_NONE,SE_KEY,SE_MOUSE};
enum {K_ESCAPE=27,K_HOME=160,K_SHIFT=142};
struct sysEvent_t {int evType=SE_NONE,evValue=0,evValue2=0;};
enum escReply_t {ESC_IGNORE,ESC_GUI,ESC_MAIN};
struct idUserInterface {} rootGui,gameGui;
static std::string trace;
static bool shiftDown=false;
struct idKeyInput {
    static bool IsDown(int key) {return key==K_SHIFT && shiftDown;}
    static void ExecKeyBinding(int) {trace+="binding;";}
};
struct TestConsole {
    bool consumes=false;
    void Close() {trace+="close;";}
    bool ProcessEvent(const sysEvent_t*,bool force) {
        trace+=force?"console-forced;":"console;";
        return consumes;
    }
} consoleObject;
static TestConsole *console=&consoleObject;
struct TestGame {
    escReply_t reply=ESC_MAIN;
    escReply_t HandleESC(idUserInterface **gui) {
        trace+="game-escape;";*gui=&gameGui;return reply;
    }
} gameObject;
static TestGame *game=&gameObject;
struct idSessionLocal {
    bool mapSpawned=true;
    idUserInterface *guiActive=nullptr;
    bool ProcessEvent(const sysEvent_t*);
    void SetGUI(idUserInterface *gui,void*) {trace+="set-gui;";guiActive=gui;}
    void StartMenu() {trace+="menu-start;";guiActive=&rootGui;}
    void MenuEvent(const sysEvent_t*) {trace+="menu-event;";}
} sessLocal;
#include "d3-session-production.h"

int main() {
    struct Case {
        const char *label;int type,key,down;bool gui,shift,consumes,map,hasGame;
        escReply_t reply;bool bridge,handled;const char *expected;int finalGui;
    };
    const Case cases[]={
        {"gameplay-escape",SE_KEY,K_ESCAPE,1,0,0,0,1,1,ESC_MAIN,0,1,"close;game-escape;menu-start;",1},
        {"escape-keyup",SE_KEY,K_ESCAPE,0,0,0,0,1,1,ESC_MAIN,0,0,"console;",0},
        {"shift-escape-console",SE_KEY,K_ESCAPE,1,0,1,1,1,1,ESC_MAIN,0,1,"console;",0},
        {"shift-escape-unconsumed",SE_KEY,K_ESCAPE,1,0,1,0,1,1,ESC_MAIN,0,1,"console;binding;",0},
        {"home-is-binding",SE_KEY,K_HOME,1,0,0,0,1,1,ESC_MAIN,0,1,"console;binding;",0},
        {"shift-home-is-binding",SE_KEY,K_HOME,1,0,1,0,1,1,ESC_MAIN,0,1,"console;binding;",0},
        {"game-ignores-escape",SE_KEY,K_ESCAPE,1,0,0,0,1,1,ESC_IGNORE,0,1,"close;game-escape;",0},
        {"game-returns-gui",SE_KEY,K_ESCAPE,1,0,0,0,1,1,ESC_GUI,0,1,"close;game-escape;set-gui;",2},
        {"escape-without-game",SE_KEY,K_ESCAPE,1,0,0,0,1,0,ESC_MAIN,0,1,"close;menu-start;",1},
        {"existing-menu-escape",SE_KEY,K_ESCAPE,1,1,0,0,1,1,ESC_MAIN,0,1,"console;menu-event;",1},
        {"existing-menu-console-first",SE_KEY,K_ESCAPE,1,1,1,1,1,1,ESC_MAIN,0,1,"console;",1},
        {"ordinary-key-console-first",SE_KEY,'w',1,0,0,1,1,1,ESC_MAIN,0,1,"console;",0},
        {"ordinary-key-binding",SE_KEY,'w',1,0,0,0,1,1,ESC_MAIN,0,1,"console;binding;",0},
        {"no-map-forced-console",SE_KEY,'w',1,0,0,0,0,0,ESC_MAIN,0,1,"console;console-forced;",0},
        {"mouse-is-not-escape",SE_MOUSE,K_ESCAPE,1,0,0,0,1,1,ESC_MAIN,0,0,"console;",0},
        {"capture-loss-gameplay",SE_NONE,0,0,0,0,0,1,1,ESC_MAIN,1,1,"close;game-escape;menu-start;",1},
        {"capture-loss-game-ignore",SE_NONE,0,0,0,0,0,1,1,ESC_IGNORE,1,1,"close;game-escape;",0},
        {"capture-loss-game-gui",SE_NONE,0,0,0,0,0,1,1,ESC_GUI,1,1,"close;game-escape;set-gui;",2},
        {"capture-loss-shift-console",SE_NONE,0,0,0,1,1,1,1,ESC_MAIN,1,1,"console;",0},
        {"capture-loss-existing-menu",SE_NONE,0,0,1,0,0,1,1,ESC_MAIN,1,1,"console;menu-event;",1}
    };
    for(const auto &test:cases) {
#ifndef __EMSCRIPTEN__
        if(test.bridge)continue; // The capture-loss export is browser-only.
#endif
        trace.clear();shiftDown=test.shift;consoleObject.consumes=test.consumes;
        sessLocal.guiActive=test.gui?&rootGui:nullptr;sessLocal.mapSpawned=test.map;
        game=test.hasGame?&gameObject:nullptr;gameObject.reply=test.reply;
        const sysEvent_t event={test.type,test.key,test.down};
        bool handled=true;
        if(test.bridge)D3WASM_BrowserOpenMenu();else handled=sessLocal.ProcessEvent(&event);
        const int finalGui=sessLocal.guiActive==&rootGui?1:(sessLocal.guiActive==&gameGui?2:0);
        const bool passed=handled==test.handled && trace==test.expected && finalGui==test.finalGui;
        std::printf("{\"label\":\"%s\",\"trace\":\"%s\",\"expected\":\"%s\",\"handled\":%s,\"finalGui\":%d,\"passed\":%s}\n",
            test.label,trace.c_str(),test.expected,handled?"true":"false",finalGui,passed?"true":"false");
    }
}
