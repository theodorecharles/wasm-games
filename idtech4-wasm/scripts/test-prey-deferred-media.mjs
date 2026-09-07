#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.PREY_DEFERRED_SOURCE || path.join(process.env.IDTECH4_WORK_ROOT || path.join(root,'.work'),'prey-d3wasm/neo');
const read=name=>fs.readFileSync(path.join(source,name),'utf8');
function extract(text,signature) {
  const start=text.indexOf(signature),end=text.indexOf('\n}',start);
  assert.ok(start>=0 && end>start,signature);
  return text.slice(start,end+2);
}
const decl=read('framework/DeclManager.cpp');
const start=decl.indexOf('\t\t// look it up, possibly getting a newly created default decl');
const end=decl.indexOf('\n\t}\n\n\tnumLines =',start);
assert.ok(start>=0 && end>start);
// Compile the exact registration/reparse block, including duplicate rejection.
// The surrounding fixture provides one already-tokenized declaration, not a lexer.
const registration=`bool idDeclFile::Adopt(const idStr &name, declType_t identifiedType) {
 idDeclLocal *newDecl; bool reparse; Src src;
 const char *buffer="real declaration"; int startMarker=0,size=16,sourceLine=1;
 for(int attempt=0;attempt<1;++attempt) {
${decl.slice(start,end)}
 return true;
 } return false;
}`;
const hasRefresh=decl.includes('void idDeclManagerLocal::ReloadFolders()');
if(hasRefresh) {
  const session=read('framework/Session.cpp');
  const transition=extract(session,'void idSessionLocal::ExecuteMapChange(');
  assert.match(transition,/MountDeferredPaks\( newlyMounted \)/);
  assert.match(transition,/if \( newlyMounted \) \{[\s\S]*?declManager->ReloadFolders\(\);/);
  const refresh=transition.indexOf('declManager->ReloadFolders();');
  assert.ok(refresh>transition.indexOf('UnloadMap();'));
  assert.ok(refresh>transition.indexOf('soundSystem->BeginLevelLoad();'));
  assert.ok(refresh<transition.indexOf('uiManager->Reload( true );'));
  const mount=extract(read('framework/FileSystem.cpp'),'bool idFileSystemLocal::MountDeferredPaks(');
  assert.ok(mount.indexOf('newlyMounted = false;')<mount.indexOf('if ( mounted )'));
  assert.ok(mount.indexOf('newlyMounted = true;')>mount.indexOf('mounted = true;'));
}
const production=[registration,
  extract(decl,'void idDeclManagerLocal::RegisterDeclFolder('),
  extract(decl,'void idDeclManagerLocal::Reload( bool force )'),
  hasRefresh?extract(decl,'void idDeclManagerLocal::ReloadFolders()'):
    'void idDeclManagerLocal::ReloadFolders() { Reload(true); }',
  extract(read('renderer/Image_init.cpp'),'void idImageManager::BeginLevelLoad()'),
  extract(read('renderer/Image_load.cpp'),'void\tidImage::ActuallyLoadImage('),
  extract(read('sound/snd_cache.cpp'),'void idSoundCache::BeginLevelLoad()')].join('\n');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'prey-deferred-media-'));
try {
  fs.writeFileSync(path.join(temporary,'prey-deferred-production.h'),production);
  const results=[];
  for(const browser of [true,false]) {
    const binary=path.join(temporary,browser?'browser':'desktop');
    const build=spawnSync(process.env.CXX || 'c++',['-std=c++17','-O1',...(browser?['-DPREYWASM_CLIENT']:[]),
      '-I',temporary,path.join(root,'tests/prey-deferred-media.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,run.stdout+run.stderr);
    results.push({browser,...JSON.parse(run.stdout)});
  }
  const proof={scope:'Exact native declaration-registration/reparse block, folder discovery methods, image/sound BeginLevelLoad and ActuallyLoadImage. Fixture supplies tokenized definitions, in-memory file listings and CPU image/sample loaders; not the native lexer, ZIP reader, GPU, mixer or full-engine gameplay. Legacy refresh uses its original Reload(true), which only visits known files. Desktop control preserves original fallback behavior.',
    productionSHA256:crypto.createHash('sha256').update(production).digest('hex'),hasRefresh,results};
  if(process.env.PREY_DEFERRED_PROOF)fs.writeFileSync(process.env.PREY_DEFERRED_PROOF,JSON.stringify(proof,null,2)+'\n');
  const failed=results.flatMap(r=>r.cases.filter(c=>!c.passed).map(c=>({browser:r.browser,...c})));
  console.log(JSON.stringify({cases:results.reduce((n,r)=>n+r.cases.length,0),failed},null,2));
  if(process.env.PREY_DEFERRED_EXPECT_FAILURE==='1')assert.ok(failed.length>0);
  else assert.equal(failed.length,0,'deferred media must replace early placeholders');
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
