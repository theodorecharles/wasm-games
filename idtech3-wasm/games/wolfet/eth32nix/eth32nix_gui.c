/*
 * ETH32NIX rabbmod in-game UI — settings windows from guidefs.h.
 * Checkboxes, sliders, and dropboxes; mouse-driven when /aimbot menu is open.
 */
#include "eth32nix.h"

#ifdef __EMSCRIPTEN__

typedef enum
{
	ETH32_CTRL_CHECK = 0,
	ETH32_CTRL_SLIDERF,
	ETH32_CTRL_SLIDERI,
	ETH32_CTRL_DROP
} eth32_ctrlKind_t;

typedef struct
{
	eth32_ctrlKind_t kind;
	const char      *label;
	void            *target;
	float            min, max;
	int              imin, imax;
	const char     **names;
} eth32_ctrl_t;

typedef struct
{
	const char   *title;
	eth32_ctrl_t *ctrls;
	int           count;
} eth32_tab_t;

#define CCHECK(lab, ptr)        { ETH32_CTRL_CHECK, (lab), (ptr), 0, 0, 0, 0, NULL }
#define CSLIDEF(lab, ptr, a, b) { ETH32_CTRL_SLIDERF, (lab), (ptr), (a), (b), 0, 0, NULL }
#define CSLIDEI(lab, ptr, a, b) { ETH32_CTRL_SLIDERI, (lab), (ptr), 0, 0, (a), (b), NULL }
#define CDROP(lab, ptr, names, maxv) { ETH32_CTRL_DROP, (lab), (ptr), 0, 0, 0, (maxv), (names) }

static eth32_ctrl_t eth32_tabAim[] =
{
	CDROP("Aimbot Mode", &eth32.s.aimMode, eth32_aimModeText, ETH32_AIMMODE_MAX - 1),
	CDROP("Aim Type", &eth32.s.aimType, eth32_aimTypeText, ETH32_AIM_MAX - 1),
	CCHECK("Autofire", &eth32.s.autofire),
	CCHECK("Validate Attack", &eth32.s.atkValidate),
	CCHECK("Target Lock", &eth32.s.lockTarget),
	CSLIDEF("FOV", &eth32.s.fov, 0, 360),
	CDROP("Target Sort", &eth32.s.aimSort, eth32_sortText, ETH32_SORT_MAX - 1),
	CDROP("Aim Priority", &eth32.s.headbody, eth32_priorityText, ETH32_AP_MAX - 1),
	CDROP("Head Trace", &eth32.s.headTraceType, eth32_headTraceText, ETH32_HEAD_MAX - 1),
	CDROP("Body Trace", &eth32.s.bodyTraceType, eth32_bodyTraceText, ETH32_BODY_MAX - 1),
	CSLIDEF("Dynamic Hitbox", &eth32.s.dynamicHitboxScale, 0, 3),
	CSLIDEF("Anim. Correction", &eth32.s.animCorrection, -10, 10),
	CCHECK("Auto Crouch", &eth32.s.autoCrouch),
	CDROP("Hitbox Style", &eth32.s.hitboxType, eth32_hitboxText, ETH32_HITBOX_MAX - 1),
};

static eth32_ctrl_t eth32_tabNade[] =
{
	CCHECK("Grenade Aimbot", &eth32.s.grenadeBot),
	CCHECK("Riflenade Aimbot", &eth32.s.rifleBot),
	CCHECK("Block fire", &eth32.s.grenadeBlockFire),
	CCHECK("Grenade Trajectory", &eth32.s.valGrenTrajectory),
	CCHECK("Rifle Trajectory", &eth32.s.valRifleTrajectory),
	CCHECK("Grenade Senslock", &eth32.s.grenadeSenslock),
	CSLIDEF("Rifle Z Corr.", &eth32.s.riflenadeZ, -50, 50),
	CSLIDEF("Grenade Z Corr.", &eth32.s.grenadeZ, -50, 50),
	CSLIDEI("Grenade Fire Delay", &eth32.s.grenadeFireDelay, 0, 1000),
	CCHECK("Grenade Autofire", &eth32.s.grenadeAutoFire),
	CCHECK("Riflenade Autofire", &eth32.s.rifleAutoFire),
	CDROP("Target Predict", &eth32.s.ballisticPredict, eth32_rfPredText, ETH32_RF_MAX - 1),
	CCHECK("Check Radius Damage", &eth32.s.ballisticRadiusDamage),
	CSLIDEF("Blast radius", &eth32.s.radiusDamage, 30, 500),
	CCHECK("Auto Targets", &eth32.s.autoGrenTargets),
	CCHECK("Multi Bounce", &eth32.s.allowMultiBounce),
};

