/*
 * ETH32NIX rabbmod aimbot — CAimbot.cpp compiled into cgame.
 * Head/body traces, hitboxes, sort modes, human aim, grenade/rifle bots.
 */
#include "eth32nix.h"

#ifdef __EMSCRIPTEN__

#include "eth32nix_luts.h"

#define ETH32_ANG_CLIP(ang) do { if ((ang) > 180.f) { (ang) -= 360.f; } else if ((ang) < -180.f) { (ang) += 360.f; } } while (0)
#define ETH32_MAX_PTS 160

typedef struct
{
	vec3_t pt;
	float  d;
} eth32_tracePt_t;

static const eth32_hitboxDef_t eth32_headBoxes[] =
{
	{ { 0.0, 0.0, 0.0 }, { 0.0, 0.0, 0.0 }, { 0.0, 0.0, 0.0 }, { 0.0, 0.0, 0.0 }, { 0.0, 0.0, 0.0 }, { 0.0, 0.0, 0.0 } },
	{ { 0.0, 0.0, 4.0 }, { 0.0, 0.0, 4.0 }, { 0.0, 0.0, 4.0 }, { 0.0, 0.0, 4.0 }, { 0.0, 0.0, 4.0 }, { 12.0, 12.0, 12.0 } },
	{ { 3.0, 0.0, 6.5 }, { 3.0, -0.5, 6.0 }, { 1.0, 0.0, 7.0 }, { -5.0, -1.0, 6.5 }, { 1.0, 3.0, 4.5 }, { 12.0, 12.0, 12.0 } },
	{ { 0.3, 0.3, 7.0 }, { -0.3, 0.8, 7.0 }, { 0.0, 0.3, 6.9 }, { 0.0, 0.0, 6.5 }, { 0.0, -0.7, 7.0 }, { 11.0, 11.0, 12.0 } },
	{ { 0.5, 0.0, 6.5 }, { 0.5, 0.0, 6.5 }, { 0.5, 0.0, 6.5 }, { 0.5, 0.0, 6.5 }, { 0.5, 0.0, 6.5 }, { 12.0, 12.0, 12.0 } },
};

static int ETH32_CmpDist(const void *a, const void *b)
{
	const eth32_tracePt_t *pa = a, *pb = b;

	if (pa->d > pb->d)
	{
		return 1;
	}
	if (pa->d < pb->d)
	{
		return -1;
	}
	return 0;
}

static int ETH32_CmpAngle(const void *a, const void *b)
{
	const eth32_tracePt_t *pa = a, *pb = b;

	if (pa->d > pb->d)
	{
		return -1;
	}
	if (pa->d < pb->d)
	{
		return 1;
	}
	return 0;
}

static qboolean ETH32_CheckFov(const vec3_t origin)
{
	vec3_t dir;
	float  ang;

	if (eth32.s.fov > 359.f)
	{
		return qtrue;
	}
	VectorSubtract(origin, cg.refdef.vieworg, dir);
	VectorNormalize(dir);
	ang = 57.2957795131f * acos((double)DotProduct(dir, cg.refdef.viewaxis[0]));
	return (ang <= eth32.s.fov) ? qtrue : qfalse;
}

static float ETH32_CrosshairDist(int clientNum)
{
	float x, y;

	if (clientNum < 0 || clientNum >= MAX_CLIENTS)
	{
		return 1e30f;
	}
	if (!ETH32_WorldToScreen(cg_entities[clientNum].lerpOrigin, &x, &y))
	{
		return 1e30f;
	}
	return sqrt((x - 320.f) * (x - 320.f) + (y - 240.f) * (y - 240.f));
}

static int ETH32_SortPlayers(const void *a, const void *b)
{
	int ia = *(const int *)a, ib = *(const int *)b;
	eth32_player_t *pa;
	eth32_player_t *pb;

	if (ia < 0 || ia >= MAX_CLIENTS || ib < 0 || ib >= MAX_CLIENTS)
	{
		return 0;
	}
	pa = &eth32.players[ia];
	pb = &eth32.players[ib];

	switch (eth32.s.aimSort)
	{
	case ETH32_SORT_ATTACKER:
		if (ia == cg.snap->ps.persistant[PERS_ATTACKER])
		{
			return -1;
		}
		if (ib == cg.snap->ps.persistant[PERS_ATTACKER])
		{
			return 1;
		}
		break;
	case ETH32_SORT_CROSSHAIR:
		if (ETH32_CrosshairDist(ia) < ETH32_CrosshairDist(ib))
		{
			return -1;
		}
		return 1;
	case ETH32_SORT_KDRATIO:
		if (pa->kdRatio != pb->kdRatio)
		{
			return (pa->kdRatio > pb->kdRatio) ? -1 : 1;
		}
		break;
	case ETH32_SORT_ACCURACY:
		if (pa->accuracy != pb->accuracy)
		{
			return (pa->accuracy > pb->accuracy) ? -1 : 1;
		}
		break;
	case ETH32_SORT_THREAT:
		if (pa->threat != pb->threat)
		{
			return (pa->threat > pb->threat) ? -1 : 1;
		}
		break;
	default:
		break;
	}
	if (pa->distance < pb->distance)
	{
		return -1;
	}
	if (pa->distance > pb->distance)
	{
		return 1;
	}
	return 0;
}

static qboolean ETH32_TracePoints(const vec3_t from, eth32_tracePt_t *p, int n, int skip, vec3_t out)
{
	int i;

	for (i = 0; i < n; i++)
	{
		if (ETH32_PointVisible(from, p[i].pt, skip))
		{
			VectorCopy(p[i].pt, out);
			return qtrue;
		}
	}
	return qfalse;
}

