/*
 * ETH32NIX rabbmod — core state, defaults, and engine helpers.
 * Source: https://github.com/rabb/eth32nix-rabbmod
 */
#include "eth32nix.h"

#ifdef __EMSCRIPTEN__

eth32_state_t eth32;

const char *eth32_aimModeText[] = { "Aimbot Off", "Normal Aimbot", "Human Aimbot" };
const char *eth32_aimTypeText[] = { "Off", "On Fire", "On Button", "Always", "Trigger" };
const char *eth32_sortText[] = { "Off", "Distance", "Attacker", "Crosshair", "K/D ratio", "Accuracy", "Threat" };
const char *eth32_priorityText[] = { "Body Only", "Head Only", "Body - Head", "Head - Body", "Head priority" };
const char *eth32_hitboxText[] = { "Off", "etMain", "etPub", "etPro", "Generic", "Custom" };
const char *eth32_headTraceText[] = { "Center", "Static", "X Trace" };
const char *eth32_bodyTraceText[] = {
	"Center", "Contour", "Static", "X Trace",
	"Rand Volume", "Rand Surface", "Cap Volume", "Cap Surface"
};
const char *eth32_humanText[] = { "Simple Logins", "Full Logins" };
const char *eth32_protectText[] = { "Aimprotect Off", "Aimprotect Specs", "Aimprotect All" };
const char *eth32_selfPredText[] = { "Off", "Manual", "Ping", "L337" };
const char *eth32_rfPredText[] = { "Off", "Linear", "Linear/2", "Average", "Smart" };
const char *eth32_classEspText[] = { "Off", "Static", "Distance" };

static void ETH32_SetRgb(byte *out, int r, int g, int b)
{
	out[0] = (byte)r;
	out[1] = (byte)g;
	out[2] = (byte)b;
}

static void ETH32_InitWeapons(void)
{
	int i;

	Com_Memset(eth32.weapons, 0, sizeof(eth32.weapons));
	for (i = 0; i < WP_NUM_WEAPONS; i++)
	{
		eth32.weapons[i].name        = "Unknown";
		eth32.weapons[i].range       = 8192;
		eth32.weapons[i].headTraces  = 16;
		eth32.weapons[i].bodyTraces  = 16;
		eth32.weapons[i].autofire    = qtrue;
	}

#define W(id, n, attr) do { \
		eth32.weapons[id].name     = (n); \
		eth32.weapons[id].attribs  = (attr); \
	} while (0)

	W(WP_NONE, "None", ETH32_WA_NONE);
	W(WP_KNIFE, "Knife", ETH32_WA_USER_DEFINED | ETH32_WA_NO_AMMO);
	W(WP_KNIFE_KABAR, "Knife", ETH32_WA_USER_DEFINED | ETH32_WA_NO_AMMO);
	W(WP_LUGER, "Luger", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_COLT, "Colt", ETH32_WA_USER_DEFINED);
	W(WP_SILENCER, "Silenced Luger", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_SILENCED_COLT, "Silenced Colt", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_AKIMBO_COLT, "Akimbo Colt", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_AKIMBO);
	W(WP_AKIMBO_LUGER, "Akimbo Luger", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_AKIMBO);
	W(WP_AKIMBO_SILENCEDCOLT, "Silenced Colts", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_AKIMBO);
	W(WP_AKIMBO_SILENCEDLUGER, "Silenced Lugers", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_AKIMBO);
	W(WP_MP40, "MP-40", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_THOMPSON, "Thompson", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_STEN, "Sten", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_OVERHEAT);
	W(WP_MP34, "MP-34", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_OVERHEAT);
	W(WP_KAR98, "KAR-98", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_CARBINE, "Carbine", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE);
	W(WP_GARAND, "Garand", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_UNSCOPED);
	W(WP_GARAND_SCOPE, "Garand (Scoped)", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_SCOPED);
	W(WP_K43, "K-43", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_UNSCOPED);
	W(WP_K43_SCOPE, "K-43 (Scoped)", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_SCOPED);
	W(WP_FG42, "FG-42", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_UNSCOPED);
	W(WP_FG42_SCOPE, "FG-42 (Scoped)", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_SCOPED);
	W(WP_MOBILE_MG42, "Mobile MG-42", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_OVERHEAT);
	W(WP_MOBILE_MG42_SET, "MG-42 Set", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_OVERHEAT);
	W(WP_MOBILE_BROWNING, "Browning", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_OVERHEAT);
	W(WP_MOBILE_BROWNING_SET, "Browning Set", ETH32_WA_USER_DEFINED | ETH32_WA_BLOCK_FIRE | ETH32_WA_OVERHEAT);
	W(WP_GRENADE_LAUNCHER, "Grenade", ETH32_WA_ONLY_CLIP | ETH32_WA_BALLISTIC | ETH32_WA_GRENADE);
	W(WP_GRENADE_PINEAPPLE, "Grenade", ETH32_WA_ONLY_CLIP | ETH32_WA_BALLISTIC | ETH32_WA_GRENADE);
	W(WP_GPG40, "Rifle Grenade", ETH32_WA_RIFLE_GRENADE | ETH32_WA_BALLISTIC);
	W(WP_M7, "Rifle Grenade", ETH32_WA_RIFLE_GRENADE | ETH32_WA_BALLISTIC);
	W(WP_PANZERFAUST, "Panzerfaust", ETH32_WA_PANZER | ETH32_WA_ONLY_CLIP);
	W(WP_BAZOOKA, "Bazooka", ETH32_WA_PANZER | ETH32_WA_ONLY_CLIP);
	W(WP_FLAMETHROWER, "Flamethrower", ETH32_WA_ONLY_CLIP);
	W(WP_MORTAR, "Mortar", ETH32_WA_NONE);
	W(WP_MORTAR_SET, "Mortar", ETH32_WA_MORTAR);
	W(WP_MORTAR2, "Mortar", ETH32_WA_NONE);
	W(WP_MORTAR2_SET, "Mortar", ETH32_WA_MORTAR);
	W(WP_SATCHEL, "Satchel", ETH32_WA_NO_AMMO);
	W(WP_SATCHEL_DET, "Detonator", ETH32_WA_NO_AMMO | ETH32_WA_SATCHEL);
	W(WP_DYNAMITE, "Dynamite", ETH32_WA_NO_AMMO);
	W(WP_LANDMINE, "Landmine", ETH32_WA_ONLY_CLIP);
	W(WP_SMOKE_BOMB, "Smoke Grenade", ETH32_WA_NO_AMMO);
	W(WP_SMOKE_MARKER, "Air Strike", ETH32_WA_NO_AMMO);
