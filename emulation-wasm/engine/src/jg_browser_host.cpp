#define SDL_MAIN_HANDLED

#include "emulation_host.h"

#include <SDL.h>
#include <emscripten.h>
#include <jg.h>

#include <algorithm>
#include <array>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <exception>
#include <string>
#include <vector>

namespace {

constexpr unsigned kPorts = 5;
constexpr unsigned kButtons = 32;
constexpr unsigned kAxes = 8;
constexpr size_t kAudioRingFrames = 48000 * 2;

#if defined(EMULATION_VARIANT_NES)
constexpr emulation_system kBuiltSystem = EMULATION_SYSTEM_NES;
constexpr const char *kSystemName = "nes";
constexpr const char *kCoreSystemName = "nes";
constexpr unsigned kMaxCatchupFrames = 3;
#elif defined(EMULATION_VARIANT_SNES)
constexpr emulation_system kBuiltSystem = EMULATION_SYSTEM_SNES;
constexpr const char *kSystemName = "snes";
constexpr const char *kCoreSystemName = "snes";
constexpr unsigned kMaxCatchupFrames = 1;
#elif defined(EMULATION_VARIANT_PS1)
constexpr emulation_system kBuiltSystem = EMULATION_SYSTEM_PS1;
constexpr const char *kSystemName = "ps1";
constexpr const char *kCoreSystemName = "psx";
constexpr unsigned kMaxCatchupFrames = 1;
#else
#error A Jolly Good emulation variant must be selected
#endif

struct Host {
    bool initialized = false;
    bool game_loaded = false;
    bool running = false;
    bool first_frame = false;
    bool texture_error_reported = false;
    uint64_t frames = 0;
    uint64_t audio_frames_produced = 0;
    double frames_per_second = 60.0;
    double previous_time_ms = 0.0;
    double accumulated_ms = 0.0;
    int output_width = 960;
    int output_height = 720;
    int pending_state_operation = 0;
    unsigned pending_state_slot = 0;
    int state_operation_status = 0;

    SDL_Window *window = nullptr;
    SDL_Renderer *renderer = nullptr;
    SDL_Texture *texture = nullptr;
    SDL_AudioDeviceID audio_device = 0;
    unsigned texture_width = 0;
    unsigned texture_height = 0;

    jg_videoinfo_t *video = nullptr;
    jg_audioinfo_t *audio = nullptr;
    std::vector<uint8_t> video_buffer;
    std::vector<uint8_t> audio_buffer;
    std::vector<int16_t> audio_ring = std::vector<int16_t>(kAudioRingFrames * 2);
    size_t audio_read = 0;
    size_t audio_write = 0;
    size_t audio_queued_frames = 0;

    std::array<jg_inputstate_t, kPorts> input{};
    std::array<std::array<int16_t, kAxes>, kPorts> axes{};
    std::array<std::array<uint8_t, kButtons>, kPorts> buttons{};
    std::array<std::array<int32_t, kAxes>, kPorts> coords{};
    std::array<std::array<int32_t, kAxes>, kPorts> relative{};

