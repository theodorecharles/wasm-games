# Overlay CMake for the portable LithTech subset on Linux.
#
# Vendor root CMake (cmake_minimum_required 2.8) is rejected by CMake 4,
# and libs/ltmem/CMakeLists.txt lists StdAfx.cpp (Windows case) instead of
# stdafx.cpp. Prefer this overlay over rewriting the Windows-oriented tree.
#
# Configure:
#   cmake -S port -B build-lith -DCMAKE_BUILD_TYPE=Release
# Build:
#   cmake --build build-lith -j$(nproc)
#
# Tiny vendor patches (Linux only):
#   libs/MFCStub/mfcs_{string,point,rect}.h  - Windows "..\mfcstub\*.h" includes
#   libs/MFCStub/mfcs_string.cpp             - va_copy (va_list is an array)
#   libs/ButeMgr/butemgr.cpp                 - named ofstream (no MSVC temp-ref)

cmake_minimum_required(VERSION 3.16)
project(lithtech_portable C CXX)

set(LT "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/lithtech")

if(NOT EXISTS "${LT}/libs/zlib/zlib.h")
  message(FATAL_ERROR "vendor/lithtech not found at ${LT}")
endif()

set(CMAKE_C_STANDARD 90)
set(CMAKE_C_STANDARD_REQUIRED OFF)
set(CMAKE_C_EXTENSIONS ON)

# Era-correct dialect for this tree. zfstream is gcc 3.x iostreams, not C++11.
set(CMAKE_CXX_STANDARD 98)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS ON)

add_compile_definitions(
  _LINUX
  __LINUX
  _FINAL
  _NOMFC
)

# Shared warning/compat flags. -fpermissive is required for old C++.
set(LT_C_FLAGS
  -fno-strict-aliasing
  -Wno-unknown-pragmas
)
set(LT_CXX_FLAGS
  -std=gnu++98
  -fpermissive
  -fno-strict-aliasing
  -Wno-unknown-pragmas
  -Wno-deprecated
  -Wno-write-strings
)

# ---------------------------------------------------------------------------
# Lib_ZLib
# ---------------------------------------------------------------------------
add_library(Lib_ZLib STATIC
  ${LT}/libs/zlib/adler32.c
  ${LT}/libs/zlib/compress.c
  ${LT}/libs/zlib/crc32.c
  ${LT}/libs/zlib/deflate.c
  ${LT}/libs/zlib/gzio.c
  ${LT}/libs/zlib/infback.c
  ${LT}/libs/zlib/inffast.c
  ${LT}/libs/zlib/inflate.c
  ${LT}/libs/zlib/inftrees.c
  ${LT}/libs/zlib/trees.c
  ${LT}/libs/zlib/uncompr.c
  ${LT}/libs/zlib/zutil.c
)
target_include_directories(Lib_ZLib PUBLIC ${LT}/libs/zlib)
target_compile_options(Lib_ZLib PRIVATE ${LT_C_FLAGS})

# ---------------------------------------------------------------------------
# Lib_Lith
# ---------------------------------------------------------------------------
add_library(Lib_Lith STATIC
  ${LT}/libs/lith/basehash.cpp
  ${LT}/libs/lith/baselist.cpp
  ${LT}/libs/lith/baselistcounter.cpp
  ${LT}/libs/lith/dprintf.cpp
  ${LT}/libs/lith/lith.cpp
  ${LT}/libs/lith/lithbaselist.cpp
  ${LT}/libs/lith/lithchunkallocator.cpp
  ${LT}/libs/lith/lithsimpary.cpp
  ${LT}/libs/lith/lithsimparystat.cpp
  ${LT}/libs/lith/virtlist.cpp
)
target_include_directories(Lib_Lith PUBLIC ${LT}/libs/lith)
target_compile_options(Lib_Lith PRIVATE ${LT_CXX_FLAGS})

