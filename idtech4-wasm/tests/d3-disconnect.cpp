#include <cstdio>
#include <string>
#include "d3-disconnect-production.h"

int main() {
  int cases = 0;
  for (int state : {CS_DISCONNECTED, CS_CHALLENGING, CS_CONNECTED, CS_PURERESTART}) {
    trace.clear();
    idAsyncClient client;
    client.clientState = state;
    client.active = true;
    client.DisconnectFromServer();
    std::string expected = state >= CS_CONNECTED ? "pure,reliable,send,send,send," : "";
    if (state != CS_PURERESTART) expected += "shutdown,";
#ifdef __EMSCRIPTEN__
    expected += "close,";
#endif
    bool passed = trace == expected && !client.active &&
      client.clientState == (state == CS_PURERESTART ? state : CS_DISCONNECTED);
    std::printf("{\"state\":%d,\"passed\":%s,\"trace\":\"%s\"}\n", state, passed ? "true" : "false", trace.c_str());
    ++cases;
  }
  return cases == 4 ? 0 : 1;
}
