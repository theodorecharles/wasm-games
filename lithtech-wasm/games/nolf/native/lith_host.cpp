#define _CLIENTBUILD 1
#include "lith_host.h"

typedef int LTBOOL;
#define LTTRUE 1
#define LTFALSE 0
#include "lith_image.h"
#include "lith_rez.h"
#include "rez_probe.h"
#include "world_v66.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

static constexpr int kWidth = 640;
static constexpr int kHeight = 480;
static constexpr uint32_t kInk = 0xff80e0c0u;
static constexpr uint32_t kInkSel = 0xff40ffffu;

enum HostState {
  kLauncher = 0,
  kMenu = 1,
  kLoading = 2,
  kGameplay = 3,
  kPaused = 4,
  kDebrief = 5,
  kCrashed = 6
};

enum Screen { kSplash = 0, kMain = 1, kSingle = 2, kNotice = 3 };

struct MissionInfo {
  std::string tag;
  std::string objectives;
  std::string weapons;
  std::string gadgets;
  std::string level0;
};

struct Host {
  int state = kLauncher;
  Screen screen = kSplash;
  int cursor = 0;
  Screen back_screen = kMain;
  std::string data_dir;
  std::string missions_text;
  std::string weapons_text;
  MissionInfo mission;
  float weapon_damage = 20;
  std::string weapon_name = "P38";
  std::string gadget_name = "Coin";
  int objectives_total = 0;
  uint32_t last_crc = 0;
  LithImage splash;
  LithImage mainmenu;
  LithImage logo;
  LithImage operative;
  LithImage mission_photo;
  LithImage font;
  LithImage floor_tex;
  std::string menu_art = "none";
  std::string notice;
  LithRez rez;
  WorldV66 world;
  float px = 0, py = 64, pz = 0;
  float yaw = 0, pitch = 0;
  uint32_t controls = 0;
};

static Host g;

static std::string field_in_tag(const std::string &text, const std::string &tag,
                               const char *key) {
  const std::string header = "[" + tag + "]";
  auto start = text.find(header);
  if (start == std::string::npos) return {};
  auto stop = text.find("\n[", start + header.size());
  if (stop == std::string::npos) stop = text.size();
  const std::string block = text.substr(start, stop - start);
  auto line = block.find(key);
  while (line != std::string::npos) {
    const bool bound = line == 0 || block[line - 1] == '\n' || block[line - 1] == '\r';
    if (bound) break;
    line = block.find(key, line + 1);
  }
  if (line == std::string::npos) return {};
  auto eq = block.find('=', line);
  if (eq == std::string::npos || eq > line + 64) return {};
  eq += 1;
  while (eq < block.size() && (block[eq] == ' ' || block[eq] == '\t')) ++eq;
  if (eq < block.size() && block[eq] == '"') {
    const auto endq = block.find('"', eq + 1);
    if (endq == std::string::npos) return {};
    return block.substr(eq + 1, endq - eq - 1);
  }
  auto end = block.find_first_of("\n\r", eq);
  if (end == std::string::npos) end = block.size();
  std::string v = block.substr(eq, end - eq);
  while (!v.empty() && (v.back() == ' ' || v.back() == '\t')) v.pop_back();
  return v;
}

static int count_csv(const std::string &s) {
  if (s.empty()) return 0;
  int n = 1;
  for (char c : s) {
    if (c == ',') ++n;
  }
  return n;
}

static float parse_ammo_damage(const std::string &text, const char *ammo) {
  const std::string needle = std::string("Name= \"") + ammo + "\"";
  auto pos = text.find(needle);
  if (pos == std::string::npos) return 20.0f;
  const auto inst = text.find("InstDamage", pos);
  if (inst == std::string::npos || inst > pos + 800) return 20.0f;
  const auto eq = text.find('=', inst);
  if (eq == std::string::npos) return 20.0f;
  return std::strtof(text.c_str() + eq + 1, nullptr);
}

static MissionInfo parse_mission(const std::string &text, const char *tag) {
  MissionInfo m;
  m.tag = tag;
  m.objectives = field_in_tag(text, tag, "ObjectiveIds");
  m.weapons = field_in_tag(text, tag, "DefaultWeapons");
  m.gadgets = field_in_tag(text, tag, "DefaultGadgets");
  m.level0 = field_in_tag(text, tag, "Level0");
  return m;
}

static const char *art_name() {
  switch (g.screen) {
    case kSplash: return "splash";
    case kMain: return "main";
    case kSingle: return "single";
    case kNotice: return "notice";
  }
  return "none";
}

