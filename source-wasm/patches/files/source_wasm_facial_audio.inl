#ifdef __EMSCRIPTEN__
static SDL_atomic_t sourceFacialAudioEnabled, sourceFacialAudioCallbacks,
    sourceFacialAudioFrames, sourceFacialAudioGap, sourceFacialAudioCursor;
static Uint32 sourceFacialLastCallback, sourceFacialFirstCallback;
static bool sourceFacialHadCallback;

void SourceWasmFacialAudioStart() { SDL_AtomicSet(&sourceFacialAudioEnabled, 1); }
void SourceWasmFacialAudioStop() { SDL_AtomicSet(&sourceFacialAudioEnabled, 0); }
SourceWasmAudioClockSnapshot SourceWasmFacialAudioSnapshot() {
    SourceWasmAudioClockSnapshot result = {
        unsigned(SDL_AtomicGet(&sourceFacialAudioCallbacks)),
        unsigned(SDL_AtomicGet(&sourceFacialAudioFrames)),
        unsigned(SDL_AtomicGet(&sourceFacialAudioGap)),
        unsigned(SDL_AtomicGet(&sourceFacialAudioCursor)),
        unsigned(SDL_AtomicGet(&sourceFacialAudioEnabled))
    };
    return result;
}
static void SourceWasmFacialAudioConsumed(int frames, int cursor) {
    if (!SDL_AtomicGet(&sourceFacialAudioEnabled)) return;
    const Uint32 now = SDL_GetTicks(); // local callback clock; no main-thread proxy/query
    if (!sourceFacialHadCallback) sourceFacialFirstCallback = now;
    if (now - sourceFacialFirstCallback >= 15000) { SourceWasmFacialAudioStop(); return; }
    if (sourceFacialHadCallback) {
        const Uint32 gap = now - sourceFacialLastCallback;
        if (gap > unsigned(SDL_AtomicGet(&sourceFacialAudioGap))) SDL_AtomicSet(&sourceFacialAudioGap, int(gap));
    }
    sourceFacialLastCallback = now;
    sourceFacialHadCallback = true;
    SDL_AtomicAdd(&sourceFacialAudioFrames, frames);
    SDL_AtomicSet(&sourceFacialAudioCursor, cursor);
    SDL_AtomicAdd(&sourceFacialAudioCallbacks, 1);
}
#endif
