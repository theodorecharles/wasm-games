#include "bdefs.h"
#include "dsys_interface.h"

#include "clientmgr.h"
#include "icommandlineargs.h"
#include "iclientshell.h"
#include "input.h"
#include "render.h"
#include "sysdebugging.h"

#include <SDL.h>
#ifdef __APPLE__
#include <OpenGL/gl.h>
#else
#include <GL/gl.h>
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <vector>

static ICommandLineArgs *command_line_args;
define_holder(ICommandLineArgs, command_line_args);

static IClientShell *i_client_shell;
define_holder(IClientShell, i_client_shell);

extern char g_SSFile[];
extern LTBOOL g_bNullRender;
extern int32 g_CV_CursorCenter;
extern int32 g_nConsoleLines;
extern LTBOOL g_bConsoleEnable;
extern int32 g_bShowRunningTime;
extern LTBOOL g_CV_HighPriority;
extern int32 g_CV_PlayDemoReps;
extern int32 g_CV_NoDefaultEngineRez;

uint32 g_EngineStartMS;
uint32 g_CurRunIteration = 0;

static SDL_Window *g_pSdlWindow = NULL;
static SDL_GLContext g_pSdlGl = NULL;
static int g_bQuitRequested = 0;

extern void sdl_input_OnMouseMotion(int dx, int dy);
extern void sdl_input_OnMouseButton(int button, int down);
extern void sdl_input_OnKey(int sdlKey, int down);
extern unsigned int sdl_input_MapSDLKey(int sdlKey);

extern "C" {
void lithtech_OnMouseMove(int x, int y);
void lithtech_OnLButtonDown(int x, int y);
void lithtech_OnLButtonUp(int x, int y);
void lithtech_OnRButtonDown(int x, int y);
void lithtech_OnRButtonUp(int x, int y);
int lithtech_AutoStartGame(void);
}

static const char *DefaultDataDir()
{
	const char *env = getenv("NOLF2_DATA");
	if (env && env[0])
		return env;
	return "/home/ted/wasm-game-data/nolf2/game";
}

static void PushKeyDown(unsigned int vk, int rep)
{
	if (g_ClientGlob.m_nKeyDowns < MAX_KEYBUFFER) {
		g_ClientGlob.m_KeyDowns[g_ClientGlob.m_nKeyDowns] = vk;
		g_ClientGlob.m_KeyDownReps[g_ClientGlob.m_nKeyDowns] = rep;
		++g_ClientGlob.m_nKeyDowns;
	}
}

static void PushKeyUp(unsigned int vk)
{
	if (g_ClientGlob.m_nKeyUps < MAX_KEYBUFFER)
		g_ClientGlob.m_KeyUps[g_ClientGlob.m_nKeyUps++] = vk;
}

