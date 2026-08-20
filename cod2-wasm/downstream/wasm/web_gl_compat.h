#ifndef COD2_DOWNSTREAM_WEB_GL_COMPAT_H
#define COD2_DOWNSTREAM_WEB_GL_COMPAT_H

void webgl2_glDisable(unsigned int capability);
void webgl2_glEnable(unsigned int capability);
void webgl2_glDrawArrays(unsigned int mode, int first, int count);
void webgl2_glDrawElements(unsigned int mode, int count, unsigned int type, const void *indices);
void webgl2_glDrawRangeElements(unsigned int mode, unsigned int start, unsigned int end,
                                int count, unsigned int type, const void *indices);

#endif
