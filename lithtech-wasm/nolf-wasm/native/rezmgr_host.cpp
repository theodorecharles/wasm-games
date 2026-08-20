#include "rezmgr_host.h"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <dirent.h>

static bool is_rez_name(const char *name) {
  const std::size_t n = std::strlen(name);
  if (n < 5) return false;
  return std::strcmp(name + n - 4, ".REZ") == 0 || std::strcmp(name + n - 4, ".rez") == 0;
}

bool rezmgr_open_game_dir(CRezMgr *mgr, const char *dir, std::vector<std::string> *opened) {
  if (!mgr || !dir) return false;
  std::vector<std::string> files;
  DIR *d = opendir(dir);
  if (!d) return false;
  while (dirent *e = readdir(d)) {
    if (is_rez_name(e->d_name)) {
      files.push_back(std::string(dir) + "/" + e->d_name);
    }
  }
  closedir(d);
  std::sort(files.begin(), files.end());
  if (files.empty()) return false;

  bool any = false;
  for (std::size_t i = 0; i < files.size(); ++i) {
    const BOOL ok = (i == 0)
                        ? mgr->Open(files[i].c_str(), TRUE, FALSE)
                        : mgr->OpenAdditional(files[i].c_str(), FALSE);
    if (ok) {
      any = true;
      if (opened) opened->push_back(files[i]);
    }
  }
  return any && mgr->IsOpen();
}

CRezItm *rezmgr_lookup(CRezMgr *mgr, const char *dos_path, const char *type_str,
                       int *out_dos, int *out_path) {
  if (out_dos) *out_dos = 0;
  if (out_path) *out_path = 0;
  if (!mgr || !mgr->IsOpen() || !dos_path) return nullptr;

  CRezItm *dos = mgr->GetRezFromDosPath(dos_path);
  if (dos && out_dos) *out_dos = 1;

  CRezItm *path = nullptr;
  if (type_str && type_str[0]) {
    char type_buf[8];
    std::strncpy(type_buf, type_str, sizeof(type_buf) - 1);
    type_buf[sizeof(type_buf) - 1] = '\0';
    const REZTYPE type = mgr->StrToType(type_buf);
    path = mgr->GetRezFromPath(dos_path, type);

    if (!path) {
      // Official names store the extension as the type, not in the item name.
      std::string stem(dos_path);
      const auto slash = stem.find_last_of("/\\");
      const auto dot = stem.find_last_of('.');
      if (dot != std::string::npos && (slash == std::string::npos || dot > slash)) {
        stem.resize(dot);
        path = mgr->GetRezFromPath(stem.c_str(), type);
      }
    }
  }
  if (path && out_path) *out_path = 1;

  return dos ? dos : path;
}
