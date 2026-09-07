#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <unistd.h>
#include <fcntl.h>
#include "wolf-sdk-keycodes.h"
using word = uint16_t;
using boolean = int8_t;
#define O_BINARY 0
#include "config-native-types.h"
enum { sc_W='w', sc_A='a', sc_S='s', sc_D='d', sc_UpArrow=SDLK_UP,
    sc_RightArrow=SDLK_RIGHT, sc_DownArrow=SDLK_DOWN, sc_LeftArrow=SDLK_LEFT };
enum { di_north, di_east, di_south, di_west, BASEMOVE=35, RUNMOVE=70 };
char configdir[300];
#ifdef SPEAR
const char *configname="config.sod";
#else
const char *configname="config.wl6";
#endif
HighScore Scores[MaxScores] = {};
SDMode SoundMode = sdm_AdLib;
SMMode MusicMode = smm_AdLib;
SDSMode DigiMode = sds_SoundBlaster;
boolean mouseenabled = true, joystickenabled = true;
bool SoundBlasterPresent = true, AdLibPresent = true, MousePresent = true;
int dirscan[4] = {}, buttonscan[NUMBUTTONS] = {}, buttonmouse[4] = {}, buttonjoy[32] = {};
int viewsize=19, mouseadjustment=5, controlx=0, controly=0, tics=1;
bool buttonstate[NUMBUTTONS] = {}, keyboard[SDLK_LAST] = {};
struct { int active=0; } MainMenu[10];
struct { int curpos=0; } MainItems;
bool IN_JoyPresent() { return true; }
void SD_SetMusicMode(SMMode mode) { MusicMode=mode; }
void SD_SetSoundMode(SDMode mode) { SoundMode=mode; }
void SD_SetDigiDevice(SDSMode mode) { DigiMode=mode; }
bool IN_GameplayKeyDown(int key) { return key>=0 && key<SDLK_LAST && keyboard[key]; }
#include "config-production.h"

