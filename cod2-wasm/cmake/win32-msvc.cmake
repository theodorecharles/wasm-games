# =============================================================================
# WINDOWS / MSVC (cl.exe) build  -- full SDL2/GL/D3D client (cod2_win32.exe)
#
# Additive and self-contained: entered only from the WIN32 branch of the root
# CMakeLists when CMAKE_C_COMPILER is MSVC. The MinGW cross build is untouched.
#
# Status: STAGED PORT IN PROGRESS. This stage gets cl to *compile* the source
# set (an OBJECT library) so the real frontend-error surface is visible; it does
# not link yet -- the data blobs (Stage 2), __asm__ removal (Stage 3) and the
# C++ class reconstruction (Stage 5) are prerequisites for a final link.
#
#   Configure/build from a "x86 Native Tools for VS" command prompt:
#     cmake --preset msvc-client
#     cmake --build --preset msvc-client
# =============================================================================

# Pointer width must match the selected arch. The default (32-bit) reconstruction
# is ILP32; COD2_X64 is the in-progress LP64 port (see root CMakeLists / Stage 2).
if(COD2_X64)
  if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR
      "COD2_X64=ON needs the x64 cl (8-byte pointers). Use `vcvarsall.bat x64` "
      "(Hostx64/x64). Got ${CMAKE_SIZEOF_VOID_P}-byte pointers.")
  endif()
  message(WARNING
    "COD2_X64 MSVC build is IN PROGRESS: it compiles the source set to measure "
    "the x64 error surface but does NOT link/run yet (the ILP32 data blobs are "
    "not x64-portable -- Stage 2). Building cod2_msvc_objs only.")
elseif(NOT CMAKE_SIZEOF_VOID_P EQUAL 4)
  message(FATAL_ERROR
    "MSVC build must be 32-bit: the reconstructed data layout is ILP32 "
    "(4-byte pointers, hardcoded sizes). Use the x86 cl (Hostx64/x86 or "
    "Hostx86/x86), e.g. `vcvarsall.bat x86`. Got ${CMAKE_SIZEOF_VOID_P}-byte pointers. "
    "(For the x64 port pass -DCOD2_X64=ON.)")
endif()

enable_language(CXX)   # full client pulls in the C++ renderer/UI surface

# Strip CMake's Debug /RTC1 runtime checks: decompiler-output C reads stack
# variables the original initialized via control flow the decompiler didn't
# perfectly preserve, so RTCu/RTCs abort with a CRT dialog on otherwise-fine
# code. (Keep /Z7 debug info and the debug CRT for symbolized crash traces.)
foreach(cfg "" _DEBUG _RELWITHDEBINFO)
  string(REGEX REPLACE "/RTC[1csu]+" "" CMAKE_C_FLAGS${cfg}   "${CMAKE_C_FLAGS${cfg}}")
  string(REGEX REPLACE "/RTC[1csu]+" "" CMAKE_CXX_FLAGS${cfg} "${CMAKE_CXX_FLAGS${cfg}}")
endforeach()

# -DCOD2_SDL2_STATIC=ON -> a fully self-contained exe: SDL2 linked statically (no
# SDL2.dll) AND the CRT linked statically (no VCRUNTIME140*/ucrtbase* DLLs).
# Default OFF = dynamic SDL2 + dynamic CRT. The SDL2-static.lib you supply must
# be built with the MATCHING static CRT (SDL2's -DSDL_FORCE_STATIC_VCRT=ON), else
# the link warns LNK4098. Must select the runtime before any target is created.
option(COD2_SDL2_STATIC "Fully static, standalone exe: static SDL2 + static CRT (needs a self-built static SDL2-static.lib)" OFF)
if(COD2_SDL2_STATIC)
  # CMP0091 NEW (CMake >= 3.15): pick the static runtime via the abstraction.
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  # Fallback when CMP0091 is OLD: the CRT flag is baked into CMAKE_*_FLAGS_*.
  foreach(cfg "" _DEBUG _RELWITHDEBINFO _RELEASE)
    string(REGEX REPLACE "/MD" "/MT" CMAKE_C_FLAGS${cfg}   "${CMAKE_C_FLAGS${cfg}}")
    string(REGEX REPLACE "/MD" "/MT" CMAKE_CXX_FLAGS${cfg} "${CMAKE_CXX_FLAGS${cfg}}")
  endforeach()
  message(STATUS "MSVC client: static CRT (/MTd) -- standalone exe")
endif()

# --- include search path -----------------------------------------------------
# SDL2 (user-supplied) lives in third_party/SDL2-* (preferred) or the legacy
# src/win32/sdl2; collect its include + arch lib dirs for use below.
if(COD2_X64)
  set(COD2_SDL2_ARCH x64)
else()
  set(COD2_SDL2_ARCH x86)
