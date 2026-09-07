#include <cstdio>
#include <deque>
enum {SDL_KEYDOWN=2,SDL_KEYUP=3,SDL_MOUSEMOTION=4};
struct SDL_Event {int type,key;};
std::deque<SDL_Event> events;
bool Keyboard[512];int LastScan,processed,WolfWasmRuntimeState;
int SDL_PollEvent(SDL_Event *event) {if(events.empty())return 0;*event=events.front();events.pop_front();return 1;}
void processEvent(SDL_Event *event) {++processed;if(event->type==SDL_KEYDOWN){Keyboard[event->key]=true;LastScan=event->key;}else if(event->type==SDL_KEYUP)Keyboard[event->key]=false;}
#include "wolf-key-pump-production.h"
int main() {
    int failures=0;
    auto check=[&](const char *label,bool passed){if(!passed)++failures;std::printf("{\"label\":\"%s\",\"passed\":%s}\n",label,passed?"true":"false");};
    for(int state:{1,4}) {
        for(bool &key:Keyboard)key=false;events={{SDL_KEYDOWN,27},{SDL_KEYUP,27}};WolfWasmRuntimeState=state;
        IN_ProcessEvents();check(state==1?"main-menu-short-escape-down":"paused-short-escape-down",Keyboard[27] && events.size()==1);
        IN_ProcessEvents();check(state==1?"main-menu-short-escape-release":"paused-short-escape-release",!Keyboard[27] && events.empty());
    }
    WolfWasmRuntimeState=1;events={{SDL_MOUSEMOTION,0},{SDL_KEYDOWN,304},{SDL_KEYDOWN,13},{SDL_KEYUP,13},{SDL_KEYUP,304}};
    IN_ProcessEvents();check("modifier-before-enter",Keyboard[304] && !Keyboard[13] && events.size()==3);
    IN_ProcessEvents();check("short-enter-observable",Keyboard[304] && Keyboard[13] && events.size()==2);
    IN_ProcessEvents();check("chord-released",!Keyboard[304] && !Keyboard[13] && events.empty());
    events={{SDL_KEYDOWN,273},{SDL_KEYUP,273},{SDL_KEYDOWN,274},{SDL_KEYUP,274}};
    IN_ProcessEvents();check("first-direction-observable",Keyboard[273] && !Keyboard[274]);
    IN_ProcessEvents();check("next-direction-observable",!Keyboard[273] && Keyboard[274]);
    IN_ProcessEvents();check("all-directions-released",!Keyboard[273] && !Keyboard[274]);
    WolfWasmRuntimeState=2;events={{SDL_KEYDOWN,27},{SDL_KEYUP,27}};IN_ProcessEvents();
    check("gameplay-pump-unchanged",events.empty() && !Keyboard[27]);
    WolfWasmRuntimeState=5;events={{SDL_MOUSEMOTION,0},{SDL_MOUSEMOTION,0}};processed=0;IN_ProcessEvents();
    check("non-key-events-not-throttled",processed==2 && events.empty());
    return failures?1:0;
}
