#include <cassert>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <vector>

static int checks = 0, cases = 0;
#define CHECK(x) do { if (!(x)) throw std::runtime_error("check failed: " #x); ++checks; } while (0)
const int MAX_CLIENTS = 32;
struct idEntity {
    bool player = false;
    virtual ~idEntity() = default;
    bool IsType(int type) const { return player && type == 1; }
};
struct idPlayer : idEntity {
    static const int Type = 1;
    bool bot;
    explicit idPlayer(bool isBot = false) : bot(isBot) { player = true; }
    bool IsBot() const { return bot; }
};
struct Game {
    int time = 1000, numClients = MAX_CLIENTS;
    idEntity *entities[MAX_CLIENTS] = {};
} gameLocal;
#include "voting-enums.h"
class idMultiplayerGame {
public:
#include "voting-class-enums.h"
    vote_flags_t vote = VOTE_NONE;
    int voteExecTime = 0, voteTimeOut = 0;
    float yesVotes = 0, noVotes = 0;
    std::string voteValue;
    struct State { playerVote_t vote = PLAYER_VOTE_NONE; } playerState[MAX_CLIENTS];
    std::vector<vote_result_t> updates;
    int executed = 0;
    void ServerStartVote(int, vote_flags_t, const char *);
    void CheckVote();
    void ClientUpdateVote(vote_result_t result, int, int) { updates.push_back(result); }
    void ExecuteVote() { ++executed; }
};
#include "voting-production.h"

static void clear() {
    for (auto &entity : gameLocal.entities) { delete entity; entity = nullptr; }
    gameLocal.time = 1000;
}
static void human(int slot) { gameLocal.entities[slot] = new idPlayer; }
static void bot(int slot) { gameLocal.entities[slot] = new idPlayer(true); }
static void yes(idMultiplayerGame &mp, int slot) {
    CHECK(mp.playerState[slot].vote == PLAYER_VOTE_WAIT);
    mp.playerState[slot].vote = PLAYER_VOTE_YES; ++mp.yesVotes;
}
static void no(idMultiplayerGame &mp, int slot) {
    CHECK(mp.playerState[slot].vote == PLAYER_VOTE_WAIT);
    mp.playerState[slot].vote = PLAYER_VOTE_NO; ++mp.noVotes;
}
static bool passed(const idMultiplayerGame &mp) { return mp.voteExecTime != 0; }
int main(int argc, char **) {
    try {
        // Exact pre-fix start/check methods count these non-voting bots.
        clear(); human(0); human(1); bot(30); bot(31);
        idMultiplayerGame first;
        first.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
        yes(first, 1); first.CheckVote();
        if (argc > 1) {
            std::printf("{\"twoHumansTwoBotsVotePassed\":%s}\n", passed(first) ? "true" : "false");
            clear(); return passed(first) ? 0 : 1;
        }
#ifdef MOD_BOTS
        CHECK(passed(first));
        CHECK(first.playerState[30].vote == PLAYER_VOTE_NONE);
        CHECK(first.playerState[31].vote == PLAYER_VOTE_NONE);
        // Matrix: bot count never changes the existing human majority rules.
        for (int humans = 1; humans <= 8; ++humans) {
            for (int bots = 0; bots <= 32 - humans; ++bots) {
                for (int yesCount = 1; yesCount <= humans; ++yesCount) {
                    clear();
                    for (int i = 0; i < humans; ++i) human(i);
                    for (int i = 0; i < bots; ++i) bot(31 - i);
                    idMultiplayerGame mp;
                    mp.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
                    for (int i = 1; i < yesCount; ++i) yes(mp, i);
                    for (int i = 0; i < bots; ++i) CHECK(mp.playerState[31-i].vote == PLAYER_VOTE_NONE);
                    mp.CheckVote(); CHECK(passed(mp) == (yesCount * 2 > humans)); ++cases;
                }
            }
        }
        // Refilled bot in a former human WAIT slot must not hold a vote open.
        clear(); human(0); human(1); human(31);
        idMultiplayerGame refill;
        refill.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
        delete gameLocal.entities[1]; gameLocal.entities[1] = nullptr;
        delete gameLocal.entities[31]; bot(31);
        refill.CheckVote(); CHECK(passed(refill)); ++cases;
        // All human voters depart; leftover bot WAIT states cannot prevent abort.
        clear(); human(0); bot(31);
        idMultiplayerGame abort;
        abort.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
        abort.playerState[31].vote = PLAYER_VOTE_WAIT;
        delete gameLocal.entities[0]; gameLocal.entities[0] = nullptr;
        abort.CheckVote(); CHECK(abort.vote == idMultiplayerGame::VOTE_NONE);
        CHECK(abort.updates.back() == idMultiplayerGame::VOTE_ABORTED); ++cases;
#else
        // Builds without the bot module retain original behavior.
        CHECK(!passed(first)); ++cases;
#endif
        // Human-only behavior: tie waits, half-no fails, timeout fails, late
        // joining players do not vote, and passing execution remains deferred.
        clear(); human(0); human(1); gameLocal.entities[20] = new idEntity;
        idMultiplayerGame tie;
        tie.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
        tie.CheckVote(); CHECK(!passed(tie)); CHECK(tie.updates.empty());
        CHECK(tie.playerState[20].vote == PLAYER_VOTE_NONE);
        human(2); CHECK(tie.playerState[2].vote == PLAYER_VOTE_NONE);
        no(tie, 1); tie.CheckVote(); CHECK(tie.updates.back() == idMultiplayerGame::VOTE_FAILED); ++cases;
        idMultiplayerGame timeout;
        timeout.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
        gameLocal.time = timeout.voteTimeOut + 1; timeout.CheckVote();
        CHECK(timeout.updates.back() == idMultiplayerGame::VOTE_FAILED); ++cases;
        clear(); human(0); human(1);
        idMultiplayerGame execution;
        execution.ServerStartVote(0, idMultiplayerGame::VOTE_MAP, "game/mp/d3dm2");
        yes(execution, 1); execution.CheckVote(); CHECK(passed(execution));
        CHECK(execution.executed == 0); CHECK(execution.voteValue == "game/mp/d3dm2");
        gameLocal.time = execution.voteExecTime; execution.CheckVote(); CHECK(execution.executed == 0);
        ++gameLocal.time; execution.CheckVote(); CHECK(execution.executed == 1);
        CHECK(execution.vote == idMultiplayerGame::VOTE_NONE);
        CHECK(execution.updates.back() == idMultiplayerGame::VOTE_RESET); ++cases;
        clear();
        std::printf("{\"checks\":%d,\"cases\":%d,\"passed\":true}\n", checks, cases);
        return 0;
    } catch (const std::exception &error) {
        clear(); std::fprintf(stderr, "%s\n", error.what()); return 1;
    }
}
