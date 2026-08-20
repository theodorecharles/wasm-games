/*
 * ETH32NIX rabbmod compiled into the WolfET client.
 * Algorithms and defaults from https://github.com/rabb/eth32nix-rabbmod
 * (no injector, detours, or engine offsets).
 */
#ifndef ETH32NIX_H
#define ETH32NIX_H

#include "cg_local.h"

#ifdef __EMSCRIPTEN__

#define ETH32_WA_NONE           0
#define ETH32_WA_USER_DEFINED   (1 << 0)
#define ETH32_WA_OVERHEAT       (1 << 1)
#define ETH32_WA_BLOCK_FIRE     (1 << 2)
#define ETH32_WA_AKIMBO         (1 << 3)
#define ETH32_WA_SCOPED         (1 << 4)
#define ETH32_WA_UNSCOPED       (1 << 5)
#define ETH32_WA_RIFLE_GRENADE  (1 << 6)
#define ETH32_WA_MORTAR         (1 << 7)
#define ETH32_WA_PANZER         (1 << 8)
#define ETH32_WA_SATCHEL        (1 << 9)
#define ETH32_WA_NO_AMMO        (1 << 10)
#define ETH32_WA_ONLY_CLIP      (1 << 11)
#define ETH32_WA_BALLISTIC      (1 << 12)
#define ETH32_WA_GRENADE        (1 << 13)

typedef enum
{
	ETH32_AIMMODE_OFF = 0,
	ETH32_AIMMODE_NORMAL,
	ETH32_AIMMODE_HUMAN,
	ETH32_AIMMODE_MAX
} eth32_aimMode_t;

typedef enum
{
	ETH32_AIM_OFF = 0,
	ETH32_AIM_ON_FIRE,
	ETH32_AIM_ON_BUTTON,
	ETH32_AIM_ALWAYS,
	ETH32_AIM_TRIGGER,
	ETH32_AIM_MAX
} eth32_aimType_t;

typedef enum
{
	ETH32_SORT_OFF = 0,
	ETH32_SORT_DISTANCE,
	ETH32_SORT_ATTACKER,
	ETH32_SORT_CROSSHAIR,
	ETH32_SORT_KDRATIO,
	ETH32_SORT_ACCURACY,
	ETH32_SORT_THREAT,
	ETH32_SORT_MAX
} eth32_sort_t;

typedef enum
{
	ETH32_BODY_ONLY = 0,
	ETH32_HEAD_ONLY,
	ETH32_BODY_HEAD,
	ETH32_HEAD_BODY,
	ETH32_HEAD_PRIORITY,
	ETH32_AP_MAX
} eth32_priority_t;

typedef enum
{
	ETH32_HITBOX_OFF = 0,
	ETH32_HITBOX_ETMAIN,
	ETH32_HITBOX_ETPUB,
	ETH32_HITBOX_ETPRO,
	ETH32_HITBOX_GENERIC,
	ETH32_HITBOX_CUSTOM,
	ETH32_HITBOX_MAX
} eth32_hitbox_t;

typedef enum
{
	ETH32_HEAD_CENTER = 0,
	ETH32_HEAD_STATIC,
	ETH32_HEAD_XTRACE,
	ETH32_HEAD_MAX
} eth32_headTrace_t;

typedef enum
{
	ETH32_BODY_CENTER = 0,
	ETH32_BODY_CONTOUR,
	ETH32_BODY_STATIC,
	ETH32_BODY_XTRACE,
	ETH32_BODY_RANDOM_VOLUME,
	ETH32_BODY_RANDOM_SURFACE,
	ETH32_BODY_CAPSULE_VOLUME,
	ETH32_BODY_CAPSULE_SURFACE,
	ETH32_BODY_MAX
} eth32_bodyTrace_t;

typedef enum
{
	ETH32_HUMAN_HALF = 0,
	ETH32_HUMAN_FULL,
	ETH32_HUMAN_MAX
} eth32_humanMode_t;

typedef enum
{
	ETH32_PROTECT_OFF = 0,
	ETH32_PROTECT_SPECS,
	ETH32_PROTECT_ALL,
	ETH32_PROTECT_MAX
} eth32_protect_t;

typedef enum
{
	ETH32_SPR_OFF = 0,
	ETH32_SPR_MANUAL,
	ETH32_SPR_PING,
	ETH32_SPR_LEET,
	ETH32_SPR_MAX
} eth32_selfPred_t;

typedef enum
{
	ETH32_RF_OFF = 0,
	ETH32_RF_LINEAR,
	ETH32_RF_LINEAR2,
	ETH32_RF_AVG,
	ETH32_RF_SMART,
	ETH32_RF_MAX
} eth32_rfPredict_t;

