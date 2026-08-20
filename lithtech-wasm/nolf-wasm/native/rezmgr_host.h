#pragma once

#include "rezmgr.h"

#include <string>
#include <vector>

// Open every *.REZ / *.rez in dir via CRezMgr::Open then OpenAdditional.
bool rezmgr_open_game_dir(CRezMgr *mgr, const char *dir, std::vector<std::string> *opened);

// Try GetRezFromDosPath and GetRezFromPath(StrToType(type)).
CRezItm *rezmgr_lookup(CRezMgr *mgr, const char *dos_path, const char *type_str,
                       int *out_dos, int *out_path);
