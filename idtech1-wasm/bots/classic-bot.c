// SPDX-License-Identifier: GPL-2.0-or-later
// A native network client command producer. All authoritative effects still
// happen in the unchanged engine simulation from ordinary transmitted tics.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <limits.h>

#if defined(CLASSIC_BOT_HEXEN)
#include "h2def.h"
#elif defined(CLASSIC_BOT_HERETIC)
#include "doomdef.h"
#else
#include "doomdef.h"
#include "doomstat.h"
#include "g_game.h"
#endif
#include "p_local.h"
#include "m_argv.h"
#include "net_client.h"

#define GRID 32
#define MAX_CELLS 524288
#define MAX_EXPANSIONS 12000
#define MAX_ROUTE 4096

typedef struct { int parent, cost, stamp, closed; } bot_node_t;
typedef struct { int cell, score; } heap_t;
static bot_node_t *nav_nodes;
static heap_t *heap;
static int heap_count, heap_capacity;
static int width, height, origin_x, origin_y, search_stamp;
static int route[MAX_ROUTE], route_length, route_index;
static int next_plan, next_goal, goal_x, goal_y, goal_valid, goal_kind;
static int explore_until;
static int tick, stuck, last_x, last_y, next_report, last_leveltime = -1;
static int attack_tics, deaths, was_alive;
static int wander_cursor, target_player = -1;
static struct { int x, y, until; } avoided_goals[16];
static int avoided_cursor;
static unsigned int random_state = 1;
static mobj_t *self;
static int path_floor, path_height;
static fixed_t path_start_x, path_start_y;
static sector_t *opened_door;
static boolean permit_door;
static fixed_t body_x, body_y, body_z, body_radius;

static int units(fixed_t x) { return x / FRACUNIT; }
static int abs_int(int x) { return x < 0 ? -x : x; }
static int max_int(int a, int b) { return a > b ? a : b; }
static int min_int(int a, int b) { return a < b ? a : b; }
static int distance(int x1, int y1, int x2, int y2)
{
    return max_int(abs_int(x2 - x1), abs_int(y2 - y1));
}
// Private AI randomness must never advance Doom's synchronized RNG.
static unsigned int random_bot(void)
{
    random_state = random_state * 1664525u + 1013904223u;
    return random_state;
}

static boolean usable_door(line_t *line)
{
    if (P_PointOnLineSide(path_start_x, path_start_y, line)) return false;
#if defined(CLASSIC_BOT_HEXEN)
    // ACS execution is not evidence that a closed sector can be opened from
    // this side. Only the native direct door actions are predictable here.
    return line->special == 11 || line->special == 12 || line->special == 13;
#else
    switch (line->special) {
        case 1: case 26: case 27: case 28: case 31: case 32: case 33: case 34:
        case 117: case 118: return true;
        default: return false;
    }
#endif
}

static boolean cross_line(intercept_t *hit)
{
    line_t *line;
    sector_t *a, *b;
    int floor, ceiling;
    if (!hit->isaline) {
        mobj_t *thing = hit->d.thing;
        return thing == self || thing->player || !(thing->flags & MF_SOLID) ||
            units(thing->z + thing->height) <= path_floor ||
            units(thing->z) >= path_floor + path_height;
    }
    line = hit->d.line; a = line->frontsector; b = line->backsector;
    if (!b || !a || (line->flags & ML_BLOCKING)) return false;
    floor = max_int(units(a->floorheight), units(b->floorheight));
    ceiling = min_int(units(a->ceilingheight), units(b->ceilingheight));
    if (floor - path_floor > 24) return false;
    if (ceiling - floor < path_height) {
        if (!permit_door) return false;
        if (a != opened_door && b != opened_door) {
            if (!usable_door(line)) return false;
            opened_door = a->ceilingheight <= a->floorheight ? a : b;
        }
    }
    path_floor = floor;
    return true;
}

