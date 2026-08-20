#pragma once

#include "stdafx.h"

typedef uint32 LTRESULT;
#ifndef LT_OK
#define LT_OK 0
#endif

struct ILTStream {
  uint32 GetLen() const { return 0; }
  ILTStream &operator>>(uint8 &) { return *this; }
  void Release() {}
};

struct ILTCSBase {
  LTRESULT OpenFile(char *, ILTStream **) { return 1; }
};

inline ILTCSBase *g_pBaseLT = nullptr;
