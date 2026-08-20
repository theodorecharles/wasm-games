#include "lith_rez.h"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <dirent.h>
#include <sys/stat.h>

namespace {

std::string upper_copy(std::string s) {
  for (char &c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return s;
}

std::string normalize_path(std::string s) {
  for (char &c : s) {
    if (c == '\\') c = '/';
  }
  while (!s.empty() && s.front() == '/') s.erase(s.begin());
  return upper_copy(s);
}

int rez_rank(const std::string &path) {
  const std::string u = upper_copy(path);
  if (u.find("U003") != std::string::npos) return 40;
  if (u.find("CRES") != std::string::npos) return 50;
  if (u.find("GOTY") != std::string::npos) return 30;
  if (u.find("NOLF2") != std::string::npos) return 20;
  if (u.find("NOLF") != std::string::npos) return 10;
  return 15;
}

bool read_at(FILE *fp, uint32_t pos, uint32_t size, std::vector<uint8_t> *out) {
  if (!fp || fseek(fp, static_cast<long>(pos), SEEK_SET) != 0) return false;
  out->assign(size, 0);
  return fread(out->data(), 1, size, fp) == size;
}

}  // namespace

LithRez::~LithRez() { close(); }

uint32_t LithRez::type_from_str(const char *ext) {
  if (!ext) return 0;
  uint32_t nType = 0;
  auto *pType = reinterpret_cast<uint8_t *>(&nType);
  const int nStrLen = static_cast<int>(std::strlen(ext));
  if (nStrLen > 0) pType[nStrLen - 1] = static_cast<uint8_t>(ext[0]);
  if (nStrLen > 1) pType[nStrLen - 2] = static_cast<uint8_t>(ext[1]);
  if (nStrLen > 2) pType[nStrLen - 3] = static_cast<uint8_t>(ext[2]);
  if (nStrLen > 3) pType[nStrLen - 4] = static_cast<uint8_t>(ext[3]);
  return nType;
}

void LithRez::close() {
  for (auto &a : archives_) {
    if (a.fp) fclose(a.fp);
  }
  archives_.clear();
  items_.clear();
}

void LithRez::walk_dir(FILE *fp, const std::string &prefix, uint32_t pos,
                       uint32_t size, const std::string &archive,
                       std::vector<Item> *items) {
  std::vector<uint8_t> block;
  if (!read_at(fp, pos, size, &block)) return;
  size_t p = 0;
  while (p + 4 <= block.size()) {
    uint32_t typ = 0;
    std::memcpy(&typ, block.data() + p, 4);
    p += 4;
    if (typ == 1) {
      if (p + 12 > block.size()) break;
      uint32_t dpos = 0, dsize = 0;
      std::memcpy(&dpos, block.data() + p, 4);
      std::memcpy(&dsize, block.data() + p + 4, 4);
      p += 12;
      const auto *end = static_cast<const uint8_t *>(
          std::memchr(block.data() + p, 0, block.size() - p));
      if (!end) break;
      const std::string name(reinterpret_cast<const char *>(block.data() + p));
      p = static_cast<size_t>(end - block.data()) + 1;
      walk_dir(fp, prefix + name + "/", dpos, dsize, archive, items);
    } else if (typ == 0) {
      if (p + 24 > block.size()) break;
      uint32_t rpos = 0, rsize = 0, rtime = 0, rid = 0, rtype = 0, nkeys = 0;
      std::memcpy(&rpos, block.data() + p, 4);
      std::memcpy(&rsize, block.data() + p + 4, 4);
      std::memcpy(&rtype, block.data() + p + 16, 4);
      std::memcpy(&nkeys, block.data() + p + 20, 4);
      (void)rtime;
      (void)rid;
      p += 24;
      const auto *end = static_cast<const uint8_t *>(
          std::memchr(block.data() + p, 0, block.size() - p));
      if (!end) break;
      const std::string name(reinterpret_cast<const char *>(block.data() + p));
      p = static_cast<size_t>(end - block.data()) + 1;
      const auto *cend = static_cast<const uint8_t *>(
          std::memchr(block.data() + p, 0, block.size() - p));
      if (!cend) break;
      p = static_cast<size_t>(cend - block.data()) + 1 + 4u * nkeys;
      Item it;
      it.path = normalize_path(prefix + name);
      it.type = rtype;
      it.pos = rpos;
      it.size = rsize;
      it.archive = archive;
      items->push_back(std::move(it));
    } else {
      break;
    }
  }
}

bool LithRez::open_archive(const char *path) {
  FILE *fp = fopen(path, "rb");
  if (!fp) return false;
  uint8_t hdr[200];
  if (fread(hdr, 1, sizeof(hdr), fp) < 131) {
    fclose(fp);
    return false;
  }
  const char *mark = "RezMgr Version 1";
  if (std::search(hdr, hdr + 80, mark, mark + 16) == hdr + 80) {
    fclose(fp);
    return false;
  }
  const size_t off = 2 + 60 + 2 + 60 + 2 + 1;
  uint32_t ver = 0, root_pos = 0, root_size = 0;
  std::memcpy(&ver, hdr + off, 4);
  std::memcpy(&root_pos, hdr + off + 4, 4);
  std::memcpy(&root_size, hdr + off + 8, 4);
  if (ver != 1 || root_size == 0) {
    fclose(fp);
    return false;
  }
  std::vector<Item> found;
  walk_dir(fp, "/", root_pos, root_size, path, &found);
  for (auto &it : found) {
    auto existing = std::find_if(items_.begin(), items_.end(), [&](const Item &e) {
      return e.path == it.path && e.type == it.type;
    });
    if (existing != items_.end()) *existing = it;
    else items_.push_back(it);
  }
  archives_.push_back({path, fp});
  return true;
}

bool LithRez::open_dir(const char *dir) {
  close();
  DIR *d = opendir(dir);
  if (!d) return false;
  std::vector<std::string> files;
  while (dirent *e = readdir(d)) {
    const char *n = e->d_name;
    const size_t len = std::strlen(n);
    if (len > 4) {
      const char *ext = n + len - 4;
      if (std::strcmp(ext, ".REZ") == 0 || std::strcmp(ext, ".rez") == 0) {
        files.push_back(std::string(dir) + "/" + n);
      }
    }
  }
  closedir(d);
  std::sort(files.begin(), files.end(), [](const std::string &a, const std::string &b) {
    const int ra = rez_rank(a), rb = rez_rank(b);
    if (ra != rb) return ra < rb;
    return a < b;
  });
  for (const auto &f : files) open_archive(f.c_str());
  return !items_.empty();
}

const LithRez::Item *LithRez::find(const char *path, const char *type) const {
  if (!path) return nullptr;
  const std::string key = normalize_path(path);
  const uint32_t t = type ? type_from_str(type) : 0;
  for (const auto &it : items_) {
    if (it.path == key && (!type || it.type == t)) return &it;
  }
  return nullptr;
}

bool LithRez::read(const Item *item, std::string *out) const {
  if (!item || !out) return false;
  for (const auto &a : archives_) {
    if (a.path != item->archive || !a.fp) continue;
    std::vector<uint8_t> buf;
    if (!read_at(a.fp, item->pos, item->size, &buf)) return false;
    out->assign(reinterpret_cast<const char *>(buf.data()), buf.size());
    return true;
  }
  return false;
}

bool LithRez::read_path(const char *path, const char *type, std::string *out) const {
  return read(find(path, type), out);
}
