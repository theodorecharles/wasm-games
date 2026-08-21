#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct WorldTri {
  float x[3], y[3], z[3];
};

struct WorldV66 {
  uint32_t version = 0;
  std::string info;
  float minx = -512, miny = 0, minz = -512;
  float maxx = 512, maxy = 256, maxz = 512;
  float start_x = 0, start_y = 64, start_z = 0, start_yaw = 0;
  std::vector<WorldTri> tris;
  bool ok = false;
};

bool world_v66_load(const std::string &dat, WorldV66 *out);