    std::vector<uint8_t> media;
    std::string media_path;
    std::string media_name;
    std::string media_filename;
    std::string media_md5 = "00000000000000000000000000000000";
    std::string persistent_root;
    std::string firmware_root;
    std::string config_path;
    std::string save_path;
    std::string state_path;
};

Host host;

EM_JS(void, browser_frame_presented,
      (int width, int height, double aspect, unsigned long frame), {
    const detail = { width, height, aspect, frame: Number(frame) };
    if (typeof Module.emulationFramePresented === 'function') {
        Module.emulationFramePresented(detail);
    }
});

EM_JS(void, browser_persistence_dirty, (int immediate), {
    if (typeof Module.emulationPersistenceChanged === 'function') {
        Module.emulationPersistenceChanged(Boolean(immediate));
    }
});

void core_log(int level, const char *format, ...) {
    const char *prefix = level == JG_LOG_ERR ? "error" :
        level == JG_LOG_WRN ? "warning" : level == JG_LOG_DBG ? "debug" : "info";
    std::fprintf(level == JG_LOG_ERR ? stderr : stdout, "[jg:%s] ", prefix);
    va_list args;
    va_start(args, format);
    std::vfprintf(level == JG_LOG_ERR ? stderr : stdout, format, args);
    va_end(args);
}

void frametime_changed(void *, double fps) {
    if (fps >= 1.0 && fps <= 1000.0) {
        host.frames_per_second = fps;
        // bsnes reports PAL/NTSC after loading the cartridge but before power,
        // so refresh its audio spec while stream construction is still safe.
        if (!host.game_loaded && host.audio && host.audio->buf) jg_setup_audio();
    }
}

void rumble_changed(void *, int, float, size_t) {}

void push_audio_frame(int16_t left, int16_t right) {
    if (host.audio_queued_frames == kAudioRingFrames) {
        host.audio_read = (host.audio_read + 1) % kAudioRingFrames;
        --host.audio_queued_frames;
    }
    const size_t offset = host.audio_write * 2;
    host.audio_ring[offset] = left;
    host.audio_ring[offset + 1] = right;
    host.audio_write = (host.audio_write + 1) % kAudioRingFrames;
    ++host.audio_queued_frames;
    ++host.audio_frames_produced;
}

int16_t float_to_s16(float sample) {
    const float clamped = std::max(-1.0f, std::min(1.0f, sample));
    return static_cast<int16_t>(clamped * (clamped < 0.0f ? 32768.0f : 32767.0f));
}

void core_audio(void *, size_t samples) {
    if (!host.audio || !host.audio->buf || !samples) return;
    if (host.audio_device) SDL_LockAudioDevice(host.audio_device);
    if (host.audio->sampfmt == JG_SAMPFMT_INT16) {
        const auto *source = static_cast<const int16_t *>(host.audio->buf);
        if (host.audio->channels == 1) {
            for (size_t i = 0; i < samples; ++i) push_audio_frame(source[i], source[i]);
        } else {
            for (size_t i = 0; i + 1 < samples; i += host.audio->channels) {
                push_audio_frame(source[i], source[i + 1]);
            }
        }
    } else {
        const auto *source = static_cast<const float *>(host.audio->buf);
        if (host.audio->channels == 1) {
            for (size_t i = 0; i < samples; ++i) {
                const int16_t value = float_to_s16(source[i]);
                push_audio_frame(value, value);
            }
        } else {
            for (size_t i = 0; i + 1 < samples; i += host.audio->channels) {
                push_audio_frame(float_to_s16(source[i]), float_to_s16(source[i + 1]));
            }
        }
    }
    if (host.audio_device) SDL_UnlockAudioDevice(host.audio_device);
}

void sdl_audio(void *, Uint8 *stream, int length) {
    auto *output = reinterpret_cast<int16_t *>(stream);
    const size_t requested_frames = static_cast<size_t>(length) / (sizeof(int16_t) * 2);
    size_t supplied = 0;
    while (supplied < requested_frames && host.audio_queued_frames) {
        const size_t source = host.audio_read * 2;
        output[supplied * 2] = host.audio_ring[source];
        output[supplied * 2 + 1] = host.audio_ring[source + 1];
        host.audio_read = (host.audio_read + 1) % kAudioRingFrames;
        --host.audio_queued_frames;
        ++supplied;
    }
    std::memset(output + supplied * 2, 0,
        (requested_frames - supplied) * sizeof(int16_t) * 2);
}

uint32_t crc32(const uint8_t *data, size_t size) {
    uint32_t value = 0xffffffffu;
    for (size_t i = 0; i < size; ++i) {
        value ^= data[i];
        for (unsigned bit = 0; bit < 8; ++bit) {
            value = (value >> 1) ^ (0xedb88320u & (0u - (value & 1u)));
        }
    }
    return value ^ 0xffffffffu;
}

bool read_media(const char *path) {
    std::ifstream stream(path, std::ios::binary);
    if (!stream) return false;
    host.media.assign(std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>());
    return !host.media.empty();
}

std::string base_filename(const std::string &path) {
    const size_t slash = path.find_last_of("/\\");
    return slash == std::string::npos ? path : path.substr(slash + 1);
}

std::string media_stem(const std::string &filename) {
    const size_t dot = filename.find_last_of('.');
    std::string stem = dot == std::string::npos ? filename : filename.substr(0, dot);
    for (char &character : stem) {
        if (!(character >= 'a' && character <= 'z') &&
            !(character >= 'A' && character <= 'Z') &&
            !(character >= '0' && character <= '9') && character != '-' && character != '_') {
            character = '_';
        }
    }
    return stem.empty() ? "cartridge" : stem;
}

bool ensure_texture() {
    if (!host.video || !host.renderer) return false;
    if (host.texture && host.texture_width == host.video->w && host.texture_height == host.video->h) return true;
    if (host.texture) SDL_DestroyTexture(host.texture);
    host.texture = SDL_CreateTexture(host.renderer, SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING, static_cast<int>(host.video->w), static_cast<int>(host.video->h));
    host.texture_width = host.video->w;
    host.texture_height = host.video->h;
    if (host.texture) SDL_SetTextureBlendMode(host.texture, SDL_BLENDMODE_NONE);
    else if (!host.texture_error_reported) {
        std::fprintf(stderr, "[emulation-wasm] SDL texture creation failed for %ux%u: %s\n",
            host.video->w, host.video->h, SDL_GetError());
        host.texture_error_reported = true;
    }
    return host.texture != nullptr;
}

void render_frame() {
    if (!host.video || !host.video->buf) return;
    if (!ensure_texture()) return;
    if (!host.first_frame) {
        std::fprintf(stdout,
            "[emulation-wasm] presenting %ux%u video at %dx%d\n",
            host.video->w, host.video->h, host.output_width, host.output_height);
    }
    const auto *source = static_cast<const uint8_t *>(host.video->buf) +
        (static_cast<size_t>(host.video->y) * host.video->p + host.video->x) * 4;
    SDL_UpdateTexture(host.texture, nullptr, source, static_cast<int>(host.video->p * 4));
    SDL_SetRenderDrawColor(host.renderer, 0, 0, 0, 255);
    SDL_RenderClear(host.renderer);
    SDL_RenderCopy(host.renderer, host.texture, nullptr, nullptr);
    SDL_RenderPresent(host.renderer);
    ++host.frames;
    if (!host.first_frame || host.frames % 120 == 0) {
        browser_frame_presented(static_cast<int>(host.video->w), static_cast<int>(host.video->h),
            host.video->aspect, static_cast<unsigned long>(host.frames));
        host.first_frame = true;
    }
}

unsigned keyboard_button(SDL_Keycode key) {
    switch (key) {
        case SDLK_UP: case SDLK_w: return EMULATION_BUTTON_DPAD_UP;
        case SDLK_DOWN: case SDLK_s: return EMULATION_BUTTON_DPAD_DOWN;
        case SDLK_LEFT: case SDLK_a: return EMULATION_BUTTON_DPAD_LEFT;
        case SDLK_RIGHT: case SDLK_d: return EMULATION_BUTTON_DPAD_RIGHT;
        case SDLK_j: return EMULATION_BUTTON_FACE_SOUTH;
        case SDLK_k: return EMULATION_BUTTON_FACE_EAST;
        case SDLK_u: return EMULATION_BUTTON_FACE_WEST;
        case SDLK_i: return EMULATION_BUTTON_FACE_NORTH;
        case SDLK_q: return EMULATION_BUTTON_LEFT_SHOULDER;
        case SDLK_e: return EMULATION_BUTTON_RIGHT_SHOULDER;
        case SDLK_RSHIFT: case SDLK_LSHIFT: return EMULATION_BUTTON_SELECT;
        case SDLK_RETURN: return EMULATION_BUTTON_START;
        default: return static_cast<unsigned>(-1);
    }
}

void poll_events() {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        if (event.type == SDL_QUIT) host.running = false;
        if (event.type == SDL_KEYDOWN || event.type == SDL_KEYUP) {
            if (event.key.repeat) continue;
            const unsigned button = keyboard_button(event.key.keysym.sym);
            if (button != static_cast<unsigned>(-1)) {
                emulation_host_set_button(0, static_cast<emulation_button>(button),
                    event.type == SDL_KEYDOWN ? 1.0f : 0.0f, event.type == SDL_KEYDOWN);
            }
            if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_F5 && !host.pending_state_operation) {
                host.pending_state_operation = 1;
                host.pending_state_slot = 0;
                host.state_operation_status = 1;
            }
            if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_F9 && !host.pending_state_operation) {
                host.pending_state_operation = 2;
                host.pending_state_slot = 0;
                host.state_operation_status = 1;
            }
        }
    }
}

