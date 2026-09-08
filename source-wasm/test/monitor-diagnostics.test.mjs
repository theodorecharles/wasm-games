import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('monitor observations are bounded and query only the bound camera framebuffer', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-monitors-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'monitor.cpp'), executable = path.join(directory, 'monitor');
  writeFileSync(source, String.raw`
#include "source_wasm_monitor_diagnostics.h"
#include <cassert>
#include <cstdio>
#include <initializer_list>
#define __EMSCRIPTEN__ 1
#define GL_FRAMEBUFFER 0x8D40
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
struct Key { unsigned m_xSize=256, m_ySize=256, m_texFormat=3, m_texFlags=4; };
struct Layout { Key m_key; };
struct CGLMTex { const char *m_debugLabel; unsigned m_texName; Layout *m_layout; };
struct Surface { CGLMTex *m_tex; };
struct GL { unsigned queries=0, status=GL_FRAMEBUFFER_COMPLETE; bool bound=false;
  unsigned glCheckFramebufferStatus(unsigned target) { assert(target==GL_FRAMEBUFFER && bound); ++queries; return status; }
} gl, *gGL=&gl;
struct Device { Surface *m_pRenderTargets[1], *m_pDepthStencil;
  void Observe() {
#include "source_wasm_monitor_framebuffer.inl"
  }
};
struct Vector { float x=4058, y=-4171, z=-479; };
struct C_PointCamera { C_PointCamera *m_pNext=nullptr; int entity=7; bool active=false, dormant=true; Vector origin;
  int entindex() const { return entity; } bool IsActive() const { return active; } bool IsDormant() const { return dormant; }
  const Vector &GetAbsOrigin() const { return origin; } float GetFOV() const { return 20; }
};
void ObserveCameras(C_PointCamera *pCameraEnt) {
#include "source_wasm_monitor_cameras.inl"
}
int main() {
  assert(SourceWasmIsCameraTarget("_rt_Camera") && SourceWasmIsCameraTarget("_RT_CAMERA"));
  for (const char *name : {"", "_rt_", "_rt_camera_extra", "x_rt_camera", "_rt_FullFrame"}) assert(!SourceWasmIsCameraTarget(name));
  assert(!SourceWasmIsCameraTarget(nullptr));
  SourceWasmMonitorGate gate;
  for (unsigned i=0;i<32;++i) { assert(gate.Accept(i)); assert(!gate.Accept(i)); }
  for (unsigned i=32;i<100000;++i) assert(!gate.Accept(i));
  Layout layout; CGLMTex texture={"menu",1,&layout}, depth={"depth",2,&layout};
  Surface colorSurface={&texture}, depthSurface={&depth}; Device device={{&colorSurface},&depthSurface};
  device.Observe(); assert(gl.queries==0);
  texture.m_debugLabel="_rt_Camera"; gl.bound=true;
  for (unsigned i=0;i<100000;++i) { device.Observe(); }
  assert(gl.queries==1);
  gl.status=0x8CD6; texture.m_texName=3; device.Observe(); assert(gl.queries==2);
  assert(gl.status==0x8CD6 && gl.bound && device.m_pRenderTargets[0]==&colorSurface && device.m_pDepthStencil==&depthSurface);
  for (unsigned i=0;i<10000;++i) { texture.m_texName=i+10; device.Observe(); } assert(gl.queries==32);
  ObserveCameras(nullptr); C_PointCamera camera; ObserveCameras(&camera);
  camera.active=true; camera.dormant=false; ObserveCameras(&camera);
  for (unsigned i=0;i<10000;++i) { camera.origin.x=float(i); ObserveCameras(&camera); }
  assert(camera.active && !camera.dormant);
}
`);
  execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
    '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I', path.join(root, 'patches/files'), source, '-o', executable]);
  const output = execFileSync(executable, { encoding: 'utf8' });
  assert.equal(output.split('\n').filter(line => line.includes('framebuffer')).length, 32);
  assert.match(output, /status=0x8cd6 complete=0/);
  assert.match(output, /camera-list total=0 active=0 dormant=0 drawable=0/);
  assert.match(output, /camera entity=7 active=1 dormant=0 origin=4058,-4171,-479 fov=20/);
  assert.equal(output.split('\n').filter(line => line.includes('camera entity')).length, 2, 'moving cameras do not exhaust the logging quota');
});

test('monitor patch planning is idempotent and rejects unknown or ambiguous native contexts without partial writes', () => {
  const output = execFileSync('python3', ['-c', String.raw`
import importlib.util, pathlib, tempfile
spec=importlib.util.spec_from_file_location('monitor', 'scripts/apply-monitor-diagnostics.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temp:
    root=pathlib.Path(temp); originals={}
    for relative,original,replacement in module.replacements(): originals.setdefault(relative,[]).append(original)
    for relative,anchors in originals.items():
        file=root/relative; file.parent.mkdir(parents=True,exist_ok=True); file.write_text('\n'.join(anchors))
    (root/'public').mkdir()
    before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    planned=module.planned_changes(root)
    assert before=={p:p.read_bytes() for p in before}
    for file,text in planned.items(): file.write_text(text)
    assert module.planned_changes(root)==planned
    late=root/'togles/linuxwin/dxabstract.cpp'
    for invalid in ['unknown source revision', planned[late]+planned[late]]:
        late.write_text(invalid); before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
        try: module.planned_changes(root)
        except ValueError: pass
        else: raise AssertionError('invalid context accepted')
        assert before=={p:p.read_bytes() for p in before}
print('monitor planning passed')
`], { cwd: root, encoding: 'utf8' });
  assert.match(output, /monitor planning passed/);
});
