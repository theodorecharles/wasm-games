# =============================================================================
# unified CMake build for all targets.
#
#   Native Linux (default):
#     cmake -S . -B build/native && cmake --build build/native -j
#       -> build/native/cod2_linux   build/native/cod2_lnxded
#
#   Downstream WebAssembly work is intentionally isolated from this upstream
#   build. Use scripts/build-web.sh; configuring this file with Emscripten fails.
#
#   Windows (MinGW cross-compile):
#     cmake -S . -B build/win32 -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-mingw32.cmake
#     cmake --build build/win32 -j
#       -> build/win32/cod2_win32_ded.exe          (headless, default)
#     add -DCOD2_WIN32_CLIENT=ON for the SDL2/GL client (needs static SDL2 libs).
#
# compile_commands.json is emitted for IDE/clangd use.
# =============================================================================
cmake_minimum_required(VERSION 3.16)

# Native-Windows MSVC client build (cl.exe). Set by the msvc-client preset;
# selects the cmake/win32-msvc.cmake path and suppresses the GCC-only -m32 seed
# and the global GAS ASM language (MSVC's blobs become C, not MASM).
option(COD2_WIN_MSVC "Native Windows build with MSVC/cl instead of MinGW" OFF)

# x86_64 (LP64) target. OFF (default) = the original ILP32/x86 reconstruction
# (4-byte pointers, the committed 32-bit data blobs). ON is an IN-PROGRESS port:
# it suppresses the -m32 seed and the 32-bit-only asserts/lib paths so an x64
# toolchain can configure and COMPILE the source set (to measure the x64 error
# surface). It does NOT link/run yet — the typed-data migration (Stage 2) is the
# prerequisite. Additive: every 32-bit path below is preserved as the default.
option(COD2_X64 "Target x86_64/LP64 instead of the original ILP32/x86 (port in progress)" OFF)

# -m32 must be in effect when the native compiler is probed (multilib link
# tests). Seed it ONLY for the plain native 32-bit build — the MinGW (i686) and
# Emscripten toolchains are 32-bit/wasm already and must not see -m32, MSVC
# rejects it outright, and the x64 port wants the native 64-bit ABI.
if(NOT CMAKE_TOOLCHAIN_FILE AND NOT COD2_WIN_MSVC AND NOT COD2_X64)
  set(CMAKE_C_FLAGS_INIT   "-m32")
  set(CMAKE_ASM_FLAGS_INIT "-m32")
endif()

# The GAS .S blobs are a GNU-toolchain concern; the MSVC path uses C data.
if(COD2_WIN_MSVC)
  project(cod2 LANGUAGES C CXX)
else()
  project(cod2 LANGUAGES C ASM)
endif()

if(EMSCRIPTEN)
  message(FATAL_ERROR
    "The inherited OpenCoD2 web target is outside the downstream source boundary. "
    "Run scripts/build-web.sh instead.")
endif()

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_C_STANDARD 99)

# git short hash for the crash-reporter build stamp.
execute_process(COMMAND git -C ${CMAKE_SOURCE_DIR} rev-parse --short HEAD
                OUTPUT_VARIABLE COD2_GIT_HASH OUTPUT_STRIP_TRAILING_WHITESPACE
                ERROR_QUIET)
if(NOT COD2_GIT_HASH)
  set(COD2_GIT_HASH "unknown")
endif()

# Common warning-demotions used on every toolchain (reconstructed C trips these).
set(COD2_WNO
  -Wno-error=incompatible-pointer-types -Wno-error=implicit-function-declaration
  -Wno-error=implicit-int -Wno-error=int-conversion -Wno-error=return-mismatch)

set(COD2_SRC_DIR ${CMAKE_SOURCE_DIR}/src)