static void HandleSDLEvent(const SDL_Event *ev)
{
	switch (ev->type) {
	case SDL_QUIT:
		g_bQuitRequested = 1;
		dsi_OnClientShutdown(LTNULL);
		break;
	case SDL_WINDOWEVENT:
		if (ev->window.event == SDL_WINDOWEVENT_CLOSE) {
			g_bQuitRequested = 1;
			dsi_OnClientShutdown(LTNULL);
		} else if (ev->window.event == SDL_WINDOWEVENT_FOCUS_GAINED) {
			g_ClientGlob.m_bLostFocus = 0;
			g_ClientGlob.m_bClientActive = 1;
			if (i_client_shell)
				i_client_shell->OnEvent(LTEVENT_GAINEDFOCUS, 0);
			if (g_pClientMgr)
				g_pClientMgr->ClearInput();
		} else if (ev->window.event == SDL_WINDOWEVENT_FOCUS_LOST) {
			g_ClientGlob.m_bLostFocus = 1;
			/* Keep the sim running so splash/menu timers don't freeze. */
			if (i_client_shell)
				i_client_shell->OnEvent(LTEVENT_LOSTFOCUS, 0);
		}
		break;
	case SDL_KEYDOWN: {
		int sdlKey = ev->key.keysym.sym;
		unsigned int vk = sdl_input_MapSDLKey(sdlKey);
		/* F10 / Alt+F4 quit the host. Escape is the in-game/menu Back key. */
		if (sdlKey == SDLK_F10 ||
			(sdlKey == SDLK_F4 && (ev->key.keysym.mod & KMOD_ALT))) {
			g_bQuitRequested = 1;
			dsi_OnClientShutdown(LTNULL);
		}
		if (sdlKey == SDLK_BACKQUOTE) {
			if (g_bConsoleEnable || g_ClientGlob.m_bIsConsoleUp)
				dsi_SetConsoleUp(!dsi_IsConsoleUp());
		}
		if (vk)
			PushKeyDown(vk, ev->key.repeat ? 1 : 0);
		sdl_input_OnKey(sdlKey, 1);
		break;
	}
	case SDL_KEYUP: {
		int sdlKey = ev->key.keysym.sym;
		unsigned int vk = sdl_input_MapSDLKey(sdlKey);
		if (vk)
			PushKeyUp(vk);
		sdl_input_OnKey(sdlKey, 0);
		break;
	}
	case SDL_MOUSEMOTION:
		sdl_input_OnMouseMotion(ev->motion.xrel, ev->motion.yrel);
		lithtech_OnMouseMove(ev->motion.x, ev->motion.y);
		break;
	case SDL_MOUSEBUTTONDOWN:
		sdl_input_OnMouseButton(ev->button.button, 1);
		if (ev->button.button == SDL_BUTTON_LEFT)
			lithtech_OnLButtonDown(ev->button.x, ev->button.y);
		else if (ev->button.button == SDL_BUTTON_RIGHT)
			lithtech_OnRButtonDown(ev->button.x, ev->button.y);
		break;
	case SDL_MOUSEBUTTONUP:
		sdl_input_OnMouseButton(ev->button.button, 0);
		if (ev->button.button == SDL_BUTTON_LEFT)
			lithtech_OnLButtonUp(ev->button.x, ev->button.y);
		else if (ev->button.button == SDL_BUTTON_RIGHT)
			lithtech_OnRButtonUp(ev->button.x, ev->button.y);
		break;
	default:
		break;
	}
}

static bool SetupArgs(int argc, char **argv)
{
	static const char *kDefault[] = {
		"-rez", "GAME.REZ",
		"-rez", "GAME2.REZ",
		"-rez", "GAMEDLL.REZ",
		"-rez", "SOUND.REZ",
		"-rez", "Engine.REZ",
		"+skiptitle", "1",
		"+NoMovies", "1"
	};
	const int kDefaultCount = (int)(sizeof(kDefault) / sizeof(kDefault[0]));

	int hasRez = 0;
	int i;
	for (i = 0; i < argc && argv; ++i) {
		if (argv[i] && strcasecmp(argv[i], "-rez") == 0)
			hasRez = 1;
	}

	int extra = hasRez ? 0 : kDefaultCount;
	int total = argc + extra;
	if (total < 1)
		total = 1;

	char **out = (char **)malloc((size_t)total * sizeof(char *));
	if (!out)
		return false;

	for (i = 0; i < argc; ++i)
		out[i] = argv ? argv[i] : (char *)"";
	for (i = 0; i < extra; ++i)
		out[argc + i] = (char *)kDefault[i];

	if (!command_line_args) {
		free(out);
		fprintf(stderr, "SetupArgs: ICommandLineArgs holder is NULL\n");
		return false;
	}
	command_line_args->Init(total, out);
	fprintf(stderr, "SetupArgs: %d args (extra rez=%d)\n", total, extra);
	free(out);
	return true;
}

