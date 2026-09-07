#include <cstdio>
#include <SDL2/SDL.h>
#include <emscripten/emscripten.h>
#include "prey-input-production.h"

int main() {
    if (SDL_Init(SDL_INIT_TIMER | SDL_INIT_EVENTS) != 0) return 1;
    struct Case { const char *name; SDL_Scancode scan; int supplied; SDL_Keycode expected; };
    const Case cases[] = {
        {"escape", SDL_SCANCODE_ESCAPE, 0, SDLK_ESCAPE},
        {"return", SDL_SCANCODE_RETURN, 0, SDLK_RETURN},
        {"tab", SDL_SCANCODE_TAB, 0, SDLK_TAB},
        {"backspace", SDL_SCANCODE_BACKSPACE, 0, SDLK_BACKSPACE},
        {"delete", SDL_SCANCODE_DELETE, 0, SDLK_DELETE},
        {"up", SDL_SCANCODE_UP, 0, SDLK_UP},
        {"down", SDL_SCANCODE_DOWN, 0, SDLK_DOWN},
        {"left", SDL_SCANCODE_LEFT, 0, SDLK_LEFT},
        {"right", SDL_SCANCODE_RIGHT, 0, SDLK_RIGHT},
        {"shift", SDL_SCANCODE_LSHIFT, 0, SDLK_LSHIFT},
        {"right-shift", SDL_SCANCODE_RSHIFT, 0, SDLK_RSHIFT},
        {"control", SDL_SCANCODE_LCTRL, 0, SDLK_LCTRL},
        {"alt", SDL_SCANCODE_LALT, 0, SDLK_LALT},
        {"f1", SDL_SCANCODE_F1, 0, SDLK_F1},
        {"f5", SDL_SCANCODE_F5, 0, SDLK_F5},
        {"f9", SDL_SCANCODE_F9, 0, SDLK_F9},
        {"f12", SDL_SCANCODE_F12, 0, SDLK_F12},
        {"insert", SDL_SCANCODE_INSERT, 0, SDLK_INSERT},
        {"home", SDL_SCANCODE_HOME, 0, SDLK_HOME},
        {"end", SDL_SCANCODE_END, 0, SDLK_END},
        {"page-up", SDL_SCANCODE_PAGEUP, 0, SDLK_PAGEUP},
        {"page-down", SDL_SCANCODE_PAGEDOWN, 0, SDLK_PAGEDOWN},
        {"keypad-enter", SDL_SCANCODE_KP_ENTER, 0, SDLK_KP_ENTER},
        {"keypad-1", SDL_SCANCODE_KP_1, 0, SDLK_KP_1},
        {"keypad-divide", SDL_SCANCODE_KP_DIVIDE, 0, SDLK_KP_DIVIDE},
        {"pause", SDL_SCANCODE_PAUSE, 0, SDLK_PAUSE},
        {"caps-lock", SDL_SCANCODE_CAPSLOCK, 0, SDLK_CAPSLOCK},
        {"space-without-text", SDL_SCANCODE_SPACE, 0, SDLK_SPACE},
        {"w-without-text", SDL_SCANCODE_W, 0, SDLK_w},
        {"a-without-text", SDL_SCANCODE_A, 0, SDLK_a},
        {"zero-without-text", SDL_SCANCODE_0, 0, SDLK_0},
        {"one-without-text", SDL_SCANCODE_1, 0, SDLK_1},
        {"grave-without-text", SDL_SCANCODE_GRAVE, 0, SDLK_BACKQUOTE},
        {"slash-without-text", SDL_SCANCODE_SLASH, 0, SDLK_SLASH},
        {"supplied-w", SDL_SCANCODE_W, 'w', SDLK_w},
        {"supplied-uppercase-w", SDL_SCANCODE_W, 'W', SDLK_w},
        {"supplied-uppercase-s", SDL_SCANCODE_S, 'S', SDLK_s},
        {"supplied-uppercase-layout", SDL_SCANCODE_A, 'Q', SDLK_q},
        {"supplied-space", SDL_SCANCODE_SPACE, ' ', SDLK_SPACE},
        {"supplied-layout", SDL_SCANCODE_A, 'q', SDLK_q}
    };
    for (const Case &test : cases) {
        SDL_FlushEvents(SDL_FIRSTEVENT, SDL_LASTEVENT);
        PREYWASM_BrowserKey(test.scan, test.supplied, 1, 1);
        PREYWASM_BrowserKey(test.scan, test.supplied, 0, 0);
        SDL_Event events[3] = {};
        const int count=SDL_PeepEvents(events,3,SDL_GETEVENT,SDL_KEYDOWN,SDL_KEYUP);
        const bool passed=count==2 && events[0].type==SDL_KEYDOWN && events[1].type==SDL_KEYUP
            && events[0].key.keysym.sym==test.expected && events[1].key.keysym.sym==test.expected
            && events[0].key.keysym.scancode==test.scan && events[1].key.keysym.scancode==test.scan
            && events[0].key.state==SDL_PRESSED && events[1].key.state==SDL_RELEASED
            && events[0].key.repeat==1 && events[1].key.repeat==0;
        std::printf("{\"label\":\"%s\",\"scan\":%d,\"expected\":%d,\"actual\":%d,\"events\":%d,\"passed\":%s}\n",
            test.name,test.scan,test.expected,events[0].key.keysym.sym,count,passed ? "true" : "false");
    }
    const int textCases[] = {'a', 'A', '_'};
    for (int character : textCases) {
        SDL_FlushEvents(SDL_FIRSTEVENT, SDL_LASTEVENT);
        PREYWASM_BrowserText(character);
        SDL_Event event = {};
        const int count=SDL_PeepEvents(&event,1,SDL_GETEVENT,SDL_TEXTINPUT,SDL_TEXTINPUT);
        const bool passed=count==1 && event.text.text[0]==character && event.text.text[1]=='\0';
        std::printf("{\"label\":\"text-%d\",\"expected\":%d,\"actual\":%d,\"events\":%d,\"passed\":%s}\n",
            character,character,static_cast<unsigned char>(event.text.text[0]),count,passed ? "true" : "false");
    }
    SDL_Quit();
    return 0;
}