endif()
file(GLOB COD2_SDL2_INC_DIRS ${CMAKE_SOURCE_DIR}/third_party/SDL2-*/include)
file(GLOB COD2_SDL2_LIB_DIRS ${CMAKE_SOURCE_DIR}/third_party/SDL2-*/lib/${COD2_SDL2_ARCH})
list(APPEND COD2_SDL2_INC_DIRS ${COD2_SRC_DIR}/win32/sdl2/include)
list(APPEND COD2_SDL2_LIB_DIRS ${COD2_SRC_DIR}/win32/sdl2/lib)

# shims-msvc FIRST so the MSVC POSIX shims win over anything else; the shared
# win32/shims provides the socket/net headers used by both win toolchains.
include_directories(
  ${COD2_SRC_DIR}/win32/shims-msvc
  ${COD2_SRC_DIR}/PC/speex ${COD2_SRC_DIR} ${COD2_SRC_DIR}/headers
  ${COD2_SRC_DIR}/win32/shims ${COD2_SDL2_INC_DIRS} ${CMAKE_SOURCE_DIR})

# --- compile options ---------------------------------------------------------
# /FI win32_compat.h mirrors gcc's -include. /w matches the engine's -w (the
# reconstructed C is intentionally warning-noisy). Permissive mode + the C
# legacy-lenience flags keep cl's frontend from rejecting decompiler-output C.
# /FI order matters: the GCC-compat shim must be seen before anything else so
# its keyword/__attribute__ macros are in scope while the engine headers parse.
add_compile_options(
  "/FI${COD2_SRC_DIR}/win32/shims-msvc/msvc_gcc_compat.h"
  "$<$<COMPILE_LANGUAGE:C>:/FI${COD2_SRC_DIR}/headers/win32_compat.h>"
  # /GS- : the stack-cookie/buffer-security check trips on decompiler-output
  # stack layouts (binary-faithful local buffers) -> spurious CRT runtime abort.
  /w /MP /permissive- /Zc:preprocessor /utf-8 /bigobj /Oy- /Z7 /GS-)
add_compile_definitions(
  WIN32 _WIN32 _GNU_SOURCE=1 W32_CLIENT
  _CRT_SECURE_NO_WARNINGS _CRT_NONSTDC_NO_WARNINGS
  _WINSOCK_DEPRECATED_NO_WARNINGS WIN32_LEAN_AND_MEAN
  NOMINMAX SDL_DISABLE_IMMINTRIN_H)
# C as C11, C++ as C++14 (matches the era of the reconstructed C++ surface).
add_compile_options("$<$<COMPILE_LANGUAGE:C>:/std:c11>"
                    "$<$<COMPILE_LANGUAGE:CXX>:/std:c++14>")