static eth32_ctrl_t eth32_tabHuman[] =
{
	CDROP("Human Mode", &eth32.s.humanMode, eth32_humanText, ETH32_HUMAN_MAX - 1),
	CSLIDEF("Simple Speed", &eth32.s.human1_speed, 0, 0.2f),
	CSLIDEF("Full Human Value", &eth32.s.human2_humanValue, 0, 0.2f),
	CSLIDEF("Full Speed X", &eth32.s.human2_aimX, 0, 10),
	CSLIDEF("Full Speed Y", &eth32.s.human2_aimY, 0, 10),
	CSLIDEF("Full DivMin", &eth32.s.human2_divMin, 0, 10),
	CSLIDEF("Full DivMax", &eth32.s.human2_divMax, 0, 10),
	CDROP("Aim Protect", &eth32.s.aimprotect, eth32_protectText, ETH32_PROTECT_MAX - 1),
	CCHECK("Lock mouse while aiming", &eth32.s.lockMouse),
	CCHECK("Randomized Aim", &eth32.s.randomAim),
	CSLIDEI("Shake Frequency ms", &eth32.s.shakeFreq, 500, 20000),
	CSLIDEI("Random Factor X", &eth32.s.randFactX, 0, 1000),
	CSLIDEI("Random Factor Y", &eth32.s.randFactY, 0, 1000),
	CSLIDEI("Random Factor Z", &eth32.s.randFactZ, 0, 1000),
};

static eth32_ctrl_t eth32_tabExtra[] =
{
	CSLIDEF("Head Hitbox Size", &eth32.s.headBoxSize, 1, 15),
	CSLIDEF("Body Hitbox Size", &eth32.s.bodybox, 1, 40),
	CCHECK("Auto weapon Delay", &eth32.s.autoDelay),
	CSLIDEI("Delay Close", &eth32.s.delayClose, 0, 50),
	CSLIDEI("Delay Med", &eth32.s.delayMed, 0, 50),
	CSLIDEI("Delay Far", &eth32.s.delayFar, 0, 50),
	CCHECK("Auto X Vecs", &eth32.s.autoVecX),
	CCHECK("Auto Z Vecs", &eth32.s.autoVecZ),
	CCHECK("Preshoot", &eth32.s.preShoot),
	CCHECK("Preaim", &eth32.s.preAim),
	CSLIDEF("Preshoot Time", &eth32.s.preShootTime, 0, 300),
	CSLIDEF("Preaim Time", &eth32.s.preAimTime, 0, 300),
	CDROP("Self Predict", &eth32.s.predSelfType, eth32_selfPredText, ETH32_SPR_MAX - 1),
	CSLIDEF("Self Predict Amt", &eth32.s.predSelf, -0.1f, 0.1f),
	CCHECK("Auto predict BOTs", &eth32.s.autoPredictBots),
	CSLIDEF("Target Predict", &eth32.s.pred, -0.1f, 0.1f),
	CSLIDEF("BOT Predict", &eth32.s.predbot, -0.1f, 0.1f),
};

static eth32_ctrl_t eth32_tabVis[] =
{
	CCHECK("Hack Visuals", &eth32.s.drawHackVisuals),
	CCHECK("Wallhack", &eth32.s.wallhack),
	CCHECK("ESP Names", &eth32.s.espName),
	CCHECK("Box ESP", &eth32.s.boxEsp),
	CCHECK("Item ESP", &eth32.s.itemEsp),
	CCHECK("Disguised marker", &eth32.s.drawDisguised),
	CCHECK("Head Hitbox", &eth32.s.drawHeadHitbox),
	CCHECK("Body Hitbox", &eth32.s.drawBodyHitbox),
	CCHECK("Banner", &eth32.s.guiBanner),
	CCHECK("Respawn window", &eth32.s.respawnTimers),
	CCHECK("Grenade Dlight", &eth32.s.grenadeDlight),
	CCHECK("Mortar Dlight", &eth32.s.mortarDlight),
	CCHECK("Mortar Trace", &eth32.s.mortarTrace),
	CCHECK("Arty Markers", &eth32.s.artyMarkers),
	CCHECK("Remove Foliage", &eth32.s.removeFoliage),
	CCHECK("Remove Particles", &eth32.s.removeParticles),
	CSLIDEF("Radar Range", &eth32.s.radarRange, 500, 8000),
	CSLIDEI("Smoke Alpha", &eth32.s.smoketrnsp, 0, 255),
};