#undef W

	eth32.weapons[WP_KNIFE].autofire      = qfalse;
	eth32.weapons[WP_KNIFE_KABAR].autofire = qfalse;
}

void ETH32_LoadDefaults(void)
{
	eth32_settings_t *s = &eth32.s;
	int i;

	Com_Memset(s, 0, sizeof(*s));
	/* rabbmod settings.ini */
	s->aimMode             = ETH32_AIMMODE_NORMAL;
	s->aimType             = ETH32_AIM_ALWAYS;
	s->autofire            = qtrue;
	s->atkValidate         = qfalse;
	s->lockTarget          = qfalse;
	s->fov                 = 360.f;
	s->aimSort             = ETH32_SORT_ATTACKER;
	s->headbody            = ETH32_HEAD_PRIORITY;
	s->hitboxType          = ETH32_HITBOX_ETPRO;
	s->headTraceType       = ETH32_HEAD_XTRACE;
	s->bodyTraceType       = ETH32_BODY_XTRACE;
	s->dynamicHitboxScale  = 0.841f;
	s->animCorrection      = -3.453f;
	s->autoCrouch          = qtrue;
	s->grenadeBot          = qfalse;
	s->rifleBot            = qfalse;
	s->grenadeBlockFire    = qtrue;
	s->valGrenTrajectory   = qtrue;
	s->valRifleTrajectory  = qtrue;
	s->grenadeTracer       = qtrue;
	s->rifleTracer         = qtrue;
	s->grenadeSenslock     = qfalse;
	s->riflenadeZ          = 12.5f;
	s->grenadeZ            = -50.f;
	s->grenadeFireDelay    = 125;
	s->grenadeAutoFire     = qtrue;
	s->rifleAutoFire       = qfalse;
	s->ballisticPredict    = ETH32_RF_SMART;
	s->ballisticRadiusDamage = qtrue;
	s->radiusDamage        = 100.f;
	s->autoGrenTargets     = qtrue;
	s->allowMultiBounce    = qtrue;
	s->humanMode           = ETH32_HUMAN_FULL;
	s->human1_speed        = 0.043f;
	s->human2_humanValue   = 0.200f;
	s->human2_aimX         = 2.847f;
	s->human2_aimY         = 2.431f;
	s->human2_divMin       = 6.736f;
	s->human2_divMax       = 5.208f;
	s->aimprotect          = ETH32_PROTECT_SPECS;
	s->lockMouse           = qtrue;
	s->randomAim           = qfalse;
	s->shakeFreq           = 8219;
	s->randFactX           = 204;
	s->randFactY           = 240;
	s->randFactZ           = 383;
	s->headBoxSize         = 4.512f;
	s->bodybox             = 32.405f;
	s->autoDelay           = qtrue;
	s->delayClose          = 3;
	s->delayMed            = 4;
	s->delayFar            = 6;
	s->autoVecX            = qtrue;
	s->autoVecZ            = qtrue;
	s->standlowX = -0.737f; s->standmedX = -0.667f; s->standfarX = -0.596f; s->standY = -0.200f;
	s->standlowZ = 7.018f;  s->standmedZ = 6.316f;  s->standfarZ = 5.158f;
	s->runlowX = -1.018f;   s->runmedX = -0.912f;   s->runfarX = -1.719f;   s->runY = -0.491f;
	s->runlowZ = 6.211f;    s->runmedZ = 4.912f;    s->runfarZ = 3.965f;
	s->crouchlowX = 0.f;    s->crouchmedX = 0.f;    s->crouchfarX = 0.f;    s->crouchY = -0.300f;
	s->crouchlowZ = 4.175f; s->crouchmedZ = 2.947f; s->crouchfarZ = 2.351f;
	s->crawllowX = -2.316f; s->crawlmedX = -1.614f; s->crawlfarX = -1.439f; s->crawlY = -0.737f;
	s->crawllowZ = 6.561f;  s->crawlmedZ = 5.439f;  s->crawlfarZ = 2.877f;
	s->pronelowX = 0.450f;  s->pronemedX = 0.450f;  s->pronefarX = 0.450f;  s->proneY = -0.450f;
	s->pronelowZ = 6.800f;  s->pronemedZ = 6.800f;  s->pronefarZ = 6.800f;
	s->preShoot            = qtrue;
	s->preAim              = qtrue;
	s->preShootTime        = 101.579f;
	s->preAimTime          = 300.f;
	s->predSelfType        = ETH32_SPR_MANUAL;
	s->predSelf            = -0.004f;
	s->autoPredictBots     = qtrue;
	s->pred                = -0.004f;
	s->predbot             = -0.047f;
	s->drawHackVisuals     = qtrue;
	s->wallhack            = qtrue;
	s->smoketrnsp          = 33;
	s->radarRange          = 3000.f;
	s->guiBanner           = qtrue;
	s->bannerScale         = 1.f;
	Q_strncpyz(s->bannerFmt, "^1ETH32NIX  ^7[n]  ^3[P]ms  ^2K^7[k] ^1D^7[d]  ^3Spree [S]", sizeof(s->bannerFmt));
	s->removeFoliage       = qtrue;
	s->removeParticles     = qtrue;
	s->drawHeadHitbox      = qtrue;
	s->espName             = qtrue;
	s->drawDisguised       = qtrue;
	s->grenadeDlight       = qtrue;
	s->mortarDlight        = qtrue;
	s->mortarTrace         = qtrue;
	s->artyMarkers         = qtrue;
	s->classEspType        = ETH32_CLS_STATIC;
	s->clsSize             = 14.f;
	s->clsOpacity          = 0.8f;
	s->itemEsp             = qfalse;
	s->itemEspSize         = 14.f;
	s->itemEspOpacity      = 0.8f;
	s->boxEsp              = qfalse;
	s->boxEspBorder        = 1;
	s->boxEspOpacity       = 0.8f;
	s->teamShader1         = 1;
	s->teamShader1Wallhack = qtrue;
	s->enemyShader1        = 1;
	s->enemyShader1Wallhack = qtrue;
	s->weaponShader1Wallhack = qtrue;
	s->itemShader1Wallhack = qtrue;
	ETH32_SetRgb(s->colorTeam, 104, 255, 0);
	ETH32_SetRgb(s->colorTeamOut, 0, 0, 255);
	ETH32_SetRgb(s->colorTeamHidden, 0, 100, 0);
	ETH32_SetRgb(s->colorEnemy, 255, 0, 154);
	ETH32_SetRgb(s->colorEnemyOut, 255, 0, 255);
	ETH32_SetRgb(s->colorEnemyHidden, 100, 0, 0);
	ETH32_SetRgb(s->colorInvulnerable, 255, 255, 0);
	VectorSet(s->clsTeam, 0.f, 1.f, 0.f);
	VectorSet(s->clsEnemy, 1.f, 0.f, 0.f);
	VectorSet(s->missileEsp, 1.f, 1.f, 1.f);
	VectorSet(s->colorHeadHitbox, 0.f, 1.f, 0.f);
	VectorSet(s->colorBodyHitbox, 0.f, 1.f, 0.f);
	s->headRailTime        = 40;
	s->bodyRailTime        = 40;
	s->respawnTimers       = qtrue;
	s->getSpeclist         = qtrue;
	for (i = 0; i < ETH32_GENT_MAX; i++)
	{
		s->gentChams[i] = qtrue;
		s->gentText[i]  = qtrue;
		s->gentIcon[i]  = qtrue;
	}
}

