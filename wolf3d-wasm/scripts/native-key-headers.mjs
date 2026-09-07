import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function stageNativeKeyHeaders(temporary) {
  const sdk=process.env.WOLF_SDL_INCLUDE || path.join(process.env.EM_CACHE ||
    path.resolve(root,'../idtech4-wasm/.work/emscripten-cache-6.0.6'),'sysroot/include/SDL');
  const hashes={};
  for(const file of ['SDL_keycode.h','SDL_scancode.h','SDL_compat.h']) {
    assert(fs.existsSync(path.join(sdk,file)),`Missing real SDK header ${file}; set WOLF_SDL_INCLUDE to the SDL include directory.`);
    hashes[file]=createHash('sha256').update(fs.readFileSync(path.join(sdk,file))).digest('hex');
  }
  const aliases=fs.readFileSync(path.join(sdk,'SDL_compat.h'),'utf8').split('\n')
    .filter(line=>/^#define SDLK_/.test(line)).join('\n');
  // Only the key enums/aliases are under test. Avoid including the SDK's
  // wasm32 size_t/platform declarations in a host-native UBSan fixture.
  fs.writeFileSync(path.join(temporary,'wolf-sdk-keycodes.h'),
    '#include <cstdint>\n#define _SDL_stdinc_h\nusing Sint32 = int32_t;\n#include <SDL_keycode.h>\n#undef _SDL_stdinc_h\n'+aliases+'\n');
  return {sdk,hashes};
}
