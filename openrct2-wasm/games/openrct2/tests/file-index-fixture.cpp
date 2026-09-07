// Controlled dependencies for the complete, unmodified native FileIndex class.
// The driver inserts that class between this prefix and file-index-main.cpp.
#include <algorithm>
#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#include "Numerics.hpp"

using utf8 = char;
#define LOG_VERBOSE(...) ((void)0)
struct InputFile { std::string path; uint64_t size; uint64_t modified; uint32_t value; };
std::vector<InputFile> world;
unsigned creates = 0;
class JobPool {
public:
    void AddTask(std::function<void()> task) { task(); }
    void Join(std::function<void()> progress) { progress(); }
};
namespace OpenRCT2 {
    struct Context { void SetProgress(uint32_t, uint32_t) {} };
    Context* GetContext() { static Context context; return &context; }
    namespace Console {
        template<class... Args> void WriteLine(const char*, Args...) {}
        namespace Error { template<class... Args> void WriteLine(const char*, Args...) {} }
    }
    namespace File { bool Exists(const std::string& name) { return std::filesystem::exists(name); } }
    enum class FileMode { open, write };
    class FileStream {
        std::fstream file;
    public:
        FileStream(const std::string& path, FileMode mode)
            : file(path, std::ios::binary | (mode == FileMode::open ? std::ios::in : (std::ios::out | std::ios::trunc))) {
            file.exceptions(std::ios::failbit | std::ios::badbit);
        }
        template<class T> T ReadValue() { T value; file.read(reinterpret_cast<char*>(&value), sizeof value); return value; }
        template<class T> void WriteValue(const T& value) { file.write(reinterpret_cast<const char*>(&value), sizeof value); }
    };
    class DataSerialiser {
        bool save;
        FileStream& stream;
    public:
        DataSerialiser(bool saving, FileStream& file) : save(saving), stream(file) {}
        void Item(const uint32_t& value) {
            if (save) stream.WriteValue(value);
            else const_cast<uint32_t&>(value) = stream.ReadValue<uint32_t>();
        }
    };
    class Scanner {
        std::vector<InputFile> files;
        size_t next = 0;
        struct FileInfo { uint64_t Size; uint64_t LastModified; } info{};
        std::string current;
    public:
        explicit Scanner(const std::string& root) {
            for (const auto& item : world) if (item.path.starts_with(root + "/")) files.push_back(item);
            std::sort(files.begin(), files.end(), [](const auto& a, const auto& b) { return a.path < b.path; });
        }
        bool Next() {
            if (next == files.size()) return false;
            const auto& file = files[next++]; info = {file.size, file.modified}; current = file.path; return true;
        }
        const auto& GetFileInfo() const { return info; }
        const std::string& GetPath() const { return current; }
    };
    namespace Path {
        std::string GetAbsolute(const std::string& name) { return name; }
        std::string Combine(const std::string& a, const std::string& b) { return a + "/" + b; }
        std::string GetDirectory(const std::string& name) { return std::filesystem::path(name).parent_path().string(); }
        void CreateDirectory(const std::string& name) { std::filesystem::create_directories(name); }
        std::unique_ptr<Scanner> ScanDirectory(const std::string& pattern, bool recurse) {
            assert(recurse); return std::make_unique<Scanner>(GetDirectory(pattern));
        }
    }
}
