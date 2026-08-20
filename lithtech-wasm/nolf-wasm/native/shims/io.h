#pragma once

// Windows CRT bits used by rezmgr.cpp when compiled with _WIN32 so the Linux
// stub does not redefine _S_IFDIR as 0 (which would treat every file as a dir).

#include "lithtech_compat.h"

#include <cstring>
#include <ctime>
#include <sys/stat.h>

#ifndef _S_IFDIR
#ifdef S_IFDIR
#define _S_IFDIR S_IFDIR
#else
#define _S_IFDIR 0040000
#endif
#endif

struct _finddata_t {
  unsigned int attrib;
  std::time_t time_create;
  std::time_t time_access;
  std::time_t time_write;
  unsigned long size;
  char name[260];
};

#ifndef _A_SUBDIR
#define _A_SUBDIR 0x10
#endif

inline void _splitpath(const char *path, char *drive, char *dir, char *fname, char *ext) {
  if (drive) {
    drive[0] = '\0';
  }
  if (dir) {
    dir[0] = '\0';
  }
  if (fname) {
    fname[0] = '\0';
  }
  if (ext) {
    ext[0] = '\0';
  }
  if (!path) {
    return;
  }

  const char *last_sep = nullptr;
  for (const char *p = path; *p; ++p) {
    if (*p == '/' || *p == '\\' || *p == ':') {
      last_sep = p;
    }
  }
  const char *name = last_sep ? last_sep + 1 : path;
  if (dir && last_sep) {
    std::size_t n = static_cast<std::size_t>(last_sep - path + 1);
    if (n > _MAX_DIR) {
      n = _MAX_DIR;
    }
    std::memcpy(dir, path, n);
    dir[n] = '\0';
  }

  const char *dot = std::strrchr(name, '.');
  if (dot && dot != name) {
    if (ext) {
      std::strncpy(ext, dot, _MAX_EXT);
      ext[_MAX_EXT] = '\0';
    }
    if (fname) {
      std::size_t n = static_cast<std::size_t>(dot - name);
      if (n > _MAX_FNAME) {
        n = _MAX_FNAME;
      }
      std::memcpy(fname, name, n);
      fname[n] = '\0';
    }
  } else if (fname) {
    std::strncpy(fname, name, _MAX_FNAME);
    fname[_MAX_FNAME] = '\0';
  }
}

inline long _findfirst(const char *, _finddata_t *) { return -1; }
inline int _findnext(long, _finddata_t *) { return -1; }
inline int _findclose(long) { return -1; }
