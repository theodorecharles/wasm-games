#ifndef WOLF4SDL_WEB_SDL_MIXER_STUB_H
#define WOLF4SDL_WEB_SDL_MIXER_STUB_H

/* Minimal SDL1 mixer for the browser target. Wolf4SDL only needs PCM
 * channels, stereo panning, and one OPL music hook. */

#include <SDL.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define MIX_CHANNELS 32
#define MIX_MAX_VOLUME 128

typedef struct Mix_Chunk
{
    Uint8 *abuf;
    Uint32 alen;
    Uint8 volume;
} Mix_Chunk;

typedef struct
{
    Mix_Chunk *chunk;
    Uint32 position;
    Uint8 left;
    Uint8 right;
    int group;
    Uint32 serial;
} WolfWebMixChannel;

static WolfWebMixChannel wolf_web_channels[MIX_CHANNELS];
static void (*wolf_web_music_hook)(void *, Uint8 *, int);
static void *wolf_web_music_data;
static void (*wolf_web_finished_hook)(int);
static Uint32 wolf_web_serial;
static int wolf_web_reserved;
static int wolf_web_audio_open;
static const char *wolf_web_mix_error = "no mixer error";

static inline Sint16 WolfWebClampSample(int sample)
{
    if (sample > 32767) return 32767;
    if (sample < -32768) return -32768;
    return (Sint16) sample;
}

static void WolfWebMixAudio(void *, Uint8 *stream, int len)
{
    Sint16 *output = (Sint16 *)(void *) stream;
    int sample_count = len / (int) sizeof(Sint16);

    memset(stream, 0, (size_t) len);
    if (wolf_web_music_hook)
        wolf_web_music_hook(wolf_web_music_data, stream, len);

    for (int channel = 0; channel < MIX_CHANNELS; ++channel)
    {
        WolfWebMixChannel *voice = &wolf_web_channels[channel];
        if (!voice->chunk) continue;

        const Sint16 *source = (const Sint16 *)(const void *) voice->chunk->abuf;
        Uint32 source_samples = voice->chunk->alen / sizeof(Sint16);
        int mixed = 0;
        while (mixed < sample_count && voice->position < source_samples)
        {
            int pan = (mixed & 1) ? voice->right : voice->left;
            int value = source[voice->position++];
            value = value * pan * voice->chunk->volume / (255 * MIX_MAX_VOLUME);
            output[mixed] = WolfWebClampSample((int) output[mixed] + value);
            ++mixed;
        }

        if (voice->position >= source_samples)
        {
            voice->chunk = NULL;
            voice->position = 0;
            if (wolf_web_finished_hook) wolf_web_finished_hook(channel);
        }
    }
}

static inline int Mix_OpenAudio(int frequency, Uint16 format, int channels, int chunksize)
{
    SDL_AudioSpec desired;
    SDL_AudioSpec obtained;

    if (format != AUDIO_S16SYS || channels != 2)
    {
        wolf_web_mix_error = "browser mixer requires signed 16-bit stereo";
        return -1;
    }
    if (SDL_InitSubSystem(SDL_INIT_AUDIO) != 0)
    {
        wolf_web_mix_error = SDL_GetError();
        return -1;
    }

    memset(&desired, 0, sizeof(desired));
    desired.freq = frequency;
    desired.format = AUDIO_S16SYS;
    desired.channels = 2;
    desired.samples = (Uint16) chunksize;
    desired.callback = WolfWebMixAudio;

    if (SDL_OpenAudio(&desired, &obtained) != 0)
    {
        wolf_web_mix_error = SDL_GetError();
        return -1;
    }
    if (obtained.format != desired.format || obtained.channels != 2)
    {
        wolf_web_mix_error = "browser returned an unsupported audio format";
        SDL_CloseAudio();
        return -1;
    }

    memset(wolf_web_channels, 0, sizeof(wolf_web_channels));
    for (int i = 0; i < MIX_CHANNELS; ++i)
    {
        wolf_web_channels[i].left = 255;
        wolf_web_channels[i].right = 255;
        wolf_web_channels[i].group = -1;
    }
    wolf_web_audio_open = 1;
    SDL_PauseAudio(0);
    return 0;
}

static inline const char *Mix_GetError(void) { return wolf_web_mix_error; }

static inline void Mix_CloseAudio(void)
{
    if (!wolf_web_audio_open) return;
    SDL_CloseAudio();
    SDL_QuitSubSystem(SDL_INIT_AUDIO);
    wolf_web_audio_open = 0;
}

