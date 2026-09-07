// Exercise the shared OpenAL contract against Prey's real worker bridge.
#define Q4AudioProbe PreyAudioProbe
#include "q4-audio.cpp"

extern "C" EMSCRIPTEN_KEEPALIVE int PreyDeviceProbe() {
    ALCdevice *device=alcOpenDevice(NULL);
    if (!device) return 0;
    ALCcontext *context=alcCreateContext(device,NULL);
    const int available=context && alcMakeContextCurrent(context);
    alcMakeContextCurrent(NULL);
    if (context) alcDestroyContext(context);
    alcCloseDevice(device);
    return available;
}

static ALuint voiceBuffer,voiceSource;
extern "C" EMSCRIPTEN_KEEPALIVE int PreyVoiceStart() {
    ALCdevice *device=alcOpenDevice(NULL);
    ALCcontext *context=alcCreateContext(device,NULL);
    assert(device && context && alcMakeContextCurrent(context));
    // A quarter-second non-looping PCM voice, with real elapsed-time polling.
    ALshort samples[2000]={};
    samples[0]=8192; samples[1]=-8192;
    alGenBuffers(1,&voiceBuffer); alGenSources(1,&voiceSource);
    alBufferData(voiceBuffer,AL_FORMAT_MONO16,samples,sizeof(samples),8000);
    alSourcei(voiceSource,AL_BUFFER,voiceBuffer); alSourcePlay(voiceSource);
    ALint state=0; alGetSourcei(voiceSource,AL_SOURCE_STATE,&state);
    return state==AL_PLAYING;
}
extern "C" EMSCRIPTEN_KEEPALIVE int PreyVoiceFinished() {
    ALint state=0; alGetSourcei(voiceSource,AL_SOURCE_STATE,&state);
    alDeleteSources(1,&voiceSource); alDeleteBuffers(1,&voiceBuffer);
    return state==AL_STOPPED && alGetError()==AL_NO_ERROR;
}
