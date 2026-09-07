#include "idlib/precompiled.h"
#include "renderer/tr_local.h"
#include "renderer/Model_local.h"
#include <emscripten.h>
#include "q4-shadow-policy.h"

// Test-only side module. The builders, SIMD projection and tri-surf allocation
// below are the actual linked engine, not copied implementations or a GPU test.
static int CheckProjection(bool silTrace, bool vertexProgram) {
    idRenderEntityLocal entity;
    memset(entity.modelMatrix, 0, sizeof(entity.modelMatrix));
    entity.modelMatrix[0] = entity.modelMatrix[5] = entity.modelMatrix[10] = entity.modelMatrix[15] = 1;
    entity.modelMatrix[12] = 10;
    entity.modelMatrix[13] = -4;
    entity.modelMatrix[14] = 1;
    idRenderLightLocal light;
    light.globalLightOrigin.Set(12, -1, 6); // local origin (2, 3, 5)
    idDrawVert verts[4]{};
    verts[0].xyz.Set(4, 7, 9);
    verts[1].xyz.Set(5, 7, 9);
    verts[2].xyz.Set(4, 8, 9);
    verts[3].xyz.Set(99, 99, 99); // unused, must not enter the CPU cache
    rvSilTraceVertT trace[4]{};
    for (int i = 0; i < 4; ++i) trace[i].xyzw.Set(verts[i].xyz.x, verts[i].xyz.y, verts[i].xyz.z, 1);
    glIndex_t indexes[3] = {0, 1, 2};
    silEdge_t edges[3] = {{0, 1, 0, 1}, {0, 1, 1, 2}, {0, 1, 2, 0}};
    byte facing[2] = {0, 1};
    srfCullInfo_t cull{};
    cull.facing = facing;
    cull.cullBits = LIGHT_CULL_ALL_FRONT;
    srfTriangles_t tri{};
    tri.numVerts = 4;
    tri.numIndexes = 3;
    tri.verts = silTrace ? NULL : verts;
    tri.indexes = tri.silIndexes = indexes;
    tri.numSilEdges = 3;
    tri.silEdges = edges;
    if (silTrace) tri.silTraceVerts = reinterpret_cast<decltype(tri.silTraceVerts)>(trace);
    srfTriangles_t *shadow = R_CreateTurboShadowVolumeForSurface(&entity, &tri, &light, cull);
    if (!shadow) return -1;
    int result = 1;
    if (vertexProgram) {
        if (shadow->shadowVertexes != NULL || shadow->numVerts != 8) result = -2;
    } else {
        if (!shadow->shadowVertexes || shadow->numVerts != 6 || shadow->primBatchMesh != NULL) result = -3;
        if (result == 1) {
            for (int i = 0; i < 3; ++i) {
                const idVec4 &near = shadow->shadowVertexes[i * 2].xyz;
                const idVec4 &far = shadow->shadowVertexes[i * 2 + 1].xyz;
                if (near.ToVec3() != verts[i].xyz || near.w != 1 || far.w != 0 ||
                    far.ToVec3() != verts[i].xyz - idVec3(2, 3, 5)) result = -4;
            }
        }
    }
    if (shadow->numIndexes != 24 || shadow->numShadowIndexesNoCaps != 18 ||
        shadow->numShadowIndexesNoFrontCaps != 24 || shadow->shadowCapPlaneBits != SHADOW_CAP_INFINITE) result = -5;
    for (int i = 0; i < shadow->numIndexes; ++i) {
        if (shadow->indexes[i] >= static_cast<unsigned>(shadow->numVerts)) result = -6;
    }
    const glIndex_t caps[6] = {4, 2, 0, 1, 3, 5};
    if (memcmp(shadow->indexes + 18, caps, sizeof(caps)) != 0) result = -7;
    R_ReallyFreeStaticTriSurf(shadow);
    return result;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4ShadowProjectionProbe() {
    idLib::common = common;
    idLib::sys = sys;
    idLib::cvarSystem = cvarSystem;
    idLib::fileSystem = fileSystem;
    idStr::InitMemory();
    cvarSystem->Init();
    idCVar::RegisterStaticVars();
    idSIMD::Init();
    R_InitTriSurfData();
    tr.backEndRenderer = BE_ARB2;
    tr.backEndRendererHasVertexPrograms = true; // GLSL lighting remains capable
    r_useShadowVertexProgram.SetBool(true);
    glConfig.ARBVertexProgramAvailable = false; // actual browser capability
    int result = CheckProjection(false, false);
    if (result != 1) return result;
    result = CheckProjection(true, false);
    if (result != 1) return result - 10;
    // The desktop-capable policy still selects the existing GPU cache layout.
    glConfig.ARBVertexProgramAvailable = true;
    result = CheckProjection(false, true);
    if (result != 1) return result - 20;
    r_useShadowVertexProgram.SetBool(false);
    result = CheckProjection(false, false);
    if (result != 1) return result - 30;
    if (!tr.backEndRendererHasVertexPrograms) return -40;
    R_ShutdownTriSurfData();
    idSIMD::Shutdown();
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int Q4PackedRuntimePolicyProbe() {
    // Extracted production model-boundary selector, compiled for Emscripten.
    // This proves selection, not an animated retail character/GPU rendering.
    return R_MD5R_UsePackedRuntimeSurfaces();
}
