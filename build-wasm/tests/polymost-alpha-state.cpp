// Extracted native wrappers + real Emscripten compatibility state. The WebGL
// sink records uploads only; real fragment/depth behavior is tested separately.
#define GL_GLEXT_PROTOTYPES 1
#include <GL/gl.h>
#include <emscripten.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <unordered_map>

struct intHash { int count; std::unordered_map<int,int> *values; };
static void inthash_init(intHash *h) { h->values = new std::unordered_map<int,int>; }
static void inthash_free(intHash *h) { delete h->values; h->values = nullptr; }
static int inthash_find(intHash *h, int key) { auto i=h->values->find(key); return i == h->values->end() ? -1 : i->second; }
static void inthash_add(intHash *h, int key, int value, int) { (*h->values)[key] = value; }
#define MAXTEXUNIT (GL_TEXTURE0+5)
#define TEXUNIT_INDEX_FROM_NAME(i) ((i)-GL_TEXTURE0)
#define SAMPLER_INVALID 0xffffffff
#define Bmemset std::memset
struct BuildGLState { intHash state[5]; GLuint currentBoundSampler[5]; GLuint currentShaderProgramID; int fullReset; };
static BuildGLState gl;
static void buildgl_bindSamplerObject(int, int) {}
extern "C" void build_webglSyncAlphaTest(void);
#include "alpha-wrappers.inc"

static unsigned checks;
static void check(unsigned program, unsigned func, float ref) {
    if (!EM_ASM_INT({
        var p=GL.programs[$0];
        return p.values.u_buildAlphaFunc === $1 && p.values.u_buildAlphaRef === $2;
    }, program,func,ref)) {
        std::fprintf(stderr,"alpha state mismatch: program=%u func=%x ref=%g\n",program,func,ref);
        emscripten_force_exit(1);
    }
    ++checks;
}
int main() {
    EM_ASM({
      (function() {
        GLEmulation.init();
        GLctx = {
            currentProgram:null, uploads:0, lookups:0,
            useProgram(p) { this.currentProgram=p; },
            getUniformLocation(p,name) { ++this.lookups; return p.noAlpha ? null : {program:p,name}; },
            uniform1i(loc,value) { this.uniform1f(loc,value); },
            uniform1f(loc,value) {
                if (loc.program !== this.currentProgram) throw new Error('alpha upload to unbound program');
                loc.program.values[loc.name]=value; ++this.uploads;
            },
            enable() {}, disable() {}
        };
        GLImmediate.TexEnvJIT.init(GLctx,5);
        GL.programs[1]={name:1,values:{}}; GL.programs[2]={name:2,values:{}};
        GL.programs[3]={name:3,noAlpha:true,values:{}};
      })();
    });
    buildgl_resetStateAccounting();
    buildgl_useShaderProgram(1); check(1,0,0);
    buildgl_setEnabled(GL_ALPHA_TEST); check(1,GL_ALWAYS,0);
    buildgl_setDisabled(GL_ALPHA_TEST); check(1,0,0);
    buildgl_useShaderProgram(0);
    buildgl_setAlphaFunc(GL_GREATER,.25f); buildgl_setEnabled(GL_ALPHA_TEST);
    buildgl_useShaderProgram(1); check(1,GL_GREATER,.25f);
    for (unsigned func=GL_NEVER;func<=GL_ALWAYS;++func) for (float ref : {-2.f,0.f,.25f,.5f,1.f,2.f}) {
        float clamped = ref < 0 ? 0 : ref > 1 ? 1 : ref;
        buildgl_setAlphaFunc(func,ref); check(1,func,clamped);
        buildgl_useShaderProgram(2); check(2,func,clamped);
        buildgl_setDisabled(GL_ALPHA_TEST); check(2,0,clamped);
        buildgl_useShaderProgram(1); check(1,0,clamped);
        buildgl_setEnabled(GL_ALPHA_TEST); check(1,func,clamped);
        // The real reset invalidates native accounting, not actual GL state.
        buildgl_resetStateAccounting(); buildgl_useShaderProgram(2); check(2,func,clamped);
        buildgl_useShaderProgram(1); check(1,func,clamped);
    }
    int lookups = EM_ASM_INT({return GLctx.lookups;});
    int uploads = EM_ASM_INT({return GLctx.uploads;});
    buildgl_setAlphaFunc(GL_ALWAYS,2.f); buildgl_useShaderProgram(1);
    if (!EM_ASM_INT({return GLctx.uploads === $0 && GLctx.lookups === $1;},uploads,lookups)) return 2;
    ++checks;
    // Fixed-function/no-program paths and shaders without these uniforms.
    buildgl_useShaderProgram(0); buildgl_setAlphaFunc(GL_LESS,.5f);
    buildgl_useShaderProgram(3); buildgl_setDisabled(GL_ALPHA_TEST);
    buildgl_useShaderProgram(1); check(1,0,.5f);
    // Simulate a newly linked program reusing an old integer name: cache keys
    // must be object identities, not the recycled handle.
    buildgl_useShaderProgram(0);
    EM_ASM({GL.programs[1]=({name:1,values:{}});});
    buildgl_setEnabled(GL_ALPHA_TEST); buildgl_useShaderProgram(1); check(1,GL_LESS,.5f);
    std::printf("{\"stateChecks\":%u,\"sdkCompatibilityState\":true,\"nativeWrappers\":true,\"webglSinkOnly\":true}\n",checks);
}