static void show(Screen s, int cursor = 0) {
  g.screen = s;
  g.cursor = cursor;
  g.menu_art = art_name();
}

static void show_notice(const char *text, Screen back) {
  g.notice = text ? text : "";
  g.back_screen = back;
  show(kNotice, 0);
}

static void load_menu_art(const LithRez &rez) {
  std::string bytes;
  if (rez.read_path("MENU/ART/SPLASH", "PCX", &bytes) &&
      lith_decode_pcx(bytes, &g.splash) && g.splash.w >= 320) {
    g.menu_art = "splash";
  }
  bytes.clear();
  if (rez.read_path("MENU/SPRTEX/MAINMENU1", "DTX", &bytes)) {
    lith_decode_dtx32(bytes, &g.mainmenu);
  }
  bytes.clear();
  if (rez.read_path("MENU/SPRTEX/NOLF", "DTX", &bytes)) {
    lith_decode_dtx32(bytes, &g.logo);
  }
  bytes.clear();
  if (rez.read_path("MENU/SPRTEX/OPERATIVE", "DTX", &bytes)) {
    lith_decode_dtx32(bytes, &g.operative);
  }
  bytes.clear();
  if (rez.read_path("INTERFACE/FONTS/FONT_TITLE", "PCX", &bytes)) {
    lith_decode_pcx(bytes, &g.font);
  }
  if (g.menu_art == "none" && g.mainmenu.w > 0) g.menu_art = "main";
}

extern "C" int lith_host_init(const char *data_dir) {
  Host next;
  next.data_dir = data_dir ? data_dir : ".";
  if (!next.rez.open_dir(next.data_dir.c_str())) {
    g.state = kCrashed;
    return 0;
  }
  g = std::move(next);
  if (const auto *probe = g.rez.find("MENU/ART/SPLASH", "PCX")) {
    g.last_crc = nolf_crc32(reinterpret_cast<const uint8_t *>(probe->archive.c_str()),
                            probe->archive.size());
  }
  g.rez.read_path("ATTRIBUTES/MISSIONS", "TXT", &g.missions_text);
  g.rez.read_path("ATTRIBUTES/WEAPONS", "TXT", &g.weapons_text);
  if (g.missions_text.empty()) {
    g.state = kCrashed;
    return 0;
  }
  load_menu_art(g.rez);
  {
    std::string dtx;
    if (g.rez.read_path("TEX/WOOD/WD04/WD0200", "DTX", &dtx) ||
        g.rez.read_path("TEX/WOOD/WD01/WD0004", "DTX", &dtx)) {
      lith_decode_dtx32(dtx, &g.floor_tex);
    }
  }

  const auto mission1 = parse_mission(g.missions_text, "Mission1");
  const auto mission0 = parse_mission(g.missions_text, "Mission0");
  g.mission = !mission1.weapons.empty() ? mission1 : mission0;
  if (!g.mission.weapons.empty()) {
    const auto comma = g.mission.weapons.find(',');
    g.weapon_name = g.mission.weapons.substr(0, comma);
  }
  if (!g.mission.gadgets.empty()) {
    const auto comma = g.mission.gadgets.find(',');
    g.gadget_name = g.mission.gadgets.substr(0, comma);
  }
  g.weapon_damage = parse_ammo_damage(g.weapons_text, "9mm fmj");
  if (g.weapon_damage <= 0) g.weapon_damage = 20;
  g.objectives_total = count_csv(g.mission.objectives);
  if (g.objectives_total <= 0) g.objectives_total = 1;

  std::string photo = field_in_tag(g.missions_text, g.mission.tag, "Photo");
  if (!photo.empty()) {
    std::string bytes;
    if (g.rez.read_path(photo.c_str(), "PCX", &bytes)) {
      lith_decode_pcx(bytes, &g.mission_photo);
    }
  }

  g.state = kMenu;
  show(kSplash);
  return 1;
}

extern "C" void lith_host_shutdown(void) { g = Host{}; }

extern "C" int lith_host_state(void) { return g.state; }