static qboolean ETH32_TraceHeadBox(vec3_t boxOrigin, vec3_t size, const vec3_t start, int skip, int trType, vec3_t hit, int maxTraces)
{
	eth32_tracePt_t p[ETH32_MAX_PTS];
	vec3_t          dir, dr;
	int             k, n;
	float           phi, path, pathZ;

	if (VectorCompare(boxOrigin, vec3_origin))
	{
		return qfalse;
	}
	if (ETH32_PointVisible(start, boxOrigin, skip) && trType == ETH32_HEAD_CENTER)
	{
		VectorCopy(boxOrigin, hit);
		return qtrue;
	}
	if (trType == ETH32_HEAD_CENTER)
	{
		return ETH32_PointVisible(start, boxOrigin, skip) ? (VectorCopy(boxOrigin, hit), qtrue) : qfalse;
	}

	Com_Memset(p, 0, sizeof(p));
	n = maxTraces;
	if (n > ETH32_MAX_PTS)
	{
		n = ETH32_MAX_PTS;
	}
	VectorSubtract(cg.refdef.vieworg, boxOrigin, dir);
	VectorNormalize(dir);

	if (trType == ETH32_HEAD_STATIC)
	{
		path = 0.f;
		pathZ = 0.35f;
		for (k = 0; k < n; k++)
		{
			phi = 2.f * (float)M_PI * path;
			p[k].pt[0] = cosf(phi) * 0.45f * size[0];
			p[k].pt[1] = sinf(phi) * 0.45f * size[1];
			p[k].pt[2] = pathZ * size[2];
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
			VectorSubtract(cg.refdef.vieworg, p[k].pt, dr);
			VectorNormalize(dr);
			p[k].d = DotProduct(dr, dir);
			path  += 0.25f;
			if ((k % 4) == 3)
			{
				pathZ -= 0.35f;
			}
		}
		qsort(p, n, sizeof(p[0]), ETH32_CmpAngle);
	}
	else /* XTRACE */
	{
		float height = 0.4f;

		n = 24;
		for (k = 0; k < 8; k++)
		{
			VectorMA(boxOrigin, size[2] * height, axisDefault[2], p[k].pt);
			height -= 0.1f;
		}
		path = 0.2f;
		pathZ = 0.35f;
		for (k = 8; k < n; k++)
		{
			phi = 2.f * (float)M_PI * ((k - 8) * 0.25f);
			p[k].pt[0] = cosf(phi) * path * size[0];
			p[k].pt[1] = sinf(phi) * path * size[1];
			p[k].pt[2] = pathZ * size[2];
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
			if (((k - 8) % 4) == 3)
			{
				pathZ -= 0.2f;
				path  += 0.1f;
			}
		}
	}
	return ETH32_TracePoints(start, p, n, skip, hit);
}