void main_loop(void *) {
    if (!host.running) return;
    poll_events();
    if (host.pending_state_operation) {
        const int operation = host.pending_state_operation;
        const unsigned slot = host.pending_state_slot;
        host.pending_state_operation = 0;
        const int result = operation == 1
            ? emulation_host_save_state(slot)
            : emulation_host_load_state(slot);
        host.state_operation_status = result ? operation + 1 : -operation;
        return;
    }
    const double now = emscripten_get_now();
    if (!host.previous_time_ms) host.previous_time_ms = now - (1000.0 / host.frames_per_second);
    host.accumulated_ms += std::min(100.0, now - host.previous_time_ms);
    host.previous_time_ms = now;
    const double interval = 1000.0 / host.frames_per_second;
    unsigned executed = 0;
    while (host.accumulated_ms >= interval && executed < kMaxCatchupFrames) {
        jg_exec_frame();
        host.accumulated_ms -= interval;
        ++executed;
    }
    if (!host.first_frame && !executed) {
        jg_exec_frame();
        ++executed;
    }
    if (executed) render_frame();
}

bool initialize_sdl() {
    SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "nearest");
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_EVENTS) != 0) {
        std::fprintf(stderr, "[emulation-wasm] SDL initialization failed: %s\n", SDL_GetError());
        return false;
    }
    host.window = SDL_CreateWindow("Console Emulation WASM", SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED, host.output_width, host.output_height,
        SDL_WINDOW_RESIZABLE);
    if (!host.window) {
        std::fprintf(stderr, "[emulation-wasm] SDL window creation failed: %s\n", SDL_GetError());
        return false;
    }
    host.renderer = SDL_CreateRenderer(host.window, -1,
        SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!host.renderer) host.renderer = SDL_CreateRenderer(host.window, -1, SDL_RENDERER_ACCELERATED);
    if (!host.renderer) host.renderer = SDL_CreateRenderer(host.window, -1, SDL_RENDERER_SOFTWARE);
    if (!host.renderer) {
        std::fprintf(stderr, "[emulation-wasm] SDL renderer creation failed: %s\n", SDL_GetError());
        return false;
    }

    SDL_AudioSpec desired{};
    desired.freq = host.audio ? static_cast<int>(host.audio->rate) : 48000;
    desired.format = AUDIO_S16SYS;
    desired.channels = 2;
    desired.samples = 1024;
    desired.callback = sdl_audio;
    host.audio_device = SDL_OpenAudioDevice(nullptr, 0, &desired, nullptr, 0);
    if (host.audio_device) {
        SDL_PauseAudioDevice(host.audio_device, 0);
    } else {
        std::fprintf(stderr, "[emulation-wasm] SDL audio output unavailable: %s\n", SDL_GetError());
    }
    return true;
}

