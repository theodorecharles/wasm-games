#ifndef SOURCE_WASM_FACIAL_TIMING_H
#define SOURCE_WASM_FACIAL_TIMING_H

// Seven one-second engine summaries and seven client summaries per run.
// Keep the previous observation across windows; no allocation or frame logging.
struct SourceWasmFacialWindow {
    unsigned windows, events, repeats, backwards;
    double start, lastWall, lastClock, maxWallStep, maxClockStep;
    bool started;
    SourceWasmFacialWindow() : windows(0), events(0), repeats(0), backwards(0),
        start(0), lastWall(0), lastClock(0), maxWallStep(0), maxClockStep(0), started(false) {}
    bool Done() const { return windows >= 7; }
    bool Observe(double wall, double clock) {
        if (Done()) return false;
        if (!started) { start = lastWall = wall; lastClock = clock; started = true; }
        else {
            const double wallStep = wall - lastWall, clockStep = clock - lastClock;
            if (wallStep > maxWallStep) maxWallStep = wallStep;
            if (clockStep > maxClockStep) maxClockStep = clockStep;
            if (clockStep == 0) ++repeats;
            if (clockStep < 0) ++backwards;
            lastWall = wall; lastClock = clock;
        }
        ++events;
        return wall - start >= 1.0;
    }
    void Finish(double wall) {
        ++windows; events = repeats = backwards = 0;
        maxWallStep = maxClockStep = 0; start = wall;
    }
};

struct SourceWasmAudioClockSnapshot {
    unsigned callbacks, consumedFrames, maximumCallbackGapMs, cursor, active;
};
#ifdef __EMSCRIPTEN__
void SourceWasmFacialAudioStart();
void SourceWasmFacialAudioStop();
SourceWasmAudioClockSnapshot SourceWasmFacialAudioSnapshot();
#endif
#endif
