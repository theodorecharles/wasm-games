/* Linux stand-in for vendor LTGUIMgr.h (backslash include paths). */
#if !defined(_LTGUIMGR_H_)
#define _LTGUIMGR_H_

#include "lithtech.h"
#ifndef SCREEN_NEAR_Z
#define SCREEN_NEAR_Z 0.0
#endif
#include "iltfontmanager.h"
#include "iltdrawprim.h"
#include "ilttexinterface.h"
#include "DebugNew.h"

#pragma warning( disable : 4786 )
#include <vector>

typedef std::vector<CUIPolyString*> PStringArray;
typedef std::vector<CUIFormattedPolyString*> FPStringArray;

#include "ltguicommandhandler.h"
#include "ltguictrl.h"
typedef std::vector<CLTGUICtrl*> ControlArray;

#include "ltguitextitemctrl.h"
#include "ltguibutton.h"
#include "ltguicyclectrl.h"
#include "ltguitoggle.h"
#include "ltguislider.h"
#include "ltguicolumnctrl.h"
#include "ltguiframe.h"
#include "ltguieditctrl.h"
#include "ltguilargetext.h"

#include "ltguiwindow.h"
#include "ltguilistctrl.h"

extern ILTDrawPrim*		g_pDrawPrim;
extern ILTFontManager*	g_pFontManager;
extern ILTTexInterface*	g_pTexInterface;

#include "ltquaduvutils.h"

#endif
