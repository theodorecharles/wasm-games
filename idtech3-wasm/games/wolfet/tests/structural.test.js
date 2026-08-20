'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FRAMEWORK_WEB = path.join(ROOT, '.generated', 'shared-shell');
const PAK0 = path.join(ROOT, 'runtime', 'etmain', 'pak0.pk3');
const OBJDATA = path.join(ROOT, 'etlegacy', 'etmain', 'maps', 'oasis.objdata');
const CLASSES = path.join(ROOT, 'etlegacy', 'src', 'game', 'bg_public.h');
const CG_DRAW = path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw.c');
const TR_WORLD = path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_world.c');
const TR_BACKEND = path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_backend.c');

function extractFn(src, name) {
  const startRe = new RegExp('(?:void|static void|const void \\*|qboolean)\\s*' + name + '\\s*\\(');
  const m = src.match(startRe);
  assert.ok(m, name + ' must exist');
  let i = m.index + m[0].length;
  let pdepth = 1;
  while (i < src.length && pdepth > 0) {
    if (src[i] === '(') {
      pdepth++;
    } else if (src[i] === ')') {
      pdepth--;
    }
    i++;
  }
  while (i < src.length && src[i] !== '{') {
    i++;
  }
  assert.ok(i < src.length, name + ' body not found');
  const start = m.index;
  i++;
  let depth = 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') {
      depth++;
    } else if (src[i] === '}') {
      depth--;
    }
    i++;
  }
  return src.slice(start, i);
}