# ---------------------------------------------------------------------------
# Lib_StdLith
# ---------------------------------------------------------------------------
add_library(Lib_StdLith STATIC
  ${LT}/libs/stdlith/abstractio.cpp
  ${LT}/libs/stdlith/dynarray.cpp
  ${LT}/libs/stdlith/fileio.cpp
  ${LT}/libs/stdlith/goodlinklist.cpp
  ${LT}/libs/stdlith/helpers.cpp
  ${LT}/libs/stdlith/l_allocator.cpp
  ${LT}/libs/stdlith/linklist.cpp
  ${LT}/libs/stdlith/lithexception.cpp
  ${LT}/libs/stdlith/memory.cpp
  ${LT}/libs/stdlith/memoryio.cpp
  ${LT}/libs/stdlith/stringholder.cpp
  ${LT}/libs/stdlith/struct_bank.cpp
  ${LT}/libs/stdlith/zfstream.cpp
)
target_include_directories(Lib_StdLith PUBLIC
  ${LT}/libs/stdlith
  ${LT}/libs/zlib
)
target_link_libraries(Lib_StdLith PUBLIC Lib_ZLib)
target_compile_options(Lib_StdLith PRIVATE ${LT_CXX_FLAGS})

# ---------------------------------------------------------------------------
# ltmem
# ---------------------------------------------------------------------------
add_library(ltmem STATIC
  ${LT}/libs/ltmem/ltmem.cpp
  ${LT}/libs/ltmem/ltmemdebug.cpp
  ${LT}/libs/ltmem/ltmemheap.cpp
  ${LT}/libs/ltmem/ltmemstats.cpp
  ${LT}/libs/ltmem/ltmemtrack.cpp
  ${LT}/libs/ltmem/stdafx.cpp
)
target_include_directories(ltmem PUBLIC
  ${LT}/libs/ltmem
  ${LT}/sdk/inc
  ${LT}/sdk/inc/physics
  ${LT}/runtime/shared/src
  ${LT}/runtime/kernel/src
  ${LT}/runtime/kernel/mem/src
  ${LT}/libs/stdlith
)
target_compile_options(ltmem PRIVATE ${LT_CXX_FLAGS})

# ---------------------------------------------------------------------------
# Lib_RezMgr
# ---------------------------------------------------------------------------
add_library(Lib_RezMgr STATIC
  ${LT}/libs/rezmgr/rezfile.cpp
  ${LT}/libs/rezmgr/rezhash.cpp
  ${LT}/libs/rezmgr/rezmgr.cpp
  ${LT}/libs/rezmgr/rezutils.cpp
)
target_include_directories(Lib_RezMgr PUBLIC
  ${LT}/libs/rezmgr
  ${LT}/sdk/inc
  ${LT}/sdk/inc/physics
  ${LT}/libs/lith
)
target_link_libraries(Lib_RezMgr PUBLIC Lib_Lith)
target_compile_options(Lib_RezMgr PRIVATE ${LT_CXX_FLAGS})

# Linux shims: windows.h, winreg.h, crtdbg.h, classic iostreams, SGI hash_*.
set(LT_SHIMS "${CMAKE_CURRENT_SOURCE_DIR}/shims")

# ---------------------------------------------------------------------------
# MFCStub
# Vendor listed Windows-style includes "..\mfcstub\*.h"; those three headers
# were patched to local "mfcs_*.h" includes. Do not compile mfcstub.cpp —
# it duplicates mfcs_point/rect/string.
# ---------------------------------------------------------------------------
add_library(MFCStub STATIC
  ${LT}/libs/MFCStub/mfcs_point.cpp
  ${LT}/libs/MFCStub/mfcs_rect.cpp
  ${LT}/libs/MFCStub/mfcs_string.cpp
)
target_include_directories(MFCStub PUBLIC
  ${LT_SHIMS}
  ${LT}/libs/MFCStub
  ${LT}/libs/stdlith
)
target_link_libraries(MFCStub PUBLIC Lib_StdLith)
target_compile_options(MFCStub PRIVATE ${LT_CXX_FLAGS} -include ${LT_SHIMS}/crtdbg.h)

# ---------------------------------------------------------------------------
# CryptMgr
# ---------------------------------------------------------------------------
add_library(CryptMgr STATIC
  ${LT}/libs/CryptMgr/blowfish.cpp
  ${LT}/libs/CryptMgr/cryptmgr.cpp
)
target_include_directories(CryptMgr PUBLIC
  ${LT_SHIMS}
  ${LT}/libs/CryptMgr
)
target_compile_options(CryptMgr PRIVATE ${LT_CXX_FLAGS})

