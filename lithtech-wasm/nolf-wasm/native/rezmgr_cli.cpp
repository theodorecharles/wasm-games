#include "rezmgr_host.h"

#include <cctype>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

static bool contains_ci(const char *hay, const char *needle) {
  if (!hay || !needle || !*needle) return false;
  const std::size_t nlen = std::strlen(needle);
  for (const char *p = hay; *p; ++p) {
    std::size_t i = 0;
    while (i < nlen && p[i] &&
           std::tolower(static_cast<unsigned char>(p[i])) ==
               std::tolower(static_cast<unsigned char>(needle[i]))) {
      ++i;
    }
    if (i == nlen) return true;
  }
  return false;
}

static void walk_interesting(CRezDir *dir, const std::string &prefix, int depth) {
  if (!dir) return;
  const char *name = dir->GetDirName() ? dir->GetDirName() : "";
  const std::string path = prefix.empty() ? std::string(name) : prefix + "\\" + name;
  if (depth <= 1 || contains_ci(path.c_str(), "ATTRIB") ||
      contains_ci(path.c_str(), "WORLD") || contains_ci(path.c_str(), "MISSION")) {
    std::printf("dir %s\n", path.empty() ? "\\" : path.c_str());
  }
  for (CRezTyp *typ = dir->GetFirstType(); typ; typ = dir->GetNextType(typ)) {
    char type[8] = {};
    dir->GetParentMgr()->TypeToStr(typ->GetType(), type);
    for (CRezItm *itm = dir->GetFirstItem(typ); itm; itm = dir->GetNextItem(itm)) {
      const char *inm = itm->GetName() ? itm->GetName() : "";
      if (contains_ci(inm, "MISSION") || contains_ci(inm, "WEAPON") ||
          contains_ci(inm, "T01S01") || contains_ci(inm, "M01S01") ||
          contains_ci(path.c_str(), "ATTRIB")) {
        std::printf("itm %s\\%s.%s size=%u\n", path.empty() ? "" : path.c_str(), inm,
                    type, static_cast<unsigned>(itm->GetSize()));
      }
    }
  }
  for (CRezDir *child = dir->GetFirstSubDir(); child; child = dir->GetNextSubDir(child)) {
    walk_interesting(child, path, depth + 1);
  }
}

static void print_lookup(CRezMgr *mgr, const char *label, const char *dos_path,
                         const char *type_str) {
  int dos = 0, path = 0;
  CRezItm *itm = rezmgr_lookup(mgr, dos_path, type_str, &dos, &path);
  std::printf("lookup %s dos=%d path=%d found=%d", label, dos, path, itm ? 1 : 0);
  if (itm) {
    const DWORD n = itm->GetSize();
    const DWORD chunk = n == 0 ? 0 : (n < 64 ? n : 64);
    int got = 1;
    if (chunk) {
      std::vector<BYTE> buf(chunk);
      got = itm->Get(buf.data(), 0, chunk) ? 1 : 0;
    }
    std::printf(" size=%u get=%d", static_cast<unsigned>(n), got);
  }
  std::printf("\n");
}

static void dump_missions(CRezItm *itm) {
  if (!itm) {
    std::printf("Missions.txt: <missing>\n");
    return;
  }
  const DWORD n = itm->GetSize();
  if (n == 0) {
    std::printf("Missions.txt:\n");
    return;
  }
  std::string buf(n, '\0');
  if (!itm->Get(&buf[0], 0, n)) {
    BYTE *p = itm->Load();
    if (!p) {
      std::printf("Missions.txt: <read-failed>\n");
      return;
    }
    buf.assign(reinterpret_cast<char *>(p), n);
  }
  std::size_t take = buf.size() < 80 ? buf.size() : 80;
  for (std::size_t i = 0; i < take; ++i) {
    const unsigned char c = static_cast<unsigned char>(buf[i]);
    if (c == '\n' || c == '\r' || c == '\t' || (c >= 32 && c < 127)) continue;
    buf[i] = '.';
  }
  std::printf("Missions.txt: %.*s\n", static_cast<int>(take), buf.c_str());
}

int main(int argc, char **argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: rezmgr_cli <data-dir>\n");
    return 2;
  }

  CRezMgr mgr;
  std::vector<std::string> opened;
  if (!rezmgr_open_game_dir(&mgr, argv[1], &opened)) {
    std::printf("open found=0\n");
    return 1;
  }

  for (std::size_t i = 0; i < opened.size(); ++i) {
    const char *slash = std::strrchr(opened[i].c_str(), '/');
    const char *name = slash ? slash + 1 : opened[i].c_str();
    std::printf("rez=%s %s=1\n", name, i == 0 ? "open" : "additional");
  }

  walk_interesting(mgr.GetRootDir(), "", 0);
  print_lookup(&mgr, "Attributes/Missions.txt", "Attributes/Missions.txt", "TXT");
  print_lookup(&mgr, "Attributes/Weapons.txt", "Attributes/Weapons.txt", "TXT");
  print_lookup(&mgr, "Worlds/T01S01", "Worlds/T01S01.DAT", "DAT");
  print_lookup(&mgr, "Worlds/M01S01", "Worlds/M01S01.DAT", "DAT");

  int dos = 0, path = 0;
  dump_missions(rezmgr_lookup(&mgr, "Attributes/Missions.txt", "TXT", &dos, &path));
  return 0;
}