#define ETH32_CFG_PATH "eth32nix.ini"
#define ETH32_CFG_MAX  16384

typedef enum
{
	ETH32_CF_BOOL = 0,
	ETH32_CF_INT,
	ETH32_CF_FLOAT,
	ETH32_CF_BYTE,
	ETH32_CF_STR
} eth32_cfKind_t;

typedef struct
{
	const char    *name;
	eth32_cfKind_t kind;
	size_t         offset;
	int            maxlen;
} eth32_cfField_t;

#define ETH32_OFF(field) offsetof(eth32_settings_t, field)

static const eth32_cfField_t eth32_cfgFields[] =
{
	{ "aimmode", ETH32_CF_INT, ETH32_OFF(aimMode), 0 },
	{ "aimtype", ETH32_CF_INT, ETH32_OFF(aimType), 0 },
	{ "autofire", ETH32_CF_BOOL, ETH32_OFF(autofire), 0 },
	{ "atkvalid", ETH32_CF_BOOL, ETH32_OFF(atkValidate), 0 },
	{ "locktarget", ETH32_CF_BOOL, ETH32_OFF(lockTarget), 0 },
	{ "fov", ETH32_CF_FLOAT, ETH32_OFF(fov), 0 },
	{ "aimsort", ETH32_CF_INT, ETH32_OFF(aimSort), 0 },
	{ "headbody", ETH32_CF_INT, ETH32_OFF(headbody), 0 },
	{ "hitboxtype", ETH32_CF_INT, ETH32_OFF(hitboxType), 0 },
	{ "headtracetype", ETH32_CF_INT, ETH32_OFF(headTraceType), 0 },
	{ "bodytracetype", ETH32_CF_INT, ETH32_OFF(bodyTraceType), 0 },
	{ "dynamichitbox", ETH32_CF_FLOAT, ETH32_OFF(dynamicHitboxScale), 0 },
	{ "animcor", ETH32_CF_FLOAT, ETH32_OFF(animCorrection), 0 },
	{ "autocrouch", ETH32_CF_BOOL, ETH32_OFF(autoCrouch), 0 },
	{ "grenadebot", ETH32_CF_BOOL, ETH32_OFF(grenadeBot), 0 },
	{ "riflebot", ETH32_CF_BOOL, ETH32_OFF(rifleBot), 0 },
	{ "grenblockfire", ETH32_CF_BOOL, ETH32_OFF(grenadeBlockFire), 0 },
	{ "valgrentrajectory", ETH32_CF_BOOL, ETH32_OFF(valGrenTrajectory), 0 },
	{ "valrifletrajectory", ETH32_CF_BOOL, ETH32_OFF(valRifleTrajectory), 0 },
	{ "grenadetracer", ETH32_CF_BOOL, ETH32_OFF(grenadeTracer), 0 },
	{ "rifletracer", ETH32_CF_BOOL, ETH32_OFF(rifleTracer), 0 },
	{ "grensenslock", ETH32_CF_BOOL, ETH32_OFF(grenadeSenslock), 0 },
	{ "riflenadeZ", ETH32_CF_FLOAT, ETH32_OFF(riflenadeZ), 0 },
	{ "grenadeZ", ETH32_CF_FLOAT, ETH32_OFF(grenadeZ), 0 },
	{ "grenfiredelay", ETH32_CF_INT, ETH32_OFF(grenadeFireDelay), 0 },
	{ "grenadeautofire", ETH32_CF_BOOL, ETH32_OFF(grenadeAutoFire), 0 },
	{ "rifleautofire", ETH32_CF_BOOL, ETH32_OFF(rifleAutoFire), 0 },
	{ "grenpredict", ETH32_CF_INT, ETH32_OFF(ballisticPredict), 0 },
	{ "radiusdamage_enable", ETH32_CF_BOOL, ETH32_OFF(ballisticRadiusDamage), 0 },
	{ "radiusdamage", ETH32_CF_FLOAT, ETH32_OFF(radiusDamage), 0 },
	{ "grenautotarg", ETH32_CF_BOOL, ETH32_OFF(autoGrenTargets), 0 },
	{ "multibounce", ETH32_CF_BOOL, ETH32_OFF(allowMultiBounce), 0 },
	{ "humanMode", ETH32_CF_INT, ETH32_OFF(humanMode), 0 },
	{ "human1_speed", ETH32_CF_FLOAT, ETH32_OFF(human1_speed), 0 },
	{ "human2_humanValue", ETH32_CF_FLOAT, ETH32_OFF(human2_humanValue), 0 },
	{ "human2_aimX", ETH32_CF_FLOAT, ETH32_OFF(human2_aimX), 0 },
	{ "human2_aimY", ETH32_CF_FLOAT, ETH32_OFF(human2_aimY), 0 },
	{ "human2_divMin", ETH32_CF_FLOAT, ETH32_OFF(human2_divMin), 0 },
	{ "human2_divMax", ETH32_CF_FLOAT, ETH32_OFF(human2_divMax), 0 },
	{ "aimprotect", ETH32_CF_INT, ETH32_OFF(aimprotect), 0 },
	{ "lockMouse", ETH32_CF_BOOL, ETH32_OFF(lockMouse), 0 },
	{ "randomAim", ETH32_CF_BOOL, ETH32_OFF(randomAim), 0 },
	{ "shakeFreq", ETH32_CF_INT, ETH32_OFF(shakeFreq), 0 },
	{ "randFactX", ETH32_CF_INT, ETH32_OFF(randFactX), 0 },
	{ "randFactY", ETH32_CF_INT, ETH32_OFF(randFactY), 0 },
	{ "randFactZ", ETH32_CF_INT, ETH32_OFF(randFactZ), 0 },
	{ "headBoxSize", ETH32_CF_FLOAT, ETH32_OFF(headBoxSize), 0 },
	{ "bodybox", ETH32_CF_FLOAT, ETH32_OFF(bodybox), 0 },
	{ "autoDelay", ETH32_CF_BOOL, ETH32_OFF(autoDelay), 0 },
	{ "delayClose", ETH32_CF_INT, ETH32_OFF(delayClose), 0 },
	{ "delayMed", ETH32_CF_INT, ETH32_OFF(delayMed), 0 },
	{ "delayFar", ETH32_CF_INT, ETH32_OFF(delayFar), 0 },
	{ "autoVecX", ETH32_CF_BOOL, ETH32_OFF(autoVecX), 0 },
	{ "autoVecZ", ETH32_CF_BOOL, ETH32_OFF(autoVecZ), 0 },
	{ "preShoot", ETH32_CF_BOOL, ETH32_OFF(preShoot), 0 },
	{ "preAim", ETH32_CF_BOOL, ETH32_OFF(preAim), 0 },
	{ "preShootTime", ETH32_CF_FLOAT, ETH32_OFF(preShootTime), 0 },
	{ "preAimTime", ETH32_CF_FLOAT, ETH32_OFF(preAimTime), 0 },
	{ "predSelfType", ETH32_CF_INT, ETH32_OFF(predSelfType), 0 },
	{ "predSelf", ETH32_CF_FLOAT, ETH32_OFF(predSelf), 0 },
	{ "autoPredictBots", ETH32_CF_BOOL, ETH32_OFF(autoPredictBots), 0 },
	{ "pred", ETH32_CF_FLOAT, ETH32_OFF(pred), 0 },
	{ "predbot", ETH32_CF_FLOAT, ETH32_OFF(predbot), 0 },
	{ "drawHackVisuals", ETH32_CF_BOOL, ETH32_OFF(drawHackVisuals), 0 },
	{ "wallhack", ETH32_CF_BOOL, ETH32_OFF(wallhack), 0 },
	{ "smoketrnsp", ETH32_CF_INT, ETH32_OFF(smoketrnsp), 0 },
	{ "radarRange", ETH32_CF_FLOAT, ETH32_OFF(radarRange), 0 },
	{ "guiBanner", ETH32_CF_BOOL, ETH32_OFF(guiBanner), 0 },
	{ "bannerScale", ETH32_CF_FLOAT, ETH32_OFF(bannerScale), 0 },
	{ "bannerFmt", ETH32_CF_STR, ETH32_OFF(bannerFmt), (int)sizeof(((eth32_settings_t *)0)->bannerFmt) },
	{ "removeFoliage", ETH32_CF_BOOL, ETH32_OFF(removeFoliage), 0 },
	{ "removeParticles", ETH32_CF_BOOL, ETH32_OFF(removeParticles), 0 },
	{ "drawHeadHitbox", ETH32_CF_BOOL, ETH32_OFF(drawHeadHitbox), 0 },
	{ "drawBodyHitbox", ETH32_CF_BOOL, ETH32_OFF(drawBodyHitbox), 0 },
	{ "espName", ETH32_CF_BOOL, ETH32_OFF(espName), 0 },
	{ "drawDisguised", ETH32_CF_BOOL, ETH32_OFF(drawDisguised), 0 },
	{ "grenadeDlight", ETH32_CF_BOOL, ETH32_OFF(grenadeDlight), 0 },
	{ "mortarDlight", ETH32_CF_BOOL, ETH32_OFF(mortarDlight), 0 },
	{ "mortarTrace", ETH32_CF_BOOL, ETH32_OFF(mortarTrace), 0 },
	{ "artyMarkers", ETH32_CF_BOOL, ETH32_OFF(artyMarkers), 0 },
	{ "classEspType", ETH32_CF_INT, ETH32_OFF(classEspType), 0 },
	{ "clsSize", ETH32_CF_FLOAT, ETH32_OFF(clsSize), 0 },
	{ "clsOpacity", ETH32_CF_FLOAT, ETH32_OFF(clsOpacity), 0 },
	{ "itemEsp", ETH32_CF_BOOL, ETH32_OFF(itemEsp), 0 },
	{ "itemEspSize", ETH32_CF_FLOAT, ETH32_OFF(itemEspSize), 0 },
	{ "itemEspOpacity", ETH32_CF_FLOAT, ETH32_OFF(itemEspOpacity), 0 },
	{ "boxEsp", ETH32_CF_BOOL, ETH32_OFF(boxEsp), 0 },
	{ "boxEspBorder", ETH32_CF_INT, ETH32_OFF(boxEspBorder), 0 },
	{ "boxEspOpacity", ETH32_CF_FLOAT, ETH32_OFF(boxEspOpacity), 0 },
	{ "teamShader1", ETH32_CF_INT, ETH32_OFF(teamShader1), 0 },
	{ "enemyShader1", ETH32_CF_INT, ETH32_OFF(enemyShader1), 0 },
	{ "teamShader1Wallhack", ETH32_CF_BOOL, ETH32_OFF(teamShader1Wallhack), 0 },
	{ "enemyShader1Wallhack", ETH32_CF_BOOL, ETH32_OFF(enemyShader1Wallhack), 0 },
	{ "weaponShader1Wallhack", ETH32_CF_BOOL, ETH32_OFF(weaponShader1Wallhack), 0 },
	{ "itemShader1Wallhack", ETH32_CF_BOOL, ETH32_OFF(itemShader1Wallhack), 0 },
	{ "respawnTimers", ETH32_CF_BOOL, ETH32_OFF(respawnTimers), 0 }
};

