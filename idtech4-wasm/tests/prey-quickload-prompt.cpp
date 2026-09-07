#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <utility>
#include <vector>

// Fixture primitives: localized key names and a tiny UI recorder. Matching,
// material selection and the complete QuickLoad confirmation block are real.
class idStr {
public:
    std::string value;
    idStr() = default;
    idStr(const char* text) : value(text) {}
    int Icmp(const char* other) const {
        std::string a = value, b = other;
        std::transform(a.begin(), a.end(), a.begin(), [](unsigned char c) { return std::tolower(c); });
        std::transform(b.begin(), b.end(), b.begin(), [](unsigned char c) { return std::tolower(c); });
        return a.compare(b);
    }
    static void Copynz(char* dest, const char* source, int count) {
        std::snprintf(dest, count, "%s", source);
    }
    static void ToLower(char* text) {
        for (; *text; ++text) *text = std::tolower(static_cast<unsigned char>(*text));
    }
};
enum { K_F6 = 1, K_F8, K_F9, K_Q, K_MOUSE1, K_MOUSE2, K_MOUSE3, K_MWHEELDOWN, K_MWHEELUP, MAX_KEYS };
struct Key { idStr binding; };
static Key keys[MAX_KEYS];
class idKeyInput {
public:
    static int NumBinds(const char* binding);
    static const char* KeyNumToString(int code, bool) {
        static const char* names[] = {"", "F6", "F8", "F9", "Q", "MOUSE1", "MOUSE2", "MOUSE3", "MWHEELDOWN", "MWHEELUP"};
        return names[code];
    }
};
class idCommonLocal {
public:
    void MaterialKeyForBinding(const char* binding, char* material, char* key, bool& wide);
};
static idCommonLocal commonInstance;
static idCommonLocal* common = &commonInstance;
struct UI {
    std::map<std::string, int> ints;
    std::map<std::string, std::string> strings;
    int changed = 0;
    void SetStateInt(const char* key, int value) { ints[key] = value; }
    void SetStateBool(const char* key, bool value) { ints[key] = value; }
    void SetStateString(const char* key, const char* value) { strings[key] = value; }
    void StateChanged(int time) { if (time == 1234) changed++; }
};
struct Game { int GetTimeGroupTime(int group) { return group == 1 ? 1234 : 0; } };
static Game gameInstance;
static Game* game = &gameInstance;
static int Sys_Milliseconds() { return 5000; }
class idSessionLocal {
public:
    bool QuickLoad();
    UI* guiGameStatus = nullptr;
    bool reallyWantsLoad = false;
    int postSaveTimer = 0;
    static const int SAVE_TIME_BAIL = 4000;
};

#include "prey-quickload-prompt-production.h"

struct Case {
    const char* name;
    std::vector<std::pair<int, const char*>> binds;
    const char* key;
    const char* material;
    bool wide;
};
int main() {
    const char* narrow = "textures/interface/tips/key";
    const char* wide = "textures/interface/tips/keywide";
    const std::vector<Case> cases = {
        {"default-f9", {{K_F9, "loadgame quick"}}, "f9", wide, true},
        {"bare-command", {{K_F9, "loadgame"}}, "f9", wide, true},
        {"explicit-preferred", {{K_F6, "loadgame"}, {K_F9, "loadgame quick"}}, "f9", wide, true},
        {"custom-function-key", {{K_F8, "loadgame quick"}}, "f8", wide, true},
        {"custom-letter", {{K_Q, "loadgame quick"}}, "q", narrow, false},
        {"mouse-key", {{K_MOUSE1, "loadgame quick"}}, "", "textures/interface/tips/mouse1", false},
        {"mouse-bare-command", {{K_MOUSE2, "loadgame"}}, "", "textures/interface/tips/mouse2", false},
        {"wheel-key", {{K_MWHEELUP, "loadgame quick"}}, "", "textures/interface/tips/mouseup", false},
        {"case-insensitive", {{K_F9, "LOADGAME QUICK"}}, "f9", wide, true},
        {"unbound-console-invocation", {}, "", narrow, false},
        {"named-save-is-not-quickload", {{K_F9, "loadgame prey906a"}}, "", narrow, false}
    };
    int failed = 0;
    for (const auto& row : cases) {
        for (auto& key : keys) key.binding = idStr("");
        for (const auto& entry : row.binds) keys[entry.first].binding = idStr(entry.second);
        UI ui;
        idSessionLocal session;
        session.guiGameStatus = &ui;
        const bool advanced = session.QuickLoad();
        const bool passed = !advanced && session.reallyWantsLoad && session.postSaveTimer == 9000 &&
            ui.changed == 1 && ui.ints["messagetype"] == 2 && ui.ints["keywide"] == row.wide &&
            ui.strings["saveKey"] == row.key && ui.strings["keymaterial"] == row.material;
        failed += !passed;
        std::printf("{\"case\":\"%s\",\"passed\":%s,\"key\":\"%s\",\"material\":\"%s\"}\n",
            row.name, passed ? "true" : "false", ui.strings["saveKey"].c_str(), ui.strings["keymaterial"].c_str());
    }
    UI ui;
    idSessionLocal confirmed;
    confirmed.guiGameStatus = &ui;
    confirmed.reallyWantsLoad = true;
    const bool confirmationPassed = confirmed.QuickLoad() && ui.changed == 0 && confirmed.postSaveTimer == 0;
    idSessionLocal withoutUI;
    const bool noUIPassed = withoutUI.QuickLoad() && withoutUI.postSaveTimer == 0 && !withoutUI.reallyWantsLoad;
    std::printf("{\"case\":\"already-confirmed-falls-through\",\"passed\":%s}\n", confirmationPassed ? "true" : "false");
    std::printf("{\"case\":\"no-ui-falls-through\",\"passed\":%s}\n", noUIPassed ? "true" : "false");
    return failed + !confirmationPassed + !noUIPassed ? 1 : 0;
}