static eth32_ctrl_t eth32_tabEsp[] =
{
	CDROP("Class ESP", &eth32.s.classEspType, eth32_classEspText, ETH32_CLS_MAX - 1),
	CSLIDEF("Class Size", &eth32.s.clsSize, 6, 32),
	CSLIDEF("Class Opacity", &eth32.s.clsOpacity, 0.1f, 1),
	CSLIDEF("Box Opacity", &eth32.s.boxEspOpacity, 0.1f, 1),
	CSLIDEI("Box Border", &eth32.s.boxEspBorder, 1, 5),
	CSLIDEF("Item Size", &eth32.s.itemEspSize, 6, 32),
	CSLIDEF("Item Opacity", &eth32.s.itemEspOpacity, 0.1f, 1),
	CCHECK("Team Cham 1", &eth32.s.teamShader1),
	CCHECK("Team Cham WH", &eth32.s.teamShader1Wallhack),
	CCHECK("Enemy Cham 1", &eth32.s.enemyShader1),
	CCHECK("Enemy Cham WH", &eth32.s.enemyShader1Wallhack),
	CCHECK("Weapon WH", &eth32.s.weaponShader1Wallhack),
	CCHECK("Item WH", &eth32.s.itemShader1Wallhack),
};

static eth32_tab_t eth32_tabs[] =
{
	{ "Aimbot", eth32_tabAim, ARRAY_LEN(eth32_tabAim) },
	{ "Grenade", eth32_tabNade, ARRAY_LEN(eth32_tabNade) },
	{ "Human", eth32_tabHuman, ARRAY_LEN(eth32_tabHuman) },
	{ "Extra", eth32_tabExtra, ARRAY_LEN(eth32_tabExtra) },
	{ "Visuals", eth32_tabVis, ARRAY_LEN(eth32_tabVis) },
	{ "ESP", eth32_tabEsp, ARRAY_LEN(eth32_tabEsp) },
};

static qboolean ETH32_Hit(float x, float y, float w, float h)
{
	return (eth32.cursorX >= x && eth32.cursorX <= x + w &&
	        eth32.cursorY >= y && eth32.cursorY <= y + h) ? qtrue : qfalse;
}

static void ETH32_Paint(float x, float y, float scale, const char *text, vec4_t color)
{
	CG_Text_Paint_Ext(x, y, scale, scale, color, text, 0, 0, ITEM_TEXTSTYLE_SHADOWED, &cgs.media.limboFont2);
}

static void ETH32_ApplySliderF(eth32_ctrl_t *c, float x, float w)
{
	float t = (eth32.cursorX - x) / w;

	if (t < 0.f)
	{
		t = 0.f;
	}
	if (t > 1.f)
	{
		t = 1.f;
	}
	*(float *)c->target = c->min + t * (c->max - c->min);
}

static void ETH32_ApplySliderI(eth32_ctrl_t *c, float x, float w)
{
	float t = (eth32.cursorX - x) / w;

	if (t < 0.f)
	{
		t = 0.f;
	}
	if (t > 1.f)
	{
		t = 1.f;
	}
	*(int *)c->target = c->imin + (int)(t * (c->imax - c->imin) + 0.5f);
}

static void ETH32_ClickCtrl(eth32_ctrl_t *c, float x, float w)
{
	int *iv;

	switch (c->kind)
	{
	case ETH32_CTRL_CHECK:
		*(qboolean *)c->target = !*(qboolean *)c->target;
		break;
	case ETH32_CTRL_DROP:
		iv = (int *)c->target;
		*iv += 1;
		if (*iv > c->imax)
		{
			*iv = 0;
		}
		break;
	case ETH32_CTRL_SLIDERF:
		ETH32_ApplySliderF(c, x, w);
		break;
	case ETH32_CTRL_SLIDERI:
		ETH32_ApplySliderI(c, x, w);
		break;
	}
}

