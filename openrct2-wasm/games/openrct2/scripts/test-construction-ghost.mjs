import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.OPENRCT2_SOURCE_DIR || path.resolve(game, '../../.work/openrct2');
const legacy = process.env.OPENRCT2_GHOST_LEGACY === '1';
const entrancePath = 'src/openrct2/world/Entrance.cpp';
const entrance = legacy ? execFileSync('git', ['-C', root, 'show', `HEAD:${entrancePath}`], { encoding: 'utf8' })
  : await fs.readFile(path.join(root, entrancePath), 'utf8');
const native = await fs.readFile(path.join(root, 'src/openrct2/ride/RideConstruction.cpp'), 'utf8');
const ui = await fs.readFile(path.join(root, 'src/openrct2-ui/windows/RideConstruction.cpp'), 'utf8');
// Repair identity ownership, not native action validation or its diagnostics.
for (const file of ['src/openrct2/actions/ride/RideEntranceExitRemoveAction.cpp',
  'src/openrct2/actions/ride/RideEntranceExitPlaceAction.cpp']) {
  assert.equal(await fs.readFile(path.join(root,file),'utf8'),
    execFileSync('git',['-C',root,'show',`HEAD:${file}`],{encoding:'utf8'}), file);
}
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
const globals = entrance.slice(entrance.indexOf('CoordsXYZD gRideEntranceExitGhostPosition;'), entrance.indexOf('static money64 RideEntranceExitPlaceGhost('));
assert.ok(globals.startsWith('CoordsXYZD gRideEntranceExitGhostPosition;'));
const invalidate = method(native, 'void RideConstructionInvalidateCurrentTrack()');
assert.match(invalidate, /case RideConstructionState::EntranceExit:[\s\S]*RideConstructionRemoveGhosts\(\);/);
const fixture = `
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>
#include <initializer_list>
using money64 = int64_t;
constexpr money64 kMoney64Undefined = -1;
using Direction = int;
constexpr int ENTRANCE_TYPE_RIDE_ENTRANCE = 0, ENTRANCE_TYPE_RIDE_EXIT = 1;
struct Id {
 int value = 0;
 static Id FromUnderlying(int value) { return {value}; }
 static Id GetNull() { return {-1}; }
 bool operator==(const Id&) const = default;
};
using RideId = Id;
using StationIndex = Id;
struct CoordsXY { int x = 0, y = 0; bool operator==(const CoordsXY&) const = default; };
struct CoordsXYZD : CoordsXY { int z = 0, direction = 0; };
enum class TrackSelectionFlag { entranceOrExit, track, arrow };
enum class InputFlag { allowRightMouseRemoval };
template<typename E> struct Flags {
 unsigned value = 0;
 bool has(E bit) const { return (value & (1u << static_cast<unsigned>(bit))) != 0; }
 void set(E bit) { value |= 1u << static_cast<unsigned>(bit); }
 void unset(E bit) { value &= ~(1u << static_cast<unsigned>(bit)); }
};
Flags<TrackSelectionFlag> _currentTrackSelectionFlags;
Flags<InputFlag> gInputFlags;
struct Ride { RideId id; };
Ride rides[] = {{{0}}, {{1}}, {{2}}, {{3}}};
Ride* GetRide(RideId id) { return &rides[id.value]; }
RideId _currentRideIndex;
int gRideEntranceExitPlaceType = 0;
RideId gRideEntranceExitPlaceRideIndex;
StationIndex gRideEntranceExitPlaceStationIndex;
enum class RideConstructionState { Place, EntranceExit };
RideConstructionState _rideConstructionState = RideConstructionState::EntranceExit;
RideConstructionState gRideEntranceExitPlacePreviousRideConstructionState;
enum class Tool { crosshair };
constexpr int WIDX_ENTRANCE=1, WIDX_EXIT=2, INTENT_ACTION_REMOVE_PROVISIONAL_TRACK_PIECE=3;
template<typename T> bool ToolSet(T&, int, Tool) { return false; }
bool RideTryGetOriginElement(const Ride&, void*) { return true; }
void RideInitialiseConstructionWindow(const Ride&) {}
void WindowRideConstructionUpdateActiveElements() {}
struct Intent { explicit Intent(int) {} };
void ContextBroadcastIntent(Intent*) {}
int state;
int& getGameState() { return state; }
struct Element { CoordsXY pos; RideId ride; StationIndex station; bool exit; bool ghost; };
std::vector<Element> world;
int misses = 0, realRemovals = 0;
bool rejectPlacement = false;
namespace GameActions {
 enum class CommandFlag { ghost, allowDuringPaused };
 enum class Status { ok, invalid };
 struct Result { Status error; money64 cost; };
 struct Action {
  CoordsXY pos; RideId ride; StationIndex station; bool exit;
  Flags<CommandFlag> flags;
  void SetFlags(std::initializer_list<CommandFlag> list) { for(auto flag:list) flags.set(flag); }
 };
 struct RideEntranceExitPlaceAction : Action {
  RideEntranceExitPlaceAction(const CoordsXY& pos, Direction, RideId ride, StationIndex station, bool exit)
   : Action{pos,ride,station,exit,{}} {}
 };
 struct RideEntranceExitRemoveAction : Action {
  RideEntranceExitRemoveAction(const CoordsXY& pos, RideId ride, StationIndex station, bool exit)
   : Action{pos,ride,station,exit,{}} {}
 };
 Result Execute(RideEntranceExitPlaceAction* action, int&) {
  assert(action->flags.has(CommandFlag::ghost));
  assert(action->flags.has(CommandFlag::allowDuringPaused));
  if(rejectPlacement) return {Status::invalid,0};
  world.push_back({action->pos, action->ride, action->station, action->exit, true});
  return {Status::ok,10};
 }
 Result Execute(RideEntranceExitRemoveAction* action, int&) {
  assert(action->flags.has(CommandFlag::ghost));
  assert(action->flags.has(CommandFlag::allowDuringPaused));
  auto found = std::find_if(world.begin(), world.end(), [&](const Element& e) {
   return e.pos == action->pos && e.ride == action->ride && e.station == action->station && e.exit == action->exit;
  });
  if(found == world.end()) { misses++; return {Status::invalid,0}; }
  if(!found->ghost) { realRemovals++; return {Status::invalid,0}; }
  world.erase(found);
  return {Status::ok,0};
 }
}
using GameActions::CommandFlag;
void RideConstructionRemoveGhosts();
${globals}
${method(entrance, 'static money64 RideEntranceExitPlaceGhost(')}
${method(entrance, 'void RideEntranceExitPlaceProvisionalGhost()')}
${method(entrance, 'void RideEntranceExitRemoveGhost()')}
${method(entrance, 'money64 RideEntranceExitPlaceGhost(\n    const Ride&')}
${method(native, 'void RideConstructionRemoveGhosts()')}
// The actual EntranceExit invalidation branch delegates to this exact cleanup.
// Map-arrow invalidation and native map actions are not reimplemented here.
void RideConstructionInvalidateCurrentTrack() { RideConstructionRemoveGhosts(); }
struct ConstructionWindow {
 ${method(ui, 'void EntranceClick()')}
 ${method(ui, 'void ExitClick()')}
};
void reset(int type, int station) {
 world = {{{4000,4000}, {2}, {station}, type != 0, false}};
 _currentTrackSelectionFlags = {};
 _currentRideIndex = {2};
 gRideEntranceExitPlaceType = type;
 gRideEntranceExitPlaceStationIndex = {station};
 _rideConstructionState = RideConstructionState::EntranceExit;
 misses = realRemovals = 0; rejectPlacement = false;
 assert(RideEntranceExitPlaceGhost(rides[2], {960,2272}, 1, type, {station}) == 10);
 assert(world.size()==2);
}
bool clean(const char* test) {
 if(misses || realRemovals || world.size()!=1 || world[0].ghost) {
  std::cerr << test << ": missing removals=" << misses << " real removals=" << realRemovals << " elements=" << world.size() << "\\n";
  return false;
 }
 return true;
}
int main() {
 unsigned cases = 0;
 ConstructionWindow window;
 for(int changeRide: {0,1}) for(int type: {0,1}) for(int target: {0,1}) for(int station: {0,2}) {
  reset(type,station);
  if(changeRide) _currentRideIndex={3};
  if(target==0) window.EntranceClick(); else window.ExitClick();
  if(!clean("actual tool switch cleanup")) return 1;
  assert(!_currentTrackSelectionFlags.has(TrackSelectionFlag::entranceOrExit));
  assert(gRideEntranceExitPlaceType==target);
  cases++;
 }
 for(int type: {0,1}) for(int station: {0,2}) for(int changeRide: {0,1}) {
  reset(type,station);
  // Temporary removal/restore must retain the placed ghost's identity even if
  // selection changes. The selection flag intentionally survives removal.
  gRideEntranceExitPlaceType=type^1;
  if(changeRide) _currentRideIndex={3};
  RideEntranceExitRemoveGhost();
  if(!clean("temporary removal")) return 1;
  assert(_currentTrackSelectionFlags.has(TrackSelectionFlag::entranceOrExit));
  RideEntranceExitPlaceProvisionalGhost();
  assert(world.size()==2);
  const auto restored=world.back();
  assert(restored.ride==RideId{2} && restored.station==StationIndex{station} && restored.exit==(type!=0));
  assert((restored.pos==CoordsXY{960,2272}));
  RideConstructionRemoveGhosts();
  if(!clean("restored ghost cleanup")) return 1;
  cases++;
 }
 for(int type: {0,1}) for(int station: {0,2}) {
  reset(type,station);
  gRideEntranceExitPlaceType=type^1;
  rejectPlacement=true;
  assert(RideEntranceExitPlaceGhost(rides[3], {1024,2304}, 2, type^1, {0}) == kMoney64Undefined);
  if(!clean("failed replacement")) return 1;
  assert(!_currentTrackSelectionFlags.has(TrackSelectionFlag::entranceOrExit));
  RideEntranceExitRemoveGhost(); RideEntranceExitPlaceProvisionalGhost();
  if(!clean("empty ghost lifecycle")) return 1;
  cases++;
 }
 std::cout << cases << " exact-method ghost lifecycle cases passed\\n";
}
`;
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'openrct2-ghost-'));
await fs.writeFile(path.join(scratch, 'ghost.cpp'), fixture);
execFileSync(process.env.CXX || 'c++', ['-std=c++20', '-Wall', '-Wextra', '-Werror', '-O1', '-fsanitize=address,undefined', '-fno-sanitize-recover=all',
  '-fno-omit-frame-pointer', path.join(scratch, 'ghost.cpp'), '-o', path.join(scratch, 'ghost-test')], { stdio:'inherit' });
const environment = { ...process.env };
if (environment.LD_PRELOAD) {
  // Keep desktop/session interposers; load ASan first as its runtime requires.
  const asan = execFileSync(process.env.CXX || 'c++', ['-print-file-name=libasan.so'], { encoding:'utf8' }).trim();
  assert.ok(path.isAbsolute(asan));
  await fs.access(asan);
  environment.LD_PRELOAD = `${asan}:${environment.LD_PRELOAD}`;
}
execFileSync(path.join(scratch, 'ghost-test'), { stdio:'inherit', env:environment });
console.log(`Native ghost functions and tool handlers checked (${legacy ? 'old source' : 'applied source'}); fixture retained at ${scratch}`);
