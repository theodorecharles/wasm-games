#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <array>
#include <vector>
#include <stdexcept>
#include <string>
#include <algorithm>

using byte = unsigned char;
#define ID_INLINE inline
class idVec3;
class idDict;
struct netadr_t;
struct ErrorSink {
    [[noreturn]] void Error(const char *text, ...) { throw std::runtime_error(text); }
    [[noreturn]] void FatalError(const char *text, ...) { throw std::runtime_error(text); }
    void Warning(const char *, ...) {}
    void Printf(const char *, ...) {}
};
namespace idLib { static ErrorSink sink; static ErrorSink *common = &sink; }
#include "wire-bits.h"
#include "wire-usercmd.h"
class botAi {
public:
    static const int BOT_START_INDEX, BOT_MAX_BOTS;
    struct Slot { bool inUse; };
    static Slot bots[32];
    static void WriteUserCmdsToSnapshot(idBitMsg &msg);
    static void ReadUserCmdsFromSnapshot(const idBitMsg &msg);
};
#include "wire-constants.h"
struct GameFixture : ErrorSink {
    int numClients = MAX_CLIENTS;
    uint64_t before = UINT64_C(0xABCDEF0123456789);
    usercmd_t usercmds[MAX_CLIENTS];
    uint64_t after = UINT64_C(0x9988776655443322);
} gameLocal;
botAi::Slot botAi::bots[32];
#include "wire-bots.h"

