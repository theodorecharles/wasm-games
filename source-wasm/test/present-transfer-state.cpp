#include "source_wasm_present_transfer.h"
#include <array>
#include <cassert>
#include <map>
#include <set>
#include <string>
#include <vector>
using namespace SourceWasmPresent;

struct State {
    unsigned program=71, vao=72, active=Texture0+3;
    std::array<unsigned,4> textures={{81,82,83,84}}, samplers={{91,92,93,94}};
    std::array<int,4> viewport={{17,23,401,299}};
    std::array<unsigned char,4> colors={{0,1,0,1}};
    std::map<unsigned,bool> enabled;
    bool operator==(const State &b) const {
        return program==b.program && vao==b.vao && active==b.active && textures==b.textures &&
            samplers==b.samplers && viewport==b.viewport && colors==b.colors && enabled==b.enabled;
    }
};
struct GL {
    State state;
    std::set<unsigned> shaders,programs,vaos,samplers;
    std::map<unsigned,unsigned> shaderTypes;
    std::map<unsigned,std::map<unsigned,int> > parameters;
    std::vector<std::string> sources;
    unsigned next=1000,creates=0,draws=0,encodingQueries=0;
    int failure=0, readEncoding=Srgb, drawEncoding=Linear, uniform=-1;
    bool throwDraw=false;
    GL() { for(unsigned i=0;i<9;++i)state.enabled[SavedState<GL>::Capability(i)]=(i%2)==0; }
    unsigned glCreateShader(unsigned type) {
        ++creates;if(failure==8)return 0;
        unsigned id=next++;shaders.insert(id);shaderTypes[id]=type;return id;
    }
    void glShaderSource(unsigned,int count,const char **source,const int*) { assert(count==1);sources.push_back(*source); }
    void glCompileShader(unsigned) {}
    void glGetShaderiv(unsigned shader,unsigned name,int *out) {
        assert(name==CompileStatus);
        *out=!((failure==1 && shaderTypes[shader]==VertexShader)||(failure==2 && shaderTypes[shader]==FragmentShader));
    }
    void glDeleteShader(unsigned shader) { assert(shaders.erase(shader)==1); }
    unsigned glCreateProgram() { ++creates;if(failure==7)return 0;unsigned id=next++;programs.insert(id);return id; }
    void glAttachShader(unsigned,unsigned) {}
    void glLinkProgram(unsigned) {}
    void glGetProgramiv(unsigned,unsigned name,int *out) { assert(name==LinkStatus);*out=failure!=3; }
    void glDeleteProgram(unsigned id) { assert(programs.erase(id)==1); }
    int glGetUniformLocation(unsigned,const char *name) { assert(std::string(name)=="sourceImage");return failure==6?-1:3; }
    void glGenVertexArrays(int count,unsigned *out) { assert(count==1);++creates;*out=failure==4?0:next++;if(*out)vaos.insert(*out); }
    void glDeleteVertexArrays(int count,const unsigned *id) { assert(count==1 && vaos.erase(*id)==1); }
    void glGenSamplers(int count,unsigned *out) { assert(count==1);++creates;*out=failure==5?0:next++;if(*out)samplers.insert(*out); }
    void glDeleteSamplers(int count,const unsigned *id) { assert(count==1 && samplers.erase(*id)==1); }
    void glSamplerParameteri(unsigned id,unsigned pname,int value) { assert(samplers.count(id));parameters[id][pname]=value; }
    void glGetFramebufferAttachmentParameteriv(unsigned target,unsigned attachment,unsigned name,int *out) {
        ++encodingQueries;assert(name==ColorEncoding);
        if(target==ReadFramebuffer) { assert(attachment==ColorAttachment0);*out=readEncoding; }
        else { assert(target==DrawFramebuffer && attachment==Back);*out=drawEncoding; }
    }
    void glGetIntegerv(unsigned name,int *out) {
        if(name==CurrentProgram)*out=int(state.program);
        else if(name==VertexArrayBinding)*out=int(state.vao);
        else if(name==ActiveTexture)*out=int(state.active);
        else if(name==TextureBinding2D)*out=int(state.textures[state.active-Texture0]);
        else if(name==SamplerBinding)*out=int(state.samplers[state.active-Texture0]);
        else { assert(name==Viewport);for(int i=0;i<4;++i)out[i]=state.viewport[i]; }
    }
    void glGetBooleanv(unsigned name,unsigned char *out) { assert(name==ColorWriteMask);for(int i=0;i<4;++i)out[i]=state.colors[i]; }
    unsigned char glIsEnabled(unsigned name) { return state.enabled[name]; }
    void glEnable(unsigned name) { state.enabled[name]=true; }
    void glDisable(unsigned name) { state.enabled[name]=false; }
    void glUseProgram(unsigned id) { state.program=id; }
    void glBindVertexArray(unsigned id) { state.vao=id; }
    void glActiveTexture(unsigned unit) { assert(unit>=Texture0 && unit<Texture0+4);state.active=unit; }
    void glBindTexture(unsigned target,unsigned id) { assert(target==Texture2D);state.textures[state.active-Texture0]=id; }
    void glBindSampler(unsigned unit,unsigned id) { assert(unit<4);state.samplers[unit]=id; }
    void glViewport(int x,int y,int width,int height) { state.viewport={{x,y,width,height}}; }
    void glColorMask(unsigned char r,unsigned char g,unsigned char b,unsigned char a) { state.colors={{r,g,b,a}}; }
    void glUniform1i(int location,int value) { assert(location==3 && value==0);uniform=value; }
    void glDrawArrays(unsigned mode,int first,int count) {
        assert(mode==Triangles && first==0 && count==3 && uniform==0);
        assert(programs.count(state.program) && vaos.count(state.vao) && state.active==Texture0);
        assert(state.textures[0]==777 && samplers.count(state.samplers[0]));
        assert((state.colors==std::array<unsigned char,4>{{1,1,1,1}}));
        for(unsigned i=0;i<9;++i)assert(!state.enabled[SavedState<GL>::Capability(i)]);
        const auto &p=parameters[state.samplers[0]];
        assert(p.at(TextureWrapS)==ClampToEdge && p.at(TextureWrapT)==ClampToEdge);
        assert(p.at(TextureMinFilter)==p.at(TextureMagFilter));
        assert((state.viewport==std::array<int,4>{{0,0,1280,720}})||(state.viewport==std::array<int,4>{{11,13,640,360}}));
        ++draws;if(throwDraw)throw 17;
    }
    bool Empty() const { return shaders.empty() && programs.empty() && vaos.empty() && samplers.empty(); }
};