static void *ETH32_CfgPtr(eth32_settings_t *s, const eth32_cfField_t *f)
{
	return (byte *)s + f->offset;
}

static void ETH32_CfgApply(eth32_settings_t *s, const char *key, const char *val)
{
	int i;

	for (i = 0; i < (int)ARRAY_LEN(eth32_cfgFields); i++)
	{
		const eth32_cfField_t *f = &eth32_cfgFields[i];
		void                  *p = ETH32_CfgPtr(s, f);

		if (Q_stricmp(key, f->name))
		{
			continue;
		}
		switch (f->kind)
		{
		case ETH32_CF_BOOL:
			*(qboolean *)p = (!Q_stricmp(val, "true") || atoi(val) != 0) ? qtrue : qfalse;
			return;
		case ETH32_CF_INT:
			*(int *)p = atoi(val);
			return;
		case ETH32_CF_FLOAT:
			*(float *)p = (float)atof(val);
			return;
		case ETH32_CF_BYTE:
			*(byte *)p = (byte)Com_Clamp(0, 255, atoi(val));
			return;
		case ETH32_CF_STR:
			Q_strncpyz((char *)p, val, f->maxlen > 0 ? f->maxlen : 1);
			return;
		}
	}
}

static int ETH32_CfgAppend(char *buf, int len, int max, const char *name, const char *val)
{
	if (len < 0 || len >= max)
	{
		return len;
	}
	return len + Com_sprintf(buf + len, max - len, "%s=%s\n", name, val);
}