static qboolean ETH32_TraceBodyBox(vec3_t boxOrigin, vec3_t size, const vec3_t start, int skip, int trType, vec3_t hit, int maxTraces)
{
	eth32_tracePt_t p[ETH32_MAX_PTS];
	vec3_t          dir, dr, n, a, b, ndir;
	int             i, j, k, N, count, count2;
	float           phi, path, pathZ, height, frac, r;
	const float    *xAxis = axisDefault[0];
	const float    *yAxis = axisDefault[1];
	const float    *zAxis = axisDefault[2];

	if (VectorCompare(boxOrigin, vec3_origin))
	{
		return qfalse;
	}
	VectorMA(boxOrigin, eth32.s.predTarget, cg_entities[skip].currentState.pos.trDelta, boxOrigin);

	if (trType == ETH32_BODY_CENTER)
	{
		return qfalse;
	}
	if (ETH32_PointVisible(start, boxOrigin, skip))
	{
		VectorCopy(boxOrigin, hit);
		return qtrue;
	}
	if (trType == ETH32_BODY_STATIC)
	{
		maxTraces = 20;
	}
	else if (trType == ETH32_BODY_XTRACE)
	{
		maxTraces = 80;
	}
	else if (maxTraces < 16)
	{
		maxTraces = 16;
	}
	if (maxTraces > ETH32_MAX_PTS)
	{
		maxTraces = ETH32_MAX_PTS;
	}
	Com_Memset(p, 0, sizeof(p));
	VectorSubtract(cg.refdef.vieworg, boxOrigin, dir);
	VectorCopy(dir, ndir);
	VectorNormalize(dir);
	VectorNormalize(ndir);
	k = 0;

	switch (trType)
	{
	case ETH32_BODY_CONTOUR:
		VectorMA(boxOrigin, size[0] * 0.5f, xAxis, p[k++].pt);
		VectorMA(boxOrigin, -size[0] * 0.5f, xAxis, p[k++].pt);
		VectorMA(boxOrigin, size[1] * 0.5f, yAxis, p[k++].pt);
		VectorMA(boxOrigin, -size[1] * 0.5f, yAxis, p[k++].pt);
		VectorMA(boxOrigin, size[2] * 0.5f, zAxis, p[k++].pt);
		for (; k < maxTraces; k++)
		{
			VectorMA(boxOrigin, size[0] * crandom() * 0.5f, xAxis, p[k].pt);
			VectorMA(p[k].pt, size[1] * crandom() * 0.5f, yAxis, p[k].pt);
			VectorMA(p[k].pt, size[2] * crandom() * 0.5f, zAxis, p[k].pt);
		}
		qsort(p, maxTraces, sizeof(p[0]), ETH32_CmpDist);
		break;
	case ETH32_BODY_STATIC:
		path = 0.f;
		pathZ = 0.5f;
		count = 0;
		for (k = 0; k < maxTraces; k++)
		{
			phi = 2.f * (float)M_PI * path;
			p[k].pt[0] = cosf(phi) * 0.5f * size[0];
			p[k].pt[1] = sinf(phi) * 0.5f * size[0];
			p[k].pt[2] = pathZ * size[2];
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
			VectorSubtract(cg.refdef.vieworg, p[k].pt, dr);
			VectorNormalize(dr);
			p[k].d = DotProduct(dr, dir);
			count++;
			if (count == 4)
			{
				pathZ -= 0.1875f;
				count  = 0;
			}
			if (k == 3 || k == 11)
			{
				path = 0.125f;
			}
			else if (k == 7 || k == 15)
			{
				path = 0.f;
			}
			path += 0.25f;
		}
		qsort(p, maxTraces, sizeof(p[0]), ETH32_CmpAngle);
		break;
	case ETH32_BODY_XTRACE:
		height = 0.5f;
		for (k = 0; k < 11 && k < maxTraces; k++)
		{
			VectorMA(boxOrigin, size[2] * height, zAxis, p[k].pt);
			height -= 0.1f;
		}
		path = 0.166f;
		pathZ = 0.5f;
		count = count2 = 0;
		for (; k < maxTraces; k++)
		{
			count++;
			count2++;
			phi = 2.f * (float)M_PI * (count * 0.25f);
			p[k].pt[0] = cosf(phi) * path * size[0];
			p[k].pt[1] = sinf(phi) * path * size[0];
			p[k].pt[2] = pathZ * size[2];
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
			if (count == 12)
			{
				pathZ -= 0.1f;
				path   = 0.166f;
				count  = count2 = 0;
			}
			if (count2 == 4)
			{
				path  += 0.167f;
				count2 = 0;
			}
		}
		qsort(p, maxTraces, sizeof(p[0]), ETH32_CmpAngle);
		break;
	case ETH32_BODY_RANDOM_VOLUME:
		for (k = 0; k < maxTraces; k++)
		{
			VectorMA(p[k].pt, size[0] * crandom() * 0.5f, xAxis, p[k].pt);
			VectorMA(p[k].pt, size[1] * crandom() * 0.5f, yAxis, p[k].pt);
			VectorMA(p[k].pt, size[2] * crandom() * 0.5f, zAxis, p[k].pt);
			p[k].d = VectorLengthSquared(p[k].pt);
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
		}
		qsort(p, maxTraces, sizeof(p[0]), ETH32_CmpDist);
		break;
	case ETH32_BODY_RANDOM_SURFACE:
		for (i = 0; i < 6 && k < maxTraces; i++)
		{
			n[0] = n[1] = n[2] = 0.f;
			n[i % 3] = (i > 2) ? 1.f : -1.f;
			frac = DotProduct(n, ndir);
			if (frac <= 0.f)
			{
				continue;
			}
			N = (int)((frac / 1.732f) * maxTraces);
			a[0] = a[1] = a[2] = 0.f;
			b[0] = b[1] = b[2] = 0.f;
			a[(i + 1) % 3] = 1.f;
			b[(i + 2) % 3] = 1.f;
			for (j = 0; j < N && k < maxTraces; j++, k++)
			{
				VectorMA(boxOrigin, size[i % 3] * 0.5f, n, p[k].pt);
				VectorMA(p[k].pt, size[(i + 1) % 3] * crandom() * 0.5f, a, p[k].pt);
				VectorMA(p[k].pt, size[(i + 2) % 3] * crandom() * 0.5f, b, p[k].pt);
				VectorSubtract(cg.refdef.vieworg, p[k].pt, dr);
				VectorNormalize(dr);
				p[k].d = DotProduct(dr, ndir);
			}
		}
		qsort(p, maxTraces, sizeof(p[0]), ETH32_CmpAngle);
		break;
	case ETH32_BODY_CAPSULE_VOLUME:
		for (k = 0; k < maxTraces; k++)
		{
			phi = 2.f * (float)M_PI * random();
			r   = 0.5f * random() * size[0];
			p[k].pt[0] = cosf(phi) * r;
			p[k].pt[1] = sinf(phi) * r;
			p[k].pt[2] = 0.5f * crandom() * size[2];
			p[k].d     = r * r + p[k].pt[2] * p[k].pt[2];
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
		}
		qsort(p, maxTraces, sizeof(p[0]), ETH32_CmpDist);
		break;
	case ETH32_BODY_CAPSULE_SURFACE:
		for (k = 0; k < maxTraces; k++)
		{
			phi = 2.f * (float)M_PI * random();
			p[k].pt[0] = cosf(phi) * 0.5f * size[0];
			p[k].pt[1] = sinf(phi) * 0.5f * size[0];
			p[k].pt[2] = 0.5f * crandom() * size[2];
			VectorAdd(boxOrigin, p[k].pt, p[k].pt);
		}
		break;
	default:
		return qfalse;
	}
	return ETH32_TracePoints(start, p, maxTraces, skip, hit);
}

static const eth32_hitboxDef_t *ETH32_HeadBox(void)
{
	if (eth32.s.hitboxType == ETH32_HITBOX_CUSTOM)
	{
		return &eth32.customHitbox;
	}
	if (eth32.s.hitboxType <= ETH32_HITBOX_OFF || eth32.s.hitboxType >= ETH32_HITBOX_MAX)
	{
		return &eth32_headBoxes[ETH32_HITBOX_ETPRO];
	}
	return &eth32_headBoxes[eth32.s.hitboxType];
}