# ---------------------------------------------------------------------------
# RegMgr (Win32 registry; shims compile but do not persist keys)
# ---------------------------------------------------------------------------
add_library(RegMgr STATIC
  ${LT}/libs/RegMgr/regmgr.cpp
)
target_include_directories(RegMgr PUBLIC
  ${LT_SHIMS}
  ${LT}/libs/RegMgr
  ${LT}/libs/lith
)
target_link_libraries(RegMgr PUBLIC Lib_Lith)
target_compile_options(RegMgr PRIVATE ${LT_CXX_FLAGS})

# ---------------------------------------------------------------------------
# ButeMgr
# ---------------------------------------------------------------------------
add_library(ButeMgr STATIC
  ${LT}/libs/ButeMgr/arange.cpp
  ${LT}/libs/ButeMgr/avector.cpp
  ${LT}/libs/ButeMgr/butemgr.cpp
  ${LT}/libs/ButeMgr/stdafx.cpp
)
target_include_directories(ButeMgr PUBLIC
  ${LT_SHIMS}
  ${LT}/libs/ButeMgr
  ${LT}/libs/CryptMgr
  ${LT}/libs/stdlith
  ${LT}/libs/lith
  ${LT}/libs/MFCStub
)
target_link_libraries(ButeMgr PUBLIC CryptMgr Lib_StdLith Lib_Lith MFCStub)
target_compile_options(ButeMgr PRIVATE ${LT_CXX_FLAGS})

