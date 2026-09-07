#include <cstdio>
#include <vector>
#include <string>

static std::vector<std::string> trace;
static int now = 1000, memoryMixes = 0, writeMixes = 0;
struct CVar {
  int value = 0;
  int GetInteger() const { return value; }
  bool GetBool() const { return value != 0; }
  bool IsModified() const { return false; }
};
static CVar com_asyncSound, com_speeds, com_forceGenericSIMD;
static int com_frameTime, com_ticNumber, com_frameNumber;
static int time_gameFrame, time_frontend, time_backend, time_gameDraw;
static const int USERCMD_MSEC = 16;
struct idLib { static int frameNumber; };
int idLib::frameNumber = 0;
struct idException {};
static int Sys_Milliseconds() { return now; }
static void Sys_GenerateEvents() { trace.push_back("events"); }
struct Sound {
  void AsyncUpdate(int time) {
    if (time != now) throw "incorrect mixer timestamp";
    ++memoryMixes;
    trace.push_back("mix");
  }
  void AsyncUpdateWrite(int time) {
    if (time != now) throw "incorrect write mixer timestamp";
    ++writeMixes;
    trace.push_back("write");
  }
} soundObject;
static Sound* soundSystem = &soundObject;
struct EventLoop { void RunEventLoop() { trace.push_back("eventLoop"); } } eventObject;
static EventLoop* eventLoop = &eventObject;
struct idAsyncNetwork {
  static bool active, nextActive;
  static bool IsActive() { return active; }
  static void RunFrame() { trace.push_back("network"); active = nextActive; }
};
bool idAsyncNetwork::active = false, idAsyncNetwork::nextActive = false;
static void inlineSessionMix();
static void asyncTimerMix();
struct Session {
  void Frame() { trace.push_back("session"); inlineSessionMix(); }
  void GuiFrameEvents() { trace.push_back("gui"); }
  void UpdateScreen(bool) { trace.push_back("screen"); }
} sessionObject;
static Session* session = &sessionObject;
struct idCommonLocal {
  void Frame();
  void Async() { trace.push_back("async"); asyncTimerMix(); ++com_ticNumber; }
  void WriteConfiguration() { trace.push_back("config"); }
  void InitSIMD() {}
  void Printf(const char*, ...) {}
} commonObject;
static idCommonLocal* common = &commonObject;

// Exact Common::Frame plus the existing Session and async-timer mixer blocks.
// Other engine APIs above are traces, not substitutes for a native game run.
#include "d3-mp-audio-production.h"

int main() {
  int failures = 0;
  // The network state changes inside RunFrame, as on connection/disconnection.
  const bool states[] = {false, true, true, false, true};
  const char* names[] = {"single-player", "join", "multiplayer", "disconnect", "rejoin"};
  for (int mode = 0; mode < 4; ++mode) {
    com_asyncSound.value = mode;
    idAsyncNetwork::active = false;
    for (int step = 0; step < 5; ++step) {
      now += 64;
      trace.clear(); memoryMixes = writeMixes = 0;
      idAsyncNetwork::nextActive = states[step];
      const int beforeFrame = com_frameNumber;
      common->Frame();
      std::vector<std::string> expected = {"events", "config", "eventLoop", "async"};
      if (mode == 1) expected.push_back("mix");
      if (mode == 3) expected.push_back("write");
      expected.push_back("network");
      if (!states[step]) expected.push_back("session");
      if (mode == 0) expected.push_back("mix");
      if (states[step]) expected.push_back("gui");
      expected.push_back("screen");
      const bool passed = trace == expected &&
        memoryMixes == (mode == 0 || mode == 1 ? 1 : 0) &&
        writeMixes == (mode == 3 ? 1 : 0) &&
        com_frameNumber == beforeFrame + 1 && idLib::frameNumber == com_frameNumber;
      failures += !passed;
      std::printf("{\"mode\":%d,\"case\":\"%s\",\"memoryMixes\":%d,\"writeMixes\":%d,\"passed\":%s}\n",
        mode, names[step], memoryMixes, writeMixes, passed ? "true" : "false");
    }
  }
  return failures ? 1 : 0;
}
