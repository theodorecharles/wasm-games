#include <stdio.h>
#include <string.h>

#include "common_types.h"

extern int WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR commandLine, int show);

int main(int argc, char **argv) {
  static char commandLine[4096];
  int i;
  for (i = 1; i < argc; ++i) {
    size_t used = strlen(commandLine);
    size_t needed = strlen(argv[i]) + (used ? 1 : 0);
    if (used + needed + 1 >= sizeof(commandLine)) {
      fprintf(stderr, "[cod2-wasm] command line exceeds %zu bytes\n", sizeof(commandLine));
      return 1;
    }
    if (used) strcat(commandLine, " ");
    strcat(commandLine, argv[i]);
  }
  fprintf(stdout, "[cod2-wasm] starting reconstructed native multiplayer client\n");
  return WinMain(0, 0, commandLine, 0);
}
