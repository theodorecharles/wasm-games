// The production cache/lifecycle methods are extracted by the companion script.
// Dependencies below model ownership and typed save records, not collision math
// or the on-disk save format. Actual campaign saves are a separate Chrome gate.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <vector>
#include <variant>

struct idVec3 {
    float v[3];
    idVec3(float x=0, float y=0, float z=0): v{x,y,z} {}
    const float* ToFloatPtr() const { return v; }
    int GetDimension() const { return 3; }
};
struct idMat3 { float marker = 0; };
struct idBounds {
    idVec3 v[2];
    explicit idBounds(const idVec3& p = idVec3()): v{p,p} {}
    idBounds Expand(float n) const {
        auto b = *this;
        for (int i=0; i<3; i++) { b.v[0].v[i]-=n; b.v[1].v[i]+=n; }
        return b;
    }
    const idVec3& operator[](int i) const { return v[i]; }
};
struct idTraceModel {
    int type=1, numVerts=8, numEdges=12, numPolys=6;
    idBounds bounds;
    explicit idTraceModel(const idBounds& b=idBounds()): bounds(b) {}
    bool operator==(const idTraceModel& other) const {
        return std::memcmp(&bounds, &other.bounds, sizeof(bounds)) == 0;
    }
    void GetMassProperties(float, float& volume, idVec3& center, idMat3& inertia) const {
        volume = bounds[1].v[0]; center = idVec3(volume,0,0); inertia.marker=volume;
    }
};
struct idMath {
    static int FloatHash(const float* p, int n) {
        unsigned hash=0;
        for (int i=0; i<n; i++) { unsigned bits; std::memcpy(&bits,p+i,sizeof(bits)); hash ^= bits; }
        return static_cast<int>(hash);
    }
};
template<class T> struct idList {
    std::vector<T> items;
    int Num() const { return static_cast<int>(items.size()); }
    T& operator[](int i) { return items.at(i); }
    void SetNum(int n) { items.resize(n); }
    int Append(T value) { items.push_back(value); return Num()-1; }
    void DeleteContents(bool) { for (auto p:items) delete p; items.clear(); }
};
struct idHashIndex {
    struct Entry { int key, index; };
    std::vector<Entry> entries;
    void Free() { entries.clear(); }
    void Add(int key,int index) { entries.push_back({key,index}); }
    int First(int key) const { for(auto e:entries) if(e.key==key) return e.index; return -1; }
    int Next(int index) const {
        for (unsigned i=0;i<entries.size();i++) if(entries[i].index==index) {
            for (unsigned j=i+1;j<entries.size();j++) if(entries[j].key==entries[i].key) return entries[j].index;
            return -1;
        }
        return -1;
    }
};
using Value = std::variant<int,float,idVec3,idMat3,idTraceModel>;
struct idSaveGame {
    std::vector<Value> values;
    void WriteInt(int v) { values.emplace_back(v); }
    void WriteFloat(float v) { values.emplace_back(v); }
    void WriteVec3(const idVec3& v) { values.emplace_back(v); }
    void WriteMat3(const idMat3& v) { values.emplace_back(v); }
    void WriteTraceModel(const idTraceModel& v) { values.emplace_back(v); }
};
struct idRestoreGame {
    std::vector<Value> values;
    unsigned position=0;
    explicit idRestoreGame(const idSaveGame& save): values(save.values) {}
    template<class T> void Read(T& v) { v = std::get<T>(values.at(position++)); }
    void ReadInt(int& v) { Read(v); }
    void ReadFloat(float& v) { Read(v); }
    void ReadVec3(idVec3& v) { Read(v); }
    void ReadMat3(idMat3& v) { Read(v); }
    void ReadTraceModel(idTraceModel& v) { Read(v); }
    void RestoreObjects();
};
struct idClipModel {
    int traceModelIndex=-1, collisionModelHandle=0, renderModelHandle=-1;
    idBounds bounds;
    static void ClearTraceModelCache();
    static int AllocTraceModel(const idTraceModel&);
    static void FreeTraceModel(int);
    static idTraceModel* GetCachedTraceModel(int);
    static int GetTraceModelHashKey(const idTraceModel&);
    static void SaveTraceModels(idSaveGame*);
    static void RestoreTraceModels(idRestoreGame*);
    void LoadModel(const idTraceModel&);
    void RestoreTraceReference(idRestoreGame*);
};
struct clipSector_t {};
struct idClip {
    idClipModel defaultClipModel, temporaryClipModel;
    clipSector_t* clipSectors=nullptr;
    void InitDefault();
    void Shutdown();
    void FreeTraceModels();
    void RestoreTraceModels(idRestoreGame*);
};
struct { int calls=0; void Shutdown() { calls++; } } clipLinkAllocator;
struct {
    idClip clip;
    int warnings=0;
    void Warning(const char* text) {
        assert(std::strcmp(text,"idClipModel::FreeTraceModel: tried to free uncached trace model")==0);
        warnings++;
    }
} gameLocal;

#include "d3-trace-cache-production.h"

