#include "bdefs.h"
#include "input.h"
#include "concommand.h"
#include "console.h"

#include <SDL.h>
#include <stdio.h>
#include <string.h>

#ifndef COMMAND_ID_FORWARD
#include "CommandIDs.h"
#endif

#define MAX_ACTIONS 256
#define MAX_BINDS 256
#define MAX_KEYS 512

struct SAction {
	int  code;
	char name[MAX_ACTIONNAME_LEN];
	int  used;
};

struct SBind {
	int  used;
	int  isMouse;
	int  sdlKey;
	int  mouseButton;
	int  isAxis;
	int  axisIndex;
	int  actionCode;
	char actionName[MAX_ACTIONNAME_LEN];
	char triggerName[INPUTNAME_LEN];
	char deviceName[INPUTNAME_LEN];
	float rangeLow, rangeHigh;
	float scale;
};

static SAction g_Actions[MAX_ACTIONS];
static int g_nActions = 0;
static SBind g_Binds[MAX_BINDS];
static int g_bInitted = 0;
static int g_KeyDown[MAX_KEYS];
static int g_MouseDown[8];
static float g_MouseAccum[3];
static ConsoleState *g_pInputConsoleState = NULL;

static InputMgr g_MainInputMgr;

void sdl_input_OnMouseMotion(int dx, int dy)
{
	g_MouseAccum[0] += (float)dx;
	g_MouseAccum[1] += (float)dy;
}

void sdl_input_OnMouseButton(int button, int down)
{
	if (button >= 0 && button < 8)
		g_MouseDown[button] = down ? 1 : 0;
}

void sdl_input_OnKey(int sdlKey, int down)
{
	unsigned int k = (unsigned int)sdlKey;
	if (k < MAX_KEYS)
		g_KeyDown[k] = down ? 1 : 0;
}

unsigned int sdl_input_MapSDLKey(int sdlKey)
{
	switch (sdlKey) {
	case SDLK_ESCAPE: return VK_ESCAPE;
	case SDLK_RETURN: return VK_RETURN;
	case SDLK_SPACE: return VK_SPACE;
	case SDLK_TAB: return VK_TAB;
	case SDLK_BACKSPACE: return VK_BACK;
	case SDLK_LSHIFT:
	case SDLK_RSHIFT: return VK_SHIFT;
	case SDLK_LCTRL:
	case SDLK_RCTRL: return VK_CONTROL;
	case SDLK_LALT:
	case SDLK_RALT: return VK_MENU;
	case SDLK_LEFT: return VK_LEFT;
	case SDLK_RIGHT: return VK_RIGHT;
	case SDLK_UP: return VK_UP;
	case SDLK_DOWN: return VK_DOWN;
	case SDLK_F1: return VK_F1;
	case SDLK_F2: return VK_F2;
	case SDLK_F3: return VK_F3;
	case SDLK_F4: return VK_F4;
	case SDLK_F5: return VK_F5;
	case SDLK_F6: return VK_F6;
	case SDLK_F7: return VK_F7;
	case SDLK_F8: return VK_F8;
	case SDLK_F9: return VK_F9;
	case SDLK_F10: return VK_F10;
	case SDLK_F11: return VK_F11;
	case SDLK_F12: return VK_F12;
	case SDLK_BACKQUOTE: return VK_OEM_3;
	case SDLK_INSERT: return VK_INSERT;
	case SDLK_DELETE: return VK_DELETE;
	case SDLK_HOME: return VK_HOME;
	case SDLK_END: return VK_END;
	case SDLK_PAGEUP: return VK_PRIOR;
	case SDLK_PAGEDOWN: return VK_NEXT;
	default:
		if (sdlKey >= 32 && sdlKey < 127)
			return (unsigned int)sdlKey;
		return 0;
	}
}

static SAction *FindAction(const char *name)
{
	int i;
	if (!name)
		return NULL;
	for (i = 0; i < g_nActions; ++i) {
		if (g_Actions[i].used && strcasecmp(g_Actions[i].name, name) == 0)
			return &g_Actions[i];
	}
	return NULL;
}

