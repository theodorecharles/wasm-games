#include "lith_host.h"

#include <cstdint>
#include <emscripten.h>

static uint32_t g_frame[640 * 480];

extern "C" {

EMSCRIPTEN_KEEPALIVE int lith_start(const char *dir) { return lith_host_init(dir); }

EMSCRIPTEN_KEEPALIVE void lith_present(void) {
  lith_host_render(g_frame, lith_host_frame_width(), lith_host_frame_height());
}

EMSCRIPTEN_KEEPALIVE uint32_t *lith_frame(void) { return g_frame; }

}
