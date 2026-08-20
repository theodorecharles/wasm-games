/*
 * ETH32NIX rabbmod visuals — CEngine wallhack, chams, ESP, radar, deployables.
 */
#include "eth32nix.h"

#ifdef __EMSCRIPTEN__

static const char *eth32_classLetter[] = { "S", "M", "E", "F", "C" };

static void ETH32_Rgb4(const byte rgb[3], float a, vec4_t out)
{
	out[0] = rgb[0] / 255.f;
	out[1] = rgb[1] / 255.f;
	out[2] = rgb[2] / 255.f;
	out[3] = a;
}

static qboolean ETH32_IsHookDeployable(const entityState_t *state)
{
	return (state->weapon == WP_LANDMINE || state->weapon == WP_DYNAMITE ||
	        state->weapon == WP_SATCHEL) ? qtrue : qfalse;
}

qboolean ETH32_RevealDeployable(const entityState_t *state)
{
	int localTeam;

	if (!ETH32_Active() || !eth32.s.wallhack || !cg.snap || !ETH32_IsHookDeployable(state))
	{
		return qfalse;
	}
	localTeam = ETH32_LocalTeam();
	return ((state->teamNum == TEAM_AXIS || state->teamNum == TEAM_ALLIES) &&
	        state->teamNum != localTeam) ? qtrue : qfalse;
}

static void ETH32_AddShell(refEntity_t *ent, const byte rgb[3], qboolean depthHack)
{
	refEntity_t shell = *ent;

	if (!cgs.media.shoutcastLandmineShader)
	{
		return;
	}
	shell.customSkin   = 0;
	shell.customShader = cgs.media.shoutcastLandmineShader;
	shell.renderfx    |= RF_NOSHADOW;
	if (depthHack)
	{
		shell.renderfx |= RF_DEPTHHACK;
	}
	else
	{
		shell.renderfx &= ~RF_DEPTHHACK;
	}
	shell.shaderRGBA[0] = rgb[0];
	shell.shaderRGBA[1] = rgb[1];
	shell.shaderRGBA[2] = rgb[2];
	shell.shaderRGBA[3] = 210;
	trap_R_AddRefEntityToScene(&shell);
}

void ETH32_PlayerChams(refEntity_t *ent, entityState_t *es, int team)
{
	trace_t  trace;
	vec3_t   point;
	qboolean visible, friendly;
	const byte *fill;
	int      localTeam;

	if (!ETH32_Active() || !eth32.s.drawHackVisuals || !cg.snap || !es)
	{
		return;
	}
	if (es->eType != ET_PLAYER || es->number < 0 || es->number >= MAX_CLIENTS ||
	    es->number == cg.snap->ps.clientNum || (es->eFlags & EF_DEAD))
	{
		return;
	}
	localTeam = ETH32_LocalTeam();
	if (localTeam != TEAM_SPECTATOR &&
	    ((es->teamNum == TEAM_AXIS || es->teamNum == TEAM_ALLIES)
	     ? es->teamNum == localTeam
	     : team == localTeam))
	{
		friendly = qtrue;
	}
	else
	{
		friendly = qfalse;
	}

	VectorCopy(cg_entities[es->number].lerpOrigin, point);
	point[2] += (es->eFlags & EF_PRONE) ? 18.f : ((es->eFlags & EF_CROUCHING) ? 28.f : 40.f);
	CG_Trace(&trace, cg.refdef.vieworg, NULL, NULL, point, cg.snap->ps.clientNum, CONTENTS_SOLID);
	visible = (trace.fraction > 0.98f) ? qtrue : qfalse;
	eth32.players[es->number].visible = visible;

	if (es->powerups & (1 << PW_INVULNERABLE))
	{
		fill = eth32.s.colorInvulnerable;
	}
	else if (friendly)
	{
		fill = visible ? eth32.s.colorTeam : eth32.s.colorTeamHidden;
	}
	else
	{
		fill = visible ? eth32.s.colorEnemy : eth32.s.colorEnemyHidden;
	}

	if ((friendly && eth32.s.teamShader1) || (!friendly && eth32.s.enemyShader1))
	{
		qboolean wh = friendly ? eth32.s.teamShader1Wallhack : eth32.s.enemyShader1Wallhack;

		ETH32_AddShell(ent, fill, (eth32.s.wallhack && (wh || !visible)) ? qtrue : qfalse);
	}
	if ((friendly && eth32.s.teamShader2) || (!friendly && eth32.s.enemyShader2))
	{
		ETH32_AddShell(ent, friendly ? eth32.s.colorTeamOut : eth32.s.colorEnemyOut,
		               (eth32.s.wallhack && !visible) ? qtrue : qfalse);
	}
}

