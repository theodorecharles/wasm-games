import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('WebGL uses matching depth while native platforms retain reported capabilities', t => {
  const replacement = execFileSync('python3', ['-c', `import runpy; print(runpy.run_path('scripts/apply-render-target-depth-patches.py')['REPLACEMENT'])`], { cwd: root, encoding: 'utf8' });
  const directory = mkdtempSync(path.join(tmpdir(), 'source-depth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'depth.cpp');
  writeFileSync(source, `#include <cassert>
struct CHardwareConfig { struct { bool m_bSupportsGLMixedSizeTargets; } m_Caps; bool SupportsGLMixedSizeTargets() const; };
${replacement}
// Existing Source allocation contract: a smaller shared target receives a
// private depth target when mixed attachment dimensions are unsupported.
bool NeedsSeparate(const CHardwareConfig &caps,int width,int height,bool noDepth=false,bool fullFrame=false) {
  return !noDepth && !fullFrame && !caps.SupportsGLMixedSizeTargets() && (width!=1280 || height!=720);
}
int main() {
  CHardwareConfig caps;
  for (int value=0;value<2;++value) {
    caps.m_Caps.m_bSupportsGLMixedSizeTargets=bool(value);
#ifdef __EMSCRIPTEN__
    assert(!caps.SupportsGLMixedSizeTargets());
    assert(NeedsSeparate(caps,256,256));
    assert(NeedsSeparate(caps,1024,512));
#else
    assert(caps.SupportsGLMixedSizeTargets()==bool(value));
    assert(NeedsSeparate(caps,256,256)==!value);
#endif
    assert(!NeedsSeparate(caps,1280,720));
    assert(!NeedsSeparate(caps,256,256,true));
    assert(!NeedsSeparate(caps,1,1,false,true));
  }
}
`);
  for (const target of ['native', 'webgl']) {
    const executable = path.join(directory, target);
    execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
      ...(target === 'webgl' ? ['-D__EMSCRIPTEN__'] : []), source, '-o', executable]);
    execFileSync(executable);
  }
});

test('strict capability patch requires the existing actual-size depth allocator and preserves other source', () => {
  const output = execFileSync('python3', ['-c', String.raw`
import runpy,pathlib,tempfile
m=runpy.run_path('scripts/apply-render-target-depth-patches.py')
with tempfile.TemporaryDirectory() as temp:
    root=pathlib.Path(temp)
    files={'materialsystem/shaderapidx9/hardwareconfig.cpp':'before\n'+m['ORIGINAL']+'\nafter',
      'materialsystem/cmaterialsystem.cpp':m['SEPARATE_GUARD'],'materialsystem/ctexture.cpp':m['DEPTH_ALLOCATION']}
    for name,text in files.items():
        file=root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(text)
    plan=m['planned_changes'](root);assert len(plan)==1
    for file,text in plan.items():
        assert text.startswith('before\n') and text.endswith('\nafter');file.write_text(text)
    assert m['planned_changes'](root)==plan
    depth=root/'materialsystem/ctexture.cpp';depth.write_text(m['DEPTH_ALLOCATION'].replace('m_dimsAllocated.m_nHeight','backbufferHeight'))
    before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    try:m['planned_changes'](root)
    except ValueError:pass
    else:raise AssertionError('mismatched actual depth height accepted')
    assert before=={p:p.read_bytes() for p in before}
print('depth patch planning passed')
`], { cwd: root, encoding: 'utf8' });
  assert.match(output, /depth patch planning passed/);
});