// Read-only geometry query: no P_TryMove/P_CheckPosition, pickups, damage,
// actor angle writes or special-line activation. Doors are used via BT_USE.
static boolean ray_clear(int x1, int y1, int x2, int y2, boolean doors)
{
    sector_t *start_sector;
    path_start_x = x1 * FRACUNIT; path_start_y = y1 * FRACUNIT;
    start_sector = R_PointInSubsector(path_start_x, path_start_y)->sector;
    path_floor = units(start_sector->floorheight);
    path_height = self ? units(self->height) : 56;
    opened_door = start_sector->ceilingheight - start_sector->floorheight < path_height * FRACUNIT
        ? start_sector : NULL;
    permit_door = doors;
    return P_PathTraverse(x1 * FRACUNIT, y1 * FRACUNIT,
                          x2 * FRACUNIT, y2 * FRACUNIT, PT_ADDLINES | PT_ADDTHINGS, cross_line);
}

static boolean body_thing_clear(mobj_t *thing)
{
    fixed_t radius;
    if (thing == self || thing->player || !(thing->flags & MF_SOLID) ||
        thing->z + thing->height <= body_z || thing->z >= body_z + self->height)
        return true;
    radius = body_radius + thing->radius;
    return abs_int(thing->x - body_x) >= radius || abs_int(thing->y - body_y) >= radius;
}

static boolean body_clear(int x, int y)
{
    int bx, by, left, right, bottom, top;
    // Native thing collisions use an axis-aligned square. A path may end
    // before a ray reaches a prop while the player's body already overlaps it.
    body_x = x * FRACUNIT; body_y = y * FRACUNIT;
    body_z = R_PointInSubsector(body_x, body_y)->sector->floorheight;
    body_radius = self->radius;
    left = max_int(0, (body_x - body_radius - MAXRADIUS - bmaporgx) >> MAPBLOCKSHIFT);
    right = min_int(bmapwidth - 1, (body_x + body_radius + MAXRADIUS - bmaporgx) >> MAPBLOCKSHIFT);
    bottom = max_int(0, (body_y - body_radius - MAXRADIUS - bmaporgy) >> MAPBLOCKSHIFT);
    top = min_int(bmapheight - 1, (body_y + body_radius + MAXRADIUS - bmaporgy) >> MAPBLOCKSHIFT);
    for (by = bottom; by <= top; ++by) for (bx = left; bx <= right; ++bx)
        if (!P_BlockThingsIterator(bx, by, body_thing_clear)) return false;
    return true;
}

static boolean walk_clear(int x1, int y1, int x2, int y2, boolean doors)
{
    int dx = x2 - x1, dy = y2 - y1;
    double length = hypot((double)dx, (double)dy);
    int ox, oy;
    if (length < 1) return true;
    ox = (int)lround(-dy * 15.0 / length);
    oy = (int)lround(dx * 15.0 / length);
    return body_clear(x2, y2) && ray_clear(x1, y1, x2, y2, doors)
        && ray_clear(x1 + ox, y1 + oy, x2 + ox, y2 + oy, doors)
        && ray_clear(x1 - ox, y1 - oy, x2 - ox, y2 - oy, doors);
}

static int cell_x(int cell) { return origin_x + (cell % width) * GRID; }
static int cell_y(int cell) { return origin_y + (cell / width) * GRID; }
static int cell_at(int x, int y)
{
    int col = (x - origin_x + GRID / 2) / GRID;
    int row = (y - origin_y + GRID / 2) / GRID;
    if (col < 0 || row < 0 || col >= width || row >= height) return -1;
    return row * width + col;
}
static int heuristic(int cell, int dest)
{
    return distance(cell_x(cell), cell_y(cell), cell_x(dest), cell_y(dest)) * 10 / GRID;
}
static void heap_push(int cell, int score)
{
    int i, parent;
    heap_t value = { cell, score };
    if (heap_count >= heap_capacity) return;
    i = heap_count++;
    while (i > 0) {
        parent = (i - 1) / 2;
        if (heap[parent].score <= score) break;
        heap[i] = heap[parent];
        i = parent;
    }
    heap[i] = value;
}
static int heap_pop(void)
{
    int result = heap[0].cell, i = 0, child;
    heap_t value = heap[--heap_count];
    while ((child = i * 2 + 1) < heap_count) {
        if (child + 1 < heap_count && heap[child + 1].score < heap[child].score) ++child;
        if (heap[child].score >= value.score) break;
        heap[i] = heap[child];
        i = child;
    }
    heap[i] = value;
    return result;
}