std::string state_file(unsigned slot) {
    return host.state_path + "/slot" + std::to_string(std::min(slot, 99u)) + ".state";
}

unsigned core_button_index(emulation_button button) {
    switch (button) {
        case EMULATION_BUTTON_DPAD_UP: return 0;
        case EMULATION_BUTTON_DPAD_DOWN: return 1;
        case EMULATION_BUTTON_DPAD_LEFT: return 2;
        case EMULATION_BUTTON_DPAD_RIGHT: return 3;
#if defined(EMULATION_VARIANT_PS1)
        case EMULATION_BUTTON_SELECT: return 4;
        case EMULATION_BUTTON_START: return 5;
        case EMULATION_BUTTON_FACE_NORTH: return 6;
        case EMULATION_BUTTON_FACE_SOUTH: return 7;
        case EMULATION_BUTTON_FACE_WEST: return 8;
        case EMULATION_BUTTON_FACE_EAST: return 9;
        case EMULATION_BUTTON_LEFT_SHOULDER: return 11;
        case EMULATION_BUTTON_LEFT_TRIGGER: return 12;
        case EMULATION_BUTTON_LEFT_STICK: return 13;
        case EMULATION_BUTTON_RIGHT_SHOULDER: return 14;
        case EMULATION_BUTTON_RIGHT_TRIGGER: return 15;
        case EMULATION_BUTTON_RIGHT_STICK: return 16;
#else
        case EMULATION_BUTTON_SELECT: return 4;
        case EMULATION_BUTTON_START: return 5;
        case EMULATION_BUTTON_FACE_EAST: return 6;
        case EMULATION_BUTTON_FACE_SOUTH: return 7;
#if defined(EMULATION_VARIANT_SNES)
        case EMULATION_BUTTON_FACE_NORTH: return 8;
        case EMULATION_BUTTON_FACE_WEST: return 9;
        case EMULATION_BUTTON_LEFT_SHOULDER: return 10;
        case EMULATION_BUTTON_RIGHT_SHOULDER: return 11;
#endif
#endif
        default: return static_cast<unsigned>(-1);
    }
}

} // namespace

