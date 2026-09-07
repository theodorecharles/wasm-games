import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.OPENRCT2_SOURCE_DIR || path.resolve(game, '../../.work/openrct2');
const legacy = process.env.OPENRCT2_DIALOG_LEGACY === '1';
const uiPath = 'src/openrct2-ui/UiContext.Linux.cpp';
const ui = legacy ? execFileSync('git', ['-C', root, 'show', `HEAD:${uiPath}`], { encoding:'utf8' })
  : await fs.readFile(path.join(root, uiPath), 'utf8');
const browser = await fs.readFile(path.join(root, 'src/openrct2-ui/interface/FileBrowser.cpp'), 'utf8');
function method(text, signature) {
  const start = text.indexOf(signature);
  assert.ok(start >= 0, signature);
  const body = text.indexOf('{', start);
  let depth = 1, end = body + 1;
  while (depth && end < text.length) {
    const c = text[end++];
    if (c === '{') depth++;
    if (c === '}') depth--;
  }
  assert.equal(depth, 0, signature);
  return text.slice(start, end);
}
const fixture = `
#include <cassert>
#include <iostream>
#include <optional>
#include <string>
#include <vector>
using u8string = std::string;
namespace Platform {
 bool zenity=false, kdialog=false;
 std::vector<std::string> probes;
 bool FindApp(const char* name, std::string* output) {
  probes.push_back(name);
  const bool found=std::string(name)=="zenity" ? zenity : kdialog;
  if(found && output) *output=std::string("/usr/bin/")+name;
  return found;
 }
}
enum class DialogType { none, kdialog, zenity };
struct IPlatformUiContext {
 virtual bool HasFilePicker() const=0;
 virtual bool HasMenuSupport()=0;
};
struct LinuxContext : IPlatformUiContext {
 mutable std::optional<bool> _hasFilePicker=std::nullopt;
 ${method(ui, 'bool HasFilePicker() const override')}
 ${method(ui, 'bool HasMenuSupport() override')}
 ${method(ui, 'static DialogType GetDialogApp(')}
};
struct Context {
 LinuxContext* ui;
 LinuxContext& GetUiContext() { return *ui; }
};
Context context;
Context* GetContext() { return &context; }
namespace Config {
 struct General { bool useNativeBrowseDialog=false; };
 struct Configuration { General general; };
 Configuration config;
 Configuration& Get() { return config; }
}
enum class LoadSaveAction { load, save };
enum class LoadSaveType { game };
using LoadSaveCallback = void(*)();
void callback() {}
struct TrackDesign {};
struct WindowBase {};
WindowBase nativeWindow;
TrackDesign track;
int nativeCalls=0, systemCalls=0, registered=0, unregistered=0, selected=0;
LoadSaveAction expectedAction;
namespace Windows {
 WindowBase* LoadsaveOpen(LoadSaveAction action, LoadSaveType type, const u8string& name,
   LoadSaveCallback cb, bool isJs, TrackDesign* design) {
  assert(action==expectedAction && type==LoadSaveType::game && name=="proof.park");
  assert(cb==callback && isJs && design==&track);
  nativeCalls++;
  return &nativeWindow;
 }
}
u8string GetDir(LoadSaveType) { return "/save/native"; }
void RegisterCallback(LoadSaveCallback cb, bool isJs) { assert(cb==callback && isJs); registered++; }
void UnregisterJSCallback() { unregistered++; }
u8string OpenSystemFileBrowser(bool save, LoadSaveType, const u8string& directory, const u8string& name, TrackDesign* design) {
 assert(save==(expectedAction==LoadSaveAction::save) && directory=="/save/native" && name=="proof.park" && design==&track);
 systemCalls++; return "selected.park";
}
void Select(const char* name, LoadSaveAction action, LoadSaveType, TrackDesign* design) {
 assert(std::string(name)=="selected.park" && action==expectedAction && design==&track); selected++;
}
${method(browser, 'WindowBase* OpenPreferred(')}
int main() {
#ifdef __EMSCRIPTEN__
 constexpr bool web=true;
#else
 constexpr bool web=false;
#endif
 unsigned cases=0;
 for(bool zenity: {false,true}) for(bool kdialog: {false,true}) for(bool preferNative: {false,true})
  for(auto action: {LoadSaveAction::load,LoadSaveAction::save}) {
   Platform::zenity=zenity; Platform::kdialog=kdialog; Platform::probes.clear();
   nativeCalls=systemCalls=registered=unregistered=selected=0;
   LinuxContext ui; context.ui=&ui;
   Config::Get().general.useNativeBrowseDialog=preferNative;
   expectedAction=action;
   auto result=OpenPreferred(action,LoadSaveType::game,"proof.park",callback,true,&track);
   if(web && !Platform::probes.empty()) {
    std::cerr << "browser save/load incorrectly probed desktop applications: " << Platform::probes.size() << "\\n";
    return 1;
   }
   const bool capability=!web && (zenity || kdialog);
   const bool system=preferNative && capability;
   assert(result==(system ? nullptr : &nativeWindow));
   assert(nativeCalls==!system && systemCalls==system && registered==system && unregistered==system && selected==system);
   assert(Config::Get().general.useNativeBrowseDialog==preferNative);
   if(!web) assert(Platform::probes==(zenity ? std::vector<std::string>{"zenity"} : std::vector<std::string>{"zenity","kdialog"}));
   const auto count=Platform::probes.size();
   assert(ui.HasFilePicker()==capability);
   assert(Platform::probes.size()==count); // Cached capability query.
   assert(ui.HasMenuSupport()==capability);
   assert(Platform::probes.size()==2*count);
   std::string executable="unchanged";
   const auto dialog=LinuxContext::GetDialogApp(&executable);
   const auto expected=web ? DialogType::none : (zenity ? DialogType::zenity : (kdialog ? DialogType::kdialog : DialogType::none));
   assert(dialog==expected);
   assert(executable==(expected==DialogType::none ? "unchanged" : (zenity ? "/usr/bin/zenity" : "/usr/bin/kdialog")));
   assert(LinuxContext::GetDialogApp(nullptr)==expected);
   cases++;
  }
 std::cout << cases << (web ? " browser" : " desktop") << " exact-method capability/save/load cases passed\\n";
}
`;
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openrct2-dialog-'));
await fs.writeFile(path.join(scratch, 'dialog.cpp'), fixture);
for (const target of ['browser','desktop']) {
  const binary=path.join(scratch, target);
  execFileSync(process.env.CXX || 'c++', ['-std=c++17','-O2','-Wall','-Wextra','-Werror',
    ...(target==='browser' ? ['-D__EMSCRIPTEN__'] : []), path.join(scratch,'dialog.cpp'), '-o',binary], { stdio:'inherit' });
  execFileSync(binary, [], { stdio:'inherit' });
}
console.log(`Native dialog capability and full save/load selection checked (${legacy ? 'old source' : 'applied source'}); fixture retained at ${scratch}`);
