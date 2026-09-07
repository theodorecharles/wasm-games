#include <cstdio>
#include "web/menu_pointer.h"
struct Info {int x,y,amount;};
struct Item {int active;};
int main() {
    Info menu{76,55,9};Item items[]={{1},{1},{1},{1},{0},{1},{2},{1},{1}};
    WolfWebMenuPointer pointer;
    int cases=0,failures=0;
    auto check=[&](const char *label, bool passed) {
        ++cases;if(!passed)++failures;
        std::printf("{\"label\":\"%s\",\"passed\":%s}\n",label,passed?"true":"false");
    };
    auto poll=[&]() {return pointer.Poll(&menu,items,254);};
    auto click=[&](int x,int y,int button=0) {pointer.Event(x,y,button,true);pointer.Event(x,y,button,false);return poll();};
    check("inactive-click-ignored",click(120,60).activate==-1);
    pointer.Begin();
    pointer.Event(120,73,-1,false);check("hover-sound",poll().hover==1);
    check("stationary-pointer-does-not-override-keyboard",poll().hover==-1);
    check("short-click-latched",click(120,60).activate==0);
    check("click-consumed-once",poll().activate==-1);
    pointer.Event(120,86,0,true);check("down-does-not-activate",poll().activate==-1);
    pointer.Event(120,86,0,false);check("release-activates",poll().activate==2);
    pointer.Event(120,60,0,true);pointer.Event(120,73,0,false);
    check("drag-between-rows-cancels",poll().activate==-1);
    pointer.Event(120,60,0,false);check("orphan-release-ignored",poll().activate==-1);
    check("disabled-save-row",click(120,110).activate==-1);
    check("read-color-active-row",click(120,135).activate==6);
    check("left-boundary",click(72,55).activate==0);
    check("outside-left",click(71,55).activate==-1);
    check("right-inside",click(253,55).activate==0);
    check("right-exclusive",click(254,55).activate==-1);
    check("above-list",click(120,54).activate==-1);
    check("below-list",click(120,172).activate==-1);
    check("lower-backbuffer-bar",click(120,220).activate==-1);
    check("negative-coordinates",click(-1,60).activate==-1);
    check("outside-backbuffer",click(320,60).activate==-1);
    check("middle-button-ignored",click(120,60,1).activate==-1);
    check("right-button-back",click(120,60,2).back);
    pointer.Event(120,60,0,true);pointer.Event(120,60,2,false);
    check("mismatched-buttons",!poll().back);
    pointer.Event(120,60,0,true);pointer.Event(0,0,-2,false);pointer.Event(120,60,0,false);
    check("cancel-discards-press",poll().activate==-1);
    pointer.Event(120,60,0,true);pointer.Event(120,60,0,false);pointer.Event(0,0,-2,false);
    check("cancel-discards-pending-click",poll().activate==-1);
    pointer.Event(120,60,0,true);pointer.End();pointer.Begin();pointer.Event(120,60,0,false);
    check("menu-change-discards-held-gesture",poll().activate==-1);
    pointer.Event(120,60,0,true);pointer.Event(120,60,0,false);pointer.End();pointer.Begin();
    check("menu-change-discards-queued-click",poll().activate==-1);
    pointer.End();pointer.Event(120,60,-1,false);pointer.Begin();
    check("transition-motion-discarded",poll().hover==-1);
    // Actual NewEmenu has 11 items: six two-line titles, five empty spacers.
    Info episode{10,23,11};Item episodes[11]={{1},{0},{1},{0},{1},{0},{1},{0},{1},{0},{1}};
    auto pollEpisode=[&]() {
#ifdef WOLF_MENU_LEGACY
        return pointer.Poll(&episode,episodes,310);
#else
        return pointer.Poll(&episode,episodes,310,2);
#endif
    };
    auto episodeClick=[&](int y) {pointer.Event(130,y,0,true);pointer.Event(130,y,0,false);return pollEpisode();};
    pointer.Event(130,55,0,true);pointer.Event(130,55,0,false);
    check("episode-spaced-row",pollEpisode().activate==2);
    pointer.Event(130,40,0,true);pointer.Event(130,40,0,false);
    check("episode-caption-selects-title",pollEpisode().activate==0);
    check("episode-last-caption-without-spacer-item",episodeClick(178).activate==10);
    check("episode-bottom-exclusive",episodeClick(179).activate==-1);
    check("episode-next-title-boundary",episodeClick(49).activate==2);
    check("episode-previous-caption-boundary",episodeClick(48).activate==0);
    pointer.Event(130,40,-1,false);check("episode-caption-hover",pollEpisode().hover==0);
    pointer.Event(130,30,0,true);pointer.Event(130,40,0,false);
    check("episode-title-to-caption-click",pollEpisode().activate==0);
    pointer.Event(130,40,0,true);pointer.Event(130,55,0,false);
    check("episode-caption-to-next-title-cancels",pollEpisode().activate==-1);
    episodes[2].active=0;
    check("episode-disabled-title",episodeClick(55).activate==-1);
    check("episode-disabled-caption",episodeClick(65).activate==-1);
    episodes[2].active=3;
    check("episode-native-unavailable-selection-preserved",episodeClick(65).activate==2);
    return failures?1:0;
}