int main(int argc, char **argv) {
    if(argc!=2) return 2;
    std::snprintf(configdir,sizeof(configdir),"%s",argv[1]);
    char file[600]; std::snprintf(file,sizeof(file),"%s/%s",configdir,configname);
    int failures=0;
    auto check=[&](const char *label,bool pass) { if(!pass)++failures;std::printf("{\"label\":\"%s\",\"passed\":%s}\n",label,pass?"true":"false"); };
    auto arrows=[] { dirscan[0]=sc_UpArrow;dirscan[1]=sc_RightArrow;dirscan[2]=sc_DownArrow;dirscan[3]=sc_LeftArrow; };
    auto wasd=[] { dirscan[0]=sc_W;dirscan[1]=sc_D;dirscan[2]=sc_S;dirscan[3]=sc_A; };
    auto custom=[] { dirscan[0]='t';dirscan[1]='h';dirscan[2]='g';dirscan[3]='f'; };
    auto size=[&] { int fd=open(file,O_RDONLY);if(fd<0)return off_t(-1);auto n=lseek(fd,0,SEEK_END);close(fd);return n; };
    arrows(); WriteConfig(); const off_t fullSize=size();
    check("packed-high-score-native-abi",sizeof(HighScore)==66 && sizeof(boolean)==1 && sizeof(int)==4);
    check("browser-version-appended",fullSize==off_t(sizeof(word)+sizeof(Scores)+sizeof(SoundMode)+sizeof(MusicMode)+sizeof(DigiMode)+4*sizeof(boolean)+sizeof(int)+sizeof(dirscan)+sizeof(buttonscan)+sizeof(buttonmouse)+sizeof(buttonjoy)+sizeof(viewsize)+sizeof(mouseadjustment)+sizeof(uint32_t)));
    custom();buttonscan[bt_attack]='w';buttonmouse[0]=bt_use;buttonjoy[0]=bt_attack;
    viewsize=12;mouseadjustment=8;MusicMode=smm_Off;SoundMode=sdm_PC;DigiMode=sds_Off;
    SaveBrowserConfig();
    arrows();buttonscan[bt_attack]=SDLK_LCTRL;buttonmouse[0]=bt_attack;buttonjoy[0]=bt_use;
    viewsize=19;mouseadjustment=5;MusicMode=smm_AdLib;SoundMode=sdm_AdLib;DigiMode=sds_SoundBlaster;
    ReadConfig();
    check("accepted-menu-change-saves-directions",dirscan[0]=='t' && dirscan[1]=='h' && dirscan[2]=='g' && dirscan[3]=='f');
    check("keyboard-binding-round-trip",buttonscan[bt_attack]=='w');
    check("mouse-binding-round-trip",buttonmouse[0]==bt_use);
    check("joystick-binding-round-trip",buttonjoy[0]==bt_attack);
    check("view-size-round-trip",viewsize==12);
    check("mouse-sensitivity-round-trip",mouseadjustment==8);
    check("sound-settings-round-trip",MusicMode==smm_Off && SoundMode==sdm_PC && DigiMode==sds_Off);
    custom();WriteConfig();truncate(file,fullSize-sizeof(uint32_t));arrows();ReadConfig();
    check("unversioned-custom-directions-preserved",dirscan[0]=='t' && dirscan[3]=='f');
    wasd();WriteConfig();truncate(file,fullSize-sizeof(uint32_t));ReadConfig();
    check("legacy-double-bound-wasd-migrated",dirscan[0]==sc_UpArrow && dirscan[1]==sc_RightArrow && dirscan[3]==sc_LeftArrow);
    wasd();WriteConfig();arrows();ReadConfig();
    check("intentional-versioned-wasd-preserved",dirscan[0]==sc_W && dirscan[1]==sc_D && dirscan[3]==sc_A);
    custom();WriteConfig();std::vector<unsigned char> saved(fullSize);int fd=open(file,O_RDONLY);read(fd,saved.data(),saved.size());close(fd);
    for(off_t cut : {off_t(0),off_t(1),off_t(2),off_t(3),off_t(100),fullSize-off_t(sizeof(uint32_t))-1}) {
        fd=open(file,O_WRONLY|O_TRUNC);write(fd,saved.data(),cut);close(fd);arrows();viewsize=7;mouseadjustment=1;ReadConfig();
        check("truncated-record-defaults",viewsize==19 && mouseadjustment==5 && dirscan[0]==sc_UpArrow);
    }
    fd=open(file,O_WRONLY|O_TRUNC);saved[0]=0;write(fd,saved.data(),saved.size());close(fd);ReadConfig();
    check("bad-record-header-defaults",viewsize==19 && mouseadjustment==5);
    WriteConfig();fd=open(file,O_WRONLY|O_APPEND);write(fd,"trailing",8);close(fd);WriteConfig();
    check("rewritten-record-has-no-stale-tail",size()==fullSize);
    std::memset(buttonscan,0,sizeof(buttonscan));std::memset(buttonstate,0,sizeof(buttonstate));arrows();keyboard[sc_W]=true;controlx=controly=0;
    PollKeyboardMove();check("default-w-fallback-once",controly==-BASEMOVE);
    dirscan[0]=sc_W;controlx=controly=0;PollKeyboardMove();check("custom-w-movement-not-doubled",controly==-BASEMOVE);
    arrows();buttonscan[bt_attack]=sc_W;controlx=controly=0;PollKeyboardMove();check("custom-w-action-suppresses-fallback",controly==0);
    keyboard[sc_W]=false;keyboard[sc_A]=true;dirscan[3]=sc_A;controlx=controly=0;PollKeyboardMove();
    check("custom-a-turn-not-also-strafe",controlx==-BASEMOVE && !buttonstate[bt_strafeleft]);
    return failures?1:0;
}
