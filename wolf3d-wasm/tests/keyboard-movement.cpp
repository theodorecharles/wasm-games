#include <cstdio>
#include <cstring>
#include <cstdint>
using boolean = bool;
enum {sc_W='w',sc_A='a',sc_S='s',sc_D='d',sc_UpArrow=273,sc_DownArrow=274,sc_RightArrow=275,sc_LeftArrow=276};
enum {di_north,di_east,di_south,di_west};
enum {bt_run,bt_strafeleft,bt_straferight,NUMBUTTONS};
enum {BASEMOVE=35,RUNMOVE=70};
bool Keyboard[512],buttonstate[3];
int dirscan[4],controlx,controly,tics;
int buttonscan[NUMBUTTONS] = {};
bool IN_GameplayKeyDown(int key) { return key >= 0 && key < 512 && Keyboard[key]; }
#include "wolf-movement-production.h"
int main() {
    struct Case {const char *label;int first,second;bool run;int ticks,x,y;bool left,right;};
    const Case cases[]={
        {"W-forward-once",sc_W,0,0,1,0,-35,0,0},
        {"S-backward-once",sc_S,0,0,1,0,35,0,0},
        {"A-strafe-not-turn",sc_A,0,0,1,0,0,1,0},
        {"D-strafe-not-turn",sc_D,0,0,1,0,0,0,1},
        {"left-arrow-turn",sc_LeftArrow,0,0,1,-35,0,0,0},
        {"right-arrow-turn",sc_RightArrow,0,0,1,35,0,0,0},
        {"up-arrow-forward",sc_UpArrow,0,0,1,0,-35,0,0},
        {"down-arrow-backward",sc_DownArrow,0,0,1,0,35,0,0},
        {"W-run",sc_W,0,1,1,0,-70,0,0},
        {"A-run-still-no-turn",sc_A,0,1,3,0,0,1,0},
        {"W-plus-A",sc_W,sc_A,0,1,0,-35,1,0},
        {"W-plus-S-cancel",sc_W,sc_S,0,1,0,0,0,0},
        {"released-keys",0,0,0,1,0,0,0,0},
        {"multi-tic-forward",sc_W,0,0,3,0,-105,0,0}
    };
    int failed=0;
    for(const auto &test:cases) {
        dirscan[di_north]=sc_W;dirscan[di_east]=sc_D;dirscan[di_south]=sc_S;dirscan[di_west]=sc_A;
        RestoreBrowserDirections();
        std::memset(Keyboard,0,sizeof(Keyboard));std::memset(buttonstate,0,sizeof(buttonstate));
        Keyboard[test.first]=test.first!=0;Keyboard[test.second]=test.second!=0;
        buttonstate[bt_run]=test.run;tics=test.ticks;controlx=controly=0;
        PollKeyboardMove();
        bool passed=controlx==test.x && controly==test.y && buttonstate[bt_strafeleft]==test.left && buttonstate[bt_straferight]==test.right;
        if(!passed)++failed;
        std::printf("{\"label\":\"%s\",\"controlx\":%d,\"controly\":%d,\"passed\":%s}\n",test.label,controlx,controly,passed?"true":"false");
    }
    return failed?1:0;
}
