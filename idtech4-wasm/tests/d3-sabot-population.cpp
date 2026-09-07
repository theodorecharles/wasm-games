#include <algorithm>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include <climits>

static int checks = 0, matrix = 0, transitions = 0;
#define CHECK(condition) do { if (!(condition)) throw std::runtime_error("check failed: " #condition); ++checks; } while (0)
template<class T> T Min(T a, T b) { return std::min(a, b); }
template<class T> T Max(T a, T b) { return std::max(a, b); }
const int MAX_CLIENTS = 32;
struct idEntity {
    bool player = false;
    virtual ~idEntity() = default;
    bool IsType(int type) const { return player && type == 1; }
};
struct idPlayer : idEntity {
    static const int Type = 1;
    bool bot = false, brain = true;
    int identity;
    idPlayer(bool isBot, int id) : bot(isBot), identity(id) { player = true; }
    bool IsBot() const { return bot; }
    bool IsBotAvailable() const { return bot && brain; }
};
struct CVar { int value = 2; int GetInteger() const { return value; } };
struct ServerInfo { int capacity = 8; int GetInt(const char *) const { return capacity; } };
struct Random { int RandomInt(int count) { CHECK(count > 0); return 0; } };
using idStrList = std::vector<std::string>;
struct Game {
    bool isMultiplayer = true, isServer = true;
    int time = 0;
    ServerInfo serverInfo;
    Random random;
    idEntity *entities[MAX_CLIENTS] = {};
} gameLocal;
class botAi {
public:
    static const int BOT_START_INDEX = 1, BOT_MAX_BOTS = MAX_CLIENTS - 1;
    struct Slot { bool inUse = false; };
    static Slot bots[MAX_CLIENTS];
    static CVar harm_si_autoFillBots;
    static bool available, allow, failSpawn, haveDefinitions;
    static int allowCalls, spawnCalls, removed;
    static bool IsAvailable() { return available; }
    static bool AllowBotOperation() { ++allowCalls; return allow; }
    static int GetBotDefs(idStrList &definitions) { if (haveDefinitions) definitions.push_back("bot_sabot_tinman"); return definitions.size(); }
    static idPlayer *FindBotClient(int slot);
    static int FindIdleBotSlot();
    static int PopulationTarget(int requested, int maximum, int humans);
    static void MaintainPopulation();
    static bool RemoveBot(int slot) {
        CHECK(slot >= BOT_START_INDEX && slot < MAX_CLIENTS);
        auto *player = FindBotClient(slot); CHECK(player && player->IsBot());
        delete player; gameLocal.entities[slot] = nullptr; bots[slot].inUse = false; ++removed;
        return true;
    }
    static int AddBot(const std::string &) {
        ++spawnCalls;
        if (failSpawn) return -1;
        const int slot = FindIdleBotSlot();
        if (slot >= MAX_CLIENTS) return -1;
        CHECK(!gameLocal.entities[slot]);
        gameLocal.entities[slot] = new idPlayer(true, 1000 + spawnCalls);
        bots[slot].inUse = true;
        return slot;
    }
};
botAi::Slot botAi::bots[MAX_CLIENTS]; CVar botAi::harm_si_autoFillBots;
bool botAi::available = true, botAi::allow = true, botAi::failSpawn = false, botAi::haveDefinitions = true;
int botAi::allowCalls = 0, botAi::spawnCalls = 0, botAi::removed = 0;
#define BOT_MAX_NUM (botAi::BOT_START_INDEX + botAi::BOT_MAX_BOTS)
#define BOT_ENABLED() (gameLocal.isMultiplayer && gameLocal.isServer && botAi::IsAvailable())
#include "population-production.h"