void ETH32_DeployableChams(refEntity_t *ent, centity_t *cent)
{
	trace_t  trace;
	qboolean visible;
	const byte *rgb;

	if (!ETH32_RevealDeployable(&cent->currentState) || !cgs.media.shoutcastLandmineShader)
	{
		return;
	}
	CG_Trace(&trace, cg.refdef.vieworg, NULL, NULL, ent->origin,
	         cg.snap->ps.clientNum, CONTENTS_SOLID);
	visible = (trace.fraction > 0.98f || trace.entityNum == cent->currentState.number) ? qtrue : qfalse;
	rgb     = visible ? eth32.s.colorEnemy : eth32.s.colorEnemyHidden;
	ETH32_AddShell(ent, rgb, !visible);
}

void ETH32_ItemChams(refEntity_t *re, centity_t *cent)
{
	const byte *rgb;

	if (!ETH32_Active() || !eth32.s.drawHackVisuals || !re || !cent)
	{
		return;
	}
	if (cent->currentState.eType != ET_ITEM && cent->currentState.eType != ET_MISSILE)
	{
		return;
	}
	if (!eth32.s.itemShader1Wallhack && !eth32.s.itemEsp)
	{
		return;
	}
	if (cent->currentState.eType == ET_MISSILE &&
	    (cent->currentState.weapon == WP_GRENADE_LAUNCHER ||
	     cent->currentState.weapon == WP_GRENADE_PINEAPPLE ||
	     cent->currentState.weapon == WP_GPG40 ||
	     cent->currentState.weapon == WP_M7 ||
	     cent->currentState.weapon == WP_DYNAMITE ||
	     cent->currentState.weapon == WP_LANDMINE ||
	     cent->currentState.weapon == WP_SATCHEL ||
	     cent->currentState.weapon == WP_MORTAR ||
	     cent->currentState.weapon == WP_MORTAR_SET ||
	     cent->currentState.weapon == WP_PANZERFAUST ||
	     cent->currentState.weapon == WP_BAZOOKA))
	{
		rgb = eth32.s.colorEnemy;
		ETH32_AddShell(re, rgb, eth32.s.wallhack);
	}
}

static void ETH32_DrawText(float x, float y, float scale, const char *text, vec4_t color, qboolean center)
{
	if (center)
	{
		CG_Text_Paint_Centred_Ext(x, y, scale, scale, color, text, 0, 0, ITEM_TEXTSTYLE_SHADOWED, &cgs.media.limboFont2);
	}
	else
	{
		CG_Text_Paint_Ext(x, y, scale, scale, color, text, 0, 0, ITEM_TEXTSTYLE_SHADOWED, &cgs.media.limboFont2);
	}
}

