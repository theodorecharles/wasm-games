#include "world_v66.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

namespace {

struct Stream {
  const uint8_t *p = nullptr;
  size_t n = 0;
  size_t o = 0;
  bool fail = false;

  bool need(size_t k) {
    if (fail || o + k > n) {
      fail = true;
      return false;
    }
    return true;
  }
  uint8_t u8() {
    if (!need(1)) return 0;
    return p[o++];
  }
  uint16_t u16() {
    if (!need(2)) return 0;
    uint16_t v;
    std::memcpy(&v, p + o, 2);
    o += 2;
    return v;
  }
  uint32_t u32() {
    if (!need(4)) return 0;
    uint32_t v;
    std::memcpy(&v, p + o, 4);
    o += 4;
    return v;
  }
  float f32() {
    if (!need(4)) return 0;
    float v;
    std::memcpy(&v, p + o, 4);
    o += 4;
    return v;
  }
};

bool parse_bsp(const std::string &dat, size_t name_off, std::vector<WorldTri> *tris,
               float *minx, float *miny, float *minz, float *maxx, float *maxy,
               float *maxz) {
  if (name_off < 2 || name_off >= dat.size()) return false;
  Stream s;
  s.p = reinterpret_cast<const uint8_t *>(dat.data());
  s.n = dat.size();
  uint16_t nlen = 0;
  std::memcpy(&nlen, s.p + name_off - 2, 2);
  if (nlen == 0 || nlen > 64 || name_off + nlen > dat.size()) return false;
  s.o = name_off + nlen;

  const uint32_t n_points = s.u32();
  const uint32_t n_planes = s.u32();
  const uint32_t n_surfaces = s.u32();
  const uint32_t n_portals = s.u32();
  const uint32_t n_polys = s.u32();
  const uint32_t n_leafs = s.u32();
  s.u32();  // n_verts
  s.u32();  // vis
  s.u32();  // leaf lists
  const uint32_t n_nodes = s.u32();
  s.u32();
  s.u32();
  if (s.fail || n_points < 8 || n_points > 200000 || n_polys < 4 || n_polys > 200000)
    return false;

  const float mn0 = s.f32(), mn1 = s.f32(), mn2 = s.f32();
  const float mx0 = s.f32(), mx1 = s.f32(), mx2 = s.f32();
  s.f32();
  s.f32();
  s.f32();
  const uint32_t tex_len = s.u32();
  s.u32();
  if (s.fail || !s.need(tex_len)) return false;
  s.o += tex_len;

  std::vector<uint8_t> counts(n_polys);
  for (uint32_t i = 0; i < n_polys; ++i) {
    const uint8_t c = s.u8();
    const uint8_t e = s.u8();
    counts[i] = static_cast<uint8_t>(c + e);
    if (counts[i] < 3 || counts[i] > 32) return false;
  }

  for (uint32_t i = 0; i < n_leafs && !s.fail; ++i) {
    const uint16_t lc = s.u16();
    if (lc == 0xFFFF) {
      s.u16();
    } else {
      for (uint16_t k = 0; k < lc; ++k) {
        s.u16();
        const uint16_t sz = s.u16();
        if (!s.need(sz)) return false;
        s.o += sz;
      }
    }
    const uint32_t pc = s.u32();
    if (!s.need(pc * 4u + 4u)) return false;
    s.o += pc * 4u + 4u;
  }

  if (!s.need(n_planes * 16u)) return false;
  s.o += n_planes * 16u;

  for (uint32_t i = 0; i < n_surfaces && !s.fail; ++i) {
    if (!s.need(36 + 2 + 4 + 4 + 4 + 1)) return false;
    s.o += 36 + 2 + 4 + 4 + 4;
    const uint8_t use = s.u8();
    if (use == 1) {
      const uint16_t a = s.u16();
      if (!s.need(a)) return false;
      s.o += a;
      const uint16_t b = s.u16();
      if (!s.need(b)) return false;
      s.o += b;
    }
    s.u16();
  }

  struct Poly {
    uint8_t n = 0;
    uint16_t idx[32] = {};
  };
  std::vector<Poly> polys(n_polys);
  for (uint32_t i = 0; i < n_polys && !s.fail; ++i) {
    if (!s.need(12 + 4 + 2)) return false;
    s.o += 12 + 4;
    const uint16_t unk_n = s.u16();
    if (!s.need(unk_n * 4u + 4u + counts[i] * 5u)) return false;
    s.o += unk_n * 4u;
    s.u16();
    s.u16();
    polys[i].n = counts[i];
    for (uint8_t v = 0; v < counts[i]; ++v) {
      polys[i].idx[v] = s.u16();
      s.o += 3;
    }
  }

  if (!s.need(n_nodes * 14u)) return false;
  s.o += n_nodes * 14u;
  for (uint32_t i = 0; i < n_portals && !s.fail; ++i) {
    const uint16_t ln = s.u16();
    if (!s.need(ln + 4 + 4 + 2 + 12 + 12)) return false;
    s.o += ln + 4 + 4 + 2 + 12 + 12;
  }

  if (!s.need(n_points * 24u)) return false;
  std::vector<float> px(n_points), py(n_points), pz(n_points);
  for (uint32_t i = 0; i < n_points; ++i) {
    px[i] = s.f32();
    py[i] = s.f32();
    pz[i] = s.f32();
    s.f32();
    s.f32();
    s.f32();
  }
  if (s.fail) return false;

  *minx = mn0;
  *miny = mn1;
  *minz = mn2;
  *maxx = mx0;
  *maxy = mx1;
  *maxz = mx2;

  for (const auto &poly : polys) {
    for (uint8_t i = 1; i + 1 < poly.n; ++i) {
      const uint16_t a = poly.idx[0], b = poly.idx[i], c = poly.idx[i + 1];
      if (a >= n_points || b >= n_points || c >= n_points) continue;
      WorldTri t;
      t.x[0] = px[a];
      t.y[0] = py[a];
      t.z[0] = pz[a];
      t.x[1] = px[b];
      t.y[1] = py[b];
      t.z[1] = pz[b];
      t.x[2] = px[c];
      t.y[2] = py[c];
      t.z[2] = pz[c];
      tris->push_back(t);
    }
  }
  return !tris->empty();
}

bool find_start(const std::string &dat, uint32_t obj_pos, WorldV66 *out) {
  if (obj_pos >= dat.size()) return false;
  const auto at = dat.find("GameStartPoint", obj_pos);
  if (at == std::string::npos) return false;
  const auto pos = dat.find("Pos", at);
  if (pos == std::string::npos || pos > at + 80 || pos + 22 > dat.size()) return false;
  const auto *p = reinterpret_cast<const uint8_t *>(dat.data());
  // LTString "Pos" is already consumed; next is u8 type, u32 flags, u16 len, payload.
  size_t k = pos + 3;
  k += 1 + 4;
  uint16_t len = 0;
  std::memcpy(&len, p + k, 2);
  k += 2;
  if (len != 12 || k + 12 > dat.size()) return false;
  float v[3];
  std::memcpy(v, p + k, 12);
  if (!std::isfinite(v[0]) || !std::isfinite(v[1]) || !std::isfinite(v[2])) return false;
  out->start_x = v[0];
  out->start_y = v[1];
  out->start_z = v[2];
  const auto rot = dat.find("Rotation", pos);
  if (rot != std::string::npos && rot < pos + 80 && rot + 28 < dat.size()) {
    size_t r = rot + 8;
    r += 1 + 4;
    uint16_t rlen = 0;
    std::memcpy(&rlen, p + r, 2);
    r += 2;
    if (rlen >= 16 && r + 16 <= dat.size()) {
      float q[4];
      std::memcpy(q, p + r, 16);
      // NOLF stores yaw-like euler in the second float (~4.71 = 270 deg).
      if (std::isfinite(q[1]) && std::fabs(q[1]) > 0.01f && std::fabs(q[1]) < 8.0f)
        out->start_yaw = q[1];
    }
  }
  return true;
}

}  // namespace