extern "C" int emulation_host_boot(const emulation_boot_options *options) {
    if (!options || options->system != kBuiltSystem || !options->media_path || !options->persistent_root) return 0;
    host.media_path = options->media_path;
    host.media_filename = base_filename(host.media_path);
    host.media_name = media_stem(host.media_filename);
    host.persistent_root = options->persistent_root;
    host.firmware_root = options->firmware_path ? options->firmware_path : "/media";
#if defined(EMULATION_VARIANT_PS1)
    if (!options->firmware_path || !*options->firmware_path) {
        std::fprintf(stderr, "[emulation-wasm] PlayStation firmware root was not supplied\n");
        return 0;
    }
#endif
    host.config_path = options->config_path ? options->config_path : host.persistent_root + "/config";
    host.save_path = options->save_path ? options->save_path : host.persistent_root + "/saves";
    host.state_path = options->state_path ? options->state_path : host.persistent_root + "/states";
    if (!read_media(options->media_path)) return 0;

    const jg_coreinfo_t *core = jg_get_coreinfo(kCoreSystemName);
    if (!core || !core->sys || std::strcmp(core->sys, kCoreSystemName)) {
        std::fprintf(stderr, "[emulation-wasm] Jolly Good core could not select system %s\n", kSystemName);
        return 0;
    }

    jg_set_cb_log(core_log);
    jg_set_cb_audio(core_audio, nullptr);
    jg_set_cb_frametime(frametime_changed, nullptr);
    jg_set_cb_rumble(rumble_changed, nullptr);

    const jg_pathinfo_t paths{
        host.persistent_root.c_str(), "/core", host.config_path.c_str(),
        host.firmware_root.c_str(), host.save_path.c_str()
    };
    jg_set_paths(paths);
    if (!jg_init()) {
        std::fprintf(stderr, "[emulation-wasm] Jolly Good core initialization failed\n");
        return 0;
    }
    host.initialized = true;

    host.video = jg_get_videoinfo();
    host.audio = jg_get_audioinfo();
    if (!host.video || !host.audio || !host.video->wmax || !host.video->hmax || !host.audio->spf) {
        std::fprintf(stderr, "[emulation-wasm] Jolly Good core returned invalid video/audio geometry\n");
        return 0;
    }
    host.video_buffer.resize(static_cast<size_t>(host.video->wmax) * host.video->hmax * 4);
    const size_t audio_sample_bytes = host.audio->sampfmt == JG_SAMPFMT_FLT32 ? sizeof(float) : sizeof(int16_t);
    host.audio_buffer.resize(std::max<size_t>(host.audio->spf * audio_sample_bytes,
        host.audio->rate * host.audio->channels * audio_sample_bytes));
    host.video->buf = host.video_buffer.data();
    host.audio->buf = host.audio_buffer.data();
    // Some cores create their audio streams while loading/powering a game.
    // Supply the frontend buffers before game_load; the region callback above
    // refreshes the spec before power when a core changes frame timing.
    jg_setup_video();
    jg_setup_audio();

    for (unsigned port = 0; port < kPorts; ++port) {
        host.input[port] = { host.axes[port].data(), host.buttons[port].data(),
            host.coords[port].data(), host.relative[port].data() };
        jg_set_inputstate(&host.input[port], static_cast<int>(port));
    }

    const jg_fileinfo_t game{
        host.media.data(), host.media.size(), crc32(host.media.data(), host.media.size()),
        host.media_md5.c_str(), host.media_path.c_str(), host.media_name.c_str(), host.media_filename.c_str()
    };
    jg_set_gameinfo(game);
    try {
        if (!jg_game_load()) {
            std::fprintf(stderr, "[emulation-wasm] Jolly Good core rejected selected media\n");
            return 0;
        }
    } catch (const std::string &error) {
        std::fprintf(stderr, "[emulation-wasm] Jolly Good core load error: %s\n", error.c_str());
        return 0;
    } catch (const std::exception &error) {
        std::fprintf(stderr, "[emulation-wasm] Jolly Good core load error: %s\n", error.what());
        return 0;
    } catch (...) {
        std::fprintf(stderr, "[emulation-wasm] Jolly Good core load error: unknown exception\n");
        return 0;
    }
    host.game_loaded = true;

    if (!initialize_sdl()) return 0;

    const std::string config_file = host.config_path + "/host-v1.cfg";
    std::ifstream existing(config_file);
    if (!existing.good()) {
        std::ofstream config(config_file);
        config << "system=" << kSystemName << "\nvideo=nearest\naudio=48000-stereo\n";
        config.close();
        browser_persistence_dirty(0);
    }
    host.running = true;
    return 1;
}