static int SDLKeyFromName(const char *name)
{
	if (!name)
		return 0;
	if (strcasecmp(name, "W") == 0) return SDLK_w;
	if (strcasecmp(name, "A") == 0) return SDLK_a;
	if (strcasecmp(name, "S") == 0) return SDLK_s;
	if (strcasecmp(name, "D") == 0) return SDLK_d;
	if (strcasecmp(name, "Q") == 0) return SDLK_q;
	if (strcasecmp(name, "E") == 0) return SDLK_e;
	if (strcasecmp(name, "R") == 0) return SDLK_r;
	if (strcasecmp(name, "F") == 0) return SDLK_f;
	if (strcasecmp(name, "C") == 0) return SDLK_c;
	if (strcasecmp(name, "V") == 0) return SDLK_v;
	if (strcasecmp(name, "X") == 0) return SDLK_x;
	if (strcasecmp(name, "Z") == 0) return SDLK_z;
	if (strcasecmp(name, "Left") == 0) return SDLK_LEFT;
	if (strcasecmp(name, "Right") == 0) return SDLK_RIGHT;
	if (strcasecmp(name, "Up") == 0) return SDLK_UP;
	if (strcasecmp(name, "Down") == 0) return SDLK_DOWN;
	if (strcasecmp(name, "Space") == 0 || strcasecmp(name, "Space bar") == 0) return SDLK_SPACE;
	if (strcasecmp(name, "Enter") == 0 || strcasecmp(name, "Return") == 0) return SDLK_RETURN;
	if (strcasecmp(name, "Escape") == 0 || strcasecmp(name, "Esc") == 0) return SDLK_ESCAPE;
	if (strcasecmp(name, "Tab") == 0) return SDLK_TAB;
	if (strcasecmp(name, "Left Shift") == 0 || strcasecmp(name, "LShift") == 0) return SDLK_LSHIFT;
	if (strcasecmp(name, "Right Shift") == 0) return SDLK_RSHIFT;
	if (strcasecmp(name, "Left Control") == 0 || strcasecmp(name, "Ctrl") == 0) return SDLK_LCTRL;
	if (strcasecmp(name, "Left Alt") == 0) return SDLK_LALT;
	if (name[0] >= '0' && name[0] <= '9' && name[1] == 0)
		return SDLK_0 + (name[0] - '0');
	if ((name[0] == 'F' || name[0] == 'f') && name[1] >= '1' && name[1] <= '9') {
		int n = atoi(name + 1);
		if (n >= 1 && n <= 12)
			return SDLK_F1 + (n - 1);
	}
	if (strlen(name) == 1) {
		char c = name[0];
		if (c >= 'A' && c <= 'Z')
			c = (char)(c - 'A' + 'a');
		if (c >= 'a' && c <= 'z')
			return SDLK_a + (c - 'a');
	}
	return 0;
}

static int AddBindSlot()
{
	int i;
	for (i = 0; i < MAX_BINDS; ++i) {
		if (!g_Binds[i].used)
			return i;
	}
	return -1;
}

static void InstallDefaultMap()
{
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "W", "Forward", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "S", "Backward", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "A", "StrafeLeft", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "D", "StrafeRight", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Left", "Left", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Right", "Right", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Up", "LookUp", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Down", "LookDown", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Space", "Jump", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Enter", "Activate", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", "Escape", "Unassigned", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Mouse", "Button 0", "Fire", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Mouse", "Button 1", "AltFire", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Mouse", "X-axis", "Axis1", 0, 0);
	g_MainInputMgr.AddBinding(&g_MainInputMgr, "Mouse", "Y-axis", "Axis2", 0, 0);

	int i;
	for (i = 0; i < 10; ++i) {
		char trig[8], act[16];
		sprintf(trig, "%d", i);
		sprintf(act, "Weapon%d", i == 0 ? 10 : i);
		g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", trig, act, 0, 0);
	}
	for (i = 1; i <= 12; ++i) {
		char trig[8], act[16];
		sprintf(trig, "F%d", i);
		sprintf(act, "F%d", i);
		g_MainInputMgr.AddBinding(&g_MainInputMgr, "Keyboard", trig, act, 0, 0);
	}
}

