#!/usr/bin/env node
// Apply the Source Wasm patch set to a user-provided engine tree.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const checkOnly = process.argv.slice(2).includes('--check') || process.argv.slice(2).includes('--dry-run');
const positional = process.argv.slice(2).filter((arg) => arg !== '--check' && arg !== '--dry-run');
const root = positional[0] || process.env.SOURCE_ENGINE_ROOT;
if (!root) {
  console.error('usage: apply-source-patches.mjs [--check] <engine-tree>');
  process.exit(2);
}

const filesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../patches/files');
const PATCH_STATE_VERSION = 'source-wasm-runbook-2026-08-17-v19';
const statePath = path.join(root, '.source-wasm-patch-state.json');
const staged = new Map();
const failures = [];
const appliedLabels = new Set();
const verifiedState = new Set();
const stateFiles = new Map();
let alreadyApplied = 0;
let planned = 0;

if (existsSync(statePath)) {
  let state;
  try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch (error) {
    throw new Error(`invalid patch state ${statePath}: ${error.message}`);
  }
  if (!state || state.version !== PATCH_STATE_VERSION || !Array.isArray(state.labels) || !state.files) {
    throw new Error(`patch state version mismatch at ${statePath}; remove that private state file and audit again`);
  }
  for (const [rel, digest] of Object.entries(state.files)) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) throw new Error(`patch state references missing file ${rel}`);
    const actual = createHash('sha256').update(readFileSync(abs)).digest('hex');
    if (actual !== digest) throw new Error(`patched file changed since audit: ${rel}`);
    stateFiles.set(rel, digest);
  }
  for (const label of state.labels) verifiedState.add(label);
}

function readText(abs) {
  const value = staged.has(abs) ? staged.get(abs) : readFileSync(abs, 'utf8');
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
  return unquietDiagnostics(text);
}

function stage(abs, value) {
  staged.set(abs, value);
}