extern "C" int emulation_host_run_frame(emulation_video_frame *video, emulation_audio_frame *audio) {
    if (!host.running) return 0;
    jg_exec_frame();
    if (video && host.video) {
        *video = { host.video->buf, host.video->w, host.video->h, host.video->p * 4,
            static_cast<uint32_t>(host.video->pixfmt), host.video->aspect };
    }
    if (audio) *audio = { nullptr, 0, host.audio ? host.audio->rate : 0, 2 };
    return 1;
}

extern "C" void emulation_host_set_button(unsigned port, emulation_button button, float value, int pressed) {
    if (port >= kPorts) return;
    const unsigned index = core_button_index(button);
    if (index < kButtons) host.buttons[port][index] = pressed && value > 0.0f ? 1 : 0;
}

extern "C" void emulation_host_set_axis(unsigned port, emulation_axis axis, float value) {
    if (port >= kPorts || static_cast<unsigned>(axis) >= kAxes) return;
    host.axes[port][axis] = static_cast<int16_t>(std::max(-1.0f, std::min(1.0f, value)) * 32767.0f);
}

extern "C" int emulation_host_commit_save_data(void) {
    return emulation_host_save_state(99);
}

extern "C" int emulation_host_save_state(unsigned slot) {
    if (!host.game_loaded) return 0;
    const int saved = jg_state_save(state_file(slot).c_str());
    if (saved) browser_persistence_dirty(0);
    return saved;
}

extern "C" int emulation_host_load_state(unsigned slot) {
    return host.game_loaded ? jg_state_load(state_file(slot).c_str()) : 0;
}

extern "C" void emulation_host_shutdown(void) {
    if (!host.initialized) return;
    host.running = false;
    emscripten_cancel_main_loop();
    if (host.game_loaded) {
        jg_game_unload();
        host.game_loaded = false;
        browser_persistence_dirty(1);
    }
    jg_deinit();
    host.initialized = false;
    if (host.audio_device) SDL_CloseAudioDevice(host.audio_device);
    if (host.texture) SDL_DestroyTexture(host.texture);
    if (host.renderer) SDL_DestroyRenderer(host.renderer);
    if (host.window) SDL_DestroyWindow(host.window);
    host.audio_device = 0;
    host.texture = nullptr;
    host.renderer = nullptr;
    host.window = nullptr;
    SDL_Quit();
}

