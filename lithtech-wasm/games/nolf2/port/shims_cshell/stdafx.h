/* CShell includes "stdafx.h"; vendor TO2 header is Stdafx.h. */
#ifndef PORT_CSHELL_STDAFX_H
#define PORT_CSHELL_STDAFX_H

#include "windows.h"
#ifdef stricmp
#undef stricmp
#endif
#ifdef strnicmp
#undef strnicmp
#endif
#ifdef _stricmp
#undef _stricmp
#endif
#ifdef _strnicmp
#undef _strnicmp
#endif
#ifdef _MAX_PATH
#undef _MAX_PATH
#endif

#include "../../vendor/lithtech/NOLF2/ClientShellDLL/TO2/Stdafx.h"
#include "BaseFx.h"
#include "GameClientShell.h"

#endif