typedef enum
{
	ETH32_CLS_OFF = 0,
	ETH32_CLS_STATIC,
	ETH32_CLS_DIST,
	ETH32_CLS_MAX
} eth32_classEsp_t;

typedef enum
{
	ETH32_GENT_GRENADE = 0,
	ETH32_GENT_GRENADEP,
	ETH32_GENT_DYNAMITE,
	ETH32_GENT_LANDMINE,
	ETH32_GENT_MORTAR,
	ETH32_GENT_PANZER,
	ETH32_GENT_RIFLENADE,
	ETH32_GENT_SATCHEL,
	ETH32_GENT_SMOKE,
	ETH32_GENT_SMOKE_MARKER,
	ETH32_GENT_MAX
} eth32_gent_t;

typedef struct
{
	vec3_t stand_offset;
	vec3_t crouch_offset;
	vec3_t prone_offset;
	vec3_t stand_offset_moving;
	vec3_t crouch_offset_moving;
	vec3_t size;
} eth32_hitboxDef_t;

typedef struct
{
	const char   *name;
	unsigned int attribs;
	int          range;
	int          headTraces;
	int          bodyTraces;
	int          delay;
	qboolean     autofire;
} eth32_weap_t;

typedef struct
{
	qboolean      valid;
	qboolean      friendly;
	qboolean      invuln;
	qboolean      visible;
	qboolean      omniBot;
	int           clientNum;
	int           cls;
	float         distance;
	float         screenX, screenY;
	vec3_t        headPt;
	vec3_t        bodyPt;
	vec3_t        aimPt;
	orientation_t orHead;
	float         kdRatio;
	float         accuracy;
	float         threat;
	vec3_t        histPos[32];
	int           histTime[32];
	int           histIdx;
	int           histCount;
} eth32_player_t;

typedef struct
{
	int      aimMode;
	int      aimType;
	qboolean autofire;
	qboolean atkValidate;
	qboolean lockTarget;
	float    fov;
	int      aimSort;
	int      headbody;
	int      hitboxType;
	int      headTraceType;
	int      bodyTraceType;
	float    dynamicHitboxScale;
	float    animCorrection;
	qboolean autoCrouch;

	qboolean grenadeBot;
	qboolean rifleBot;
	qboolean grenadeBlockFire;
	qboolean valGrenTrajectory;
	qboolean valRifleTrajectory;
	qboolean grenadeTracer;
	qboolean rifleTracer;
	qboolean grenadeSenslock;
	float    riflenadeZ;
	float    grenadeZ;
	int      grenadeFireDelay;
	qboolean grenadeAutoFire;
	qboolean rifleAutoFire;
	int      ballisticPredict;
	qboolean ballisticRadiusDamage;
	float    radiusDamage;
	qboolean autoGrenTargets;
	qboolean allowMultiBounce;

	int      humanMode;
	float    human1_speed;
	float    human2_humanValue;
	float    human2_aimX;
	float    human2_aimY;
	float    human2_divMin;
	float    human2_divMax;
	int      aimprotect;
	qboolean lockMouse;
	qboolean randomAim;
	int      shakeFreq;
	int      randFactX, randFactY, randFactZ;

	float    headBoxSize;
	float    bodybox;
	qboolean autoDelay;
	int      delayClose, delayMed, delayFar;
	qboolean autoVecZ, autoVecX;
	float    standlowX, standmedX, standfarX, standY;
	float    standlowZ, standmedZ, standfarZ;
	float    runlowX, runmedX, runfarX, runY;
	float    runlowZ, runmedZ, runfarZ;
	float    crouchlowX, crouchmedX, crouchfarX, crouchY;
	float    crouchlowZ, crouchmedZ, crouchfarZ;
	float    crawllowX, crawlmedX, crawlfarX, crawlY;
	float    crawllowZ, crawlmedZ, crawlfarZ;
	float    pronelowX, pronemedX, pronefarX, proneY;
	float    pronelowZ, pronemedZ, pronefarZ;

	qboolean preShoot, preAim;
	float    preShootTime, preAimTime;
	int      predSelfType;
	float    predSelf, predTarget, pred, predbot;
	qboolean autoPredictBots;

	qboolean drawHackVisuals;
	qboolean wallhack;
	int      smoketrnsp;
	float    radarRange;
	qboolean guiBanner;
	float    bannerScale;
	char     bannerFmt[256];
	qboolean removeFoliage;
	qboolean removeParticles;

	qboolean drawHeadHitbox, drawHeadAxes, drawBodyHitbox;
	qboolean drawBulletRail, railWallhack;
	int      headRailTime, bodyRailTime;

	qboolean espName;
	qboolean drawDisguised;
	qboolean grenadeDlight, mortarDlight, mortarTrace, artyMarkers;
	int      classEspType;
	float    clsSize, clsOpacity;
	qboolean itemEsp;
	float    itemEspSize, itemEspOpacity;
	qboolean boxEsp;
	int      boxEspBorder;
	float    boxEspOpacity;

	int      teamShader1, teamShader2;
	int      enemyShader1, enemyShader2;
	qboolean teamShader1Wallhack, teamShader2Wallhack;
	qboolean enemyShader1Wallhack, enemyShader2Wallhack;
	qboolean weaponShader1Wallhack, itemShader1Wallhack;

	byte     colorTeam[3], colorTeamOut[3], colorTeamHidden[3];
	byte     colorEnemy[3], colorEnemyOut[3], colorEnemyHidden[3];
	byte     colorInvulnerable[3];
	vec3_t   clsTeam, clsEnemy, missileEsp;
	vec3_t   colorHeadHitbox, colorBodyHitbox;

	qboolean gentChams[ETH32_GENT_MAX];
	qboolean gentText[ETH32_GENT_MAX];
	qboolean gentIcon[ETH32_GENT_MAX];

	qboolean respawnTimers;
	qboolean getSpeclist;
} eth32_settings_t;