void ETH32_SaveConfig(void)
{
	char         buf[ETH32_CFG_MAX];
	char         val[256];
	fileHandle_t f;
	int          i, len = 0;

	len = ETH32_CfgAppend(buf, len, sizeof(buf), "version", "1");
	for (i = 0; i < (int)ARRAY_LEN(eth32_cfgFields); i++)
	{
		const eth32_cfField_t *field = &eth32_cfgFields[i];
		void                  *p     = ETH32_CfgPtr(&eth32.s, field);

		switch (field->kind)
		{
		case ETH32_CF_BOOL:
			Q_strncpyz(val, *(qboolean *)p ? "true" : "false", sizeof(val));
			break;
		case ETH32_CF_INT:
			Com_sprintf(val, sizeof(val), "%d", *(int *)p);
			break;
		case ETH32_CF_FLOAT:
			Com_sprintf(val, sizeof(val), "%.3f", *(float *)p);
			break;
		case ETH32_CF_BYTE:
			Com_sprintf(val, sizeof(val), "%d", (int)*(byte *)p);
			break;
		case ETH32_CF_STR:
			Q_strncpyz(val, (char *)p, sizeof(val));
			break;
		}
		len = ETH32_CfgAppend(buf, len, sizeof(buf), field->name, val);
	}
	if (trap_FS_FOpenFile(ETH32_CFG_PATH, &f, FS_WRITE) < 0 || !f)
	{
		return;
	}
	trap_FS_Write(buf, len, f);
	trap_FS_FCloseFile(f);
	trap_Cvar_Set("etjs_eth32save", "1");
}