static qboolean ETH32_TraceHead(int clientNum, const vec3_t start, vec3_t hit)
{
	eth32_hitboxDef_t   hbox;
	centity_t          *cent;
	orientation_t       head;
	vec3_t              cv, p, vel, size;
	qboolean            moving;
	int                 eFlags;
	float               dist, f, closeV, farV;
	const eth32_weap_t *weap;

	if (clientNum < 0 || clientNum >= MAX_CLIENTS)
	{
		return qfalse;
	}
	cent = &cg_entities[clientNum];
	weap = ETH32_Weapon(cg.predictedPlayerState.weapon);

	if (!weap->headTraces || !ETH32_GetHeadOri(clientNum, &head))
	{
		return qfalse;
	}
	hbox   = *ETH32_HeadBox();
	eFlags = cent->currentState.eFlags;
	VectorCopy(cent->currentState.pos.trDelta, vel);
	moving = !VectorCompare(vel, vec3_origin);
	if ((eFlags & (EF_PRONE | EF_PRONE_MOVING)))
	{
		VectorCopy(hbox.prone_offset, cv);
	}
	else if (!moving)
	{
		VectorCopy((eFlags & EF_CROUCHING) ? hbox.crouch_offset : hbox.stand_offset, cv);
	}
	else
	{
		VectorCopy((eFlags & EF_CROUCHING) ? hbox.crouch_offset_moving : hbox.stand_offset_moving, cv);
	}

	size[0] = size[1] = size[2] = eth32.s.headBoxSize;
	dist    = eth32.players[clientNum].distance;
	f       = dist / 2999.f;
	if (f > 1.f)
	{
		f = 1.f;
	}
	if (eth32.s.autoVecZ)
	{
		if (dist < 3000.f)
		{
			closeV = 6.5f; farV = 5.5f;
		}
		else if (dist < 6000.f)
		{
			closeV = 5.5f; farV = 4.5f;
		}
		else if (dist < 9000.f)
		{
			closeV = 4.5f; farV = 3.0f;
		}
		else
		{
			closeV = 3.0f; farV = 2.0f;
		}
		cv[2] = closeV + (farV - closeV) * f;
	}
	if (eth32.s.autoVecX)
	{
		if (dist < 3000.f)
		{
			closeV = -3.5f; farV = -2.5f;
		}
		else if (dist < 6000.f)
		{
			closeV = -2.5f; farV = -1.9f;
		}
		else if (dist < 9000.f)
		{
			closeV = -1.5f; farV = -1.0f;
		}
		else
		{
			closeV = -1.0f; farV = -1.4f;
		}
		cv[0] = closeV + (farV - closeV) * f;
	}
	if (eth32.s.dynamicHitboxScale > 0.f)
	{
		float speed = VectorLength(vel) - Q_fabs(DotProduct(vel, cg.refdef.viewaxis[0]));
		float base  = cg.snap->ps.speed > 0 ? (float)cg.snap->ps.speed : 320.f;

		if (speed > 0.f)
		{
			size[0] *= (1.f + eth32.s.dynamicHitboxScale * speed / base);
			size[1] *= (1.f + eth32.s.dynamicHitboxScale * speed / base);
		}
	}
	VectorMA(head.origin, cv[2], head.axis[2], p);
	VectorMA(p, cv[1], head.axis[1], p);
	VectorMA(p, cv[0], head.axis[0], p);
	return ETH32_TraceHeadBox(p, size, start, clientNum, eth32.s.headTraceType, hit, weap->headTraces);
}

static qboolean ETH32_TraceBody(int clientNum, vec3_t hit)
{
	centity_t          *cent;
	vec3_t              size, origin, muzzle;
	const eth32_weap_t *weap = ETH32_Weapon(cg.predictedPlayerState.weapon);

	if (clientNum < 0 || clientNum >= MAX_CLIENTS || !weap->bodyTraces)
	{
		return qfalse;
	}
	cent = &cg_entities[clientNum];
	size[0] = size[1] = eth32.s.bodybox;
	size[2] = 24.f;
	VectorCopy(cent->lerpOrigin, origin);
	if (cent->currentState.eFlags & EF_PRONE)
	{
		size[2] += PRONE_VIEWHEIGHT + 12.f;
	}
	else if (cent->currentState.eFlags & EF_CROUCHING)
	{
		size[2] += CROUCH_VIEWHEIGHT + 8.f;
	}
	else
	{
		size[2] += DEFAULT_VIEWHEIGHT - 4.f;
	}
	origin[2] += -24.f + size[2] * 0.5f;
	ETH32_GetMuzzle(muzzle);
	return ETH32_TraceBodyBox(origin, size, muzzle, clientNum, eth32.s.bodyTraceType, hit, weap->bodyTraces);
}

static qboolean ETH32_SingleShot(int weapon)
{
	switch (weapon)
	{
	case WP_K43:
	case WP_GARAND:
	case WP_CARBINE:
	case WP_KAR98:
	case WP_LUGER:
	case WP_SILENCER:
	case WP_AKIMBO_LUGER:
	case WP_AKIMBO_SILENCEDLUGER:
	case WP_COLT:
	case WP_SILENCED_COLT:
	case WP_AKIMBO_COLT:
	case WP_AKIMBO_SILENCEDCOLT:
		return qtrue;
	default:
		return qfalse;
	}
}