function unquietDiagnostics(text) {
  const lines = String(text).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== '#if defined(SOURCE_WASM_TRACE)') {
      out.push(lines[i]);
      continue;
    }
    const end = lines.indexOf('#endif', i + 1);
    if (end > i && lines.slice(i + 1, end).some((line) => /(?:Msg|printf)\(\s*["']source-wasm:/.test(line))) {
      out.push(...lines.slice(i + 1, end));
      i = end;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

function quietDiagnostics(text) {
  const lines = String(text).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().startsWith('#if defined(SOURCE_WASM_TRACE)')) {
      out.push(line);
      continue;
    }
    if (!/(?:Msg|printf)\(\s*["']source-wasm:/.test(line)) {
      out.push(line);
      continue;
    }
    out.push('#if defined(SOURCE_WASM_TRACE)');
    out.push(line);
    while (!lineHasStatementEnd(lines[i])) {
      i += 1;
      out.push(lines[i]);
    }
    out.push('#endif');
  }
  return out.join('\n');
}

function lineHasStatementEnd(line) {
  return /;\s*(?:\/\/.*)?$/.test(line);
}

function fail(label, message) {
  failures.push(`${label}: ${message}`);
  console.error(`FAIL ${label}: ${message}`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceMatcher(source, needle, global = false) {
  if (source.includes(needle)) {
    return global ? new RegExp(escapeRegExp(needle), 'g') : needle;
  }
  const lines = String(needle).split('\n');
  const pattern = lines.map((line, index) => {
    const body = escapeRegExp(line.replace(/[ \t]+$/, ''));
    return index === lines.length - 1 ? body : `${body}[ \\t]*\\n`;
  }).join('');
  const regex = new RegExp(pattern, global ? 'g' : 'm');
  return regex.test(source) ? regex : null;
}

function apply(rel, find, replace, label) {
  const abs = path.join(root, rel);
  if (!existsSync(abs) && !staged.has(abs)) {
    fail(label, `missing ${rel} (is this a nillerusr/ToGL 2017-era tree?)`);
    return false;
  }
  if (verifiedState.has(label)) {
    console.log(`skip ${label} (verified patch state)`);
    alreadyApplied += 1;
    appliedLabels.add(label);
    return false;
  }
  const before = readText(abs);
  if (before.includes(replace) || before.includes('SOURCE_WASM_PATCH_' + label)) {
    console.log(`skip ${label}`);
    alreadyApplied += 1;
    appliedLabels.add(label);
    return false;
  }
  const matcher = sourceMatcher(before, find);
  if (!matcher) {
    fail(label, `expected source text is absent from ${rel}; use --check to audit source shape`);
    return false;
  }
  stage(abs, before.replace(matcher, replace));
  appliedLabels.add(label);
  planned += 1;
  console.log(`${checkOnly ? 'would apply' : 'staged'} ${label}`);
  return true;
}

function applyAll(rel, find, replace, label) {
  const abs = path.join(root, rel);
  if (!existsSync(abs) && !staged.has(abs)) {
    fail(label, `missing ${rel} (is this a nillerusr/ToGL 2017-era tree?)`);
    return false;
  }
  if (verifiedState.has(label)) {
    console.log(`skip ${label} (verified patch state)`);
    alreadyApplied += 1;
    appliedLabels.add(label);
    return false;
  }
  const before = readText(abs);
  if (before.includes(replace) || before.includes('SOURCE_WASM_PATCH_' + label)) {
    console.log(`skip ${label}`);
    alreadyApplied += 1;
    appliedLabels.add(label);
    return false;
  }
  const matcher = sourceMatcher(before, find, true);
  if (!matcher) {
    fail(label, `expected source text is absent from ${rel}; use --check to audit source shape`);
    return false;
  }
  stage(abs, before.replace(matcher, replace));
  appliedLabels.add(label);
  planned += 1;
  console.log(`${checkOnly ? 'would apply' : 'staged'} ${label}`);
  return true;
}

// Some upstream ToGL snapshots already omit a compatibility include.  Treat
// that exact, known-safe shape as an idempotent no-op; every other mismatch
// remains a hard failure so a drifted engine cannot be patched silently.
function applyIfPresent(rel, find, replace, label, safeAbsent) {
  const abs = path.join(root, rel);
  if (!existsSync(abs) && !staged.has(abs)) {
    fail(label, `missing ${rel} (is this a nillerusr/ToGL 2017-era tree?)`);
    return false;
  }
  const before = readText(abs);
  if (!before.includes(find) && safeAbsent(before)) {
    console.log(`skip ${label} (known-safe source shape)`);
    alreadyApplied += 1;
    appliedLabels.add(label);
    return false;
  }
  return apply(rel, find, replace, label);
}

function copyInto(rel, destRel) {
  const stateLabel = `copy:${destRel}`;
  const dest = path.join(root, destRel);
  const source = path.join(filesRoot, rel);
  if (!existsSync(source)) {
    fail(`copy:${destRel}`, `missing patch payload ${rel}`);
    return;
  }
  if (verifiedState.has(stateLabel)) {
    console.log(`skip copy:${destRel} (verified patch state)`);
    alreadyApplied += 1;
    appliedLabels.add(stateLabel);
    return;
  }
  const bytes = readFileSync(source);
  const previous = existsSync(dest) ? readFileSync(dest) : null;
  if (previous && previous.equals(bytes)) {
    alreadyApplied += 1;
    console.log(`skip copy:${destRel}`);
    appliedLabels.add(stateLabel);
    return;
  }
  stage(dest, bytes);
  planned += 1;
  appliedLabels.add(stateLabel);
  console.log(`${checkOnly ? 'would copy' : 'staged copy'} ${destRel}`);
}

if (!existsSync(path.join(root, 'wscript')) || !existsSync(path.join(root, 'togles'))) {
  throw new Error(`${root} does not look like a Source 2017 ToGL/TOGLES tree`);
}

copyInto('source_wasm.py', 'scripts/waifulib/source_wasm.py');
copyInto('source_wasm_exports.cpp', 'engine/source_wasm_exports.cpp');

let n = 0;
n += apply(
  'togles/linuxwin/cglmbuffer.cpp',
  'bool g_bDisableStaticBuffer = true; //( Plat_GetCommandLineA() ) ? ( strstr( Plat_GetCommandLineA(), "-gl_disable_static_buffer" ) != NULL ) : false;',
  'bool g_bDisableStaticBuffer = false; // SOURCE_WASM_PATCH_static_gl_buffers',
  'static_gl_buffers'
) ? 1 : 0;

n += apply(
  'engine/sys_dll.cpp',
  `#elif defined(LINUX)
	const int fd = open("/proc/meminfo", O_RDONLY);`,
  `#elif defined(EMSCRIPTEN)
	memsize = 4096ull * 1024ull * 1024ull; // SOURCE_WASM_PATCH_emscripten_memsize
#elif defined(LINUX)
	const int fd = open("/proc/meminfo", O_RDONLY);`,
  'emscripten_memsize'
) ? 1 : 0;

n += apply(
  'engine/sys_dll.cpp',
  'ConVar mem_max_heapsize( "mem_max_heapsize", "256", FCVAR_INTERNAL_USE, "Maximum amount of memory to dedicate to engine hunk and datacache (in mb)" );',
  `#ifdef EMSCRIPTEN
ConVar mem_max_heapsize( "mem_max_heapsize", "1536", FCVAR_INTERNAL_USE, "Maximum amount of memory to dedicate to engine hunk and datacache (in mb)" ); // SOURCE_WASM_PATCH_emscripten_max_heap
#else
ConVar mem_max_heapsize( "mem_max_heapsize", "256", FCVAR_INTERNAL_USE, "Maximum amount of memory to dedicate to engine hunk and datacache (in mb)" );
#endif`,
  'emscripten_max_heap'
) ? 1 : 0;

n += apply(
  'materialsystem/ctexture.cpp',
  '	const int minSize = 2 * 1024 * 1024;	// Uses 2MB min to avoid fragmentation',
  `#ifdef EMSCRIPTEN
	const int minSize = 1; // SOURCE_WASM_PATCH_no_2mb_floor
#else
	const int minSize = 2 * 1024 * 1024;	// Uses 2MB min to avoid fragmentation
#endif`,
  'no_2mb_floor'
) ? 1 : 0;

n += apply(
  'vpklib/packedstore.cpp',
  `#ifdef IS_WINDOWS_PC
				if ( nDesiredPos != fHandle.m_nCurOfs )
					SetFilePointer ( fHandle.m_hFileHandle, nDesiredPos, NULL,  FILE_BEGIN);
				ReadFile( fHandle.m_hFileHandle, pOutData, nNumBytes, (LPDWORD) &nRead, NULL );
#else
				m_pFileSystem->Seek( fHandle.m_hFileHandle, nDesiredPos, FILESYSTEM_SEEK_HEAD );
				nRead = m_pFileSystem->Read( pOutData, nNumBytes, fHandle.m_hFileHandle );
#endif`,
  `#if defined(EMSCRIPTEN)
				m_pFileSystem->Seek( fHandle.m_hFileHandle, nDesiredPos, FILESYSTEM_SEEK_HEAD );
				nRead = m_pFileSystem->Read( pOutData, nNumBytes, fHandle.m_hFileHandle );
#elif defined(IS_WINDOWS_PC)
				if ( nDesiredPos != fHandle.m_nCurOfs )
					SetFilePointer ( fHandle.m_hFileHandle, nDesiredPos, NULL,  FILE_BEGIN);
				ReadFile( fHandle.m_hFileHandle, pOutData, nNumBytes, (LPDWORD) &nRead, NULL );
#else
				m_pFileSystem->Seek( fHandle.m_hFileHandle, nDesiredPos, FILESYSTEM_SEEK_HEAD );
				nRead = m_pFileSystem->Read( pOutData, nNumBytes, fHandle.m_hFileHandle );
#endif`,
  'packedstore_exact_io'
) ? 1 : 0;

n += apply(
  'wscript',
  `	grp.add_option('--togles', action = 'store_true', dest = 'TOGLES', default = False,
		help = 'build engine with ToGLES [default: %default]')`,
  `	grp.add_option('--togles', action = 'store_true', dest = 'TOGLES', default = False,
		help = 'build engine with ToGLES [default: %default]')

	grp.add_option('--emscripten', action = 'store_true', dest = 'EMSCRIPTEN', default = False,
		help = 'build engine with Emscripten / wasm [default: %default]')`,
  'wscript_emscripten_option'
) ? 1 : 0;

n += apply(
  'wscript',
  `	opt.load('reconfigure')`,
  `	opt.load('reconfigure')
	opt.load('source_wasm')`,
  'wscript_load_options'
) ? 1 : 0;

n += apply(
  'wscript',
  `	define_platform(conf)

	if conf.env.TOGLES:`,
  `	define_platform(conf)

	if getattr(conf.options, 'EMSCRIPTEN', False) or os.environ.get('EMSCRIPTEN'):
		conf.env.EMSCRIPTEN = True
		conf.env.append_unique('DEFINES', ['EMSCRIPTEN=1'])
		conf.load('source_wasm')

	if conf.env.TOGLES:`,
  'wscript_emscripten_env'
) ? 1 : 0;

n += apply(
  'wscript',
  `def check_deps(conf):
	if conf.env.DEST_OS != 'win32':`,
  `def check_deps(conf):
	if getattr(conf.env, 'EMSCRIPTEN', False) or os.environ.get('EMSCRIPTEN'):
		return # SOURCE_WASM_PATCH_skip_host_pkgconfig
	if conf.env.DEST_OS != 'win32':`,
  'skip_host_pkgconfig'
) ? 1 : 0;

n += apply(
  'wscript',
  `def build(bld):
	os.environ["CCACHE_DIR"] = os.path.abspath('.ccache/'+bld.env.COMPILER_CC+'/'+bld.env.DEST_OS+'/'+bld.env.DEST_CPU)`,
  `def build(bld):
	if getattr(bld.env, 'EMSCRIPTEN', False):
		from source_wasm import wrap_build
		wrap_build(bld)
	os.environ["CCACHE_DIR"] = os.path.abspath('.ccache/'+bld.env.COMPILER_CC+'/'+bld.env.DEST_OS+'/'+bld.env.DEST_CPU)`,
  'wscript_wrap_build'
) ? 1 : 0;

n += apply(
  'launcher_main/wscript',
  `	install_path = bld.env.BINDIR
	bld(`,
  `	install_path = bld.env.BINDIR
	if getattr(bld.env, 'EMSCRIPTEN', False) or os.environ.get('EMSCRIPTEN'):
		libs = [
			'tier0','vstdlib','tier1','tier2','tier3','mathlib','bitmap','appframework',
			'vpklib','filesystem_stdio','engine','inputsystem','materialsystem',
			'shaderlib','shaderapidx9','stdshader_dx9','togl','datacache','studiorender',
			'vphysics','video_services','vgui_controls','vgui2','vguimatsurface',
			'vgui_surfacelib','matsys_controls','GameUI','client','server',
			'soundemittersystem','scenefilecache','particles','choreoobjects',
			'dmxloader','datamodel','vtf','launcher','steam_api',
			'ivp_physics','ivp_compactbuilder','havana_constraints','hk_math','hk_base',
			'vaudio_minimp3','ServerBrowser'
		]
		target = 'source-engine'
	bld(`,
  'launcher_factory'
) ? 1 : 0;

n += apply(
  'launcher_main/wscript',
  `		target   = PROJECT_NAME,
		name     = PROJECT_NAME,
		features = 'c cxx cxxprogram',
		includes = includes,
		defines  = defines,
		use      = libs,`,
  `		target   = target if 'target' in locals() else PROJECT_NAME,
		name     = PROJECT_NAME,
		features = 'c cxx cxxprogram',
		includes = includes,
		defines  = defines,
		use      = libs,`,
  'launcher_target_name'
) ? 1 : 0;

n += apply(
  'launcher_main/main.cpp',
  `#elif defined (POSIX)`,
  `#elif defined(EMSCRIPTEN)
extern "C" int LauncherMain( int argc, char **argv );
int main( int argc, char *argv[] )
{
	return LauncherMain( argc, argv );
}
#elif defined (POSIX)`,
  'launcher_no_dlopen'
) ? 1 : 0;

n += apply(
  'tier1/interface.cpp',
  `CSysModule *Sys_LoadModule( const char *pModuleName, Sys_Flags flags /* = SYS_NOFLAGS (0) */ )
{
	// If using the Steam filesystem, either the DLL must be a minimum footprint`,
  `CSysModule *Sys_LoadModule( const char *pModuleName, Sys_Flags flags /* = SYS_NOFLAGS (0) */ )
{
#ifdef EMSCRIPTEN
	(void)flags;
	Msg("LoadLibrary(static): %s\\n", pModuleName);
	return reinterpret_cast<CSysModule *>(CreateInterface);
#endif
	// If using the Steam filesystem, either the DLL must be a minimum footprint`,
  'static_loadmodule'
) ? 1 : 0;

n += apply(
  'tier1/interface.cpp',
  `void Sys_UnloadModule( CSysModule *pModule )
{
	if ( !pModule )
		return;

	HMODULE	hDLL = reinterpret_cast<HMODULE>(pModule);`,
  `void Sys_UnloadModule( CSysModule *pModule )
{
	if ( !pModule )
		return;
#ifdef EMSCRIPTEN
	return;
#endif

	HMODULE	hDLL = reinterpret_cast<HMODULE>(pModule);`,
  'static_unloadmodule'
) ? 1 : 0;

n += apply(
  'tier1/interface.cpp',
  `CreateInterfaceFn Sys_GetFactory( CSysModule *pModule )
{
	if ( !pModule )
		return NULL;

	HMODULE	hDLL = reinterpret_cast<HMODULE>(pModule);`,
  `CreateInterfaceFn Sys_GetFactory( CSysModule *pModule )
{
	if ( !pModule )
		return NULL;
#ifdef EMSCRIPTEN
	return reinterpret_cast<CreateInterfaceFn>(pModule);
#endif

	HMODULE	hDLL = reinterpret_cast<HMODULE>(pModule);`,
  'static_getfactory'
) ? 1 : 0;

n += apply(
  'tier1/interface.cpp',
  `CreateInterfaceFn Sys_GetFactory( const char *pModuleName )
{
#ifdef _WIN32
	return static_cast<CreateInterfaceFn>( Sys_GetProcAddress( pModuleName, CREATEINTERFACE_PROCNAME ) );`,
  `CreateInterfaceFn Sys_GetFactory( const char *pModuleName )
{
#ifdef EMSCRIPTEN
	(void)pModuleName;
	return &CreateInterface;
#elif defined( _WIN32 )
	return static_cast<CreateInterfaceFn>( Sys_GetProcAddress( pModuleName, CREATEINTERFACE_PROCNAME ) );`,
  'static_getfactory_name'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/asanstubs.cpp',
  'int	 GLMDisplayDB::GetModeCount( int rendererIndex, int displayIndex ) { } ',
  'int	 GLMDisplayDB::GetModeCount( int rendererIndex, int displayIndex ) { return 1; } // SOURCE_WASM_PATCH_getmodecount',
  'getmodecount'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/cglmbuffer.cpp',
  '		mapPtr = (char*)gGL->glMapBufferRange( m_buffGLTarget, pParams->m_nOffset, pParams->m_nSize, parms);',
  `#ifdef EMSCRIPTEN
		if ( !m_pPseudoBuf )
			m_pPseudoBuf = (char *)malloc( m_nSize ? m_nSize : 1 );
		mapPtr = m_pPseudoBuf + pParams->m_nOffset;
		m_bPseudo = true; // SOURCE_WASM_PATCH_map_fallback
#else
		mapPtr = (char*)gGL->glMapBufferRange( m_buffGLTarget, pParams->m_nOffset, pParams->m_nSize, parms);
#endif`,
  'map_fallback'
) ? 1 : 0;

n += apply(
  'public/tier0/platform.h',
  `#elif defined( __x86_64__ )
	uint32 lo, hi;
	__asm__ __volatile__ ( "rdtsc" : "=a" (lo), "=d" (hi));
	return ( ( ( uint64 )hi ) << 32 ) | lo;
#else
	#error
#endif`,
  `#elif defined( __x86_64__ )
	uint32 lo, hi;
	__asm__ __volatile__ ( "rdtsc" : "=a" (lo), "=d" (hi));
	return ( ( ( uint64 )hi ) << 32 ) | lo;
#elif defined( EMSCRIPTEN )
	struct timespec t;
	clock_gettime( CLOCK_MONOTONIC, &t );
	return ( uint64 )t.tv_sec * 1000000000ULL + ( uint64 )t.tv_nsec;
#else
	#error
#endif`,
  'plat_rdtsc'
) ? 1 : 0;

n += apply(
  'public/tier0/platform.h',
  `#elif defined (__arm__) || defined (__aarch64__)
	inline void SetupFPUControlWord() {}`,
  `#elif defined (__arm__) || defined (__aarch64__) || defined(EMSCRIPTEN)
	inline void SetupFPUControlWord() {}`,
  'fpu_control_word'
) ? 1 : 0;

n += apply(
  'public/materialsystem/imesh.h',
  `inline void CVertexBuilder::FastVertex( const ModelVertexDX7_t &vertex )
{
#if defined(__arm__) || defined(__aarch64__) || defined(PLATFORM_WINDOWS_PC64)
	FastVertexSSE( vertex );`,
  `inline void CVertexBuilder::FastVertex( const ModelVertexDX7_t &vertex )
{
#if defined(__arm__) || defined(__aarch64__) || defined(PLATFORM_WINDOWS_PC64) || defined(EMSCRIPTEN)
	FastVertexSSE( vertex );`,
  'fastvertex_dx7'
) ? 1 : 0;

n += apply(
  'public/materialsystem/imesh.h',
  `inline void CVertexBuilder::FastVertex( const ModelVertexDX8_t &vertex )
{
#if defined(__arm__) || defined(__aarch64__) || defined(PLATFORM_WINDOWS_PC64)
	FastVertexSSE( vertex );`,
  `inline void CVertexBuilder::FastVertex( const ModelVertexDX8_t &vertex )
{
#if defined(__arm__) || defined(__aarch64__) || defined(PLATFORM_WINDOWS_PC64) || defined(EMSCRIPTEN)
	FastVertexSSE( vertex );`,
  'fastvertex_dx8'
) ? 1 : 0;

n += apply(
  'public/mathlib/mathlib.h',
  `#elif defined (__arm__) ||  defined (__aarch64__)
        return (int)(f + 0.5f);
#else
#error Unknown architecture
#endif`,
  `#elif defined (__arm__) ||  defined (__aarch64__) || defined(EMSCRIPTEN)
        return (int)(f + 0.5f);
#else
#error Unknown architecture
#endif`,
  'mathlib_round_int'
) ? 1 : 0;

n += apply(
  'public/mathlib/mathlib.h',
  `#if defined(__arm__) || defined(__aarch64__)
        return (unsigned long)(f + 0.5f);`,
  `#if defined(__arm__) || defined(__aarch64__) || defined(EMSCRIPTEN)
        return (unsigned long)(f + 0.5f);`,
  'mathlib_round_ulong'
) ? 1 : 0;

n += apply(
  'tier0/cpu_posix.cpp',
  `#ifdef LINUX
#include <linux/sysctl.h>
#else`,
  `#ifdef EMSCRIPTEN
#elif defined(LINUX)
#include <linux/sysctl.h>
#else`,
  'cpu_posix_sysctl'
) ? 1 : 0;

n += apply(
  'tier0/cpu_posix.cpp',
  `#define rdtsc(x) \\
	__asm__ __volatile__ ("rdtsc" : "=A" (x))`,
  `#ifdef EMSCRIPTEN
#define rdtsc(x) do { (x) = 0; } while (0)
#else
#define rdtsc(x) \\
	__asm__ __volatile__ ("rdtsc" : "=A" (x))
#endif`,
  'cpu_posix_rdtsc'
) ? 1 : 0;

n += apply(
  'tier0/cpu.cpp',
  `#if defined (__arm__) || defined (__aarch64__) || defined( _X360 )
	return false;`,
  `#if defined (__arm__) || defined (__aarch64__) || defined( _X360 ) || defined( EMSCRIPTEN )
	return false;`,
  'cpu_cpuid'
) ? 1 : 0;

n += apply(
  'tier0/cpu.cpp',
  `#elif defined __arm__ || defined _M_ARM
        return "arm";
#else
#error "Unknown architecture"
#endif`,
  `#elif defined __arm__ || defined _M_ARM
        return "arm";
#elif defined( EMSCRIPTEN )
	return "wasm32";
#else
#error "Unknown architecture"
#endif`,
  'cpu_arch_name'
) ? 1 : 0;

n += apply(
  'tier1/reliabletimer.cpp',
  `#elif (defined( __arm__ ) || defined( __aarch64__ )) && defined (POSIX)
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);
	return ts.tv_sec * 1000000000ULL + ts.tv_nsec;`,
  `#elif ((defined( __arm__ ) || defined( __aarch64__ )) && defined (POSIX)) || defined( EMSCRIPTEN )
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);
	return ts.tv_sec * 1000000000ULL + ts.tv_nsec;`,
  'reliabletimer'
) ? 1 : 0;

n += apply(
  'tier1/processor_detect_linux.cpp',
  `#elif defined (__arm__) || defined (__aarch64__)
bool CheckMMXTechnology(void) { return false; }
bool CheckSSETechnology(void) { return false; }
bool CheckSSE2Technology(void) { return false; }
bool Check3DNowTechnology(void) { return false; }`,
  `#elif defined (__arm__) || defined (__aarch64__) || defined( EMSCRIPTEN )
bool CheckMMXTechnology(void) { return false; }
bool CheckSSETechnology(void) { return false; }
bool CheckSSE2Technology(void) { return false; }
bool Check3DNowTechnology(void) { return false; }`,
  'processor_detect'
) ? 1 : 0;

n += apply(
  'public/saverestoretypes.h',
  `#if !defined( _rotr ) && defined( COMPILER_GCC ) && !defined( __arm__ ) && !defined( __aarch64__ )
#include <x86intrin.h>
#endif`,
  `#if !defined( _rotr ) && defined( COMPILER_GCC ) && !defined( __arm__ ) && !defined( __aarch64__ ) && !defined( EMSCRIPTEN )
#include <x86intrin.h>
#endif`,
  'no_x86intrin'
) ? 1 : 0;

n += apply(
  'public/mathlib/ssemath.h',
  `#if defined( _X360 )
#include <xboxmath.h>
#elif defined(__arm__) || defined(__aarch64__)
#include "sse2neon.h"
#else
#include <xmmintrin.h>
#endif`,
  `#if defined( _X360 )
#include <xboxmath.h>
#elif defined(EMSCRIPTEN)
#elif defined(__arm__) || defined(__aarch64__)
#include "sse2neon.h"
#else
#include <xmmintrin.h>
#endif`,
  'ssemath_no_xmmintrin'
) ? 1 : 0;

n += apply(
  'public/mathlib/ssemath.h',
  `#if defined(GNUC)
#define USE_STDC_FOR_SIMD 0
#else
#define USE_STDC_FOR_SIMD 0
#endif`,
  `#if defined(EMSCRIPTEN)
#define USE_STDC_FOR_SIMD 1
#elif defined(GNUC)
#define USE_STDC_FOR_SIMD 0
#else
#define USE_STDC_FOR_SIMD 0
#endif`,
  'ssemath_stdc'
) ? 1 : 0;

n += apply(
  'public/mathlib/ssemath.h',
  `	return retval;
}
#endif

#elif ( defined( _X360 ) )`,
  `	return retval;
}
#endif

FORCEINLINE uint32 SubFloatConvertToInt( const fltx4 & a, int idx )
{
	return (uint32)SubFloat( a, idx );
}

#elif ( defined( _X360 ) )`,
  'ssemath_subfloat_to_int'
) ? 1 : 0;

n += apply(
  'vphysics/trace.cpp',
  `FORCEINLINE fltx4 ConvertDirectionToIVP( const fltx4 & a )
{
	// swap Z & Y
	fltx4 t = _mm_shuffle_ps( a, a, MM_SHUFFLE_REV( 0, 2, 1, 3 ) );
	// negate Y
	return MulSIMD( t, g_IVPToHLDir );
}`,
  `FORCEINLINE fltx4 ConvertDirectionToIVP( const fltx4 & a )
{
#if defined(EMSCRIPTEN) || USE_STDC_FOR_SIMD
	fltx4 t;
	SubFloat( t, 0 ) = SubFloat( a, 0 );
	SubFloat( t, 1 ) = SubFloat( a, 2 );
	SubFloat( t, 2 ) = SubFloat( a, 1 );
	SubFloat( t, 3 ) = SubFloat( a, 3 );
	return MulSIMD( t, g_IVPToHLDir );
#else
	// swap Z & Y
	fltx4 t = _mm_shuffle_ps( a, a, MM_SHUFFLE_REV( 0, 2, 1, 3 ) );
	// negate Y
	return MulSIMD( t, g_IVPToHLDir );
#endif
}`,
  'vphysics_convert_ivp'
) ? 1 : 0;

n += apply(
  'wscript',
  `	check_deps( conf )

	# indicate if we are packaging for Linux/BSD`,
  `	check_deps( conf )

	if getattr(conf.env, 'EMSCRIPTEN', False):
		for key in ('CFLAGS', 'CXXFLAGS', 'LINKFLAGS'):
			conf.env[key] = [f for f in conf.env[key] if f not in ('-pthread', '-fPIC') and not f.startswith('-march=') and not f.startswith('-mfpmath')]

	# indicate if we are packaging for Linux/BSD`,
  'strip_host_cpu_flags'
) ? 1 : 0;

n += apply(
  'wscript',
  `		bld.add_subproject(projects['game'])
`,
  `		bld.add_subproject(projects['game'])
	if getattr(bld.env, 'EMSCRIPTEN', False):
		from source_wasm import attach_factory
		attach_factory(bld)
`,
  'attach_factory'
) ? 1 : 0;

n += apply(
  'mathlib/sse.cpp',
  `#include "sse.h"

// memdbgon must be the last include file in a .cpp file!!!
#include "tier0/memdbgon.h"

#ifndef COMPILER_MSVC64`,
  `#include "sse.h"

// memdbgon must be the last include file in a .cpp file!!!
#include "tier0/memdbgon.h"

#ifdef EMSCRIPTEN
float _SSE_Sqrt(float x) { return sqrtf(x); }
float _SSE_RSqrtAccurate(float x) { return x != 0.f ? 1.f / sqrtf(x) : 0.f; }
float _SSE_RSqrtFast(float x) { return _SSE_RSqrtAccurate(x); }
float FASTCALL _SSE_VectorNormalize(Vector& vec)
{
	float l = sqrtf(vec.x*vec.x + vec.y*vec.y + vec.z*vec.z);
	if (l > 0.f) { float inv = 1.f / l; vec.x *= inv; vec.y *= inv; vec.z *= inv; }
	return l;
}
void FASTCALL _SSE_VectorNormalizeFast(Vector& vec) { _SSE_VectorNormalize(vec); }
float _SSE_InvRSquared(const float* v) { return 1.f / (v[0]*v[0] + v[1]*v[1] + v[2]*v[2] + 1e-10f); }
void _SSE_SinCos(float x, float* s, float* c) { *s = sinf(x); *c = cosf(x); }
float _SSE_cos(float x) { return cosf(x); }
void _SSE2_SinCos(float x, float* s, float* c) { *s = sinf(x); *c = cosf(x); }
float _SSE2_cos(float x) { return cosf(x); }
void VectorTransformSSE(const float *in1, const matrix3x4_t& in2, float *out1)
{
	out1[0] = in1[0]*in2[0][0] + in1[1]*in2[0][1] + in1[2]*in2[0][2] + in2[0][3];
	out1[1] = in1[0]*in2[1][0] + in1[1]*in2[1][1] + in1[2]*in2[1][2] + in2[1][3];
	out1[2] = in1[0]*in2[2][0] + in1[1]*in2[2][1] + in1[2]*in2[2][2] + in2[2][3];
}
void VectorRotateSSE(const float *in1, const matrix3x4_t& in2, float *out1)
{
	out1[0] = in1[0]*in2[0][0] + in1[1]*in2[0][1] + in1[2]*in2[0][2];
	out1[1] = in1[0]*in2[1][0] + in1[1]*in2[1][1] + in1[2]*in2[1][2];
	out1[2] = in1[0]*in2[2][0] + in1[1]*in2[2][1] + in1[2]*in2[2][2];
}
void _SSE_VectorMA(const float *start, float scale, const float *direction, float *dest)
{
	dest[0] = start[0] + scale * direction[0];
	dest[1] = start[1] + scale * direction[1];
	dest[2] = start[2] + scale * direction[2];
}
#else
#ifndef COMPILER_MSVC64`,
  'sse_emscripten_stubs'
) ? 1 : 0;

n += apply(
  'mathlib/sse.cpp',
  `#endif // COMPILER_MSVC64`,
  `#endif // COMPILER_MSVC64
#endif // EMSCRIPTEN`,
  'sse_emscripten_endif'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glentrypoints.cpp',
  `#if defined(_LINUX) && !defined(__ANDROID__)
#include <GL/glx.h>
#endif`,
  `#if defined(_LINUX) && !defined(__ANDROID__) && !defined(EMSCRIPTEN)
#include <GL/glx.h>
#endif`,
  'no_glx'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glentrypoints.cpp',
  `	const int NEED_MAJOR = 3;
	const int NEED_MINOR = 2;
	const int NEED_PATCH = 0;`,
  `	const int NEED_MAJOR = 3;
#ifdef EMSCRIPTEN
	// WebGL 2 exposes OpenGL ES 3.0, which is the browser target's
	// supported baseline; desktop OpenGL 3.2 is not the right comparison.
	const int NEED_MINOR = 0; // SOURCE_WASM_PATCH_webgl2_gl_version
#else
	const int NEED_MINOR = 2;
#endif
	const int NEED_PATCH = 0;`,
  'webgl2_gl_version'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glmgrbasics.cpp',
  `#ifdef LINUX
#include <linux/sysctl.h>
#else
#include <sys/sysctl.h>
#endif`,
  `#if defined(LINUX) && !defined(EMSCRIPTEN)
#include <linux/sysctl.h>
#else
#ifndef EMSCRIPTEN
#include <sys/sysctl.h>
#endif
#endif`,
  'glmgr_sysctl'
) ? 1 : 0;

n += apply(
  'engine/wscript',
  `	source = [`,
  `	source = [
		'source_wasm_exports.cpp',`,
  'engine_exports'
) ? 1 : 0;

n += apply(
  'public/XUnzip.cpp',
  `#else
		struct timeval tv[2];
		tv[0].tv_sec = ze.atime;
		tv[0].tv_usec = 0;
		tv[1].tv_sec = ze.mtime;
		tv[1].tv_usec = 0;
		futimes( (intptr_t)h, tv );
#endif`,
  `#elif defined(EMSCRIPTEN)
		// Browser MEMFS does not expose futimes; archive timestamps are not
		// needed for the owner-data runtime. // SOURCE_WASM_PATCH_xunzip_no_futimes
#else
		struct timeval tv[2];
		tv[0].tv_sec = ze.atime;
		tv[0].tv_usec = 0;
		tv[1].tv_sec = ze.mtime;
		tv[1].tv_usec = 0;
		futimes( (intptr_t)h, tv );
#endif`,
  'xunzip_no_futimes'
) ? 1 : 0;

n += apply(
  'vstdlib/random.cpp',
  `static CUniformRandomStream s_UniformStream;
static CGaussianRandomStream s_GaussianStream;
static IUniformRandomStream *s_pUniformStream = &s_UniformStream;`,
  `#ifdef EMSCRIPTEN
static CUniformRandomStream &UniformStream()
{
	static CUniformRandomStream stream;
	return stream;
}
static CGaussianRandomStream &GaussianStream()
{
	static CGaussianRandomStream stream;
	return stream;
}
static IUniformRandomStream *s_pUniformStream = NULL;
#else
static CUniformRandomStream s_UniformStream;
static CGaussianRandomStream s_GaussianStream;
static IUniformRandomStream *s_pUniformStream = &s_UniformStream;
#endif`,
  'random_lazy_globals'
) ? 1 : 0;

n += apply(
  'vstdlib/random.cpp',
  `void InstallUniformRandomStream( IUniformRandomStream *pStream )
{
	s_pUniformStream = pStream ? pStream : &s_UniformStream;
}`,
  `void InstallUniformRandomStream( IUniformRandomStream *pStream )
{
#ifdef EMSCRIPTEN
	s_pUniformStream = pStream;
#else
	s_pUniformStream = pStream ? pStream : &s_UniformStream;
#endif
}

#ifdef EMSCRIPTEN
static IUniformRandomStream *ActiveUniformStream()
{
	return s_pUniformStream ? s_pUniformStream : &UniformStream();
}
#endif`,
  'random_lazy_install'
) ? 1 : 0;

n += apply(
  'vstdlib/random.cpp',
  `void RandomSeed( int iSeed )
{
	s_pUniformStream->SetSeed( iSeed );
}

float RandomFloat( float flMinVal, float flMaxVal )
{
	return s_pUniformStream->RandomFloat( flMinVal, flMaxVal );
}

float RandomFloatExp( float flMinVal, float flMaxVal, float flExponent )
{
	return s_pUniformStream->RandomFloatExp( flMinVal, flMaxVal, flExponent );
}

int RandomInt( int iMinVal, int iMaxVal )
{
	return s_pUniformStream->RandomInt( iMinVal, iMaxVal );
}

float RandomGaussianFloat( float flMean, float flStdDev )
{
	return s_GaussianStream.RandomFloat( flMean, flStdDev );
}`,
  `void RandomSeed( int iSeed )
{
#ifdef EMSCRIPTEN
	ActiveUniformStream()->SetSeed( iSeed );
#else
	s_pUniformStream->SetSeed( iSeed );
#endif
}

float RandomFloat( float flMinVal, float flMaxVal )
{
#ifdef EMSCRIPTEN
	return ActiveUniformStream()->RandomFloat( flMinVal, flMaxVal );
#else
	return s_pUniformStream->RandomFloat( flMinVal, flMaxVal );
#endif
}

float RandomFloatExp( float flMinVal, float flMaxVal, float flExponent )
{
#ifdef EMSCRIPTEN
	return ActiveUniformStream()->RandomFloatExp( flMinVal, flMaxVal, flExponent );
#else
	return s_pUniformStream->RandomFloatExp( flMinVal, flMaxVal, flExponent );
#endif
}

int RandomInt( int iMinVal, int iMaxVal )
{
#ifdef EMSCRIPTEN
	return ActiveUniformStream()->RandomInt( iMinVal, iMaxVal );
#else
	return s_pUniformStream->RandomInt( iMinVal, iMaxVal );
#endif
}

float RandomGaussianFloat( float flMean, float flStdDev )
{
#ifdef EMSCRIPTEN
	return GaussianStream().RandomFloat( flMean, flStdDev );
#else
	return s_GaussianStream.RandomFloat( flMean, flStdDev );
#endif
}`,
  'random_lazy_calls'
) ? 1 : 0;

n += apply(
  'vstdlib/random.cpp',
  `	IUniformRandomStream *pUniformStream = m_pUniformStream ? m_pUniformStream : s_pUniformStream;`,
  `#ifdef EMSCRIPTEN
	IUniformRandomStream *pUniformStream = m_pUniformStream ? m_pUniformStream : ActiveUniformStream();
#else
	IUniformRandomStream *pUniformStream = m_pUniformStream ? m_pUniformStream : s_pUniformStream;
#endif`,
  'random_lazy_gaussian'
) ? 1 : 0;

n += apply(
  'vstdlib/KeyValuesSystem.cpp',
  `static CKeyValuesSystem g_KeyValuesSystem;

IKeyValuesSystem *KeyValuesSystem()
{
	return &g_KeyValuesSystem;
}`,
  `#ifdef EMSCRIPTEN
IKeyValuesSystem *KeyValuesSystem()
{
	static CKeyValuesSystem keyValuesSystem;
	return &keyValuesSystem;
}
#else
static CKeyValuesSystem g_KeyValuesSystem;

IKeyValuesSystem *KeyValuesSystem()
{
	return &g_KeyValuesSystem;
}
#endif`,
  'keyvaluessystem_lazy'
) ? 1 : 0;

n += apply(
  'game/shared/usermessages.cpp',
  `		Error( "CUserMessages::Register '%s' already registered\\n", name );`,
  `#ifdef EMSCRIPTEN
		Warning( "CUserMessages::Register '%s' already registered\\n", name );
		return;
#else
		Error( "CUserMessages::Register '%s' already registered\\n", name );
#endif`,
  'usermessages_dup'
) ? 1 : 0;

n += apply(
  'tier0/commandline.cpp',
  `static CCommandLine g_CmdLine;
ICommandLine *CommandLine()
{
	return &g_CmdLine;
}`,
  `#ifdef EMSCRIPTEN
ICommandLine *CommandLine()
{
	static CCommandLine cmdLine;
	return &cmdLine;
}
#else
static CCommandLine g_CmdLine;
ICommandLine *CommandLine()
{
	return &g_CmdLine;
}
#endif`,
  'commandline_lazy'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glentrypoints.cpp',
  `void *VoidFnPtrLookup_GlMgr(const char *fn, bool &okay, const bool bRequired, void *fallback)
{
	void *retval = NULL;
	if ((!okay) && (!bRequired))  // always look up if required (so we get a complete list of crucial missing symbols).
		return NULL;

	// SDL does the right thing, so we never need to use tier0 in this case.
	retval = (*gGL_GetProcAddressCallback)(fn, okay, bRequired, fallback);`,
  `#ifdef EMSCRIPTEN
extern "C" void *emscripten_GetProcAddress(const char *name);
extern "C" void *SDL_GL_GetProcAddress(const char *name);
#endif

void *VoidFnPtrLookup_GlMgr(const char *fn, bool &okay, const bool bRequired, void *fallback)
{
	void *retval = NULL;
	if ((!okay) && (!bRequired))  // always look up if required (so we get a complete list of crucial missing symbols).
		return NULL;

#ifdef EMSCRIPTEN
	retval = emscripten_GetProcAddress(fn);
	if (!retval)
		retval = SDL_GL_GetProcAddress(fn);
#else
	// SDL does the right thing, so we never need to use tier0 in this case.
	retval = (*gGL_GetProcAddressCallback)(fn, okay, bRequired, fallback);
#endif`,
  'togles_gl_lookup'
) ? 1 : 0;

n += apply(
  'appframework/sdlmgr.cpp',
  `#ifdef TOGLES
#include <EGL/egl.h>
#endif`,
  `#ifdef TOGLES
#include <EGL/egl.h>
#endif
#ifdef EMSCRIPTEN
#include <dlfcn.h>
extern "C" void *emscripten_GetProcAddress(const char *name);
#endif`,
  'sdlmgr_dlfcn'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glentrypoints.cpp',
  `#ifdef EMSCRIPTEN
extern "C" void *emscripten_GetProcAddress(const char *name);
#endif`,
  `#ifdef EMSCRIPTEN
extern "C" void *emscripten_GetProcAddress(const char *name);
extern "C" void *SDL_GL_GetProcAddress(const char *name);
#endif
// SOURCE_WASM_PATCH_webgl_sdl_proc_fallback_decl`,
  'webgl_sdl_proc_fallback_decl'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glentrypoints.cpp',
  `#ifdef EMSCRIPTEN
	retval = emscripten_GetProcAddress(fn);
#else`,
  `#ifdef EMSCRIPTEN
	retval = emscripten_GetProcAddress(fn);
	if (!retval)
		retval = SDL_GL_GetProcAddress(fn);
#else
// SOURCE_WASM_PATCH_webgl_sdl_lookup`,
  'webgl_sdl_lookup'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glentrypoints.cpp',
  `	// Note that a non-NULL response doesn't mean it's safe to call the function!`,
  `#ifdef EMSCRIPTEN
	// The ToGL list includes desktop compatibility calls that have no WebGL
	// equivalent. Optional browser lookups must not poison the base GLES state;
	// callers that need one of these functions already gate it on its feature.
	if (!bRequired && (retval == NULL))
		return NULL; // SOURCE_WASM_PATCH_webgl_optional_gl
#endif

	// Note that a non-NULL response doesn't mean it's safe to call the function!`,
  'webgl_optional_gl'
) ? 1 : 0;

n += apply(
  'appframework/sdlmgr.cpp',
  `#if defined ANDROID || defined TOGLES
	// SDL does the right thing, so we never need to use tier0 in this case.
	if( _glGetProcAddress )
	{
		retval = _glGetProcAddress(fn);

		if( !retval && l_gles )
			retval = dlsym( l_gles, fn );
	}`,
  `#if defined(EMSCRIPTEN)
	retval = emscripten_GetProcAddress(fn);
	if (!retval)
		retval = (void *)SDL_GL_GetProcAddress(fn);
	if (!retval)
		retval = dlsym(RTLD_DEFAULT, fn);
	if ((retval == NULL) && (fallback != NULL))
		retval = fallback;
#elif defined ANDROID || defined TOGLES
	// SDL does the right thing, so we never need to use tier0 in this case.
	if( _glGetProcAddress )
	{
		retval = _glGetProcAddress(fn);

		if( !retval && l_gles )
			retval = dlsym( l_gles, fn );
	}`,
  'sdlmgr_gl_lookup'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  `// !!! FIXME: Some of these aren't base OpenGL...pick out the extensions.`,
  `// !!! FIXME: Some of these aren't base OpenGL...pick out the extensions.
#ifdef EMSCRIPTEN
#define SOURCE_WASM_GL_REQUIRED false
#else
#define SOURCE_WASM_GL_REQUIRED true
#endif
// SOURCE_WASM_PATCH_webgl_optional_gl_macro`,
  'webgl_optional_gl_macro'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  'GL_FUNC_VOID(OpenGL,true,glAlphaFunc,(GLenum a,GLclampf b),(a,b))',
  'GL_FUNC_VOID(OpenGL,SOURCE_WASM_GL_REQUIRED,glAlphaFunc,(GLenum a,GLclampf b),(a,b))',
  'webgl_optional_gl_alpha'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  'GL_FUNC_VOID(OpenGL,true,glDrawRangeElementsBaseVertex,(GLenum a,GLuint b,GLuint c,GLsizei d,GLenum e,const GLvoid *f, GLenum g),(a,b,c,d,e,f,g))',
  'GL_FUNC_VOID(OpenGL,SOURCE_WASM_GL_REQUIRED,glDrawRangeElementsBaseVertex,(GLenum a,GLuint b,GLuint c,GLsizei d,GLenum e,const GLvoid *f, GLenum g),(a,b,c,d,e,f,g))',
  'webgl_optional_gl_draw_range'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  'GL_FUNC_VOID(OpenGL,true,glClientActiveTexture,(GLenum a),(a))',
  'GL_FUNC_VOID(OpenGL,SOURCE_WASM_GL_REQUIRED,glClientActiveTexture,(GLenum a),(a))',
  'webgl_optional_gl_client_texture'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  'GL_FUNC_VOID(OpenGL,true,glGetTexLevelParameteriv,(GLenum a,GLint b,GLenum c,GLint *d),(a,b,c,d))',
  'GL_FUNC_VOID(OpenGL,SOURCE_WASM_GL_REQUIRED,glGetTexLevelParameteriv,(GLenum a,GLint b,GLenum c,GLint *d),(a,b,c,d))',
  'webgl_optional_gl_tex_level'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  'GL_FUNC_VOID(OpenGL,true,glColor4f,(GLfloat a,GLfloat b,GLfloat c,GLfloat d),(a,b,c,d))',
  'GL_FUNC_VOID(OpenGL,SOURCE_WASM_GL_REQUIRED,glColor4f,(GLfloat a,GLfloat b,GLfloat c,GLfloat d),(a,b,c,d))',
  'webgl_optional_gl_color'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  'GL_FUNC_VOID(OpenGL,true,glGetFramebufferAttachmentParameteriv,(GLenum a,GLenum b,GLenum c,GLint *d),(a,b,c,d))',
  `GL_FUNC_VOID(OpenGL,true,glGetFramebufferAttachmentParameteriv,(GLenum a,GLenum b,GLenum c,GLint *d),(a,b,c,d))
#ifdef EMSCRIPTEN
#undef SOURCE_WASM_GL_REQUIRED
#endif // SOURCE_WASM_PATCH_webgl_optional_gl_undef`,
  'webgl_optional_gl_undef'
) ? 1 : 0;

n += apply(
  'appframework/sdlmgr.cpp',
  `#if defined( TOGLES )
		if (SDL_GL_LoadLibrary("libGLESv3.so") == -1)
#else
		if (SDL_GL_LoadLibrary(NULL) == -1)
#endif
			Error( "SDL_GL_LoadLibrary(NULL) failed: %s", SDL_GetError() );`,
  `#if defined(EMSCRIPTEN)
		if (SDL_GL_LoadLibrary(NULL) == -1)
			Warning( "SDL_GL_LoadLibrary(NULL) failed: %s\\n", SDL_GetError() );
#elif defined( TOGLES )
		if (SDL_GL_LoadLibrary("libGLESv3.so") == -1)
			Error( "SDL_GL_LoadLibrary(NULL) failed: %s", SDL_GetError() );
#else
		if (SDL_GL_LoadLibrary(NULL) == -1)
			Error( "SDL_GL_LoadLibrary(NULL) failed: %s", SDL_GetError() );
#endif`,
  'sdlmgr_gl_loadlibrary'
) ? 1 : 0;

n += apply(
  'appframework/sdlmgr.cpp',
  `	static CDynamicFunctionOpenGL< true, const GLubyte *( APIENTRY *)(GLenum name), const GLubyte * > glGetString("glGetString");
	static CDynamicFunctionOpenGL< true, GLvoid ( APIENTRY *)(GLenum pname, GLint *params), GLvoid > glGetIntegerv("glGetIntegerv");`,
  `#ifdef EMSCRIPTEN
	gGL = GetOpenGLEntryPoints(VoidFnPtrLookup_GlMgr);
#else
	static CDynamicFunctionOpenGL< true, const GLubyte *( APIENTRY *)(GLenum name), const GLubyte * > glGetString("glGetString");
	static CDynamicFunctionOpenGL< true, GLvoid ( APIENTRY *)(GLenum pname, GLint *params), GLvoid > glGetIntegerv("glGetIntegerv");
#endif`,
  'sdlmgr_skip_static_gl'
) ? 1 : 0;

n += apply(
  'stub_steam/steam_api.cpp',
  `S_API void SteamAPI_WriteMiniDump() {

}

S_API void SteamAPI_SetMiniDumpComment() {

}

S_API void SteamAPI_RunCallbacks() {
}

S_API void SteamAPI_RegisterCallback() {

}

S_API void SteamAPI_UnregisterCallback() {

}

S_API void SteamAPI_RegisterCallResult() {

}

S_API void SteamAPI_UnregisterCallResult() {

}`,
  `S_API void SteamAPI_WriteMiniDump(unsigned int, void *, unsigned int) {

}

S_API void SteamAPI_SetMiniDumpComment(const char *) {

}

S_API void SteamAPI_RunCallbacks() {
}

S_API void SteamAPI_RegisterCallback(void *, int) {

}

S_API void SteamAPI_UnregisterCallback(void *) {

}

S_API void SteamAPI_RegisterCallResult(void *, unsigned long long) {

}

S_API void SteamAPI_UnregisterCallResult(void *, unsigned long long) {

}`,
  'steam_stub_callbacks'
) ? 1 : 0;

n += apply(
  'stub_steam/steam_api.cpp',
  `S_API void SteamAPI_SetTryCatchCallbacks() {

}

S_API void SteamAPI_SetBreakpadAppID() {

}

S_API void SteamAPI_UseBreakpadCrashHandler() {

}`,
  `S_API void SteamAPI_SetTryCatchCallbacks(bool) {

}

S_API void SteamAPI_SetBreakpadAppID(unsigned int) {

}

S_API void SteamAPI_UseBreakpadCrashHandler(const char *, const char *, const char *, bool, void *, void *) {

}`,
  'steam_stub_breakpad'
) ? 1 : 0;

n += apply(
  'stub_steam/steam_api.cpp',
  `S_API int SteamGameServer_InitSafe() {
	return 0;
}`,
  `S_API int SteamGameServer_InitSafe(unsigned int, unsigned short, unsigned short, unsigned short, int, const char *) {
	return 0;
}`,
  'steam_stub_gameserver'
) ? 1 : 0;

n += apply(
  'public/filesystem_init.cpp',
  `	bool bExist = ( _access( filename, 0 ) == 0 );

	return ( bExist );
}`,
  `	bool bExist = ( _access( filename, 0 ) == 0 );
#ifdef EMSCRIPTEN
	if ( !bExist && pDirectoryName && pDirectoryName[0] != '/' )
	{
		char absPath[MAX_PATH];
		Q_snprintf( absPath, sizeof( absPath ), "/game/%s/%s", pDirectoryName, pFilename );
		Q_FixSlashes( absPath );
		bExist = ( _access( absPath, 0 ) == 0 );
	}
#endif

	return ( bExist );
}`,
  'fs_gameinfo_abs'
) ? 1 : 0;

n += apply(
  'public/filesystem_init.cpp',
  `			if ( IsX360() && CommandLine()->FindParm( "-basedir" ) )`,
  `			if ( ( IsX360()
#ifdef EMSCRIPTEN
				|| true
#endif
				) && CommandLine()->FindParm( "-basedir" ) )`,
  'fs_basedir_search'
) ? 1 : 0;

n += apply(
  'engine/sys_dll2.cpp',
  `#if defined( POSIX )
#include <setjmp.h>
#include <signal.h>
#endif`,
  `#if defined( POSIX )
#include <setjmp.h>
#include <signal.h>
#endif
#ifdef EMSCRIPTEN
#include <emscripten.h>
#endif`,
  'sys_dll2_emscripten_inc'
) ? 1 : 0;

n += apply(
  'engine/sys_dll2.cpp',
  `	bool MainLoop();

	int RunListenServer();`,
  `	bool MainLoop();
#ifdef EMSCRIPTEN
	void WasmTick();
#endif

	int RunListenServer();`,
  'sys_dll2_wastick_decl'
) ? 1 : 0;

n += apply(
  'engine/sys_dll2.cpp',
  `bool CEngineAPI::MainLoop()
{
	bool bIdle = true;
	long lIdleCount = 0;

	// Main message pump
	while ( true )
	{`,
  `#ifdef EMSCRIPTEN
void CEngineAPI::WasmTick() // SOURCE_WASM_PATCH_sys_dll2_mainloop
{
	static bool s_loggedTick;
	if ( !s_loggedTick )
	{
		s_loggedTick = true;
		Msg("source-wasm: WasmTick first\\n");
	}
	if ( !eng || eng->GetQuitting() != IEngine::QUIT_NOTQUITTING )
	{
		emscripten_cancel_main_loop();
		return;
	}
	PumpMessages();
#ifdef EMSCRIPTEN
	Msg("source-wasm: WasmTick after Pump\\n");
#endif
	ActivateEditModeShaders( false );
#ifdef EMSCRIPTEN
	Msg("source-wasm: WasmTick before Frame\\n");
#endif
	eng->Frame();
#ifdef EMSCRIPTEN
	Msg("source-wasm: WasmTick after Frame\\n");
#endif
	ActivateEditModeShaders( true );
}

static void SourceWasmEngineTick()
{
	s_EngineAPI.WasmTick();
}

bool CEngineAPI::MainLoop()
{
	emscripten_set_main_loop( SourceWasmEngineTick, 0, 1 );
	return false;
}
#else
bool CEngineAPI::MainLoop()
{
	bool bIdle = true;
	long lIdleCount = 0;

	// Main message pump
	while ( true )
	{`,
  'sys_dll2_mainloop'
) ? 1 : 0;

n += apply(
  'engine/sys_dll2.cpp',
  `	return false;
}


//-----------------------------------------------------------------------------
// Initializes, shuts down the registry
//-----------------------------------------------------------------------------
bool CEngineAPI::InitRegistry( const char *pModName )`,
  `	return false;
}
#endif


//-----------------------------------------------------------------------------
// Initializes, shuts down the registry
//-----------------------------------------------------------------------------
bool CEngineAPI::InitRegistry( const char *pModName )`,
  'sys_dll2_mainloop_endif'
) ? 1 : 0;

n += apply(
  'tier1/interface.cpp',
  `#ifdef EMSCRIPTEN
	(void)flags;
	Msg("LoadLibrary(static): %s\\n", pModuleName);
	return reinterpret_cast<CSysModule *>(CreateInterface);
#endif`,
  `#ifdef EMSCRIPTEN
	(void)flags;
	// One process-wide CreateInterface. Optional DLLs must not resolve
	// to that factory or they Connect/Disconnect the real singleton.
	static const char *skip[] = {
		"sourcevr", "video_bink", "video_webm",
		"stdshader_dbg", "stdshader_dx6", "stdshader_dx7", "stdshader_dx8",
		"vaudio_miles", "vaudio_speex"
	};
	for ( int i = 0; i < (int)(sizeof(skip)/sizeof(skip[0])); ++i )
	{
		if ( V_stristr( pModuleName, skip[i] ) )
		{
			Msg("LoadLibrary(static skip): %s\\n", pModuleName);
			return NULL;
		}
	}
	Msg("LoadLibrary(static): %s\\n", pModuleName);
	return reinterpret_cast<CSysModule *>(CreateInterface);
#endif`,
  'static_loadmodule_skip'
) ? 1 : 0;

n += apply(
  'materialsystem/shadersystem.cpp',
  `	// 360 has the the debug shaders in its dx9 dll
	if ( IsPC() || !IsX360() )
	{
		// Always need the debug shaders
		LoadShaderDLL( "stdshader_dbg" DLL_EXT_STRING );
	}

	// Load up standard shader DLLs...
	int dxSupportLevel = HardwareConfig()->GetMaxDXSupportLevel();
	Assert( dxSupportLevel >= 60 );
	dxSupportLevel /= 10;

	// 360 only supports its dx9 dll
	int dxStart = IsX360() ? 9 : 6;
	char buf[32];
	for ( i = dxStart; i <= dxSupportLevel; ++i )
	{
		Q_snprintf( buf, sizeof( buf ), "stdshader_dx%d%s", i, DLL_EXT_STRING );
		LoadShaderDLL( buf );
	}`,
  `#ifndef EMSCRIPTEN
	// 360 has the the debug shaders in its dx9 dll
	if ( IsPC() || !IsX360() )
	{
		// Always need the debug shaders
		LoadShaderDLL( "stdshader_dbg" DLL_EXT_STRING );
	}

	// Load up standard shader DLLs...
	int dxSupportLevel = HardwareConfig()->GetMaxDXSupportLevel();
	Assert( dxSupportLevel >= 60 );
	dxSupportLevel /= 10;

	// 360 only supports its dx9 dll
	int dxStart = IsX360() ? 9 : 6;
	char buf[32];
	for ( i = dxStart; i <= dxSupportLevel; ++i )
	{
		Q_snprintf( buf, sizeof( buf ), "stdshader_dx%d%s", i, DLL_EXT_STRING );
		LoadShaderDLL( buf );
	}
#else
	// SOURCE_WASM_PATCH_static_shaders: stdshader_*.so share CreateInterface.
#endif`,
  'static_shaders'
) ? 1 : 0;

n += apply(
  'materialsystem/shadersystem.cpp',
  `	if ( !pShaderName )
	{
		pShaderName = HardwareConfig()->GetHWSpecificShaderDLLName();
	}
	if ( pShaderName )
	{
		LoadShaderDLL( pShaderName );
	}`,
  `	if ( !pShaderName )
	{
		pShaderName = HardwareConfig()->GetHWSpecificShaderDLLName();
	}
#ifndef EMSCRIPTEN
	if ( pShaderName )
	{
		LoadShaderDLL( pShaderName );
	}
#else
	(void)pShaderName;
#endif`,
  'static_shaders_hw'
) ? 1 : 0;

n += apply(
  'tier1/convar.cpp',
  `void ConVar_Unregister( )
{
	if ( !g_pCVar || !s_bRegistered )
		return;`,
  `void ConVar_Unregister( )
{
#ifdef EMSCRIPTEN
	return; // SOURCE_WASM_PATCH_keep_cvars
#endif
	if ( !g_pCVar || !s_bRegistered )
		return;`,
  'keep_cvars'
) ? 1 : 0;

n += apply(
  'tier1/convar.cpp',
  `void ConVar_Register( int nCVarFlag, IConCommandBaseAccessor *pAccessor )
{
	if ( !g_pCVar || s_bRegistered )
		return;

	Assert( s_nDLLIdentifier < 0 );
	s_bRegistered = true;
	s_nCVarFlag = nCVarFlag;
	s_nDLLIdentifier = g_pCVar->AllocateDLLIdentifier();

	ConCommandBase *pCur, *pNext;

	ConCommandBase::s_pAccessor = pAccessor ? pAccessor : &s_DefaultAccessor;
	pCur = ConCommandBase::s_pConCommandBases;
	while ( pCur )
	{
		pNext = pCur->m_pNext;
		pCur->AddFlags( s_nCVarFlag );
		pCur->Init();
		pCur = pNext;
	}

	g_pCVar->ProcessQueuedMaterialThreadConVarSets();
	ConCommandBase::s_pConCommandBases = NULL;
}`,
  `void ConVar_Register( int nCVarFlag, IConCommandBaseAccessor *pAccessor )
{
#ifdef EMSCRIPTEN
	if ( !g_pCVar )
		return;
	if ( !s_bRegistered )
	{
		s_bRegistered = true;
		s_nCVarFlag = nCVarFlag;
		s_nDLLIdentifier = g_pCVar->AllocateDLLIdentifier();
		ConCommandBase::s_pAccessor = pAccessor ? pAccessor : &s_DefaultAccessor;
	}
	ConCommandBase *pCur = ConCommandBase::s_pConCommandBases;
	ConCommandBase::s_pConCommandBases = NULL;
	while ( pCur )
	{
		ConCommandBase *pNext = pCur->m_pNext;
		pCur->AddFlags( s_nCVarFlag );
		pCur->Init();
		pCur = pNext;
	}
	g_pCVar->ProcessQueuedMaterialThreadConVarSets();
	return;
#else
	if ( !g_pCVar || s_bRegistered )
		return;

	Assert( s_nDLLIdentifier < 0 );
	s_bRegistered = true;
	s_nCVarFlag = nCVarFlag;
	s_nDLLIdentifier = g_pCVar->AllocateDLLIdentifier();

	ConCommandBase *pCur, *pNext;

	ConCommandBase::s_pAccessor = pAccessor ? pAccessor : &s_DefaultAccessor;
	pCur = ConCommandBase::s_pConCommandBases;
	while ( pCur )
	{
		pNext = pCur->m_pNext;
		pCur->AddFlags( s_nCVarFlag );
		pCur->Init();
		pCur = pNext;
	}

	g_pCVar->ProcessQueuedMaterialThreadConVarSets();
	ConCommandBase::s_pConCommandBases = NULL;
#endif
}`,
  'cvar_reregister'
) ? 1 : 0;

n += apply(
  'tier1/tier1.cpp',
  `	// Don't connect twice..
	if ( s_bConnected )
		return;

	s_bConnected = true;`,
  `	// Don't connect twice..
	if ( s_bConnected && g_pCVar )
		return;

	s_bConnected = false;`,
  'tier1_reconnect'
) ? 1 : 0;

n += apply(
  'tier1/tier1.cpp',
  `		if ( !g_pProcessUtils )
		{
			g_pProcessUtils = ( IProcessUtils * )pFactoryList[i]( PROCESS_UTILS_INTERFACE_VERSION, NULL );
		}
	}
}`,
  `		if ( !g_pProcessUtils )
		{
			g_pProcessUtils = ( IProcessUtils * )pFactoryList[i]( PROCESS_UTILS_INTERFACE_VERSION, NULL );
		}
	}
	if ( g_pCVar )
		s_bConnected = true;
}`,
  'tier1_connected_if_cvar'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderlib/ShaderDLL.cpp',
  `	if ( !bIsMaterialSystem )
	{
		ConVar_Unregister();
		DisconnectTier1Libraries();
	}`,
  `	if ( !bIsMaterialSystem )
	{
#ifndef EMSCRIPTEN
		ConVar_Unregister();
		DisconnectTier1Libraries();
#endif
	}`,
  'shaderdll_keep_cvars'
) ? 1 : 0;

n += apply(
  'materialsystem/cmaterialsystem.cpp',
  `bool CMaterialSystem::OverrideConfig( const MaterialSystem_Config_t &_config, bool forceUpdate )
{
	Assert( m_bGeneratedConfig );
	if ( memcmp( &_config, &g_config, sizeof(_config) ) == 0 )`,
  `bool CMaterialSystem::OverrideConfig( const MaterialSystem_Config_t &_config, bool forceUpdate )
{
	Assert( m_bGeneratedConfig );
#ifdef EMSCRIPTEN
	Msg("source-wasm: OverrideConfig device=%p hw=%p generated=%d\\n",
		g_pShaderDevice, HardwareConfig(), (int)m_bGeneratedConfig );
	if ( !g_pShaderDevice )
	{
		g_config = _config;
		return false;
	}
#endif
	if ( memcmp( &_config, &g_config, sizeof(_config) ) == 0 )`,
  'overrideconfig_null_device'
) ? 1 : 0;

n += apply(
  'materialsystem/cmaterialsystem.cpp',
  `		((config.bCompressedTextures != g_config.bCompressedTextures) && HardwareConfig()->SupportsCompressedTextures())||`,
  `		((config.bCompressedTextures != g_config.bCompressedTextures) && HardwareConfig() && HardwareConfig()->SupportsCompressedTextures())||`,
  'hwconfig_null_compressed'
) ? 1 : 0;

n += apply(
  'materialsystem/cmaterialsystem.cpp',
  `	bool hdre = config.HDREnabled();
	HardwareConfig()->SetHDREnabled( hdre );`,
  `	bool hdre = config.HDREnabled();
	if ( HardwareConfig() )
		HardwareConfig()->SetHDREnabled( hdre );`,
  'hwconfig_null_hdr'
) ? 1 : 0;

n += apply(
  'engine/matsys_interface.cpp',
  `void InitMaterialSystemConfig( bool bInEditMode )
{
	// get the default config for the current card as a starting point.
	g_pMaterialSystemConfig = &materials->GetCurrentConfigForVideoCard();`,
  `void InitMaterialSystemConfig( bool bInEditMode )
{
#ifdef EMSCRIPTEN
	int nCvars = 0;
	if ( g_pCVar )
	{
		for ( const ConCommandBase *p = g_pCVar->GetCommands(); p; p = p->GetNext() )
			++nCvars;
	}
	Msg("source-wasm: InitMaterialSystemConfig cvar=%p count=%d mat_hdr_level=%p\\n",
		g_pCVar, nCvars, g_pCVar ? g_pCVar->FindVar("mat_hdr_level") : NULL );
#endif
	// get the default config for the current card as a starting point.
	g_pMaterialSystemConfig = &materials->GetCurrentConfigForVideoCard();`,
  'matsys_config_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/matsys_interface.cpp',
  `	OverrideMaterialSystemConfigFromCommandLine( config );
	OverrideMaterialSystemConfig( config );`,
  `	OverrideMaterialSystemConfigFromCommandLine( config );
#ifdef EMSCRIPTEN
	Msg("source-wasm: after cmdline override, calling OverrideMaterialSystemConfig\\n");
#endif
	OverrideMaterialSystemConfig( config );
#ifdef EMSCRIPTEN
	Msg("source-wasm: OverrideMaterialSystemConfig returned\\n");
#endif`,
  'matsys_override_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/matsys_interface.cpp',
  `	UpdateMaterialSystemConfig();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: UpdateMaterialSystemConfig\\n");
#endif
	UpdateMaterialSystemConfig();
#ifdef EMSCRIPTEN
	Msg("source-wasm: UpdateMaterialSystemConfig returned\\n");
#endif`,
  'matsys_update_breadcrumb'
) ? 1 : 0;

n += apply(
  'public/tier0/platform.h',
  `#else
# define DebuggerBreak()  raise(SIGTRAP)
#endif
#endif`,
  `#elif defined( EMSCRIPTEN )
# define DebuggerBreak() ((void)0)
#else
# define DebuggerBreak()  raise(SIGTRAP)
#endif
#endif`,
  'debuggerbreak_noop'
) ? 1 : 0;

n += apply(
  'tier0/cpu.cpp',
  `	if ( pi.m_Size == sizeof(pi) )
		return &pi;

	// Fill out the structure, and return it:`,
  `	if ( pi.m_Size == sizeof(pi) )
		return &pi;

#ifdef EMSCRIPTEN
	static char s_szProcessorID[] = "wasm32";
	memset( &pi, 0, sizeof(pi) );
	pi.m_Size = sizeof(pi);
	pi.m_Speed = 2000000000;
	pi.m_nLogicalProcessors = 1;
	pi.m_nPhysicalProcessors = 1;
	pi.m_szProcessorID = s_szProcessorID;
	return &pi;
#endif

	// Fill out the structure, and return it:`,
  'cpuinfo_wasm'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/dxabstract.cpp',
  `	if ( pPresentationParameters->AutoDepthStencilFormat != D3DFMT_D24S8 )
	{
		DXABSTRACT_BREAK_ON_ERROR();
		result = D3DERR_NOTAVAILABLE;
	}`,
  `	if ( pPresentationParameters->AutoDepthStencilFormat != D3DFMT_D24S8 )
	{
#ifdef EMSCRIPTEN
		pPresentationParameters->AutoDepthStencilFormat = D3DFMT_D24S8;
#else
		DXABSTRACT_BREAK_ON_ERROR();
		result = D3DERR_NOTAVAILABLE;
#endif
	}`,
  'd3d_depth_d24s8'
) ? 1 : 0;

n += apply(
  'appframework/sdlmgr.cpp',
  `	nRefreshHz = mode.refresh_rate;
	nWidth = mode.w;
	nHeight = mode.h;
}`,
  `	nRefreshHz = mode.refresh_rate;
	nWidth = mode.w;
	nHeight = mode.h;
#ifdef EMSCRIPTEN
	if ( nWidth == 0 ) nWidth = 1280;
	if ( nHeight == 0 ) nHeight = 720;
	if ( nRefreshHz == 0 ) nRefreshHz = 60;
#endif
}`,
  'sdl_display_fallback'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/shaderdevicedx8.cpp',
  `		// make sure the window fits within the current video mode
		if ( ( info.m_DisplayMode.m_nWidth > displayMode.m_nWidth ) ||
			 ( info.m_DisplayMode.m_nHeight > displayMode.m_nHeight ) )
			return false;`,
  `#ifndef EMSCRIPTEN
		// make sure the window fits within the current video mode
		if ( ( info.m_DisplayMode.m_nWidth > displayMode.m_nWidth ) ||
			 ( info.m_DisplayMode.m_nHeight > displayMode.m_nHeight ) )
			return false;
#endif`,
  'validate_mode_no_desktop_fit'
) ? 1 : 0;

n += apply(
  'engine/host_saverestore.cpp',
  `		g_pSaveThread = CreateThreadPool();
		g_pSaveThread->Start( threadPoolStartParams, "SaveJob" );`,
  `#ifdef EMSCRIPTEN
		g_pSaveThread = NULL;
#else
		g_pSaveThread = CreateThreadPool();
		g_pSaveThread->Start( threadPoolStartParams, "SaveJob" );
#endif`,
  'saverestore_no_threadpool'
) ? 1 : 0;

n += apply(
  'engine/sys_dll.cpp',
  `SpewRetval_t Sys_SpewFunc( SpewType_t spewType, const char *pMsg )
{
	bool suppress = g_bInSpew;`,
  `SpewRetval_t Sys_SpewFunc( SpewType_t spewType, const char *pMsg )
{
#ifdef EMSCRIPTEN
	printf( "%s", pMsg ? pMsg : "" );
	if ( spewType == SPEW_ERROR )
		return SPEW_ABORT;
	return SPEW_CONTINUE;
#endif
	bool suppress = g_bInSpew;`,
  'spew_no_console_deadlock'
) ? 1 : 0;

n += apply(
  'engine/cl_pluginhelpers.cpp',
  `class CMessage : public vgui::Label`,
  `class CPluginHudSnippet : public vgui::Label`,
  'plugin_message_rename_class'
) ? 1 : 0;

n += apply(
  'engine/cl_pluginhelpers.cpp',
  `	DECLARE_CLASS_SIMPLE( CMessage, vgui::Label );
public:
	CMessage(vgui::Panel *parent, const char *panelName, const char *text);
	~CMessage();`,
  `	DECLARE_CLASS_SIMPLE( CPluginHudSnippet, vgui::Label );
public:
	CPluginHudSnippet(vgui::Panel *parent, const char *panelName, const char *text);
	~CPluginHudSnippet();`,
  'plugin_message_rename_decl'
) ? 1 : 0;

n += apply(
  'engine/cl_pluginhelpers.cpp',
  `CMessage::CMessage( vgui::Panel *parent, const char *panelName, const char *text ) : vgui::Label( parent, panelName, text )`,
  `CPluginHudSnippet::CPluginHudSnippet( vgui::Panel *parent, const char *panelName, const char *text ) : vgui::Label( parent, panelName, text )`,
  'plugin_message_rename_ctor'
) ? 1 : 0;

n += apply(
  'engine/cl_pluginhelpers.cpp',
  `CMessage::~CMessage()
{
}

void CMessage::ApplySchemeSettings( vgui::IScheme *pScheme )`,
  `CPluginHudSnippet::~CPluginHudSnippet()
{
}

void CPluginHudSnippet::ApplySchemeSettings( vgui::IScheme *pScheme )`,
  'plugin_message_rename_dtor'
) ? 1 : 0;

n += apply(
  'engine/cl_pluginhelpers.cpp',
  `	CMessage *m_Message;`,
  `	CPluginHudSnippet *m_Message;`,
  'plugin_message_rename_member'
) ? 1 : 0;

n += apply(
  'engine/cl_pluginhelpers.cpp',
  `	m_Message = new CMessage( this, "Msg", "");`,
  `	m_Message = new CPluginHudSnippet( this, "Msg", "");`,
  'plugin_message_rename_new'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `	if ( g_pThreadPool )
		g_pThreadPool->Start( startParams, "CmpJob" );`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: Host_Init skip thread pool\\n");
#else
	if ( g_pThreadPool )
		g_pThreadPool->Start( startParams, "CmpJob" );
#endif`,
  'host_no_threadpool'
) ? 1 : 0;

n += apply(
  'engine/net_ws_queued_packet_sender.cpp',
  `bool CQueuedPacketSender::Setup()
{
	return Start();
}`,
  `bool CQueuedPacketSender::Setup()
{
#ifdef EMSCRIPTEN
	return true;
#else
	return Start();
#endif
}`,
  'queued_packet_no_thread'
) ? 1 : 0;

n += apply(
  'engine/sys_getmodes.cpp',
  `		pRenderContext->Viewport( 0, 0, w, h );
		pRenderContext->DepthRange( 0, 1 );
		pRenderContext->SetToneMappingScaleLinear( Vector(1,1,1) );

		float depth = 0.5f;

		// Make sure we clear both front & back buffer.
		for (int i = 0; i < 2; ++i)
		{
			pRenderContext->ClearColor3ub( 0, 0, 0 );
			pRenderContext->ClearBuffers( true, true, true );
			DrawScreenSpaceRectangle( pMaterial, 0, 0, w, h, 0, 0, tw-1, th-1, tw, th, NULL,1,1,depth );
			DrawScreenSpaceRectangle( pLoadingMaterial, w-lw, h-lh, lw, lh, 0, 0, lw-1, lh-1, lw, lh, NULL,1,1,depth );
			g_pMaterialSystem->SwapBuffers();
		}`,
  `#ifdef EMSCRIPTEN
		// IMesh LockMesh/Draw still has a wasm vtable signature mismatch.
		pRenderContext->Viewport( 0, 0, w, h );
		pRenderContext->ClearColor3ub( 0, 0, 0 );
		pRenderContext->ClearBuffers( true, true, true );
		g_pMaterialSystem->SwapBuffers();
#else
		pRenderContext->Viewport( 0, 0, w, h );
		pRenderContext->DepthRange( 0, 1 );
		pRenderContext->SetToneMappingScaleLinear( Vector(1,1,1) );

		float depth = 0.5f;

		// Make sure we clear both front & back buffer.
		for (int i = 0; i < 2; ++i)
		{
			pRenderContext->ClearColor3ub( 0, 0, 0 );
			pRenderContext->ClearBuffers( true, true, true );
			DrawScreenSpaceRectangle( pMaterial, 0, 0, w, h, 0, 0, tw-1, th-1, tw, th, NULL,1,1,depth );
			DrawScreenSpaceRectangle( pLoadingMaterial, w-lw, h-lh, lw, lh, 0, 0, lw-1, lh-1, lw, lh, NULL,1,1,depth );
			g_pMaterialSystem->SwapBuffers();
		}
#endif`,
  'startup_graphic_no_mesh_trap'
) ? 1 : 0;

n += apply(
  'engine/sys_getmodes.cpp',
  `bool CVideoMode_Common::CreateGameWindow( int nWidth, int nHeight, bool bWindowed )
{
    COM_TimestampedLog( "CVideoMode_Common::Init  CreateGameWindow" );`,
  `bool CVideoMode_Common::CreateGameWindow( int nWidth, int nHeight, bool bWindowed )
{
#ifdef EMSCRIPTEN
	if ( nWidth <= 0 ) nWidth = 1280;
	if ( nHeight <= 0 ) nHeight = 720;
#endif
    COM_TimestampedLog( "CVideoMode_Common::Init  CreateGameWindow" );`,
  'create_window_min_size'
) ? 1 : 0;

n += apply(
  'engine/sys_getmodes.cpp',
  `bool CVideoMode_MaterialSystem::SetMode( int nWidth, int nHeight, bool bWindowed )
{
    // Necessary for mode selection to work
    int nFoundMode = FindVideoMode( nWidth, nHeight, bWindowed );`,
  `bool CVideoMode_MaterialSystem::SetMode( int nWidth, int nHeight, bool bWindowed )
{
#ifdef EMSCRIPTEN
	if ( nWidth <= 0 ) nWidth = 1280;
	if ( nHeight <= 0 ) nHeight = 720;
#endif
    // Necessary for mode selection to work
    int nFoundMode = FindVideoMode( nWidth, nHeight, bWindowed );`,
  'setmode_min_size'
) ? 1 : 0;

n += apply(
  'engine/sys_dll2.cpp',
  `#if !defined( DEDICATED )
//	if ( CommandLine()->FindParm( "-tools" ) )
	{
		AppModule_t toolFrameworkModule = LoadModule( "engine" DLL_EXT_STRING );

		if ( !AddSystem( toolFrameworkModule, VTOOLFRAMEWORK_INTERFACE_VERSION ) )
			return false;
	}
#endif`,
  `#if !defined( DEDICATED ) && !defined( EMSCRIPTEN )
//	if ( CommandLine()->FindParm( "-tools" ) )
	{
		AppModule_t toolFrameworkModule = LoadModule( "engine" DLL_EXT_STRING );

		if ( !AddSystem( toolFrameworkModule, VTOOLFRAMEWORK_INTERFACE_VERSION ) )
			return false;
	}
#endif`,
  'modappsystem_no_tools'
) ? 1 : 0;

n += apply(
  'engine/net_ws.cpp',
  `	const int nProtocol = X360SecureNetwork() ? IPPROTO_VDP : IPPROTO_UDP;

	// open client socket for masterserver
	OpenSocketInternal( NS_CLIENT, clientport.GetInt(), PORT_SERVER, "client", nProtocol, true );

	if ( bIsDedicated )
	{
		// set dedicated MP mode
		NET_SetDedicated();
	}
	else
	{
		// set SP mode
		NET_ConfigLoopbackBuffers( true );
	}
}`,
  `	const int nProtocol = X360SecureNetwork() ? IPPROTO_VDP : IPPROTO_UDP;

#ifdef EMSCRIPTEN
	net_noip = true;
#else
	// open client socket for masterserver
	OpenSocketInternal( NS_CLIENT, clientport.GetInt(), PORT_SERVER, "client", nProtocol, true );
#endif

	if ( bIsDedicated )
	{
		// set dedicated MP mode
		NET_SetDedicated();
	}
	else
	{
		// set SP mode
		NET_ConfigLoopbackBuffers( true );
	}
}`,
  'net_init_no_udp'
) ? 1 : 0;

n += apply(
  'public/tier0/threadtools.inl',
  `INLINE_ON_PS3 bool CThread::Start( unsigned nBytesStack, ThreadPriorityEnum_t nPriority )
{
	AUTO_LOCK( m_Lock );`,
  `INLINE_ON_PS3 bool CThread::Start( unsigned nBytesStack, ThreadPriorityEnum_t nPriority )
{
#ifdef EMSCRIPTEN
	(void)nBytesStack;
	(void)nPriority;
	Msg("source-wasm: CThread::Start skipped (%s)\\n", m_szName[0] ? m_szName : "?");
	return false;
#endif
	AUTO_LOCK( m_Lock );`,
  'cthread_start_no_pthread'
) ? 1 : 0;

n += apply(
  'tier0/threadtools.cpp',
  `	pthread_t tid;
	pthread_create( &tid, NULL, ThreadProcConvert, new ThreadProcInfo_t( pfnThread, pParam ) );
	return ( ThreadHandle_t ) tid;
#else
	Assert( 0 );
	DebuggerBreak();
	return 0;
#endif
}

ThreadHandle_t CreateSimpleThread( ThreadFunc_t pfnThread, void *pParam, ThreadId_t *pID, unsigned stackSize )`,
  `	pthread_t tid;
#ifdef EMSCRIPTEN
	(void)pfnThread;
	(void)pParam;
	(void)stackSize;
	return 0;
#else
	pthread_create( &tid, NULL, ThreadProcConvert, new ThreadProcInfo_t( pfnThread, pParam ) );
	return ( ThreadHandle_t ) tid;
#endif
#else
	Assert( 0 );
	DebuggerBreak();
	return 0;
#endif
}

ThreadHandle_t CreateSimpleThread( ThreadFunc_t pfnThread, void *pParam, ThreadId_t *pID, unsigned stackSize )`,
  'simple_thread_no_pthread'
) ? 1 : 0;

n += apply(
  'tier0/threadtools.cpp',
  `	pthread_t tid;
	pthread_create( &tid, NULL, ThreadProcConvert, new ThreadProcInfo_t( pfnThread, pParam ) );
	if( pID )
		*pID = (ThreadId_t)tid;
	return ( ThreadHandle_t ) tid;`,
  `	pthread_t tid;
#ifdef EMSCRIPTEN
	(void)pfnThread;
	(void)pParam;
	(void)stackSize;
	if( pID )
		*pID = 0;
	return 0;
#else
	pthread_create( &tid, NULL, ThreadProcConvert, new ThreadProcInfo_t( pfnThread, pParam ) );
	if( pID )
		*pID = (ThreadId_t)tid;
	return ( ThreadHandle_t ) tid;
#endif`,
  'simple_thread_id_no_pthread'
) ? 1 : 0;

n += apply(
  'tier0/threadtools.cpp',
  `#elif defined(POSIX)
	int iResult = pthread_kill( OS_TO_PTHREAD(uThreadId), 0 );
	if ( iResult == 0 )
		return true;

	return false;
#endif
}`,
  `#elif defined(POSIX)
#ifdef EMSCRIPTEN
	return false; // SOURCE_WASM_PATCH_thread_running_no_pthread_kill
#else
	int iResult = pthread_kill( OS_TO_PTHREAD(uThreadId), 0 );
	if ( iResult == 0 )
		return true;

	return false;
#endif
#endif
}`,
  'thread_running_no_pthread_kill'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `void CEngineVGui::Init()
{
	COM_TimestampedLog( "Loading gameui.dll" );

	// load the GameUI dll
	const char *szDllName = "GameUI";
	m_hStaticGameUIModule = g_pFileSystem->LoadModule(szDllName, "EXECUTABLE_PATH", true); // LoadModule() does a GetLocalCopy() call
	m_GameUIFactory = Sys_GetFactory(m_hStaticGameUIModule);`,
  `void CEngineVGui::Init()
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui::Init start\\n");
#endif
	COM_TimestampedLog( "Loading gameui.dll" );

	// load the GameUI dll
	const char *szDllName = "GameUI";
	m_hStaticGameUIModule = g_pFileSystem->LoadModule(szDllName, "EXECUTABLE_PATH", true); // LoadModule() does a GetLocalCopy() call
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui LoadModule factory=%p\\n", (void *)m_hStaticGameUIModule);
#endif
	m_GameUIFactory = Sys_GetFactory(m_hStaticGameUIModule);`,
  'enginevgui_init_breadcrumbs'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	if ( !vgui::scheme()->LoadSchemeFromFile( pStr, "Tracker" ))
	{
		Sys_Error( "Error loading file %s\\n", pStr );
		return;
	}`,
  `	if ( !vgui::scheme()->LoadSchemeFromFile( pStr, "Tracker" ))
	{
		Sys_Error( "Error loading file %s\\n", pStr );
		return;
	}
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui scheme loaded\\n");
#endif`,
  'enginevgui_scheme_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	if ( IsPC() )
	{
		COM_TimestampedLog( "Building Panels (staticDebugSystemPanel)" );

		staticDebugSystemPanel = new CDebugSystemPanel( staticPanel, "Engine Debug System" );`,
  `	if ( IsPC() )
	{
#ifdef EMSCRIPTEN
		Msg("source-wasm: EngineVGui skip PC debug tools\\n");
#else
		COM_TimestampedLog( "Building Panels (staticDebugSystemPanel)" );

		staticDebugSystemPanel = new CDebugSystemPanel( staticPanel, "Engine Debug System" );`,
  'enginevgui_skip_debug_tools_open'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		colorcorrectiontools->InstallColorCorrectionUI( staticEngineToolsPanel );
		colorcorrectiontools->Init();
	}`,
  `		colorcorrectiontools->InstallColorCorrectionUI( staticEngineToolsPanel );
		colorcorrectiontools->Init();
#endif
	}`,
  'enginevgui_skip_debug_tools_close'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	if ( IsPC() )
	{
		Con_CreateConsolePanel( staticEngineToolsPanel );
		CL_CreateEntityReportPanel( staticEngineToolsPanel );
		VGui_CreateDrawTreePanel( staticEngineToolsPanel );
		CL_CreateTextureListPanel( staticEngineToolsPanel );
		CreateVProfPanels( staticEngineToolsPanel );
	}`,
  `	if ( IsPC() )
	{
#ifdef EMSCRIPTEN
		Msg("source-wasm: EngineVGui skip vprof/console tools\\n");
#else
		Con_CreateConsolePanel( staticEngineToolsPanel );
		CL_CreateEntityReportPanel( staticEngineToolsPanel );
		VGui_CreateDrawTreePanel( staticEngineToolsPanel );
		CL_CreateTextureListPanel( staticEngineToolsPanel );
		CreateVProfPanels( staticEngineToolsPanel );
#endif
	}`,
  'enginevgui_skip_vprof_tools'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	staticEngineToolsPanel->LoadControlSettings( "scripts/EngineVGuiLayout.res" );

	COM_TimestampedLog( "materials->CacheUsedMaterials()" );

	// Make sure that these materials are in the materials cache
	materials->CacheUsedMaterials();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui skip tools layout/cache\\n");
#else
	staticEngineToolsPanel->LoadControlSettings( "scripts/EngineVGuiLayout.res" );

	COM_TimestampedLog( "materials->CacheUsedMaterials()" );

	// Make sure that these materials are in the materials cache
	materials->CacheUsedMaterials();
#endif`,
  'enginevgui_skip_tools_layout'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	g_pVGuiLocalize->AddFile( "Resource/valve_%language%.txt" );

	COM_TimestampedLog( "staticGameUIFuncs->Initialize" );`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui localize\\n");
#endif
	g_pVGuiLocalize->AddFile( "Resource/valve_%language%.txt" );
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui localize done\\n");
#endif

	COM_TimestampedLog( "staticGameUIFuncs->Initialize" );`,
  'enginevgui_localize_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	staticGameUIFuncs->Initialize( g_AppSystemFactory );

	COM_TimestampedLog( "staticGameUIFuncs->Start" );
	staticGameUIFuncs->Start();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui GameUI Initialize\\n");
#endif
	staticGameUIFuncs->Initialize( g_AppSystemFactory );
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui GameUI Initialize done\\n");
#endif

	COM_TimestampedLog( "staticGameUIFuncs->Start" );
	staticGameUIFuncs->Start();
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui GameUI Start done\\n");
#endif`,
  'enginevgui_gameui_breadcrumbs'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `	COM_TimestampedLog( "ActivateGameUI()" );
	ActivateGameUI();`,
  `	COM_TimestampedLog( "ActivateGameUI()" );
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui ActivateGameUI\\n");
#endif
	ActivateGameUI();
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui ActivateGameUI done\\n");
#endif`,
  'enginevgui_activate_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `		TRACEINIT( EngineVGui()->Init(), EngineVGui()->Shutdown() );`,
  `#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init EngineVGui\\n");
#endif
		TRACEINIT( EngineVGui()->Init(), EngineVGui()->Shutdown() );
#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init EngineVGui done\\n");
#endif`,
  'host_enginevgui_breadcrumb'
) ? 1 : 0;

n += apply(
  'gameui/GameUI_Interface.cpp',
  `void CGameUI::Initialize( CreateInterfaceFn factory )
{
	ConnectTier1Libraries( &factory, 1 );`,
  `void CGameUI::Initialize( CreateInterfaceFn factory )
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: CGameUI::Initialize\\n");
#endif
	ConnectTier1Libraries( &factory, 1 );`,
  'gameui_init_breadcrumb'
) ? 1 : 0;

n += apply(
  'gameui/GameUI_Interface.cpp',
  `	staticPanel = new CBasePanel();
	staticPanel->SetBounds(0, 0, 400, 300 );`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CGameUI new CBasePanel\\n");
#endif
	staticPanel = new CBasePanel();
#ifdef EMSCRIPTEN
	Msg("source-wasm: CGameUI CBasePanel ready\\n");
#endif
	staticPanel->SetBounds(0, 0, 400, 300 );`,
  'gameui_basepanel_breadcrumb'
) ? 1 : 0;

n += apply(
  'gameui/GameUI_Interface.cpp',
  `		if ( IsPC() )
		{
#ifdef WIN32
			if ( ::GetModuleFileName( ( HINSTANCE )GetModuleHandle( NULL ), platformDir, bufferSize ) )`,
  `		if ( IsPC() )
		{
#ifdef EMSCRIPTEN
			Q_strncpy(platformDir, "/game/platform/", bufferSize);
			return true;
#elif defined(WIN32)
			if ( ::GetModuleFileName( ( HINSTANCE )GetModuleHandle( NULL ), platformDir, bufferSize ) )`,
  'gameui_platform_dir'
) ? 1 : 0;

n += apply(
  'gameui/BasePanel.cpp',
  `	if ( SteamClient() )
	{
		HSteamPipe steamPipe = SteamClient()->CreateSteamPipe();
		ISteamUtils *pUtils = SteamClient()->GetISteamUtils( steamPipe, "SteamUtils002" );
		if ( pUtils )
		{
			bSteamCommunityFriendsVersion = true;
		}

		SteamClient()->BReleaseSteamPipe( steamPipe );
	}`,
  `#ifndef EMSCRIPTEN
	if ( SteamClient() )
	{
		HSteamPipe steamPipe = SteamClient()->CreateSteamPipe();
		ISteamUtils *pUtils = SteamClient()->GetISteamUtils( steamPipe, "SteamUtils002" );
		if ( pUtils )
		{
			bSteamCommunityFriendsVersion = true;
		}

		SteamClient()->BReleaseSteamPipe( steamPipe );
	}
#endif`,
  'gameui_skip_steam_pipe'
) ? 1 : 0;

n += apply(
  'gameui/BasePanel.cpp',
  `	CreateGameMenu();
	CreateGameLogo();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CBasePanel CreateGameMenu\\n");
#endif
	CreateGameMenu();
#ifdef EMSCRIPTEN
	Msg("source-wasm: CBasePanel CreateGameLogo\\n");
#endif
	CreateGameLogo();`,
  'gameui_menu_breadcrumbs'
) ? 1 : 0;

n += applyAll(
  'vgui2/src/InputWin32.cpp',
  'CInputSystem',
  'CVguiInputSystem',
  'vgui_input_odr_rename'
) ? 1 : 0;

n += applyAll(
  'engine/vgui_basepanel.h',
  'CBasePanel',
  'CEngineBasePanel',
  'engine_basepanel_odr_h'
) ? 1 : 0;

n += applyAll(
  'engine/vgui_basepanel.cpp',
  'CBasePanel',
  'CEngineBasePanel',
  'engine_basepanel_odr_cpp'
) ? 1 : 0;

n += applyAll(
  'engine/console.cpp',
  'CBasePanel',
  'CEngineBasePanel',
  'engine_conpanel_odr'
) ? 1 : 0;

n += applyAll(
  'engine/cl_entityreport.cpp',
  'CBasePanel',
  'CEngineBasePanel',
  'engine_entityreport_odr'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `		TRACEINIT( TextMessageInit(), TextMessageShutdown() );

		TRACEINIT( ClientDLL_Init(), ClientDLL_Shutdown() );

		TRACEINIT( SCR_Init(), SCR_Shutdown() );

		TRACEINIT( R_Init(), R_Shutdown() );

		TRACEINIT( Decal_Init(), Decal_Shutdown() );

		// hookup interfaces
		EngineVGui()->Connect();`,
  `#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init TextMessage\\n");
#endif
		TRACEINIT( TextMessageInit(), TextMessageShutdown() );
#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init ClientDLL\\n");
#endif
		TRACEINIT( ClientDLL_Init(), ClientDLL_Shutdown() );
#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init ClientDLL done\\n");
#endif

		TRACEINIT( SCR_Init(), SCR_Shutdown() );
#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init SCR/R/Decal\\n");
#endif
		TRACEINIT( R_Init(), R_Shutdown() );

		TRACEINIT( Decal_Init(), Decal_Shutdown() );

		// hookup interfaces
#ifdef EMSCRIPTEN
		Msg("source-wasm: Host_Init EngineVGui Connect\\n");
#endif
		EngineVGui()->Connect();`,
  'host_after_vgui_breadcrumbs'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `#ifndef SWDS
	Host_ReadConfiguration();
	TRACEINIT( S_Init(), S_Shutdown() );
#endif`,
  `#ifndef SWDS
#ifdef EMSCRIPTEN
	Msg("source-wasm: Host_Init ReadConfiguration\\n");
#endif
	Host_ReadConfiguration();
#ifdef EMSCRIPTEN
	Msg("source-wasm: Host_Init S_Init\\n");
#endif
	TRACEINIT( S_Init(), S_Shutdown() );
#ifdef EMSCRIPTEN
	Msg("source-wasm: Host_Init S_Init done\\n");
#endif
#endif`,
  'host_sound_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `	// Finished initializing
	host_initialized = true;`,
  `	// Finished initializing
#ifdef EMSCRIPTEN
	Msg("source-wasm: Host_Init host_initialized\\n");
#endif
	host_initialized = true;`,
  'host_initialized_breadcrumb'
) ? 1 : 0;

n += apply(
  'engine/cdll_engine_int.cpp',
  `void ClientDLL_Init( void )
{
	extern void CL_SetSteamCrashComment();`,
  `void ClientDLL_Init( void )
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: ClientDLL_Init start\\n");
#endif
	extern void CL_SetSteamCrashComment();`,
  'clientdll_init_start'
) ? 1 : 0;

n += apply(
  'engine/cdll_engine_int.cpp',
  `		if ( !g_ClientDLL->Init(g_AppSystemFactory, g_AppSystemFactory, &g_ClientGlobalVariables ) )
		{
			Sys_Error("Client.dll Init() in library client failed.");
		}`,
  `#ifdef EMSCRIPTEN
		Msg("source-wasm: ClientDLL g_ClientDLL->Init\\n");
#endif
		if ( !g_ClientDLL->Init(g_AppSystemFactory, g_AppSystemFactory, &g_ClientGlobalVariables ) )
		{
			Sys_Error("Client.dll Init() in library client failed.");
		}
#ifdef EMSCRIPTEN
		Msg("source-wasm: ClientDLL g_ClientDLL->Init done\\n");
#endif`,
  'clientdll_init_call'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `	if (!VGui_Startup( appSystemFactory ))
		return false;`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient VGui_Startup\\n");
#endif
	if (!VGui_Startup( appSystemFactory ))
		return false;
#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient VGui_Startup done\\n");
#endif`,
  'client_vgui_startup'
) ? 1 : 0;

n += apply(
  'game/client/clientmode_shared.cpp',
  `	// Derived ClientMode class must make sure m_Viewport is instantiated
	Assert( m_pViewport );
	m_pViewport->LoadControlSettings( "scripts/HudLayout.res", NULL, NULL, pConditions );`,
  `	// Derived ClientMode class must make sure m_Viewport is instantiated
	Assert( m_pViewport );
#ifdef EMSCRIPTEN
	Msg("source-wasm: ClientMode skip HudLayout\\n");
	(void)pConditions;
#else
	m_pViewport->LoadControlSettings( "scripts/HudLayout.res", NULL, NULL, pConditions );
#endif`,
  'clientmode_skip_hudlayout'
) ? 1 : 0;

n += apply(
  'game/client/clientmode_shared.cpp',
  `#ifndef _XBOX
	HLTVCamera()->Init();
#if defined( REPLAY_ENABLED )
	ReplayCamera()->Init();
#endif
#endif`,
  `#ifndef _XBOX
#ifndef EMSCRIPTEN
	HLTVCamera()->Init();
#if defined( REPLAY_ENABLED )
	ReplayCamera()->Init();
#endif
#endif
#endif`,
  'clientmode_skip_hltv'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `	modemanager->Init( );

	g_pClientMode->InitViewport();

	gHUD.Init();
	gTouch.Init();

	g_pClientMode->Init();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient modemanager\\n");
#endif
	modemanager->Init( );

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient InitViewport\\n");
#endif
	g_pClientMode->InitViewport();

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient gHUD.Init\\n");
#endif
	gHUD.Init();
	gTouch.Init();

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient clientmode Init\\n");
#endif
	g_pClientMode->Init();`,
  'client_viewport_breadcrumbs'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `	g_pClientMode->Init();

	if ( !IGameSystem::InitAllSystems() )
		return false;

	g_pClientMode->Enable();`,
  `	g_pClientMode->Init();
#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient clientmode Init done\\n");
	Msg("source-wasm: CHLClient skip InitAllSystems\\n");
#else
	if ( !IGameSystem::InitAllSystems() )
		return false;
#endif

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient Enable/view\\n");
#endif
	g_pClientMode->Enable();`,
  'client_skip_initallsystems'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `	view->Init();
	vieweffects->Init();

	C_BaseTempEntity::PrecacheTempEnts();

	input->Init_All();

	VGui_CreateGlobalPanels();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient view->Init\\n");
#endif
	view->Init();
	vieweffects->Init();
#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient view done\\n");
#endif

	C_BaseTempEntity::PrecacheTempEnts();

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient input/vgui panels\\n");
#endif
	input->Init_All();

	VGui_CreateGlobalPanels();`,
  'client_view_breadcrumbs'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		staticClientDLLPanel->SetVisible( false );
		staticClientDLLToolsPanel->SetVisible( false );

		vgui::surface()->PaintTraverseEx(pVPanel, true );

		staticClientDLLPanel->SetVisible( saveVisible );`,
  `		staticClientDLLPanel->SetVisible( false );
		staticClientDLLToolsPanel->SetVisible( false );

#ifdef EMSCRIPTEN
		// IMesh PaintTraverse traps on this wasm link.
#else
		vgui::surface()->PaintTraverseEx(pVPanel, true );
#endif

		staticClientDLLPanel->SetVisible( saveVisible );`,
  'enginevgui_skip_paint_traverse'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		vgui::ipanel()->SetParent( ingameRoot, 0 );
		vgui::surface()->PaintTraverseEx( ingameRoot, true );
		vgui::ipanel()->SetParent( ingameRoot, saveParent );`,
  `		vgui::ipanel()->SetParent( ingameRoot, 0 );
#ifndef EMSCRIPTEN
		vgui::surface()->PaintTraverseEx( ingameRoot, true );
#endif
		vgui::ipanel()->SetParent( ingameRoot, saveParent );`,
  'enginevgui_skip_ingame_paint'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		vgui::ipanel()->SetParent( ingameToolsRoot, 0 );
		vgui::surface()->PaintTraverseEx( ingameToolsRoot, true );
		vgui::ipanel()->SetParent( ingameToolsRoot, saveToolParent );`,
  `		vgui::ipanel()->SetParent( ingameToolsRoot, 0 );
#ifndef EMSCRIPTEN
		vgui::surface()->PaintTraverseEx( ingameToolsRoot, true );
#endif
		vgui::ipanel()->SetParent( ingameToolsRoot, saveToolParent );`,
  'enginevgui_skip_tools_paint'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `void CEngineVGui::Simulate()
{
	toolframework->VGui_PreSimulateAllTools();`,
  `void CEngineVGui::Simulate()
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui::Simulate skip RunFrame\\n");
	return;
#endif
	toolframework->VGui_PreSimulateAllTools();`,
  'enginevgui_skip_simulate'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `void CEngineVGui::Paint( PaintMode_t mode )
{
	VPROF_BUDGET( "CEngineVGui::Paint", VPROF_BUDGETGROUP_OTHER_VGUI );`,
  `void CEngineVGui::Paint( PaintMode_t mode )
{
#ifdef EMSCRIPTEN
	(void)mode;
	return;
#endif
	VPROF_BUDGET( "CEngineVGui::Paint", VPROF_BUDGETGROUP_OTHER_VGUI );`,
  'enginevgui_skip_paint'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `	C_BaseTempEntity::PrecacheTempEnts();

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient input/vgui panels\\n");
#endif
	input->Init_All();`,
  `	C_BaseTempEntity::PrecacheTempEnts();

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient skip input/vgui/voice remainder\\n");
	return true;
#endif
#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient input/vgui panels\\n");
#endif
	input->Init_All();`,
  'client_skip_input_vgui'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `	ClientWorldFactoryInit();

	C_BaseAnimating::InitBoneSetupThreadPool();`,
  `	ClientWorldFactoryInit();

#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient skip bone thread pool\\n");
#else
	C_BaseAnimating::InitBoneSetupThreadPool();
#endif`,
  'client_skip_bone_pool'
) ? 1 : 0;

n += apply(
  'public/materialsystem/imesh.h',
  `	virtual unsigned ComputeMemoryUsed() = 0;
};`,
  `	virtual unsigned ComputeMemoryUsed() = 0;
};

#ifdef EMSCRIPTEN
// SOURCE_WASM_PATCH_imesh_safe_draw_decl
// Bypass IMesh multiple-inheritance vtable (function-signature mismatch on wasm).
void SourceWasm_SafeMeshDraw( IMesh *pMesh );
void SourceWasm_SafeLockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc );
void SourceWasm_SafeUnlockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc );
void SourceWasm_SafeSetPrimitiveType( IMesh *pMesh, MaterialPrimitiveType_t type );
#endif`,
  'imesh_safe_draw_decl'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.h',
  `	CMeshBase();
	virtual ~CMeshBase();

};`,
  `	CMeshBase();
	virtual ~CMeshBase();

#ifdef EMSCRIPTEN
	void (*m_pSafeDraw)( CMeshBase * );
	void SafeDraw() { if ( m_pSafeDraw ) m_pSafeDraw( this ); }
#endif

};`,
  'meshbase_safe_draw'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.cpp',
  `CMeshBase::CMeshBase()
{
}`,
  `CMeshBase::CMeshBase()
{
#ifdef EMSCRIPTEN
	m_pSafeDraw = NULL;
#endif
}`,
  'meshbase_safe_draw_ctor'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_bHasFlexVerts = false;
	m_pFlexVertexBuffer = NULL;
	m_nFlexVertOffsetInBytes = 0;
}`,
  `	m_bHasFlexVerts = false;
	m_pFlexVertexBuffer = NULL;
	m_nFlexVertOffsetInBytes = 0;
#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::Draw( -1, 0 ); };
#endif
}`,
  'meshdx8_safe_draw'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `CDynamicMeshDX8::CDynamicMeshDX8() : CMeshDX8( "CDynamicMeshDX8" )
{
	m_nBufferId = 0;
	ResetVertexAndIndexCounts();
}`,
  `CDynamicMeshDX8::CDynamicMeshDX8() : CMeshDX8( "CDynamicMeshDX8" )
{
	m_nBufferId = 0;
	ResetVertexAndIndexCounts();
#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CDynamicMeshDX8 *>( p )->CDynamicMeshDX8::Draw( -1, 0 ); };
#endif
}`,
  'dynamicmesh_safe_draw'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `CTempMeshDX8::CTempMeshDX8( bool isDynamic ) : m_VertexSize(0xFFFF), m_IsDynamic(isDynamic)
{
#ifdef DBGFLAG_ASSERT
	m_Locked = false;
	m_InPass = false;
#endif
}`,
  `CTempMeshDX8::CTempMeshDX8( bool isDynamic ) : m_VertexSize(0xFFFF), m_IsDynamic(isDynamic)
{
#ifdef DBGFLAG_ASSERT
	m_Locked = false;
	m_InPass = false;
#endif
#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::Draw( -1, 0 ); };
#endif
}`,
  'tempmesh_safe_draw'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
void SourceWasm_SafeMeshDraw( IMesh *pMesh )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeDraw();
}
#endif

CBufferedMeshDX8::CBufferedMeshDX8() : m_IsFlushing(false), m_WasRendered(true)
{
	m_pMesh = NULL;`,
  `CBufferedMeshDX8::CBufferedMeshDX8() : m_IsFlushing(false), m_WasRendered(true)
{
	m_pMesh = NULL;`,
  'safemeshdraw_dedup'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `CBufferedMeshDX8::CBufferedMeshDX8() : m_IsFlushing(false), m_WasRendered(true)
{
	m_pMesh = NULL;`,
  `#ifdef EMSCRIPTEN
// SOURCE_WASM_PATCH_safemeshdraw_impl
void SourceWasm_SafeMeshDraw( IMesh *pMesh )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeDraw( -1, 0 );
}

void SourceWasm_SafeLockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeLockMesh( nVertexCount, nIndexCount, desc );
}

void SourceWasm_SafeUnlockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeUnlockMesh( nVertexCount, nIndexCount, desc );
}

void SourceWasm_SafeSetPrimitiveType( IMesh *pMesh, MaterialPrimitiveType_t type )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeSetPrimitiveType( type );
}
#endif

CBufferedMeshDX8::CBufferedMeshDX8() : m_IsFlushing(false), m_WasRendered(true)
{
	m_pMesh = NULL;`,
  'safemeshdraw_impl'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pMesh = NULL;
#ifdef DEBUG_BUFFERED_STATE
	m_BufferedStateSet = false;
#endif
}`,
  `	m_pMesh = NULL;
#ifdef DEBUG_BUFFERED_STATE
	m_BufferedStateSet = false;
#endif
#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::Draw( -1, 0 ); };
#endif
}`,
  'bufferedmesh_safe_draw'
) ? 1 : 0;

n += apply(
  'tier2/renderutils.cpp',
  `	meshBuilder.End();
	pMesh->Draw();

	pRenderContext->MatrixMode( MATERIAL_VIEW );
	pRenderContext->PopMatrix();`,
  `	meshBuilder.End();
#ifdef EMSCRIPTEN
	SourceWasm_SafeMeshDraw( pMesh );
#else
	pMesh->Draw();
#endif

	pRenderContext->MatrixMode( MATERIAL_VIEW );
	pRenderContext->PopMatrix();`,
  'renderutils_safe_draw'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `		EngineVGui()->Simulate();
	}

	ClientDLL_FrameStageNotify( FRAME_RENDER_START );`,
  `		EngineVGui()->Simulate();
	}

#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR after Simulate\\n");
	if ( cl.IsActive() )
#endif
	ClientDLL_FrameStageNotify( FRAME_RENDER_START );
#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR after FSN start\\n");
#endif`,
  'scr_skip_fsn_menu'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `	ClientDLL_FrameStageNotify( FRAME_RENDER_END );`,
  `#ifdef EMSCRIPTEN
	if ( cl.IsActive() )
#endif
	ClientDLL_FrameStageNotify( FRAME_RENDER_END );`,
  'scr_skip_fsn_end_menu'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `		g_EngineRenderer->FrameBegin();
		toolframework->RenderFrameBegin();
	}

	cl.UpdateAreaBits_BackwardsCompatible();

	Shader_BeginRendering();

	// Draw world, etc.
	V_RenderView();`,
  `		g_EngineRenderer->FrameBegin();
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR FrameBegin\\n");
#endif
		toolframework->RenderFrameBegin();
	}

	cl.UpdateAreaBits_BackwardsCompatible();

	Shader_BeginRendering();
#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR V_RenderView\\n");
#endif

	// Draw world, etc.
	V_RenderView();
#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR V_RenderView done\\n");
#endif`,
  'scr_frame_breadcrumbs'
) ? 1 : 0;

n += apply(
  'engine/cl_main.cpp',
  `	if( !bReadPixelsFromFrontBuffer )
	{
		Shader_SwapBuffers();
	}

	// take a screenshot for savegames if necessary
	saverestore->UpdateSaveGameScreenshots();

	// take screenshot for bx movie maker
	EngineTool_UpdateScreenshot();
}`,
  `	if( !bReadPixelsFromFrontBuffer )
	{
#ifdef EMSCRIPTEN
		Msg("source-wasm: Snapshot swap\\n");
#endif
		Shader_SwapBuffers();
#ifdef EMSCRIPTEN
		Msg("source-wasm: Snapshot swap done\\n");
#endif
	}

	// take a screenshot for savegames if necessary
	saverestore->UpdateSaveGameScreenshots();
#ifdef EMSCRIPTEN
	Msg("source-wasm: Snapshot after save\\n");
#endif

	// take screenshot for bx movie maker
#ifndef EMSCRIPTEN
	EngineTool_UpdateScreenshot();
#endif
#ifdef EMSCRIPTEN
	Msg("source-wasm: Snapshot done\\n");
#endif
}`,
  'snapshot_skip_tool_shot'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `		g_EngineRenderer->FrameBegin();
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR FrameBegin\\n");
#endif
		toolframework->RenderFrameBegin();`,
  `		g_EngineRenderer->FrameBegin();
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR FrameBegin\\n");
#else
		toolframework->RenderFrameBegin();
#endif`,
  'scr_skip_tools_begin'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `		toolframework->RenderFrameEnd();

		g_EngineRenderer->FrameEnd();`,
  `#ifndef EMSCRIPTEN
		toolframework->RenderFrameEnd();
#endif
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR FrameEnd\\n");
#endif
		g_EngineRenderer->FrameEnd();
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR FrameEnd done\\n");
#endif`,
  'scr_skip_tools_end'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `			_Host_RunFrame_Render();

			//-------------------
			// sound
			//-------------------
			_Host_RunFrame_Sound();`,
  `			_Host_RunFrame_Render();
#ifdef EMSCRIPTEN
			Msg("source-wasm: after _Host_RunFrame_Render\\n");
#endif

			//-------------------
			// sound
			//-------------------
#ifndef EMSCRIPTEN
			_Host_RunFrame_Sound();
#endif`,
  'host_skip_sound_frame'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `			g_HostTimes.StartFrameSegment( FRAME_SEGMENT_CLDLL );

			ClientDLL_Update();

			g_HostTimes.EndFrameSegment( FRAME_SEGMENT_CLDLL );`,
  `			g_HostTimes.StartFrameSegment( FRAME_SEGMENT_CLDLL );

#ifdef EMSCRIPTEN
			if ( cl.IsActive() )
#endif
			ClientDLL_Update();
#ifdef EMSCRIPTEN
			Msg("source-wasm: after ClientDLL_Update\\n");
#endif

			g_HostTimes.EndFrameSegment( FRAME_SEGMENT_CLDLL );`,
  'host_skip_clientdll_update_menu'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `	{
		tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "modelloader->UpdateDynamicModels" );
		VPROF( "UpdateDynamicModels" );
		CMDLCacheCriticalSection critsec( g_pMDLCache );
		modelloader->UpdateDynamicModels();
	}

	{
		tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "materials_EndFrame" );

		materials->EndFrame();
	}
}`,
  `#ifdef EMSCRIPTEN
	if ( cl.IsActive() )
#endif
	{
		tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "modelloader->UpdateDynamicModels" );
		VPROF( "UpdateDynamicModels" );
		CMDLCacheCriticalSection critsec( g_pMDLCache );
		modelloader->UpdateDynamicModels();
	}

	{
		tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "materials_EndFrame" );
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR EndFrame\\n");
#endif
		materials->EndFrame();
#ifdef EMSCRIPTEN
		Msg("source-wasm: SCR EndFrame done\\n");
#endif
	}
#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR_UpdateScreen done\\n");
#endif
}`,
  'scr_skip_dynamic_models_menu'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.h',
  `#ifdef EMSCRIPTEN
	void (*m_pSafeDraw)( CMeshBase * );
	void SafeDraw() { if ( m_pSafeDraw ) m_pSafeDraw( this ); }
#endif`,
  `#ifdef EMSCRIPTEN
	void (*m_pSafeDraw)( CMeshBase *, int, int );
	void (*m_pSafeLockMesh)( CMeshBase *, int, int, MeshDesc_t & );
	void (*m_pSafeUnlockMesh)( CMeshBase *, int, int, MeshDesc_t & );
	void (*m_pSafeSetPrimitiveType)( CMeshBase *, MaterialPrimitiveType_t );
	void SafeDraw( int nFirstIndex = -1, int nIndexCount = 0 ) { if ( m_pSafeDraw ) m_pSafeDraw( this, nFirstIndex, nIndexCount ); }
	void SafeLockMesh( int nVertexCount, int nIndexCount, MeshDesc_t &desc ) { if ( m_pSafeLockMesh ) m_pSafeLockMesh( this, nVertexCount, nIndexCount, desc ); }
	void SafeUnlockMesh( int nVertexCount, int nIndexCount, MeshDesc_t &desc ) { if ( m_pSafeUnlockMesh ) m_pSafeUnlockMesh( this, nVertexCount, nIndexCount, desc ); }
	void SafeSetPrimitiveType( MaterialPrimitiveType_t type ) { if ( m_pSafeSetPrimitiveType ) m_pSafeSetPrimitiveType( this, type ); }
#endif`,
  'meshbase_safe_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.cpp',
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = NULL;
#endif`,
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = NULL;
	m_pSafeLockMesh = NULL;
	m_pSafeUnlockMesh = NULL;
	m_pSafeSetPrimitiveType = NULL;
#endif`,
  'meshbase_safe_lock_ctor'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::Draw( -1, 0 ); };
#endif`,
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p, int a, int b ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::Draw( a, b ); };
	m_pSafeLockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::LockMesh( v, i, d ); };
	m_pSafeUnlockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::UnlockMesh( v, i, d ); };
	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::SetPrimitiveType( t ); };
#endif`,
  'meshdx8_safe_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CDynamicMeshDX8 *>( p )->CDynamicMeshDX8::Draw( -1, 0 ); };
#endif`,
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p, int a, int b ) { static_cast<CDynamicMeshDX8 *>( p )->CDynamicMeshDX8::Draw( a, b ); };
	m_pSafeLockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CDynamicMeshDX8 *>( p )->CDynamicMeshDX8::LockMesh( v, i, d ); };
	m_pSafeUnlockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CDynamicMeshDX8 *>( p )->CDynamicMeshDX8::UnlockMesh( v, i, d ); };
	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::SetPrimitiveType( t ); };
