import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('final presentation observes actual read/default encodings without state writes and stops querying', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-present-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'present.cpp'), executable = path.join(directory, 'present');
  writeFileSync(source, String.raw`
#include "source_wasm_present_diagnostics.h"
#include <cassert>
#include <cstdio>
#define __EMSCRIPTEN__ 1
typedef int GLint;
enum { GL_NONE=0, GL_COLOR_BUFFER_BIT=0x4000, GL_READ_FRAMEBUFFER_BINDING=0x8CAA,
 GL_DRAW_FRAMEBUFFER_BINDING=0x8CA6, GL_READ_BUFFER=0x0C02, GL_DRAW_BUFFER0=0x8825,
 GL_READ_FRAMEBUFFER=0x8CA8, GL_DRAW_FRAMEBUFFER=0x8CA9,
 GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING=0x8210, GL_COLOR_ATTACHMENT0=0x8CE0,
 GL_BACK=0x405, GL_SRGB=0x8C40, GL_LINEAR=0x2601, GL_NEAREST=0x2600 };
struct Key { unsigned m_texFormat=21,m_texFlags=0x24,m_xSize=1280,m_ySize=720; };
struct Layout { Key m_key; };
struct Texture { unsigned m_texName=10,m_rboName=0; Layout *m_layout; };
struct Rect { int xmin=0,ymin=0,xmax=1280,ymax=720; };
struct GL { int queries=0,readBuffer=GL_COLOR_ATTACHMENT0,drawBuffer=GL_BACK,
  readEncoding=GL_SRGB,drawEncoding=GL_LINEAR;
  void glGetIntegerv(unsigned name,GLint *value) {
    ++queries;
    if(name==GL_READ_FRAMEBUFFER_BINDING)*value=19;
    else if(name==GL_DRAW_FRAMEBUFFER_BINDING)*value=0;
    else if(name==GL_READ_BUFFER)*value=readBuffer;
    else { assert(name==GL_DRAW_BUFFER0);*value=drawBuffer; }
  }
  void glGetFramebufferAttachmentParameteriv(unsigned target,unsigned attachment,unsigned name,GLint *value) {
    ++queries; assert(name==GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING);
    if(target==GL_READ_FRAMEBUFFER) { assert(attachment==unsigned(readBuffer) && attachment!=GL_NONE);*value=readEncoding; }
    else { assert(target==GL_DRAW_FRAMEBUFFER && attachment==unsigned(drawBuffer) && attachment!=GL_NONE);*value=drawEncoding; }
  }
} gl,*gGL=&gl;
void Observe(Texture *srcTex,Rect *srcRect,Rect *dstRect,bool blitToBack,unsigned blitMask,
 unsigned filter=GL_NEAREST,bool blitTwoStep=false,int srcMip=0) {
#include "source_wasm_present_blit.inl"
}
int main() {
 Layout layout;Texture texture;texture.m_layout=&layout;Rect src,dst;
 for(int i=0;i<100000;++i)Observe(&texture,&src,&dst,false,GL_COLOR_BUFFER_BIT);
 Observe(&texture,&src,&dst,true,0);assert(gl.queries==0);
 for(int i=0;i<100000;++i)Observe(&texture,&src,&dst,true,GL_COLOR_BUFFER_BIT);
 assert(gl.queries==6);
 gl.drawEncoding=GL_SRGB;dst.xmax=640;Observe(&texture,&src,&dst,true,GL_COLOR_BUFFER_BIT,GL_LINEAR);assert(gl.queries==12);
 gl.readBuffer=GL_NONE;gl.drawBuffer=GL_NONE;++texture.m_texName;
 Observe(&texture,&src,&dst,true,GL_COLOR_BUFFER_BIT);assert(gl.queries==16);
 gl.readBuffer=GL_COLOR_ATTACHMENT0;gl.drawBuffer=GL_BACK;gl.readEncoding=0;gl.drawEncoding=0;
 ++texture.m_texName;Observe(&texture,&src,&dst,true,GL_COLOR_BUFFER_BIT);assert(gl.queries==22);
 for(unsigned i=100;i<100000;++i) { texture.m_texName=i;Observe(&texture,&src,&dst,true,GL_COLOR_BUFFER_BIT); }
 assert(gl.queries==46);
 assert(gl.readBuffer==GL_COLOR_ATTACHMENT0 && gl.drawBuffer==GL_BACK && gl.readEncoding==0 && gl.drawEncoding==0);
}
`);
  execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
    '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I', path.join(root, 'patches/files'), source, '-o', executable]);
  const output = execFileSync(executable, { encoding: 'utf8' });
  assert.equal(output.trim().split('\n').length, 8);
  assert.match(output, /filter=0x2600.*readFbo=19 readBuffer=0x8ce0 readEncoding=0x8c40 drawFbo=0 drawBuffer=0x405 drawEncoding=0x2601/);
  assert.match(output, /rect=1280x720->640x720 filter=0x2601.*drawEncoding=0x8c40/);
  assert.match(output, /readBuffer=0x0 readEncoding=0x0 drawFbo=0 drawBuffer=0x0 drawEncoding=0x0/);
  assert.match(output, /readBuffer=0x8ce0 readEncoding=0x0 drawFbo=0 drawBuffer=0x405 drawEncoding=0x0/);
});

test('presentation patch planning preserves other hooks and refuses ambiguous source before any mutation', () => {
  const output = execFileSync('python3', ['-c', String.raw`
import pathlib,runpy,tempfile
m=runpy.run_path('scripts/apply-present-diagnostics.py')
with tempfile.TemporaryDirectory() as tmp:
    root=pathlib.Path(tmp);file=root/'togles/linuxwin/glmgr.cpp';file.parent.mkdir(parents=True);(root/'public').mkdir()
    other='#include "source_wasm_brightness_diagnostics.h"\n#include "glmgr_flush.inl"'
    file.write_text(other+'\n'+'\n'.join(original for original,_ in m['replacements']()))
    before=file.read_text();plan=m['planned_changes'](root);assert file.read_text()==before
    assert other in plan[file]
    for path,text in plan.items():path.write_text(text)
    assert m['planned_changes'](root)==plan
    for invalid in ['unknown source',plan[file]+plan[file]]:
        file.write_text(invalid);before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
        try:m['planned_changes'](root)
        except ValueError:pass
        else:raise AssertionError('unknown or ambiguous source accepted')
        assert before=={p:p.read_bytes() for p in before}
print('present planning passed')
`], { cwd: root, encoding: 'utf8' });
  assert.match(output, /present planning passed/);
});