# x64 port: expose COD2_X64 to the source so the ILP32 layout pins
# (COD2_ASSERT_FIELD/SIZE in cod2_defs.h) and other arch-specific code can adapt.
# Global so every target/branch below inherits it. No-op for the default 32-bit
# build. Placed before any target is created.
if(COD2_X64)
  add_compile_definitions(COD2_X64=1)
  # add_compile_definitions(COD2_GUARDHEAP=1)  # DIAGNOSTIC: guard-page Z_Malloc to catch heap overruns
endif()

# =============================================================================
if(WIN32 AND MSVC)
# ----------------------------------------------------------------------------
# WINDOWS / MSVC (cl.exe) -- additive native-Windows client build.
# Self-contained in cmake/win32-msvc.cmake so the MinGW path below is untouched.
# ----------------------------------------------------------------------------
include(${CMAKE_SOURCE_DIR}/cmake/win32-msvc.cmake)

# =============================================================================
elseif(WIN32)
# ----------------------------------------------------------------------------
# WINDOWS (MinGW cross-compile: cod2_win32_ded.exe / cod2_win32.exe)
# ----------------------------------------------------------------------------
option(COD2_WIN32_CLIENT "SDL2/GL client (needs static SDL2 libs) instead of the headless server" OFF)
option(COD2_WIN32_REAL_D3D9 "Real IDirect3DDevice9 renderer path (Wine d3d9.dll)" OFF)

# win32 C flags (mirror Makefile.win32 WCFLAGS); -fcommon is essential (tentative
# BSS defs in both bss.c and the reconstructed .c rely on the pre-GCC-10 merge).
add_compile_options(
  "$<$<COMPILE_LANGUAGE:C>:-w;-g;-msse;-fcommon;-DSDL_DISABLE_IMMINTRIN_H>"
  "$<$<COMPILE_LANGUAGE:C>:-include;${COD2_SRC_DIR}/headers/win32_compat.h>"
  "$<$<COMPILE_LANGUAGE:C>:-D_GNU_SOURCE=1;-DWIN32;-D_WIN32>"
  "$<$<COMPILE_LANGUAGE:C>:${COD2_WNO}>"
  "$<$<COMPILE_LANGUAGE:ASM>:-m32>")
include_directories(${COD2_SRC_DIR}/PC/speex ${COD2_SRC_DIR} ${COD2_SRC_DIR}/headers ${COD2_SRC_DIR}/win32/shims ${CMAKE_SOURCE_DIR})

# PE link: same seam aliases as Linux, but every C symbol carries PE's leading '_'.
set(COD2_WIN_LINK
  -static -static-libgcc -static-libstdc++
  -Wl,--allow-multiple-definition -Wl,--wrap,R_Error
  -Wl,--defsym,___mh_execute_header=0x1000
  -Wl,--defsym,_level_ptr=_level
  -Wl,--defsym,_g_entities_ptr=_g_entities
  -Wl,--defsym,_scr_const_ptr=_scr_const
  -Wl,--defsym,_playerCorpseInfo_ptr=_g_scr_data
  -Wl,--defsym,_g_renderer_ptr=_re
  -Wl,--defsym,_scrAnimPub_ptr=_scrAnimPub
  -Wl,--defsym,_scrCompPub_ptr=_scrCompilePub
  -Wl,--defsym,_scrParserPub_ptr=_scrParserPub
  -Wl,--defsym,_r_frontEndData_ptr=_rg
  -Wl,--defsym,_r_sys_ptr=_ri
  -Wl,--defsym,_r_limits_ptr=_vidConfig
  -Wl,--defsym,_sv_ptr=_sv
  -Wl,--defsym,_svs_ptr=_svs
  -Wl,--defsym,_cg_globUI=_legacyHacks
  -Wl,--defsym,_g_time=_imp_level_bgs
  -Wl,--defsym,_g_time_ptr=_imp_bgs)
set(COD2_WIN_LIBS ws2_32 winmm z stdc++ winpthread dbghelp)