static bool inp_Init(InputMgr *pMgr, ConsoleState *pState)
{
	(void)pMgr;
	g_pInputConsoleState = pState;
	memset(g_Actions, 0, sizeof(g_Actions));
	memset(g_Binds, 0, sizeof(g_Binds));
	memset(g_KeyDown, 0, sizeof(g_KeyDown));
	memset(g_MouseDown, 0, sizeof(g_MouseDown));
	g_MouseAccum[0] = g_MouseAccum[1] = g_MouseAccum[2] = 0;
	g_nActions = 0;
	g_bInitted = 1;

	pMgr->AddAction(pMgr, "Forward", COMMAND_ID_FORWARD);
	pMgr->AddAction(pMgr, "Backward", COMMAND_ID_REVERSE);
	pMgr->AddAction(pMgr, "Reverse", COMMAND_ID_REVERSE);
	pMgr->AddAction(pMgr, "Activate", COMMAND_ID_ACTIVATE);
	pMgr->AddAction(pMgr, "Reload", COMMAND_ID_RELOAD);
	pMgr->AddAction(pMgr, "Duck", COMMAND_ID_DUCK);
	pMgr->AddAction(pMgr, "Jump", COMMAND_ID_JUMP);
	pMgr->AddAction(pMgr, "Run", COMMAND_ID_RUN);
	pMgr->AddAction(pMgr, "Fire", COMMAND_ID_FIRING);
	pMgr->AddAction(pMgr, "Strafe", COMMAND_ID_STRAFE);
	pMgr->AddAction(pMgr, "Left", COMMAND_ID_LEFT);
	pMgr->AddAction(pMgr, "Right", COMMAND_ID_RIGHT);
	pMgr->AddAction(pMgr, "StrafeLeft", COMMAND_ID_STRAFE_LEFT);
	pMgr->AddAction(pMgr, "StrafeRight", COMMAND_ID_STRAFE_RIGHT);
	pMgr->AddAction(pMgr, "AltFire", COMMAND_ID_ALT_FIRING);
	pMgr->AddAction(pMgr, "LookUp", COMMAND_ID_LOOKUP);
	pMgr->AddAction(pMgr, "LookDown", COMMAND_ID_LOOKDOWN);
	pMgr->AddAction(pMgr, "LeanLeft", COMMAND_ID_LEAN_LEFT);
	pMgr->AddAction(pMgr, "LeanRight", COMMAND_ID_LEAN_RIGHT);
	pMgr->AddAction(pMgr, "Axis1", -1);
	pMgr->AddAction(pMgr, "Axis2", -2);
	pMgr->AddAction(pMgr, "Axis3", -3);
	pMgr->AddAction(pMgr, "Unassigned", COMMAND_ID_UNASSIGNED);

	int w;
	for (w = 0; w < 10; ++w) {
		char name[16];
		sprintf(name, "Weapon%d", w == 0 ? 10 : w);
		pMgr->AddAction(pMgr, name, COMMAND_ID_WEAPON_BASE + (w == 0 ? 9 : w - 1));
	}

	InstallDefaultMap();
	dsi_PrintToConsole("SDL input initialized (WASD, mouse look, LMB fire)");
	return true;
}

static void inp_Term(InputMgr *pMgr)
{
	(void)pMgr;
	g_bInitted = 0;
}

static bool inp_IsInitted(InputMgr *pMgr)
{
	(void)pMgr;
	return g_bInitted != 0;
}

static void inp_ListDevices(InputMgr *pMgr)
{
	(void)pMgr;
	dsi_PrintToConsole("Devices: Keyboard, Mouse");
}

static long inp_PlayJoystickEffect(InputMgr *, const char *, float, float)
{
	return 0;
}