static void clear() {
    for (int i = 0; i < MAX_CLIENTS; ++i) { delete gameLocal.entities[i]; gameLocal.entities[i] = nullptr; botAi::bots[i].inUse = false; }
    gameLocal.serverInfo.capacity = 8; gameLocal.isMultiplayer = true; gameLocal.isServer = true;
    botAi::harm_si_autoFillBots.value = 2;
    botAi::available = botAi::allow = botAi::haveDefinitions = true; botAi::failSpawn = false;
    botAi::allowCalls = botAi::spawnCalls = botAi::removed = 0;
}
static void tick(int amount = 1001) { gameLocal.time += amount; botAi::MaintainPopulation(); ++transitions; }
static int bots() { int count = 0; for (int i = 0; i < MAX_CLIENTS; i++) { auto *p = botAi::FindBotClient(i); if (p && p->IsBotAvailable()) ++count; } return count; }
static void human(int slot) { CHECK(!gameLocal.entities[slot]); gameLocal.entities[slot] = new idPlayer(false, slot); }
static void humansIntact(int count) { for (int i = 0; i < count; i++) { auto *p = botAi::FindBotClient(i); CHECK(p && !p->IsBot() && p->identity == i); } }
int main() {
    try {
        for (int request : {-1, 0, 1, 2, 31, 32, INT_MAX}) for (int capacity : {-1, 0, 1, 8, 16, 32, 33, INT_MAX}) for (int humans = 0; humans <= 33; humans++) {
            const int seats = std::clamp(capacity, 0, 32);
            const int expected = request == 0 ? -1 : std::min(std::max(0, seats - humans), request < 0 ? 31 : std::min(request, 31));
            CHECK(botAi::PopulationTarget(request, capacity, humans) == expected); ++matrix;
        }
        clear(); tick(); CHECK(bots() == 2);
        for (int i = 0; i < 8; i++) {
            human(i); tick(1); humansIntact(i + 1);
            CHECK(bots() == std::min(2, 8 - i - 1));
            CHECK(bots() + i + 1 <= 8);
        }
        delete gameLocal.entities[7]; gameLocal.entities[7] = nullptr; tick(); CHECK(bots() == 1); humansIntact(7);
        delete gameLocal.entities[6]; gameLocal.entities[6] = nullptr; tick(); CHECK(bots() == 2); humansIntact(6);
        clear(); for (int i = 0; i < 8; i++) human(i); tick(); CHECK(bots() == 0); humansIntact(8); // humans before bots
        clear(); human(0); tick(); CHECK(bots() == 2);
        botAi::FindBotClient(30)->brain = false; tick(); CHECK(bots() == 2); CHECK(botAi::removed == 1); humansIntact(1);
        botAi::RemoveBot(30); botAi::RemoveBot(31); tick(); CHECK(bots() == 2); humansIntact(1);
        // A full map reset drops entities and rewinds time; refill is not delayed
        // by the previous map's retry clock.
        clear(); gameLocal.time = 0; botAi::MaintainPopulation(); CHECK(bots() == 2);
        clear(); human(30); gameLocal.entities[31] = new idEntity; tick(); CHECK(bots() == 2);
        CHECK(!botAi::FindBotClient(30)->IsBot()); CHECK(gameLocal.entities[31] && !botAi::FindBotClient(31));
        CHECK(botAi::FindBotClient(-1) == nullptr && botAi::FindBotClient(32) == nullptr);
        clear(); botAi::harm_si_autoFillBots.value = -1; gameLocal.serverInfo.capacity = 32; tick(); CHECK(bots() == 31); CHECK(!gameLocal.entities[0]);
        human(0); tick(); CHECK(bots() == 31); humansIntact(1);
        gameLocal.serverInfo.capacity = 1; tick(1); CHECK(bots() == 0); humansIntact(1);
        clear(); tick(); botAi::harm_si_autoFillBots.value = 0; gameLocal.serverInfo.capacity = 1; tick(); CHECK(bots() == 2); // manual means no automatic changes
        for (int disabled = 0; disabled < 3; disabled++) {
            clear(); if (disabled == 0) gameLocal.isMultiplayer = false;
            if (disabled == 1) gameLocal.isServer = false; if (disabled == 2) botAi::available = false;
            tick(); CHECK(bots() == 0); CHECK(botAi::allowCalls == 0);
        }
        for (int failure = 0; failure < 3; failure++) {
            clear(); if (failure == 0) botAi::allow = false; if (failure == 1) botAi::failSpawn = true; if (failure == 2) botAi::haveDefinitions = false;
            tick(); const int first = botAi::allowCalls;
            for (int i = 0; i < 9; i++) tick(100);
            CHECK(botAi::allowCalls == first); CHECK(bots() == 0);
            tick(100); CHECK(botAi::allowCalls == first + 1);
            botAi::allow = botAi::haveDefinitions = true; botAi::failSpawn = false; tick(); CHECK(bots() == 2);
        }
        clear();
        std::printf("{\"checks\":%d,\"targetMatrix\":%d,\"maintenanceSteps\":%d,\"passed\":true}\n", checks, matrix, transitions);
        return 0;
    } catch (const std::exception &error) { clear(); std::fprintf(stderr, "%s\n", error.what()); return 1; }
}