void ETH32_LoadConfig(void)
{
	char         buf[ETH32_CFG_MAX];
	fileHandle_t f;
	int          len, i;
	char         *line, *next, *eq;

	len = trap_FS_FOpenFile(ETH32_CFG_PATH, &f, FS_READ);
	if (len <= 0 || !f)
	{
		return;
	}
	if (len >= (int)sizeof(buf))
	{
		len = (int)sizeof(buf) - 1;
	}
	trap_FS_Read(buf, len, f);
	trap_FS_FCloseFile(f);
	buf[len] = 0;

	for (line = buf; line && *line; line = next)
	{
		next = strchr(line, '\n');
		if (next)
		{
			*next++ = 0;
		}
		while (*line == ' ' || *line == '\t' || *line == '\r')
		{
			line++;
		}
		if (!*line || *line == '#' || *line == '[')
		{
			continue;
		}
		eq = strchr(line, '=');
		if (!eq)
		{
			continue;
		}
		*eq++ = 0;
		for (i = (int)strlen(line) - 1; i >= 0 && (line[i] == ' ' || line[i] == '\t'); i--)
		{
			line[i] = 0;
		}
		while (*eq == ' ' || *eq == '\t')
		{
			eq++;
		}
		i = (int)strlen(eq);
		if (i > 0 && eq[i - 1] == '\r')
		{
			eq[i - 1] = 0;
		}
		ETH32_CfgApply(&eth32.s, line, eq);
	}
}

void ETH32_SaveAndClose(void)
{
	ETH32_SaveConfig();
	eth32.revert        = eth32.s;
	eth32.commitOnClose = qtrue;
	if (eth32.menuOpen)
	{
		ETH32_ToggleMenu();
	}
}

void ETH32_CancelAndClose(void)
{
	eth32.commitOnClose = qfalse;
	if (eth32.menuOpen)
	{
		ETH32_ToggleMenu();
	}
}

static void ETH32_SanitizeSettings(void);

void ETH32_Init(void)
{
	if (eth32.inited)
	{
		return;
	}
	Com_Memset(&eth32, 0, sizeof(eth32));
	eth32.lastTarget    = -1;
	eth32.grenadeTarget = -1;
	eth32.dragCtrl      = -1;
	eth32.cursorX       = 320.f;
	eth32.cursorY       = 240.f;
	ETH32_LoadDefaults();
	ETH32_LoadConfig();
	ETH32_SanitizeSettings();
	eth32.revert = eth32.s;
	ETH32_InitWeapons();
	eth32.inited = qtrue;
}

qboolean ETH32_Active(void)
{
	return (cg_etjsArcade.integer && cg_aimbot.integer && eth32.inited) ? qtrue : qfalse;
}

void ETH32_SetEnabled(qboolean on)
{
	ETH32_Init();
	if (!on && eth32.menuOpen)
	{
		ETH32_ToggleMenu();
	}
	if (!on)
	{
		eth32.lastTarget    = -1;
		eth32.grenadeTarget = -1;
		trap_Cvar_Set("etjs_target", "-1");
		trap_Cvar_Set("etjs_autofire", "0");
		trap_Cvar_Set("etjs_aimlock", "0");
	}
}

void ETH32_ToggleMenu(void)
{
	ETH32_Init();
	if (!ETH32_Active())
	{
		return;
	}
	eth32.menuOpen = !eth32.menuOpen;
	if (eth32.menuOpen)
	{
		eth32.revert        = eth32.s;
		eth32.commitOnClose = qfalse;
		eth32.cursorX = 320.f;
		eth32.cursorY = 240.f;
		trap_Key_SetCatcher(trap_Key_GetCatcher() | KEYCATCH_CGAME);
		trap_Cvar_Set("etjs_uiopen", "1");
		trap_Cvar_Set("cl_aimbotmenu", "1");
	}
	else
	{
		if (!eth32.commitOnClose)
		{
			eth32.s = eth32.revert;
		}
		eth32.commitOnClose = qfalse;
		trap_Key_SetCatcher(trap_Key_GetCatcher() & ~KEYCATCH_CGAME);
		trap_Cvar_Set("etjs_uiopen", "0");
		trap_Cvar_Set("cl_aimbotmenu", "0");
	}
}

qboolean ETH32_MenuOpen(void)
{
	return (eth32.menuOpen && ETH32_Active()) ? qtrue : qfalse;
}

int ETH32_LocalTeam(void)
{
	int team;

	if (!cg.snap)
	{
		return TEAM_FREE;
	}
	team = cg.snap->ps.teamNum;
	if (team != TEAM_AXIS && team != TEAM_ALLIES)
	{
		team = cgs.clientinfo[cg.clientNum].team;
	}
	return team;
}

int ETH32_EnemyTeam(void)
{
	int local = ETH32_LocalTeam();

	if (local == TEAM_AXIS)
	{
		return TEAM_ALLIES;
	}
	if (local == TEAM_ALLIES)
	{
		return TEAM_AXIS;
	}
	return TEAM_FREE;
}

qboolean ETH32_IsEnemy(int clientNum)
{
	centity_t *cent;
	int        localTeam, enemyTeam;

	if (clientNum < 0 || clientNum >= MAX_CLIENTS || clientNum == cg.clientNum)
	{
		return qfalse;
	}
	if (!cgs.clientinfo[clientNum].infoValid)
	{
		return qfalse;
	}
	cent = &cg_entities[clientNum];
	if (!cent->currentValid || cent->currentState.eType != ET_PLAYER ||
	    (cent->currentState.eFlags & EF_DEAD))
	{
		return qfalse;
	}
	if (cent->currentState.powerups & (1 << PW_INVULNERABLE))
	{
		return qfalse;
	}
	localTeam  = ETH32_LocalTeam();
	enemyTeam  = ETH32_EnemyTeam();
	if (enemyTeam == TEAM_FREE)
	{
		return qfalse;
	}
	if ((cent->currentState.teamNum != enemyTeam &&
	     cgs.clientinfo[clientNum].team != enemyTeam) ||
	    cent->currentState.teamNum == localTeam ||
	    cgs.clientinfo[clientNum].team == localTeam)
	{
		return qfalse;
	}
	return qtrue;
}

