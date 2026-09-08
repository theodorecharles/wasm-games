import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sRGB state follows each target and program without repeated queries or duplicate encoding', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-srgb-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'srgb.cpp'), executable = path.join(directory, 'srgb');
  writeFileSync(source, String.raw`
#include "source_wasm_srgb_write.h"
#include <cassert>
#include <cmath>
#include <vector>
int main() {
    SourceWasmSrgbTargetCache srgb, linear;
    SourceWasmSrgbTargetKey a, b;
    int textureA, textureB;
    a.texture = &textureA; a.name = 11; a.format = 3; a.flags = 0x24;
    b.texture = &textureB; b.name = 12; b.format = 3; b.flags = 0x20;
    unsigned queriesA = 0, queriesB = 0;
    auto queryA = [&]() { ++queriesA; return SourceWasmSrgbEncoding; };
    auto queryB = [&]() { ++queriesB; return SourceWasmLinearEncoding; };
    std::vector<float> writes;
    auto uniform = [&](int location, float value) { assert(location == 90); writes.push_back(value); };
    float programA = -1, programB = -1;

    // The observed G-Man/world path requested sRGB writes into an sRGB FBO.
    assert(SourceWasmApplySrgbWrite(90, true, srgb.Resolve(a, queryA), programA, uniform));
    assert(writes.size() == 1 && writes.back() == 0);
    for (unsigned i = 0; i < 100000; ++i)
        assert(SourceWasmApplySrgbWrite(90, true, srgb.Resolve(a, queryA), programA, uniform));
    assert(queriesA == 1 && writes.size() == 1);

    // Same linked program, a linear FBO needs the software conversion; returning
    // to the prior FBO reuses its observation and restores that program's value.
    assert(SourceWasmApplySrgbWrite(90, true, linear.Resolve(b, queryB), programA, uniform));
    assert(writes.back() == 1 && queriesB == 1);
    assert(SourceWasmApplySrgbWrite(90, true, srgb.Resolve(a, queryA), programA, uniform));
    assert(writes.back() == 0 && queriesA == 1 && writes.size() == 3);
    assert(SourceWasmApplySrgbWrite(90, true, srgb.Resolve(a, queryA), programB, uniform));
    assert(writes.size() == 4 && programB == 0); // newly linked program still needs initialization

    // A requested-off pass must not receive the previously forced software
    // conversion. Hardware conversion on an sRGB attachment remains automatic.
    assert(SourceWasmApplySrgbWrite(90, false, linear.Resolve(b, queryB), programA, uniform));
    assert(programA == 0);
    assert(SourceWasmApplySrgbWrite(90, true, linear.Resolve(b, queryB), programA, uniform));
    assert(programA == 1);
    assert(SourceWasmApplySrgbWrite(90, false, linear.Resolve(b, queryB), programA, uniform));
    assert(programA == 0 && queriesB == 1);
    const auto before = writes.size();
    assert(SourceWasmApplySrgbWrite(-1, true, SourceWasmSrgbEncoding, programA, uniform));
    assert(!SourceWasmApplySrgbWrite(90, true, -1, programA, uniform));
    assert(writes.size() == before); // no suffix or unresolved state cannot write a guessed value

    // Reattachment and deletion/name reuse have independent cache lifetimes.
    srgb.Invalidate(); srgb.Resolve(a, queryA); assert(queriesA == 2);
    SourceWasmSrgbTargetCache replacement; replacement.Resolve(a, queryA); assert(queriesA == 3);
    const auto original = a;
    for (int field = 0; field < 7; ++field) {
        a = original;
        switch (field) {
            case 0: a.texture = &textureB; break;
            case 1: ++a.name; break;
            case 2: ++a.format; break;
            case 3: ++a.flags; break;
            case 4: ++a.mip; break;
            case 5: ++a.face; break;
            case 6: ++a.slice; break;
        }
        const auto n = queriesA;
        srgb.Resolve(a, queryA); srgb.Resolve(a, queryA);
        assert(queriesA == n + 1);
    }
    unsigned failed = 0;
    SourceWasmSrgbTargetCache invalid;
    for (int i = 0; i < 2; ++i)
        assert(invalid.Resolve(a, [&]() { ++failed; return -1; }) == -1);
    assert(failed == 2); // a failed query must not become a permanent cache value

    // A numerical regression for the observed duplicate: 18% linear gray is
    // ~0.461 after the attachment's sRGB transfer, not ~0.704 after both stages.
    const auto encode = [](double value) { return value <= 0.0031308 ? 12.92 * value :
        1.055 * std::pow(value, 1.0 / 2.4) - 0.055; };
    const double correct = encode(0.18), duplicate = encode(std::pow(0.18, 0.454545));
    assert(correct > 0.46 && correct < 0.462);
    assert(duplicate > correct + 0.2);
}
`);
  execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
    '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I', path.join(root, 'patches/files'), source, '-o', executable]);
  execFileSync(executable);
});

test('sRGB patcher preserves existing member prefixes and resolves all anchors before mutation', () => {
  execFileSync('python3', ['-c', String.raw`
import importlib.util, pathlib, tempfile
spec=importlib.util.spec_from_file_location('srgb', 'scripts/apply-srgb-write-patches.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temporary:
    root=pathlib.Path(temporary); originals={}
    for relative,original,replacement in module.replacements():
        originals.setdefault(relative,[]).append(original)
        if relative.endswith('.h') and original.endswith('};'):
            assert replacement.startswith(original[:-2]), 'existing members must keep their offsets'
    for relative,anchors in originals.items():
        file=root/relative; file.parent.mkdir(parents=True,exist_ok=True); file.write_text('\n'.join(anchors))
    before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    planned=module.planned_changes(root)
    assert before=={p:p.read_bytes() for p in before}
    for file,text in planned.items(): file.write_text(text)
    assert module.planned_changes(root)==planned
    late=root/'togles/linuxwin/glmgr_flush.inl'; late.write_text('unknown source revision')
    before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('unknown source accepted')
    assert before=={p:p.read_bytes() for p in before}
    late.write_text(planned[late]+planned[late])
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('ambiguous source accepted')
    late.write_text(planned[late]); helper=root/'public/source_wasm_srgb_write.h'; helper.write_text('foreign helper')
    try: module.planned_changes(root)
    except ValueError: pass
    else: raise AssertionError('foreign helper overwritten')
`], { cwd: root });
});

test('sRGB fix preserves texture storage and leaves shaders without the suffix alone', () => {
  const patcher = readFileSync(path.join(root, 'scripts/apply-srgb-write-patches.py'), 'utf8');
  const draw = readFileSync(path.join(root, 'patches/files/source_wasm_srgb_write_draw.inl'), 'utf8');
  assert.doesNotMatch(patcher + draw, /glTex(?:Image|Storage|SubImage)|glFramebufferTexture|SetValue\(|mat_monitorgamma/);
  assert.match(draw, /if \(location >= 0\)/);
  assert.match(draw, /cache\.Resolve/);
  assert.match(patcher, /attachIndex == kAttColor0/);
  assert.match(patcher, /m_sourceDefaultSrgbTarget\.Invalidate/);
});