# ---------------------------------------------------------------------------
# nolf2_boot — official CRezMgr + retail splash.pcx via SDL
# ---------------------------------------------------------------------------
set(SDL2_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../third_party/sdl2")
add_executable(nolf2_boot boot/nolf2_boot.cpp)
target_include_directories(nolf2_boot PRIVATE
  ${LT_SHIMS}
  ${CMAKE_CURRENT_SOURCE_DIR}/compat
  ${LT}/sdk/inc
  ${LT}/libs/rezmgr
  ${LT}/libs/lith
  ${LT}/libs/stdlith
  ${SDL2_ROOT}/include
  ${SDL2_ROOT}/include/SDL2
  /usr/include/freetype2
)
target_link_libraries(nolf2_boot PRIVATE
  Lib_RezMgr Lib_Lith Lib_StdLith ltmem Lib_ZLib
  ${SDL2_ROOT}/lib/libSDL2.so
  freetype
  pthread dl m
)
target_compile_options(nolf2_boot PRIVATE ${LT_CXX_FLAGS} -std=gnu++14)
target_link_options(nolf2_boot PRIVATE -pthread "-Wl,-rpath,${SDL2_ROOT}/lib")
set_target_properties(nolf2_boot PROPERTIES
  CXX_STANDARD 14
  CXX_STANDARD_REQUIRED OFF
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../build-port"
)

# ---------------------------------------------------------------------------
# nolf2_object — NOLF2 ObjectDLL (ObjectShared + TO2 + Shared) as a static lib
# Vendor file list: vendor/lithtech/NOLF2/ObjectDLL/TO2/CMakeLists.txt
# ---------------------------------------------------------------------------
set(NOLF2_TO2_DIR "${LT}/NOLF2/ObjectDLL/TO2")
set(NOLF2_OBJ_SHARED "${LT}/NOLF2/ObjectDLL/ObjectShared")
set(NOLF2_SHARED "${LT}/NOLF2/Shared")
set(NOLF2_CI_DIR "${CMAKE_CURRENT_BINARY_DIR}/include-ci")

file(MAKE_DIRECTORY "${NOLF2_CI_DIR}")
execute_process(
  COMMAND python3 "${CMAKE_CURRENT_SOURCE_DIR}/gen_include_ci.py"
    "${NOLF2_CI_DIR}"
    "${CMAKE_CURRENT_SOURCE_DIR}/shims"
    "${CMAKE_CURRENT_SOURCE_DIR}/compat"
    "${CMAKE_CURRENT_SOURCE_DIR}/shims"
    "${NOLF2_OBJ_SHARED}"
    "${NOLF2_TO2_DIR}"
    "${NOLF2_SHARED}"
    "${NOLF2_SHARED}/TO2"
    "${LT}/sdk/inc"
    "${LT}/libs/MFCStub"
    "${LT}/libs/stdlith"
    "${LT}/libs/ButeMgr"
    "${LT}/libs/CryptMgr"
    "${LT}/libs/lith"
    "${LT}/libs/RegMgr"
    "${LT}/libs/ServerDir"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  RESULT_VARIABLE NOLF2_CI_RC
)
if(NOT NOLF2_CI_RC EQUAL 0)
  message(FATAL_ERROR "gen_include_ci.py failed (${NOLF2_CI_RC})")
endif()

set(NOLF2_OBJECT_SOURCES)
set(_nolf2_in_lib FALSE)
file(STRINGS "${NOLF2_TO2_DIR}/CMakeLists.txt" _nolf2_obj_lines)
foreach(_line IN LISTS _nolf2_obj_lines)
  if(_line MATCHES "add_library")
    set(_nolf2_in_lib TRUE)
    continue()
  endif()
  if(_nolf2_in_lib AND _line MATCHES "^[)]")
    set(_nolf2_in_lib FALSE)
    continue()
  endif()
  if(NOT _nolf2_in_lib)
    continue()
  endif()
  if(NOT _line MATCHES "\\.cpp")
    continue()
  endif()
  string(STRIP "${_line}" _rel)
  string(REGEX REPLACE "[)]+$" "" _rel "${_rel}")
  get_filename_component(_name "${_rel}" NAME)
  if(_name STREQUAL "WinUtil.cpp")
    list(APPEND NOLF2_OBJECT_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/winutil_linux.cpp")
  elseif(_name STREQUAL "stacktrace.cpp")
    continue()
  elseif(_name STREQUAL "ltmodule.cpp")
    continue()
  else()
    get_filename_component(_abs "${NOLF2_TO2_DIR}/${_rel}" ABSOLUTE)
    list(APPEND NOLF2_OBJECT_SOURCES "${_abs}")
  endif()
endforeach()
list(APPEND NOLF2_OBJECT_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/iserverdir_titan_stub.cpp")

add_library(nolf2_object STATIC ${NOLF2_OBJECT_SOURCES})
set_target_properties(nolf2_object PROPERTIES OUTPUT_NAME nolf2_object)
target_include_directories(nolf2_object PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/compat
  ${CMAKE_CURRENT_SOURCE_DIR}/shims
  ${NOLF2_CI_DIR}
  ${NOLF2_OBJ_SHARED}
  ${NOLF2_TO2_DIR}
  ${LT}/sdk/inc
  ${LT}/sdk/inc/physics
  ${LT}/libs/MFCStub
  ${LT}/libs/stdlith
  ${LT}/libs/ButeMgr
  ${LT}/libs/CryptMgr
  ${LT}/libs/lith
  ${LT}/libs/RegMgr
  ${LT}/libs/ServerDir
  ${NOLF2_SHARED}
  ${NOLF2_SHARED}/TO2
)
target_compile_definitions(nolf2_object PRIVATE
  _SERVERBUILD
  NOPS2
  _NO_AI_ASSERT
  _NOMFC
  __LINUX
  _LINUX
  _FINAL
)
target_compile_options(nolf2_object PRIVATE
  ${LT_CXX_FLAGS}
  -std=gnu++11
  -Wno-unused-variable
  -Wno-unused-function
  -Wno-unused-but-set-variable
  -Wno-unused-but-set-parameter
  -Wno-sign-compare
  -Wno-parentheses
  -Wno-switch
  -Wno-format
  -Wno-extra
  -Wno-deprecated-declarations
)
set_target_properties(nolf2_object PROPERTIES
  CXX_STANDARD 11
  CXX_STANDARD_REQUIRED OFF
)
target_link_libraries(nolf2_object PUBLIC
  ltmem
  ButeMgr
  CryptMgr
  Lib_Lith
  MFCStub
  RegMgr
  Lib_StdLith
)

# ---------------------------------------------------------------------------
# nolf2_engine — Jupiter Linux client host + SDL/OpenGL renderer
# ---------------------------------------------------------------------------
add_subdirectory(engine)

# ---------------------------------------------------------------------------
# nolf2_cshell — NOLF2 ClientShell (ClientShellShared + TO2 + Shared) static lib
# Vendor file list: vendor/lithtech/NOLF2/ClientShellDLL/TO2/CMakeLists.txt
# Do not define _SERVERBUILD. Exclude WinUtil.cpp / stacktrace.cpp / ltmodule.cpp.
# ---------------------------------------------------------------------------
set(NOLF2_CSHELL_TO2 "${LT}/NOLF2/ClientShellDLL/TO2")
set(NOLF2_CSHELL_SHARED "${LT}/NOLF2/ClientShellDLL/ClientShellShared")
set(NOLF2_CSHELL_SHIMS "${CMAKE_CURRENT_SOURCE_DIR}/shims_cshell")
set(NOLF2_CSHELL_CI_DIR "${CMAKE_CURRENT_BINARY_DIR}/include-ci-cshell")

file(MAKE_DIRECTORY "${NOLF2_CSHELL_CI_DIR}")
execute_process(
  COMMAND python3 "${CMAKE_CURRENT_SOURCE_DIR}/gen_include_ci.py"
    "${NOLF2_CSHELL_CI_DIR}"
    "${NOLF2_CSHELL_SHIMS}"
    "${CMAKE_CURRENT_SOURCE_DIR}/shims"
    "${CMAKE_CURRENT_SOURCE_DIR}/compat"
    "${NOLF2_CSHELL_SHIMS}"
    "${NOLF2_CSHELL_SHARED}"
    "${NOLF2_CSHELL_TO2}"
    "${NOLF2_SHARED}"
    "${NOLF2_SHARED}/TO2"
    "${LT}/sdk/inc"
    "${LT}/libs/MFCStub"
    "${LT}/libs/stdlith"
    "${LT}/libs/ButeMgr"
    "${LT}/libs/CryptMgr"
    "${LT}/libs/lith"
    "${LT}/libs/RegMgr"
    "${LT}/libs/LTGUIMgr"
    "${LT}/libs/ServerDir"
    "${LT}/NOLF2/ClientRes/Shared"
    "${LT}/NOLF2/ClientRes/TO2"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  RESULT_VARIABLE NOLF2_CSHELL_CI_RC
)
if(NOT NOLF2_CSHELL_CI_RC EQUAL 0)
  message(FATAL_ERROR "gen_include_ci.py (cshell) failed (${NOLF2_CSHELL_CI_RC})")
endif()

# ---------------------------------------------------------------------------
# LTGUIMgr
# ---------------------------------------------------------------------------
add_library(LTGUIMgr STATIC
  ${LT}/libs/LTGUIMgr/ltguibutton.cpp
  ${LT}/libs/LTGUIMgr/ltguicolumnctrl.cpp
  ${LT}/libs/LTGUIMgr/ltguicommandhandler.cpp
  ${LT}/libs/LTGUIMgr/ltguictrl.cpp
  ${LT}/libs/LTGUIMgr/ltguicyclectrl.cpp
  ${LT}/libs/LTGUIMgr/ltguieditctrl.cpp
  ${LT}/libs/LTGUIMgr/ltguiframe.cpp
  ${LT}/libs/LTGUIMgr/ltguilargetext.cpp
  ${LT}/libs/LTGUIMgr/ltguilistctrl.cpp
  ${LT}/libs/LTGUIMgr/ltguislider.cpp
  ${LT}/libs/LTGUIMgr/ltguitextitemctrl.cpp
  ${LT}/libs/LTGUIMgr/ltguitoggle.cpp
  ${LT}/libs/LTGUIMgr/ltguiwindow.cpp
)
target_include_directories(LTGUIMgr PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/compat
  ${CMAKE_CURRENT_SOURCE_DIR}/shims
  ${NOLF2_CSHELL_CI_DIR}
  ${LT}/libs/LTGUIMgr
  ${LT}/sdk/inc
  ${LT}/sdk/inc/physics
  ${NOLF2_SHARED}
  ${LT}/libs/stdlith
  ${LT}/libs/ltmem
)
target_compile_definitions(LTGUIMgr PRIVATE
  _LITHTECH2
  LT15_COMPAT
  NOPS2
  _NOMFC
  __LINUX
  _LINUX
  _FINAL
  SCREEN_NEAR_Z=0.0
)
target_compile_options(LTGUIMgr PRIVATE
  ${LT_CXX_FLAGS}
  -include ${CMAKE_CURRENT_SOURCE_DIR}/shims/ltguimgr.h
  -Wno-unused-variable
  -Wno-unused-function
  -Wno-unused-but-set-variable
  -Wno-unused-but-set-parameter
  -Wno-sign-compare
  -Wno-parentheses
  -Wno-switch
  -Wno-format
  -Wno-extra
)
target_link_libraries(LTGUIMgr PUBLIC ltmem)

set(NOLF2_CSHELL_SOURCES)
set(_nolf2_cs_in_lib FALSE)
file(STRINGS "${NOLF2_CSHELL_TO2}/CMakeLists.txt" _nolf2_cs_lines)
foreach(_line IN LISTS _nolf2_cs_lines)
  if(_line MATCHES "add_library")
    set(_nolf2_cs_in_lib TRUE)
    continue()
  endif()
  if(_nolf2_cs_in_lib AND _line MATCHES "^[)]")
    set(_nolf2_cs_in_lib FALSE)
    continue()
  endif()
  if(NOT _nolf2_cs_in_lib)
    continue()
  endif()
  if(NOT _line MATCHES "\\.cpp")
    continue()
  endif()
  string(STRIP "${_line}" _rel)
  string(REGEX REPLACE "[)]+$" "" _rel "${_rel}")
  get_filename_component(_name "${_rel}" NAME)
  if(_name STREQUAL "WinUtil.cpp")
    list(APPEND NOLF2_CSHELL_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/winutil_linux.cpp")
  elseif(_name STREQUAL "stacktrace.cpp")
    continue()
  elseif(_name STREQUAL "ltmodule.cpp")
    continue()
  else()
    get_filename_component(_abs "${NOLF2_CSHELL_TO2}/${_rel}" ABSOLUTE)
    list(APPEND NOLF2_CSHELL_SOURCES "${_abs}")
  endif()
endforeach()
list(APPEND NOLF2_CSHELL_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/iserverdir_titan_stub.cpp")

add_library(nolf2_cshell STATIC ${NOLF2_CSHELL_SOURCES})
set_target_properties(nolf2_cshell PROPERTIES OUTPUT_NAME nolf2_cshell)
target_include_directories(nolf2_cshell PRIVATE
  ${NOLF2_CSHELL_SHIMS}
  ${CMAKE_CURRENT_SOURCE_DIR}/compat
  ${CMAKE_CURRENT_SOURCE_DIR}/shims
  ${NOLF2_CSHELL_CI_DIR}
  ${NOLF2_CSHELL_SHARED}
  ${NOLF2_CSHELL_TO2}
  ${LT}/sdk/inc
  ${LT}/sdk/inc/physics
  ${LT}/libs/MFCStub
  ${LT}/libs/stdlith
  ${LT}/libs/ButeMgr
  ${LT}/libs/CryptMgr
  ${LT}/libs/lith
  ${LT}/libs/RegMgr
  ${LT}/libs/LTGUIMgr
  ${LT}/libs/ServerDir
  ${LT}/NOLF2/ClientRes/Shared
  ${LT}/NOLF2/ClientRes/TO2
  ${NOLF2_SHARED}
  ${NOLF2_SHARED}/TO2
)
target_compile_definitions(nolf2_cshell PRIVATE
  _CLIENTBUILD
  NOPS2
  _NOMFC
  __LINUX
  _LINUX
  _FINAL
  SCREEN_NEAR_Z=0.0
)
target_compile_options(nolf2_cshell PRIVATE
  ${LT_CXX_FLAGS}
  -std=gnu++11
  -Wno-unused-variable
  -Wno-unused-function
  -Wno-unused-but-set-variable
  -Wno-unused-but-set-parameter
  -Wno-sign-compare
  -Wno-parentheses
  -Wno-switch
  -Wno-format
  -Wno-extra
  -Wno-deprecated-declarations
)
set_target_properties(nolf2_cshell PROPERTIES
  CXX_STANDARD 11
  CXX_STANDARD_REQUIRED OFF
)
target_link_libraries(nolf2_cshell PUBLIC
  ltmem
  ButeMgr
  CryptMgr
  Lib_Lith
  MFCStub
  RegMgr
  Lib_StdLith
  LTGUIMgr
)

# engine/ is added before this target exists, so hook CShell in here.
if(TARGET nolf2_engine)
  target_link_libraries(nolf2_engine PRIVATE
    -Wl,--whole-archive nolf2_cshell -Wl,--no-whole-archive
  )
endif()

