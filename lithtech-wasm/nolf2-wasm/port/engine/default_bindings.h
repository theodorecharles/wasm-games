#ifndef PORT_DEFAULT_BINDINGS_H
#define PORT_DEFAULT_BINDINGS_H

/* Retail NOLF2 keyboard defaults (ProfileMgr command table). */

#include "CommandIDs.h"

struct PortBinding {
	int command;
	int sdl_key; /* SDL_SCANCODE_* once SDL is included; 0 = unset */
	const char *name;
};

/* Filled in sdl_input.cpp against SDL scancodes. Logical map:
 * W / Up     COMMAND_ID_FORWARD
 * S / Down   COMMAND_ID_REVERSE
 * A          COMMAND_ID_STRAFE_LEFT
 * D          COMMAND_ID_STRAFE_RIGHT
 * Space      COMMAND_ID_JUMP
 * Ctrl       COMMAND_ID_DUCK
 * Shift      COMMAND_ID_RUN
 * E / Enter  COMMAND_ID_ACTIVATE
 * R          COMMAND_ID_RELOAD
 * Mouse1     COMMAND_ID_FIRING
 * Mouse2     COMMAND_ID_ALT_FIRING
 * Q          COMMAND_ID_LEAN_LEFT
 * E hold?    COMMAND_ID_LEAN_RIGHT  (retail often Q/E lean)
 * F          COMMAND_ID_FLASHLIGHT
 * C          COMMAND_ID_COMPASS
 * Tab        COMMAND_ID_MISSION
 * I          COMMAND_ID_INTEL
 * K          COMMAND_ID_KEYS
 * G          COMMAND_ID_HOLSTER
 * 1-6        COMMAND_ID_CHOOSE_1..6
 * Mouse wheel COMMAND_ID_NEXT/PREV_WEAPON
 * F5/F9      COMMAND_ID_QUICKSAVE / QUICKLOAD
 * Esc        handled as UI, not a command
 */

#endif