static bool StartClient(ClientGlob *pGlob)
{
	const char *resTrees[MAX_RESTREES];
	uint32 nResTrees = 0;
	char strVersion[32];

	pGlob->m_bHost = command_line_args->FindArgDash("host") != NULL;
	pGlob->m_pWorldName = command_line_args->FindArgDash("world");

	uint32 i;
	for (i = 0; i + 1 < command_line_args->Argc(); ++i) {
		if (strcasecmp(command_line_args->Argv(i), "-rez") == 0) {
			resTrees[nResTrees++] = command_line_args->Argv(i + 1);
			if (nResTrees + 1 >= MAX_RESTREES)
				break;
		}
	}

	if (!g_CV_NoDefaultEngineRez) {
		int hasEngine = 0;
		uint32 t;
		for (t = 0; t < nResTrees; ++t) {
			if (strcasecmp(resTrees[t], "engine.rez") == 0)
				hasEngine = 1;
		}
		if (!hasEngine && nResTrees + 1 < MAX_RESTREES)
			resTrees[nResTrees++] = "engine.rez";
	}

	if (command_line_args->FindArgDash("noinput"))
		pGlob->m_bInputEnabled = 0;

	static const uint32 knMaxConfigFiles = 16;
	const char *pszConfigFiles[knMaxConfigFiles];
	uint32 nNumConfigFiles = 0;
	const char *pszAutoExecFileName = command_line_args->FindArgDash("config");
	pszConfigFiles[nNumConfigFiles++] = pszAutoExecFileName ? pszAutoExecFileName : "autoexec.cfg";
	const char *pszDisplayFileName = command_line_args->FindArgDash("display");
	pszConfigFiles[nNumConfigFiles++] = pszDisplayFileName ? pszDisplayFileName : "display.cfg";

#ifdef USE_ABSTRACT_SOUND_INTERFACES
	const char *pcSoundDriverName = command_line_args->FindArg(SOUND_DRIVER_NAME_ARG);
	if (pcSoundDriverName) {
		int n;
		for (n = 0; n < SOUND_DRIVER_NAME_LEN && pcSoundDriverName[n]; ++n)
			pGlob->m_acSoundDriverName[n] = pcSoundDriverName[n];
		if (n < SOUND_DRIVER_NAME_LEN)
			pGlob->m_acSoundDriverName[n] = 0;
	} else {
		pGlob->m_acSoundDriverName[0] = 0;
	}
#endif

	uint32 initStartTime = timeGetTime();
	fprintf(stderr, "CClientMgr::Init with %u rez trees...\n", nResTrees);
	for (i = 0; i < nResTrees; ++i)
		fprintf(stderr, "  rez[%u]=%s\n", i, resTrees[i]);
	if (g_pClientMgr->Init(resTrees, nResTrees, nNumConfigFiles, pszConfigFiles) != LT_OK)
		return false;

	g_pClientMgr->m_VersionInfo.GetString(strVersion, sizeof(strVersion));
	fprintf(stderr, "LithTech build %s initialized in %.2f seconds.\n",
		strVersion, (float)(timeGetTime() - initStartTime) / 1000.0f);
	return true;
}

