import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bounded diagnostic quotas reserve G-Man/world records after unlimited unrelated menu draws', t => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'source-brightness-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, 'gate.cpp'), executable = path.join(temporary, 'gate');
  writeFileSync(source, String.raw`
#include "source_wasm_brightness_diagnostics.h"
#include <cassert>
int main() {
    SourceWasmBrightnessGate gate;
    for (unsigned i = 0; i < 100000; ++i)
        assert(!gate.Accept(SourceWasmBrightnessBucket("unlitgeneric", "vgui/menu"), i));
    assert(SourceWasmBrightnessBucket("vertexlitgeneric", "models/GMan/gman_face") == 0);
    assert(SourceWasmBrightnessBucket("lightmappedgeneric", "brick/wall") == 1);
    assert(SourceWasmBrightnessBucket(0, "LightmapPage0") == 1);
    assert(SourceWasmBrightnessBucket("engine_post", 0) == 2);
    assert(SourceWasmBrightnessBucket(0, "models/props/can") == 3);
    assert(SourceWasmBrightnessBucket(0, 0) == -1);
    const unsigned caps[] = {6, 6, 2, 2};
    for (int bucket = 0; bucket < 4; ++bucket) {
        for (unsigned i = 0; i < caps[bucket]; ++i) {
            assert(gate.Accept(bucket, i));
            assert(!gate.Accept(bucket, i));
        }
        for (unsigned i = caps[bucket]; i < 10000; ++i) assert(!gate.Accept(bucket, i));
    }
    assert(!gate.Accept(-1, 0) && !gate.Accept(4, 0));
    assert(SourceWasmBrightnessText("gman") != SourceWasmBrightnessText("world"));
}
`);
  execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
    '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I', path.join(root, 'patches/files'), source, '-o', executable]);
  execFileSync(executable);
});

test('diagnostic patcher is idempotent, detects missing/ambiguous anchors and never publishes partial changes', () => {
  const result = execFileSync('python3', ['-c', String.raw`
import importlib.util, pathlib, tempfile
spec=importlib.util.spec_from_file_location('diagnostic', 'scripts/apply-brightness-diagnostics.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temp:
    root=pathlib.Path(temp)
    originals={}
    for relative,original,replacement in module.replacements():
        originals.setdefault(relative,[]).append(original)
    for relative,anchors in originals.items():
        file=root/relative; file.parent.mkdir(parents=True,exist_ok=True)
        file.write_text('\n'.join(anchors))
    register=root/'materialsystem/stdshaders/common_hlsl_cpp_consts.h'
    register.parent.mkdir(parents=True,exist_ok=True)
    register.write_text('#define TONE_MAPPING_SCALE_PSH_CONSTANT 30\n')
    initial={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    planned=module.planned_changes(root)
    assert initial=={p:p.read_bytes() for p in initial}, 'planning must not modify source'
    entrypoints=root/'public/togles/linuxwin/glfuncs.h'
    assert planned[entrypoints].startswith(initial[entrypoints].decode()+'\n'), 'existing entry-point offsets must stay unchanged'
    assert planned[entrypoints].endswith('GL_FUNC_VOID(OpenGL,true,glGetUniformfv,(GLuint a,GLint b,GLfloat *c),(a,b,c))')
    for file,text in planned.items(): file.write_text(text)
    assert module.planned_changes(root)==planned
    late=root/'public/togles/linuxwin/glfuncs.h'
    late.write_text('unknown source revision\n')
    before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('late unknown context accepted')
    assert before=={p:p.read_bytes() for p in before}, 'late failure must not modify prior files'
    late.write_text(planned[late]+planned[late])
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('ambiguous patched context accepted')
    late.write_text(planned[late]+'\nGL_FUNC_VOID(OpenGL,true,unexpectedLastField,(),())\n')
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('entry-point insertion before later fields accepted')
    late.write_text(planned[late]); register.write_text('#define TONE_MAPPING_SCALE_PSH_CONSTANT 31\n')
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('changed tone register accepted')
print('diagnostic patch planning pass')
`], { cwd: root, encoding: 'utf8' });
  assert.match(result, /diagnostic patch planning pass/);
});

test('diagnostic snippets only query state and never set brightness or GL render state', () => {
  for (const name of ['draw', 'upload', 'mode']) {
    const text = readFileSync(path.join(root, `patches/files/source_wasm_brightness_${name}.inl`), 'utf8');
    assert.doesNotMatch(text, /gl(?:Uniform|Enable|Disable|Bind|TexImage|TexSubImage)\w*\s*\(|\.SetValue\(/);
  }
  const draw = readFileSync(path.join(root, 'patches/files/source_wasm_brightness_draw.inl'), 'utf8');
  assert.match(draw, /framebuffer \? GL_COLOR_ATTACHMENT0 : GL_BACK/);
  assert.match(draw, /m_locFragmentFakeSRGBEnable >= 0/);
});
