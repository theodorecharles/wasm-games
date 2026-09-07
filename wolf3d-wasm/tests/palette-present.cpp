#include <cstdio>
#include <cstring>
#include <algorithm>
struct SDL_Color { int r, g, b; };
struct SDL_Surface { SDL_Color colors[256]{}; unsigned char pixels[10]{}; int locks=0; };
SDL_Surface front, back, *screen=&front, *curSurface=&back;
SDL_Color curpal[256], shown[6];
unsigned screenBits=8, screenWidth=3, screenHeight=2;
enum { SDL_PHYSPAL=1, SDL_LOGPAL=2 };
int locks, unlocks, blits, flips, fills, bars, paletteFlags;
bool lockFailure;
int SDL_LockSurface(SDL_Surface *s) { ++locks; if(lockFailure)return -1; ++s->locks; return 0; }
void SDL_UnlockSurface(SDL_Surface *s) {
    ++unlocks; --s->locks;
    for(int y=0;y<2;++y)for(int x=0;x<3;++x) shown[y*3+x]=s->colors[s->pixels[y*5+x]];
}
const char *SDL_GetError() { return "fixture lock failure"; }
void Quit(const char *,...) { throw 7; }
void SDL_SetPalette(SDL_Surface *s,int flags,SDL_Color *colors,int first,int count) {
    paletteFlags=flags; std::copy(colors,colors+count,s->colors+first);
}
void SDL_BlitSurface(SDL_Surface *,void *,SDL_Surface *,void *) { ++blits; }
void SDL_Flip(SDL_Surface *) { ++flips; }
void SDL_FillRect(SDL_Surface *,void *,int) { ++fills; /* SDK canvas-only write, no indexed-buffer change */ }
void VL_BarScaledCoord(int x,int y,int width,int height,int color) {
    ++bars;
    for(int row=y;row<y+height;++row)std::memset(curSurface->pixels+row*5+x,color,width);
}
#include "palette-production.h"
bool same(SDL_Color a,SDL_Color b) {return a.r==b.r && a.g==b.g && a.b==b.b;}
void reset(unsigned bits) {
    screenBits=bits; front={};back={}; locks=unlocks=blits=flips=fills=bars=paletteFlags=0;lockFailure=false;
    std::memset(curpal,0,sizeof(curpal));std::memset(shown,0,sizeof(shown));
    std::fill(front.pixels,front.pixels+10,1);std::fill(back.pixels,back.pixels+10,91);
}
int main() {
    int failures=0,cases=0;
    auto check=[&](const char *label,bool passed) {++cases;if(!passed)++failures;std::printf("{\"label\":\"%s\",\"passed\":%s}\n",label,passed?"true":"false");};
#ifdef WOLF4SDL_WEB
    const bool web=true;
#else
    const bool web=false;
#endif
    SDL_Color colors[256];for(int i=0;i<256;++i)colors[i]={i,255-i,i/2};
    for(unsigned bits:{8u,16u,32u})for(bool force:{false,true}) {
        reset(bits);VL_SetPalette(colors,force);
        check("full-native-palette-copied",std::memcmp(curpal,colors,sizeof(colors))==0);
        check("correct-physical-or-logical-palette",paletteFlags==(bits==8?SDL_PHYSPAL:SDL_LOGPAL));
        check("forced-indexed-repaint-only",locks==(web && bits==8 && force?1:0) && unlocks==locks && front.locks==0);
        check("truecolor-blit-path-preserved",blits==(bits!=8 && force?1:0) && flips==blits);
        if(web && bits==8) check("display-recolored-without-new-draw",same(shown[0],force?colors[1]:SDL_Color{0,0,0}));
    }
    for(unsigned bits:{8u,16u,32u}) {
        reset(bits); VL_SetColor(1,17,29,43);
        check("single-native-color-copied",same(curpal[1],{17,29,43}) && same(curpal[0],{0,0,0}));
        check("single-indexed-color-presented",locks==(web && bits==8?1:0) && unlocks==locks);
        check("single-truecolor-path-preserved",blits==(bits!=8?1:0) && flips==blits);
        if(web && bits==8)check("single-color-visible-without-new-draw",same(shown[0],{17,29,43}));
    }
    for(int color:{0,7,255}) {
        reset(8); VL_ClearScreen(color);
        check("clear-correct-backend",bars==(web?1:0) && fills==(web?0:1));
        bool pixels=true,padding=true;
        for(int y=0;y<2;++y)for(int x=0;x<5;++x)
            if(x<3)pixels &= back.pixels[y*5+x]==(web?color:91);
            else padding &= back.pixels[y*5+x]==91;
        check("clear-indexed-pixels-and-padding",pixels && padding);
    }
    if(web)for(bool single:{false,true}) {
        reset(8); lockFailure=true;bool threw=false;
        try { if(single)VL_SetColor(1,2,3,4);else VL_SetPalette(colors,true); } catch(int code) {threw=code==7;}
        check("failed-lock-does-not-unlock",threw && locks==1 && unlocks==0);
    }
    return failures?1:0;
}