static void ETH32_ApplySelfPred(vec3_t aimPt)
{
	vec3_t vs, p, v1, vp, displ;
	float  dt;

	if (eth32.s.predSelfType == ETH32_SPR_OFF)
	{
		return;
	}
	VectorCopy(cg.predictedPlayerState.velocity, vs);
	if (eth32.s.predSelfType == ETH32_SPR_MANUAL)
	{
		VectorMA(aimPt, eth32.s.predSelf, vs, aimPt);
		return;
	}
	if (eth32.s.predSelfType == ETH32_SPR_PING)
	{
		VectorMA(aimPt, cg.snap->ping * -0.0001f, vs, aimPt);
		return;
	}
	dt = -(float)cg.frametime * 0.001f;
	VectorSubtract(aimPt, cg.refdef.vieworg, p);
	VectorNormalize(p);
	VectorScale(p, DotProduct(vs, p), v1);
	VectorSubtract(vs, v1, vp);
	VectorScale(vp, dt, displ);
	VectorAdd(aimPt, displ, aimPt);
}

static int ETH32_CollectTargets(int *out, int maxOut)
{
	int i, n = 0;
	vec3_t muzzle;

	ETH32_GetMuzzle(muzzle);
	for (i = 0; i < MAX_CLIENTS && n < maxOut; i++)
	{
		eth32_player_t *pl = &eth32.players[i];
		centity_t      *cent = &cg_entities[i];
		const eth32_weap_t *weap = ETH32_Weapon(cg.predictedPlayerState.weapon);
		orientation_t   savedHead = pl->orHead;

		Com_Memset(pl, 0, sizeof(*pl));
		pl->orHead    = savedHead;
		pl->clientNum = i;
		if (!ETH32_IsEnemy(i))
		{
			continue;
		}
		pl->valid     = qtrue;
		pl->invuln    = (cent->currentState.powerups & (1 << PW_INVULNERABLE)) ? qtrue : qfalse;
		pl->cls       = cgs.clientinfo[i].cls;
		pl->distance  = Distance(muzzle, cent->lerpOrigin);
		pl->kdRatio   = (float)cgs.clientinfo[i].score;
		pl->accuracy  = (float)cgs.clientinfo[i].score;
		pl->threat    = pl->kdRatio;
		pl->omniBot   = (cgs.clientinfo[i].ping == 0) ? qtrue : qfalse;
		if (eth32.s.autoPredictBots)
		{
			eth32.s.predTarget = pl->omniBot ? eth32.s.predbot : eth32.s.pred;
		}
		else
		{
			eth32.s.predTarget = eth32.s.pred;
		}
		if ((weap->attribs & ETH32_WA_USER_DEFINED) &&
		    pl->distance < weap->range &&
		    ETH32_CheckFov(cent->lerpOrigin))
		{
			out[n++] = i;
		}
		else if (weap->attribs & ETH32_WA_BALLISTIC)
		{
			out[n++] = i;
		}
	}
	trap_Cvar_Set("etjs_eth32n", va("%d", n));
	return n;
}

