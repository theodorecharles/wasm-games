// Browser-only SDL mixer for Zandronum's native sound/OPL stream interfaces.
// SDL owns the page audio handoff; native channel retirement stays on game tics.
#include "decode.h"
#include "i_sound.h"
#include "c_cvars.h"
#include "c_console.h"
#include <SDL.h>
#include <emscripten.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

EXTERN_CVAR(Bool, snd_pitched)

namespace {
const unsigned OutputRate = 44100;
unsigned AudioDevices, AudioCallbacks, MusicSamples, SfxSamples;
unsigned VoicesStarted, VoicesFinished, ActiveVoices;
float Limit(float value) { return std::max(-1.f, std::min(1.f, value)); }
float Volume(float value) { return std::max(0.f, std::min(1.f, value)); }
struct Sample : BrowserPCM { size_t loopStart = 0, loopEnd = 0; };
class BrowserRenderer;

class BrowserStream : public SoundStream {
public:
    BrowserRenderer *owner;
    SoundStreamCallback callback = nullptr;
    void *userdata = nullptr;
    BrowserPCM pcm;
    std::vector<float> storage;
    int flags = 0, bytes = 0;
    double position = 0, played = 0;
    float volume = 1;
    bool playing = false, paused = false, looping = false, ended = false, lastBuffer = false;
    explicit BrowserStream(BrowserRenderer *renderer) : owner(renderer) {}
    ~BrowserStream();
    bool Play(bool loop, float vol) override {
        looping = loop; volume = Volume(vol); playing = true; paused = ended = lastBuffer = false;
        position = played = 0;
        if (callback) pcm.samples.clear();
        return true;
    }
    void Stop() override { playing = false; }
    void SetVolume(float value) override { volume = Volume(value); }
    bool SetPaused(bool value) override { paused = value; return true; }
    unsigned GetPosition() override { return unsigned(played * 1000 / pcm.rate); }
    bool IsEnded() override { return ended; }
    bool SetPosition(unsigned milliseconds) override {
        if (callback) return false;
        position = std::min(double(pcm.Frames()), double(milliseconds) * pcm.rate / 1000.0);
        played = position; ended = false; return true;
    }
    bool Refill() {
        if (!callback || lastBuffer) return false;
        std::fill(storage.begin(), storage.end(), 0.f);
        lastBuffer = !callback(this, storage.data(), bytes, userdata);
        const unsigned width = flags & Float ? 4 : flags & Bits8 ? 1 : flags & Bits32 ? 4 : 2;
        const size_t count = bytes / width;
        pcm.samples.resize(count);
        const unsigned char *raw = reinterpret_cast<const unsigned char *>(storage.data());
        for (size_t i = 0; i < count; ++i) {
            float value;
            if (flags & Float) value = storage[i];
            else value = BrowserReadIntegerPCM(raw + i * width, width == 1 ? BrowserIntegerPCM::Signed8 :
                width == 2 ? BrowserIntegerPCM::Signed16LE : BrowserIntegerPCM::Signed32LE);
            pcm.samples[i] = std::isfinite(value) ? value : 0.f;
        }
        return pcm.Frames() > 0;
    }
    void Mix(float *out, unsigned frames, float master) {
        if (!playing || paused) return;
        const double step = double(pcm.rate) / OutputRate;
        for (unsigned i = 0; i < frames; ++i) {
            if (position >= pcm.Frames()) {
                if (callback) {
                    position -= pcm.Frames();
                    if (!Refill()) { playing = false; ended = true; break; }
                } else if (looping && pcm.Frames()) position = fmod(position, double(pcm.Frames()));
                else { playing = false; ended = true; break; }
            }
            const size_t index = size_t(position), next = std::min(index + 1, pcm.Frames() - 1);
            const float frac = float(position - index);
            for (unsigned c = 0; c < 2; ++c) {
                const unsigned source = pcm.channels == 1 ? 0 : c;
                float a = pcm.samples[index * pcm.channels + source];
                float b = pcm.samples[next * pcm.channels + source];
                float value = (a + (b - a) * frac) * master * volume;
                if (value != 0) ++MusicSamples;
                out[i * 2 + c] += value;
            }
            position += step; played += step;
        }
    }
};

class BrowserRenderer : public SoundRenderer {
    struct Voice {
        Sample *sample = nullptr;
        FISoundChannel *channel = nullptr;
        double position = 0, step = 1;
        float volume = 1, left = 1, right = 1;
        int flags = 0;
        bool ended = false;
    } voices[256];
    std::vector<BrowserStream *> streams;
    float sfxVolume = 1, musicVolume = 0.5f;
    float scratch[4096 * 2];
    unsigned pauseSlots = 0;
    bool valid = false, synchronizing = false;
    EInactiveState inactive = INACTIVE_Active;
    QWORD clock = 0;

