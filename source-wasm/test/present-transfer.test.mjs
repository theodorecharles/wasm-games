import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('authored GLSL compiles and preserves RGB, alpha and Y flip on headless GLES3', t => {
  const result = spawnSync('python3', [path.join(root, 'test/present-transfer-gles.py')], { encoding: 'utf8' });
  if (result.status !== 0 && result.stderr.trim().startsWith('SKIP:')) {
    t.skip(result.stderr.trim());
    return;
  }
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /sRGB gray118, RGB transfer, exact alpha and Y-flip pass/);
});

test('conditional presentation restores GL state, preserves transfer values, caches and cleans resources', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-present-transfer-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'transfer');
  execFileSync(process.env.SOURCE_WASM_HOST_CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror',
    '-fsanitize=undefined', '-fno-sanitize-recover=undefined', '-I', path.join(root, 'patches/files'),
    path.join(root, 'test/present-transfer-state.cpp'), '-o', executable]);
  const output = execFileSync(executable, { encoding: 'utf8' });
  assert.equal(output.split('\n').filter(line => line.includes('shader unavailable')).length, 8);
  assert.equal(output.split('\n').filter(line => line.includes('encoding unavailable')).length, 1);
});

test('presentation patch is strict, preserves diagnostic and blit cleanup paths, and plans before mutation', () => {
  const output = execFileSync('python3', ['-c', String.raw`
import pathlib,runpy,tempfile
m=runpy.run_path('scripts/apply-present-transfer-patches.py')
with tempfile.TemporaryDirectory() as tmp:
    root=pathlib.Path(tmp);file=root/'togles/linuxwin/glmgr.cpp';file.parent.mkdir(parents=True);(root/'public').mkdir()
    diag='#include "source_wasm_present_blit.inl"'
    file.write_text(diag+'\n'+'\n'.join(original for original,_ in m['replacements']())+'\nexisting-blit-and-cleanup')
    before=file.read_text();plan=m['planned_changes'](root);assert file.read_text()==before
    assert diag in plan[file] and plan[file].endswith('existing-blit-and-cleanup')
    assert 'if (blitToBack && blitResolves && formatClass == eColor)' in plan[file]
    assert 'else if (yflip)' in plan[file] and 'Destroy(gGL, this)' in plan[file]
    for path,text in plan.items():path.write_text(text)
    assert m['planned_changes'](root)==plan
    for invalid in ['unknown source',plan[file]+plan[file]]:
        file.write_text(invalid);before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
        try:m['planned_changes'](root)
        except ValueError:pass
        else:raise AssertionError('unknown or ambiguous source accepted')
        assert before=={p:p.read_bytes() for p in before}
print('transfer patch planning passed')
`], { cwd: root, encoding: 'utf8' });
  assert.match(output, /transfer patch planning passed/);
});