static int confirm() {
  if (g.state != kMenu) return 0;
  if (g.screen == kSplash) {
    show(kMain, 0);
    return 1;
  }
  if (g.screen == kMain) {
    if (g.cursor == 0) {
      show(kSingle, 0);
      return 1;
    }
    if (g.cursor == 1) {
      show_notice("No save game to continue.", kMain);
      return 1;
    }
    if (g.cursor == 2) {
      show_notice("Multiplayer needs the LithTech net host.", kMain);
      return 1;
    }
    if (g.cursor == 3) {
      show_notice("Options need the LithTech 2.1 client shell.", kMain);
      return 1;
    }
    return 1;
  }
  if (g.screen == kSingle) {
    if (g.cursor == 0) {
      std::string level = g.mission.level0.empty() ? "Worlds/M01S01" : g.mission.level0;
      std::string dat;
      if (!g.rez.read_path(level.c_str(), "DAT", &dat)) {
        g.rez.read_path("WORLDS/M01S01", "DAT", &dat);
      }
      if (dat.empty() || !world_v66_load(dat, &g.world)) {
        show_notice("Could not load Worlds/M01S01.DAT", kSingle);
        return 1;
      }
      g.px = g.world.start_x;
      g.py = g.world.start_y + 48;
      g.pz = g.world.start_z;
      g.yaw = g.world.start_yaw;
      g.pitch = 0;
      g.controls = 0;
      g.state = kGameplay;
      g.menu_art = "world";
      return 1;
    }
    if (g.cursor == 1) {
      show_notice("Load game needs the LithTech 2.1 host.", kSingle);
      return 1;
    }
    show(kMain, 0);
    return 1;
  }
  if (g.screen == kNotice) {
    show(g.back_screen, 0);
    return 1;
  }
  return 0;
}

extern "C" int lith_host_confirm(void) { return confirm(); }

extern "C" int lith_host_new_game(void) { return confirm(); }

extern "C" void lith_host_menu_move(int delta) {
  if (g.state != kMenu || delta == 0) return;
  int n = 0;
  if (g.screen == kMain) n = 5;
  else if (g.screen == kSingle) n = 3;
  else return;
  g.cursor = (g.cursor + delta) % n;
  if (g.cursor < 0) g.cursor += n;
}

extern "C" void lith_host_back(void) {
  if (g.state == kGameplay) {
    g.state = kMenu;
    show(kSingle, 0);
    return;
  }
  if (g.state != kMenu) return;
  if (g.screen == kNotice) show(g.back_screen, 0);
  else if (g.screen == kSingle) show(kMain, 0);
  else if (g.screen == kMain) show(kSplash);
}

extern "C" void lith_host_tick(float dt) {
  if (g.state != kGameplay) return;
  if (dt < 0) dt = 0;
  if (dt > 0.1f) dt = 0.1f;
  const int run = (g.controls & (1u << 9)) != 0;
  float speed = run ? 160.0f : 90.0f;
  float fx = std::sin(g.yaw), fz = std::cos(g.yaw);
  float rx = std::cos(g.yaw), rz = -std::sin(g.yaw);
  float mx = 0, mz = 0;
  if (g.controls & 1) { mx += fx; mz += fz; }
  if (g.controls & 2) { mx -= fx; mz -= fz; }
  if (g.controls & 4) { mx += rx; mz += rz; }
  if (g.controls & 8) { mx -= rx; mz -= rz; }
  const float mag = std::sqrt(mx * mx + mz * mz);
  if (mag > 0) {
    g.px += mx / mag * speed * dt;
    g.pz += mz / mag * speed * dt;
  }
  g.px = std::min(g.world.maxx - 24, std::max(g.world.minx + 24, g.px));
  g.pz = std::min(g.world.maxz - 24, std::max(g.world.minz + 24, g.pz));
  g.py = g.world.start_y + 48;
}

extern "C" void lith_host_look(float yaw_delta, float pitch_delta) {
  if (g.state != kGameplay) return;
  g.yaw += yaw_delta;
  g.pitch += pitch_delta;
  if (g.pitch < -1.2f) g.pitch = -1.2f;
  if (g.pitch > 1.2f) g.pitch = 1.2f;
}

extern "C" void lith_host_set_controls(uint32_t flags) { g.controls = flags; }
extern "C" int lith_host_fire(void) { return 0; }
extern "C" int lith_host_gadget(void) { return 0; }

