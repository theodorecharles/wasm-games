#include "lith_host.h"

#include <cstdio>
#include <cstring>
#include <vector>

static int fail(const char *msg) {
  std::fprintf(stderr, "FAIL %s\n", msg);
  return 1;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    std::fprintf(stderr, "usage: lith_cli <data-dir> <scenario>\n");
    return 2;
  }
  const char *dir = argv[1];
  const char *scenario = argv[2];
  if (!lith_host_init(dir)) return fail("init");
  if (lith_host_state() != 1) return fail("menu");

  if (std::strcmp(scenario, "render") == 0) {
    std::vector<uint32_t> pixels(640 * 480);
    lith_host_render(pixels.data(), 640, 480);
    int painted = 0, minx = 640, miny = 480, maxx = 0, maxy = 0;
    for (int y = 0; y < 480; ++y) {
      for (int x = 0; x < 640; ++x) {
        const uint32_t p = pixels[y * 640 + x];
        const int r = int(p & 255), g = int((p >> 8) & 255), b = int((p >> 16) & 255);
        if (r + g + b > 12) {
          painted++;
          if (x < minx) minx = x;
          if (y < miny) miny = y;
          if (x > maxx) maxx = x;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (painted < 640 * 480 / 2) return fail("render-empty");
    if (maxx - minx < 400 || maxy - miny < 300) return fail("render-bbox");
    std::printf("render ok painted=%d bbox=%d,%d-%d,%d art=%s\n", painted, minx, miny,
                maxx, maxy, lith_host_menu_art());
    return 0;
  }

  if (std::strcmp(scenario, "menu") == 0) {
    std::printf("state=menu art=%s weapon=%s gadget=%s level=%s damage=%g objectives=%d\n",
                lith_host_menu_art(), lith_host_weapon_name(), lith_host_gadget_name(),
                lith_host_mission_level(), lith_host_weapon_damage(),
                lith_host_objectives_total());
    return 0;
  }

  if (std::strcmp(scenario, "main") == 0) {
    if (!lith_host_confirm()) return fail("confirm-splash");
    if (std::strcmp(lith_host_menu_art(), "main") != 0) return fail("art-main");
    if (lith_host_state() != 1) return fail("still-menu");
    std::printf("main ok art=%s\n", lith_host_menu_art());
    return 0;
  }

  if (std::strcmp(scenario, "single") == 0) {
    lith_host_confirm();
    if (!lith_host_confirm()) return fail("confirm-single");
    if (std::strcmp(lith_host_menu_art(), "single") != 0) return fail("art-single");
    if (lith_host_state() != 1) return fail("still-menu");
    std::printf("single ok art=%s\n", lith_host_menu_art());
    return 0;
  }

  if (std::strcmp(scenario, "play") == 0) {
    lith_host_confirm();
    lith_host_confirm();
    if (!lith_host_confirm()) return fail("start-mission");
    if (lith_host_state() != 3) return fail("gameplay");
    if (std::strcmp(lith_host_menu_art(), "world") != 0) return fail("art-world");
    const float x0 = lith_host_player_x();
    const float z0 = lith_host_player_z();
    lith_host_look(0.25f, 0);
    lith_host_set_controls(1);
    lith_host_tick(0.25f);
    lith_host_set_controls(0);
    if (lith_host_player_x() == x0 && lith_host_player_z() == z0) return fail("move");
    std::printf("play ok art=%s x=%g z=%g yaw=%g\n", lith_host_menu_art(),
                lith_host_player_x(), lith_host_player_z(), lith_host_player_yaw());
    return 0;
  }

  return fail("unknown-scenario");
}
