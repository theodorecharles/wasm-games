#include <cassert>
#include <cstdint>
#include <cstdio>
#include <initializer_list>
#include "wasm_timing.h"

using Bit32u = uint32_t;
using Bit32s = int32_t;
using Bit64s = int64_t;
using Bitu = uint32_t;
#define GCC_UNLIKELY(value) (value)
#define CPU_CYCLES_LOWER_LIMIT 200
#define wrap_delay(value) ((void)(value))

static double hostTime = 0;
static Bit32u GetTicks() { return static_cast<Bit32u>(hostTime); }
static double emscripten_get_now() { return hostTime; }
static Bit32u ticksRemain = 0, ticksLast = 0, ticksAdded = 0, ticksScheduled = 0;
static Bit32s ticksDone = 0;
static bool ticksLocked = false;
static bool CPU_CycleAutoAdjust = true, CPU_SkipCycleAutoAdjust = false;
static Bit32s CPU_CycleMax = 3000, CPU_CyclePercUsed = 100, CPU_CycleLimit = 60000;
static Bit64s CPU_IODelayRemoved = 0;
static WasmIdleAccounting wasm_idle;
#include "governor-production.h"

static int runGovernor(double browserDelay, int initialCycles, bool automatic) {
    hostTime = 0;
    ticksRemain = ticksLast = ticksAdded = ticksScheduled = 0;
    ticksDone = 0;
    CPU_CycleAutoAdjust = automatic;
    CPU_CycleMax = initialCycles;
    wasm_idle.Reset();
    Bit32u lastYield = 0;
    while (hostTime < 15000) {
        if (GetTicks() - lastYield >= 10) {
            lastYield = GetTicks();
            const double start = hostTime;
            hostTime += browserDelay;
            wasm_idle.AddYield(start, hostTime);
        }
        // This synthetic host can interpret 50,000 cycles per millisecond.
        // Consume the guest ticks scheduled by the real governor, then idle
        // until the host clock advances, just as the outer machine loop does.
        while (ticksRemain > 0) {
            hostTime += static_cast<double>(CPU_CycleMax) / 50000.0;
            --ticksRemain;
        }
        increaseticks();
        if (!ticksRemain) hostTime += 0.01;
    }
    return CPU_CycleMax;
}

int main() {
    WasmIdleAccounting idle;
    idle.BeginIdle(0.25);
    idle.BeginIdle(1.0); // repeated polls must not reset the start
    idle.AddYield(1.0, 5.0); // overlapping yield must not be counted twice
    idle.EndIdle(5.5);
    assert(idle.ConsumeMilliseconds() == 5);
    idle.AddYield(6.0, 6.5);
    assert(idle.ConsumeMilliseconds() == 0);
    idle.AddYield(7.0, 7.5);
    assert(idle.ConsumeMilliseconds() == 1); // fractions survive consumption
    idle.BeginIdle(8.0);
    idle.Reset();
    idle.EndIdle(100.0);
    assert(idle.ConsumeMilliseconds() == 0);

    for (double delay : {1.0, 4.0}) {
        const int underloaded = runGovernor(delay, 3000, true);
        const int overloaded = runGovernor(delay, 200000, true);
        const int fixed = runGovernor(delay, 12345, false);
        std::printf("delay=%.0f ms: auto low=%d, auto high=%d, fixed=%d\n", delay, underloaded, overloaded, fixed);
        std::fflush(stdout);
        assert(underloaded >= 15000 && underloaded < CPU_CycleLimit);
        assert(overloaded >= 15000 && overloaded < CPU_CycleLimit);
        assert(underloaded - overloaded < 1000 && overloaded - underloaded < 1000);
        assert(fixed == 12345);
    }
}