static idTraceModel shape(float size) {
    return idTraceModel(idBounds(idVec3(0,0,0)).Expand(size));
}
struct Scenario {
    const char* name;
    std::vector<float> savedShapes;
    std::vector<int> entityIndices;
    float scratch=0, preseed=0;
};
static bool restoreCycle(const Scenario& c) {
    auto& clip=gameLocal.clip;
    bool passed=true;
    gameLocal.warnings=0;
    if(c.preseed) idClipModel::FreeTraceModel(idClipModel::AllocTraceModel(shape(c.preseed)));
    clip.InitDefault();
    if(c.scratch) clip.temporaryClipModel.LoadModel(shape(c.scratch));
    idSaveGame save;
    save.WriteInt(c.savedShapes.size());
    for(unsigned i=0;i<c.savedShapes.size();i++) {
        save.WriteTraceModel(shape(c.savedShapes[i]));
        save.WriteFloat(100+i); save.WriteVec3(idVec3(200+i,0,0)); save.WriteMat3({300.0f+i});
    }
    idRestoreGame restore(save);
    restore.RestoreObjects();
    passed &= restore.position==restore.values.size();
    passed &= clip.temporaryClipModel.traceModelIndex==-1;
    const int defaultIndex=clip.defaultClipModel.traceModelIndex;
    const bool validDefault=defaultIndex>=0 && defaultIndex<traceModelCache.Num();
    passed &= validDefault;
    if(validDefault) passed &= *idClipModel::GetCachedTraceModel(defaultIndex)==shape(8);
    std::vector<idClipModel> entities(c.entityIndices.size());
    for(unsigned i=0;i<entities.size();i++) {
        idSaveGame reference; reference.WriteInt(c.entityIndices[i]);
        idRestoreGame entityRestore(reference);
        entities[i].RestoreTraceReference(&entityRestore);
    }
    std::vector<int> expected(traceModelCache.Num(),0);
    if(validDefault) expected[defaultIndex]++;
    for(int index:c.entityIndices) expected.at(index)++;
    for(int i=0;i<traceModelCache.Num();i++) passed &= traceModelCache[i]->refCount==expected[i];
    // Restoring the default may append an entry but must never renumber or
    // recompute saved entries used by entity indices and mass properties.
    idSaveGame written; idClipModel::SaveTraceModels(&written);
    idRestoreGame roundtrip(written);
    int count; roundtrip.ReadInt(count);
    passed &= count>=static_cast<int>(c.savedShapes.size());
    for(unsigned i=0;i<c.savedShapes.size();i++) {
        idTraceModel trm; float volume; idVec3 center; idMat3 inertia;
        roundtrip.ReadTraceModel(trm); roundtrip.ReadFloat(volume);
        roundtrip.ReadVec3(center); roundtrip.ReadMat3(inertia);
        passed &= trm==shape(c.savedShapes[i]);
        passed &= volume==100+i && center.v[0]==200+i && inertia.marker==300+i;
    }
    for(auto& entity:entities) idClipModel::FreeTraceModel(entity.traceModelIndex);
    clip.Shutdown();
    clip.Shutdown(); // Shutdown is also called on an already-cleared clip.
    passed &= gameLocal.warnings==0;
    passed &= clip.defaultClipModel.traceModelIndex==-1 && clip.temporaryClipModel.traceModelIndex==-1;
    for(int i=0;i<traceModelCache.Num();i++) passed &= traceModelCache[i]->refCount==0;
    idClipModel::ClearTraceModelCache();
    return passed;
}
int main() {
    const Scenario cases[] = {
        {"default-only",{8},{}},
        {"shared-default",{8,3},{0,0,1}},
        {"reordered-saved-cache",{3,8,5},{0,1,2,1}},
        {"default-absent",{3,5},{0,1}},
        {"empty-saved-cache",{},{}},
        {"distinct-scratch",{8,4},{1},4},
        {"shared-scratch",{8},{0},8},
        {"reordered-old-cache",{8,4},{0,1},0,5},
        {"duplicate-saved-shapes",{8,8,3},{0,1,2}},
    };
    int failed=0;
    for(auto& c:cases) {
        bool passed=true;
        for(int i=0;i<3;i++) passed &= restoreCycle(c);
        std::printf("{\"case\":\"%s\",\"cycles\":3,\"passed\":%s}\n",c.name,passed?"true":"false");
        if(!passed) failed++;
    }
    gameLocal.warnings=0;
    gameLocal.clip.InitDefault();
    gameLocal.clip.temporaryClipModel.LoadModel(shape(8));
    gameLocal.clip.Shutdown();
    bool fresh=gameLocal.warnings==0 && traceModelCache[0]->refCount==0;
    std::printf("{\"case\":\"fresh-map-shutdown\",\"cycles\":1,\"passed\":%s}\n",fresh?"true":"false");
    if(!fresh) failed++;
    // Keep the original warning guard effective; the repair must not hide it.
    idClipModel::FreeTraceModel(0);
    idClipModel::FreeTraceModel(-1);
    idClipModel::FreeTraceModel(900);
    bool guard=gameLocal.warnings==3;
    std::printf("{\"case\":\"invalid-reference-warning-guard\",\"cycles\":1,\"passed\":%s}\n",guard?"true":"false");
    if(!guard) failed++;
    idClipModel::ClearTraceModelCache();
    return failed?1:0;
}