if(COD2_WIN32_CLIENT)
  add_compile_definitions(W32_CLIENT)
  include_directories(${COD2_SRC_DIR}/win32/sdl2/include)
  list(APPEND COD2_WIN_LINK -L${COD2_SRC_DIR}/win32/sdl2/lib)
  list(APPEND COD2_WIN_LIBS SDL2 opengl32 imm32 ole32 oleaut32 version uuid
       setupapi shell32 dinput8 gdi32 advapi32 user32 kernel32 winmm ws2_32)
  set(W32_EXE cod2_win32)
else()
  add_compile_definitions(DEDICATED)
  set(W32_EXE cod2_win32_ded)
endif()
if(COD2_WIN32_REAL_D3D9)
  add_compile_definitions(GFX_REAL_D3D9)
endif()

# source set (mirror WIN_C_SRCS): src/PC, src/Mac, src/stubs, src/win32, and
# src-root files, minus the native-asm
# data .c, cpp_trampoline, agl_stubs, and the bundled-zlib inflate split (use -lz).
file(GLOB_RECURSE W_PC_C    CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/PC/*.c")
file(GLOB_RECURSE W_MAC_C   CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/Mac/*.c")
file(GLOB_RECURSE W_STUBS_C CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/stubs/*.c")
file(GLOB_RECURSE W_WIN_C   CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/win32/*.c")
file(GLOB         W_ROOT_C  CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/*.c")
set(WIN_C ${W_PC_C} ${W_MAC_C} ${W_STUBS_C} ${W_WIN_C} ${W_ROOT_C})
list(FILTER WIN_C EXCLUDE REGEX "^src/(data|import_pointers|literals)\\.c$")
list(FILTER WIN_C EXCLUDE REGEX "^src/stubs/(cpp_trampoline|agl_stubs)\\.c$")
list(FILTER WIN_C EXCLUDE REGEX "^src/PC/zlib/(inflate|infblock|infcodes|inffast|inftrees|infutil|adler32|zutil)\\.c$")
list(APPEND WIN_C src/blobs/bss.c src/unix/sysdiff_statehash.c)
if(COD2_WIN32_CLIENT)
  list(APPEND WIN_C src/unix/linux_input.c)   # pure-SDL2 event pump, works on win32
else()
  list(REMOVE_ITEM WIN_C src/win32/gl_loader.c)  # client-only (real GL loader)
endif()

# ELF .S data blobs -> PE/COFF .S, then assemble (data/literals/import_pointers/vtables).
set(W32GEN ${CMAKE_SOURCE_DIR}/build/win_gen)
set(WIN_ASM_GEN ${W32GEN}/data.win.S ${W32GEN}/literals.win.S ${W32GEN}/import_pointers.win.S)
set_source_files_properties(${WIN_ASM_GEN} PROPERTIES LANGUAGE ASM)

# PE link aliases for C++ symbols stored in the (C-compiled) data blobs: the C
# compiler prefixes them to '___ZN...' (common syms, no address until link), so
# we point the '__ZN...' references at them with --defsym (an asm .set can't
# bind a common symbol). Generated at configure time from the blob sources.
file(STRINGS ${W32GEN}/cxx_defsyms_c.txt COD2_CXX_DEFSYMS_C)
file(STRINGS ${W32GEN}/cxx_defsyms_asm.txt COD2_CXX_DEFSYMS_ASM)
foreach(pair ${COD2_CXX_DEFSYMS_C} ${COD2_CXX_DEFSYMS_ASM})
  list(APPEND COD2_WIN_LINK -Wl,--defsym,${pair})
endforeach()

set_source_files_properties(src/PC/qcommon/crash_handler.c PROPERTIES
  COMPILE_DEFINITIONS "COD2_GIT_HASH=\"${COD2_GIT_HASH}\"")

add_executable(${W32_EXE} ${WIN_C} ${WIN_ASM_GEN})
target_link_options(${W32_EXE} PRIVATE ${COD2_WIN_LINK})
target_link_libraries(${W32_EXE} PRIVATE ${COD2_WIN_LIBS})
set_target_properties(${W32_EXE} PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR} SUFFIX ".exe")

# Optional, experimental: build the renderer as a swap-in DLL plus a DLL-loading
# engine exe. Only meaningful for the win32 client; built explicitly
# (cmake --build build-win32 --target gfxdll), never part of `all`.
#   -> gfx_d3d_mp_x86_s.dll        (renderer DLL, exports GetRefAPI)
#   -> cod2_win32_gfxdll.exe       (engine that LoadLibrary's it at runtime)
# The renderer<->engine bridge is PRE-GENERATED and committed under build/gfxdll/:
# lean_*.win.S are the engine data blobs sliced down to only the closure the
# renderer references (the rest -- and the ~2200 function refs that were no-op
# stubs -- dropped), plus the thunks/stubs/data/glue/defsyms for that lean
# boundary. Pure compile+link -- no scripts or build-time tools.
if(COD2_WIN32_CLIENT)
  file(GLOB GFXDLL_RENDERER CONFIGURE_DEPENDS
    ${COD2_SRC_DIR}/PC/gfx_d3d/*.c ${COD2_SRC_DIR}/Mac/DirectX_9/*.c)
  set(GFXDLL_UTIL
    ${COD2_SRC_DIR}/PC/qcommon/q_math.c       ${COD2_SRC_DIR}/PC/universal/assertive.c
    ${COD2_SRC_DIR}/PC/universal/com_convexhull.c ${COD2_SRC_DIR}/PC/universal/com_math.c
    ${COD2_SRC_DIR}/PC/universal/com_memory.c ${COD2_SRC_DIR}/PC/universal/com_shared.c
    ${COD2_SRC_DIR}/PC/universal/fft.c        ${COD2_SRC_DIR}/PC/universal/q_parse.c
    ${COD2_SRC_DIR}/PC/universal/q_shared.c   ${COD2_SRC_DIR}/PC/universal/surfaceflags.c
    ${COD2_SRC_DIR}/stubs/cpp_compat.c        ${COD2_SRC_DIR}/stubs/link_stubs.c
    ${COD2_SRC_DIR}/stubs/macos_compat.c      ${COD2_SRC_DIR}/stubs/material_state_maps.c
    ${COD2_SRC_DIR}/stubs/material_tech_names.c ${COD2_SRC_DIR}/stubs/missing_c_syms.c
    ${COD2_SRC_DIR}/win32/gl_loader.c         ${COD2_SRC_DIR}/blobs/bss.c)
  add_library(gfx_d3d_mp_x86_s SHARED
    build/gfxdll/force_thunks.s build/gfxdll/printfwd.c
    build/gfxdll/cpp_abi.s      build/gfxdll/glue.c
    ${GFXDLL_RENDERER} ${GFXDLL_UTIL}
    build/gfxdll/lean_data.win.S build/gfxdll/lean_literals.win.S
    build/gfxdll/lean_import_pointers.win.S
    build/gfxdll/thunks.s build/gfxdll/stubs.c build/gfxdll/data.c)
  set_source_files_properties(
    build/gfxdll/force_thunks.s build/gfxdll/cpp_abi.s build/gfxdll/thunks.s
    build/gfxdll/lean_data.win.S build/gfxdll/lean_literals.win.S
    build/gfxdll/lean_import_pointers.win.S
    PROPERTIES LANGUAGE ASM)
  file(STRINGS build/gfxdll/cxx_defsyms.txt GFXDLL_CXXDEF)
  set(GFXDLL_LINK -static -static-libgcc -Wl,--allow-multiple-definition
                  -Wl,--defsym,___mh_execute_header=0x1000)
  foreach(p ${GFXDLL_CXXDEF})
    list(APPEND GFXDLL_LINK -Wl,--defsym,${p})
  endforeach()
  execute_process(COMMAND ${CMAKE_C_COMPILER} -print-file-name=libstdc++.a
                  OUTPUT_VARIABLE GFX_LSCPP OUTPUT_STRIP_TRAILING_WHITESPACE)
  execute_process(COMMAND ${CMAKE_C_COMPILER} -print-file-name=libsupc++.a
                  OUTPUT_VARIABLE GFX_LSUP OUTPUT_STRIP_TRAILING_WHITESPACE)
  target_link_options(gfx_d3d_mp_x86_s PRIVATE ${GFXDLL_LINK}
    -L${COD2_SRC_DIR}/win32/sdl2/lib ${CMAKE_SOURCE_DIR}/build/gfxdll/gfxdll.def)
  target_link_libraries(gfx_d3d_mp_x86_s PRIVATE
    -Wl,-Bstatic SDL2 -Wl,-Bdynamic
    opengl32 gdi32 user32 kernel32 winmm imm32 ole32 oleaut32 version uuid
    setupapi shell32 dinput8 advapi32 hid ws2_32 ${GFX_LSCPP} ${GFX_LSUP})
  set_target_properties(gfx_d3d_mp_x86_s PROPERTIES
    PREFIX "" SUFFIX ".dll" RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

  # the DLL-loading engine exe: the client, with the 3 loader TUs compiled
  # -DCOD2_GFX_DLL (CL_InitRef LoadLibrary's the DLL at runtime).
  add_library(gfxdll_loader OBJECT
    ${COD2_SRC_DIR}/PC/client_mp/cl_main_mp.c
    ${COD2_SRC_DIR}/PC/win32/gfx_v60_threads.c
    ${COD2_SRC_DIR}/PC/win32/gfx_dll_v60.c)
  target_compile_definitions(gfxdll_loader PRIVATE COD2_GFX_DLL)
  set(WIN_C_GFXDLL ${WIN_C})
  list(REMOVE_ITEM WIN_C_GFXDLL
    src/PC/client_mp/cl_main_mp.c src/PC/win32/gfx_v60_threads.c src/PC/win32/gfx_dll_v60.c)
  add_executable(cod2_win32_gfxdll
    ${WIN_C_GFXDLL} ${WIN_ASM_GEN} $<TARGET_OBJECTS:gfxdll_loader>)
  target_link_options(cod2_win32_gfxdll PRIVATE ${COD2_WIN_LINK})
  target_link_libraries(cod2_win32_gfxdll PRIVATE ${COD2_WIN_LIBS})
  set_target_properties(cod2_win32_gfxdll PROPERTIES
    SUFFIX ".exe" RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

  add_custom_target(gfxdll DEPENDS gfx_d3d_mp_x86_s cod2_win32_gfxdll)
endif()

# =============================================================================
else()
# ----------------------------------------------------------------------------
# NATIVE Linux (cod2_linux + cod2_lnxded)
# ----------------------------------------------------------------------------
option(COD2_DEBUG "-O0, no hardening (gdb / canary-UB work; mirrors DEBUG=1)" OFF)
set(COD2_FEATURE_CFLAGS "" CACHE STRING "Pass-through feature gates, e.g. -DCOD2_PATCH_13=1")
set(COD2_WWWDL_LIBS "-l:libcurl.so.4" CACHE STRING "1.3 redirected-download backend lib")

# Architecture seam (COD2_X64): the original build is ILP32/x86 (-m32, /usr/lib32,
# 4-byte-stack-boundary). The x64 port uses the native LP64 ABI instead. Every
# value below defaults to the original 32-bit one so existing builds are byte-for-
# byte unchanged when COD2_X64=OFF.
if(COD2_X64)
  set(COD2_ARCH_CFLAGS "")                                 # native x86_64
  set(COD2_ARCH_LDFLAGS "")
  set(COD2_LIBSTDCPP "stdc++" CACHE STRING "C++ runtime")  # native libstdc++
  set(COD2_ARCH_LIBDIRS "")
else()
  set(COD2_ARCH_CFLAGS -m32 -mincoming-stack-boundary=2)
  set(COD2_ARCH_LDFLAGS -m32)
  set(COD2_LIBSTDCPP "/usr/lib32/libstdc++.so.6" CACHE STRING "32-bit libstdc++")
  set(COD2_ARCH_LIBDIRS -L/usr/lib32 -L/usr/lib/i386-linux-gnu)
endif()

find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
  pkg_check_modules(SDL2 sdl2)
endif()
if(NOT SDL2_FOUND)
  set(SDL2_INCLUDE_DIRS /usr/include/SDL2)
  set(SDL2_LIBRARIES SDL2)
endif()

if(COD2_DEBUG)
  set(COD2_OPT_FLAGS -O0)
  set(COD2_HARDEN_CFLAGS "")
  set(COD2_HARDEN_LDFLAGS "")
else()
  set(COD2_OPT_FLAGS
      -O2 -fno-strict-aliasing -fwrapv -fno-strict-overflow
      -fno-delete-null-pointer-checks -D_FORTIFY_SOURCE=2)
  set(COD2_HARDEN_CFLAGS -fstack-protector-strong -fstack-clash-protection)
  set(COD2_HARDEN_LDFLAGS -Wl,-z,relro -Wl,-z,now -Wl,-z,noexecstack)
endif()

separate_arguments(COD2_FEATURE_LIST UNIX_COMMAND "${COD2_FEATURE_CFLAGS}")

add_compile_options(
  "$<$<COMPILE_LANGUAGE:C>:${COD2_ARCH_CFLAGS};-fno-pie;-no-pie;-w;-g;-msse;-fno-omit-frame-pointer>"
  "$<$<COMPILE_LANGUAGE:C>:-DSDL_DISABLE_IMMINTRIN_H>"
  "$<$<COMPILE_LANGUAGE:C>:${SDL2_CFLAGS_OTHER}>"
  "$<$<COMPILE_LANGUAGE:C>:${COD2_OPT_FLAGS}>"
  "$<$<COMPILE_LANGUAGE:C>:${COD2_WNO}>"
  "$<$<COMPILE_LANGUAGE:C>:${COD2_HARDEN_CFLAGS}>"
  "$<$<COMPILE_LANGUAGE:C>:${COD2_FEATURE_LIST}>"
)
include_directories(${COD2_SRC_DIR}/PC/speex ${COD2_SRC_DIR} ${COD2_SRC_DIR}/headers ${CMAKE_SOURCE_DIR} ${SDL2_INCLUDE_DIRS})

add_link_options(${COD2_ARCH_LDFLAGS} -no-pie ${COD2_ARCH_LIBDIRS} -rdynamic ${COD2_HARDEN_LDFLAGS})

set(COD2_LINK_EXTRA
  -Wl,--wrap,R_Error
  -Wl,--defsym,__mh_execute_header=0x1000
  -Wl,--defsym,level_ptr=level
  -Wl,--defsym,g_entities_ptr=g_entities
  -Wl,--defsym,scr_const_ptr=scr_const
  -Wl,--defsym,playerCorpseInfo_ptr=g_scr_data
  -Wl,--defsym,g_renderer_ptr=re
  -Wl,--defsym,scrAnimPub_ptr=scrAnimPub
  -Wl,--defsym,scrCompPub_ptr=scrCompilePub
  -Wl,--defsym,scrParserPub_ptr=scrParserPub
  -Wl,--defsym,r_frontEndData_ptr=rg
  -Wl,--defsym,r_sys_ptr=ri
  -Wl,--defsym,r_limits_ptr=vidConfig
  -Wl,--defsym,sv_ptr=sv
  -Wl,--defsym,svs_ptr=svs
  -Wl,--defsym,cg_globUI=legacyHacks
  -Wl,--defsym,g_time=imp_level_bgs
  -Wl,--defsym,g_time_ptr=imp_bgs)

set(COD2_LIBS GL X11 m pthread dl z ${COD2_LIBSTDCPP} ${SDL2_LIBRARIES})
if(COD2_WWWDL_LIBS)
  separate_arguments(COD2_WWWDL_LIST UNIX_COMMAND "${COD2_WWWDL_LIBS}")
  list(APPEND COD2_LIBS ${COD2_WWWDL_LIST})
endif()

file(GLOB_RECURSE COD2_PC_C    CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/PC/*.c")
file(GLOB_RECURSE COD2_MAC_C   CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/Mac/*.c")
file(GLOB_RECURSE COD2_STUBS_C CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/stubs/*.c")
file(GLOB         COD2_ROOT_C  CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/*.c")
set(ALL_C ${COD2_PC_C} ${COD2_MAC_C} ${COD2_STUBS_C} ${COD2_ROOT_C})
file(GLOB_RECURSE COD2_PC_ASM    CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/PC/*.S")
file(GLOB_RECURSE COD2_STUBS_ASM CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/stubs/*.S")
file(GLOB         COD2_ROOT_ASM  CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/*.S")
set(ALL_ASM ${COD2_PC_ASM} ${COD2_STUBS_ASM} ${COD2_ROOT_ASM})

list(FILTER ALL_C EXCLUDE REGEX "(^|/)(inflate|infblock|infcodes|inffast|inftrees|infutil|adler32|zutil)\\.c$")
list(FILTER ALL_C EXCLUDE REGEX "^src/(data|import_pointers|literals)\\.c$")
list(FILTER ALL_ASM EXCLUDE REGEX "^src/(data|import_pointers|literals|vtables)\\.S$|^src/stubs/cpp_trampoline\\.S$")

list(APPEND ALL_C
  src/blobs/bss.c src/unix/linux_common.c src/unix/linux_input.c src/unix/linux_net.c src/unix/sysdiff_statehash.c)

set(GEN_DIR ${CMAKE_SOURCE_DIR}/build/native_gen)
if(NOT EXISTS ${GEN_DIR}/import_pointers_native.c)
  message(FATAL_ERROR "missing ${GEN_DIR}/import_pointers_native.c (a prebuilt DATA_PORTABLE artifact)")
endif()
set(GEN_C ${GEN_DIR}/data32.c ${GEN_DIR}/literals32.c ${GEN_DIR}/import_pointers_native.c)

set_source_files_properties(src/PC/qcommon/crash_handler.c PROPERTIES
  COMPILE_DEFINITIONS "COD2_GIT_HASH=\"${COD2_GIT_HASH}\"")

set(COD2_DED_GUARDED src/Mac/Main/mac_main.c src/PC/qcommon/common.c)
list(REMOVE_ITEM ALL_C ${COD2_DED_GUARDED})

add_library(cod2_objs OBJECT ${ALL_C} ${ALL_ASM} ${GEN_C})

add_executable(cod2_linux $<TARGET_OBJECTS:cod2_objs> ${COD2_DED_GUARDED})
target_link_libraries(cod2_linux PRIVATE ${COD2_LIBS})
target_link_options(cod2_linux PRIVATE ${COD2_LINK_EXTRA})

add_executable(cod2_lnxded $<TARGET_OBJECTS:cod2_objs> ${COD2_DED_GUARDED})
target_compile_definitions(cod2_lnxded PRIVATE DEDICATED)
target_link_libraries(cod2_lnxded PRIVATE ${COD2_LIBS})
target_link_options(cod2_lnxded PRIVATE ${COD2_LINK_EXTRA})

set_target_properties(cod2_linux cod2_lnxded PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

endif()
