#include "lith_host.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
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
    std::printf("render ok painted=%d bbox=%d,%d-%d,%d\n", painted, minx, miny, maxx, maxy);
    return 0;
  }

  if (std::strcmp(scenario, "menu") == 0) {
    std::printf("state=menu weapon=%s gadget=%s level=%s damage=%g objectives=%d\n",
                lith_host_weapon_name(), lith_host_gadget_name(),
                lith_host_mission_level(), lith_host_weapon_damage(),
                lith_host_objectives_total());
    return 0;
  }

  if (!lith_host_new_game()) return fail("new_game");
  if (lith_host_state() != 3) return fail("gameplay");

  if (std::strcmp(scenario, "look-move") == 0) {
    const float x0 = lith_host_player_x();
    const float z0 = lith_host_player_z();
    const float yaw0 = lith_host_player_yaw();
    lith_host_look(0.35f, -0.1f);
    lith_host_set_controls(1u /* BC_CFLG_FORWARD */);
    lith_host_tick(0.25f);
    lith_host_set_controls(0);
    if (lith_host_player_yaw() == yaw0) return fail("look");
    if (lith_host_player_x() == x0 && lith_host_player_z() == z0) return fail("move");
    std::printf("look-move ok yaw=%g dx=%g dz=%g\n", lith_host_player_yaw() - yaw0,
                lith_host_player_x() - x0, lith_host_player_z() - z0);
    return 0;
  }

  if (std::strcmp(scenario, "fire-gadget") == 0) {
    lith_host_look(1.570796f, 0);
    const float before = lith_host_enemy_health();
    const float dmg = lith_host_weapon_damage();
    const int hit = lith_host_fire();
    const float after = lith_host_enemy_health();
    if (!hit) return fail("fire-miss");
    if (after >= before) return fail("fire-damage");
    if (std::fabs((before - after) - dmg) > 0.01f) return fail("fire-official-damage");
    if (!lith_host_gadget()) return fail("gadget");
    if (!lith_host_enemy_alert()) return fail("gadget-alert");
    std::printf("fire-gadget ok dmg=%g enemy=%g->%g weapon=%s gadget=%s\n",
                dmg, before, after, lith_host_weapon_name(), lith_host_gadget_name());
    return 0;
  }

  if (std::strcmp(scenario, "detect-death") == 0) {
    lith_host_set_controls(1u << 9);  // official run flag: noisy footsteps
    lith_host_tick(0.05f);
    if (!lith_host_enemy_alert()) return fail("detect");
    lith_host_set_controls(0);
    for (int i = 0; i < 400 && !lith_host_player_dead(); ++i) lith_host_tick(0.05f);
    if (!lith_host_player_dead() || !lith_host_mission_failed()) return fail("death");
    std::printf("detect-death ok hp=%g failed=%d\n", lith_host_player_health(),
                lith_host_mission_failed());
    return 0;
  }

  if (std::strcmp(scenario, "objective-save") == 0) {
    lith_host_look(1.5708f, 0);
    while (lith_host_enemy_health() > 0) {
      if (!lith_host_fire()) return fail("objective-fire");
    }
    lith_host_tick(0.016f);
    if (!lith_host_mission_success() || lith_host_objectives_done() <= 0)
      return fail("objectives");
    const char *save = "/tmp/grok-goal-41adbeadfe81/implementer/nolf-save.txt";
    if (!lith_host_save(save)) return fail("save");
    const float hp = lith_host_player_health();
    const int done = lith_host_objectives_done();
    lith_host_new_game();
    if (lith_host_mission_success()) return fail("reset");
    if (!lith_host_load(save)) return fail("load");
    if (!lith_host_mission_success() || lith_host_objectives_done() != done)
      return fail("reload-objectives");
    if (std::fabs(lith_host_player_health() - hp) > 0.01f) return fail("reload-hp");
    std::printf("objective-save ok done=%d/%d hp=%g\n", done, lith_host_objectives_total(), hp);
    return 0;
  }

  return fail("unknown-scenario");
}