static void reset_level(void)
{
    size_t count;
    free(nav_nodes); free(heap);
    nav_nodes = NULL; heap = NULL;
    origin_x = (int)floor((double)units(bmaporgx) / GRID) * GRID + GRID / 2;
    origin_y = (int)floor((double)units(bmaporgy) / GRID) * GRID + GRID / 2;
    width = bmapwidth * (MAPBLOCKUNITS / GRID) + 1;
    height = bmapheight * (MAPBLOCKUNITS / GRID) + 1;
    count = (size_t)width * height;
    if (width <= 0 || height <= 0 || count > MAX_CELLS) {
        fprintf(stderr, "[classic-bot] navigation grid exceeds limit\n");
        exit(2);
    }
    nav_nodes = calloc(count, sizeof(*nav_nodes));
    heap_capacity = MAX_EXPANSIONS * 8;
    heap = calloc((size_t)heap_capacity, sizeof(*heap));
    if (!nav_nodes || !heap) exit(2);
    search_stamp = route_length = route_index = heap_count = 0;
    next_plan = next_goal = goal_valid = stuck = explore_until = 0;
    attack_tics = deaths = was_alive = 0;
    memset(avoided_goals, 0, sizeof(avoided_goals));
    avoided_cursor = 0;
    random_state = 0x43a151u + (unsigned)consoleplayer * 971u;
    wander_cursor = (int)(random_bot() % max_int(1, numlines));
}

static boolean plan_route(int x, int y, int dest_x, int dest_y)
{
    static const int dc[8] = { 1, 0, -1, 0, 1, -1, -1, 1 };
    static const int dr[8] = { 0, 1, 0, -1, 1, 1, -1, -1 };
    int start = cell_at(x, y), dest = cell_at(dest_x, dest_y), best, expanded = 0;
    int i, current, neighbor, col, row, cost, tail, count, dx, dy, nearest = -1, nearest_distance = INT_MAX;
    route_length = route_index = heap_count = 0;
    if (start < 0 || dest < 0) return false;
    // A valid actor position need not share its nearest grid center's side of
    // a wall. Attach to a reachable neighboring center, never a point in solid.
    for (dy = -1; dy <= 1; ++dy) for (dx = -1; dx <= 1; ++dx) {
        col = start % width + dx; row = start / width + dy;
        if (col < 0 || row < 0 || col >= width || row >= height) continue;
        neighbor = row * width + col;
        cost = distance(x, y, cell_x(neighbor), cell_y(neighbor));
        if (cost >= nearest_distance || !walk_clear(x, y, cell_x(neighbor), cell_y(neighbor), true)) continue;
        nearest = neighbor; nearest_distance = cost;
    }
    if (nearest < 0) return false;
    start = nearest;
    ++search_stamp;
    nav_nodes[start] = (bot_node_t){ -1, 0, search_stamp, 0 };
    heap_push(start, heuristic(start, dest));
    best = start;
    while (heap_count && expanded++ < MAX_EXPANSIONS) {
        current = heap_pop();
        if (nav_nodes[current].closed == search_stamp) continue;
        nav_nodes[current].closed = search_stamp;
        if (heuristic(current, dest) < heuristic(best, dest)) best = current;
        if (current == dest || (distance(cell_x(current), cell_y(current), dest_x, dest_y) < 48 &&
            walk_clear(cell_x(current), cell_y(current), dest_x, dest_y, false))) {
            best = current;
            break;
        }
        for (i = 0; i < 8; ++i) {
            col = current % width + dc[i]; row = current / width + dr[i];
            if (col < 0 || row < 0 || col >= width || row >= height) continue;
            neighbor = row * width + col;
            if (nav_nodes[neighbor].closed == search_stamp) continue;
            cost = nav_nodes[current].cost + (i < 4 ? 10 : 14);
            if (nav_nodes[neighbor].stamp == search_stamp && nav_nodes[neighbor].cost <= cost) continue;
            if (!walk_clear(cell_x(current), cell_y(current), cell_x(neighbor), cell_y(neighbor), true)) continue;
            nav_nodes[neighbor] = (bot_node_t){ current, cost, search_stamp, 0 };
            heap_push(neighbor, cost + heuristic(neighbor, dest));
        }
    }
    if (best == start) return false;
    tail = best; count = 0;
    while (tail != start && tail >= 0 && count < MAX_ROUTE) {
        route[count++] = tail;
        tail = nav_nodes[tail].parent;
    }
    if (tail != start) return false;
    if (count < MAX_ROUTE && distance(x, y, cell_x(start), cell_y(start)) > 4)
        route[count++] = start;
    for (i = 0; i < count / 2; ++i) {
        tail = route[i]; route[i] = route[count - 1 - i]; route[count - 1 - i] = tail;
    }
    route_length = count;
    return true;
}

