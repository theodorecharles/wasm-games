#include <assert.h>
#include <string.h>
#include <AL/al.h>
#include <AL/alc.h>
#include <emscripten.h>

extern "C" EMSCRIPTEN_KEEPALIVE int Q4AudioProbe() {
    ALCdevice *device = alcOpenDevice(NULL);
    assert(device);
    ALCcontext *context = alcCreateContext(device, NULL);
    assert(context && alcMakeContextCurrent(context));
    assert(alcGetCurrentContext() == context);
    ALCint major = 0, minor = 0;
    alcGetIntegerv(device, ALC_MAJOR_VERSION, 1, &major);
    alcGetIntegerv(device, ALC_MINOR_VERSION, 1, &minor);
    assert(major == 1 && minor == 1);
    const ALCchar *devices = alcGetString(NULL, ALC_DEVICE_SPECIFIER);
    assert(devices && strcmp(devices, "WebAudio") == 0);
    assert(devices[strlen(devices) + 1] == '\0');
    assert(strcmp(alcGetString(NULL, ALC_DEFAULT_DEVICE_SPECIFIER), "WebAudio") == 0);
    assert(strcmp(alcGetString(device, ALC_DEVICE_SPECIFIER), "WebAudio") == 0);

    ALuint buffers[2], source;
    alGenBuffers(2, buffers);
    alGenSources(1, &source);
    assert(alIsBuffer(buffers[0]) && alIsSource(source));
    const ALshort samples[] = {0, 8192, -8192, 0};
    for (ALuint buffer : buffers) alBufferData(buffer, AL_FORMAT_MONO16, samples, sizeof(samples), 8000);
    alSourcei(source, AL_BUFFER, buffers[0]);
    ALint value = 0;
    alGetSourcei(source, AL_SOURCE_TYPE, &value);
    assert(value == AL_STATIC);
    alGetSourcei(source, AL_BUFFER, &value);
    assert(value == (ALint)buffers[0]);
    alSourcef(source, AL_GAIN, 0.5f);
    ALfloat gain = 0;
    alGetSourcef(source, AL_GAIN, &gain);
    assert(gain == 0.5f);
    alListenerf(AL_GAIN, 0.75f);
    alGetListenerf(AL_GAIN, &gain);
    assert(gain == 0.75f);
    alSource3f(source, AL_POSITION, 1, 2, 3);
    alSourcePlay(source);
    alSourcePause(source);
    alGetSourcei(source, AL_SOURCE_STATE, &value);
    assert(value == AL_PAUSED);
    alSourceStop(source);
    alSourcei(source, AL_BUFFER, 0);

    alSourceQueueBuffers(source, 2, buffers);
    alGetSourcei(source, AL_SOURCE_TYPE, &value);
    assert(value == AL_STREAMING);
    alGetSourcei(source, AL_BUFFERS_QUEUED, &value);
    assert(value == 2);
    alSourcePlay(source);
    alSourceStop(source);
    alGetSourcei(source, AL_BUFFERS_PROCESSED, &value);
    assert(value == 2);
    // Quake 4 polls queue state repeatedly before recycling stream buffers.
    alGetSourcei(source, AL_BUFFERS_PROCESSED, &value);
    assert(value == 2);
    ALuint unqueued[2] = {};
    alSourceUnqueueBuffers(source, 2, unqueued);
    assert(unqueued[0] == buffers[0] && unqueued[1] == buffers[1]);
    alGetSourcei(source, AL_BUFFERS_QUEUED, &value);
    assert(value == 0);
    alDeleteSources(1, &source);
    alDeleteBuffers(2, buffers);
    assert(alGetError() == AL_NO_ERROR);
    assert(!alIsSource(source) && !alIsBuffer(buffers[0]));
    alcMakeContextCurrent(NULL);
    alcDestroyContext(context);
    assert(!alcGetCurrentContext());
    assert(alcCloseDevice(device));
    return 1;
}
