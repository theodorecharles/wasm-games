#include <cstdio>
#include <cstring>
#include <initializer_list>
#include "wolf-sdk-keycodes.h"
using ScanCode=int;
using boolean=bool;
static constexpr int sc_None=0,sc_UpArrow=SDLK_UP,sc_DownArrow=SDLK_DOWN,
  sc_LeftArrow=SDLK_LEFT,sc_RightArrow=SDLK_RIGHT,sc_LShift=SDLK_LSHIFT,
  sc_Control=SDLK_LCTRL,sc_Alt=SDLK_LALT;
#define EMSCRIPTEN_KEEPALIVE
volatile bool Keyboard[SDLK_LAST];
volatile ScanCode LastScan;
#include "key-bindings-production.h"
int main() {
  int cases=0,failed=0;
  auto check=[&](const char *label,bool pass) {++cases;if(!pass)++failed;
    std::printf("{\"label\":\"%s\",\"passed\":%s}\n",label,pass?"true":"false");};
  auto name=[&](int code,const char *expected) {
    char label[32];std::snprintf(label,sizeof(label),"scan-%d",code);
    const char *actual=IN_GetScanName(code);check(label,actual&&std::strcmp(actual,expected)==0);
  };
  check("real SDK special-key ABI",SDLK_UP==1106&&SDLK_LSHIFT==1249&&SDLK_LAST==1536);
  name(SDLK_LSHIFT,"Shift");name(SDLK_LCTRL,"Ctrl");name(SDLK_LALT,"Alt");
  name(SDLK_SPACE,"Space");name(SDLK_UP,"Up");name(SDLK_DOWN,"Down");
  name(SDLK_LEFT,"Left");name(SDLK_RIGHT,"Right");
  name(SDLK_RSHIFT,"RShft");name(SDLK_RCTRL,"RCtrl");name(SDLK_RALT,"RAlt");
  name(SDLK_BACKSPACE,"BkSp");name(SDLK_ESCAPE,"Esc");name(SDLK_TAB,"Tab");
  name(SDLK_RETURN,"Return");name(SDLK_KP_ENTER,"Enter");name(SDLK_DELETE,"Del");
  name(SDLK_HOME,"Home");name(SDLK_END,"End");name(SDLK_INSERT,"Ins");
  name(SDLK_PAGEUP,"PgUp");name(SDLK_PAGEDOWN,"PgDn");name(SDLK_PAUSE,"Pause");
  name(SDLK_PRINT,"PrtSc");name(SDLK_NUMLOCK,"NumLk");name(SDLK_SCROLLOCK,"ScrlLk");
  name(SDLK_CAPSLOCK,"CapsLk");
  const int fkeys[]={SDLK_F1,SDLK_F2,SDLK_F3,SDLK_F4,SDLK_F5,SDLK_F6,
    SDLK_F7,SDLK_F8,SDLK_F9,SDLK_F10,SDLK_F11,SDLK_F12};
  for(int i=0;i<12;i++){char expected[8];std::snprintf(expected,sizeof(expected),"F%d",i+1);name(fkeys[i],expected);}
  for(int c=33;c<127;c++){char expected[]={char(c),0};name(c,expected);}
#ifndef OLD_NAMES_CONTROL
  name(-1,"?");name(SDLK_LAST,"?");name(100000,"?");
#endif
  const int legacy[]={273,274,275,276,304,306,308};
  const int native[]={SDLK_UP,SDLK_DOWN,SDLK_RIGHT,SDLK_LEFT,SDLK_LSHIFT,SDLK_LCTRL,SDLK_LALT};
  for(int i=0;i<7;i++) {
    std::memset((void*)Keyboard,0,sizeof(Keyboard));LastScan=0;
    WolfWasm_BrowserControllerKey(legacy[i],1);
    check("controller SDK key pressed",Keyboard[native[i]]&&LastScan==native[i]);
    check("controller legacy slot not pressed",!Keyboard[legacy[i]]);
    WolfWasm_BrowserControllerKey(legacy[i],0);
    check("controller SDK key released",!Keyboard[native[i]]&&LastScan==0);
  }
  WolfWasm_BrowserControllerKey('w',1);check("controller ASCII unchanged",Keyboard['w']&&LastScan=='w');
  WolfWasm_BrowserControllerKey('w',0);check("controller ASCII released",!Keyboard['w']&&LastScan==0);
  for(int invalid : std::initializer_list<int>{-1,0,SDLK_LAST,100000})WolfWasm_BrowserControllerKey(invalid,1);
  check("invalid controller key ignored",LastScan==0);
  std::fprintf(stderr,"%d cases, %d failures\n",cases,failed);return failed?1:0;
}