describe('shipped ET identity (teams, classes, official oasis)', () => {
  it('serves official pak0.pk3 containing oasis.bsp', () => {
    assert.ok(fs.existsSync(PAK0), 'pak0.pk3 on search path');
    const listing = execFileSync('unzip', ['-l', PAK0], { encoding: 'utf8' });
    assert.match(listing, /maps\/oasis\.bsp/);
  });

  it('ships Allies/Axis and the five class ids in the game code the client links', () => {
    const src = fs.readFileSync(CLASSES, 'utf8');
    assert.match(src, /TEAM_AXIS/);
    assert.match(src, /TEAM_ALLIES/);
    assert.match(src, /PC_SOLDIER/);
    assert.match(src, /PC_MEDIC/);
    assert.match(src, /PC_ENGINEER/);
    assert.match(src, /PC_FIELDOPS/);
    assert.match(src, /PC_COVERTOPS/);
    assert.match(src, /#define NUM_PLAYER_CLASSES\s+5/);
  });

  it('ships an Objective-mode official map cycle', () => {
    const cycle = fs.readFileSync(path.join(ROOT, 'runtime', 'etmain', 'objectiverotate.cfg'), 'utf8');
    assert.match(cycle, /g_gametype 2/);
    assert.match(cycle, /map oasis/);
    assert.match(cycle, /map battery/);
    assert.match(cycle, /map goldrush/);
    assert.match(cycle, /map radar/);
    assert.match(cycle, /map railgun/);
    assert.match(cycle, /map fueldump/);
    assert.match(cycle, /nextmap/);
    assert.doesNotMatch(cycle, /g_gametype 4/);
    assert.doesNotMatch(cycle, /campaign /);
    const launcher = fs.readFileSync(path.join(ROOT, 'server', 'dedicated.js'), 'utf8');
    assert.match(launcher, /objectiverotate\.cfg/);
    assert.match(launcher, /g_gametype',\s*'2'/);
  });

  it('ships oasis objective scripts the dedicated server map uses', () => {
    const obj = fs.readFileSync(OBJDATA, 'utf8');
    assert.match(obj, /wm_mapdescription axis/);
    assert.match(obj, /wm_mapdescription allied/);
    assert.match(obj, /75mm/);
    const script = fs.readFileSync(path.join(ROOT, 'etlegacy', 'etmain', 'maps', 'oasis.script'), 'utf8');
    assert.match(script, /oasis/i);
  });
});

describe('no overlay theater in the shipped draw path', () => {
  const world = fs.readFileSync(TR_WORLD, 'utf8');
  const backend = fs.readFileSync(TR_BACKEND, 'utf8');
  const draw = fs.readFileSync(CG_DRAW, 'utf8');
  const shade = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_shade.c'), 'utf8');

  it('forbids ETJS overlay markers and the hardcoded oasis camera', () => {
    const blob = world + backend + draw + shade;
    assert.doesNotMatch(blob, /ETJS_RB_DrawWorld/);
    assert.doesNotMatch(blob, /ETJS_DrawFirstPerson/);
    assert.doesNotMatch(blob, /ETJS_DrawSafeWorld/);
    assert.doesNotMatch(backend, /R_ES2_DrawSafeWorld\s*\(/);
    assert.doesNotMatch(blob, /8867\.f/);
    assert.doesNotMatch(blob, /CG_FillRect\s*\(\s*shift\s*,\s*168/);
  });

  it('CG_Draw2D uses the stock HUD path', () => {
    const fn = extractFn(draw, 'CG_Draw2D');
    assert.match(fn, /CG_ScreenFade/);
    assert.match(fn, /CG_DrawActiveHud|CG_DrawCrosshair/);
    assert.doesNotMatch(fn, /skillPics\[SK_HEAVY_WEAPONS\][\s\S]{0,400}return\s*;/);
  });

  it('CG_DrawActive falls through to RenderScene and stock CG_Draw2D', () => {
    const fn = extractFn(draw, 'CG_DrawActive');
    assert.match(fn, /trap_R_RenderScene/);
    assert.match(fn, /CG_Draw2D/);
    const beforeScene = fn.split('trap_R_RenderScene')[0];
    assert.doesNotMatch(beforeScene, /#ifdef\s+__EMSCRIPTEN__[\s\S]*\breturn\s*;/);
  });

  it('R_AddWorldSurfaces adds visible faces instead of MarkLeaves+return', () => {
    const fn = extractFn(world, 'R_AddWorldSurfaces');
    assert.match(fn, /R_RecursiveWorldNode|R_AddLeafSurfaces/);
    assert.doesNotMatch(fn, /R_MarkLeaves\s*\(\s*\)\s*;\s*return\s*;/);
    assert.doesNotMatch(fn, /ETJS_RB_DrawWorld/);
  });

  it('keeps browser sky surfaces and routes them through the stock sky projection', () => {
    const addSurface = extractFn(world, 'R_AddWorldSurface');
    const shade = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_shade.c'), 'utf8');
    const begin = extractFn(shade, 'RB_BeginSurface');
    assert.doesNotMatch(addSurface, /shader\s*&&\s*shader->isSky[\s\S]*?return/);
    assert.match(begin, /if \(!state->isSky\)[\s\S]*?RB_StageIteratorGeneric/);
    assert.match(shade, /tess\.currentStageIteratorFunc\s*=\s*state->optimalStageIteratorFunc/);
  });

  it('RB_BeginDrawingView does not stay in 2D ortho and return', () => {
    const fn = extractFn(backend, 'RB_BeginDrawingView');
    assert.doesNotMatch(fn, /ETJS_RB_DrawWorld/);
    assert.doesNotMatch(fn, /glOrtho[\s\S]{0,500}return\s*;/);
  });

  it('RB_RenderDrawSurfList runs the tessellator over drawsurfs', () => {
    const fn = extractFn(backend, 'RB_RenderDrawSurfList');
    assert.match(fn, /rb_surfaceTable/);
    assert.doesNotMatch(fn, /RB_BeginDrawingView\s*\(\s*\)\s*;\s*return\s*;/);
    assert.doesNotMatch(fn, /numDrawSurfs\s*=\s*40/);
    assert.doesNotMatch(fn, /numDrawSurfs\s*=\s*0/);
  });

  it('ES2 tessellator does not abort after a small submit budget', () => {
    const es2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_es2.c'), 'utf8');
    const fn = extractFn(es2, 'R_ES2_DrawTess');
    assert.doesNotMatch(fn, /s_submits\s*>=\s*\d+/);
    assert.doesNotMatch(fn, /maxIdx\s*=\s*2046/);
    assert.match(fn, /glDrawArrays|glDrawElements/);
    assert.match(fn, /while\s*\(\s*i\s*\+\s*2\s*<\s*numIndexes/);
  });

  it('keeps large world UVs at fragment high precision', () => {
    const es2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_es2.c'), 'utf8');
    assert.match(es2, /precision highp float/);
    assert.match(es2, /varying highp vec2 v_uv/);
    assert.match(es2, /varying highp vec2 v_uv0/);
    assert.match(es2, /varying highp vec2 v_uv1/);
    assert.doesNotMatch(es2, /precision mediump float/);
  });

  it('keeps full-resolution official textures in the browser renderer', () => {
    const image = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_image.c'), 'utf8');
    assert.doesNotMatch(image, /scaled_width > 128 \|\| scaled_height > 128/);
  });

  it('recomputes HUD anchors when the browser viewport aspect changes', () => {
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    const hud = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw_hud.c'), 'utf8');
    assert.match(view, /vidWidth != ow \|\| cgs\.glconfig\.vidHeight != oh[\s\S]*CG_InvalidateHudPositions\(\)/);
    assert.match(hud, /void CG_InvalidateHudPositions\(void\)[\s\S]*hud->computed = qfalse/);
    assert.match(hud, /hud->components\[j\]->computed = qfalse/);
  });

  it('runs HUD polygons, rotation, gradients, and menu clouds through ET shader stages', () => {
    const backend = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_backend.c'), 'utf8');
    const shade = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_shade.c'), 'utf8');
    const helper = extractFn(backend, 'RB_DrawPolyShaderES2');
    assert.match(helper, /RB_BeginSurface/);
    assert.match(helper, /RB_EndSurface/);
    assert.match(extractFn(backend, 'RB_Draw2dPolys'), /RB_DrawPolyShaderES2/);
    assert.match(extractFn(backend, 'RB_RotatedPic'), /RB_DrawPolyShaderES2/);
    assert.match(extractFn(backend, 'RB_StretchPicGradient'), /RB_DrawPolyShaderES2/);
    assert.match(shade, /ComputeTexCoords\(pStage\)/);
    assert.match(shade, /R_BindAnimatedImage\(&pStage->bundle\[0\]\)/);
  });

  it('orients mortar shells from gravity-adjusted trajectory velocity', () => {
    const ents = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_ents.c'), 'utf8');
    const missile = extractFn(ents, 'CG_Missile');
    assert.match(missile, /type & WEAPON_TYPE_MORTAR/);
    assert.match(missile, /BG_EvaluateTrajectoryDelta\(&s1->pos, cg.time, delta/);
    assert.match(missile, /VectorNormalize2\(delta, ent\.axis\[0\]\)/);
    assert.doesNotMatch(missile, /CHECKBITWISE[^\n]*WEAPON_TYPE_MORTAR \| WEAPON_TYPE_SET/);
  });

  it('registers arcade-only aimbot as the compiled-in ETH32NIX toggle', () => {
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_main.c'), 'utf8');
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    const input = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    const cvars = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_cvars.c'), 'utf8');
    const header = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix.h'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix.c'), 'utf8');
    const aim = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix_aim.c'), 'utf8');
    const vis = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix_vis.c'), 'utf8');
    const gui = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix_gui.c'), 'utf8');
    assert.match(main, /Cmd_AddCommand\("aimbot"/);
    assert.match(main, /Cmd_AddCommand\("aimbotmenu"/);
    assert.match(main, /CL_Aimbot_f/);
    assert.match(main, /aimbot is only available in arcade mode/);
    assert.doesNotMatch(main, /Cmd_AddCommand\("rshook"/);
    assert.doesNotMatch(main, /Cmd_AddCommand\("cchook"/);
    assert.doesNotMatch(main, /Cmd_AddCommand\("icebot"/);
    assert.doesNotMatch(main, /Cmd_AddCommand\("ethook"/);
    assert.match(cvars, /cl_aimbot/);
    assert.doesNotMatch(cvars, /cl_rshook/);
    assert.doesNotMatch(cvars, /cl_cchook/);
    assert.match(view, /ETH32_AimFrame/);
    assert.match(input, /cl_aimbot/);
    assert.match(input, /etjs_autofire/);
    assert.match(main, /g_etjsArcade/);
    assert.match(header, /ETH32_DoBulletBot/);
    assert.match(aim, /ETH32_HEAD_PRIORITY/);
    assert.match(core, /tag_head/);
    assert.match(aim, /ETH32_TraceHead/);
    assert.match(aim, /ETH32_TraceBody/);
    assert.match(aim, /ETH32_DoGrenadeBot/);
    assert.match(vis, /RF_DEPTHHACK/);
    assert.match(vis, /shoutcastLandmineShader/);
    assert.match(gui, /ETH32_DrawGui/);
    assert.match(gui, /Aimbot Mode/);
    const scrn = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(scrn, /Cvar_VariableIntegerValue\("cl_aimbotmenu"\)/);
    assert.match(client, /cvarInt\('etjs_uiopen'\) !== 0 \|\| cvarInt\('cl_aimbotmenu'\) !== 0/);
    assert.match(input, /cl_aimbotmenu[\s\S]*?KEYCATCH_CGAME/);
    assert.match(input, /cl_aimbotmenu[\s\S]*?BUTTON_TALK/);
    assert.match(gui, /CG_DrawCursor/);
    assert.match(gui, /etjs_cx/);
    assert.match(gui, /ETH32_Hit\(16\.f, 448\.f, 90\.f, 16\.f\)[\s\S]*ETH32_SaveAndClose/);
    assert.match(gui, /ETH32_CancelAndClose/);
    assert.match(core, /ETH32_SaveConfig/);
    assert.match(core, /eth32nix\.ini/);
    assert.doesNotMatch(core, /ETH32_CFG_PATH "eth32\.cfg"/);
    assert.match(scrn, /etjs_console/);
    assert.match(client, /function engineWantsKeys\(\)[\s\S]*consoleOpen\(\)/);
    assert.match(client, /isConsoleEvent\(ev, initialCode\)[\s\S]*!engineWantsKeys/);
    assert.match(client, /cvarInt\('etjs_eth32save'\)/);
    assert.match(client, /function persistEth32Config\(\)/);
    assert.match(client, /function sanitizePersistentHome\(FS\)/);
    assert.match(client, /etjs\.eth32cfg/);
    assert.match(client, /function writeSafeEtconfig\(FS\)/);
    assert.match(client, /eth32nix\.ini/);
    const commonWrite = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'qcommon', 'common.c'), 'utf8');
    assert.match(commonWrite, /etjs: bindings only/);
    const keys = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_keys.c'), 'utf8');
    assert.match(keys, /cl_aimbotmenu[\s\S]*?Cvar_Set\("cl_aimbotmenu", "0"\)/);
  });

  it('ETH32NIX aims, walls, and draws through the existing browser command seam', () => {
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix.c'), 'utf8');
    const aim = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix_aim.c'), 'utf8');
    assert.match(view, /trap_Cvar_Set\("etjs_target", "-1"\)/);
    assert.match(view, /ETH32_AimFrame/);
    assert.match(core, /etjs_addyaw/);
    assert.match(core, /etjs_addpitch/);
    assert.match(core, /etjs_aimworldpitch/);
    assert.match(core, /ANGLE2SHORT\(ang\[YAW\]\) - cg\.predictedPlayerState\.delta_angles\[YAW\]/);
    assert.match(core, /Q_fabs\(AngleNormalize180\(ang\[PITCH\]\)\) > 70\.f/);
    assert.match(core, /cgs\.clientinfo\[clientNum\]\.team == localTeam/);
    assert.match(core, /cent->currentState\.teamNum == localTeam/);
    assert.match(core, /enemyTeam/);
    const players = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_players.c'), 'utf8');
    assert.match(players, /ETH32_PlayerChams/);
    assert.match(players, /ETH32_CaptureHead/);
    const vis = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix_vis.c'), 'utf8');
    assert.match(vis, /customShader = cgs\.media\.shoutcastLandmineShader/);
    assert.match(vis, /RF_DEPTHHACK/);
    const ents = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_ents.c'), 'utf8');
    assert.match(ents, /ETJS_RevealEnemyDeployable/);
    assert.match(ents, /ETH32_RevealDeployable/);
    assert.match(ents, /WP_LANDMINE[\s\S]*?WP_DYNAMITE[\s\S]*?WP_SATCHEL/);
    assert.match(ents, /ETJS_AddDeployableHookShell/);
    assert.match(ents, /effect1Time == 1[\s\S]*?ETJS_RevealEnemyDeployable[\s\S]*?CG_DrawMineMarkerFlag/);
    const missile = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_missile.c'), 'utf8');
    const mineSnapshot = extractFn(missile, 'G_LandmineSnapshotCallback');
    assert.match(mineSnapshot, /#ifdef ETJS_SERVER[\s\S]*?return qtrue/);
    const draw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw.c'), 'utf8');
    const awareness = extractFn(draw, 'CG_DrawEnvironmentalAwareness');
    assert.match(awareness, /#ifdef __EMSCRIPTEN__[\s\S]*?Stock ET does not paint floating objective icons[\s\S]*?return/);
    assert.doesNotMatch(awareness.split('#endif')[0], /cg_aimbot\.integer/);
    assert.match(draw, /ETH32_Draw2D/);
  });

  it('bounds spectator follow and disguise indexes so WASM cannot trap', () => {
    const players = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_players.c'), 'utf8');
    const character = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_character.c'), 'utf8');
    const draw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw.c'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix.c'), 'utf8');
    const vis = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix_vis.c'), 'utf8');
    const player = extractFn(players, 'CG_Player');
    const newInfo = extractFn(players, 'CG_NewClientInfo');
    const follow = extractFn(draw, 'CG_DrawFollow');
    assert.match(newInfo, /newInfo\.rank >= NUM_EXPERIENCE_LEVELS/);
    assert.match(newInfo, /newInfo\.cls >= NUM_PLAYER_CLASSES/);
    assert.match(newInfo, /ch < MAX_CHARACTERS/);
    assert.match(newInfo, /disguiseClientNum >= MAX_CLIENTS/);
    assert.match(player, /ci->disguiseClientNum >= 0 && ci->disguiseClientNum < MAX_CLIENTS/);
    assert.doesNotMatch(player, /cgs\.clientinfo\[cgs\.clientinfo\[cent->currentState\.number\]\.disguiseClientNum\]/);
    assert.match(player, /rank >= NUM_EXPERIENCE_LEVELS/);
    assert.match(players, /cent = &cg_entities\[clientNum\]/);
    assert.match(character, /ch < MAX_CHARACTERS && cgs\.gameCharacters\[ch\]/);
    assert.match(character, /cls >= NUM_PLAYER_CLASSES/);
    assert.match(follow, /ps\.clientNum >= MAX_CLIENTS/);
    assert.match(follow, /rank < NUM_EXPERIENCE_LEVELS/);
    assert.match(core, /ETH32_SanitizeSettings/);
    assert.match(core, /clientNum < 0 \|\| clientNum >= MAX_CLIENTS \|\| !ori/);
    assert.match(vis, /es->number >= MAX_CLIENTS/);
    assert.match(vis, /clientNum < 0 \|\| clientNum >= MAX_CLIENTS/);
  });

  it('releases browser pointer lock and routes debrief cursor input', () => {
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    const draw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_newDraw.c'), 'utf8');
    const input = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(view, /trap_Cvar_Set\("etjs_intermission"/);
    assert.match(client, /cvarInt\('etjs_intermission'\)/);
    assert.doesNotMatch(client, /(?:request|exit)PointerLock|webkitRequestPointerLock/);
    assert.match(client, /canonicalPointerMove = function/);
    assert.match(client, /canonicalPointerButton = function/);
    assert.match(draw, /PM_INTERMISSION[\s\S]*?CG_Debriefing_MouseEvent\(x, y\)/);
    assert.match(input, /KEYCATCH_CGAME[\s\S]*?CG_MOUSE_EVENT/);
    assert.match(client, /function pumpMove\(\)[\s\S]*?syncCursor\(\)/);
  });

  it('keeps death-camera freelook and limits pitch only for automated aim', () => {
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    const input = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    assert.match(view, /etjsDeadFreeLook/);
    const core = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'eth32nix.c'), 'utf8');
    assert.match(core, /PM_NORMAL[\s\S]*?STAT_HEALTH\] <= 0/);
    assert.match(input, /viewangles\[PITCH\] = AngleNormalize180\(cl\.viewangles\[PITCH\]\)/);
    assert.match(input, /worldPitch\) <= 70\.f/);
    assert.match(input, /Cvar_Set\("etjs_target", "-1"\)/);
  });

  it('R_AddEntitySurfaces walks entities and adds MD3 surfaces', () => {
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_main.c'), 'utf8');
    const fn = extractFn(main, 'R_AddEntitySurfaces');
    assert.match(fn, /R_AddMD3Surfaces/);
    assert.match(fn, /R_AddBrushModelSurfaces/);
    assert.match(fn, /for\s*\(\s*tr\.currentEntityNum/);
    assert.doesNotMatch(fn, /MD3 tess overflows/);
    assert.doesNotMatch(fn, /#ifdef\s+__EMSCRIPTEN__\s+return\s*;/);
  });

  it('renders static lamp models and their coronas in WebGL', () => {
    const draw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw.c'), 'utf8');
    const active = extractFn(draw, 'CG_DrawActive');
    assert.match(active, /CG_DrawMiscGamemodels\(\)/);
    assert.match(active, /CG_DrawClientCoronas\(\)/);
    assert.match(active, /#ifndef __EMSCRIPTEN__[\s\S]*CG_ShakeCamera\(\);[\s\S]*#endif\s*CG_DrawMiscGamemodels\(\);\s*CG_DrawClientCoronas\(\);/);

    const backend = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_backend.c'), 'utf8');
    const drawSurfs = extractFn(backend, 'RB_RenderDrawSurfList');
    assert.match(drawSurfs, /#endif[\s\S]*RB_RenderFlares\(\)/);
    const flares = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_flares.c'), 'utf8');
    const renderFlares = extractFn(flares, 'RB_RenderFlares');
    assert.match(renderFlares, /R_ES2_SetFlare2D\(\)/);
    assert.match(renderFlares, /backEnd\.projection2D\s*=\s*qtrue/);
  });

  it('RE_RenderScene calls R_RenderView and has no levelshot collage', () => {
    const scene = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_scene.c'), 'utf8');
    const fn = extractFn(scene, 'RE_RenderScene');
    assert.match(fn, /R_RenderView\s*\(/);
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_main.c'), 'utf8'),
      /R_RenderView surfs=/);
    assert.doesNotMatch(fn, /levelshots\/oasis/);
    assert.doesNotMatch(fn, /RE_StretchPic\s*\(\s*-shift/);
  });

  it('3D view begin restores depth test and write after 2D/limbo', () => {
    const es2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_es2.c'), 'utf8');
    const begin = extractFn(es2, 'R_ES2_BeginView');
    assert.match(begin, /glEnable\s*\(\s*GL_DEPTH_TEST\s*\)/);
    assert.match(begin, /glDepthMask\s*\(\s*1\s*\)/);
    assert.match(begin, /glDisable\s*\(\s*GL_BLEND\s*\)/);
    assert.match(begin, /GLS_DEFAULT/);
    const world = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_world.c'), 'utf8');
    const rec = extractFn(world, 'R_RecursiveWorldNode');
    assert.doesNotMatch(rec, /numDrawSurfs >= 8192/);
    const etjs = fs.readFileSync(path.join(ROOT, 'web', 'client', 'etjs.js'), 'utf8');
    assert.match(etjs, /preserveDrawingBuffer/);
    const splash = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderercommon', 'tr_splash.c'), 'utf8');
    const drawSplash = splash.split('void R_DrawSplash')[1].split('void ')[0];
    assert.match(drawSplash, /__EMSCRIPTEN__/);
    assert.match(drawSplash, /return;/);
    const shade = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_shade.c'), 'utf8');
    assert.match(shade, /isLightmap \|\| pStage->bundle\[1\]\.isLightmap/);
  });

  it('does not draw the legacy RECORD marker in the browser HUD', () => {
    const hud = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw_hud.c'), 'utf8');
    assert.match(hud, /CG_DrawDemoMessage[\s\S]*?#ifdef __EMSCRIPTEN__[\s\S]*?return;[\s\S]*?#endif/);
  });

  it('ships a browser-safe menu set and paints the final connection-status line', () => {
    const menus = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_menus.txt'), 'utf8');
    const ingame = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_ingame.menu'), 'utf8');
    const options = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_options.menu'), 'utf8');
    const loading = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_loadpanel.c'), 'utf8');

    assert.match(menus, /ui\/etjs_ingame\.menu/);
    assert.match(menus, /ui\/etjs_options\.menu/);
    assert.doesNotMatch(menus, /ui\/ingame_disconnect\.menu/);
    assert.doesNotMatch(menus, /ui\/quit\.menu/);
    assert.doesNotMatch(menus, /options_customise_hudeditor_fui/);
    assert.match(ingame, /RETURN TO GAME/);
    assert.ok(ingame.indexOf('AIMBOT') < ingame.indexOf('RETURN TO GAME'));
    assert.match(ingame, /MSGID_MENU_INGAME_LIMBO_MENU/);
    assert.match(ingame, /MSGID_MENU_INGAME_OPTIONS/);
    assert.match(ingame, /close ingame_main ; open options/);
    assert.match(ingame, /AIMBOT/);
    assert.match(ingame, /YESNOACTION[\s\S]*cl_aimbot/);
    assert.match(ingame, /YESNOACTION\([\s\S]*setcvar cl_aimbotmenu 0,\s*_\("Enable or disable aimbot"\)/);
    assert.doesNotMatch(ingame, /YESNOACTION\([\s\S]*tooltip _\("Enable or disable aimbot"\)/);
    assert.match(ingame, /SETTINGS/);
    assert.match(ingame, /aimbot settings/);
    assert.doesNotMatch(ingame, /cvarTest "cl_aimbot"/);
    assert.doesNotMatch(ingame, /CHANGELOG|FAVORITE|VOTE|SERVER_INFO|DISCONNECT|EXIT|ETLEGACY_VERSION|legacy_logo|development_build_banner/);
    assert.doesNotMatch(options, /HUD_EDITOR|OPEN_HOME|open_homepath|edithud/);
    assert.match(options, /conditionalscript etjs_ingame 0/);
    assert.match(options, /close options ; open ingame_main/);
    assert.match(options, /close options ; open main/);
    assert.match(loading, /Awaiting connection\.\.\.%i/);
    assert.match(loading, /Awaiting challenge\.\.\.%i/);
    assert.match(loading, /Awaiting gamestate\.\.\./);
    assert.match(loading, /The connection state is the final line/);
    assert.match(loading, /if \(\*p2\)[\s\S]*Text_Paint_Ext/);
    const mainMenu = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_official.menu'), 'utf8');
    const uiMain = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_main.c'), 'utf8');
    assert.match(mainMenu, /name "main"[\s\S]*?rect 16 16 128 104/);
    assert.match(mainMenu, /name "window"[\s\S]*?rect 0 0 128 104/);
    assert.match(mainMenu, /bttnOPTIONS[\s\S]*?mouseEnter[\s\S]*?mouseExit/);
    assert.match(mainMenu, /bttnCREDITS[\s\S]*?mouseEnter[\s\S]*?mouseExit/);
    assert.doesNotMatch(mainMenu, /bttnEXIT GAME|text "EXIT GAME"/);
    assert.match(uiMain, /credits_quit[\s\S]*?Menus_CloseByName\("credits_quit"\)[\s\S]*?Menus_ActivateByName\("main", qfalse\)/);
  });

  it('draws the stock ET compass minimap in the browser HUD', () => {
    const hud = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw_hud.c'), 'utf8');
    const fn = extractFn(hud, 'CG_DrawNewCompass');
    assert.match(fn, /CG_DrawAutoMap\s*\(/);
    assert.match(fn, /comp->location\.x/);
    assert.doesNotMatch(fn, /#ifdef\s+__EMSCRIPTEN__[\s\S]*?return\s*;/);
  });

  it('renders smoke screens and marker trails in the browser effect pass', () => {
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    assert.doesNotMatch(view, /#ifndef __EMSCRIPTEN__\s*\/\/ particles\s*CG_AddParticles/);
    assert.doesNotMatch(view, /#ifndef __EMSCRIPTEN__\s*CG_AddLocalEntities\(qtrue\)/);
    assert.doesNotMatch(view, /#ifndef __EMSCRIPTEN__\s*CG_AddSmokeSprites\(\)/);
    assert.doesNotMatch(view, /#ifndef __EMSCRIPTEN__[\s\S]{0,100}CG_AddTrails\(\)/);
    assert.match(view, /CG_AddParticles\(\)/);
    assert.match(view, /CG_AddLocalEntities\(qtrue\)/);
    assert.match(view, /CG_AddSmokeSprites\(\)/);
    assert.match(view, /CG_AddTrails\(\)/);
  });

  it('ships mode-gated arcade movement in shared prediction and server config', () => {
    const pmove = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'bg_pmove.c'), 'utf8');
    const bg = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'bg_public.h'), 'utf8');
    const dedicated = fs.readFileSync(path.join(ROOT, 'server', 'dedicated.js'), 'utf8');
    assert.match(bg, /doubleJumped/);
    assert.match(pmove, /PM_CheckDoubleJump/);
    assert.match(pmove, /PM_DOUBLE_JUMP_DELAY 120/);
    assert.match(pmove, /PM_DOUBLE_JUMP_IMPULSE \(JUMP_VELOCITY \* 0\.8f\)/);
    assert.match(pmove, /PM_DOUBLE_JUMP_MAX_VELOCITY \(JUMP_VELOCITY \* 1\.5f\)/);
    assert.match(pmove, /doubleJumped\s*=\s*qfalse/);
    assert.match(pmove, /if \(!PM_ETJS_ARCADE\)/);
    assert.match(pmove, /sprintTime\s*=\s*SPRINTTIME;[\s\S]*?return;/);
    assert.match(dedicated, /gameMode\.GAME_SPEED/);
    assert.match(dedicated, /'g_etjsArcade'/);
    const serverBuild = fs.readFileSync(path.join(ROOT, 'scripts', 'build-server-mod.sh'), 'utf8');
    const gameCvars = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_cvars.c'), 'utf8');
    const scripts = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_script_actions.c'), 'utf8');
    assert.match(serverBuild, /ETJS_SERVER=ON/);
    assert.match(gameCvars, /ETJS_SERVER[\s\S]*g_redlimbotime[\s\S]*"1000"[\s\S]*CVAR_SERVERINFO/);
    assert.match(gameCvars, /ETJS_SERVER[\s\S]*g_bluelimbotime[\s\S]*"1000"[\s\S]*CVAR_SERVERINFO/);
    assert.match(scripts, /ETJS_SERVER[\s\S]*g_redlimbotime", "1000"/);
    assert.match(scripts, /ETJS_SERVER[\s\S]*g_bluelimbotime", "1000"/);
  });

  it('ships original ETJS multikill announcements', () => {
    const event = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_event.c'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_main.c'), 'utf8');
    assert.match(event, /etjsMultiKillCount/);
    assert.match(event, /cg\.time - etjsLastKillTime <= 4000/);
    assert.match(event, /ci->team != ca->team/);
    assert.match(event, /cg_etjsArcade\.integer/);
    assert.match(main, /sound\/announcer\/doublekill\.wav/);
    assert.match(main, /sound\/announcer\/ultrakill\.wav/);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'etjs', 'sound', 'announcer', 'doublekill.wav')));
  });

  it('does not hide the load overlay on renderer/UI-init prints', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /ETJS menu ready/);
    assert.doesNotMatch(client, /ETJS UI_LoadMenus slim[\s\S]{0,80}hideLoadPanel/);
    assert.doesNotMatch(client, /ES2 tessellator ready[\s\S]{0,80}hideLoadPanel/);
    const scrn = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    assert.match(scrn, /ETJS menu ready/);
    const disc = scrn.split('case CA_DISCONNECTED')[1].split('case CA_ACTIVE')[0];
    const emDisc = disc.split('#ifdef __EMSCRIPTEN__')[1].split('#else')[0];
    assert.match(emDisc, /UI_SET_ACTIVE_MENU/);
    assert.match(emDisc, /UIMENU_MAIN/);
    assert.doesNotMatch(emDisc, /ETJS_DrawEngineSplash/);
    assert.doesNotMatch(emDisc, /S_StopAllSounds/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'main.menu'), 'utf8'), /JOIN GAME/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_menus.txt'), 'utf8'), /etjs_official\.menu/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_official.menu'), 'utf8'), /ui\/assets\/et_clouds/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_official.menu'), 'utf8'), /ui\/assets\/et_logo_huge/);
  });

  it('clears contained menu bars and renders the complete stock loading panel', () => {
    const cmds = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_cmds.c'), 'utf8');
    const beginFrame = extractFn(cmds, 'RE_BeginFrame');
    assert.match(beginFrame, /#ifdef __EMSCRIPTEN__[\s\S]*?glClearColor\(0\.f, 0\.f, 0\.f, 1\.f\)/);
    assert.match(beginFrame, /glClear\(GL_COLOR_BUFFER_BIT \| GL_DEPTH_BUFFER_BIT\)/);

    const uiLoad = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_loadpanel.c'), 'utf8');
    const drawLoad = extractFn(uiLoad, 'UI_DrawLoadPanel');
    assert.match(drawLoad, /BG_PanelButtonsSetup\(loadpanelButtons\)/);
    assert.match(drawLoad, /BG_PanelButtonsRender\(loadpanelButtons\)/);
    assert.doesNotMatch(drawLoad, /trap_R_DrawStretchPic\(0, 0, 640, 480[\s\S]*?camp_side/);

    const info = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_info.c'), 'utf8');
    const drawInfo = extractFn(info, 'CG_DrawInformation');
    assert.match(drawInfo, /#ifndef __EMSCRIPTEN__[\s\S]*?if \(ms < nextcall\)/);
    assert.match(drawInfo, /SNAPFLAG_NOT_ACTIVE/);
    assert.match(info, /etjs_loadstatus/);
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    assert.match(view, /infoScreenText\[0\] != 0[\s\S]*?CG_DrawInformation\(qfalse\)/);
    assert.match(view, /SNAPFLAG_NOT_ACTIVE[\s\S]*?CG_DrawInformation\(qfalse\)/);
    const backend = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_backend.c'), 'utf8');
    assert.match(backend, /projection2D \? -0\.5f/);
    const scrnLoad = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    const drawField = extractFn(scrnLoad, 'SCR_DrawScreenField');
    assert.match(drawField, /ETJS_DrawLoadStatus/);
    assert.doesNotMatch(drawField.split('CA_PRIMED')[1].split('else if')[0], /UI_REFRESH/);
    assert.match(scrnLoad, /Awaiting connection/);
    assert.match(scrnLoad, /464\.f/);
    assert.match(scrnLoad, /10\.f, 16\.f/);
    const cgLoad = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_loadpanel.c'), 'utf8');
    assert.match(cgLoad, /cg\.infoScreenText\[0\] \? cg\.infoScreenText : "LOADING"/);
    assert.match(cgLoad, /cgs\.arenaData\.longname/);
    assert.match(cgLoad, /Loading %s/);
    const scrnDraw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    assert.match(scrnDraw, /cls\.state >= CA_CONNECTING && cls\.state <= CA_PRIMED/);
    assert.match(scrnDraw, /UI_DRAW_CONNECT_SCREEN, qfalse/);
  });

  it('streams real engine startup output into the loading console', () => {
    const page = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    const html = fs.readFileSync(path.join(FRAMEWORK_WEB, 'index.html'), 'utf8');
    const shellCss = fs.readFileSync(path.join(FRAMEWORK_WEB, 'wasm-game-framework.css'), 'utf8');
    assert.match(html, /id="loading-console"[^>]*data-shell-console[^>]*role="log"/);
    assert.match(page, /function appendStartupLine/);
    assert.match(page, /print:\s*function \(text\)[\s\S]*?onEngineLine\(text, 'info'\)/);
    assert.match(page, /printErr:\s*function \(text\)[\s\S]*?onEngineLine\(s,/);
    assert.match(page, /MAX_STARTUP_LINES\s*=\s*180/);
    assert.match(page, /\\u001b\\\[/);
    assert.match(shellCss, /font:\s*400 16px\/16px "Modern DOS 8x16"/);
    assert.match(shellCss, /user-select:\s*text/);
  });

  it('gives the browser UI enough bounded menu memory and preserves refresh shortcuts', () => {
    const shared = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_shared.c'), 'utf8');
    const glimp = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'sdl', 'sdl_glimp.c'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    const html = fs.readFileSync(path.join(FRAMEWORK_WEB, 'index.html'), 'utf8');
    assert.match(shared, /defined\(__EMSCRIPTEN__\)[\s\S]*MEM_POOL_SIZE \(16 \* 1024 \* 1024\)/);
    assert.match(shared, /MEM_POOL_SIZE - allocPoint/);
    assert.match(glimp, /SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT, "#canvas"/);
    assert.match(html, /id="game-canvas"[^>]*tabindex="0"/);
    assert.match(page, /function inputCaptured/);
    assert.match(page, /function bareControl/);
    assert.match(page, /document\.activeElement === canvas/);
    assert.match(page, /ev\.stopImmediatePropagation\(\)/);
    assert.match(page, /Ctrl\+Shift\+R/);
    assert.match(page, /function sendChar[\s\S]*_ETJS_CharEvent/);
    assert.match(fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8'),
      /void ETJS_CharEvent[\s\S]*CL_CharEvent\(ch\)/);
  });

  it('tracks cache provenance internally without exposing it in normal loading copy', () => {
    const page = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(page, /window\.__etjsAssets/);
    assert.match(page, /bytes\.byteLength === file\.bytes/);
    assert.doesNotMatch(page,
      /Preparing official game data|Downloading game data|local game cache|cached game data|files cached/);
    assert.match(page, /Getting the battlefield ready/);
  });

  it('keeps browser diagnostics out of the normal in-game console', () => {
    const ui = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_main.c'), 'utf8');
    const parse = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_parse.c'), 'utf8');
    const favs = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_ui.c'), 'utf8');
    assert.doesNotMatch(ui, /trap_Print\("ETJS UI_Init/);
    assert.match(ui, /Com_DPrintf\("ETJS UI_Init/);
    assert.match(parse, /Com_DPrintf\("ETJS CL_ParseSnapshot begin/);
    assert.match(favs, /no server browser/);
  });

  it('follow look is isolated and communication keys use the normal bound-key path', () => {
    const input = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    assert.match(input, /pm_flags & 4096/);
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_main.c'), 'utf8');
    assert.match(main, /etjs_joingame/);
    assert.match(main, /etjs_splash"\) == 2/);
    const page = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.doesNotMatch(page, /\+connect/);
    assert.match(page, /etjs_connect/);
    assert.match(page, /ETJS_ASSET_VER/);
    assert.match(page, /etjs\.js\?v=/);
    const wake = page.split('function wakeDedicatedServer')[1].split('function sizeCanvas')[0];
    const join = page.split('etjsWakeAndJoin: function')[1].split('etjsAdminCommand: function')[0];
    assert.match(wake, /Starting game server/);
    assert.match(wake, /fetch\('\/wake', \{ method: 'POST' \}\)/);
    assert.match(wake, /MAIN menu can[\s\S]*never appear[\s\S]*server is still booting/);
    assert.doesNotMatch(join, /fetch\('\/wake'/);
    assert.match(join, /Connecting to game server/);
    assert.match(join, /wasmShell\.showRuntime\(\)/);
    assert.doesNotMatch(join, /showLoading\(\)|loadPanel\.hidden = false/);
    assert.match(join, /engineCmd\('connect ' \+ connectAddress\)/);
    assert.match(page, /requestAnimationFrame\(resolve\)/);
    assert.match(page, /Game server is ready/);
    assert.match(page, /wasDead\s*&&\s*!dead/);
    assert.match(page, /set etjs_resetlook 1/);
    assert.match(page, /showInGameMenuWhenUncaptured\('pointer-lock-lost'\)/);
    assert.match(page, /showInGameMenuWhenUncaptured\('window-blur'\)/);
    assert.match(page, /typingMode = 'chat'/);
    assert.match(page, /T\/Y\/V[\s\S]*same native CL_KeyEvent route/);
    assert.match(page, /intermissionOpen\(\) && !engineUiOpen\(\)[\s\S]*sendChar\(ev\.key\.codePointAt\(0\)\)/);
    assert.match(page, /Voice chat is opened by[\s\S]*QUICK CHAT button/);
    const debriefInput = page.split('if (intermissionOpen() && !engineUiOpen())')[1].split('if (uiOpen())')[0];
    assert.doesNotMatch(debriefInput, /handleCommunicationKey/);
    assert.match(debriefInput, /code === 'Backspace'/);
    assert.match(debriefInput, /code === 'Enter'/);
    assert.match(debriefInput, /sendChar\(8\)/);
    const keyDown = page.split('function onKeyDown(ev)')[1].split('function onKeyUp(ev)')[0];
    assert.ok(keyDown.indexOf('if (typingMode)') < keyDown.indexOf('if (uiOpen())'));
    assert.doesNotMatch(keyDown, /handleCommunicationKey\(code\)/);
    assert.doesNotMatch(keyDown, /toggleInGameMenu\('escape-key'\)/);
    assert.match(keyDown, /var keySent = sendKey\(key, 1\)/);
    assert.match(keyDown, /code === 'KeyT'[\s\S]*code === 'KeyY'[\s\S]*code === 'KeyU'/);
    assert.match(input, /int ETJS_OpenCommunication\(int mode\)/);
    assert.match(input, /Cmd_ExecuteString\(command\)/);
    assert.match(input, /command = "messagemode"/);
    assert.match(input, /command = "messagemode2"/);
    assert.match(input, /command = "mp_quickmessage"/);
    assert.match(input, /UIMENU_INGAME_MESSAGEMODE/);
    assert.match(input, /UIMENU_WM_QUICKMESSAGE/);
    assert.doesNotMatch(input, /Cbuf_ExecuteText\(EXEC_NOW, command\)/);
    assert.match(main, /UI_GET_ACTIVE_MENU\) == UIMENU_MAIN/);
    assert.doesNotMatch(main, /cls\.state == CA_ACTIVE\)[\s\S]{0,160}cls\.keyCatchers &= ~KEYCATCH_UI/);
    assert.match(page, /communicationInput = true/);
    assert.match(page, /engineCmd\(TAP_KEYS\[code\]\)/);
    assert.match(page, /con_fontName', 'courbd'/);
    assert.match(page, /Enter: 13/);
    assert.match(page, /sendChar\(8\)/);
    assert.match(page, /code === 'ArrowUp' \|\| code === 'ArrowDown'/);
    const view = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_view.c'), 'utf8');
    assert.match(view, /etjsDeadViewAngles/);
    assert.match(view, /etjsJustRespawned/);
    assert.match(view, /Orbit the camera without changing the entity angles/);
    const hud = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw_hud.c'), 'utf8');
    assert.match(hud, /helmetH \*= cgs\.screenXScale \/ cgs\.screenYScale/);
    const limboHead = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_limbopanel.c'), 'utf8');
    const drawHead = extractFn(limboHead, 'CG_DrawPlayerHead');
    assert.match(drawHead, /trap_R_ModelBounds\(character->hudhead/);
    assert.match(drawHead, /CG_HudHeadAnimation/);
    assert.match(drawHead, /trap_R_AddRefEntityToScene\(&head\)/);
    assert.match(drawHead, /trap_R_RenderScene\(&refdef\)/);
    assert.doesNotMatch(drawHead, /hudAxisHelmet|hudAlliedHelmet/);
    const uiMain = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_main.c'), 'utf8');
    assert.match(uiMain, /UI_LoadMenus\("ui\/etjs_menus.txt"/);
    assert.doesNotMatch(uiMain, /ETJS skip parsed menus/);
    const setMain = uiMain.split('case UIMENU_MAIN')[1].split('case UIMENU_INGAME')[0] ||
      uiMain.split('case UIMENU_MAIN')[1].split('#else')[0];
    const mainIdx = setMain.lastIndexOf('ActivateByName("main"');
    const bgIdx = setMain.lastIndexOf('ActivateByName("background_1"');
    assert.ok(mainIdx > bgIdx, 'official MAIN must be activated after background_1 so JOIN has focus');
    const cgSys = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_syscalls.c'), 'utf8');
    assert.match(cgSys, /PC_ReadTokenHandle/);
    const pw = fs.readFileSync(path.join(ROOT, 'scripts', 'playwright-etjs.js'), 'utf8');
    assert.doesNotMatch(pw, /Cbuf_AddText.*etjs_joingame/);
    assert.doesNotMatch(pw, /Cbuf_AddText.*connect /);
    assert.match(pw, /JOIN_GAME_640/);
    assert.match(pw, /LIMBO_CANCEL_640/);
    const limbo = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_limbopanel.c'), 'utf8');
    assert.match(limbo, /ETJS_SyncLimboCursor/);
    assert.match(limbo, /CG_LimboPanel_KeyHandling[\s\S]*ETJS_SyncLimboCursor/);
    const scrn2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    assert.match(scrn2, /ETJS_DrawStartupMenu/);
    assert.match(scrn2, /ETJS menu ready/);
    const mainMenu = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_main.menu'), 'utf8');
    assert.match(mainMenu, /JOIN GAME/);
    assert.match(mainMenu, /etjs_joingame/);
    assert.match(mainMenu, /menu_server\.wav/);
    assert.match(mainMenu, /ui\/assets\/et_logo/);
    const html = fs.readFileSync(path.join(FRAMEWORK_WEB, 'index.html'), 'utf8');
    const gameConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'wasm-game.json'), 'utf8'));
    assert.match(html, /id="launcher"/);
    assert.equal(gameConfig.icon, '/img/et-512.png');
    assert.equal(gameConfig.fullscreen, true);
    assert.equal(gameConfig.pwa.icons.length, 2);
    assert.match(page, /ETJS UIMENU_MAIN/);
    assert.match(page, /playMenuMusic/);
    const beginForm = page.split('function beginFromForm')[1] || '';
    assert.doesNotMatch(beginForm.slice(0, 900), /playMenuMusic/);
    assert.match(beginForm, /wakeDedicatedServer\(\)\.then\(function \(\) \{[\s\S]*return startEngine\(name\)/);
    assert.match(main, /etjs_joingame/);
  });

  it('does not recurse Z_Malloc into Com_Error; small-zone overflow uses the main zone', () => {
    const common = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'qcommon', 'common.c'), 'utf8');
    assert.match(common, /s_smallZoneTotal = 512 \* 1024/);
    const cvar = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'qcommon', 'cvar.c'), 'utf8');
    assert.match(cvar, /Cvar_IsLinked/);
    assert.match(cvar, /!cvar_indexes\[index\]\.name && !Cvar_IsLinked/);
    assert.match(cvar, /broke cycle/);
    assert.match(cvar, /cvar_vars\s*=\s*NULL/);
    assert.match(common, /#define DEF_COMHUNKMEGS\s+128/);
    assert.match(common, /#define DEF_COMZONEMEGS\s+16/);
    const pageHunk = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(pageHunk, /com_hunkMegs', '128'/);
    assert.match(pageHunk, /com_zoneMegs', '16'/);
    assert.doesNotMatch(pageHunk, /com_hunkMegs', '192'/);
    assert.match(common, /com_errorEntered/);
    assert.match(common, /Z_Malloc exhausted during:/);
    assert.match(common, /tag == TAG_SMALL/);
    assert.match(common, /Z_TagMalloc\(origSize, TAG_GENERAL\)/);
    const glimp = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'sdl', 'sdl_glimp.c'), 'utf8');
    assert.match(glimp, /r_allowSoftwareGL", "1"/);
    assert.match(glimp, /SDL_GL_ACCELERATED_VISUAL, 0/);
    assert.match(glimp, /skipping desktop mode probe/);
    const sys = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'sys', 'sys_main.c'), 'utf8');
    assert.match(sys, /emscripten_set_main_loop\(Sys_EmscriptenFrame/);
    assert.match(sys, /!com_fullyInitialized/);
    assert.match(sys, /Com_InitSmallZoneMemory/);
    const newDraw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_newDraw.c'), 'utf8');
    assert.match(newDraw, /etjs_resetlook/);
  });

  it('hosts the game on 8088 with a same-origin WebSocket endpoint', () => {
    const server = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
    assert.match(server, /ETJS_HTTP_PORT \|\| 8088/);
    assert.match(server, /'\.ttf': 'font\/ttf'/);
    assert.match(server, /wsPath: '\/ws'/);
    assert.match(server, /urlPath === '\/app\.webmanifest'/);
    assert.match(server, /urlPath === '\/service-worker\.js'/);
    assert.match(server, /connect: '127\.0\.0\.1:' \+ DED_PORT/);
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /window\.location\.protocol === 'https:' \? 'wss:\/\/' : 'ws:\/\/'/);
    assert.match(client, /window\.location\.host \+ '\/ws'/);
    const pw = fs.readFileSync(path.join(ROOT, 'scripts', 'playwright-etjs.js'), 'utf8');
    assert.match(pw, /127\.0\.0\.1:8088/);
    assert.ok(fs.existsSync(path.join(ROOT, 'web', 'img', 'et-512.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'web', 'sound', 'music', 'menu_server.wav')));
  });

  it('lets a human take a bot slot instead of rejecting a full or unbalanced team', () => {
    const team = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_team.c'), 'utf8');
    const cmds = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_cmds.c'), 'utf8');
    const local = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_local.h'), 'utf8');
    const ref = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'game', 'g_referee.c'), 'utf8');
    const limbo = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_limbopanel.c'), 'utf8');
    const omni = fs.readFileSync(path.join(ROOT, 'runtime', 'omni-bot-user', 'omni-bot.cfg'), 'utf8');
    const yieldFn = extractFn(team, 'G_YieldBotSlot');
    const isBot = extractFn(team, 'G_ClientIsFillBot');
    const joinFn = extractFn(team, 'G_teamJoinCheck');
    const setTeam = extractFn(cmds, 'SetTeam');
    const teamIsFull = extractFn(limbo, 'CG_LimboPanel_TeamIsFull');
    assert.match(local, /qboolean G_YieldBotSlot\(team_t team, int playerType\)/);
    assert.match(local, /G_TeamCountHumans/);
    assert.match(isBot, /SVF_BOT/);
    assert.match(isBot, /Q_stristr\(ent->client->pers.netname, "\[BOT\]"\)/);
    assert.match(yieldFn, /G_ClientIsFillBot\(bot\)/);
    assert.match(yieldFn, /trap_DropClient\(ref, "slot yielded to player"/);
    assert.match(joinFn, /G_YieldBotSlot\(nTeam/);
    assert.match(setTeam, /G_TeamCountHumans\(ent - g_entities, TEAM_ALLIES\)/);
    assert.match(setTeam, /G_TeamCountHumans\(ent - g_entities, TEAM_AXIS\)/);
    assert.match(ref, /G_YieldBotSlot\(team_id/);
    assert.match(teamIsFull, /Q_stristr\(cgs\.clientinfo\[i\]\.name, "\[BOT\]"\)/);
    assert.match(omni, /BalanceTeams\s+=\s+0/);
  });
});