void ETH32_DoBulletBot(void)
{
	int                list[MAX_CLIENTS];
	int                n, i, target = -1;
	vec3_t             muzzle, aim, spos, ppos;
	const eth32_weap_t *weap = ETH32_Weapon(cg.predictedPlayerState.weapon);
	qboolean           autoMode, fire = qfalse, lock = qfalse;

	if (!(weap->attribs & ETH32_WA_USER_DEFINED) || !eth32.s.aimSort)
	{
		return;
	}
	if (eth32.s.aimType == ETH32_AIM_OFF)
	{
		return;
	}
	if (eth32.s.aimType == ETH32_AIM_ON_FIRE && !eth32.attackPressed)
	{
		return;
	}
	if (eth32.s.aimType == ETH32_AIM_ON_BUTTON && !eth32.aimkeyPressed)
	{
		return;
	}
	if (cg.clientNum != cg.snap->ps.clientNum)
	{
		return;
	}
	if (cg.snap->ps.weaponstate == WEAPON_RELOADING)
	{
		return;
	}
	if (cg.snap->ps.weapon == WP_KNIFE || cg.snap->ps.weapon == WP_KNIFE_KABAR)
	{
		return;
	}
	if (cgs.autoMapExpanded || cg.showGameView)
	{
		return;
	}

	autoMode = (weap->autofire && eth32.s.autofire && eth32.s.aimType != ETH32_AIM_ON_FIRE) ? qtrue : qfalse;
	ETH32_GetMuzzle(muzzle);

	if (eth32.s.aimType == ETH32_AIM_TRIGGER)
	{
		vec3_t  ahead;
		trace_t t;

		VectorMA(cg.refdef.vieworg, 8192, cg.refdef.viewaxis[0], ahead);
		CG_Trace(&t, cg.refdef.vieworg, NULL, NULL, ahead, cg.snap->ps.clientNum,
		         CONTENTS_SOLID | CONTENTS_BODY | CONTENTS_ITEM);
		if (!ETH32_IsEnemy(t.entityNum))
		{
			return;
		}
	}

	n = ETH32_CollectTargets(list, MAX_CLIENTS);
	if (eth32.s.lockTarget && eth32.lastTarget >= 0)
	{
		int lt = eth32.lastTarget;

		if (ETH32_IsEnemy(lt))
		{
			if ((eth32.s.headbody == ETH32_HEAD_PRIORITY || eth32.s.headbody == ETH32_HEAD_BODY) &&
			    ETH32_TraceHead(lt, muzzle, aim))
			{
				target = lt;
			}
			else if (eth32.s.headbody != ETH32_HEAD_ONLY && ETH32_TraceBody(lt, aim))
			{
				target = lt;
			}
			else if (eth32.s.headbody != ETH32_BODY_ONLY && ETH32_TraceHead(lt, muzzle, aim))
			{
				target = lt;
			}
		}
	}

	if (target < 0 && n > 0)
	{
		qsort(list, n, sizeof(list[0]), ETH32_SortPlayers);
		if (eth32.s.headbody == ETH32_HEAD_PRIORITY)
		{
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceHead(list[i], muzzle, aim))
				{
					target = list[i];
				}
			}
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceBody(list[i], aim))
				{
					target = list[i];
				}
			}
		}
		else if (eth32.s.headbody == ETH32_HEAD_BODY)
		{
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceHead(list[i], muzzle, aim) || ETH32_TraceBody(list[i], aim))
				{
					target = list[i];
				}
			}
		}
		else if (eth32.s.headbody == ETH32_BODY_HEAD)
		{
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceBody(list[i], aim) || ETH32_TraceHead(list[i], muzzle, aim))
				{
					target = list[i];
				}
			}
		}
		else if (eth32.s.headbody == ETH32_HEAD_ONLY)
		{
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceHead(list[i], muzzle, aim))
				{
					target = list[i];
				}
			}
		}
		else
		{
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceBody(list[i], aim))
				{
					target = list[i];
				}
			}
		}
	}

	if (target < 0)
	{
		for (i = 0; i < n; i++)
		{
			vec3_t chest;
			float  hz = 56.f;

			if (cg_entities[list[i]].currentState.eFlags & (EF_PRONE | EF_PRONE_MOVING))
			{
				hz = 12.f;
			}
			else if (cg_entities[list[i]].currentState.eFlags & EF_CROUCHING)
			{
				hz = 36.f;
			}
			VectorCopy(cg_entities[list[i]].lerpOrigin, chest);
			chest[2] += hz;
			if (ETH32_PointVisible(muzzle, chest, list[i]))
			{
				target = list[i];
				VectorCopy(chest, aim);
				break;
			}
		}
	}

	eth32.lastTarget = target;
	if (target < 0 && (eth32.s.preAim || eth32.s.preShoot) && n > 0)
	{
		VectorMA(muzzle, eth32.s.preAimTime * 0.001f, cg.predictedPlayerState.velocity, ppos);
		VectorMA(muzzle, eth32.s.preShootTime * 0.001f, cg.predictedPlayerState.velocity, spos);
		if (eth32.s.preAim)
		{
			for (i = 0; i < n; i++)
			{
				vec3_t pred;

				VectorMA(cg_entities[list[i]].lerpOrigin, eth32.s.preAimTime * 0.001f,
				         cg_entities[list[i]].currentState.pos.trDelta, pred);
				if (ETH32_PointVisible(ppos, pred, list[i]))
				{
					target = list[i];
					VectorCopy(pred, aim);
					lock = qtrue;
					ETH32_ApplyAim(muzzle, aim, target, qtrue);
					trap_Cvar_Set("etjs_aimlock", "1");
					return;
				}
			}
		}
		if (eth32.s.preShoot)
		{
			for (i = 0; i < n && target < 0; i++)
			{
				if (ETH32_TraceHead(list[i], spos, aim))
				{
					target = list[i];
				}
			}
		}
	}

	if (target >= 0)
	{
		if (eth32.s.autoDelay)
		{
			float d = eth32.players[target].distance;

			if (d < 2500.f)
			{
				eth32.weapons[cg.predictedPlayerState.weapon].delay = eth32.s.delayClose;
			}
			else if (d < 5000.f)
			{
				eth32.weapons[cg.predictedPlayerState.weapon].delay = eth32.s.delayMed;
			}
			else
			{
				eth32.weapons[cg.predictedPlayerState.weapon].delay = eth32.s.delayFar;
			}
		}
		ETH32_ApplySelfPred(aim);
		if (eth32.s.aimMode == ETH32_AIMMODE_HUMAN && eth32.s.randomAim)
		{
			float dist = eth32.players[target].distance / 1500.f;
			int   freq = rand() % (eth32.s.shakeFreq > 0 ? eth32.s.shakeFreq : 1);

			if (dist < 0.6f)
			{
				dist = 0.6f;
			}
			if (dist > 1.f)
			{
				dist = 1.f;
			}
			if (freq >= 500 && cg.time - eth32.lastShake > freq)
			{
				aim[0] += crandom() * eth32.s.randFactX * dist;
				aim[1] += crandom() * eth32.s.randFactY * dist;
				aim[2] += crandom() * eth32.s.randFactZ * dist;
				eth32.lastShake = cg.time;
			}
		}
		lock = qtrue;
		if (autoMode || eth32.s.aimType == ETH32_AIM_ALWAYS || eth32.attackPressed)
		{
			if (ETH32_SingleShot(cg.predictedPlayerState.weapon))
			{
				if (cg.time - eth32.lastShotTime >= 30)
				{
					fire = qtrue;
					eth32.lastShotTime = cg.time;
				}
			}
			else
			{
				fire = qtrue;
			}
		}
		VectorCopy(aim, eth32.players[target].aimPt);
		ETH32_ApplyAim(muzzle, aim, target, qtrue);
		trap_Cvar_Set("etjs_aimlock", lock ? "1" : "0");
		if (fire && (autoMode || eth32.s.aimType == ETH32_AIM_ALWAYS))
		{
			trap_Cvar_Set("etjs_autofire", "1");
		}
		if (eth32.s.atkValidate && !fire && !eth32.attackPressed)
		{
			trap_Cvar_Set("etjs_autofire", "0");
		}
	}
	else if (eth32.s.atkValidate)
	{
		trap_Cvar_Set("etjs_autofire", "0");
	}
}

