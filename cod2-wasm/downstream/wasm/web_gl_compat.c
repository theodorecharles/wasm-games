#include <GLES3/gl3.h>

void webgl2_glDisable(unsigned int capability) { glDisable(capability); }
void webgl2_glEnable(unsigned int capability) { glEnable(capability); }
void webgl2_glDrawArrays(unsigned int mode, int first, int count) {
  glDrawArrays(mode, first, count);
}
void webgl2_glDrawElements(unsigned int mode, int count, unsigned int type, const void *indices) {
  glDrawElements(mode, count, type, indices);
}
void webgl2_glDrawRangeElements(unsigned int mode, unsigned int start, unsigned int end,
                                int count, unsigned int type, const void *indices) {
  glDrawRangeElements(mode, start, end, count, type, indices);
}