#endif`,
  'dynamicmesh_safe_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::Draw( -1, 0 ); };
#endif`,
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p, int a, int b ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::Draw( a, b ); };
	m_pSafeLockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::LockMesh( v, i, d ); };
	m_pSafeUnlockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::UnlockMesh( v, i, d ); };
	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::SetPrimitiveType( t ); };
#endif`,
  'tempmesh_safe_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::Draw( -1, 0 ); };
#endif`,
  `#ifdef EMSCRIPTEN
	m_pSafeDraw = []( CMeshBase *p, int a, int b ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::Draw( a, b ); };
	m_pSafeLockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::LockMesh( v, i, d ); };
	m_pSafeUnlockMesh = []( CMeshBase *p, int v, int i, MeshDesc_t &d ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::UnlockMesh( v, i, d ); };
	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::SetPrimitiveType( t ); };
#endif`,
  'bufferedmesh_safe_lock'
) ? 1 : 0;

n += apply(
  'public/materialsystem/imesh.h',
  `	switch( type )
	{
	case MATERIAL_INSTANCED_QUADS:
		m_pMesh->SetPrimitiveType( MATERIAL_INSTANCED_QUADS );
		break;

	case MATERIAL_QUADS:
	case MATERIAL_POLYGON:
		m_pMesh->SetPrimitiveType( MATERIAL_TRIANGLES );
		break;

	case MATERIAL_LINE_STRIP:
	case MATERIAL_LINE_LOOP:
		m_pMesh->SetPrimitiveType( MATERIAL_LINES );
		break;

	default:
		m_pMesh->SetPrimitiveType( type );
	}

	// Lock the mesh
	m_pMesh->LockMesh( nMaxVertexCount, nMaxIndexCount, *this );`,
  `	switch( type )
	{
	case MATERIAL_INSTANCED_QUADS:
#ifdef EMSCRIPTEN
		SourceWasm_SafeSetPrimitiveType( m_pMesh, MATERIAL_INSTANCED_QUADS );
#else
		m_pMesh->SetPrimitiveType( MATERIAL_INSTANCED_QUADS );
#endif
		break;

	case MATERIAL_QUADS:
	case MATERIAL_POLYGON:
#ifdef EMSCRIPTEN
		SourceWasm_SafeSetPrimitiveType( m_pMesh, MATERIAL_TRIANGLES );
#else
		m_pMesh->SetPrimitiveType( MATERIAL_TRIANGLES );
#endif
		break;

	case MATERIAL_LINE_STRIP:
	case MATERIAL_LINE_LOOP:
#ifdef EMSCRIPTEN
		SourceWasm_SafeSetPrimitiveType( m_pMesh, MATERIAL_LINES );
#else
		m_pMesh->SetPrimitiveType( MATERIAL_LINES );
#endif
		break;

	default:
#ifdef EMSCRIPTEN
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
		m_pMesh->SetPrimitiveType( type );
#endif
	}

	// Lock the mesh
#ifdef EMSCRIPTEN
	SourceWasm_SafeLockMesh( m_pMesh, nMaxVertexCount, nMaxIndexCount, *this );
#else
	m_pMesh->LockMesh( nMaxVertexCount, nMaxIndexCount, *this );
#endif`,
  'meshbuilder_safe_begin_prims'
) ? 1 : 0;