static mobj_t *enemy_target(void)
{
    mobj_t *best = NULL, *other;
    int i, score, best_score = INT_MAX;
    int x = units(self->x), y = units(self->y);
    target_player = -1;
    for (i = 0; i < MAXPLAYERS; ++i) {
        if (i == consoleplayer || !playeringame[i]) continue;
        other = players[i].mo;
        if (!other || other->health <= 0 || !(other->flags & MF_SHOOTABLE)) continue;
        score = distance(x, y, units(other->x), units(other->y));
        if (!P_CheckSight(self, other)) score += 4096;
        if (score < best_score) { best = other; best_score = score; target_player = i; }
    }
    return best;
}

static void choose_goal(mobj_t *enemy, int x, int y)
{
    thinker_t *thinker;
    mobj_t *item, *best = NULL;
    int best_score = enemy ? 150 : 900, score, attempt, i;
    boolean avoided;
    if (goal_valid && goal_kind == 1) {
        avoided_goals[avoided_cursor].x = goal_x;
        avoided_goals[avoided_cursor].y = goal_y;
        avoided_goals[avoided_cursor].until = tick + 350;
        avoided_cursor = (avoided_cursor + 1) % 16;
    }
    // Opportunistic supply collection; reaching a goal advances to a different
    // item/waypoint even if it was not useful (full inventory, etc.).
    for (thinker = thinkercap.next; thinker != &thinkercap; thinker = thinker->next) {
#if defined(CLASSIC_BOT_DOOM)
        if (thinker->function.acp1 != (actionf_p1)P_MobjThinker) continue;
#else
        if (thinker->function != P_MobjThinker) continue;
#endif
        item = (mobj_t *)thinker;
        if (!(item->flags & MF_SPECIAL)) continue;
        score = distance(x, y, units(item->x), units(item->y));
        if (score < 48 || score >= best_score) continue;
        avoided = false;
        for (i = 0; i < 16; ++i)
            if (avoided_goals[i].until > tick && units(item->x) == avoided_goals[i].x &&
                units(item->y) == avoided_goals[i].y) avoided = true;
        if (avoided) continue;
        if (!ray_clear(x, y, units(item->x), units(item->y), false)) continue;
        best = item; best_score = score;
    }
    if (best && (!enemy || !P_CheckSight(self, enemy))) {
        goal_x = units(best->x); goal_y = units(best->y); goal_kind = 1;
    } else if (enemy) {
        goal_x = units(enemy->x); goal_y = units(enemy->y); goal_kind = 2;
    } else {
        // Explore actual traversable portal midpoints, not arbitrary coordinates.
        for (attempt = 0; attempt < numlines; ++attempt) {
            line_t *line = &lines[(wander_cursor++) % numlines];
            if (!line->backsector || (line->flags & ML_BLOCKING)) continue;
            goal_x = units(line->v1->x / 2 + line->v2->x / 2);
            goal_y = units(line->v1->y / 2 + line->v2->y / 2);
            if (distance(x, y, goal_x, goal_y) > 96) break;
        }
        goal_kind = 3;
    }
    goal_valid = 1; next_goal = tick + 105; next_plan = 0;
}