static void ETH32_PlayerEsp(int clientNum)
{
	eth32_player_t *pl;
	centity_t      *cent;
	vec3_t          origin;
	vec4_t          color, iconColor;
	float           x, y, boxX, boxY, size;
	const char     *cls;

	if (clientNum < 0 || clientNum >= MAX_CLIENTS)
	{
		return;
	}
	pl   = &eth32.players[clientNum];
	cent = &cg_entities[clientNum];

	if (!ETH32_IsEnemy(clientNum) &&
	    !(cgs.clientinfo[clientNum].infoValid &&
	      (cgs.clientinfo[clientNum].team == ETH32_LocalTeam()) &&
	      clientNum != cg.clientNum))
	{
		return;
	}
	if (!cent->currentValid || (cent->currentState.eFlags & EF_DEAD))
	{
		return;
	}
	VectorCopy(cent->lerpOrigin, origin);
	origin[2] += 64.f;
	if (!ETH32_WorldToScreen(origin, &x, &y))
	{
		return;
	}
	pl->screenX = x;
	pl->screenY = y;
	if (pl->visible)
	{
		Vector4Set(color, 1.f, 1.f, 1.f, 1.f);
	}
	else
	{
		Vector4Set(color, 0.5f, 0.5f, 0.5f, 0.5f);
	}

	if (eth32.s.boxEsp)
	{
		if (ETH32_IsEnemy(clientNum))
		{
			VectorCopy(eth32.s.clsEnemy, iconColor);
		}
		else
		{
			VectorCopy(eth32.s.clsTeam, iconColor);
		}
		iconColor[3] = eth32.s.boxEspOpacity;
		if (cent->currentState.eFlags & EF_PRONE)
		{
			boxX = (10000.f / pl->distance) * 1.8f;
			boxY = (10000.f / pl->distance) * 1.4f;
		}
		else if (cent->currentState.eFlags & EF_CROUCHING)
		{
			boxX = (10000.f / pl->distance) * 1.8f;
			boxY = (10000.f / pl->distance) * 2.35f;
		}
		else
		{
			boxX = (10000.f / pl->distance) * 1.8f;
			boxY = (10000.f / pl->distance) * 3.f;
		}
		boxX *= 90.f / cg.refdef.fov_x;
		boxY *= 73.739792f / cg.refdef.fov_y;
		size  = eth32.s.boxEspBorder * (700.f / (pl->distance > 1.f ? pl->distance : 1.f));
		if (size < 1.f)
		{
			size = 1.f;
		}
		if (size > 5.f)
		{
			size = 5.f;
		}
		CG_DrawRect(x - boxX * 0.5f, y + 10.f, boxX, boxY, size, iconColor);
	}

	if (eth32.s.espName)
	{
		ETH32_DrawText(x, y - 13.f, 0.16f, cgs.clientinfo[clientNum].name, color, qtrue);
	}

	if (eth32.s.drawDisguised && ETH32_IsEnemy(clientNum) &&
	    (cent->currentState.powerups & (1 << PW_OPS_DISGUISED)))
	{
		vec4_t yel = { 1.f, 1.f, 0.f, 1.f };

		ETH32_DrawText(x, y - 26.f, 0.14f, "DISGUISED", yel, qtrue);
	}

	if (eth32.grenadeTarget == clientNum && eth32.s.grenadeBot)
	{
		vec4_t mark;

		if (eth32.grenadeOK)
		{
			Vector4Set(mark, 0.f, 1.f, 0.f, 1.f);
		}
		else
		{
			Vector4Set(mark, 1.f, 0.f, 0.f, 1.f);
		}
		ETH32_DrawText(x, y - 38.f, 0.18f, "[G]", mark, qtrue);
	}

	if (eth32.s.classEspType != ETH32_CLS_OFF)
	{
		float iconSize = (eth32.s.classEspType == ETH32_CLS_STATIC)
		                 ? eth32.s.clsSize
		                 : Com_Clamp(8.f, 18.f, 10000.f / (pl->distance > 1.f ? pl->distance : 1.f));

		if (ETH32_IsEnemy(clientNum))
		{
			VectorCopy(eth32.s.clsEnemy, iconColor);
		}
		else
		{
			VectorCopy(eth32.s.clsTeam, iconColor);
		}
		iconColor[3] = eth32.s.clsOpacity;
		cls = (cgs.clientinfo[clientNum].cls >= 0 &&
		       cgs.clientinfo[clientNum].cls < (int)ARRAY_LEN(eth32_classLetter))
		      ? eth32_classLetter[cgs.clientinfo[clientNum].cls]
		      : "?";
		ETH32_DrawText(x - iconSize, y - iconSize - 16.f, 0.16f,
		               va("%s %s", cls, ETH32_Weapon(cent->currentState.weapon)->name),
		               iconColor, qtrue);
	}
}

