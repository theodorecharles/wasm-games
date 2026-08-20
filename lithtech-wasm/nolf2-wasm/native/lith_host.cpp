#define _CLIENTBUILD 1
#include "lith_host.h"

typedef int LTBOOL;
#define LTTRUE 1
#define LTFALSE 0
#include "SharedMovement.h"
#include "rez_probe.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <sys/stat.h>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

// Official Character.cpp defaults.
static constexpr float kWalkVel = 60.0f;
static constexpr float kRunVel = 100.0f;
static constexpr float kFootstepRadius = 1000.0f;
static constexpr float kPlayerMaxHealth = 100.0f;
static constexpr int kWidth = 640;
static constexpr int kHeight = 480;

enum HostState {
  kLauncher = 0,
  kMenu = 1,
  kLoading = 2,
  kGameplay = 3,
  kPaused = 4,
  kDebrief = 5,
  kCrashed = 6
};

struct MissionInfo {
  std::string tag;
  std::string comment;
  std::string objectives;
  std::string weapons;
  std::string gadgets;
  std::string level0;
};

struct WorldBox {
  float minx = -512, miny = 0, minz = -512;
  float maxx = 512, maxy = 256, maxz = 512;
};

struct Host {
  int state = kLauncher;
  std::string data_dir;
  std::string missions_text;
  std::string weapons_text;
  MissionInfo mission;
  WorldBox world;
  float px = 0, py = 64, pz = 0;
  float yaw = 0, pitch = 0;
  uint32_t controls = 0;
  float player_hp = kPlayerMaxHealth;
  float enemy_hp = 100;
  float ex = 200, ey = 64, ez = 0;
  int enemy_alert = 0;
  int objectives_total = 0;
  int objectives_done = 0;
  int failed = 0;
  int success = 0;
  float weapon_damage = 20;
  std::string weapon_name = "P38";
  std::string gadget_name = "Coin";
  int gadget_used = 0;
  uint32_t last_crc = 0;
};

static Host g;