const eth32_weap_t *ETH32_Weapon(int weapon)
{
	if (weapon < 0 || weapon >= WP_NUM_WEAPONS)
	{
		return &eth32.weapons[WP_NONE];
	}
	return &eth32.weapons[weapon];
}

qboolean ETH32_PointVisible(const vec3_t from, const vec3_t pt, int skip)
{
	trace_t tr;

	CG_Trace(&tr, from, NULL, NULL, pt, cg.clientNum, MASK_SHOT);
	return (tr.fraction > 0.98f || tr.entityNum == skip) ? qtrue : qfalse;
}

qboolean ETH32_WorldToScreen(const vec3_t point, float *x, float *y)
{
	vec3_t trans;
	float  z, px, py;

	VectorSubtract(point, cg.refdef.vieworg, trans);
	z = DotProduct(trans, cg.refdef.viewaxis[0]);
	if (z <= 8.f)
	{
		return qfalse;
	}
	px = tan((double)cg.refdef.fov_x * M_PI / 360.0);
	py = tan((double)cg.refdef.fov_y * M_PI / 360.0);
	if (px == 0.f || py == 0.f)
	{
		return qfalse;
	}
	*x = 320.f - DotProduct(trans, cg.refdef.viewaxis[1]) * 320.f / (z * px);
	*y = 240.f - DotProduct(trans, cg.refdef.viewaxis[2]) * 240.f / (z * py);
	return qtrue;
}

void ETH32_GetMuzzle(vec3_t out)
{
	VectorCopy(cg.predictedPlayerState.origin, out);
	out[2] += cg.predictedPlayerState.viewheight;
}

qboolean ETH32_GetHeadOri(int clientNum, orientation_t *ori)
{
	centity_t *cent;
	vec3_t     delta;
	float      z;

	if (clientNum < 0 || clientNum >= MAX_CLIENTS || !ori)
	{
		return qfalse;
	}
	cent = &cg_entities[clientNum];

	if (CG_GetTag(clientNum, "tag_head", ori))
	{
		return qtrue;
	}
	if (cent->pe.headRefEnt.hModel)
	{
		VectorCopy(cent->pe.headRefEnt.origin, ori->origin);
		AxisCopy(cent->pe.headRefEnt.axis, ori->axis);
		VectorSubtract(ori->origin, cent->lerpOrigin, delta);
		if (VectorLengthSquared(delta) <= Square(128.f))
		{
			return qtrue;
		}
	}
	/* Fallback: player origin plus stance height. Do not use the last
	 * captured refent — that is often a weapon or torso piece. */
	VectorCopy(cent->lerpOrigin, ori->origin);
	if (cent->currentState.eFlags & (EF_PRONE | EF_PRONE_MOVING))
	{
		z = 12.f;
	}
	else if (cent->currentState.eFlags & EF_CROUCHING)
	{
		z = 36.f;
	}
	else
	{
		z = 56.f;
	}
	ori->origin[2] += z;
	VectorSet(ori->axis[0], 1.f, 0.f, 0.f);
	VectorSet(ori->axis[1], 0.f, 1.f, 0.f);
	VectorSet(ori->axis[2], 0.f, 0.f, 1.f);
	return qtrue;
}

void ETH32_ApplyAim(const vec3_t from, const vec3_t aimPt, int target, qboolean humanize)
{
	vec3_t to, ang, cur, delta;
	int    rawYaw, rawPitch;
	float  speed;

	VectorSubtract(aimPt, from, to);
	vectoangles(to, ang);
	if (Q_fabs(AngleNormalize180(ang[PITCH])) > 70.f)
	{
		return;
	}

	if (humanize && eth32.s.aimMode == ETH32_AIMMODE_HUMAN)
	{
		VectorCopy(cg.predictedPlayerState.viewangles, cur);
		delta[YAW]   = AngleDelta(ang[YAW], cur[YAW]);
		delta[PITCH] = AngleDelta(ang[PITCH], cur[PITCH]);
		if (eth32.s.humanMode == ETH32_HUMAN_HALF)
		{
			speed        = eth32.s.human1_speed;
			ang[YAW]     = cur[YAW] + delta[YAW] * speed;
			ang[PITCH]   = cur[PITCH] + delta[PITCH] * speed;
		}
		else
		{
			float humanvalue = eth32.s.human2_humanValue;
			float aimDiv     = eth32.s.human2_divMax;

			if (aimDiv > eth32.s.human2_divMin)
			{
				delta[PITCH] *= ((humanvalue / aimDiv) * eth32.s.human2_aimY);
				delta[YAW]   *= ((humanvalue / aimDiv) * eth32.s.human2_aimX);
			}
			if (delta[PITCH] < 0.f)
			{
				delta[PITCH] *= 0.02f;
			}
			ang[YAW]   = cur[YAW] + delta[YAW];
			ang[PITCH] = cur[PITCH] + delta[PITCH];
		}
		ang[YAW]   = AngleNormalize180(ang[YAW]);
		ang[PITCH] = AngleNormalize180(ang[PITCH]);
	}

	rawYaw   = ANGLE2SHORT(ang[YAW]) - cg.predictedPlayerState.delta_angles[YAW];
	rawPitch = ANGLE2SHORT(ang[PITCH]) - cg.predictedPlayerState.delta_angles[PITCH];
	trap_Cvar_Set("etjs_addyaw", va("%f", SHORT2ANGLE(rawYaw)));
	trap_Cvar_Set("etjs_addpitch", va("%f", SHORT2ANGLE(rawPitch)));
	trap_Cvar_Set("etjs_aimworldpitch", va("%f", AngleNormalize180(ang[PITCH])));
	trap_Cvar_Set("etjs_target", va("%d", target));
	cg.predictedPlayerState.viewangles[YAW]   = ang[YAW];
	cg.predictedPlayerState.viewangles[PITCH] = ang[PITCH];
}