extern "C" EMSCRIPTEN_KEEPALIVE void Emulation_BrowserSetButton(int port, int button, float value) {
    emulation_host_set_button(static_cast<unsigned>(std::max(0, port)),
        static_cast<emulation_button>(button), value, value > 0.0f);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Emulation_BrowserSetAxis(int port, int axis, float value) {
    emulation_host_set_axis(static_cast<unsigned>(std::max(0, port)),
        static_cast<emulation_axis>(axis), value);
}

extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserButtonState(int port, int button) {
    if (port < 0 || static_cast<unsigned>(port) >= kPorts) return 0;
    const unsigned index = core_button_index(static_cast<emulation_button>(button));
    return index < kButtons ? host.buttons[port][index] : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void Emulation_BrowserReleaseAll(void) {
    for (auto &buttons : host.buttons) buttons.fill(0);
    for (auto &axes : host.axes) axes.fill(0);
}

extern "C" EMSCRIPTEN_KEEPALIVE void Emulation_BrowserResize(int width, int height) {
    host.output_width = std::max(1, width);
    host.output_height = std::max(1, height);
    if (host.window) SDL_SetWindowSize(host.window, host.output_width, host.output_height);
}

extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserSaveState(int slot) {
    if (!host.running || host.pending_state_operation || host.state_operation_status == 1) return 0;
    host.pending_state_operation = 1;
    host.pending_state_slot = static_cast<unsigned>(std::max(0, slot));
    host.state_operation_status = 1;
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserLoadState(int slot) {
    if (!host.running || host.pending_state_operation || host.state_operation_status == 1) return 0;
    host.pending_state_operation = 2;
    host.pending_state_slot = static_cast<unsigned>(std::max(0, slot));
    host.state_operation_status = 1;
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE void Emulation_BrowserShutdown(void) { emulation_host_shutdown(); }
extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserRuntimeState(void) { return host.running ? 2 : host.initialized ? 1 : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserVideoWidth(void) { return host.video ? static_cast<int>(host.video->w) : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserVideoHeight(void) { return host.video ? static_cast<int>(host.video->h) : 0; }
extern "C" EMSCRIPTEN_KEEPALIVE double Emulation_BrowserFrameCount(void) { return static_cast<double>(host.frames); }
extern "C" EMSCRIPTEN_KEEPALIVE double Emulation_BrowserAudioFrameCount(void) { return static_cast<double>(host.audio_frames_produced); }
extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserAudioQueued(void) { return static_cast<int>(host.audio_queued_frames); }
extern "C" EMSCRIPTEN_KEEPALIVE int Emulation_BrowserStateOperationStatus(void) { return host.state_operation_status; }

int main(int argc, char **argv) {
    const char *system = nullptr;
    const char *media = nullptr;
    const char *firmware = nullptr;
    const char *persistent = nullptr;
    for (int index = 1; index + 1 < argc; index += 2) {
        if (!std::strcmp(argv[index], "--system")) system = argv[index + 1];
        else if (!std::strcmp(argv[index], "--media")) media = argv[index + 1];
        else if (!std::strcmp(argv[index], "--firmware-root")) firmware = argv[index + 1];
        else if (!std::strcmp(argv[index], "--persistent-root")) persistent = argv[index + 1];
    }
    if (!system || std::strcmp(system, kSystemName) || !media || !persistent) {
        std::fprintf(stderr, "usage: emulator --system %s --media FILE [--firmware-root DIR] --persistent-root DIR\n", kSystemName);
        return 2;
    }
    const std::string config = std::string(persistent) + "/config";
    const std::string saves = std::string(persistent) + "/saves";
    const std::string states = std::string(persistent) + "/states";
    const emulation_boot_options options{
        kBuiltSystem, media, firmware, persistent, config.c_str(), saves.c_str(), states.c_str()
    };
    if (!emulation_host_boot(&options)) {
        std::fprintf(stderr, "[emulation-wasm] %s core failed to boot selected media\n", kSystemName);
        emulation_host_shutdown();
        return 1;
    }
    std::printf("[emulation-wasm] %s Jolly Good core running\n", kSystemName);
    emscripten_set_main_loop_arg(main_loop, nullptr, 0, 0);
    return 0;
}