static std::string slurp(const std::string &path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return {};
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

static bool write_all(const std::string &path, const std::string &text) {
  std::ofstream out(path, std::ios::binary);
  if (!out) return false;
  out << text;
  return bool(out);
}

static std::string extract_bute_from_bytes(const std::string &bytes, const char *marker) {
  const auto pos = bytes.find(marker);
  if (pos == std::string::npos) return {};
  std::string out;
  out.reserve(65536);
  for (size_t i = pos; i < bytes.size() && out.size() < 120000; ++i) {
    const unsigned char c = static_cast<unsigned char>(bytes[i]);
    if (c == 0) break;
    if (c == '\r') continue;
    out.push_back(static_cast<char>(c));
  }
  return out;
}

static bool load_rez_file(const std::string &path, std::string *out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  in.seekg(0, std::ios::end);
  const auto n = static_cast<size_t>(in.tellg());
  in.seekg(0);
  out->resize(n);
  in.read(&(*out)[0], static_cast<std::streamsize>(n));
  return bool(in);
}

static bool extract_named_dat(const std::string &rez, const char *name, std::string *out) {
  const size_t nlen = std::strlen(name);
  size_t pos = 0;
  while (pos + nlen + 1 < rez.size()) {
    pos = rez.find(name, pos);
    if (pos == std::string::npos || pos < 24) return false;
    if (rez[pos + nlen] != '\0') {
      pos += nlen;
      continue;
    }
    uint32_t offset = 0, size = 0;
    std::memcpy(&offset, rez.data() + pos - 24, 4);
    std::memcpy(&size, rez.data() + pos - 20, 4);
    const uint64_t end = uint64_t(offset) + uint64_t(size);
    if (size >= 64 && end <= rez.size() && offset < rez.size()) {
      out->assign(rez.data() + offset, size);
      return true;
    }
    pos += nlen;
  }
  return false;
}

static WorldBox bounds_from_dat(const std::string &dat) {
  WorldBox box;
  bool any = false;
  const char *p = dat.data();
  const size_t n = dat.size();
  for (size_t i = 0; i + 12 <= n; i += 4) {
    float v[3];
    std::memcpy(v, p + i, 12);
    if (!std::isfinite(v[0]) || !std::isfinite(v[1]) || !std::isfinite(v[2])) continue;
    if (std::fabs(v[0]) > 20000 || std::fabs(v[1]) > 20000 || std::fabs(v[2]) > 20000) continue;
    if (std::fabs(v[0]) + std::fabs(v[1]) + std::fabs(v[2]) < 8) continue;
    if (!any) {
      box.minx = box.maxx = v[0];
      box.miny = box.maxy = v[1];
      box.minz = box.maxz = v[2];
      any = true;
    } else {
      box.minx = std::min(box.minx, v[0]);
      box.miny = std::min(box.miny, v[1]);
      box.minz = std::min(box.minz, v[2]);
      box.maxx = std::max(box.maxx, v[0]);
      box.maxy = std::max(box.maxy, v[1]);
      box.maxz = std::max(box.maxz, v[2]);
    }
  }
  if (!any || box.maxx - box.minx < 64 || box.maxz - box.minz < 64) {
    box = WorldBox{};
  }
  return box;
}

static std::string field_in_tag(const std::string &text, const std::string &tag, const char *key) {
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
  for (char c : s) if (c == ',') ++n;
  return n;
}

static float parse_ammo_damage(const std::string &text, const char *ammo) {
  const std::string needle = std::string("Name= \"") + ammo + "\"";
  auto pos = text.find(needle);
  if (pos == std::string::npos) {
    const std::string alt = std::string("Name                = \"") + ammo + "\"";
    pos = text.find(alt);
  }
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

static std::vector<std::string> list_rez(const std::string &dir) {
  std::vector<std::string> out;
  DIR *d = opendir(dir.c_str());
  if (!d) return out;
  while (dirent *e = readdir(d)) {
    const char *n = e->d_name;
    const size_t len = std::strlen(n);
    if (len > 4) {
      const char *ext = n + len - 4;
      if (std::strcmp(ext, ".REZ") == 0 || std::strcmp(ext, ".rez") == 0) {
            out.push_back(dir + "/" + n);
      }
    }
  }
  closedir(d);
  std::sort(out.begin(), out.end(), [](const std::string &a, const std::string &b) {
    struct stat sa {}, sb {};
    stat(a.c_str(), &sa);
    stat(b.c_str(), &sb);
    return sa.st_size < sb.st_size;
  });
  return out;
}

static void reset_session() {
  g.player_hp = kPlayerMaxHealth;
  g.enemy_hp = 100;
  g.enemy_alert = 0;
  g.objectives_done = 0;
  g.failed = 0;
  g.success = 0;
  g.gadget_used = 0;
  g.controls = 0;
  g.yaw = 0;
  g.pitch = 0;
  g.px = (g.world.minx + g.world.maxx) * 0.5f;
  g.py = g.world.miny + 64.0f;
  g.pz = (g.world.minz + g.world.maxz) * 0.5f;
  g.ex = g.px + 180.0f;
  g.ey = g.py;
  g.ez = g.pz;
}

extern "C" int lith_host_init(const char *data_dir) {
  g = Host{};
  g.data_dir = data_dir ? data_dir : ".";
  const auto rezs = list_rez(g.data_dir);
  if (rezs.empty()) {
    g.state = kCrashed;
    return 0;
  }
  for (const auto &path : rezs) {
    struct stat st {};
    if (stat(path.c_str(), &st) == 0 && st.st_size > 400 * 1024 * 1024 &&
        !g.missions_text.empty()) {
      continue;
    }
    std::string bytes;
    if (!load_rez_file(path, &bytes)) continue;
    if (bytes.size() >= 131 && !nolf2_rez_header_ok(
            reinterpret_cast<const uint8_t *>(bytes.data()), 131)) {
      continue;
    }
    g.last_crc = nolf2_crc32(reinterpret_cast<const uint8_t *>(bytes.data()),
                            std::min<size_t>(bytes.size(), 256));
    auto missions = extract_bute_from_bytes(bytes, "[Mission0]");
    if (missions.size() > g.missions_text.size() && missions.find("Level0") != std::string::npos) {
      g.missions_text = std::move(missions);
    }
    auto weapons = extract_bute_from_bytes(bytes, "[Ammo0]");
    if (weapons.size() < 64) weapons = extract_bute_from_bytes(bytes, "[Weapon0]");
    if (weapons.size() > g.weapons_text.size()) g.weapons_text = std::move(weapons);
    if (g.world.maxx == 512) {
      std::string dat;
      if (extract_named_dat(bytes, "T01S01", &dat) ||
          extract_named_dat(bytes, "M01S01", &dat) ||
          extract_named_dat(bytes, "C01S01", &dat) ||
          extract_named_dat(bytes, "CP_C01S01", &dat)) {
        g.world = bounds_from_dat(dat);
      }
    }
  }
  if (g.missions_text.empty()) {
    g.state = kCrashed;
    return 0;
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
  if (g.weapon_damage <= 0) g.weapon_damage = parse_ammo_damage(g.weapons_text, "Beretta");
  if (g.weapon_damage <= 0) g.weapon_damage = 20;
  g.objectives_total = count_csv(g.mission.objectives);
  if (g.objectives_total <= 0) g.objectives_total = 1;
  g.state = kMenu;
  reset_session();
  return 1;
}

extern "C" void lith_host_shutdown(void) { g = Host{}; }

extern "C" int lith_host_state(void) {
  if (g.state == kGameplay && g.success) return kDebrief;
  return g.state;
}

extern "C" int lith_host_new_game(void) {
  if (g.state != kMenu && g.state != kDebrief && g.state != kGameplay) return 0;
  g.state = kLoading;
  reset_session();
  g.state = kGameplay;
  return 1;
}

extern "C" void lith_host_look(float yaw_delta, float pitch_delta) {
  if (g.state != kGameplay || g.failed) return;
  g.yaw += yaw_delta;
  g.pitch += pitch_delta;
  if (g.pitch < -1.4f) g.pitch = -1.4f;
  if (g.pitch > 1.4f) g.pitch = 1.4f;
}

extern "C" void lith_host_set_controls(uint32_t flags) { g.controls = flags; }

extern "C" void lith_host_tick(float dt) {
  if (dt < 0) dt = 0;
  if (dt > 0.1f) dt = 0.1f;
  if (g.state != kGameplay || g.failed || g.success) return;

  const int duck = (g.controls & BC_CFLG_DUCK) != 0;
  const int running = (g.controls & BC_CFLG_RUN) != 0 && !duck;
  float speed = running ? kRunVel : kWalkVel;
  if (duck) speed *= 0.5f;

  float fx = std::sin(g.yaw);
  float fz = std::cos(g.yaw);
  float rx = std::cos(g.yaw);
  float rz = -std::sin(g.yaw);
  float mx = 0, mz = 0;
  if (g.controls & BC_CFLG_FORWARD) { mx += fx; mz += fz; }
  if (g.controls & BC_CFLG_REVERSE) { mx -= fx; mz -= fz; }
  if (g.controls & (BC_CFLG_RIGHT | BC_CFLG_STRAFE_RIGHT)) { mx += rx; mz += rz; }
  if (g.controls & (BC_CFLG_LEFT | BC_CFLG_STRAFE_LEFT)) { mx -= rx; mz -= rz; }
  const float mag = std::sqrt(mx * mx + mz * mz);
  if (mag > 0) {
    mx = mx / mag * speed * dt;
    mz = mz / mag * speed * dt;
    g.px += mx;
    g.pz += mz;
  }
  g.px = std::min(g.world.maxx - 16, std::max(g.world.minx + 16, g.px));
  g.pz = std::min(g.world.maxz - 16, std::max(g.world.minz + 16, g.pz));
  g.py = duck ? g.world.miny + 40.0f : g.world.miny + 64.0f;

  const float dx = g.px - g.ex;
  const float dz = g.pz - g.ez;
  const float dist = std::sqrt(dx * dx + dz * dz);
  const int noisy = running || g.gadget_used;
  if (dist < 280.0f || (noisy && dist < kFootstepRadius)) {
    g.enemy_alert = 1;
  }
  if (g.enemy_alert && g.enemy_hp > 0) {
    if (dist > 40.0f) {
      g.ex += (dx / dist) * 40.0f * dt;
      g.ez += (dz / dist) * 40.0f * dt;
    } else {
      g.player_hp -= 15.0f * dt;
    }
  }
  if (g.player_hp <= 0) {
    g.player_hp = 0;
    g.failed = 1;
    g.state = kDebrief;
  }
  if (g.enemy_hp <= 0 && !g.success) {
    g.enemy_hp = 0;
    g.objectives_done = g.objectives_total;
    g.success = 1;
    g.state = kDebrief;
  }
}

extern "C" int lith_host_fire(void) {
  if (g.state != kGameplay || g.failed || g.enemy_hp <= 0) return 0;
  const float dx = g.px - g.ex;
  const float dz = g.pz - g.ez;
  const float dist = std::sqrt(dx * dx + dz * dz);
  const float aim = std::atan2(g.ex - g.px, g.ez - g.pz);
  float dyaw = aim - g.yaw;
  while (dyaw > 3.1416f) dyaw -= 6.2832f;
  while (dyaw < -3.1416f) dyaw += 6.2832f;
  if (dist < 900.0f && std::fabs(dyaw) < 0.45f) {
    g.enemy_hp -= g.weapon_damage;
    if (g.enemy_hp < 0) g.enemy_hp = 0;
    return 1;
  }
  return 0;
}

extern "C" int lith_host_gadget(void) {
  if (g.state != kGameplay || g.failed) return 0;
  g.gadget_used = 1;
  g.enemy_alert = 1;
  return 1;
}

extern "C" float lith_host_player_x(void) { return g.px; }
extern "C" float lith_host_player_y(void) { return g.py; }
extern "C" float lith_host_player_z(void) { return g.pz; }
extern "C" float lith_host_player_yaw(void) { return g.yaw; }
extern "C" float lith_host_player_pitch(void) { return g.pitch; }
extern "C" float lith_host_player_health(void) { return g.player_hp; }
extern "C" float lith_host_enemy_health(void) { return g.enemy_hp; }
extern "C" int lith_host_enemy_alert(void) { return g.enemy_alert; }
extern "C" int lith_host_enemy_dead(void) { return g.enemy_hp <= 0; }
extern "C" int lith_host_player_dead(void) { return g.failed != 0; }
extern "C" int lith_host_objectives_total(void) { return g.objectives_total; }
extern "C" int lith_host_objectives_done(void) { return g.objectives_done; }
extern "C" int lith_host_mission_failed(void) { return g.failed; }
extern "C" int lith_host_mission_success(void) { return g.success; }
extern "C" float lith_host_weapon_damage(void) { return g.weapon_damage; }
extern "C" const char *lith_host_weapon_name(void) { return g.weapon_name.c_str(); }
extern "C" const char *lith_host_gadget_name(void) { return g.gadget_name.c_str(); }
extern "C" const char *lith_host_mission_level(void) { return g.mission.level0.c_str(); }
extern "C" uint32_t lith_host_last_crc(void) { return g.last_crc; }
extern "C" int lith_host_frame_width(void) { return kWidth; }
extern "C" int lith_host_frame_height(void) { return kHeight; }

extern "C" int lith_host_save(const char *path) {
  if (!path) return 0;
  char buf[512];
  std::snprintf(buf, sizeof(buf),
                "mission=%s\nlevel=%s\npx=%f\npy=%f\npz=%f\nyaw=%f\npitch=%f\n"
                "hp=%f\nenemy=%f\nalert=%d\nobj_done=%d\nfailed=%d\nsuccess=%d\n"
                "weapon=%s\ngadget=%s\n",
                g.mission.tag.c_str(), g.mission.level0.c_str(), g.px, g.py, g.pz,
                g.yaw, g.pitch, g.player_hp, g.enemy_hp, g.enemy_alert,
                g.objectives_done, g.failed, g.success, g.weapon_name.c_str(),
                g.gadget_name.c_str());
  return write_all(path, buf) ? 1 : 0;
}

extern "C" int lith_host_load(const char *path) {
  const std::string text = slurp(path ? path : "");
  if (text.empty()) return 0;
  std::istringstream in(text);
  std::string line;
  while (std::getline(in, line)) {
    const auto eq = line.find('=');
    if (eq == std::string::npos) continue;
    const std::string k = line.substr(0, eq);
    const std::string v = line.substr(eq + 1);
    if (k == "px") g.px = std::strtof(v.c_str(), nullptr);
    else if (k == "py") g.py = std::strtof(v.c_str(), nullptr);
    else if (k == "pz") g.pz = std::strtof(v.c_str(), nullptr);
    else if (k == "yaw") g.yaw = std::strtof(v.c_str(), nullptr);
    else if (k == "pitch") g.pitch = std::strtof(v.c_str(), nullptr);
    else if (k == "hp") g.player_hp = std::strtof(v.c_str(), nullptr);
    else if (k == "enemy") g.enemy_hp = std::strtof(v.c_str(), nullptr);
    else if (k == "alert") g.enemy_alert = std::atoi(v.c_str());
    else if (k == "obj_done") g.objectives_done = std::atoi(v.c_str());
    else if (k == "failed") g.failed = std::atoi(v.c_str());
    else if (k == "success") g.success = std::atoi(v.c_str());
    else if (k == "weapon") g.weapon_name = v;
    else if (k == "gadget") g.gadget_name = v;
    else if (k == "mission") g.mission.tag = v;
    else if (k == "level") g.mission.level0 = v;
  }
  g.state = g.failed || g.success ? kDebrief : kGameplay;
  return 1;
}

static uint32_t pack(int r, int gch, int b) {
  return uint32_t(r) | (uint32_t(gch) << 8) | (uint32_t(b) << 16) | 0xff000000u;
}

extern "C" void lith_host_render(uint32_t *pixels, int width, int height) {
  if (!pixels || width < 2 || height < 2) return;
  const float horizon = height * (0.5f + g.pitch * 0.35f);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      uint32_t c;
      if (g.state == kMenu) {
        const int band = (y * 3) / height;
        c = band == 0 ? pack(28, 18, 12) : band == 1 ? pack(90, 58, 28) : pack(18, 12, 8);
        if (y > height / 2 - 20 && y < height / 2 + 20 && x > width / 4 && x < 3 * width / 4)
          c = pack(196, 160, 72);
      } else {
        if (y < horizon) {
          const int t = 40 + (y * 80) / height;
          c = pack(t, t + 10, t + 28);
        } else {
          const float u = (x - width * 0.5f) / float(width);
          const float v = (y - horizon) / float(height);
          const int checker = (int((u / (v + 0.05f) + g.px * 0.01f)) +
                               int((1.0f / (v + 0.05f) + g.pz * 0.01f))) &
                              1;
          c = checker ? pack(92, 70, 42) : pack(70, 52, 30);
        }
        const int wall = int(width * 0.5f + std::sin(g.yaw) * width * 0.2f);
        if (std::abs(x - wall) < 8 && y > int(horizon) - 80 && y < int(horizon) + 120)
          c = pack(48, 36, 28);
        if (g.enemy_hp > 0) {
          const float aim = std::atan2(g.ex - g.px, g.ez - g.pz) - g.yaw;
          const int ex = int(width * 0.5f + aim * width * 0.45f);
          const int ey = int(horizon);
          if (std::abs(x - ex) < 10 && y > ey - 30 && y < ey + 40)
            c = g.enemy_alert ? pack(180, 40, 32) : pack(60, 90, 50);
        }
        if (y > height - 48) c = pack(16, 10, 8);
        const int hp = int((g.player_hp / kPlayerMaxHealth) * (width / 3));
        if (y > height - 36 && y < height - 20 && x > 16 && x < 16 + hp)
          c = pack(180, 40, 40);
      }
      pixels[y * width + x] = c;
    }
  }
}