qboolean ETH32_KeyEvent(int key, qboolean down)
{
	eth32_tab_t *tab;
	int          i;
	float        y, x = 20.f, w = 240.f;

	if (!ETH32_MenuOpen())
	{
		return qfalse;
	}
	if (key == K_CONSOLE)
	{
		return qfalse;
	}
	if (key == K_ESCAPE && down)
	{
		ETH32_CancelAndClose();
		return qtrue;
	}
	if (key != K_MOUSE1 || !down)
	{
		if (key == K_MOUSE1 && !down)
		{
			eth32.dragCtrl = -1;
		}
		return qtrue;
	}

	for (i = 0; i < (int)ARRAY_LEN(eth32_tabs); i++)
	{
		if (ETH32_Hit(12.f + i * 70.f, 28.f, 66.f, 16.f))
		{
			eth32.menuTab = i;
			return qtrue;
		}
	}
	if (ETH32_Hit(16.f, 448.f, 90.f, 16.f))
	{
		ETH32_SaveAndClose();
		return qtrue;
	}
	if (ETH32_Hit(116.f, 448.f, 90.f, 16.f))
	{
		ETH32_CancelAndClose();
		return qtrue;
	}
	if (ETH32_Hit(216.f, 448.f, 120.f, 16.f))
	{
		ETH32_LoadDefaults();
		return qtrue;
	}

	tab = &eth32_tabs[eth32.menuTab];
	y   = 52.f;
	for (i = 0; i < tab->count; i++)
	{
		if (ETH32_Hit(x, y, w, 16.f))
		{
			ETH32_ClickCtrl(&tab->ctrls[i], x + 110.f, 120.f);
			if (tab->ctrls[i].kind == ETH32_CTRL_SLIDERF || tab->ctrls[i].kind == ETH32_CTRL_SLIDERI)
			{
				eth32.dragCtrl = i;
			}
			return qtrue;
		}
		y += 18.f;
	}
	return qtrue;
}

static void ETH32_SyncCursor(int x, int y)
{
	char cxBuf[32];
	char cyBuf[32];

	trap_Cvar_VariableStringBuffer("etjs_cx", cxBuf, sizeof(cxBuf));
	trap_Cvar_VariableStringBuffer("etjs_cy", cyBuf, sizeof(cyBuf));
	if (cxBuf[0] && cyBuf[0])
	{
		eth32.cursorX = Com_Clamp(0.f, 640.f, Q_atof(cxBuf));
		eth32.cursorY = Com_Clamp(0.f, 480.f, Q_atof(cyBuf));
	}
	else if (x > -5000 && y > -5000)
	{
		eth32.cursorX = Com_Clamp(0.f, 640.f, eth32.cursorX + x);
		eth32.cursorY = Com_Clamp(0.f, 480.f, eth32.cursorY + y);
	}
	cgs.cursorX        = eth32.cursorX;
	cgs.cursorY        = eth32.cursorY;
	cgDC.cursorx       = eth32.cursorX;
	cgDC.cursory       = eth32.cursorY;
	cgDC.cursorVisible = qtrue;
}

qboolean ETH32_MouseEvent(int x, int y)
{
	eth32_tab_t *tab;
	eth32_ctrl_t *c;

	if (!ETH32_MenuOpen())
	{
		return qfalse;
	}
	ETH32_SyncCursor(x, y);
	if (eth32.dragCtrl >= 0)
	{
		tab = &eth32_tabs[eth32.menuTab];
		if (eth32.dragCtrl < tab->count)
		{
			c = &tab->ctrls[eth32.dragCtrl];
			if (c->kind == ETH32_CTRL_SLIDERF)
			{
				ETH32_ApplySliderF(c, 130.f, 120.f);
			}
			else if (c->kind == ETH32_CTRL_SLIDERI)
			{
				ETH32_ApplySliderI(c, 130.f, 120.f);
			}
		}
	}
	return qtrue;
}