# --- source set (mirrors the MinGW WIN_C gathering) --------------------------
file(GLOB_RECURSE M_PC_C    CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/PC/*.c")
file(GLOB_RECURSE M_MAC_C   CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/Mac/*.c")
file(GLOB_RECURSE M_STUBS_C CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/stubs/*.c")
file(GLOB_RECURSE M_WIN_C   CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/win32/*.c")
file(GLOB         M_ROOT_C  CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR} "${COD2_SRC_DIR}/*.c")
set(MSVC_C ${M_PC_C} ${M_MAC_C} ${M_STUBS_C} ${M_WIN_C} ${M_ROOT_C})

# native-asm data .c and cpp_trampoline/agl_stubs excluded as on MinGW. The
# bundled zlib IS kept (MinGW used -lz; MSVC has no system zlib, so compile it).
list(FILTER MSVC_C EXCLUDE REGEX "^src/(data|import_pointers|literals)\\.c$")
# zlib_alloc.c (zcalloc/zcfree -> Z_MallocInternal) duplicates the stock zlib
# zutil.c, which already defines them; excluded so the link needs no
# /FORCE:MULTIPLE. (zutil.c == current behavior; routing zlib through the engine
# hunk would be a deliberate behavior change, not done here.)
list(FILTER MSVC_C EXCLUDE REGEX "^src/stubs/(cpp_trampoline|agl_stubs|zlib_alloc)\\.c$")
list(APPEND MSVC_C src/blobs/bss.c src/unix/sysdiff_statehash.c src/unix/linux_input.c)

# SDL2 (user-supplied; see README). Default links the dynamic SDL2 import lib
# (SDL2.lib + SDL2.dll beside the exe). With COD2_SDL2_STATIC=ON (declared above,
# where it also selects the static CRT) the static SDL2-static.lib is linked
# instead. Either way the name-only sdl2_stub.c is dropped so it doesn't
# duplicate the real library.
# Distinct cache vars per lib so toggling COD2_SDL2_STATIC re-resolves the right
# one (a shared find_library var would stick to whichever was found first).
if(COD2_SDL2_STATIC)
  find_library(COD2_SDL2_STATIC_LIB NAMES SDL2-static PATHS ${COD2_SDL2_LIB_DIRS} NO_DEFAULT_PATH)
  if(NOT COD2_SDL2_STATIC_LIB)
    message(FATAL_ERROR "COD2_SDL2_STATIC=ON but no SDL2-static.lib found under: ${COD2_SDL2_LIB_DIRS}. "
                        "Build SDL2 as a static lib (see README) or configure with -DCOD2_SDL2_STATIC=OFF.")
  endif()
  set(COD2_SDL2_LIB ${COD2_SDL2_STATIC_LIB})
  set(COD2_SDL2_STATIC_DEPS uuid dinput8)  # static-only deps from sdl2.pc Libs.private
  list(FILTER MSVC_C EXCLUDE REGEX "shims-msvc/sdl2_stub\\.c$")
  message(STATUS "MSVC client: STATIC SDL2 (${COD2_SDL2_LIB}) -- no SDL2.dll needed")
else()
  find_library(COD2_SDL2_IMPORT_LIB NAMES SDL2 PATHS ${COD2_SDL2_LIB_DIRS} NO_DEFAULT_PATH)
  if(COD2_SDL2_IMPORT_LIB)
    set(COD2_SDL2_LIB ${COD2_SDL2_IMPORT_LIB})
    list(FILTER MSVC_C EXCLUDE REGEX "shims-msvc/sdl2_stub\\.c$")
    message(STATUS "MSVC client: dynamic SDL2 (${COD2_SDL2_LIB}) -- copy SDL2.dll beside the exe")
  endif()
endif()

# The engine object set (all ~410 TUs compile clean under cl on x86).
add_library(cod2_msvc_objs OBJECT ${MSVC_C})
set_target_properties(cod2_msvc_objs PROPERTIES LINKER_LANGUAGE CXX)

# x64 port: Stage 2 migrated all pointer-bearing data out of the blob into typed
# C, so data32.c is now a pure-scalar/single-pointer image that lays out
# correctly on LP64. We now attempt the full link (Stage 4) to surface the x64
# link surface (notably: x64 has NO leading-underscore symbol decoration, so the
# /alternatename seams need regenerating). Still iterating; `cmake --build ...`.
if(COD2_X64)
  message(STATUS "MSVC client (x64 port): Stage 4 link attempt -- iterating.")
endif()

# --- data blobs (Stage 6) ----------------------------------------------------
# The reconstructed .data/.rodata, as portable C (the native_gen variants, which
# cl accepts: &sym and &sym+offset address-constants are fine). Built with /Zp1
# so the packed _d32_ layout structs keep their exact byte layout (no padding).
set(MSVC_BLOBS
  ${CMAKE_SOURCE_DIR}/build/native_gen/data32.c
  ${CMAKE_SOURCE_DIR}/build/native_gen/literals32.c
  ${CMAKE_SOURCE_DIR}/build/native_gen/import_pointers_native.c)
add_library(cod2_msvc_blobs OBJECT ${MSVC_BLOBS})
target_compile_options(cod2_msvc_blobs PRIVATE /Zp1)

# --- executable (Stage 6, first link) ----------------------------------------
# Engine-global seam aliases (the GNU build's --defsym engine seams) now live in
# source as #pragma comment(linker, "/alternatename:..") in
# src/win32/shims-msvc/msvc_seam_aliases.h, alongside the blob alias pragmas --
# so every /alternatename binding is in one place, not split with the build.
# /FORCE:MULTIPLE stands in for GNU --allow-multiple-definition (the blob and
# bss/home-.c overlap on some tentative defs). This is a FIRST link to surface
# the unresolved-symbol set; libs/wrap/boot are iterated from there.
add_executable(cod2_win32
  $<TARGET_OBJECTS:cod2_msvc_objs> $<TARGET_OBJECTS:cod2_msvc_blobs>)
# WinMain (mac_main.c) is the entry -> Windows subsystem. The link is now
# duplicate-free (no /FORCE:MULTIPLE) -- the redundant stub defs that needed it
# were removed (win32_stubs.c destructors/Mac stubs, macos_compat.c Interlocked,
# the zlib_alloc.c zcalloc/zcfree dupe of zutil.c). /INCREMENTAL:NO keeps the
# exe lean+deterministic (dropping /FORCE re-enables the Debug incremental link).
# SDL2 is a user-supplied external (README); COD2_SDL2_LIB (found above) links a
# real MSVC SDL2.lib when present, else sdl2_stub.c lets the exe link.
# /SAFESEH is an x86-only concept (x64 has no SAFESEH); only pass it on x86.
target_link_options(cod2_win32 PRIVATE
  $<$<NOT:$<BOOL:${COD2_X64}>>:/SAFESEH:NO>
  /SUBSYSTEM:WINDOWS /MAP /INCREMENTAL:NO)
target_link_libraries(cod2_win32 PRIVATE
  $<$<BOOL:${COD2_SDL2_LIB}>:${COD2_SDL2_LIB}>
  ${COD2_SDL2_STATIC_DEPS}
  opengl32
  ws2_32 winmm dbghelp user32 gdi32 advapi32 shell32 ole32 oleaut32
  imm32 version setupapi)
set_target_properties(cod2_win32 PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

message(STATUS "MSVC client: ${CMAKE_C_COMPILER_ID} ${CMAKE_C_COMPILER_VERSION}, "
               "${CMAKE_SIZEOF_VOID_P}*8-bit; Stage 6 first-link target cod2_win32.")