static void inp_ReadInput(InputMgr *pMgr, unsigned char *pActionsOn, float axisOffsets[3])
{
	(void)pMgr;
	if (pActionsOn)
		memset(pActionsOn, 0, 256);
	if (axisOffsets) {
		axisOffsets[0] = 0;
		axisOffsets[1] = 0;
		axisOffsets[2] = 0;
	}

	int i;
	for (i = 0; i < MAX_BINDS; ++i) {
		SBind *b = &g_Binds[i];
		if (!b->used)
			continue;

		if (b->isAxis) {
			if (axisOffsets && b->axisIndex >= 0 && b->axisIndex < 3)
				axisOffsets[b->axisIndex] += g_MouseAccum[b->axisIndex] * (b->scale != 0 ? b->scale : 1.0f);
			continue;
		}

		int on = 0;
		if (b->isMouse) {
			if (b->mouseButton >= 0 && b->mouseButton < 8)
				on = g_MouseDown[b->mouseButton];
		} else if (b->sdlKey > 0 && (unsigned)b->sdlKey < MAX_KEYS) {
			on = g_KeyDown[b->sdlKey];
		}

		if (on && pActionsOn && b->actionCode >= 0 && b->actionCode < 256)
			pActionsOn[b->actionCode] = 1;
	}

	g_MouseAccum[0] = g_MouseAccum[1] = g_MouseAccum[2] = 0;
}

static bool inp_Flush(InputMgr *)
{
	memset(g_KeyDown, 0, sizeof(g_KeyDown));
	memset(g_MouseDown, 0, sizeof(g_MouseDown));
	g_MouseAccum[0] = g_MouseAccum[1] = g_MouseAccum[2] = 0;
	return true;
}

static LTRESULT inp_ClearInput()
{
	inp_Flush(NULL);
	return LT_OK;
}

static void inp_AddAction(InputMgr *, const char *pActionName, int actionCode)
{
	if (!pActionName || g_nActions >= MAX_ACTIONS)
		return;
	if (FindAction(pActionName))
		return;
	SAction *a = &g_Actions[g_nActions++];
	a->used = 1;
	a->code = actionCode;
	LTStrCpy(a->name, pActionName, sizeof(a->name));
}

static bool inp_EnableDevice(InputMgr *, const char *)
{
	return true;
}

static bool inp_ClearBindings(InputMgr *, const char *pDeviceName, const char *pTriggerName)
{
	int i;
	for (i = 0; i < MAX_BINDS; ++i) {
		if (!g_Binds[i].used)
			continue;
		if (pDeviceName && strcasecmp(g_Binds[i].deviceName, pDeviceName) != 0)
			continue;
		if (pTriggerName && strcasecmp(g_Binds[i].triggerName, pTriggerName) != 0)
			continue;
		g_Binds[i].used = 0;
	}
	return true;
}

static bool inp_AddBinding(InputMgr *,
	const char *pDeviceName, const char *pTriggerName, const char *pActionName,
	float rangeLow, float rangeHigh)
{
	int slot = AddBindSlot();
	if (slot < 0)
		return false;

	SBind *b = &g_Binds[slot];
	memset(b, 0, sizeof(*b));
	b->used = 1;
	b->rangeLow = rangeLow;
	b->rangeHigh = rangeHigh;
	b->scale = 1.0f;
	LTStrCpy(b->deviceName, pDeviceName ? pDeviceName : "", sizeof(b->deviceName));
	LTStrCpy(b->triggerName, pTriggerName ? pTriggerName : "", sizeof(b->triggerName));
	LTStrCpy(b->actionName, pActionName ? pActionName : "", sizeof(b->actionName));

	SAction *act = FindAction(pActionName);
	b->actionCode = act ? act->code : COMMAND_ID_UNASSIGNED;

	int mouse = (pDeviceName && strcasecmp(pDeviceName, "Mouse") == 0);
	b->isMouse = mouse;
	if (mouse) {
		if (pTriggerName && (strstr(pTriggerName, "X") || strstr(pTriggerName, "x-axis") || strcasecmp(pTriggerName, "X-axis") == 0)) {
			b->isAxis = 1;
			b->axisIndex = 0;
			b->actionCode = -1;
		} else if (pTriggerName && (strstr(pTriggerName, "Y") || strcasecmp(pTriggerName, "Y-axis") == 0)) {
			b->isAxis = 1;
			b->axisIndex = 1;
			b->actionCode = -2;
		} else if (pTriggerName && strstr(pTriggerName, "2")) {
			b->mouseButton = 3;
		} else if (pTriggerName && strstr(pTriggerName, "1")) {
			b->mouseButton = 3;
		} else {
			b->mouseButton = 1;
		}
		if (pTriggerName && (strcasecmp(pTriggerName, "Button 0") == 0 || strcasecmp(pTriggerName, "Button0") == 0))
			b->mouseButton = 1;
		if (pTriggerName && (strcasecmp(pTriggerName, "Button 1") == 0 || strcasecmp(pTriggerName, "Button1") == 0))
			b->mouseButton = 3;
	} else {
		b->sdlKey = SDLKeyFromName(pTriggerName);
	}
	return true;
}

