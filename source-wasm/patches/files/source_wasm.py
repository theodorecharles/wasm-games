# encoding: utf-8
# Source-wasm Waf hook. Copied into the user engine tree. Not Valve code.

import os
import re
import shutil
import subprocess


def _wasm_ld_supports_allow_multiple():
	"""Probe the active wasm-ld instead of passing a version-specific flag blindly."""
	candidates = []
	wasm_ld = os.environ.get('WASM_LD')
	if wasm_ld:
		candidates.append(wasm_ld)
	emsdk = os.environ.get('EMSDK')
	if emsdk:
		candidates.append(os.path.join(emsdk, 'upstream', 'bin', 'wasm-ld'))
	which = shutil.which('wasm-ld')
	if which:
		candidates.append(which)
	for candidate in candidates:
		if not os.path.isfile(candidate) or not os.access(candidate, os.X_OK):
			continue
		try:
			help_text = subprocess.check_output(
				[candidate, '--help'], stderr=subprocess.STDOUT)
		except (OSError, subprocess.CalledProcessError):
			continue
		return b'--allow-multiple-definition' in help_text
	return False

def options(opt):
	return

def configure(conf):
	if not (getattr(conf.options, 'EMSCRIPTEN', False) or os.environ.get('EMSCRIPTEN')):
		return
	conf.env.EMSCRIPTEN = True
	conf.env.DEST_OS = 'linux'
	conf.env.DEST_CPU = 'wasm32'
	conf.env.append_unique('DEFINES', [
		'EMSCRIPTEN=1',
		'LINUX=1', '_LINUX=1',
		'POSIX=1', '_POSIX=1', 'PLATFORM_POSIX=1',
		'GNUC',
		'COMPILER_GCC=1',
		'NO_HOOK_MALLOC',
		'NO_MALLOC_OVERRIDE',
		'_DLL_EXT=.so',
		'DX_TO_GL_ABSTRACTION',
		'GL_GLEXT_PROTOTYPES',
		'TOGLES',
		'USE_SDL',
	])
	if os.environ.get('SOURCE_WASM_TRACE') == '1':
		conf.env.append_unique('DEFINES', ['SOURCE_WASM_TRACE=1'])
	conf.env.SDL = 1
	conf.env.TOGLES = True
	conf.env.GL = False
	ports = [
		'-sUSE_SDL=2',
		'-sUSE_FREETYPE=1',
		'-sUSE_LIBPNG=1',
		'-sUSE_LIBJPEG=1',
		'-sUSE_ZLIB=1',
		'-sUSE_BZIP2=1',
	]
	# wasm SIMD backs the SSE headers Source expects.
	simd = ['-msimd128', '-msse2']
	conf.env.append_unique('CFLAGS', ports + simd)
	conf.env.append_unique('CXXFLAGS', ports + simd + ['-std=c++11', '-fpermissive'])
	conf.env.append_unique('LINKFLAGS', ports)
	conf.env.SOURCE_WASM_LINKFLAGS = [
		'-sMODULARIZE=1',
		'-sEXPORT_NAME=createSourceEngineModule',
		'-sINVOKE_RUN=0',
		'-sEXPORTED_RUNTIME_METHODS=["FS","HEAPU8","HEAP8","ccall","cwrap","callMain"]',
		'-sEXPORTED_FUNCTIONS=["_main","_source_wasm_read_engine_state","_source_wasm_read_capture_intent","_source_wasm_set_capture_intent","_source_wasm_pause","_source_wasm_pointer","_source_wasm_pointer_button","_source_wasm_set_player_name","_source_wasm_set_cvar","_source_wasm_client_cmd"]',
		'-sNO_EXIT_RUNTIME=1',
		'-sSTACK_SIZE=8388608',
		'-sALLOW_MEMORY_GROWTH=1',
		'-sINITIAL_MEMORY=2147483648',
		'-sMAXIMUM_MEMORY=4294901760',
		'-sUSE_WEBGL2=1',
		'-sFULL_ES3=1',
		'-sMAX_WEBGL_VERSION=2',
		'-sFORCE_FILESYSTEM=1',
		'-lidbfs.js',
		'-sENVIRONMENT=web,worker',
		'-sEXIT_RUNTIME=0',
		'-g',
		'-sASSERTIONS=1',
		# Source's SetThink/SetTouch/SetUse helpers intentionally cast derived
		# member-function pointers to CBaseEntity member-function pointers. Wasm
		# enforces indirect-call signatures, so Emscripten must synthesize the
		# compatibility thunks used by those native-era callbacks.
		'-sEMULATE_FUNCTION_POINTER_CASTS=1',
		'-sBINARYEN_EXTRA_PASSES=--pass-arg=max-func-params@30',
	]
	if _wasm_ld_supports_allow_multiple():
		conf.env.SOURCE_WASM_LINKFLAGS.append('-Wl,--allow-multiple-definition')
	for store in ('SDL2', 'FT2', 'FC', 'JPEG', 'PNG', 'ZLIB', 'OPENAL', 'CURL', 'BZ2', 'DL', 'LOG', 'M', 'RT'):
		setattr(conf.env, 'LIB_%s' % store, [])
		setattr(conf.env, 'LIBPATH_%s' % store, [])
		setattr(conf.env, 'INCLUDES_%s' % store, [])
	conf.env.HAVE_SDL2 = 1
	conf.env.HAVE_FT2 = 1
	conf.env.HAVE_ZLIB = 1

def wrap_build(bld):
	if not getattr(bld.env, 'EMSCRIPTEN', False):
		return
	def wasm_shlib(**kw):
		target = kw.get('target') or kw.get('name') or 'mod'
		feats = kw.get('features', 'c cxx')
		if isinstance(feats, str):
			feats = feats.split()
		kw['features'] = [f for f in feats if f not in ('cxxshlib', 'cshlib')] + ['cxxstlib']
		kw.pop('install_path', None)
		bld.env.append_unique('SOURCE_WASM_LIBS', [target])
		return bld.stlib(**kw)
	bld.shlib = wasm_shlib

def attach_factory(bld):
	if not getattr(bld.env, 'EMSCRIPTEN', False):
		return
	flags = list(getattr(bld.env, 'SOURCE_WASM_LINKFLAGS', []))
	for extra_flag in ('-sINVOKE_RUN=0', '-lidbfs.js'):
		if extra_flag not in flags:
			flags.append(extra_flag)
	extra = list(getattr(bld.env, 'SOURCE_WASM_LIBS', []))
	for tg in bld.get_all_task_gen():
		name = str(getattr(tg, 'target', '') or getattr(tg, 'name', ''))
		if name not in ('source-engine', 'hl2_launcher'):
			continue
		cur = tg.to_list(getattr(tg, 'linkflags', []))
		tg.linkflags = cur + flags
		uses = tg.to_list(getattr(tg, 'use', []))
		for lib in extra:
			if lib not in uses and lib not in ('hl2_launcher', 'source-engine'):
				uses.append(lib)
		tg.use = uses
		# Keep every Source stlib; CreateInterface factories are otherwise GC'd.
		tg.env.STLIB_MARKER = '-Wl,--whole-archive'
		tg.env.SHLIB_MARKER = '-Wl,--no-whole-archive'
		tg.env.append_unique('LDFLAGS', ['-Wl,--no-whole-archive'])
		tg.env.append_unique('LINKFLAGS_cxxprogram', flags)