static int turn_to(int x, int y)
{
    double radians = atan2((double)y - units(self->y), (double)x - units(self->x));
    uint32_t desired = (uint32_t)(int64_t)(radians * (4294967296.0 / (2.0 * 3.14159265358979323846)));
    int turn = (int32_t)(desired - self->angle) / 65536;
    return max_int(-2048, min_int(2048, turn));
}

static boolean melee_weapon(void)
{
    player_t *player = &players[consoleplayer];
#if defined(CLASSIC_BOT_HEXEN)
    return player->class != PCLASS_MAGE &&
        (player->readyweapon == WP_FIRST ||
         (player->class == PCLASS_FIGHTER && player->readyweapon == WP_SECOND));
#elif defined(CLASSIC_BOT_HERETIC)
    return player->readyweapon == wp_staff || player->readyweapon == wp_gauntlets ||
        player->readyweapon == wp_beak;
#else
    return player->readyweapon == wp_fist || player->readyweapon == wp_chainsaw;
#endif
}

static void drive_toward(ticcmd_t *cmd, int x, int y, double max_speed)
{
    double dx = (double)x - self->x / (double)FRACUNIT;
    double dy = (double)y - self->y / (double)FRACUNIT;
    double length = hypot(dx, dy), speed = fmin(max_speed, length * 0.2);
    double vx = length > 0.01 ? dx * speed / length : 0;
    double vy = length > 0.01 ? dy * speed / length : 0;
    double ax = (vx - self->momx / (double)FRACUNIT) * 24.0;
    double ay = (vy - self->momy / (double)FRACUNIT) * 24.0;
    uint32_t next_angle = self->angle + (uint32_t)((int32_t)cmd->angleturn * 65536);
    double angle = next_angle * (2.0 * 3.14159265358979323846 / 4294967296.0);
    // Steering accounts for existing momentum and the angle applied by this
    // same tic. It brakes at corners instead of orbiting each small waypoint.
    cmd->forwardmove = max_int(-40, min_int(40, (int)lround(ax * cos(angle) + ay * sin(angle))));
    cmd->sidemove = max_int(-30, min_int(30, (int)lround(ax * sin(angle) - ay * cos(angle))));
}