int main() {
    assert(std::abs(Encode(0.0))<1e-15 && std::abs(Encode(1.0)-1.0)<1e-12);
    assert(std::abs(Encode(0.0031308)-0.040449936)<1e-12);
    assert(std::abs(Encode(0.18)-0.4613561295)<1e-9);
    assert(int(std::round(Encode(0.18)*255))==118);
    assert(std::abs(Encode(0.003130801)-Encode(0.0031308))<1e-6);
    double previous=-1;
    for(int i=0;i<=100000;++i) { double encoded=Encode(double(i)/100000);assert(encoded>=previous);previous=encoded; }
    assert(std::string(FragmentSource()).find("color.a")!=std::string::npos);
    assert(std::string(VertexSource()).find("1.0 - corner.y")!=std::string::npos);
    int owner=1,otherOwner=2,texture=3,fbo=4;
    Input input;input.source=&texture;input.readFbo=&fbo;input.texture=777;input.width=1280;input.height=720;
    input.destinationWidth=1280;input.destinationHeight=720;
    GL gl;const State original=gl.state;Registry<GL> registry;
    input.renderbuffer=99;assert(!registry.Draw(&gl,&owner,input) && gl.creates==0 && gl.encodingQueries==0);
    input.resolved=true;
    assert(registry.Draw(&gl,&owner,input));assert(gl.state==original && gl.encodingQueries==2 && gl.creates==6);
    for(int i=0;i<10000;++i)assert(registry.Draw(&gl,&owner,input));
    assert(gl.state==original && gl.encodingQueries==2 && gl.creates==6 && gl.draws==10001);
    input.filter=Linear;input.destinationX=11;input.destinationY=13;input.destinationWidth=640;input.destinationHeight=360;
    assert(registry.Draw(&gl,&owner,input));assert(gl.state==original && gl.encodingQueries==2 && gl.creates==6);
    gl.throwDraw=true;try { registry.Draw(&gl,&owner,input);assert(false); }catch(int value){assert(value==17);}
    gl.throwDraw=false;assert(gl.state==original);
    gl.drawEncoding=Srgb;++input.flags;assert(!registry.Draw(&gl,&owner,input));assert(gl.encodingQueries==4 && gl.state==original);
    gl.drawEncoding=Linear;gl.readEncoding=Linear;++input.flags;assert(!registry.Draw(&gl,&owner,input));assert(gl.encodingQueries==6);
    gl.readEncoding=Srgb;++input.flags;assert(registry.Draw(&gl,&owner,input));assert(gl.creates==6 && gl.encodingQueries==8);
    input.srgbDecodeExtension=true;assert(registry.Draw(&gl,&otherOwner,input));assert(gl.creates==12);
    assert(gl.state==original);registry.Destroy(&gl,&owner);assert(gl.programs.size()==1);
    registry.Destroy(&gl,&owner);registry.Destroy(&gl,&otherOwner);assert(gl.Empty());
    assert(registry.Draw(&gl,&owner,input));assert(gl.creates==18);registry.Destroy(&gl,&owner);assert(gl.Empty());
    for(int failure=1;failure<=8;++failure) {
        GL broken;broken.failure=failure;Registry<GL> isolated;const State old=broken.state;
        assert(!isolated.Draw(&broken,&owner,input));const unsigned creates=broken.creates;
        for(int repeat=0;repeat<10000;++repeat)assert(!isolated.Draw(&broken,&owner,input));
        assert(broken.creates==creates && broken.draws==0 && broken.state==old && broken.Empty());
        isolated.Destroy(&broken,&owner);
    }
    GL unknown;unknown.readEncoding=0;Registry<GL> isolated;
    for(int repeat=0;repeat<10000;++repeat)assert(!isolated.Draw(&unknown,&owner,input));
    assert(unknown.encodingQueries==2 && unknown.creates==0 && unknown.Empty());isolated.Destroy(&unknown,&owner);
}
