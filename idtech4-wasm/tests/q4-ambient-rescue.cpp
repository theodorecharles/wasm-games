#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdio>
using GLuint=unsigned int;
enum {BE_ARB2=2,GL_VERTEX_PROGRAM_ARB=1,GL_FRAGMENT_PROGRAM_ARB=2,
 VPROG_TEST=3,VPROG_SIMPLE_INTERACTION=4,VPROG_INTERACTION=5,
 FPROG_TEST=6,FPROG_SIMPLE_INTERACTION=7,FPROG_INTERACTION=8};
struct Cvar {float value=0;bool GetBool() const{return value!=0;}float GetFloat() const{return value;}};
Cvar r_testARBProgram,r_useSimpleInteraction,r_forceAmbient;
struct {int backEndRenderer=BE_ARB2;} tr;
struct {bool preferSimpleInteraction=false,disableARB2Interactions=false;} glConfig;
bool vertexValid=false,fragmentValid=false;int queries=0;GLuint lastVertex=0,lastFragment=0;
bool R_IsARBProgramValid(int type,GLuint program) {++queries;if(type==GL_VERTEX_PROGRAM_ARB){lastVertex=program;return vertexValid;}lastFragment=program;return fragmentValid;}
template<class T>T Max(T a,T b){return std::max(a,b);}
struct idMath {static float ClampFloat(float a,float b,float v){return std::clamp(v,a,b);}};
#include "q4-ambient-production.h"
int main(){
 int cases=0;
 for(int backend:{0,int(BE_ARB2)})for(bool disabled:{false,true})for(bool test:{false,true})
 for(bool simple:{false,true})for(bool prefer:{false,true})for(bool vertex:{false,true})for(bool fragment:{false,true})
 for(float explicitFloor:{-0.5f,0.0f,0.1f,0.4f,1.5f}){
  tr.backEndRenderer=backend;glConfig.disableARB2Interactions=disabled;glConfig.preferSimpleInteraction=prefer;
  r_testARBProgram.value=test;r_useSimpleInteraction.value=simple;r_forceAmbient.value=explicitFloor;
  vertexValid=vertex;fragmentValid=fragment;queries=0;lastVertex=lastFragment=0;
#ifdef __EMSCRIPTEN__
  const bool rescue=backend==BE_ARB2&&disabled;
#else
  const bool rescue=backend==BE_ARB2&&(disabled||!vertex||!fragment);
#endif
  const float expected=std::clamp(std::max(explicitFloor,rescue?0.2f:0.0f),0.0f,1.0f);
  assert(std::fabs(Q4AmbientProbe()-expected)<0.00001f);
#ifdef __EMSCRIPTEN__
  assert(queries==0);
#else
  if(backend==BE_ARB2&&!disabled){
   assert(lastVertex==(test?VPROG_TEST:(simple||prefer)?VPROG_SIMPLE_INTERACTION:VPROG_INTERACTION));
   if(vertex)assert(lastFragment==(test?FPROG_TEST:(simple||prefer)?FPROG_SIMPLE_INTERACTION:FPROG_INTERACTION));
  }else assert(queries==0);
#endif
  ++cases;
 }
 std::printf("%d ambient policy cases passed\n",cases);
}