static bool inp_ScaleTrigger(InputMgr *, const char *, const char *,
	float scale, float, float, float)
{
	(void)scale;
	return true;
}

static DeviceBinding *inp_GetDeviceBindings(uint32)
{
	return NULL;
}

static void inp_FreeDeviceBindings(DeviceBinding *)
{
}

static bool inp_StartDeviceTrack(InputMgr *, uint32, uint32) { return true; }
static bool inp_TrackDevice(DeviceInput *, uint32 *pInOut)
{
	if (pInOut)
		*pInOut = 0;
	return true;
}
static bool inp_EndDeviceTrack() { return true; }

static DeviceObject *inp_GetDeviceObjects(uint32) { return NULL; }
static void inp_FreeDeviceObjects(DeviceObject *) {}

static bool inp_GetDeviceName(uint32 nDeviceType, char *pStrBuffer, uint32 nBufferSize)
{
	const char *n = "Keyboard";
	if (nDeviceType == DEVICETYPE_MOUSE)
		n = "Mouse";
	else if (nDeviceType == DEVICETYPE_JOYSTICK)
		n = "Joystick";
	LTStrCpy(pStrBuffer, n, nBufferSize);
	return true;
}

static bool inp_GetDeviceObjectName(char const*, uint32, char* psz, uint32 n)
{
	if (psz && n)
		psz[0] = 0;
	return false;
}

static bool inp_IsDeviceEnabled(const char *) { return true; }
static bool inp_ShowDeviceObjects(const char *) { return true; }
static bool inp_ShowInputDevices() { return true; }

static void FillTable()
{
	g_MainInputMgr.Init = inp_Init;
	g_MainInputMgr.Term = inp_Term;
	g_MainInputMgr.IsInitted = inp_IsInitted;
	g_MainInputMgr.ListDevices = inp_ListDevices;
	g_MainInputMgr.PlayJoystickEffect = inp_PlayJoystickEffect;
	g_MainInputMgr.ReadInput = inp_ReadInput;
	g_MainInputMgr.FlushInputBuffers = inp_Flush;
	g_MainInputMgr.ClearInput = inp_ClearInput;
	g_MainInputMgr.AddAction = inp_AddAction;
	g_MainInputMgr.EnableDevice = inp_EnableDevice;
	g_MainInputMgr.ClearBindings = inp_ClearBindings;
	g_MainInputMgr.AddBinding = inp_AddBinding;
	g_MainInputMgr.ScaleTrigger = inp_ScaleTrigger;
	g_MainInputMgr.GetDeviceBindings = inp_GetDeviceBindings;
	g_MainInputMgr.FreeDeviceBindings = inp_FreeDeviceBindings;
	g_MainInputMgr.StartDeviceTrack = inp_StartDeviceTrack;
	g_MainInputMgr.TrackDevice = inp_TrackDevice;
	g_MainInputMgr.EndDeviceTrack = inp_EndDeviceTrack;
	g_MainInputMgr.GetDeviceObjects = inp_GetDeviceObjects;
	g_MainInputMgr.FreeDeviceObjects = inp_FreeDeviceObjects;
	g_MainInputMgr.GetDeviceName = inp_GetDeviceName;
	g_MainInputMgr.GetDeviceObjectName = inp_GetDeviceObjectName;
	g_MainInputMgr.IsDeviceEnabled = inp_IsDeviceEnabled;
	g_MainInputMgr.ShowDeviceObjects = inp_ShowDeviceObjects;
	g_MainInputMgr.ShowInputDevices = inp_ShowInputDevices;
}

LTRESULT input_GetManager(InputMgr **pMgr)
{
	FillTable();
	*pMgr = &g_MainInputMgr;
	return LT_OK;
}

void input_SaveBindings(FILE *fp)
{
	(void)fp;
}