n += apply(
  'public/materialsystem/imesh.h',
  `	// Set the primitive type
	m_pMesh->SetPrimitiveType( type );

	// Lock the vertex and index buffer
	m_pMesh->LockMesh( nVertexCount, nIndexCount, *this );`,
  `	// Set the primitive type
#ifdef EMSCRIPTEN
	SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
	m_pMesh->SetPrimitiveType( type );
#endif

	// Lock the vertex and index buffer
#ifdef EMSCRIPTEN
	SourceWasm_SafeLockMesh( m_pMesh, nVertexCount, nIndexCount, *this );
#else
	m_pMesh->LockMesh( nVertexCount, nIndexCount, *this );
#endif`,
  'meshbuilder_safe_begin_counts'
) ? 1 : 0;

n += apply(
  'public/materialsystem/imesh.h',
  `	// Unlock our buffers
	m_pMesh->UnlockMesh( m_VertexBuilder.VertexCount(), m_IndexBuilder.IndexCount(), *this );

	m_IndexBuilder.AttachEnd();
	m_VertexBuilder.AttachEnd();

	if ( bDraw )
	{
		m_pMesh->Draw();
	}`,
  `	// Unlock our buffers
#ifdef EMSCRIPTEN
	SourceWasm_SafeUnlockMesh( m_pMesh, m_VertexBuilder.VertexCount(), m_IndexBuilder.IndexCount(), *this );
#else
	m_pMesh->UnlockMesh( m_VertexBuilder.VertexCount(), m_IndexBuilder.IndexCount(), *this );
#endif

	m_IndexBuilder.AttachEnd();
	m_VertexBuilder.AttachEnd();

	if ( bDraw )
	{
#ifdef EMSCRIPTEN
		SourceWasm_SafeMeshDraw( m_pMesh );
#else
		m_pMesh->Draw();
#endif
	}`,
  'meshbuilder_safe_end'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CBufferedMeshDX8::SetPrimitiveType( MaterialPrimitiveType_t type )
{
	Assert( IsX360() || ( type != MATERIAL_INSTANCED_QUADS ) );
	Assert( type != MATERIAL_HETEROGENOUS );

	if (type != GetPrimitiveType())
	{
		ShaderAPI()->FlushBufferedPrimitives();
		m_pMesh->SetPrimitiveType(type);
	}
}`,
  `void CBufferedMeshDX8::SetPrimitiveType( MaterialPrimitiveType_t type )
{
	Assert( IsX360() || ( type != MATERIAL_INSTANCED_QUADS ) );
	Assert( type != MATERIAL_HETEROGENOUS );

#ifdef EMSCRIPTEN
	// SOURCE_WASM_PATCH_bufferedmesh_safe_setprim
	if ( m_pMesh )
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
	if (type != GetPrimitiveType())
	{
		ShaderAPI()->FlushBufferedPrimitives();
		m_pMesh->SetPrimitiveType(type);
	}
#endif
}`,
  'bufferedmesh_safe_setprim'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pMesh->LockMesh( nVertexCount, nIndexCount, desc );`,
  `#ifdef EMSCRIPTEN
	SourceWasm_SafeLockMesh( m_pMesh, nVertexCount, nIndexCount, desc );
#else
	m_pMesh->LockMesh( nVertexCount, nIndexCount, desc );
#endif`,
  'bufferedmesh_inner_safe_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pMesh->UnlockMesh( nVertexCount, nIndexCount, desc );`,
  `#ifdef EMSCRIPTEN
	SourceWasm_SafeUnlockMesh( m_pMesh, nVertexCount, nIndexCount, desc );
#else
	m_pMesh->UnlockMesh( nVertexCount, nIndexCount, desc );
#endif`,
  'bufferedmesh_inner_safe_unlock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `		// Actually draws the data using the mesh's material
		static_cast<IMesh*>(m_pMesh)->Draw();`,
  `		// Actually draws the data using the mesh's material
#ifdef EMSCRIPTEN
		SourceWasm_SafeMeshDraw( m_pMesh );
#else
		static_cast<IMesh*>(m_pMesh)->Draw();
#endif`,
  'bufferedmesh_inner_safe_draw'
) ? 1 : 0;