void ETH32_AimFrame(void)
{
	usercmd_t ucmd;

	if (!ETH32_Active() || !cg.snap)
	{
		return;
	}
	if (ETH32_MenuOpen())
	{
		trap_Cvar_Set("etjs_target", "-1");
		trap_Cvar_Set("etjs_autofire", "0");
		trap_Cvar_Set("etjs_aimlock", "0");
		return;
	}
	if (cg.snap->ps.pm_type != PM_NORMAL || cg.snap->ps.stats[STAT_HEALTH] <= 0)
	{
		trap_Cvar_Set("etjs_target", "-1");
		trap_Cvar_Set("etjs_autofire", "0");
		trap_Cvar_Set("etjs_aimlock", "0");
		return;
	}
	if (eth32.s.aimMode == ETH32_AIMMODE_OFF)
	{
		return;
	}
	if (eth32.s.aimMode == ETH32_AIMMODE_HUMAN)
	{
		if ((eth32.s.aimprotect == ETH32_PROTECT_ALL && cgs.clientinfo[cg.clientNum].team == TEAM_SPECTATOR) ||
		    (eth32.s.aimprotect == ETH32_PROTECT_SPECS && cg.snap->ps.pm_flags & PMF_FOLLOW))
		{
			return;
		}
	}

	trap_GetUserCmd(trap_GetCurrentCmdNumber(), &ucmd);
	eth32.attackPressed = (ucmd.buttons & BUTTON_ATTACK) ? qtrue : qfalse;
	eth32.aimkeyPressed = eth32.attackPressed;

	trap_Cvar_Set("etjs_target", "-1");
	trap_Cvar_Set("etjs_autofire", "0");
	trap_Cvar_Set("etjs_aimlock", "0");

	ETH32_DoBulletBot();
	ETH32_DoGrenadeBot();
	trap_Cvar_Set("etjs_eth32last", va("%d", eth32.lastTarget));
}

void ETH32_Draw2D(void)
{
	int  wantMenu;
	char menuBuf[16];

	if (!eth32.inited)
	{
		ETH32_Init();
	}
	trap_Cvar_VariableStringBuffer("cl_aimbotmenu", menuBuf, sizeof(menuBuf));
	wantMenu = atoi(menuBuf);
	if (ETH32_Active() && wantMenu && !eth32.menuOpen)
	{
		ETH32_ToggleMenu();
	}
	else if ((!ETH32_Active() || !wantMenu) && eth32.menuOpen)
	{
		ETH32_ToggleMenu();
	}
	if (ETH32_MenuOpen())
	{
		trap_Key_SetCatcher(trap_Key_GetCatcher() | KEYCATCH_CGAME);
	}
	if (!ETH32_Active() || !eth32.s.drawHackVisuals)
	{
		if (ETH32_MenuOpen())
		{
			ETH32_DrawGui();
		}
		return;
	}
	ETH32_DrawVisuals();
	ETH32_DrawGui();
}

void ETH32_CaptureHead(int clientNum, const refEntity_t *re)
{
	if (clientNum < 0 || clientNum >= MAX_CLIENTS || !re)
	{
		return;
	}
	VectorCopy(re->origin, eth32.players[clientNum].orHead.origin);
	AxisCopy(re->axis, eth32.players[clientNum].orHead.axis);
}

static int ETH32_ClampInt(int v, int lo, int hiExclusive)
{
	if (v < lo)
	{
		return lo;
	}
	if (v >= hiExclusive)
	{
		return hiExclusive - 1;
	}
	return v;
}

static void ETH32_SanitizeSettings(void)
{
	eth32.s.aimMode       = ETH32_ClampInt(eth32.s.aimMode, 0, ETH32_AIMMODE_MAX);
	eth32.s.aimType       = ETH32_ClampInt(eth32.s.aimType, 0, ETH32_AIM_MAX);
	eth32.s.aimSort       = ETH32_ClampInt(eth32.s.aimSort, 0, ETH32_SORT_MAX);
	eth32.s.headbody      = ETH32_ClampInt(eth32.s.headbody, 0, ETH32_AP_MAX);
	eth32.s.hitboxType    = ETH32_ClampInt(eth32.s.hitboxType, 0, ETH32_HITBOX_MAX);
	eth32.s.headTraceType = ETH32_ClampInt(eth32.s.headTraceType, 0, ETH32_HEAD_MAX);
	eth32.s.bodyTraceType = ETH32_ClampInt(eth32.s.bodyTraceType, 0, ETH32_BODY_MAX);
	eth32.s.humanMode     = ETH32_ClampInt(eth32.s.humanMode, 0, ETH32_HUMAN_MAX);
	eth32.s.aimprotect    = ETH32_ClampInt(eth32.s.aimprotect, 0, ETH32_PROTECT_MAX);
	eth32.s.predSelfType  = ETH32_ClampInt(eth32.s.predSelfType, 0, ETH32_SPR_MAX);
	eth32.s.classEspType  = ETH32_ClampInt(eth32.s.classEspType, 0, ETH32_CLS_MAX);
}

#endif /* __EMSCRIPTEN__ */