bool world_v66_load(const std::string &dat, WorldV66 *out) {
  if (!out || dat.size() < 80) return false;
  *out = WorldV66{};
  const auto *p = reinterpret_cast<const uint8_t *>(dat.data());
  uint32_t ver = 0, obj_pos = 0;
  std::memcpy(&ver, p, 4);
  std::memcpy(&obj_pos, p + 4, 4);
  if (ver != 66) return false;
  out->version = ver;

  uint32_t info_len = 0;
  std::memcpy(&info_len, p + 44, 4);
  if (info_len > 0 && info_len < 4096 && 48 + info_len <= dat.size()) {
    out->info.assign(dat.data() + 48, info_len);
    if (!out->info.empty() && out->info.back() == 0) out->info.pop_back();
  }
  if (dat.size() >= 97) {
    std::memcpy(&out->minx, p + 73, 4);
    std::memcpy(&out->miny, p + 77, 4);
    std::memcpy(&out->minz, p + 81, 4);
    std::memcpy(&out->maxx, p + 85, 4);
    std::memcpy(&out->maxy, p + 89, 4);
    std::memcpy(&out->maxz, p + 93, 4);
  }

  const bool started = find_start(dat, obj_pos, out);

  const char *names[] = {"VisBSP", "PhysicsBSP"};
  for (const char *name : names) {
    const auto at = dat.find(name);
    if (at == std::string::npos) continue;
    std::vector<WorldTri> tris;
    float minx, miny, minz, maxx, maxy, maxz;
    if (parse_bsp(dat, at, &tris, &minx, &miny, &minz, &maxx, &maxy, &maxz)) {
      out->tris = std::move(tris);
      out->minx = minx;
      out->miny = miny;
      out->minz = minz;
      out->maxx = maxx;
      out->maxy = maxy;
      out->maxz = maxz;
      break;
    }
  }

  if (!started) {
    out->start_x = (out->minx + out->maxx) * 0.5f;
    out->start_y = out->miny + 64;
    out->start_z = (out->minz + out->maxz) * 0.5f;
  }
  out->ok = !out->tris.empty();
  return out->ok;
}