n += apply(
  'engine/sys_getmodes.cpp',
  `#ifdef EMSCRIPTEN
		// IMesh LockMesh/Draw still has a wasm vtable signature mismatch.
		pRenderContext->Viewport( 0, 0, w, h );
		pRenderContext->ClearColor3ub( 0, 0, 0 );
		pRenderContext->ClearBuffers( true, true, true );
		g_pMaterialSystem->SwapBuffers();
#else
		pRenderContext->Viewport( 0, 0, w, h );
		pRenderContext->DepthRange( 0, 1 );
		pRenderContext->SetToneMappingScaleLinear( Vector(1,1,1) );

		float depth = 0.5f;

		// Make sure we clear both front & back buffer.
		for (int i = 0; i < 2; ++i)
		{
			pRenderContext->ClearColor3ub( 0, 0, 0 );
			pRenderContext->ClearBuffers( true, true, true );
			DrawScreenSpaceRectangle( pMaterial, 0, 0, w, h, 0, 0, tw-1, th-1, tw, th, NULL,1,1,depth );
			DrawScreenSpaceRectangle( pLoadingMaterial, w-lw, h-lh, lw, lh, 0, 0, lw-1, lh-1, lw, lh, NULL,1,1,depth );
			g_pMaterialSystem->SwapBuffers();
		}
#endif`,
  `		pRenderContext->Viewport( 0, 0, w, h );
		pRenderContext->DepthRange( 0, 1 );
		pRenderContext->SetToneMappingScaleLinear( Vector(1,1,1) );

		float depth = 0.5f;

#ifdef EMSCRIPTEN
		Msg("source-wasm: plaque DrawScreenSpaceRectangle\\n");
#endif
		// Make sure we clear both front & back buffer.
		for (int i = 0; i < 2; ++i)
		{
			pRenderContext->ClearColor3ub( 0, 0, 0 );
			pRenderContext->ClearBuffers( true, true, true );
			DrawScreenSpaceRectangle( pMaterial, 0, 0, w, h, 0, 0, tw-1, th-1, tw, th, NULL,1,1,depth );
			DrawScreenSpaceRectangle( pLoadingMaterial, w-lw, h-lh, lw, lh, 0, 0, lw-1, lh-1, lw, lh, NULL,1,1,depth );
			g_pMaterialSystem->SwapBuffers();
		}
#ifdef EMSCRIPTEN
		Msg("source-wasm: plaque DrawScreenSpaceRectangle done\\n");
#endif`,
  'startup_graphic_restore_plaque'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	g_ShaderMutex.Lock();
	VPROF( "CMeshDX8::LockMesh" );
	Lock( nVertexCount, false, *static_cast<VertexDesc_t*>( &desc ) );
	if ( m_Type != MATERIAL_POINTS )
	{
		Lock( false, -1, nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
	}`,
  `	g_ShaderMutex.Lock();
	VPROF( "CMeshDX8::LockMesh" );
#ifdef EMSCRIPTEN
	CMeshDX8::Lock( nVertexCount, false, *static_cast<VertexDesc_t*>( &desc ) );
	if ( m_Type != MATERIAL_POINTS )
	{
		CMeshDX8::Lock( false, -1, nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
	}
#else
	Lock( nVertexCount, false, *static_cast<VertexDesc_t*>( &desc ) );
	if ( m_Type != MATERIAL_POINTS )
	{
		Lock( false, -1, nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
	}
#endif`,
  'meshdx8_qualify_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	Unlock( nVertexCount, *static_cast<VertexDesc_t*>( &desc ) );
	if ( m_Type != MATERIAL_POINTS )
	{
		Unlock( nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
	}`,
  `#ifdef EMSCRIPTEN
	CMeshDX8::Unlock( nVertexCount, *static_cast<VertexDesc_t*>( &desc ) );
	if ( m_Type != MATERIAL_POINTS )
	{
		CMeshDX8::Unlock( nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
	}
#else
	Unlock( nVertexCount, *static_cast<VertexDesc_t*>( &desc ) );
	if ( m_Type != MATERIAL_POINTS )
	{
		Unlock( nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
	}
#endif`,
  'meshdx8_qualify_unlock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `		tmZoneFiltered( TELEMETRY_LEVEL0, 50, TMZF_NONE, "PreLock" );
		PreLock();
	}

	if (m_VertexOverride)
	{
		nVertexCount = 0;
	}

	if (m_IndexOverride)
	{
		nIndexCount = 0;
	}

	{
		tmZoneFiltered( TELEMETRY_LEVEL0, 50, TMZF_NONE, "Lock" );
		Lock( nVertexCount, false, *static_cast<VertexDesc_t*>( &desc ) );
	}`,
  `		tmZoneFiltered( TELEMETRY_LEVEL0, 50, TMZF_NONE, "PreLock" );
#ifdef EMSCRIPTEN
		CDynamicMeshDX8::PreLock();
#else
		PreLock();
#endif
	}

	if (m_VertexOverride)
	{
		nVertexCount = 0;
	}

	if (m_IndexOverride)
	{
		nIndexCount = 0;
	}

	{
		tmZoneFiltered( TELEMETRY_LEVEL0, 50, TMZF_NONE, "Lock" );
#ifdef EMSCRIPTEN
		CMeshDX8::Lock( nVertexCount, false, *static_cast<VertexDesc_t*>( &desc ) );
#else
		Lock( nVertexCount, false, *static_cast<VertexDesc_t*>( &desc ) );
#endif
	}`,
  'dynamicmesh_qualify_lock'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `		{
			tmZoneFiltered( TELEMETRY_LEVEL0, 50, TMZF_NONE, "Lock nFirstIndex" );
			nFirstIndex = Lock( false, -1, nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
		}`,
  `		{
			tmZoneFiltered( TELEMETRY_LEVEL0, 50, TMZF_NONE, "Lock nFirstIndex" );
#ifdef EMSCRIPTEN
			nFirstIndex = CMeshDX8::Lock( false, -1, nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
#else
			nFirstIndex = Lock( false, -1, nIndexCount, *static_cast<IndexDesc_t*>( &desc ) );
#endif
		}`,
  'dynamicmesh_qualify_index_lock'
) ? 1 : 0;

// bufferedmesh_setprim_no_vtable: superseded by bufferedmesh_safe_setprim + collapse.

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CBufferedMeshDX8::LockMesh( int nVertexCount, int nIndexCount, MeshDesc_t& desc )
{
	ShaderUtil()->SyncMatrices();

	Assert( m_pMesh );
	Assert( m_WasRendered );

	// Do some pre-lock processing
	m_pMesh->PreLock();`,
  `void CBufferedMeshDX8::LockMesh( int nVertexCount, int nIndexCount, MeshDesc_t& desc )
{
	ShaderUtil()->SyncMatrices();

	Assert( m_pMesh );
	Assert( m_WasRendered );

#ifdef EMSCRIPTEN
	// Do not touch IMesh virtuals here (PreLock/IndexCount/GetPrimitiveType).
	printf("source-wasm: buffered LockMesh inner\\n");
	if ( m_pMesh )
		static_cast<CDynamicMeshDX8 *>( m_pMesh )->CDynamicMeshDX8::PreLock();
	SourceWasm_SafeLockMesh( m_pMesh, nVertexCount, nIndexCount, desc );
	m_WasRendered = false;
	return;
#endif

	// Do some pre-lock processing
	m_pMesh->PreLock();`,
  'bufferedmesh_lock_no_vtable'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void SourceWasm_SafeLockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeLockMesh( nVertexCount, nIndexCount, desc );
}`,
  `void SourceWasm_SafeLockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc )
{
	if ( !pMesh )
		return;
	printf("source-wasm: SafeLockMesh %p %d %d\\n", (void*)pMesh, nVertexCount, nIndexCount);
	static_cast<CMeshBase *>( pMesh )->SafeLockMesh( nVertexCount, nIndexCount, desc );
	printf("source-wasm: SafeLockMesh done\\n");
}`,
  'safelock_breadcrumbs'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CBufferedMeshDX8::UnlockMesh( int nVertexCount, int nIndexCount, MeshDesc_t& desc )
{
	Assert( m_pMesh );

	// Gotta fix up the first index to batch strips reasonably
	if ((m_pMesh->GetPrimitiveType() == MATERIAL_TRIANGLE_STRIP) && desc.m_nIndexSize )`,
  `void CBufferedMeshDX8::UnlockMesh( int nVertexCount, int nIndexCount, MeshDesc_t& desc )
{
	Assert( m_pMesh );

#ifdef EMSCRIPTEN
	printf("source-wasm: buffered UnlockMesh\\n");
	SourceWasm_SafeUnlockMesh( m_pMesh, nVertexCount, nIndexCount, desc );
	return;
#endif

	// Gotta fix up the first index to batch strips reasonably
	if ((m_pMesh->GetPrimitiveType() == MATERIAL_TRIANGLE_STRIP) && desc.m_nIndexSize )`,
  'bufferedmesh_unlock_no_vtable'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CBufferedMeshDX8::Draw( int nFirstIndex, int nIndexCount )
{
	if ( !ShaderUtil()->OnDrawMesh( this, nFirstIndex, nIndexCount ) )
	{
		m_WasRendered = true;
		MarkAsDrawn();
		return;
	}

	Assert( !m_IsFlushing && !m_WasRendered );`,
  `void CBufferedMeshDX8::Draw( int nFirstIndex, int nIndexCount )
{
#ifdef EMSCRIPTEN
	printf("source-wasm: buffered Draw\\n");
	if ( !ShaderUtil()->OnDrawMesh( this, nFirstIndex, nIndexCount ) )
	{
		m_WasRendered = true;
		MarkAsDrawn();
		return;
	}
	m_WasRendered = true;
	m_FlushNeeded = true;
	Flush();
	return;
#endif
	if ( !ShaderUtil()->OnDrawMesh( this, nFirstIndex, nIndexCount ) )
	{
		m_WasRendered = true;
		MarkAsDrawn();
		return;
	}

	Assert( !m_IsFlushing && !m_WasRendered );`,
  'bufferedmesh_draw_no_vtable'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
		SourceWasm_SafeMeshDraw( m_pMesh );
#else
		static_cast<IMesh*>(m_pMesh)->Draw();
#endif

		m_IsFlushing = false;
		m_FlushNeeded = false;

		m_pMesh->SetFlexMesh( NULL, 0 );`,
  `#ifdef EMSCRIPTEN
		SourceWasm_SafeMeshDraw( m_pMesh );
#else
		static_cast<IMesh*>(m_pMesh)->Draw();
#endif

		m_IsFlushing = false;
		m_FlushNeeded = false;

#ifndef EMSCRIPTEN
		m_pMesh->SetFlexMesh( NULL, 0 );
#endif`,
  'bufferedmesh_flush_no_flex'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void SourceWasm_SafeUnlockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeUnlockMesh( nVertexCount, nIndexCount, desc );
}`,
  `void SourceWasm_SafeUnlockMesh( IMesh *pMesh, int nVertexCount, int nIndexCount, MeshDesc_t &desc )
{
	if ( !pMesh )
		return;
	printf("source-wasm: SafeUnlockMesh\\n");
	static_cast<CMeshBase *>( pMesh )->SafeUnlockMesh( nVertexCount, nIndexCount, desc );
	printf("source-wasm: SafeUnlockMesh done\\n");
}`,
  'safeunlock_breadcrumbs'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void SourceWasm_SafeMeshDraw( IMesh *pMesh )
{
	if ( !pMesh )
		return;
	static_cast<CMeshBase *>( pMesh )->SafeDraw( -1, 0 );
}`,
  `void SourceWasm_SafeMeshDraw( IMesh *pMesh )
{
	if ( !pMesh )
		return;
	printf("source-wasm: SafeMeshDraw %p\\n", (void*)pMesh);
	static_cast<CMeshBase *>( pMesh )->SafeDraw( -1, 0 );
	printf("source-wasm: SafeMeshDraw done\\n");
}`,
  'safedraw_breadcrumbs'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.h',
  `	void (*m_pSafeSetPrimitiveType)( CMeshBase *, MaterialPrimitiveType_t );
	void SafeDraw( int nFirstIndex = -1, int nIndexCount = 0 ) { if ( m_pSafeDraw ) m_pSafeDraw( this, nFirstIndex, nIndexCount ); }`,
  `	void (*m_pSafeSetPrimitiveType)( CMeshBase *, MaterialPrimitiveType_t );
	VertexFormat_t (*m_pSafeGetVertexFormat)( CMeshBase * );
	int (*m_pSafeHasColorMesh)( CMeshBase * );
	int (*m_pSafeHasFlexMesh)( CMeshBase * );
	void (*m_pSafeBeginPass)( CMeshBase * );
	void (*m_pSafeRenderPass)( CMeshBase * );
	void SafeDraw( int nFirstIndex = -1, int nIndexCount = 0 ) { if ( m_pSafeDraw ) m_pSafeDraw( this, nFirstIndex, nIndexCount ); }`,
  'meshbase_safe_drawmesh_ptrs'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.h',
  `	void SafeSetPrimitiveType( MaterialPrimitiveType_t type ) { if ( m_pSafeSetPrimitiveType ) m_pSafeSetPrimitiveType( this, type ); }
#endif`,
  `	void SafeSetPrimitiveType( MaterialPrimitiveType_t type ) { if ( m_pSafeSetPrimitiveType ) m_pSafeSetPrimitiveType( this, type ); }
	VertexFormat_t SafeGetVertexFormat() { return m_pSafeGetVertexFormat ? m_pSafeGetVertexFormat( this ) : 0; }
	bool SafeHasColorMesh() { return m_pSafeHasColorMesh ? m_pSafeHasColorMesh( this ) != 0 : false; }
	bool SafeHasFlexMesh() { return m_pSafeHasFlexMesh ? m_pSafeHasFlexMesh( this ) != 0 : false; }
	void SafeBeginPass() { if ( m_pSafeBeginPass ) m_pSafeBeginPass( this ); }
	void SafeRenderPass() { if ( m_pSafeRenderPass ) m_pSafeRenderPass( this ); }
#endif`,
  'meshbase_safe_drawmesh_methods'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshbase.cpp',
  `	m_pSafeSetPrimitiveType = NULL;
#endif`,
  `	m_pSafeSetPrimitiveType = NULL;
	m_pSafeGetVertexFormat = NULL;
	m_pSafeHasColorMesh = NULL;
	m_pSafeHasFlexMesh = NULL;
	m_pSafeBeginPass = NULL;
	m_pSafeRenderPass = NULL;
#endif`,
  'meshbase_safe_drawmesh_ctor'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::SetPrimitiveType( t ); };
#endif
}`,
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::SetPrimitiveType( t ); };
	m_pSafeGetVertexFormat = []( CMeshBase *p ) { return static_cast<CMeshDX8 *>( p )->CBaseMeshDX8::GetVertexFormat(); };
	m_pSafeHasColorMesh = []( CMeshBase *p ) { return static_cast<CMeshDX8 *>( p )->CMeshDX8::HasColorMesh() ? 1 : 0; };
	m_pSafeHasFlexMesh = []( CMeshBase *p ) { return static_cast<CMeshDX8 *>( p )->CMeshDX8::HasFlexMesh() ? 1 : 0; };
	m_pSafeBeginPass = []( CMeshBase *p ) { static_cast<CMeshDX8 *>( p )->CBaseMeshDX8::BeginPass(); };
	m_pSafeRenderPass = []( CMeshBase *p ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::RenderPass(); };
#endif
}`,
  'meshdx8_safe_drawmesh'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::SetPrimitiveType( t ); };
#endif
}`,
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CMeshDX8 *>( p )->CMeshDX8::SetPrimitiveType( t ); };
	m_pSafeGetVertexFormat = []( CMeshBase *p ) { return static_cast<CDynamicMeshDX8 *>( p )->CBaseMeshDX8::GetVertexFormat(); };
	m_pSafeHasColorMesh = []( CMeshBase *p ) { return static_cast<CDynamicMeshDX8 *>( p )->CMeshDX8::HasColorMesh() ? 1 : 0; };
	m_pSafeHasFlexMesh = []( CMeshBase *p ) { return static_cast<CDynamicMeshDX8 *>( p )->CMeshDX8::HasFlexMesh() ? 1 : 0; };
	m_pSafeBeginPass = []( CMeshBase *p ) { static_cast<CDynamicMeshDX8 *>( p )->CBaseMeshDX8::BeginPass(); };
	m_pSafeRenderPass = []( CMeshBase *p ) { static_cast<CDynamicMeshDX8 *>( p )->CMeshDX8::RenderPass(); };
#endif
}`,
  'dynamicmesh_safe_drawmesh'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::SetPrimitiveType( t ); };
#endif
}`,
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::SetPrimitiveType( t ); };
	m_pSafeGetVertexFormat = []( CMeshBase *p ) { return static_cast<CTempMeshDX8 *>( p )->CBaseMeshDX8::GetVertexFormat(); };
	m_pSafeHasColorMesh = []( CMeshBase *p ) { return 0; };
	m_pSafeHasFlexMesh = []( CMeshBase *p ) { return 0; };
	m_pSafeBeginPass = []( CMeshBase *p ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::BeginPass(); };
	m_pSafeRenderPass = []( CMeshBase *p ) { static_cast<CTempMeshDX8 *>( p )->CTempMeshDX8::RenderPass(); };
#endif
}`,
  'tempmesh_safe_drawmesh'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::SetPrimitiveType( t ); };
