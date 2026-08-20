#ifdef EMSCRIPTEN
#include "cdll_int.h"
#include "host.h"
#include "inputsystem/InputEnums.h"
#include "inputsystem/AnalogCode.h"
#include "inputsystem/ButtonCode.h"
#include "vgui_baseui_interface.h"
#include "VGuiMatSurface/IMatSystemSurface.h"
#include "sys_dll.h"
#include "tier1/convar.h"
#include "tier1/strtools.h"
#include "icvar.h"
#include "cmd.h"

extern bool scr_drawloading;
extern IVEngineClient *engineClient;

static int g_source_wasm_capture_intent = 0;
static char g_source_wasm_player_name[64] = "Player";
static float g_source_wasm_pointer_x = 640.f;
static float g_source_wasm_pointer_y = 360.f;
static int g_source_wasm_pointer_captured = 0;

extern "C" {

int source_wasm_read_engine_state(void)
{
	// Native truth only: initialization and the loading plaque are loading,
	// a visible GameUI is menu, and gameplay requires an active engine level.
	if (IsInErrorExit())
		return 6;
	if (!host_initialized || scr_drawloading)
		return 1;
	IEngineVGuiInternal *ui = EngineVGui();
	if (!ui || !ui->IsInitialized())
		return 1;
	if (ui->IsGameUIVisible())
		return 2;
	if (!engineClient || !engineClient->IsInGame())
		return 1;
	const int localPlayer = engineClient->GetLocalPlayer();
	if (localPlayer <= 0)
		return 1;
	player_info_t playerInfo = {};
	if (!engineClient->GetPlayerInfo(localPlayer, &playerInfo))
		return 1;
	return engineClient->IsPaused() ? 4 : 3;
}

int source_wasm_read_capture_intent(void)
{
	return g_source_wasm_capture_intent;
}

void source_wasm_set_capture_intent(int value)
{
	g_source_wasm_capture_intent = value ? 1 : 0;
}

void source_wasm_pause(void)
{
	IEngineVGuiInternal *ui = EngineVGui();
	if (ui)
		ui->ActivateGameUI();
}

void source_wasm_pointer(float x, float y, int captured)
{
	g_source_wasm_pointer_x = x;
	g_source_wasm_pointer_y = y;
	g_source_wasm_pointer_captured = captured ? 1 : 0;
	if (g_pMatSystemSurface)
	{
		InputEvent_t event = { IE_AnalogValueChanged, 0, MOUSE_XY, (int)x, (int)y };
		g_pMatSystemSurface->HandleInputEvent(event);
	}
}

static ButtonCode_t SourceWasmMouseButton(int button)
{
	switch (button)
	{
	case 1: return MOUSE_MIDDLE;
	case 2: return MOUSE_RIGHT;
	case 3: return MOUSE_4;
	case 4: return MOUSE_5;
	default: return MOUSE_LEFT;
	}
}

void source_wasm_pointer_button(float x, float y, int button, int pressed)
{
	source_wasm_pointer(x, y, g_source_wasm_pointer_captured);
	IEngineVGuiInternal *ui = EngineVGui();
	const bool wasVisible = ui && ui->IsInitialized() && ui->IsGameUIVisible();
	InputEvent_t event = { pressed ? IE_ButtonPressed : IE_ButtonReleased, 0,
		(int)SourceWasmMouseButton(button), (int)SourceWasmMouseButton(button), 0 };
	if (ui)
		ui->Key_Event(event);
	else if (g_pMatSystemSurface)
		g_pMatSystemSurface->HandleInputEvent(event);
	const bool isVisible = ui && ui->IsInitialized() && ui->IsGameUIVisible();
	// A trusted menu action is the only path that raises capture intent: the
	// native UI must have synchronously hidden itself in response to this click.
	if (pressed && wasVisible && !isVisible)
		g_source_wasm_capture_intent = 1;
	if (!pressed && !wasVisible && isVisible)
		g_source_wasm_capture_intent = 0;
}

void source_wasm_set_player_name(const char *name)
{
	if (!name || !name[0])
		name = "Player";
	Q_strncpy(g_source_wasm_player_name, name, sizeof(g_source_wasm_player_name));
	ConVar *nameVar = g_pCVar ? g_pCVar->FindVar("name") : NULL;
	if (nameVar)
		nameVar->SetValue(g_source_wasm_player_name);
}

void source_wasm_set_cvar(const char *name, const char *value)
{
	if (!name || !value || !g_pCVar)
		return;
	ConVar *var = g_pCVar->FindVar(name);
	if (var)
		var->SetValue(value);
}

void source_wasm_client_cmd(const char *cmd)
{
	if (!cmd || !cmd[0])
		return;
	Cbuf_AddText(cmd);
	if (cmd[Q_strlen(cmd) - 1] != '\n')
		Cbuf_AddText("\n");
}

}

#endif
