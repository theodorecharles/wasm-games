#pragma once

#ifndef __DPRINTF_H__
#define __DPRINTF_H__

#include <cstdarg>
#include <cstdio>

inline void dprintf(char *fmt, ...) {
  (void)fmt;
}
inline void dprintf(unsigned int, char *fmt, ...) {
  (void)fmt;
}
inline void dprintf(int, int, char *fmt, ...) {
  (void)fmt;
}
inline void dprintf(unsigned int, int, int, char *fmt, ...) {
  (void)fmt;
}
inline void dgotoxy(int, int) {}
inline void dgotoxy(unsigned int, int, int) {}
inline void dclrscr(void) {}
inline void dclrscr(unsigned int) {}

#endif