static int cases = 0, truncations = 0, roundTrips = 0, malformed = 0, fuzzed = 0;
#define CHECK(condition) do { if (!(condition)) throw std::runtime_error("check failed: " #condition); ++cases; } while (0)
using Commands = std::array<usercmd_t, MAX_CLIENTS>;
static Commands commands() { Commands result; std::memcpy(result.data(), gameLocal.usercmds, sizeof(gameLocal.usercmds)); return result; }
static void seed(int salt = 0) {
    std::memset(gameLocal.usercmds, 0x35 + (salt & 7), sizeof(gameLocal.usercmds));
    std::memset(botAi::bots, 0, sizeof(botAi::bots));
    gameLocal.numClients = MAX_CLIENTS;
}
static void canaries() {
    CHECK(gameLocal.before == UINT64_C(0xABCDEF0123456789));
    CHECK(gameLocal.after == UINT64_C(0x9988776655443322));
}
static bool rejected(const idBitMsg &msg) {
    try { botAi::ReadUserCmdsFromSnapshot(msg); return false; }
    catch (const std::runtime_error &) { return true; }
}
static usercmd_t patterned(int n) {
    usercmd_t cmd = {};
    const short values[] = {-32768, -1, 0, 1, 32767};
    const signed char movement[] = {-128, -1, 0, 1, 127};
    cmd.buttons = static_cast<byte>(n * 37);
    cmd.mx = values[n % 5]; cmd.my = values[(n + 1) % 5];
    cmd.forwardmove = movement[n % 5]; cmd.rightmove = movement[(n + 1) % 5]; cmd.upmove = movement[(n + 2) % 5];
    for (int i = 0; i < 3; i++) cmd.angles[i] = values[(n + i + 2) % 5];
    return cmd;
}
static void writeRecord(idBitMsg &msg, int slot, const usercmd_t &cmd) {
    msg.WriteBits(slot, 5); msg.WriteByte(cmd.buttons); msg.WriteShort(cmd.mx); msg.WriteShort(cmd.my);
    msg.WriteChar(cmd.forwardmove); msg.WriteChar(cmd.rightmove); msg.WriteChar(cmd.upmove);
    for (int i = 0; i < 3; i++) msg.WriteShort(cmd.angles[i]);
}
static void roundTrip(int count, int offset) {
    seed();
    byte buffer[1024]; idBitMsg msg; msg.Init(buffer, sizeof(buffer)); msg.BeginWriting();
    if (offset) msg.WriteBits((1 << offset) - 1, offset);
    for (int i = 0; i < count; i++) {
        const int slot = 31 - i; botAi::bots[slot].inUse = true;
        gameLocal.usercmds[slot] = patterned(i);
    }
    const Commands sent = commands();
    botAi::WriteUserCmdsToSnapshot(msg);
    CHECK(msg.GetNumBitsWritten() == offset + 5 + count * 117);
    msg.WriteBits(0x5A5, 11); // following entity stream must stay aligned
    seed(1); const Commands initial = commands();
    msg.BeginReading(); if (offset) CHECK(msg.ReadBits(offset) == (1 << offset) - 1);
    botAi::ReadUserCmdsFromSnapshot(msg);
    CHECK(msg.GetNumBitsRead() == offset + 5 + count * 117);
    CHECK(msg.ReadBits(11) == 0x5A5);
    for (int slot = 0; slot < MAX_CLIENTS; slot++) {
        usercmd_t expected = initial[slot];
        if (slot >= MAX_CLIENTS - count) {
            const auto &sentCmd = sent[slot];
            expected.buttons = sentCmd.buttons; expected.mx = sentCmd.mx; expected.my = sentCmd.my;
            expected.forwardmove = sentCmd.forwardmove; expected.rightmove = sentCmd.rightmove; expected.upmove = sentCmd.upmove;
            std::memcpy(expected.angles, sentCmd.angles, sizeof(expected.angles));
        }
        CHECK(std::memcmp(&expected, &gameLocal.usercmds[slot], sizeof(expected)) == 0);
    }
    canaries(); ++roundTrips;
}
int main(int argc, char **argv) {
    try {
        if (argc == 2 && std::string(argv[1]) == "--empty-prefix-only") {
            byte byte_ = 0; idBitMsg msg; msg.Init(&byte_, 1); msg.SetSize(0); msg.BeginReading();
            const bool failed = rejected(msg);
            std::printf("{\"emptyPrefixRejected\":%s}\n", failed ? "true" : "false");
            return failed ? 0 : 1;
        }
        for (int count = 0; count <= 31; count++) for (int offset = 0; offset < 8; offset++) roundTrip(count, offset);
        // Align each cut to a byte boundary using a varying prefix so every
        // possible remaining-bit length, not just every byte, is exercised.
        for (int count : {1, 2, 31}) for (int cut = 0; cut < 5 + count * 117; cut++) {
            seed(); const Commands initial = commands();
            byte buffer[1024]; idBitMsg msg; msg.Init(buffer, sizeof(buffer)); msg.BeginWriting();
            const int offset = (8 - cut % 8) % 8;
            if (offset) msg.WriteBits(0, offset);
            msg.WriteBits(count, 5);
            for (int slot = 1; slot <= count; slot++) writeRecord(msg, slot, patterned(slot));
            msg.SetSize((offset + cut) / 8); msg.BeginReading(); if (offset) msg.ReadBits(offset);
            CHECK(msg.GetRemainingReadBits() == cut);
            CHECK(rejected(msg));
            CHECK(std::memcmp(initial.data(), gameLocal.usercmds, sizeof(gameLocal.usercmds)) == 0);
            canaries(); ++truncations;
        }
        for (int slot = 1; slot < MAX_CLIENTS; slot++) {
            seed(); const auto initial = commands();
            byte buffer[128]; idBitMsg msg; msg.Init(buffer, sizeof(buffer)); msg.BeginWriting();
            msg.WriteBits(2, 5); writeRecord(msg, slot, patterned(slot)); writeRecord(msg, slot, patterned(slot + 1));
            msg.BeginReading(); CHECK(rejected(msg));
            CHECK(std::memcmp(&initial[0], &gameLocal.usercmds[0], sizeof(usercmd_t)) == 0);
            canaries(); ++malformed;
        }
        for (int position = 0; position < 3; position++) {
            seed(); const auto initial = commands();
            byte buffer[128]; idBitMsg msg; msg.Init(buffer, sizeof(buffer)); msg.BeginWriting(); msg.WriteBits(3, 5);
            for (int n = 0; n < 3; n++) writeRecord(msg, n == position ? 0 : n + 1, patterned(n));
            msg.BeginReading(); CHECK(rejected(msg));
            CHECK(std::memcmp(&initial[0], &gameLocal.usercmds[0], sizeof(usercmd_t)) == 0);
            canaries(); ++malformed;
        }
        uint32_t random = 0x1D3B075;
        auto next = [&]() { random ^= random << 13; random ^= random >> 17; random ^= random << 5; return random; };
        for (int n = 0; n < 10000; n++) {
            seed(); const auto initial = commands();
            const int length = next() % 513; std::vector<byte> bytes(std::max(1, length));
            for (auto &value : bytes) value = static_cast<byte>(next());
            idBitMsg msg; msg.Init(bytes.data(), bytes.size()); msg.SetSize(length); msg.BeginReading();
            rejected(msg);
            CHECK(std::memcmp(&initial[0], &gameLocal.usercmds[0], sizeof(usercmd_t)) == 0);
            canaries(); ++fuzzed;
        }
        std::printf("{\"checks\":%d,\"roundTrips\":%d,\"bitTruncations\":%d,\"invalidSlotsOrDuplicates\":%d,\"fuzzed\":%d,\"passed\":true}\n", cases, roundTrips, truncations, malformed, fuzzed);
        return 0;
    } catch (const std::exception &error) { std::fprintf(stderr, "%s\n", error.what()); return 1; }
}