typedef struct
{
	qboolean        inited;
	qboolean        menuOpen;
	int             menuTab;
	int             dragCtrl;
	float           cursorX, cursorY;
	int             lastTarget;
	int             grenadeTarget;
	qboolean        grenadeOK;
	qboolean        rifleMulti;
	int             grenadeFireTime;
	qboolean        grenadeTicking;
	int             lastShake;
	int             lastShotTime;
	qboolean        attackPressed;
	qboolean        aimkeyPressed;
	eth32_weap_t    weapons[WP_NUM_WEAPONS];
	eth32_player_t  players[MAX_CLIENTS];
	eth32_settings_t s;
	eth32_settings_t revert;
	qboolean        commitOnClose;
	eth32_hitboxDef_t customHitbox;
	vec3_t          lastImpact;
	float           flyTime;
} eth32_state_t;

extern eth32_state_t eth32;
extern vmCvar_t      cg_aimbot;

extern const char *eth32_aimModeText[];
extern const char *eth32_aimTypeText[];
extern const char *eth32_sortText[];
extern const char *eth32_priorityText[];
extern const char *eth32_hitboxText[];
extern const char *eth32_headTraceText[];
extern const char *eth32_bodyTraceText[];
extern const char *eth32_humanText[];
extern const char *eth32_protectText[];
extern const char *eth32_selfPredText[];
extern const char *eth32_rfPredText[];
extern const char *eth32_classEspText[];

qboolean     ETH32_Active(void);
void         ETH32_Init(void);
void         ETH32_LoadDefaults(void);
void         ETH32_LoadConfig(void);
void         ETH32_SaveConfig(void);
void         ETH32_SaveAndClose(void);
void         ETH32_CancelAndClose(void);
void         ETH32_SetEnabled(qboolean on);
void         ETH32_ToggleMenu(void);
qboolean     ETH32_MenuOpen(void);
void         ETH32_AimFrame(void);
void         ETH32_Draw2D(void);
void         ETH32_PlayerChams(refEntity_t *ent, entityState_t *es, int team);
void         ETH32_CaptureHead(int clientNum, const refEntity_t *re);
qboolean     ETH32_RevealDeployable(const entityState_t *state);
void         ETH32_DeployableChams(refEntity_t *ent, centity_t *cent);
qboolean     ETH32_KeyEvent(int key, qboolean down);
qboolean     ETH32_MouseEvent(int x, int y);
void         ETH32_ItemChams(refEntity_t *re, centity_t *cent);

qboolean     ETH32_PointVisible(const vec3_t from, const vec3_t pt, int skip);
qboolean     ETH32_WorldToScreen(const vec3_t point, float *x, float *y);
int          ETH32_LocalTeam(void);
int          ETH32_EnemyTeam(void);
qboolean     ETH32_IsEnemy(int clientNum);
const eth32_weap_t *ETH32_Weapon(int weapon);
void         ETH32_ApplyAim(const vec3_t from, const vec3_t aimPt, int target, qboolean humanize);
void         ETH32_GetMuzzle(vec3_t out);
qboolean     ETH32_GetHeadOri(int clientNum, orientation_t *ori);
void         ETH32_DoBulletBot(void);
void         ETH32_DoGrenadeBot(void);
void         ETH32_DrawVisuals(void);
void         ETH32_DrawGui(void);

#endif /* __EMSCRIPTEN__ */
#endif /* ETH32NIX_H */