static inline void Mix_ReserveChannels(int count)
{
    wolf_web_reserved = count < 0 ? 0 : (count > MIX_CHANNELS ? MIX_CHANNELS : count);
}

static inline int Mix_GroupChannels(int from, int to, int tag)
{
    if (from < 0) from = 0;
    if (to >= MIX_CHANNELS) to = MIX_CHANNELS - 1;
    if (from > to) return 0;
    for (int i = from; i <= to; ++i) wolf_web_channels[i].group = tag;
    return to - from + 1;
}

static inline int Mix_GroupAvailable(int tag)
{
    for (int i = wolf_web_reserved; i < MIX_CHANNELS; ++i)
        if (wolf_web_channels[i].group == tag && !wolf_web_channels[i].chunk) return i;
    return -1;
}

static inline int Mix_GroupOldest(int tag)
{
    int found = -1;
    Uint32 oldest = UINT32_MAX;
    for (int i = wolf_web_reserved; i < MIX_CHANNELS; ++i)
    {
        if (wolf_web_channels[i].group == tag && wolf_web_channels[i].chunk
            && wolf_web_channels[i].serial < oldest)
        {
            found = i;
            oldest = wolf_web_channels[i].serial;
        }
    }
    return found;
}

static inline int Mix_HaltChannel(int channel)
{
    SDL_LockAudio();
    int first = channel < 0 ? 0 : channel;
    int last = channel < 0 ? MIX_CHANNELS - 1 : channel;
    if (first < 0 || last >= MIX_CHANNELS)
    {
        SDL_UnlockAudio();
        return -1;
    }
    for (int i = first; i <= last; ++i)
    {
        wolf_web_channels[i].chunk = NULL;
        wolf_web_channels[i].position = 0;
    }
    SDL_UnlockAudio();
    return 0;
}

static inline int Mix_SetPanning(int channel, Uint8 left, Uint8 right)
{
    if (channel < 0 || channel >= MIX_CHANNELS) return 0;
    SDL_LockAudio();
    wolf_web_channels[channel].left = left;
    wolf_web_channels[channel].right = right;
    SDL_UnlockAudio();
    return 1;
}

static inline void Mix_ChannelFinished(void (*callback)(int))
{
    wolf_web_finished_hook = callback;
}

static inline void Mix_HookMusic(void (*callback)(void *, Uint8 *, int), void *data)
{
    SDL_LockAudio();
    wolf_web_music_hook = callback;
    wolf_web_music_data = data;
    SDL_UnlockAudio();
}

static inline Mix_Chunk *WolfWebMixLoadPCM16Mono(const Sint16 *samples, Uint32 frames)
{
    Mix_Chunk *chunk = NULL;

    chunk = (Mix_Chunk *) malloc(sizeof(*chunk));
    if (chunk)
    {
        Sint16 *stereo = (Sint16 *) malloc((size_t) frames * 2 * sizeof(Sint16));
        if (!stereo)
        {
            free(chunk);
            chunk = NULL;
        }
        else
        {
            for (Uint32 i = 0; i < frames; ++i)
                stereo[i * 2] = stereo[i * 2 + 1] = samples[i];
            chunk->abuf = (Uint8 *)(void *) stereo;
            chunk->alen = frames * 2 * sizeof(Sint16);
            chunk->volume = MIX_MAX_VOLUME;
        }
    }
    if (!chunk) wolf_web_mix_error = "out of memory preparing browser sound";
    return chunk;
}

static inline void Mix_FreeChunk(Mix_Chunk *chunk)
{
    if (!chunk) return;
    free(chunk->abuf);
    free(chunk);
}

static inline int Mix_PlayChannel(int channel, Mix_Chunk *chunk, int loops)
{
    if (!chunk || loops != 0) return -1;
    if (channel < 0) channel = Mix_GroupAvailable(1);
    if (channel < 0 || channel >= MIX_CHANNELS) return -1;
    SDL_LockAudio();
    wolf_web_channels[channel].chunk = chunk;
    wolf_web_channels[channel].position = 0;
    wolf_web_channels[channel].serial = ++wolf_web_serial;
    SDL_UnlockAudio();
    return channel;
}

static inline int WolfWebMixActiveChannels(void)
{
    int active = 0;
    SDL_LockAudio();
    for (int channel = 0; channel < MIX_CHANNELS; ++channel)
        if (wolf_web_channels[channel].chunk) ++active;
    SDL_UnlockAudio();
    return active;
}

#endif