    static void Audio(void *userdata, Uint8 *output, int length) {
        static_cast<BrowserRenderer *>(userdata)->Mix(reinterpret_cast<Sint16 *>(output), length / 4);
    }
    void Retire(Voice &voice) {
        if (!voice.channel) return;
        // The callback asks GetPosition() before returning or virtualizing the
        // native channel. Keep its SysChannel valid until that callback ends.
        S_ChannelEnded(voice.channel);
        ++VoicesFinished; --ActiveVoices;
        voice = Voice();
    }
    Voice *Find(FISoundChannel *channel) {
        return channel ? static_cast<Voice *>(channel->SysChannel) : nullptr;
    }
    void Mix(Sint16 *output, unsigned frames) {
        ++AudioCallbacks;
        while (frames) {
            unsigned chunk = std::min(frames, 4096u);
            std::fill(scratch, scratch + chunk * 2, 0.f);
            if (inactive != INACTIVE_Complete && !synchronizing) {
                for (Voice &voice : voices) {
                    if (!voice.channel || voice.ended || (pauseSlots && !(voice.flags & SNDF_NOPAUSE))) continue;
                    Sample &sample = *voice.sample;
                    const size_t end = voice.flags & SNDF_LOOP ? sample.loopEnd : sample.Frames();
                    for (unsigned i = 0; i < chunk; ++i) {
                        if (voice.position >= end) {
                            if (voice.flags & SNDF_LOOP)
                                voice.position = sample.loopStart + fmod(voice.position - sample.loopStart,
                                    double(end - sample.loopStart));
                            else { voice.position = sample.Frames(); voice.ended = true; break; }
                        }
                        size_t index = size_t(voice.position), next = std::min(index + 1, sample.Frames() - 1);
                        if ((voice.flags & SNDF_LOOP) && index + 1 >= end) next = sample.loopStart;
                        float fraction = float(voice.position - index);
                        for (unsigned c = 0; c < 2; ++c) {
                            unsigned source = sample.channels == 1 ? 0 : c;
                            float a = sample.samples[index * sample.channels + source];
                            float b = sample.samples[next * sample.channels + source];
                            float value = (a + (b - a) * fraction) * voice.volume * sfxVolume *
                                (c == 0 ? voice.left : voice.right);
                            if (value != 0) ++SfxSamples;
                            scratch[i * 2 + c] += value;
                        }
                        voice.position += voice.step;
                    }
                }
                for (BrowserStream *stream : streams) stream->Mix(scratch, chunk, musicVolume);
            }
            for (unsigned i = 0; i < chunk * 2; ++i)
                output[i] = inactive == INACTIVE_Mute ? 0 : Sint16(Limit(scratch[i]) * 32767.f);
            output += chunk * 2; frames -= chunk; clock += chunk;
        }
    }
public:
    BrowserRenderer() {
        if (SDL_InitSubSystem(SDL_INIT_AUDIO) != 0) return;
        SDL_AudioSpec desired = {}, obtained = {};
        desired.freq = OutputRate; desired.format = AUDIO_S16SYS; desired.channels = 2;
        desired.samples = 1024; desired.callback = Audio; desired.userdata = this;
        if (SDL_OpenAudio(&desired, &obtained) != 0) return;
        if (obtained.freq != int(OutputRate) || obtained.channels != 2 || obtained.format != AUDIO_S16SYS) {
            SDL_CloseAudio(); return;
        }
        valid = true; AudioDevices = 1;
        SDL_PauseAudio(0);
        Printf("Browser SDL audio: 44100 Hz stereo, native OPL music.\n");
    }
    ~BrowserRenderer() override {
        if (valid) SDL_CloseAudio();
        AudioDevices = 0;
        for (Voice &voice : voices) Retire(voice);
        for (BrowserStream *stream : streams) stream->owner = nullptr;
    }
    void Remove(BrowserStream *stream) {
        streams.erase(std::remove(streams.begin(), streams.end(), stream), streams.end());
    }
    bool IsValid() override { return valid; }
    void PrintStatus() override { Printf("Browser SDL audio: %s\n", valid ? "active" : "unavailable"); }
    void PrintDriversList() override { Printf("SDL WebAudio output\n"); }
    float GetOutputRate() override { return OutputRate; }
    void SetSfxVolume(float value) override { sfxVolume = Volume(value); }
    void SetMusicVolume(float value) override { musicVolume = Volume(value); }
    SoundHandle LoadSound(BYTE *data, int length) override {
        SoundHandle result = { nullptr };
        Sample *sample = new Sample;
        if (length <= 0 || !BrowserDecodePCM(data, size_t(length), *sample)) { delete sample; return result; }
        sample->loopEnd = sample->Frames(); result.data = sample; return result;
    }
    SoundHandle LoadSoundRaw(BYTE *data, int length, int rate, int channels, int bits,
        int loopStart, int loopEnd = -1) override {
        SoundHandle result = { nullptr };
        if (!data || length <= 0 || length > 64 * 1024 * 1024 || channels < 1 || channels > 2 ||
            rate < 1000 || rate > 192000 || (bits != 8 && bits != -8 && bits != 16 && bits != 32)) return result;
        unsigned width = unsigned(abs(bits)) / 8;
        size_t count = size_t(length) / (width * channels) * channels;
        if (!count || count > 16 * 1024 * 1024) return result;
        Sample *sample = new Sample;
        sample->rate = rate; sample->channels = channels; sample->samples.resize(count);
        BrowserIntegerPCM format = bits == 8 ? BrowserIntegerPCM::Unsigned8 : bits == -8 ? BrowserIntegerPCM::Signed8 :
            bits == 16 ? BrowserIntegerPCM::Signed16LE : BrowserIntegerPCM::Signed32LE;
        for (size_t i = 0; i < count; ++i) {
            sample->samples[i] = BrowserReadIntegerPCM(data + i * width, format);
        }
        sample->loopStart = loopStart < 0 ? 0 : std::min<size_t>(loopStart, sample->Frames() - 1);
        sample->loopEnd = loopEnd < 0 ? sample->Frames() : std::min<size_t>(size_t(loopEnd) + 1, sample->Frames());
        if (sample->loopEnd <= sample->loopStart) sample->loopEnd = sample->Frames();
        result.data = sample; return result;
    }
    void UnloadSound(SoundHandle handle) override {
        for (Voice &voice : voices) if (voice.sample == handle.data) Retire(voice);
        delete static_cast<Sample *>(handle.data);
    }
    unsigned GetSampleLength(SoundHandle handle) override {
        return handle.data ? static_cast<Sample *>(handle.data)->Frames() : 0;
    }
    unsigned GetMSLength(SoundHandle handle) override {
        return handle.data ? unsigned(QWORD(static_cast<Sample *>(handle.data)->Frames()) * 1000 /
            static_cast<Sample *>(handle.data)->rate) : 0;
    }
    SoundStream *CreateStream(SoundStreamCallback callback, int bytes, int flags, int rate, void *userdata) override {
        if (!callback || bytes <= 0 || bytes > 4 * 1024 * 1024 || rate < 1000 || rate > 192000) return nullptr;
        unsigned frameBytes = (flags & (SoundStream::Float | SoundStream::Bits32) ? 4 : flags & SoundStream::Bits8 ? 1 : 2) *
            (flags & SoundStream::Mono ? 1 : 2);
        if (bytes % frameBytes) return nullptr;
        BrowserStream *stream = new BrowserStream(this);
        stream->callback = callback; stream->userdata = userdata; stream->bytes = bytes; stream->flags = flags;
        stream->pcm.rate = rate; stream->pcm.channels = flags & SoundStream::Mono ? 1 : 2;
        stream->storage.resize((bytes + 3) / 4);
        streams.push_back(stream); return stream;
    }
    SoundStream *OpenStream(const char *filename, int flags, int offset, int length) override {
        if (!filename || length < 0 || length > 64 * 1024 * 1024) return nullptr;
        std::vector<unsigned char> data;
        const void *bytes = filename;
        if (offset >= 0) {
            FILE *file = fopen(filename, "rb");
            if (!file) return nullptr;
            if (!length) {
                fseek(file, 0, SEEK_END); long end = ftell(file);
                if (end < offset || end - offset > 64 * 1024 * 1024) { fclose(file); return nullptr; }
                length = end - offset;
            }
            data.resize(length);
            bool ok = fseek(file, offset, SEEK_SET) == 0 && fread(data.data(), 1, length, file) == size_t(length);
            fclose(file);
            if (!ok) return nullptr;
            bytes = data.data();
        }
        BrowserStream *stream = new BrowserStream(this);
        if (!BrowserDecodePCM(bytes, length, stream->pcm)) { delete stream; return nullptr; }
        stream->looping = flags & SoundStream::Loop;
        streams.push_back(stream); return stream;
    }
    FISoundChannel *StartSound(SoundHandle handle, float volume, int pitch, int flags,
        FISoundChannel *reuse) override {
        Sample *sample = static_cast<Sample *>(handle.data);
        if (!sample || !sample->Frames()) return nullptr;
        Voice *slot = nullptr;
        for (Voice &voice : voices) if (!voice.channel) { slot = &voice; break; }
        if (!slot) {
            slot = &*std::min_element(voices, voices + 256,
                [](const Voice &a, const Voice &b) { return a.volume < b.volume; });
            Retire(*slot);
        }
        double speed = snd_pitched ? std::max(1, pitch) / 128.0 : 1.0;
        double position = 0;
        if (reuse && (flags & SNDF_ABSTIME)) position = reuse->StartTime.Lo;
        else if (reuse && reuse->StartTime.AsOne && clock >= reuse->StartTime.AsOne)
            position = double(clock - reuse->StartTime.AsOne) * sample->rate / OutputRate * speed;
        if (position >= sample->Frames()) {
            if (flags & SNDF_LOOP) position = sample->loopStart + fmod(position - sample->loopStart,
                double(sample->loopEnd - sample->loopStart));
            else return nullptr;
        }
        slot->sample = sample; slot->position = position; slot->step = sample->rate * speed / OutputRate;
        slot->volume = Volume(volume); slot->flags = flags;
        slot->channel = reuse ? reuse : S_GetChannel(slot);
        slot->channel->SysChannel = slot;
        if (!reuse) slot->channel->StartTime.AsOne = clock;
        ++VoicesStarted; ++ActiveVoices;
        return slot->channel;
    }
    FISoundChannel *StartSound3D(SoundHandle handle, SoundListener *listener, float volume,
        FRolloffInfo *rolloff, float distanceScale, int pitch, int, const FVector3 &position,
        const FVector3 &velocity, int, int flags, FISoundChannel *reuse) override {
        FISoundChannel *channel = StartSound(handle, volume, pitch, flags, reuse);
        if (channel) {
            channel->Rolloff = *rolloff; channel->DistanceScale = distanceScale;
            UpdateSoundParams3D(listener, channel, flags & SNDF_AREA, position, velocity);
        }
        return channel;
    }
    void StopChannel(FISoundChannel *channel) override { if (Voice *voice = Find(channel)) Retire(*voice); }
    void ChannelVolume(FISoundChannel *channel, float value) override { if (Voice *voice = Find(channel)) voice->volume = Volume(value); }
    void MarkStartTime(FISoundChannel *channel) override { if (channel) channel->StartTime.AsOne = clock; }
    unsigned GetPosition(FISoundChannel *channel) override { Voice *voice = Find(channel); return voice ? unsigned(voice->position) : 0; }
    float GetAudibility(FISoundChannel *channel) override {
        Voice *voice = Find(channel);
        return voice && !voice->ended ? voice->volume * sfxVolume * std::max(voice->left, voice->right) : 0;
    }
    void Sync(bool value) override { synchronizing = value; }
    void SetSfxPaused(bool value, int slot) override {
        if (slot >= 0 && slot < 32) { if (value) pauseSlots |= 1u << slot; else pauseSlots &= ~(1u << slot); }
    }
    void SetInactive(EInactiveState value) override { inactive = value; }
    void UpdateSoundParams3D(SoundListener *listener, FISoundChannel *channel, bool area,
        const FVector3 &position, const FVector3 &) override {
        Voice *voice = Find(channel);
        if (!voice || !listener || !listener->valid) return;
        FVector3 delta = position - listener->position;
        float distance = float(sqrt(delta.LengthSquared()));
        if (distance < 0.001f) { voice->left = voice->right = 1; return; }
        float gain = S_GetRolloff(&channel->Rolloff, distance * channel->DistanceScale, false);
        float pan = Limit((-sin(listener->angle) * delta.X + cos(listener->angle) * delta.Z) / distance);
        if (area) pan *= std::min(1.f, distance / 32.f);
        voice->left = gain * sqrtf((1 - pan) * 0.5f);
        voice->right = gain * sqrtf((1 + pan) * 0.5f);
    }
    void UpdateListener(SoundListener *) override {}
    void UpdateSounds() override { for (Voice &voice : voices) if (voice.ended) Retire(voice); }
};

BrowserStream::~BrowserStream() { if (owner) owner->Remove(this); }
}

SoundRenderer *I_CreateBrowserSoundRenderer() { return new BrowserRenderer; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioDeviceCount() { return AudioDevices; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioCallbackCount() { return AudioCallbacks; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioMusicSamples() { return MusicSamples; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioSfxSamples() { return SfxSamples; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioVoicesStarted() { return VoicesStarted; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioVoicesFinished() { return VoicesFinished; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned I_BrowserAudioActiveVoices() { return ActiveVoices; }
