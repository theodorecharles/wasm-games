import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('timing windows expose stepped clocks and cap summaries and callback collection', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-facial-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'timing.cpp'), binary = path.join(directory, 'timing');
  writeFileSync(source, String.raw`
#define __EMSCRIPTEN__ 1
#include "source_wasm_facial_timing.h"
#include <cassert>
#include <cmath>
struct SDL_atomic_t { int value; };
using Uint32 = unsigned;
static unsigned fakeTicks;
int SDL_AtomicGet(SDL_atomic_t *v) { return v->value; }
int SDL_AtomicSet(SDL_atomic_t *v, int n) { int old=v->value; v->value=n; return old; }
int SDL_AtomicAdd(SDL_atomic_t *v, int n) { int old=v->value; v->value+=n; return old; }
Uint32 SDL_GetTicks() { return fakeTicks; }
#include "source_wasm_facial_audio.inl"
int main() {
    SourceWasmFacialWindow frame;
    unsigned summaries=0, repeated=0;
    for (unsigned i=0; i<100000; ++i) {
        const double wall=i/60.0, mouth=(i/3)*0.0464;
        if (frame.Observe(wall,mouth)) {
            ++summaries; repeated+=frame.repeats;
            assert(frame.events>=59 && frame.events<=62);
            assert(frame.maxClockStep>0.0463 && frame.maxClockStep<0.0465);
            assert(frame.maxWallStep<0.017);
            frame.Finish(wall);
        }
    }
    assert(summaries==7 && frame.Done() && repeated>250);
    assert(frame.events==0); // later frames perform no aggregation
    SourceWasmFacialWindow hitch;
    assert(!hitch.Observe(10,2));
    assert(hitch.Observe(11.5,1));
    assert(hitch.backwards==1 && hitch.maxWallStep==1.5);

    SourceWasmFacialAudioConsumed(2048,2048);
    assert(SourceWasmFacialAudioSnapshot().callbacks==0);
    SourceWasmFacialAudioStart();
    fakeTicks=100; SourceWasmFacialAudioConsumed(2048,2048);
    fakeTicks=146; SourceWasmFacialAudioConsumed(2048,4096);
    fakeTicks=240; SourceWasmFacialAudioConsumed(2048,6144);
    auto observed=SourceWasmFacialAudioSnapshot();
    assert(observed.callbacks==3 && observed.consumedFrames==6144);
    assert(observed.cursor==6144 && observed.maximumCallbackGapMs==94 && observed.active==1);
    fakeTicks=15100; SourceWasmFacialAudioConsumed(2048,8192);
    observed=SourceWasmFacialAudioSnapshot();
    assert(observed.active==0 && observed.callbacks==3 && observed.consumedFrames==6144);
    for(unsigned i=0;i<100000;++i) SourceWasmFacialAudioConsumed(2048,0);
    assert(SourceWasmFacialAudioSnapshot().callbacks==3);
}
`);
  execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
    '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I', path.join(root, 'patches/files'), source, '-o', binary]);
  execFileSync(binary);
});

test('facial/input patch planning is idempotent and fails before changing any source', () => {
  execFileSync('python3', ['-c', String.raw`
import importlib.util,pathlib,tempfile
spec=importlib.util.spec_from_file_location('diag','scripts/apply-facial-input-diagnostics.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 root=pathlib.Path(d); originals={}
 for name,old,new in m.replacements():originals.setdefault(name,[]).append(old)
 for name,anchors in originals.items():
  p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('\n'.join(anchors))
 before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()};plan=m.planned_changes(root)
 assert before=={p:p.read_bytes() for p in before}
 for p,text in plan.items():p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 assert m.planned_changes(root)==plan
 p=root/'togles/linuxwin/glmgr_flush.inl';p.write_text('unknown context');before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
 try:m.planned_changes(root)
 except ValueError:pass
 else:raise AssertionError('unknown late context accepted')
 assert before=={p:p.read_bytes() for p in before}
 p.write_text(plan[p]+plan[p])
 try:m.planned_changes(root)
 except ValueError:pass
 else:raise AssertionError('ambiguous context accepted')
`], { cwd: root });
});

test('diagnostics never change rendering, phoneme times or audio format', () => {
  for (const file of ['source_wasm_facial_audio.inl','source_wasm_facial_mouth.inl',
    'source_wasm_facial_frame.inl','source_wasm_input_gamma_draw.inl']) {
    const text=readFileSync(path.join(root,'patches/files',file),'utf8');
    assert.doesNotMatch(text,/SetElapsedTime\(|SetValue\(|gl(?:Uniform|Bind|Enable|Disable|TexImage)\w*\(|SDL_(?:OpenAudio|PauseAudio)/);
  }
  const input=readFileSync(path.join(root,'patches/files/source_wasm_input_gamma_draw.inl'),'utf8');
  assert.match(input,/counts\[bucket\] < 2/);
  assert.match(input,/fragment->m_samplerMask/);
  assert.match(input,/"engine_post"/);
  assert.match(input,/"introscreenspace"/);
});