void ETH32_DrawGui(void)
{
	eth32_tab_t *tab;
	int          i;
	float        y;
	vec4_t       bg     = { 0.05f, 0.05f, 0.07f, 0.88f };
	vec4_t       panel  = { 0.10f, 0.10f, 0.14f, 0.92f };
	vec4_t       accent = { 0.80f, 0.15f, 0.15f, 1.f };
	vec4_t       fg     = { 1.f, 1.f, 1.f, 1.f };
	vec4_t       dim    = { 0.70f, 0.70f, 0.70f, 1.f };
	vec4_t       fill   = { 0.85f, 0.20f, 0.20f, 1.f };
	vec4_t       track  = { 0.25f, 0.25f, 0.28f, 1.f };

	if (!ETH32_MenuOpen())
	{
		return;
	}
	ETH32_SyncCursor(0, 0);
	if (eth32.menuTab < 0 || eth32.menuTab >= (int)ARRAY_LEN(eth32_tabs))
	{
		eth32.menuTab = 0;
	}

	CG_FillRect(8, 8, 624, 464, bg);
	CG_DrawRect(8, 8, 624, 464, 1, accent);
	ETH32_Paint(16, 22, 0.20f, "ETH32NIX", accent);
	ETH32_Paint(110, 22, 0.16f, "rabbmod  —  Save writes eth32nix.ini", dim);

	for (i = 0; i < (int)ARRAY_LEN(eth32_tabs); i++)
	{
		float tx = 12.f + i * 70.f;
		vec4_t *col = (i == eth32.menuTab) ? &accent : &panel;

		CG_FillRect(tx, 28, 66, 16, *col);
		ETH32_Paint(tx + 4, 40, 0.13f, eth32_tabs[i].title, fg);
	}
	tab = &eth32_tabs[eth32.menuTab];
	CG_FillRect(16, 48, 608, 392, panel);
	y = 64.f;
	for (i = 0; i < tab->count; i++)
	{
		eth32_ctrl_t *c = &tab->ctrls[i];
		char          val[64];

		ETH32_Paint(22, y, 0.14f, c->label, fg);
		switch (c->kind)
		{
		case ETH32_CTRL_CHECK:
			CG_DrawRect(230, y - 10, 10, 10, 1, fg);
			if (*(qboolean *)c->target)
			{
				CG_FillRect(232, y - 8, 6, 6, fill);
			}
			ETH32_Paint(246, y, 0.13f, *(qboolean *)c->target ? "ON" : "off",
			            *(qboolean *)c->target ? fill : dim);
			break;
		case ETH32_CTRL_DROP:
		{
			int iv = *(int *)c->target;

			if (iv < 0)
			{
				iv = 0;
			}
			if (iv > c->imax)
			{
				iv = c->imax;
			}
			CG_FillRect(220, y - 12, 200, 14, track);
			ETH32_Paint(224, y, 0.13f, c->names[iv], fg);
			break;
		}
		case ETH32_CTRL_SLIDERF:
		{
			float v = *(float *)c->target;
			float t = (c->max != c->min) ? (v - c->min) / (c->max - c->min) : 0.f;

			if (t < 0.f)
			{
				t = 0.f;
			}
			if (t > 1.f)
			{
				t = 1.f;
			}
			CG_FillRect(220, y - 8, 160, 6, track);
			CG_FillRect(220, y - 8, 160.f * t, 6, fill);
			Com_sprintf(val, sizeof(val), "%.3f", v);
			ETH32_Paint(386, y, 0.12f, val, dim);
			break;
		}
		case ETH32_CTRL_SLIDERI:
		{
			int   v = *(int *)c->target;
			float t = (c->imax != c->imin) ? (float)(v - c->imin) / (float)(c->imax - c->imin) : 0.f;

			if (t < 0.f)
			{
				t = 0.f;
			}
			if (t > 1.f)
			{
				t = 1.f;
			}
			CG_FillRect(220, y - 8, 160, 6, track);
			CG_FillRect(220, y - 8, 160.f * t, 6, fill);
			Com_sprintf(val, sizeof(val), "%d", v);
			ETH32_Paint(386, y, 0.12f, val, dim);
			break;
		}
		}
		y += 18.f;
	}

	CG_FillRect(16, 448, 90, 16, fill);
	ETH32_Paint(40, 460, 0.13f, "Save", fg);
	CG_FillRect(116, 448, 90, 16, panel);
	ETH32_Paint(132, 460, 0.13f, "Cancel", fg);
	CG_FillRect(216, 448, 120, 16, panel);
	ETH32_Paint(228, 460, 0.13f, "Reset Defaults", fg);

	trap_R_SetColor(NULL);
	CG_DrawCursor(eth32.cursorX, eth32.cursorY);
}

#endif /* __EMSCRIPTEN__ */