static float ETH32_SpeedForPitch(float pitch)
{
	float f;
	int   m;

	pitch *= -57.29578f;
	if (pitch > 40.f)
	{
		return 117.f;
	}
	if (pitch < -50.f)
	{
		return 900.f;
	}
	f  = (pitch + 50.f) * 2.f;
	m  = (int)f;
	f -= (float)m;
	return eth32_speedLUT[m] + f * (eth32_speedLUT[m + 1] - eth32_speedLUT[m]);
}

static void ETH32_GrenadePitchCorr(float pitch, float *z)
{
	float gp, f;
	int   m;

	gp = -pitch * 57.2957795131f;
	if (gp < -30.f || gp > 87.74824f)
	{
		*z = pitch;
		return;
	}
	f  = gp * 2.f + 60.f;
	m  = (int)f;
	f -= (float)m;
	*z  = eth32_pitchLUT[m] + f * (eth32_pitchLUT[m + 1] - eth32_pitchLUT[m]);
	*z *= -0.01745329252f;
}

static qboolean ETH32_BallisticPitch(const vec3_t start, const vec3_t endpos, float v, float maxTime, float *flytime, float *angle)
{
	float  pitch, Di, s, z, zc, p, t;
	const float g = 800.f;
	vec3_t D;

	VectorSubtract(endpos, start, D);
	s = sqrtf(D[0] * D[0] + D[1] * D[1]);
	z = D[2];
	if (s < 1.f)
	{
		return qfalse;
	}
	Di = v * v * v * v - 2.f * z * g * v * v - g * g * s * s;
	p  = 1.f / (g * s);
	if (Di < 0.f)
	{
		return qfalse;
	}
	pitch = atanf(v * v * p - sqrtf(Di) * p);
	t     = s / (v * cosf(pitch));
	if (t > 0.1f && t < maxTime)
	{
		zc = v * sinf(pitch) * t - 0.5f * g * t * t - z;
		if (zc < 0.f)
		{
			zc = -zc;
		}
		if (zc < 5.f)
		{
			*angle   = pitch;
			*flytime = t;
			return qtrue;
		}
	}
	return qfalse;
}

static qboolean ETH32_GrenadePitch(const vec3_t start, const vec3_t endpos, float maxTime, float *flytime, float *angle, qboolean longOnly)
{
	float Di, s, z, zc, p, t, v, rpitch;
	float p0 = 0.78f, p1;
	const float g = 800.f;
	vec3_t D;
	int    i;
	qboolean firstTry = qtrue;

	VectorSubtract(endpos, start, D);
	s = sqrtf(D[0] * D[0] + D[1] * D[1]);
	z = D[2];
	if (s < 1.f)
	{
		return qfalse;
	}
	p = 1.f / (g * s);
	for (i = 0; i < 100; i++)
	{
		ETH32_GrenadePitchCorr(p0, &rpitch);
		v  = ETH32_SpeedForPitch(rpitch);
		Di = v * v * v * v - 2.f * z * g * v * v - g * g * s * s;
		if (Di < 0.f)
		{
			if (firstTry)
			{
				firstTry = qfalse;
				i        = -1;
				p0       = 0.78f;
				continue;
			}
			return qfalse;
		}
		if (firstTry && !longOnly)
		{
			p1 = atanf(v * v * p - sqrtf(Di) * p);
		}
		else
		{
			p1 = atanf(v * v * p + sqrtf(Di) * p);
		}
		p0 += (p1 - p0) * 0.025f;
	}
	t = s / (v * cosf(p0));
	if (t > 0.f && t < maxTime)
	{
		zc = v * sinf(p0) * t - 0.5f * g * t * t - z;
		if (zc < 0.f)
		{
			zc = -zc;
		}
		if (zc < 10.f)
		{
			*angle   = p0;
			*flytime = t;
			return qtrue;
		}
	}
	return qfalse;
}

static qboolean ETH32_TrajectoryValid(const vec3_t start, const vec3_t end, float pitch, float flytime, float v)
{
	float   t, dt, vs, vz;
	const float g = 800.f;
	vec3_t  d0, p0, p1;
	trace_t tr;

	vs = v * cosf(pitch);
	vz = v * sinf(pitch);
	VectorSubtract(end, start, d0);
	d0[2] = 0;
	VectorNormalize(d0);
	dt = flytime / 20.f;
	VectorCopy(start, p0);
	for (t = dt; t < flytime; t += dt)
	{
		VectorMA(start, t * vs, d0, p1);
		p1[2] += vz * t - 0.5f * g * t * t;
		CG_Trace(&tr, p0, NULL, NULL, p1, cg.snap->ps.clientNum, MASK_MISSILESHOT);
		if (tr.fraction < 1.f || tr.startsolid)
		{
			return qfalse;
		}
		VectorCopy(p1, p0);
	}
	return qtrue;
}

static void ETH32_PointGrenade(const vec3_t vieworg, float pitch, int target)
{
	vec3_t org, ang, aim;

	VectorCopy(cg_entities[target].lerpOrigin, aim);
	VectorSubtract(aim, vieworg, org);
	vectoangles(org, ang);
	ang[PITCH] = -pitch * 180.f / (float)M_PI;
	ETH32_ApplyAim(vieworg, aim, target, qfalse);
	/* overwrite pitch with ballistic solution in command space */
	{
		int rawPitch = ANGLE2SHORT(ang[PITCH]) - cg.predictedPlayerState.delta_angles[PITCH];
		int rawYaw   = ANGLE2SHORT(ang[YAW]) - cg.predictedPlayerState.delta_angles[YAW];

		trap_Cvar_Set("etjs_addyaw", va("%f", SHORT2ANGLE(rawYaw)));
		trap_Cvar_Set("etjs_addpitch", va("%f", SHORT2ANGLE(rawPitch)));
		trap_Cvar_Set("etjs_aimworldpitch", va("%f", AngleNormalize180(ang[PITCH])));
		trap_Cvar_Set("etjs_target", va("%d", target));
		trap_Cvar_Set("etjs_aimlock", "1");
		cg.predictedPlayerState.viewangles[YAW]   = ang[YAW];
		cg.predictedPlayerState.viewangles[PITCH] = ang[PITCH];
	}
}

