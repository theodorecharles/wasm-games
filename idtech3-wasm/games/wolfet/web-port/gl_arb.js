mergeInto(LibraryManager.library, {
  glDrawBuffer: function (mode) { /* WebGL has no glDrawBuffer; default back buffer is fine. */ },
  emscripten_glDrawBuffer: function (mode) {},
  glReadBuffer: function (mode) {},
  emscripten_glReadBuffer: function (mode) {},
  glDrawBuffer__sig: 'vi',
  emscripten_glDrawBuffer__sig: 'vi',
  glActiveTextureARB: function (texture) {
    if (typeof GLctx !== 'undefined' && GLctx.activeTexture) {
      GLctx.activeTexture(texture);
    }
  },
  glClientActiveTextureARB: function (texture) {
    if (typeof emscriptenWebGLImmediateModeState !== 'undefined') {
      emscriptenWebGLImmediateModeState.clientActiveTexture = texture;
    }
    if (typeof GL !== 'undefined' && GL.immediate && GL.immediate.clientActiveTexture !== undefined) {
      GL.immediate.clientActiveTexture = texture - 0x84C0;
    }
  },
  glMultiTexCoord2fARB: function (target, s, t) {
    if (typeof GL !== 'undefined' && GL.immediate && GL.immediate.texCoord) {
      var unit = target - 0x84C0;
      if (!GL.immediate.texCoord[unit]) {
        GL.immediate.texCoord[unit] = [0, 0];
      }
      GL.immediate.texCoord[unit][0] = s;
      GL.immediate.texCoord[unit][1] = t;
    }
  },
  glMultiTexCoord2fvARB: function (target, ptr) {
    if (ptr && typeof GLctx !== 'undefined') {
      var s = HEAPF32[ptr >> 2];
      var t = HEAPF32[(ptr >> 2) + 1];
      if (typeof GL !== 'undefined' && GL.immediate && GL.immediate.texCoord) {
        var unit = target - 0x84C0;
        if (!GL.immediate.texCoord[unit]) {
          GL.immediate.texCoord[unit] = [0, 0];
        }
        GL.immediate.texCoord[unit][0] = s;
        GL.immediate.texCoord[unit][1] = t;
      }
    }
  },
  glLockArraysEXT: function () {},
  glUnlockArraysEXT: function () {},
  /* No-op desktop-GL leftovers after dropping LEGACY_GL_EMULATION. */
  glMatrixMode: function () {},
  glLoadIdentity: function () {},
  glLoadMatrixf: function () {},
  glMultMatrixf: function () {},
  glOrtho: function () {},
  glFrustum: function () {},
  glPushMatrix: function () {},
  glPopMatrix: function () {},
  glShadeModel: function () {},
  glColor3f: function () {},
  glColor3fv: function () {},
  glColor4f: function () {},
  glColor4fv: function () {},
  glColor4ub: function () {},
  glBegin: function () {},
  glEnd: function () {},
  glVertex2f: function () {},
  glVertex3f: function () {},
  glTexCoord2f: function () {},
  glClipPlane: function () {},
  glPolygonMode: function () {},
  glAlphaFunc: function () {},
  glTexEnvf: function () {},
  glTexEnvi: function () {},
  glClientActiveTexture: function () {},
  glEnableClientState: function () {},
  glDisableClientState: function () {},
  glColorPointer: function () {},
  glTexCoordPointer: function () {},
  glVertexPointer: function () {},
  glFogf: function () {},
  glFogfv: function () {},
  glFogi: function () {},
  glPointSize: function () {},
  glTranslatef: function () {},
  glCallList: function () {},
  glTexCoord2fv: function () {},
  glVertex3fv: function () {},
  glUseProgramObjectARB: function () {},
  glCreateShaderObjectARB: function () { return 0; },
  glCreateProgramObjectARB: function () { return 0; },
  glShaderSourceARB: function () {},
  glCompileShaderARB: function () {},
  glAttachObjectARB: function () {},
  glDetachObjectARB: function () {},
  glLinkProgramARB: function () {},
  glDeleteObjectARB: function () {},
  glGetObjectParameterivARB: function (obj, pname, ptr) {
    if (ptr) { HEAP32[ptr >> 2] = 0; }
  },
  glGetInfoLogARB: function (obj, maxLen, lenPtr, logPtr) {
    if (lenPtr) { HEAP32[lenPtr >> 2] = 0; }
    if (logPtr && maxLen > 0) { HEAP8[logPtr] = 0; }
  },
  glClearDepth: function (z) {
    if (typeof GLctx !== 'undefined' && GLctx.clearDepth) {
      GLctx.clearDepth(z);
    }
  }
});
