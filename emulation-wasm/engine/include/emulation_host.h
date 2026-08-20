#ifndef EMULATION_WASM_HOST_H
#define EMULATION_WASM_HOST_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum emulation_system {
    EMULATION_SYSTEM_NES = 1,
    EMULATION_SYSTEM_SNES = 2,
    EMULATION_SYSTEM_PS1 = 3,
    EMULATION_SYSTEM_PS2 = 4
};

enum emulation_button {
    EMULATION_BUTTON_DPAD_UP,
    EMULATION_BUTTON_DPAD_DOWN,
    EMULATION_BUTTON_DPAD_LEFT,
    EMULATION_BUTTON_DPAD_RIGHT,
    EMULATION_BUTTON_FACE_SOUTH,
    EMULATION_BUTTON_FACE_EAST,
    EMULATION_BUTTON_FACE_WEST,
    EMULATION_BUTTON_FACE_NORTH,
    EMULATION_BUTTON_LEFT_SHOULDER,
    EMULATION_BUTTON_RIGHT_SHOULDER,
    EMULATION_BUTTON_LEFT_TRIGGER,
    EMULATION_BUTTON_RIGHT_TRIGGER,
    EMULATION_BUTTON_SELECT,
    EMULATION_BUTTON_START,
    EMULATION_BUTTON_LEFT_STICK,
    EMULATION_BUTTON_RIGHT_STICK
};

enum emulation_axis {
    EMULATION_AXIS_LEFT_X,
    EMULATION_AXIS_LEFT_Y,
    EMULATION_AXIS_RIGHT_X,
    EMULATION_AXIS_RIGHT_Y
};

struct emulation_boot_options {
    enum emulation_system system;
    const char *media_path;
    const char *firmware_path;
    const char *persistent_root;
    const char *config_path;
    const char *save_path;
    const char *state_path;
};

struct emulation_video_frame {
    const void *pixels;
    uint32_t width;
    uint32_t height;
    uint32_t pitch;
    uint32_t format;
    double pixel_aspect_ratio;
};

struct emulation_audio_frame {
    const int16_t *samples;
    size_t frame_count;
    uint32_t sample_rate;
    uint32_t channels;
};

/*
 * This is the required host ABI, not a stub emulator. No implementation is
 * linked until a selected native core can supply real video, audio, input, and
 * persistence behavior.
 */
int emulation_host_boot(const struct emulation_boot_options *options);
int emulation_host_run_frame(struct emulation_video_frame *video,
                             struct emulation_audio_frame *audio);
void emulation_host_set_button(unsigned port, enum emulation_button button,
                               float value, int pressed);
void emulation_host_set_axis(unsigned port, enum emulation_axis axis,
                            float value);
int emulation_host_commit_save_data(void);
int emulation_host_save_state(unsigned slot);
int emulation_host_load_state(unsigned slot);
void emulation_host_shutdown(void);

#ifdef __cplusplus
}
#endif

#endif