static int RunClientApp()
{
	ClientGlob *pGlob = &g_ClientGlob;
	memset(pGlob, 0, sizeof(*pGlob));
	pGlob->m_bConsoleEnabled = true;
	pGlob->m_bInputEnabled = 1;

	if (dsi_Init() != 0) {
		fprintf(stderr, "dsi_Init failed\n");
		dsi_Term();
		return -1;
	}

	pGlob->m_hInstance = (void*)(uintptr_t)1;
	pGlob->m_WndClassName = (char*)"LithTech";
	pGlob->m_WndCaption = "No One Lives Forever 2";
	cm_Init();
	pGlob->m_bClientActive = 1;

	const char *title = command_line_args->FindArgDash("windowtitle");
	if (title)
		pGlob->m_WndCaption = title;

	if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_TIMER | SDL_INIT_EVENTS) != 0) {
		fprintf(stderr, "SDL_Init: %s\n", SDL_GetError());
		dsi_Term();
		return -1;
	}

	SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
	SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
	SDL_GL_SetAttribute(SDL_GL_RED_SIZE, 8);
	SDL_GL_SetAttribute(SDL_GL_GREEN_SIZE, 8);
	SDL_GL_SetAttribute(SDL_GL_BLUE_SIZE, 8);
	SDL_GL_SetAttribute(SDL_GL_ALPHA_SIZE, 8);

	g_pSdlWindow = SDL_CreateWindow(pGlob->m_WndCaption,
		SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
		640, 480, SDL_WINDOW_OPENGL | SDL_WINDOW_SHOWN);
	if (!g_pSdlWindow) {
		fprintf(stderr, "SDL_CreateWindow: %s\n", SDL_GetError());
		SDL_Quit();
		dsi_Term();
		return -1;
	}

	g_pSdlGl = SDL_GL_CreateContext(g_pSdlWindow);
	if (!g_pSdlGl) {
		fprintf(stderr, "SDL_GL_CreateContext: %s\n", SDL_GetError());
		SDL_DestroyWindow(g_pSdlWindow);
		SDL_Quit();
		dsi_Term();
		return -1;
	}
	SDL_GL_MakeCurrent(g_pSdlWindow, g_pSdlGl);
	SDL_GL_SetSwapInterval(0);
	SDL_SetRelativeMouseMode(SDL_FALSE);
	SDL_ShowCursor(SDL_ENABLE);

	pGlob->m_hMainWnd = g_pSdlWindow;

	int nExitValue = 0;
	if (StartClient(pGlob)) {
		pGlob->m_bProcessWindowMessages = 1;
		int nFrames = 0;
		int nDumped = 0;
		int nAuto = 0;
		const char *autoStart = getenv("NOLF2_AUTOSTART");
		for (;;) {
			SDL_Event ev;
			while (SDL_PollEvent(&ev))
				HandleSDLEvent(&ev);

			if (g_bQuitRequested || pGlob->m_bAppClosing)
				break;

			if (!g_pClientMgr)
				break;
			LTRESULT dResult = g_pClientMgr->Update();
			if (dResult != LT_OK)
				break;

			++nFrames;
			if (autoStart && autoStart[0] == '1' && !nAuto && nFrames >= 200) {
				nAuto = 1;
				fprintf(stderr, "NOLF2_AUTOSTART: firing StartGameNew\n");
				lithtech_AutoStartGame();
			}
			if (!nDumped && nFrames >= 180 && g_pSdlWindow) {
				int w = 0, h = 0;
				SDL_GL_GetDrawableSize(g_pSdlWindow, &w, &h);
				if (w > 0 && h > 0) {
					std::vector<unsigned char> px((size_t)w * (size_t)h * 3);
					glPixelStorei(GL_PACK_ALIGNMENT, 1);
					glReadPixels(0, 0, w, h, GL_RGB, GL_UNSIGNED_BYTE, &px[0]);
					FILE *fp = fopen("/tmp/nolf2_foo.ppm", "wb");
					if (fp) {
						fprintf(fp, "P6\n%d %d\n255\n", w, h);
						for (int y = h - 1; y >= 0; --y)
							fwrite(&px[(size_t)y * (size_t)w * 3], 1, (size_t)w * 3, fp);
						fclose(fp);
						fprintf(stderr, "wrote /tmp/nolf2_foo.ppm %dx%d after %d frames\n",
							w, h, nFrames);
					}
					nDumped = 1;
				}
			}

			if (g_bShowRunningTime) {
				dsi_PrintToConsole("Running for %.1f seconds",
					(float)(timeGetTime() - g_EngineStartMS) / 1000.0f);
			}
		}
	} else {
		fprintf(stderr, "StartClient / CClientMgr::Init failed: %s\n",
			pGlob->m_ExitMessage[0] ? pGlob->m_ExitMessage : "(see stderr)");
		nExitValue = 1;
	}

	pGlob->m_bProcessWindowMessages = 0;
	if (g_pClientMgr) {
		g_pClientMgr->Term();
		delete g_pClientMgr;
		g_pClientMgr = LTNULL;
	}

	if (g_pSdlGl) {
		SDL_GL_DeleteContext(g_pSdlGl);
		g_pSdlGl = NULL;
	}
	if (g_pSdlWindow) {
		SDL_DestroyWindow(g_pSdlWindow);
		g_pSdlWindow = NULL;
		pGlob->m_hMainWnd = NULL;
	}
	SDL_Quit();
	dsi_Term();
	return nExitValue;
}

int main(int argc, char **argv)
{
	LTMemInit();
	g_EngineStartMS = timeGetTime();

	const char *data = DefaultDataDir();
	if (chdir(data) != 0) {
		fprintf(stderr, "chdir(%s) failed\n", data);
		return 1;
	}
	fprintf(stderr, "nolf2_engine data dir: %s\n", data);

	if (!SetupArgs(argc, argv)) {
		fprintf(stderr, "SetupArgs failed\n");
		return -1;
	}

	fprintf(stderr, "nolf2_engine starting client\n");
	return RunClientApp();
}