void ETH32_DoGrenadeBot(void)
{
	const eth32_weap_t *weap = ETH32_Weapon(cg.predictedPlayerState.weapon);
	int    list[MAX_CLIENTS];
	int    n, i, best = -1;
	vec3_t muzzle, point;
	float  pitch, flytime;
	qboolean solution = qfalse, doAim = qfalse;

	if (!(weap->attribs & ETH32_WA_BALLISTIC))
	{
		return;
	}
	if (!((weap->attribs & ETH32_WA_GRENADE) && eth32.s.grenadeBot) &&
	    !((weap->attribs & ETH32_WA_RIFLE_GRENADE) && eth32.s.rifleBot))
	{
		return;
	}

	ETH32_GetMuzzle(muzzle);
	n = ETH32_CollectTargets(list, MAX_CLIENTS);
	if (eth32.s.autoGrenTargets)
	{
		float bestD = 1e30f;

		for (i = 0; i < n; i++)
		{
			float d = ETH32_CrosshairDist(list[i]);

			if (d < bestD)
			{
				bestD = d;
				best  = list[i];
			}
		}
	}
	else
	{
		best = eth32.grenadeTarget;
		if (best >= 0 && !ETH32_IsEnemy(best))
		{
			best = -1;
		}
	}
	eth32.grenadeTarget = best;
	if (best < 0)
	{
		eth32.grenadeOK = qfalse;
		return;
	}

	VectorCopy(cg_entities[best].lerpOrigin, point);
	if (weap->attribs & ETH32_WA_GRENADE)
	{
		point[2] += eth32.s.grenadeZ;
		solution  = ETH32_GrenadePitch(muzzle, point, 5.f, &flytime, &pitch, qfalse);
		if (eth32.s.valGrenTrajectory && solution &&
		    !ETH32_TrajectoryValid(muzzle, cg_entities[best].lerpOrigin, pitch, flytime, ETH32_SpeedForPitch(pitch)))
		{
			solution = ETH32_GrenadePitch(muzzle, point, 5.f, &flytime, &pitch, qtrue);
			if (!ETH32_TrajectoryValid(muzzle, cg_entities[best].lerpOrigin, pitch, flytime, ETH32_SpeedForPitch(pitch)))
			{
				solution = qfalse;
			}
		}
		eth32.grenadeOK = solution;
		if (eth32.s.grenadeAutoFire)
		{
			if (eth32.grenadeTicking)
			{
				int trigger = eth32.s.grenadeFireDelay + (int)(flytime * 1000.f);

				if (solution && cg.snap->ps.grenadeTimeLeft && cg.snap->ps.grenadeTimeLeft < trigger)
				{
					doAim = qtrue;
					eth32.grenadeTicking = qfalse;
					eth32.grenadeFireTime = cg.time;
					trap_Cvar_Set("etjs_autofire", "0");
				}
				else
				{
					trap_Cvar_Set("etjs_autofire", "1");
				}
			}
			if (!eth32.grenadeTicking && eth32.attackPressed)
			{
				eth32.grenadeTicking = qtrue;
				trap_Cvar_Set("etjs_autofire", "1");
			}
			if (cg.snap->ps.grenadeTimeLeft && cg.snap->ps.grenadeTimeLeft < 500)
			{
				eth32.grenadeTicking = qfalse;
				trap_Cvar_Set("etjs_autofire", "0");
				if (solution)
				{
					doAim = qtrue;
				}
			}
		}
		else if (eth32.attackPressed)
		{
			eth32.grenadeTicking = qtrue;
		}
		else if (eth32.grenadeTicking)
		{
			eth32.grenadeTicking = qfalse;
			if (solution)
			{
				doAim = qtrue;
			}
		}
		if (solution && eth32.s.grenadeSenslock)
		{
			doAim = qtrue;
		}
		if (doAim)
		{
			vec3_t launch, right, corr;

			ETH32_GrenadePitchCorr(pitch, &corr[0]);
			AngleVectors(cg.refdefViewAngles, NULL, right, NULL);
			VectorMA(muzzle, 20, right, launch);
			launch[2] -= 8;
			ETH32_PointGrenade(launch, corr[0], best);
		}
		if (eth32.s.grenadeBlockFire && !solution && eth32.attackPressed)
		{
			trap_Cvar_Set("etjs_autofire", "0");
		}
	}
	else if (weap->attribs & ETH32_WA_RIFLE_GRENADE)
	{
		point[2] += eth32.s.riflenadeZ;
		solution  = ETH32_BallisticPitch(muzzle, point, 2000.f, 5.f, &flytime, &pitch);
		if (solution && eth32.s.valRifleTrajectory &&
		    !ETH32_TrajectoryValid(muzzle, point, pitch, flytime, 2000.f))
		{
			solution = qfalse;
		}
		eth32.grenadeOK = solution;
		if (solution && (eth32.attackPressed || eth32.s.rifleAutoFire))
		{
			ETH32_PointGrenade(muzzle, pitch, best);
			if (eth32.s.rifleAutoFire)
			{
				trap_Cvar_Set("etjs_autofire", "1");
			}
		}
	}
	eth32.flyTime = flytime;
}

#endif /* __EMSCRIPTEN__ */