static void ETH32_GentityEsp(centity_t *cent)
{
	float  x, y, fade, dist;
	vec4_t color;
	const char *label = NULL;
	int    weapon;

	if (!cent->currentValid)
	{
		return;
	}
	weapon = cent->currentState.weapon;
	if (cent->currentState.eType == ET_MISSILE)
	{
		switch (weapon)
		{
		case WP_GRENADE_LAUNCHER: label = "Grenade"; break;
		case WP_GRENADE_PINEAPPLE: label = "Grenade"; break;
		case WP_DYNAMITE: label = "Dynamite"; break;
		case WP_LANDMINE: label = "Mine"; break;
		case WP_SATCHEL: label = "Satchel"; break;
		case WP_GPG40:
		case WP_M7: label = "Riflenade"; break;
		case WP_MORTAR:
		case WP_MORTAR_SET:
		case WP_MORTAR2:
		case WP_MORTAR2_SET: label = "Mortar"; break;
		case WP_PANZERFAUST:
		case WP_BAZOOKA: label = "Rocket"; break;
		case WP_SMOKE_BOMB: label = "Smoke"; break;
		case WP_SMOKE_MARKER: label = "Arty"; break;
		default: break;
		}
	}
	else if (cent->currentState.eType == ET_ITEM && eth32.s.itemEsp)
	{
		label = "Item";
	}
	if (!label)
	{
		return;
	}
	if (!ETH32_WorldToScreen(cent->lerpOrigin, &x, &y))
	{
		return;
	}
	dist = Distance(cg.refdef.vieworg, cent->lerpOrigin);
	fade = Com_Clamp(0.2f, 1.f, 400.f / (dist > 1.f ? dist : 1.f));
	if (ETH32_PointVisible(cg.refdef.vieworg, cent->lerpOrigin, cent->currentState.number))
	{
		VectorSet(color, eth32.s.missileEsp[0], eth32.s.missileEsp[1], eth32.s.missileEsp[2]);
	}
	else
	{
		VectorSet(color, 0.4f, 0.4f, 0.4f);
	}
	color[3] = fade;
	ETH32_DrawText(x, y, 0.14f, va("%s %dm", label, (int)(dist / 32.f)), color, qtrue);
}

static void ETH32_DrawRadar(void)
{
	int    i;
	float  cx = 515.f, cy = 365.f, size = 110.f, range = eth32.s.radarRange;
	vec4_t bg = { 0.f, 0.f, 0.f, 0.45f };
	vec4_t br = { 0.2f, 0.8f, 0.2f, 0.8f };
	vec4_t me = { 1.f, 1.f, 1.f, 1.f };
	float  yaw = DEG2RAD(cg.refdefViewAngles[YAW]);

	CG_FillRect(cx - size * 0.5f, cy - size * 0.5f, size, size, bg);
	CG_DrawRect(cx - size * 0.5f, cy - size * 0.5f, size, size, 1, br);
	CG_FillRect(cx - 1.f, cy - 1.f, 2.f, 2.f, me);

	for (i = 0; i < MAX_CLIENTS; i++)
	{
		vec3_t delta, color;
		float  x, y, dist, c, s;
		vec4_t dot;

		if (i == cg.clientNum || !cgs.clientinfo[i].infoValid ||
		    !cg_entities[i].currentValid || (cg_entities[i].currentState.eFlags & EF_DEAD))
		{
			continue;
		}
		VectorSubtract(cg_entities[i].lerpOrigin, cg.predictedPlayerState.origin, delta);
		dist = VectorLength(delta);
		if (dist > range)
		{
			continue;
		}
		c = cosf(-yaw);
		s = sinf(-yaw);
		x = cx + (delta[0] * s + delta[1] * c) / range * (size * 0.45f);
		y = cy - (delta[0] * c - delta[1] * s) / range * (size * 0.45f);
		if (ETH32_IsEnemy(i))
		{
			VectorCopy(eth32.s.clsEnemy, color);
		}
		else
		{
			VectorCopy(eth32.s.clsTeam, color);
		}
		Vector4Set(dot, color[0], color[1], color[2], 1.f);
		CG_FillRect(x - 2.f, y - 2.f, 4.f, 4.f, dot);
	}
}