#endif
}`,
  `	m_pSafeSetPrimitiveType = []( CMeshBase *p, MaterialPrimitiveType_t t ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::SetPrimitiveType( t ); };
	m_pSafeGetVertexFormat = []( CMeshBase *p ) { return static_cast<CBufferedMeshDX8 *>( p )->CBaseMeshDX8::GetVertexFormat(); };
	m_pSafeHasColorMesh = []( CMeshBase *p ) { return 0; };
	m_pSafeHasFlexMesh = []( CMeshBase *p ) { return 0; };
	m_pSafeBeginPass = []( CMeshBase *p ) { static_cast<CBufferedMeshDX8 *>( p )->CBaseMeshDX8::BeginPass(); };
	m_pSafeRenderPass = []( CMeshBase *p ) { static_cast<CBufferedMeshDX8 *>( p )->CBufferedMeshDX8::RenderPass(); };
#endif
}`,
  'bufferedmesh_safe_drawmesh'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CDynamicMeshDX8::Draw( int nFirstIndex, int nIndexCount )
{
	if ( !ShaderUtil()->OnDrawMesh( this, nFirstIndex, nIndexCount ) )
	{
		MarkAsDrawn();
		return;
	}

	VPROF( "CDynamicMeshDX8::Draw" );

	m_HasDrawn = true;

	if (m_IndexOverride || m_VertexOverride ||
		( ( m_TotalVertices > 0 ) && ( m_TotalIndices > 0 || m_Type == MATERIAL_POINTS || m_Type == MATERIAL_INSTANCED_QUADS ) ) )
	{
		Assert( !m_IsDrawing );

		HandleLateCreation( );

		// only have a non-zero first vertex when we are using static indices
		int nFirstVertex = m_VertexOverride ? 0 : m_nFirstVertex;
		int actualFirstVertex = m_IndexOverride ? nFirstVertex : 0;
		int nVertexOffsetInBytes = HasFlexMesh() ? nFirstVertex * g_MeshMgr.VertexFormatSize( GetVertexFormat() ) : 0;`,
  `void CDynamicMeshDX8::Draw( int nFirstIndex, int nIndexCount )
{
#ifdef EMSCRIPTEN
	printf("source-wasm: CDynamicMeshDX8::Draw\\n");
#endif
	if ( !ShaderUtil()->OnDrawMesh( this, nFirstIndex, nIndexCount ) )
	{
		MarkAsDrawn();
		return;
	}

	VPROF( "CDynamicMeshDX8::Draw" );

	m_HasDrawn = true;

	if (m_IndexOverride || m_VertexOverride ||
		( ( m_TotalVertices > 0 ) && ( m_TotalIndices > 0 || m_Type == MATERIAL_POINTS || m_Type == MATERIAL_INSTANCED_QUADS ) ) )
	{
		Assert( !m_IsDrawing );

#ifdef EMSCRIPTEN
		CMeshDX8::HandleLateCreation( );
		int nFirstVertex = m_VertexOverride ? 0 : m_nFirstVertex;
		int actualFirstVertex = m_IndexOverride ? nFirstVertex : 0;
		int nVertexOffsetInBytes = CMeshDX8::HasFlexMesh() ? nFirstVertex * g_MeshMgr.VertexFormatSize( CBaseMeshDX8::GetVertexFormat() ) : 0;
#else
		HandleLateCreation( );

		// only have a non-zero first vertex when we are using static indices
		int nFirstVertex = m_VertexOverride ? 0 : m_nFirstVertex;
		int actualFirstVertex = m_IndexOverride ? nFirstVertex : 0;
		int nVertexOffsetInBytes = HasFlexMesh() ? nFirstVertex * g_MeshMgr.VertexFormatSize( GetVertexFormat() ) : 0;
#endif`,
  'dynamicmesh_draw_qualify'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `		VertexFormat_t fmt = m_VertexOverride ? GetVertexFormat() : VERTEX_FORMAT_INVALID;
		if ( !SetRenderState( nVertexOffsetInBytes, actualFirstVertex, fmt ) )
			return;`,
  `#ifdef EMSCRIPTEN
		VertexFormat_t fmt = m_VertexOverride ? CBaseMeshDX8::GetVertexFormat() : VERTEX_FORMAT_INVALID;
		if ( !CMeshDX8::SetRenderState( nVertexOffsetInBytes, actualFirstVertex, fmt ) )
			return;
#else
		VertexFormat_t fmt = m_VertexOverride ? GetVertexFormat() : VERTEX_FORMAT_INVALID;
		if ( !SetRenderState( nVertexOffsetInBytes, actualFirstVertex, fmt ) )
			return;
#endif`,
  'dynamicmesh_draw_setrenderstate'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `		if ( !HasFlexMesh() )
		{
			actualFirstVertex = nFirstVertex - actualFirstVertex;
		}`,
  `#ifdef EMSCRIPTEN
		if ( !CMeshDX8::HasFlexMesh() )
#else
		if ( !HasFlexMesh() )
#endif
		{
			actualFirstVertex = nFirstVertex - actualFirstVertex;
		}`,
  'dynamicmesh_draw_hasflex'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CMeshDX8::RenderPass()
{
	LOCK_SHADERAPI();
	VPROF( "CMeshDX8::RenderPass" );

	HandleLateCreation();`,
  `void CMeshDX8::RenderPass()
{
	LOCK_SHADERAPI();
	VPROF( "CMeshDX8::RenderPass" );

#ifdef EMSCRIPTEN
	printf("source-wasm: CMeshDX8::RenderPass\\n");
	CMeshDX8::HandleLateCreation();
#else
	HandleLateCreation();
#endif`,
  'meshdx8_renderpass_qualify'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/shaderapidx8.cpp',
  `	m_pRenderMesh = pMesh;
	VertexFormat_t vertexFormat = m_pRenderMesh->GetVertexFormat();
	SetVertexDecl( vertexFormat, m_pRenderMesh->HasColorMesh(), m_pRenderMesh->HasFlexMesh(), m_pMaterial->IsUsingVertexID() );
	CommitStateChanges();
	Assert( m_pRenderMesh && m_pMaterial );
	m_pMaterial->DrawMesh( CompressionType( vertexFormat ) );`,
  `	m_pRenderMesh = pMesh;
#ifdef EMSCRIPTEN
	printf("source-wasm: ShaderAPI DrawMesh\\n");
	VertexFormat_t vertexFormat = pMesh->SafeGetVertexFormat();
	SetVertexDecl( vertexFormat, pMesh->SafeHasColorMesh(), pMesh->SafeHasFlexMesh(), m_pMaterial->IsUsingVertexID() );
#else
	VertexFormat_t vertexFormat = m_pRenderMesh->GetVertexFormat();
	SetVertexDecl( vertexFormat, m_pRenderMesh->HasColorMesh(), m_pRenderMesh->HasFlexMesh(), m_pMaterial->IsUsingVertexID() );
#endif
	CommitStateChanges();
	Assert( m_pRenderMesh && m_pMaterial );
	m_pMaterial->DrawMesh( CompressionType( vertexFormat ) );`,
  'shaderapi_drawmesh_safe'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/shaderapidx8.cpp',
  `	if( m_pRenderMesh )
	{
		m_pRenderMesh->BeginPass( );
	}`,
  `	if( m_pRenderMesh )
	{
#ifdef EMSCRIPTEN
		m_pRenderMesh->SafeBeginPass();
#else
		m_pRenderMesh->BeginPass( );
#endif
	}`,
  'shaderapi_beginpass_safe'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/shaderapidx8.cpp',
  `	if ( m_pRenderMesh )
	{
		m_pRenderMesh->RenderPass();
	}`,
  `	if ( m_pRenderMesh )
	{
#ifdef EMSCRIPTEN
		m_pRenderMesh->SafeRenderPass();
#else
		m_pRenderMesh->RenderPass();
#endif
	}`,
  'shaderapi_renderpass_safe'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `void CMeshDX8::HandleLateCreation( )
{
	if ( m_pVertexBuffer )
	{
		m_pVertexBuffer->HandleLateCreation();
	}`,
  `void CMeshDX8::HandleLateCreation( )
{
#ifdef EMSCRIPTEN
	printf("source-wasm: HandleLateCreation vb=%p ib=%p color=%p\\n", m_pVertexBuffer, m_pIndexBuffer, m_pColorMesh);
#endif
	if ( m_pVertexBuffer )
	{
#ifdef EMSCRIPTEN
		printf("source-wasm: VB HandleLateCreation\\n");
#endif
		m_pVertexBuffer->HandleLateCreation();
#ifdef EMSCRIPTEN
		printf("source-wasm: VB HandleLateCreation done\\n");
#endif
	}`,
  'meshdx8_latecreate_breadcrumbs'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `	if ( !IsValidVertexFormat( g_LastVertexFormat ) )
	{
		Warning( "Material %s does not support vertex format used by the mesh (maybe missing fields or mismatched vertex compression?), mesh will not be rendered. Grab a programmer!\\n",
			ShaderAPI()->GetBoundMaterial()->GetName() );
		return;
	}`,
  `#ifdef EMSCRIPTEN
	printf("source-wasm: RenderPass after latecreate type=%d prims=%d\\n", (int)m_Type, s_nPrims);
#endif
	if ( !CMeshDX8::IsValidVertexFormat( g_LastVertexFormat ) )
	{
		Warning( "Material %s does not support vertex format used by the mesh (maybe missing fields or mismatched vertex compression?), mesh will not be rendered. Grab a programmer!\\n",
			ShaderAPI()->GetBoundMaterial()->GetName() );
		return;
	}
#ifdef EMSCRIPTEN
	printf("source-wasm: RenderPass format ok\\n");
#endif`,
  'meshdx8_renderpass_format_bc'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `#ifdef EMSCRIPTEN
	if ( m_pMesh )
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
#ifdef EMSCRIPTEN
	if ( m_pMesh )
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
#ifdef EMSCRIPTEN
	if ( m_pMesh )
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
#ifdef EMSCRIPTEN
	if ( m_pMesh )
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
	if (type != GetPrimitiveType())
	{
		ShaderAPI()->FlushBufferedPrimitives();
		m_pMesh->SetPrimitiveType(type);
	}
#endif
#endif
#endif
#endif`,
  `#ifdef EMSCRIPTEN
	// SOURCE_WASM_PATCH_bufferedmesh_safe_setprim
	if ( m_pMesh )
		SourceWasm_SafeSetPrimitiveType( m_pMesh, type );
#else
	if (type != GetPrimitiveType())
	{
		ShaderAPI()->FlushBufferedPrimitives();
		m_pMesh->SetPrimitiveType(type);
	}
#endif`,
  'bufferedmesh_setprim_collapse'
) ? 1 : 0;

n += applyIfPresent(
  'togles/linuxwin/glmgr.cpp',
  `#include "togles/rendermechanism.h"
#ifdef EMSCRIPTEN
#include <GLES3/gl3.h>
#endif`,
  `#include "togles/rendermechanism.h"
// SOURCE_WASM_PATCH_togl_no_gles3_header`,
  'togl_no_gles3_header',
  (source) => !source.includes('#include <GLES3/gl3.h>')
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glfuncs.h',
  `GL_FUNC_VOID(OpenGL,true,glDrawRangeElements,(GLenum a,GLuint b,GLuint c,GLsizei d,GLenum e,const GLvoid *f),(a,b,c,d,e,f))`,
  `GL_FUNC_VOID(OpenGL,true,glDrawRangeElements,(GLenum a,GLuint b,GLuint c,GLsizei d,GLenum e,const GLvoid *f),(a,b,c,d,e,f))
GL_FUNC_VOID(OpenGL,true,glDrawElements,(GLenum a,GLsizei b,GLenum c,const GLvoid *d),(a,b,c,d))`,
  'togl_gl_drawelements_func'
) ? 1 : 0;

n += apply(
  'public/togles/linuxwin/glmgr.h',
  `	if ( m_pBoundPair )
	{
		gGL->glDrawRangeElementsBaseVertex( mode, start, end, count, type, indicesActual, baseVertex );

#if GLMDEBUG
		if ( m_slowCheckEnable )
		{
			CheckNative();
		}
#endif
	}`,
  `	if ( m_pBoundPair )
	{
#ifdef EMSCRIPTEN
		gGL->glDrawElements( mode, count, type, indicesActual );
#else
		gGL->glDrawRangeElementsBaseVertex( mode, start, end, count, type, indicesActual, baseVertex );
#endif

#if GLMDEBUG
		if ( m_slowCheckEnable )
		{
			CheckNative();
		}
#endif
	}`,
  'togl_inline_drawelements'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/glmgr.cpp',
  `	if ( m_pBoundPair )
	{
		gGL->glDrawRangeElementsBaseVertex( mode, start, end, count, type, indicesActual, baseVertex );`,
  `	if ( m_pBoundPair )
	{
#ifdef EMSCRIPTEN
		// WebGL2 has neither DrawRangeElements nor DrawRangeElementsBaseVertex.
		printf("source-wasm: glDrawElements mode=%u count=%d base=%u\\n", (unsigned)mode, (int)count, (unsigned)baseVertex);
		gGL->glDrawElements( mode, count, type, indicesActual );
		printf("source-wasm: glDrawElements done\\n");
#else
		gGL->glDrawRangeElementsBaseVertex( mode, start, end, count, type, indicesActual, baseVertex );
#endif`,
  'togl_draw_elements_webgl'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/dxabstract.cpp',
  `HRESULT IDirect3DDevice9::DrawIndexedPrimitive( D3DPRIMITIVETYPE Type, INT BaseVertexIndex, UINT MinVertexIndex, UINT NumVertices, UINT startIndex, UINT primCount )
{
	tmZone( TELEMETRY_LEVEL2, TMZF_NONE, "%s", __FUNCTION__ );
	Assert( m_ctx->m_nCurOwnerThreadId == ThreadGetCurrentId() );`,
  `HRESULT IDirect3DDevice9::DrawIndexedPrimitive( D3DPRIMITIVETYPE Type, INT BaseVertexIndex, UINT MinVertexIndex, UINT NumVertices, UINT startIndex, UINT primCount )
{
#ifdef EMSCRIPTEN
	printf("source-wasm: D3D DIP enter type=%d prims=%u\\n", (int)Type, (unsigned)primCount);
#endif
	tmZone( TELEMETRY_LEVEL2, TMZF_NONE, "%s", __FUNCTION__ );
	Assert( m_ctx->m_nCurOwnerThreadId == ThreadGetCurrentId() );`,
  'togl_dip_enter'
) ? 1 : 0;

n += apply(
  'togles/linuxwin/dxabstract.cpp',
  `		m_ctx->FlushDrawStates( MinVertexIndex, MinVertexIndex + NumVertices - 1, BaseVertexIndex );`,
  `#ifdef EMSCRIPTEN
		printf("source-wasm: D3D DIP FlushDrawStates\\n");
#endif
		m_ctx->FlushDrawStates( MinVertexIndex, MinVertexIndex + NumVertices - 1, BaseVertexIndex );
#ifdef EMSCRIPTEN
		printf("source-wasm: D3D DIP FlushDrawStates done\\n");
#endif`,
  'togl_dip_flush_bc'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `				Dx9Device()->DrawIndexedPrimitive(
					m_Mode,			// Member of the D3DPRIMITIVETYPE enumerated type, describing the type of primitive to render. D3DPT_POINTLIST is not supported with this method.`,
  `#ifdef EMSCRIPTEN
				printf("source-wasm: DrawIndexedPrimitive mode=%d firstV=%d numV=%d firstI=%d prims=%d\\n",
					(int)m_Mode, s_FirstVertex, s_NumVertices, pPrim->m_FirstIndex, numPrimitives );
#endif
				Dx9Device()->DrawIndexedPrimitive(
					m_Mode,			// Member of the D3DPRIMITIVETYPE enumerated type, describing the type of primitive to render. D3DPT_POINTLIST is not supported with this method.`,
  'meshdx8_dip_breadcrumb'
) ? 1 : 0;

n += apply(
  'materialsystem/shaderapidx9/meshdx8.cpp',
  `					numPrimitives );// Number of primitives to render. The number of vertices used is a function of the primitive count and the primitive type.
			}
		}
	}

	if ( g_pLastVertex )`,
  `					numPrimitives );// Number of primitives to render. The number of vertices used is a function of the primitive count and the primitive type.
#ifdef EMSCRIPTEN
				printf("source-wasm: DrawIndexedPrimitive done\\n");
#endif
			}
		}
	}

	if ( g_pLastVertex )`,
  'meshdx8_dip_done_breadcrumb'
) ? 1 : 0;

n += applyAll(
  'vguimatsurface/MatSystemSurface.cpp',
  `	meshBuilder.End();
	m_pMesh->Draw();`,
  `	meshBuilder.End();
#ifdef EMSCRIPTEN
	SourceWasm_SafeMeshDraw( m_pMesh );
#else
	m_pMesh->Draw();
#endif`,
  'matsurface_safe_draw'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `void CEngineVGui::Simulate()
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui::Simulate skip RunFrame\\n");
	return;
#endif
	toolframework->VGui_PreSimulateAllTools();`,
  `void CEngineVGui::Simulate()
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui::Simulate RunFrame\\n");
#endif
	toolframework->VGui_PreSimulateAllTools();`,
  'enginevgui_restore_simulate'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `void CEngineVGui::Paint( PaintMode_t mode )
{
#ifdef EMSCRIPTEN
	(void)mode;
	return;
#endif
	VPROF_BUDGET( "CEngineVGui::Paint", VPROF_BUDGETGROUP_OTHER_VGUI );`,
  `void CEngineVGui::Paint( PaintMode_t mode )
{
#ifdef EMSCRIPTEN
	Msg("source-wasm: EngineVGui::Paint\\n");
#endif
	VPROF_BUDGET( "CEngineVGui::Paint", VPROF_BUDGETGROUP_OTHER_VGUI );`,
  'enginevgui_restore_paint'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `#ifdef EMSCRIPTEN
		// IMesh PaintTraverse traps on this wasm link.
#else
		vgui::surface()->PaintTraverseEx(pVPanel, true );
#endif`,
  `#ifdef EMSCRIPTEN
		Msg("source-wasm: PaintTraverseEx UI\\n");
#endif
		vgui::surface()->PaintTraverseEx(pVPanel, true );
#ifdef EMSCRIPTEN
		Msg("source-wasm: Paint TraverseEx UI done\\n");
#endif`,
  'enginevgui_restore_paint_traverse'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		vgui::ipanel()->SetParent( ingameRoot, 0 );
#ifndef EMSCRIPTEN
		vgui::surface()->PaintTraverseEx( ingameRoot, true );
#endif
		vgui::ipanel()->SetParent( ingameRoot, saveParent );`,
  `		vgui::ipanel()->SetParent( ingameRoot, 0 );
		vgui::surface()->PaintTraverseEx( ingameRoot, true );
		vgui::ipanel()->SetParent( ingameRoot, saveParent );`,
  'enginevgui_restore_ingame_paint'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		vgui::ipanel()->SetParent( ingameToolsRoot, 0 );
#ifndef EMSCRIPTEN
		vgui::surface()->PaintTraverseEx( ingameToolsRoot, true );
#endif
		vgui::ipanel()->SetParent( ingameToolsRoot, saveToolParent );`,
  `		vgui::ipanel()->SetParent( ingameToolsRoot, 0 );
		vgui::surface()->PaintTraverseEx( ingameToolsRoot, true );
		vgui::ipanel()->SetParent( ingameToolsRoot, saveToolParent );`,
  'enginevgui_restore_tools_paint'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient clientmode Init done\\n");
	Msg("source-wasm: CHLClient skip InitAllSystems\\n");
#else
	if ( !IGameSystem::InitAllSystems() )
		return false;
#endif`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient clientmode Init done\\n");
	Msg("source-wasm: CHLClient InitAllSystems\\n");
#endif
	if ( !IGameSystem::InitAllSystems() )
		return false;
#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient InitAllSystems done\\n");
#endif`,
  'client_restore_initallsystems'
) ? 1 : 0;

n += apply(
  'game/client/cdll_client_int.cpp',
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient skip input/vgui/voice remainder\\n");
	return true;
#endif
#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient input/vgui panels\\n");
#endif
	input->Init_All();`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: CHLClient input/vgui/voice remainder\\n");
#endif
	input->Init_All();`,
  'client_restore_input_vgui'
) ? 1 : 0;

n += apply(
  'game/client/clientmode_shared.cpp',
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: ClientMode skip HudLayout\\n");
	(void)pConditions;
#else
	m_pViewport->LoadControlSettings( "scripts/HudLayout.res", NULL, NULL, pConditions );
#endif`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: ClientMode HudLayout\\n");
#endif
	m_pViewport->LoadControlSettings( "scripts/HudLayout.res", NULL, NULL, pConditions );`,
  'clientmode_restore_hudlayout'
) ? 1 : 0;

n += apply(
  'game/client/clientmode_shared.cpp',
  `#ifndef _XBOX
#ifndef EMSCRIPTEN
	HLTVCamera()->Init();
#if defined( REPLAY_ENABLED )
	ReplayCamera()->Init();
#endif
#endif
#endif`,
  `#ifndef _XBOX
	HLTVCamera()->Init();
#if defined( REPLAY_ENABLED )
	ReplayCamera()->Init();
#endif
#endif`,
  'clientmode_restore_hltv'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR after Simulate\\n");
	if ( cl.IsActive() )
#endif
	ClientDLL_FrameStageNotify( FRAME_RENDER_START );`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR after Simulate\\n");
#endif
	ClientDLL_FrameStageNotify( FRAME_RENDER_START );`,
  'scr_restore_fsn'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `#ifdef EMSCRIPTEN
	if ( cl.IsActive() )
#endif
	ClientDLL_FrameStageNotify( FRAME_RENDER_END );`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: SCR FSN end\\n");
#endif
	ClientDLL_FrameStageNotify( FRAME_RENDER_END );`,
  'scr_restore_fsn_end'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `			//-------------------
			// sound
			//-------------------
#ifndef EMSCRIPTEN
			_Host_RunFrame_Sound();
#endif`,
  `			//-------------------
			// sound
			//-------------------
#ifdef EMSCRIPTEN
			Msg("source-wasm: _Host_RunFrame_Sound\\n");
#endif
			_Host_RunFrame_Sound();`,
  'host_restore_sound_frame'
) ? 1 : 0;

n += apply(
  'engine/host.cpp',
  `#ifdef EMSCRIPTEN
			if ( cl.IsActive() )
#endif
			ClientDLL_Update();`,
  `#ifdef EMSCRIPTEN
			Msg("source-wasm: ClientDLL_Update\\n");
#endif
			ClientDLL_Update();`,
  'host_restore_clientdll_update'
) ? 1 : 0;

n += apply(
  'engine/gl_screen.cpp',
  `#ifdef EMSCRIPTEN
	if ( cl.IsActive() )
#endif
	{
		tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "modelloader->UpdateDynamicModels" );
		VPROF( "UpdateDynamicModels" );
		CMDLCacheCriticalSection critsec( g_pMDLCache );
		modelloader->UpdateDynamicModels();
	}`,
  `#ifdef EMSCRIPTEN
	Msg("source-wasm: UpdateDynamicModels\\n");
#endif
	{
		tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "modelloader->UpdateDynamicModels" );
		VPROF( "UpdateDynamicModels" );
		CMDLCacheCriticalSection critsec( g_pMDLCache );
		modelloader->UpdateDynamicModels();
	}`,
  'scr_restore_dynamic_models'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `		IGameSystem *sys = s_GameSystems[i];

#if defined( _X360 )`,
  `		IGameSystem *sys = s_GameSystems[i];
#ifdef EMSCRIPTEN
		Msg("source-wasm: IGameSystem::Init %s\\n", sys->Name() ? sys->Name() : "?");
#endif

#if defined( _X360 )`,
  'gamesystem_init_breadcrumbs'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		vgui::ipanel()->SetParent( ingameRoot, 0 );
		vgui::surface()->PaintTraverseEx( ingameRoot, true );
		vgui::ipanel()->SetParent( ingameRoot, saveParent );`,
  `		vgui::ipanel()->SetParent( ingameRoot, 0 );
		// SOURCE_WASM_PATCH_enginevgui_skip_ingame_paint
		vgui::surface()->PaintTraverseEx( ingameRoot, true );
		vgui::ipanel()->SetParent( ingameRoot, saveParent );`,
  'enginevgui_mark_ingame_paint'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `		vgui::ipanel()->SetParent( ingameToolsRoot, 0 );
		vgui::surface()->PaintTraverseEx( ingameToolsRoot, true );
		vgui::ipanel()->SetParent( ingameToolsRoot, saveToolParent );`,
  `		vgui::ipanel()->SetParent( ingameToolsRoot, 0 );
		// SOURCE_WASM_PATCH_enginevgui_skip_tools_paint
		vgui::surface()->PaintTraverseEx( ingameToolsRoot, true );
		vgui::ipanel()->SetParent( ingameToolsRoot, saveToolParent );`,
  'enginevgui_mark_tools_paint'
) ? 1 : 0;

n += apply(
  'game/client/clientmode_shared.cpp',
  `#ifndef _XBOX
	HLTVCamera()->Init();
#if defined( REPLAY_ENABLED )
	ReplayCamera()->Init();
#endif
#endif`,
  `#ifndef _XBOX
	// SOURCE_WASM_PATCH_clientmode_skip_hltv
	HLTVCamera()->Init();
#if defined( REPLAY_ENABLED )
	ReplayCamera()->Init();
#endif
#endif`,
  'clientmode_mark_hltv'
) ? 1 : 0;

n += applyAll(
  'vguimatsurface/MatSystemSurface.cpp',
  `		meshBuilder.End();
		m_pMesh->Draw();`,
  `		meshBuilder.End();
#ifdef EMSCRIPTEN
		SourceWasm_SafeMeshDraw( m_pMesh );
#else
		m_pMesh->Draw();
#endif`,
  'matsurface_safe_draw_poly'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `bool IGameSystem::InitAllSystems()
{
	int i;

	{
		// first add any auto systems to the end
		CAutoGameSystem *pSystem = s_pSystemList;
		while ( pSystem )`,
  `bool IGameSystem::InitAllSystems()
{
	int i;
#ifdef EMSCRIPTEN
	printf("source-wasm: InitAllSystems enter initted=%d list=%p perframe=%p gamesys=%d\\n",
		(int)s_bSystemsInitted, (void*)s_pSystemList, (void*)s_pPerFrameSystemList, s_GameSystems.Count());
	if ( s_bSystemsInitted )
	{
		printf("source-wasm: InitAllSystems already done\\n");
		return true;
	}
#endif

	{
		// first add any auto systems to the end
		CAutoGameSystem *pSystem = s_pSystemList;
#ifdef EMSCRIPTEN
		int nAutoGuard = 0;
#endif
		while ( pSystem )`,
  'gamesystem_init_enter'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `		CAutoGameSystem *pSystem = s_pSystemList;
#ifdef EMSCRIPTEN
		int nAutoGuard = 0;
#endif
		while ( pSystem )
		{
			if ( s_GameSystems.Find( pSystem ) == s_GameSystems.InvalidIndex() )
			{
				Add( pSystem );
			}`,
  `		CAutoGameSystem *pSystem = s_pSystemList;
#ifdef EMSCRIPTEN
		int nAutoGuard = 0;
#endif
		while ( pSystem )
		{
#ifdef EMSCRIPTEN
			if ( ++nAutoGuard > 4096 )
			{
				printf("source-wasm: InitAllSystems autosystem list overflow\\n");
				break;
			}
#endif
			if ( s_GameSystems.Find( pSystem ) == s_GameSystems.InvalidIndex() )
			{
				Add( pSystem );
			}`,
  'gamesystem_autosystem_guard'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `	for ( i = 0; i < s_GameSystems.Count(); ++i )
	{
		MDLCACHE_CRITICAL_SECTION();

		IGameSystem *sys = s_GameSystems[i];
#ifdef EMSCRIPTEN
		Msg("source-wasm: IGameSystem::Init %s\\n", sys->Name() ? sys->Name() : "?");
#endif`,
  `#ifdef EMSCRIPTEN
	printf("source-wasm: InitAllSystems count=%d\\n", s_GameSystems.Count());
#endif
	for ( i = 0; i < s_GameSystems.Count(); ++i )
	{
#ifndef EMSCRIPTEN
		MDLCACHE_CRITICAL_SECTION();
#endif

		IGameSystem *sys = s_GameSystems[i];
#ifdef EMSCRIPTEN
		printf("source-wasm: IGameSystem::Init %s\\n", sys->Name() ? sys->Name() : "?");
#endif`,
  'gamesystem_init_printf'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `CAutoGameSystem::CAutoGameSystem( char const *name ) :
	m_pszName( name )
{
	// If s_GameSystems hasn't been initted yet, then add ourselves to the global list
	// because we don't know if the constructor for s_GameSystems has happened yet.
	// Otherwise, we can add ourselves right into that list.
	if ( s_bSystemsInitted )
	{
		Add( this );
	}
	else
	{
		m_pNext = s_pSystemList;
		s_pSystemList = this;
	}
}`,
  `CAutoGameSystem::CAutoGameSystem( char const *name ) :
	m_pszName( name )
{
#ifdef EMSCRIPTEN
	// Whole-archive client+server can run this ctor twice on one object
	// and form a circular s_pSystemList.
	for ( CAutoGameSystem *p = s_pSystemList; p; p = p->m_pNext )
	{
		if ( p == this )
			return;
	}
#endif
	// If s_GameSystems hasn't been initted yet, then add ourselves to the global list
	// because we don't know if the constructor for s_GameSystems has happened yet.
	// Otherwise, we can add ourselves right into that list.
	if ( s_bSystemsInitted )
	{
		Add( this );
	}
	else
	{
		m_pNext = s_pSystemList;
		s_pSystemList = this;
	}
}`,
  'autosystem_ctor_once'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `CAutoGameSystemPerFrame::CAutoGameSystemPerFrame( char const *name ) :
	m_pszName( name )
{
	// If s_GameSystems hasn't been initted yet, then add ourselves to the global list
	// because we don't know if the constructor for s_GameSystems has happened yet.
	// Otherwise, we can add ourselves right into that list.
	if ( s_bSystemsInitted )
	{
		Add( this );
	}
	else
	{
		m_pNext = s_pPerFrameSystemList;
		s_pPerFrameSystemList = this;
	}
}`,
  `CAutoGameSystemPerFrame::CAutoGameSystemPerFrame( char const *name ) :
	m_pszName( name )
{
#ifdef EMSCRIPTEN
	for ( CAutoGameSystemPerFrame *p = s_pPerFrameSystemList; p; p = p->m_pNext )
	{
		if ( p == this )
			return;
	}
#endif
	// If s_GameSystems hasn't been initted yet, then add ourselves to the global list
	// because we don't know if the constructor for s_GameSystems has happened yet.
	// Otherwise, we can add ourselves right into that list.
	if ( s_bSystemsInitted )
	{
		Add( this );
	}
	else
	{
		m_pNext = s_pPerFrameSystemList;
		s_pPerFrameSystemList = this;
	}
}`,
  'autosystem_perframe_ctor_once'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `		CAutoGameSystemPerFrame *pSystem = s_pPerFrameSystemList;
		while ( pSystem )
		{
			if ( s_GameSystems.Find( pSystem ) == s_GameSystems.InvalidIndex() )
			{
				Add( pSystem );
			}`,
  `		CAutoGameSystemPerFrame *pSystem = s_pPerFrameSystemList;
#ifdef EMSCRIPTEN
		int nPerFrameGuard = 0;
#endif
		while ( pSystem )
		{
#ifdef EMSCRIPTEN
			if ( ++nPerFrameGuard > 4096 )
			{
				printf("source-wasm: InitAllSystems perframe list overflow\\n");
				break;
			}
#endif
			if ( s_GameSystems.Find( pSystem ) == s_GameSystems.InvalidIndex() )
			{
				Add( pSystem );
			}`,
  'gamesystem_perframe_guard'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `void IGameSystem::Add( IGameSystem* pSys )
{
	s_GameSystems.AddToTail( pSys );
	if ( dynamic_cast< IGameSystemPerFrame * >( pSys ) != NULL )
	{
		s_GameSystemsPerFrame.AddToTail( static_cast< IGameSystemPerFrame * >( pSys ) );
	}
}`,
  `void IGameSystem::Add( IGameSystem* pSys )
{
	s_GameSystems.AddToTail( pSys );
#ifndef EMSCRIPTEN
	if ( dynamic_cast< IGameSystemPerFrame * >( pSys ) != NULL )
	{
		s_GameSystemsPerFrame.AddToTail( static_cast< IGameSystemPerFrame * >( pSys ) );
	}
#endif
}`,
  'gamesystem_add_no_dynamic_cast'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `void IGameSystem::Remove( IGameSystem* pSys )
{
	s_GameSystems.FindAndRemove( pSys );
	if ( dynamic_cast< IGameSystemPerFrame * >( pSys ) != NULL )
	{
		s_GameSystemsPerFrame.FindAndRemove( static_cast< IGameSystemPerFrame * >( pSys ) );
	}
}`,
  `void IGameSystem::Remove( IGameSystem* pSys )
{
	s_GameSystems.FindAndRemove( pSys );
#ifdef EMSCRIPTEN
	if ( pSys && pSys->IsPerFrame() )
	{
		s_GameSystemsPerFrame.FindAndRemove( static_cast< IGameSystemPerFrame * >( pSys ) );
	}
#else
	if ( dynamic_cast< IGameSystemPerFrame * >( pSys ) != NULL )
	{
		s_GameSystemsPerFrame.FindAndRemove( static_cast< IGameSystemPerFrame * >( pSys ) );
	}
#endif
}`,
  'gamesystem_remove_no_dynamic_cast'
) ? 1 : 0;

n += apply(
  'game/server/AI_ResponseSystem.cpp',
  `bool CDefaultResponseSystem::Init()
{
/*
	Warning( "sizeof( Response ) == %d\\n", sizeof( Response ) );
	Warning( "sizeof( ResponseGroup ) == %d\\n", sizeof( ResponseGroup ) );
	Warning( "sizeof( Criteria ) == %d\\n", sizeof( Criteria ) );
	Warning( "sizeof( AI_ResponseParams ) == %d\\n", sizeof( AI_ResponseParams ) );
*/
	const char *basescript = GetScriptFile();

	LoadRuleSet( basescript );

	return true;
}`,
  `bool CDefaultResponseSystem::Init()
{
#ifdef EMSCRIPTEN
	return true; // SOURCE_WASM_PATCH_response_system_init
#else
	const char *basescript = GetScriptFile();
	LoadRuleSet( basescript );
	return true;
#endif
}`,
  'response_system_init'
) ? 1 : 0;

n += apply(
  'vguimatsurface/MatSystemSurface.cpp',
  `		CUtlBuffer buf;
		if ( !g_pFullFileSystem->ReadFile( fontFileName, NULL, buf ) )
		{
			Msg( "Failed to load custom font file '%s'\\n", fontFileName );
			return NULL;
		}`,
  `		CUtlBuffer buf;
#ifdef EMSCRIPTEN
		static CUtlVector<CUtlString> s_failedFonts;
		for ( int i = 0; i < s_failedFonts.Count(); ++i )
		{
			if ( !Q_stricmp( s_failedFonts[i].Get(), fontFileName ) )
				return NULL;
		}
#endif
		if ( !g_pFullFileSystem->ReadFile( fontFileName, NULL, buf ) )
		{
#ifdef EMSCRIPTEN
			s_failedFonts.AddToTail( fontFileName );
#endif
			Msg( "Failed to load custom font file '%s'\\n", fontFileName );
			return NULL;
		}`,
  'font_fail_cache'
) ? 1 : 0;

n += apply(
  'engine/vgui_baseui_interface.cpp',
  `void CEngineVGui::UpdateButtonState( const InputEvent_t &event )
{
	m_pInputInternal->UpdateButtonState( event );
}`,
  `void CEngineVGui::UpdateButtonState( const InputEvent_t &event )
{
	if ( !m_pInputInternal )
		return; // SOURCE_WASM_PATCH_vgui_button_null
	m_pInputInternal->UpdateButtonState( event );
}`,
  'vgui_button_null'
) ? 1 : 0;

n += apply(
  'engine/keys.cpp',
  `	EngineVGui()->UpdateButtonState( event );

	// Let tools have a whack at keys
	if ( FilterKey( event, KEY_UP_TOOLS, HandleToolKey ) )
		return;`,
  `	if ( EngineVGui() )
		EngineVGui()->UpdateButtonState( event );
#ifdef EMSCRIPTEN
#else
	if ( FilterKey( event, KEY_UP_TOOLS, HandleToolKey ) )
		return;
#endif`,
  'key_event_no_tools'
) ? 1 : 0;

n += apply(
  'engine/toolframework.cpp',
  `bool CClientEngineTools::SetupEngineView( Vector &origin, QAngle &angles, float &fov )
{
	return g_ToolFrameworkInternal.SetupEngineView( origin, angles, fov );
}`,
  `bool CClientEngineTools::SetupEngineView( Vector &origin, QAngle &angles, float &fov )
{
#ifdef EMSCRIPTEN
	return false; // SOURCE_WASM_PATCH_tools_setup_view
#else
	return g_ToolFrameworkInternal.SetupEngineView( origin, angles, fov );
#endif
}`,
  'tools_setup_view'
) ? 1 : 0;

n += apply(
  'engine/vgui_drawtreepanel.cpp',
  `	if ( IsX360() )
		return;

	if ( vgui_drawtree.GetInt() <= 0 )`,
  `	if ( IsX360() )
		return;
#ifdef EMSCRIPTEN
	if ( !g_pDrawTreeFrame )
		return; // SOURCE_WASM_PATCH_drawtree_null
#endif

	if ( vgui_drawtree.GetInt() <= 0 )`,
  'drawtree_null'
) ? 1 : 0;

n += apply(
  'engine/cl_texturelistpanel.cpp',
  `	if ( IsX360() )
		return;

	g_pMaterialSystemDebugTextureInfo->EnableGetAllTextures( mat_texture_list_all.GetBool() );`,
  `	if ( IsX360() )
		return;
#ifdef EMSCRIPTEN
	if ( !g_pTextureListPanel )
		return; // SOURCE_WASM_PATCH_texturelist_null
#endif

	g_pMaterialSystemDebugTextureInfo->EnableGetAllTextures( mat_texture_list_all.GetBool() );`,
  'texturelist_null'
) ? 1 : 0;

n += apply(
  'game/client/viewrender.cpp',
  `void CViewRender::RenderPlayerSprites()
{
	tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "%s", __FUNCTION__ );`,
  `void CViewRender::RenderPlayerSprites()
{
#ifdef EMSCRIPTEN
	return; // SOURCE_WASM_PATCH_browser_player_sprites
#endif
	tmZone( TELEMETRY_LEVEL0, TMZF_NONE, "%s", __FUNCTION__ );`,
  'browser_skip_player_sprites'
) ? 1 : 0;

n += apply(
  'game/client/viewrender.cpp',
  `void CViewRender::RenderView( const CViewSetup &view, int nClearFlags, int whatToDraw )
{
	m_UnderWaterOverlayMaterial.Shutdown();`,
  `void CViewRender::RenderView( const CViewSetup &view, int nClearFlags, int whatToDraw )
{
#ifdef EMSCRIPTEN
	// WebGL has no stable image-space motion-blur render target in this port.
	// Disable the effect once before the first browser frame so it cannot
	// overwrite the native world with an all-black post-process pass.
	static bool source_wasm_motion_blur_disabled = false;
	if ( !source_wasm_motion_blur_disabled )
	{
		mat_motion_blur_enabled.SetValue( 0 );
		source_wasm_motion_blur_disabled = true;
	}
#endif // SOURCE_WASM_PATCH_browser_disable_motion_blur
	m_UnderWaterOverlayMaterial.Shutdown();`,
  'browser_disable_motion_blur'
) ? 1 : 0;

n += apply(
  'game/client/viewrender.cpp',
  `		// clear happens here probably
		SetupMain3DView( view, nClearFlags );`,
  `		// clear happens here probably
#ifdef EMSCRIPTEN
		// The browser backbuffer is not guaranteed to retain the previous VGUI
		// frame. Clear it before drawing the native world so a closed menu cannot
		// remain as stale pixels over the gameplay view.
		nClearFlags |= VIEW_CLEAR_COLOR;
#endif // SOURCE_WASM_PATCH_browser_clear_native_view
		SetupMain3DView( view, nClearFlags );`,
  'browser_clear_native_view'
) ? 1 : 0;

n += apply(
  'game/client/viewrender.cpp',
  `		if ( IsPC() )
		{
			tmZone( TELEMETRY_LEVEL0, "GrabPreColorCorrectedFrame" );

			// Grab the pre-color corrected frame for editing purposes
			engine->GrabPreColorCorrectedFrame( view.x, view.y, view.width, view.height );
		}`,
  `		if ( IsPC() )
		{
#ifndef EMSCRIPTEN
			tmZone( TELEMETRY_LEVEL0, "GrabPreColorCorrectedFrame" );

			// Grab the pre-color corrected frame for editing purposes
			engine->GrabPreColorCorrectedFrame( view.x, view.y, view.width, view.height );
#endif // SOURCE_WASM_PATCH_browser_skip_pre_color_frame
		}`,
  'browser_skip_pre_color_frame'
) ? 1 : 0;

n += apply(
  'game/shared/igamesystem.cpp',
  `#ifdef EMSCRIPTEN
	printf("source-wasm: InitAllSystems enter\\n");
#endif`,
  `#ifdef EMSCRIPTEN
	printf("source-wasm: InitAllSystems enter initted=%d list=%p perframe=%p gamesys=%d\\n",
		(int)s_bSystemsInitted, (void*)s_pSystemList, (void*)s_pPerFrameSystemList, s_GameSystems.Count());
	if ( s_bSystemsInitted )
	{
		printf("source-wasm: InitAllSystems already done\\n");
		return true;
	}
#endif`,
  'gamesystem_already_done'
) ? 1 : 0;

if (failures.length) {
  console.error(`source patch audit failed with ${failures.length} unknown source shape(s); no files were written`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`source patch check passed: ${planned} patch(es) would apply, ${alreadyApplied} already applied in ${root}`);
} else {
  for (const [abs, value] of staged) {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.isBuffer(value) ? value : quietDiagnostics(value));
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    stateFiles.set(rel, createHash('sha256').update(readFileSync(abs)).digest('hex'));
  }
  writeFileSync(statePath, `${JSON.stringify({
    version: PATCH_STATE_VERSION,
    labels: [...appliedLabels].sort(),
    files: Object.fromEntries([...stateFiles.entries()].sort(([a], [b]) => a.localeCompare(b)))
  }, null, 2)}\n`);
  console.log(`source patches applied: ${n} change(s) in ${root}`);
}