extern "C" float lith_host_player_x(void) { return g.px; }
extern "C" float lith_host_player_y(void) { return g.py; }
extern "C" float lith_host_player_z(void) { return g.pz; }
extern "C" float lith_host_player_yaw(void) { return g.yaw; }
extern "C" float lith_host_player_pitch(void) { return g.pitch; }
extern "C" float lith_host_player_health(void) { return 100; }
extern "C" float lith_host_enemy_health(void) { return 0; }
extern "C" int lith_host_enemy_alert(void) { return 0; }
extern "C" int lith_host_enemy_dead(void) { return 0; }
extern "C" int lith_host_player_dead(void) { return 0; }
extern "C" int lith_host_objectives_total(void) { return g.objectives_total; }
extern "C" int lith_host_objectives_done(void) { return 0; }
extern "C" int lith_host_mission_failed(void) { return 0; }
extern "C" int lith_host_mission_success(void) { return 0; }
extern "C" float lith_host_weapon_damage(void) { return g.weapon_damage; }
extern "C" const char *lith_host_weapon_name(void) { return g.weapon_name.c_str(); }
extern "C" const char *lith_host_gadget_name(void) { return g.gadget_name.c_str(); }
extern "C" const char *lith_host_mission_level(void) { return g.mission.level0.c_str(); }
extern "C" uint32_t lith_host_last_crc(void) { return g.last_crc; }
extern "C" int lith_host_frame_width(void) { return kWidth; }
extern "C" int lith_host_frame_height(void) { return kHeight; }
extern "C" const char *lith_host_menu_art(void) { return g.menu_art.c_str(); }

extern "C" int lith_host_save(const char *) { return 0; }
extern "C" int lith_host_load(const char *) { return 0; }

static uint32_t pack(int r, int gch, int b) {
  return uint32_t(r) | (uint32_t(gch) << 8) | (uint32_t(b) << 16) | 0xff000000u;
}

static void draw_chrome(uint32_t *pixels, int width, int height) {
  if (g.mainmenu.w > 0) lith_scale_blit(pixels, width, height, g.mainmenu);
  else {
    for (int i = 0; i < width * height; ++i) pixels[i] = pack(220, 140, 20);
  }
  if (g.logo.w > 0) {
    lith_blit(pixels, width, height, g.logo, width - g.logo.w - 8, 8, true);
  }
  if (g.operative.w > 0) {
    lith_blit(pixels, width, height, g.operative, width - g.operative.w - 24, 200, true);
  }
}

static void item(uint32_t *pixels, int width, int height, const char *label, int x, int y,
                 int index) {
  const uint32_t color = index == g.cursor ? kInkSel : kInk;
  if (index == g.cursor) {
    lith_fill(pixels, width, height, x - 8, y - 2, 220, 22, pack(40, 30, 8));
  }
  lith_draw_text(pixels, width, height, g.font, label, x, y, color);
}

static void draw_notice(uint32_t *pixels, int width, int height) {
  draw_chrome(pixels, width, height);
  lith_fill(pixels, width, height, 40, 130, 360, 180, pack(16, 12, 8));
  if (g.mission_photo.w > 0) {
    lith_blit(pixels, width, height, g.mission_photo, 400, 140, false);
  }
  int y = 146;
  std::string line;
  for (size_t i = 0; i <= g.notice.size(); ++i) {
    if (i == g.notice.size() || g.notice[i] == '\n') {
      lith_draw_text(pixels, width, height, g.font, line.c_str(), 52, y, kInk);
      y += 22;
      line.clear();
    } else {
      line.push_back(g.notice[i]);
    }
  }
}

static void fill_tri(uint32_t *pix, float *zbuf, int w, int h, const float sx[3],
                     const float sy[3], const float sz[3], uint32_t color) {
  int minx = std::max(0, (int)std::floor(std::min(std::min(sx[0], sx[1]), sx[2])));
  int maxx = std::min(w - 1, (int)std::ceil(std::max(std::max(sx[0], sx[1]), sx[2])));
  int miny = std::max(0, (int)std::floor(std::min(std::min(sy[0], sy[1]), sy[2])));
  int maxy = std::min(h - 1, (int)std::ceil(std::max(std::max(sy[0], sy[1]), sy[2])));
  const float a = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2]);
  if (std::fabs(a) < 1e-3f) return;
  const float ia = 1.0f / a;
  for (int y = miny; y <= maxy; ++y) {
    for (int x = minx; x <= maxx; ++x) {
      const float px = x + 0.5f, py = y + 0.5f;
      const float w0 = ((sy[1] - sy[2]) * (px - sx[2]) + (sx[2] - sx[1]) * (py - sy[2])) * ia;
      const float w1 = ((sy[2] - sy[0]) * (px - sx[2]) + (sx[0] - sx[2]) * (py - sy[2])) * ia;
      const float w2 = 1.0f - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const float z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];
      if (z < 8.0f) continue;
      const int i = y * w + x;
      if (z >= zbuf[i]) continue;
      zbuf[i] = z;
      pix[i] = color;
    }
  }
}