static void ETH32_DrawBanner(void)
{
	char   line[256];
	vec4_t col = { 1.f, 1.f, 1.f, 1.f };
	int    hp  = cg.snap ? cg.snap->ps.stats[STAT_HEALTH] : 0;

	if (!eth32.s.guiBanner)
	{
		return;
	}
	Com_sprintf(line, sizeof(line), "^1ETH32NIX  ^7%s  ^3%dms  ^2HP %d  ^3target %d",
	            cgs.clientinfo[cg.clientNum].name,
	            cg.snap ? cg.snap->ping : 0,
	            hp,
	            eth32.lastTarget);
	ETH32_DrawText(320.f, 12.f * eth32.s.bannerScale, 0.18f * eth32.s.bannerScale, line, col, qtrue);
}

static void ETH32_DrawStatus(void)
{
	vec4_t bg = { 0.f, 0.f, 0.f, 0.5f };
	vec4_t fg = { 1.f, 1.f, 1.f, 1.f };
	const eth32_weap_t *weap = ETH32_Weapon(cg.predictedPlayerState.weapon);
	int hp = cg.snap ? cg.snap->ps.stats[STAT_HEALTH] : 0;
	int ammo = 0;
	const char *aimTxt = (eth32.s.aimType >= 0 && eth32.s.aimType < ETH32_AIM_MAX)
	                     ? eth32_aimTypeText[eth32.s.aimType] : "?";

	if (cg.snap && IS_VALID_WEAPON(cg.predictedPlayerState.weapon))
	{
		int clipIndex = GetWeaponTableData(cg.predictedPlayerState.weapon)->clipIndex;

		if (clipIndex >= 0 && clipIndex < MAX_WEAPONS)
		{
			ammo = cg.snap->ps.ammoclip[clipIndex];
		}
	}

	CG_FillRect(5, 422, 120, 50, bg);
	ETH32_DrawText(10, 434, 0.14f, va("HP %d  AMMO %d", hp, ammo), fg, qfalse);
	ETH32_DrawText(10, 448, 0.14f, weap->name, fg, qfalse);
	ETH32_DrawText(10, 462, 0.12f, aimTxt, fg, qfalse);
}

static void ETH32_DrawRespawn(void)
{
	vec4_t bg = { 0.f, 0.f, 0.f, 0.45f };
	vec4_t fg = { 1.f, 0.8f, 0.2f, 1.f };
	int    rt;

	if (!eth32.s.respawnTimers || !cg.snap)
	{
		return;
	}
	rt = (cg.snap->ps.stats[STAT_HEALTH] <= 0);
	CG_FillRect(280, 5, 80, 18, bg);
	ETH32_DrawText(320, 18, 0.16f, rt ? "DEAD" : "LIVE", fg, qtrue);
}

void ETH32_DrawVisuals(void)
{
	int i;

	if (!cg.snap)
	{
		return;
	}
	for (i = 0; i < MAX_CLIENTS; i++)
	{
		ETH32_PlayerEsp(i);
	}
	for (i = 0; i < MAX_GENTITIES; i++)
	{
		if (cg_entities[i].currentValid &&
		    (cg_entities[i].currentState.eType == ET_MISSILE ||
		     cg_entities[i].currentState.eType == ET_ITEM))
		{
			ETH32_GentityEsp(&cg_entities[i]);
		}
	}
	ETH32_DrawRadar();
	ETH32_DrawBanner();
	ETH32_DrawStatus();
	ETH32_DrawRespawn();
}

#endif /* __EMSCRIPTEN__ */
