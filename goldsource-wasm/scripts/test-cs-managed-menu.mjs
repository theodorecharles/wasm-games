#!/usr/bin/env node
// Compile the actual registration, layout and Think bodies from the checked
// source/patch. Button plumbing is a fixture; Chrome verifies the real UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const patch = fs.readFileSync(new URL('../games/counter-strike/patches/cs16/managed-menu.patch', import.meta.url), 'utf8');
const postimage = section => section.split('\n').filter(line => line.startsWith(' ') || (line.startsWith('+') && !line.startsWith('+++')))
  .map(line => line.slice(1)).join('\n');
const source = process.env.CS_MANAGED_MENU_SOURCE ? fs.readFileSync(process.env.CS_MANAGED_MENU_SOURCE, 'utf8') :
  postimage(patch.split('diff --git a/menus/Configuration.cpp')[0]);
const registrations = source.match(/\tAddItem\( banner \);[^]*?\n\}/)?.[0];
const layout = source.match(/void CMenuMain::VidInit\( bool connected \)[^]*?\n\}/)?.[0];
const think = source.match(/void CMenuMain::Think\(\)[^]*?\n\}/)?.[0];
const show = source.match(/void CMenuMain::Show\(\)[^]*?\n\}/)?.[0] ||
  'void CMenuMain::Show(){ CMenuFramework::Show(); }'; // legacy inherited Show
assert(registrations && layout && think, 'exact complete production registration/layout/Think bodies');
const configuration = postimage(patch.split('diff --git a/menus/Configuration.cpp')[1]);
assert.match(configuration, /PC_CUSTOMIZE, UI_PlayerSetup_Menu, QMF_NOTIFY/);
for (const callback of ['UI_Controls_Menu', 'UI_Audio_Menu', 'UI_Video_Menu', '&CMenuOptions::Hide'])
  assert(configuration.includes(callback), 'preserved native options action ' + callback);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goldsource-managed-menu-'));
const harness = `#include <vector>
#include <string>
#include <cstdio>
#include <cstdlib>
struct Button {
  const char* name; bool visible=true; int x=-1, y=-1; void(*onReleased)()=nullptr;
  void SetVisibility(bool value){visible=value;} bool IsVisible(){return visible;}
  void Show(){visible=true;} void Hide(){visible=false;}
  void SetCoord(int a,int b){x=a;y=b;} void SetRect(int a,int b,int,int){SetCoord(a,b);}
  void SetNameAndStatus(const char*,const char*){} void SetPicture(int){}
};
struct Globals { int developer, maxClients; } globals, *gpGlobals=&globals;
struct { int width=1024; } uiStatic;
bool active=false; bool CL_IsActive(){return active;}
const char* L(const char* value){return value;}
enum { PC_SAVE_LOAD_GAME, PC_LOAD_GAME };
void UI_SaveLoad_Menu(){} void UI_LoadGame_Menu(){}
struct CMenuFramework {
  virtual void PrepareLayout()=0; virtual void ResetFocus()=0;
  // Model the verified BaseWindow::Show ordering: VidInit selects a cursor,
  // then the base window resets it and finds no button under an outside mouse.
  void Show(){PrepareLayout();ResetFocus();} void Think(){}
};
struct CMenuMain : CMenuFramework {
  Button banner{"banner"}, console{"console"}, disconnect{"disconnect"}, resumeGame{"resumeGame"},
    joinGame{"joinGame"}, newGame{"newGame"}, hazardCourse{"hazardCourse"}, configuration{"configuration"},
    saveRestore{"saveRestore"}, multiPlayer{"multiPlayer"}, customGame{"customGame"}, readme{"readme"},
    previews{"previews"}, quit{"quit"}, minimizeBtn{"minimizeBtn"}, quitButton{"quitButton"};
  bool bTrainMap=false, bCustomGame=false; Button* cursor=nullptr; std::vector<Button*> items;
  void AddItem(Button& item){items.push_back(&item);}
  void SetCursorToItem(Button& item,bool){cursor=&item;}
  void Register(){ ${registrations}
  void VidInit(bool connected); void Think(); void Show();
  void PrepareLayout() override {VidInit(active);} void ResetFocus() override {cursor=nullptr;}
};
${layout}
${think}
${show}
int main(){
  int cases=0;
  for(int train: {0,1}) for(int custom: {0,1}) for(int clients: {1,16}) for(int developer: {0,1}) {
    CMenuMain menu; menu.bTrainMap=train; menu.bCustomGame=custom;
    gpGlobals->maxClients=clients; gpGlobals->developer=developer; menu.Register();
    std::vector<std::string> registered;
    for(Button* item:menu.items) registered.push_back(item->name);
    if(registered!=std::vector<std::string>{"banner","resumeGame","disconnect","configuration","console","joinGame"}){
      std::fprintf(stderr,"unsupported or misordered registered menu action"); return 7;
    }
    for(bool connected: {false,true,false,true}) {
      active=connected; menu.Show(); menu.Think(); ++cases;
      std::vector<std::string> visible;
      for(Button* item: menu.items) if(item!=&menu.banner && item->visible) visible.push_back(item->name);
      std::vector<std::string> expected = connected ? std::vector<std::string>{"resumeGame","disconnect","configuration"} : std::vector<std::string>{"joinGame"};
      if(connected && developer) expected.push_back("console");
      if(visible!=expected){std::fprintf(stderr,"case %d: unexpected menu items:",cases); for(auto& item:visible) std::fprintf(stderr," %s",item.c_str()); return 1;}
      if(menu.cursor!=(connected?&menu.resumeGame:&menu.joinGame)){std::fprintf(stderr,"wrong default keyboard selection");return 2;}
      int previous=-1, gap=0;
      for(Button* item:menu.items) if(item!=&menu.banner && item->visible){
        if(previous>=0){int delta=item->y-previous; if(delta<=0 || (gap && delta!=gap)) return 3; gap=delta;}
        if(item->x!=112 || item->y<0 || item->y>=768) return 4;
        previous=item->y;
      }
      gpGlobals->developer=!developer; menu.Think();
      if(menu.console.visible!=(connected && !developer)) return 5;
      gpGlobals->developer=developer; menu.Think();
      if(menu.console.visible!=(connected && developer)) return 6;
    }
  }
  std::printf("%d compiled registration/layout/connection cases passed, including developer toggles\\n",cases);
}
`;
fs.writeFileSync(path.join(directory, 'menu.cpp'), harness);
for (const [command, args] of [[process.env.CXX || 'c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror',
  '-o', path.join(directory, 'menu'), path.join(directory, 'menu.cpp')]], [path.join(directory, 'menu'), []]]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || 'retained fixture: ' + directory);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { testedAt: new Date().toISOString(), source: process.env.CS_MANAGED_MENU_SOURCE || 'production patch postimage',
  sourceSHA256: hash(source), harnessSHA256: hash(harness), cases: 64, developerToggleChecks: 128,
  nativeOptionsCallbacksPreserved: true, baseShowResetModeled: true, actualEngineAcceptance: false, passed: true };
if (process.env.CS_MANAGED_MENU_PROOF) fs.writeFileSync(process.env.CS_MANAGED_MENU_PROOF, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