void __real_G_BuildTiccmd(ticcmd_t *cmd, int maketic);
void __wrap_G_BuildTiccmd(ticcmd_t *cmd, int maketic)
{
    mobj_t *enemy;
    int x, y, aim_x, aim_y, move_x, move_y, angle, range;
    boolean visible;
    byte consistency;
    __real_G_BuildTiccmd(cmd, maketic);
    consistency = cmd->consistancy;
    memset(cmd, 0, sizeof(*cmd));
    cmd->consistancy = consistency;
    ++tick;
    if (gamestate != GS_LEVEL || consoleplayer < 0 || consoleplayer >= MAXPLAYERS) return;
    self = players[consoleplayer].mo;
    if (!self) return;
    if (!nav_nodes || leveltime < last_leveltime) reset_level();
    last_leveltime = leveltime;
    x = units(self->x); y = units(self->y);
    if (self->health <= 0) {
        if (was_alive) ++deaths;
        was_alive = 0;
        cmd->buttons = tick % 8 == 0 ? BT_USE : 0;
        goal_valid = route_length = 0;
        return;
    }
    was_alive = 1;
    if (distance(x, y, last_x, last_y) < 2) ++stuck; else stuck = 0;
    last_x = x; last_y = y;
    enemy = enemy_target();
    visible = enemy && P_CheckSight(self, enemy);
    range = enemy ? distance(x, y, units(enemy->x), units(enemy->y)) : INT_MAX;
    if (!goal_valid || tick >= next_goal || distance(x, y, goal_x, goal_y) < 40)
        choose_goal(tick < explore_until ? NULL : enemy, x, y);
    move_x = visible ? units(enemy->x) : goal_x;
    move_y = visible ? units(enemy->y) : goal_y;
    if (!walk_clear(x, y, move_x, move_y, false)) {
        if (tick >= next_plan) {
            if (!plan_route(x, y, move_x, move_y) && !visible) {
                // A partial route can end on the wrong side of a wall. Do not
                // repeatedly charge the same unreachable opponent position.
                // Explore another supply/portal while keeping visible combat
                // higher priority than the temporary exploration goal.
                explore_until = tick + 350;
                choose_goal(NULL, x, y);
                move_x = goal_x; move_y = goal_y;
                plan_route(x, y, move_x, move_y);
            }
            next_plan = tick + 35;
        }
        while (route_index < route_length && distance(x, y, cell_x(route[route_index]), cell_y(route[route_index])) < 8)
            ++route_index;
        if (route_index < route_length) {
            move_x = cell_x(route[route_index]); move_y = cell_y(route[route_index]);
        }
    }
    aim_x = visible ? units(enemy->x) : move_x;
    aim_y = visible ? units(enemy->y) : move_y;
    angle = turn_to(aim_x, aim_y);
    cmd->angleturn = (short)angle;
    drive_toward(cmd, move_x, move_y, 7.0);
    if (visible && abs_int(angle) < 1500) {
        cmd->buttons |= BT_ATTACK;
        if (range < (melee_weapon() ? 36 : 150)) drive_toward(cmd, x, y, 0);
        if (!melee_weapon() && range < 500)
            cmd->sidemove = ((tick / 45 + consoleplayer) % 2) ? 20 : -20;
    }
    // A second use reverses an ordinary raising door. Allow it to reach player
    // clearance before trying again; rapid pulses just open/close it in place.
    if (tick % 105 == 0) cmd->buttons |= BT_USE;
    if (stuck > 18) {
        cmd->sidemove = ((tick / 24 + consoleplayer) % 2) ? 30 : -30;
        if (stuck > 45) { next_plan = 0; next_goal = 0; cmd->forwardmove = -20; }
    }
    if (tick >= next_report) {
        int i, frags = 0;
        for (i = 0; i < MAXPLAYERS; ++i)
            if (i != consoleplayer) frags += players[consoleplayer].frags[i];
        fprintf(stderr, "[classic-bot] {\"event\":\"tick\",\"slot\":%d,\"tic\":%d,\"x\":%d,\"y\":%d,\"health\":%d,\"target\":%d,\"attack\":%d,\"route\":%d,\"goalKind\":%d,\"goalX\":%d,\"goalY\":%d,\"moveX\":%d,\"moveY\":%d,\"weapon\":%d,\"attackTics\":%d,\"frags\":%d,\"deaths\":%d,\"playerHealth\":[",
                consoleplayer, tick, x, y, self->health, target_player,
                !!(cmd->buttons & BT_ATTACK), route_length - route_index, goal_kind,
                goal_x, goal_y, move_x, move_y, players[consoleplayer].readyweapon,
                attack_tics, frags, deaths);
        for (i = 0; i < MAXPLAYERS; ++i) {
            if (i) fputc(',', stderr);
            if (playeringame[i] && players[i].mo) fprintf(stderr, "%d", players[i].mo->health);
            else fputs("null", stderr);
        }
        fputs("]}\n", stderr);
        fflush(stderr);
        next_report = tick + 35;
    }
    if (cmd->buttons & BT_ATTACK) ++attack_tics;
}