static bool project(float x, float y, float z, int w, int h, float *ox, float *oy,
                    float *oz) {
  const float s = std::sin(g.yaw), c = std::cos(g.yaw);
  const float cx = x - g.px, cy = y - g.py, cz = z - g.pz;
  const float rx = cx * c - cz * s;
  float rz = cx * s + cz * c;
  const float sp = std::sin(g.pitch), cp = std::cos(g.pitch);
  const float ry = cy * cp - rz * sp;
  rz = cy * sp + rz * cp;
  if (rz < 8.0f) return false;
  const float f = w * 0.72f;
  *ox = w * 0.5f + rx * f / rz;
  *oy = h * 0.5f - ry * f / rz;
  *oz = rz;
  return true;
}

static void render_world(uint32_t *pixels, int width, int height) {
  const uint32_t sky = pack(92, 102, 118);
  for (int i = 0; i < width * height; ++i) pixels[i] = sky;
  std::vector<float> zbuf(size_t(width) * size_t(height), 1.0e9f);
  const float lx = 0.35f, ly = 0.85f, lz = 0.4f;
  for (const auto &t : g.world.tris) {
    float e1x = t.x[1] - t.x[0], e1y = t.y[1] - t.y[0], e1z = t.z[1] - t.z[0];
    float e2x = t.x[2] - t.x[0], e2y = t.y[2] - t.y[0], e2z = t.z[2] - t.z[0];
    float nx = e1y * e2z - e1z * e2y;
    float ny = e1z * e2x - e1x * e2z;
    float nz = e1x * e2y - e1y * e2x;
    const float nl = std::sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-4f) continue;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const float to_cx = g.px - t.x[0], to_cy = g.py - t.y[0], to_cz = g.pz - t.z[0];
    if (nx * to_cx + ny * to_cy + nz * to_cz <= 0) continue;
    float sx[3], sy[3], sz[3];
    bool ok = true;
    for (int i = 0; i < 3; ++i) {
      if (!project(t.x[i], t.y[i], t.z[i], width, height, &sx[i], &sy[i], &sz[i])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    float shade = 0.22f + 0.78f * std::max(0.0f, nx * lx + ny * ly + nz * lz);
    int r = int(40 + 90 * shade + 40 * (ny * 0.5f + 0.5f));
    int gc = int(36 + 80 * shade + 20 * (ny * 0.5f + 0.5f));
    int b = int(30 + 60 * shade);
    if (r > 255) r = 255;
    if (gc > 255) gc = 255;
    if (b > 255) b = 255;
    fill_tri(pixels, zbuf.data(), width, height, sx, sy, sz, pack(r, gc, b));
  }
  lith_fill(pixels, width, height, 0, height - 28, width, 28, pack(10, 8, 6));
  lith_draw_text(pixels, width, height, g.font, "MISFORTUNE IN MOROCCO", 8, height - 24,
                 kInk);
}

extern "C" void lith_host_render(uint32_t *pixels, int width, int height) {
  if (!pixels || width < 2 || height < 2) return;
  if (g.state == kGameplay) {
    render_world(pixels, width, height);
    return;
  }
  if (g.screen == kSplash && g.splash.w > 0) {
    if (g.splash.w == width && g.splash.h == height) {
      std::memcpy(pixels, g.splash.rgba.data(),
                  size_t(width) * size_t(height) * sizeof(uint32_t));
    } else {
      lith_scale_blit(pixels, width, height, g.splash);
    }
    return;
  }
  if (g.screen == kNotice) {
    draw_notice(pixels, width, height);
    return;
  }
  draw_chrome(pixels, width, height);
  if (g.screen == kMain) {
    // Official FolderMain positions from Attributes/Layout.txt.
    item(pixels, width, height, "Single player", 54, 148, 0);
    item(pixels, width, height, "Continue", 54, 180, 1);
    item(pixels, width, height, "Multiplayer", 54, 212, 2);
    item(pixels, width, height, "Options", 54, 244, 3);
    item(pixels, width, height, "Quit", 54, 276, 4);
    return;
  }
  if (g.screen == kSingle) {
    lith_draw_text(pixels, width, height, g.font, "SINGLE PLAYER", 52, 18, kInk);
    item(pixels, width, height, "Select mission", 54, 148, 0);
    item(pixels, width, height, "Load game", 54, 180, 1);
    item(pixels, width, height, "Back", 54, 212, 2);
  }
}
