#pragma once

#include <cstdint>
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

// RezMgr Version 1 reader (same on-disk layout as vendor/lithtech/libs/rezmgr).
class LithRez {
 public:
  struct Item {
    std::string path;
    uint32_t type = 0;
    uint32_t pos = 0;
    uint32_t size = 0;
    std::string archive;
  };

  ~LithRez();
  LithRez() = default;
  LithRez(const LithRez &) = delete;
  LithRez &operator=(const LithRez &) = delete;
  LithRez(LithRez &&other) noexcept { *this = std::move(other); }
  LithRez &operator=(LithRez &&other) noexcept {
    if (this != &other) {
      close();
      archives_ = std::move(other.archives_);
      items_ = std::move(other.items_);
      other.archives_.clear();
    }
    return *this;
  }

  bool open_dir(const char *dir);
  void close();

  static uint32_t type_from_str(const char *ext);
  const Item *find(const char *path, const char *type) const;
  bool read(const Item *item, std::string *out) const;
  bool read_path(const char *path, const char *type, std::string *out) const;

  const std::vector<Item> &items() const { return items_; }

 private:
  struct Archive {
    std::string path;
    FILE *fp = nullptr;
  };

  bool open_archive(const char *path);
  static void walk_dir(FILE *fp, const std::string &prefix, uint32_t pos,
                       uint32_t size, const std::string &archive,
                       std::vector<Item> *items);

  std::vector<Archive> archives_;
  std::vector<Item> items_;
};
