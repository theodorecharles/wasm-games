#pragma once

#include <cstddef>
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

int lith_host_init(const char *data_dir);
void lith_host_shutdown(void);
int lith_host_state(void);
int lith_host_new_game(void);
int lith_host_confirm(void);
void lith_host_menu_move(int delta);
void lith_host_back(void);
void lith_host_tick(float dt);
void lith_host_look(float yaw_delta, float pitch_delta);
void lith_host_set_controls(uint32_t flags);
int lith_host_fire(void);
int lith_host_gadget(void);
float lith_host_player_x(void);
float lith_host_player_y(void);
float lith_host_player_z(void);
float lith_host_player_yaw(void);
float lith_host_player_pitch(void);
float lith_host_player_health(void);
float lith_host_enemy_health(void);
int lith_host_enemy_alert(void);
int lith_host_enemy_dead(void);
int lith_host_player_dead(void);
int lith_host_objectives_total(void);
int lith_host_objectives_done(void);
int lith_host_mission_failed(void);
int lith_host_mission_success(void);
float lith_host_weapon_damage(void);
const char *lith_host_weapon_name(void);
const char *lith_host_gadget_name(void);
const char *lith_host_mission_level(void);
int lith_host_save(const char *path);
int lith_host_load(const char *path);
void lith_host_render(uint32_t *pixels, int width, int height);
int lith_host_frame_width(void);
int lith_host_frame_height(void);
uint32_t lith_host_last_crc(void);
const char *lith_host_menu_art(void);

#ifdef __cplusplus
}
#endif
