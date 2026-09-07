#include "decode.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdint.h>
#define DR_WAV_IMPLEMENTATION
#define DR_WAV_NO_STDIO
#include "dr_wav.h"
#define DR_FLAC_IMPLEMENTATION
#define DR_FLAC_NO_STDIO
#define DR_FLAC_NO_SIMD
#include "dr_flac.h"
#include <vorbis/vorbisfile.h>

namespace {
const size_t MaxSamples = 16 * 1024 * 1024;
struct Input { const unsigned char *bytes; size_t size, position; };
size_t Read(void *out, size_t size, size_t count, void *source) {
    Input &in = *static_cast<Input *>(source);
    if (!size) return 0;
    count = std::min(count, (in.size - in.position) / size);
    memcpy(out, in.bytes + in.position, size * count);
    in.position += size * count;
    return count;
}
int Seek(void *source, ogg_int64_t offset, int origin) {
    Input &in = *static_cast<Input *>(source);
    int64_t base = origin == SEEK_SET ? 0 : origin == SEEK_CUR ? in.position : in.size;
    if (origin != SEEK_SET && origin != SEEK_CUR && origin != SEEK_END) return -1;
    if (offset < -base || offset > int64_t(in.size) - base) return -1;
    in.position = size_t(base + offset);
    return 0;
}
long Tell(void *source) { return static_cast<Input *>(source)->position; }
bool Allocate(BrowserPCM &pcm, uint64_t frames, unsigned channels, unsigned rate) {
    if (!frames || channels < 1 || channels > 2 || rate < 1000 || rate > 192000 ||
        frames > MaxSamples / channels) return false;
    pcm.channels = channels;
    pcm.rate = rate;
    pcm.samples.resize(size_t(frames) * channels);
    return true;
}
}

bool BrowserDecodePCM(const void *bytes, size_t length, BrowserPCM &pcm) {
    pcm = BrowserPCM();
    if (!bytes || length < 12 || length > 64 * 1024 * 1024) return false;
    if (memcmp(bytes, "fLaC", 4) == 0) {
        drflac *file = drflac_open_memory(bytes, length, nullptr);
        if (!file) return false;
        bool ok = Allocate(pcm, file->totalPCMFrameCount, file->channels, file->sampleRate);
        if (ok) ok = drflac_read_pcm_frames_f32(file, pcm.Frames(), pcm.samples.data()) == pcm.Frames();
        drflac_close(file);
        if (!ok) return false;
    } else if (memcmp(bytes, "OggS", 4) == 0) {
        Input in = { static_cast<const unsigned char *>(bytes), length, 0 };
        ov_callbacks callbacks = { Read, Seek, nullptr, Tell };
        OggVorbis_File file;
        if (ov_open_callbacks(&in, &file, nullptr, 0, callbacks) != 0) return false;
        vorbis_info *info = ov_info(&file, -1);
        ogg_int64_t total = ov_pcm_total(&file, -1);
        bool ok = info && total > 0 && Allocate(pcm, uint64_t(total), info->channels, info->rate);
        size_t written = 0;
        while (ok && written < pcm.Frames()) {
            float **planar = nullptr;
            int section = 0;
            long frames = ov_read_float(&file, &planar,
                int(std::min<size_t>(4096, pcm.Frames() - written)), &section);
            info = ov_info(&file, section);
            if (frames <= 0 || !info || unsigned(info->channels) != pcm.channels ||
                unsigned(info->rate) != pcm.rate) { ok = false; break; }
            for (long i = 0; i < frames; ++i)
                for (unsigned c = 0; c < pcm.channels; ++c)
                    pcm.samples[(written + i) * pcm.channels + c] = planar[c][i];
            written += frames;
        }
        ov_clear(&file);
        if (!ok) return false;
    } else {
        drwav file;
        if (!drwav_init_memory(&file, bytes, length, nullptr)) return false;
        bool ok = Allocate(pcm, file.totalPCMFrameCount, file.channels, file.sampleRate);
        if (ok) ok = drwav_read_pcm_frames_f32(&file, pcm.Frames(), pcm.samples.data()) == pcm.Frames();
        drwav_uninit(&file);
        if (!ok) return false;
    }
    for (float &sample : pcm.samples) {
        if (!std::isfinite(sample)) return false;
        sample = std::max(-1.f, std::min(1.f, sample));
    }
    return !pcm.samples.empty();
}
