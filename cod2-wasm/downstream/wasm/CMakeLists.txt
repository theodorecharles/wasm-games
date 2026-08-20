cmake_minimum_required(VERSION 3.20)
project(cod2_downstream_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this target through scripts/build-web.sh")
endif()

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)
set(COD2_ROOT "${CMAKE_CURRENT_LIST_DIR}/../..")
set(COD2_SRC "${COD2_ROOT}/src")

file(GLOB_RECURSE COD2_PC_C CONFIGURE_DEPENDS "${COD2_SRC}/PC/*.c")
file(GLOB_RECURSE COD2_MAC_C CONFIGURE_DEPENDS "${COD2_SRC}/Mac/*.c")
file(GLOB_RECURSE COD2_STUB_C CONFIGURE_DEPENDS "${COD2_SRC}/stubs/*.c")
file(GLOB COD2_ROOT_C CONFIGURE_DEPENDS "${COD2_SRC}/*.c")
set(COD2_CLIENT_SOURCES ${COD2_PC_C} ${COD2_MAC_C} ${COD2_STUB_C} ${COD2_ROOT_C})

# Use Emscripten's maintained zlib port, reconstructed portable data C, and a
# downstream browser entrypoint. No native x86/Mach-O assembly enters the build.
list(FILTER COD2_CLIENT_SOURCES EXCLUDE REGEX "/PC/zlib/(inflate|infblock|infcodes|inffast|inftrees|infutil|adler32|zutil)\\.c$")
list(FILTER COD2_CLIENT_SOURCES EXCLUDE REGEX "/(data|import_pointers|literals)\\.c$")
list(FILTER COD2_CLIENT_SOURCES EXCLUDE REGEX "/stubs/cpp_trampoline\\.c$")

list(APPEND COD2_CLIENT_SOURCES
  "${COD2_SRC}/blobs/bss.c"
  "${COD2_ROOT}/build/native_gen/data32.c"
  "${COD2_ROOT}/build/native_gen/literals32.c"
  "${COD2_ROOT}/build/native_gen/import_pointers_native.c"
  "${CMAKE_CURRENT_LIST_DIR}/web_main.c"
  "${CMAKE_CURRENT_LIST_DIR}/web_gl_compat.c")

add_library(cod2_client_objects OBJECT ${COD2_CLIENT_SOURCES})
target_compile_definitions(cod2_client_objects PRIVATE
  COD2_DOWNSTREAM_WASM=1
  COD2_FEATURE_WWW_DOWNLOAD=0
  COD2_FEATURE_PUNKBUSTER=0
  COD2_FEATURE_SCRIPT_DEBUGGER=0
  COD2_FEATURE_GAMEPAD=0
  COD2_FEATURE_SPLITSCREEN=0
  SDL_DISABLE_IMMINTRIN_H=1)
target_include_directories(cod2_client_objects PRIVATE
  "${COD2_ROOT}"
  "${COD2_SRC}"
  "${COD2_SRC}/headers"
  "${COD2_SRC}/PC/speex"
  "${CMAKE_CURRENT_LIST_DIR}")
target_compile_options(cod2_client_objects PRIVATE
  "SHELL:-s USE_SDL=2"
  -fno-common -fno-strict-aliasing -fwrapv -fno-strict-overflow
  -Wno-implicit-function-declaration -Wno-incompatible-pointer-types
  -Wno-int-conversion -Wno-return-type -Wno-deprecated-non-prototype
  -Wno-duplicate-decl-specifier -Wno-ignored-attributes)

# Keep the real link available as an explicit diagnostic target. It is not part
# of ALL because the reconstruction's native generated data model currently
# relies on function/data aliases which wasm-ld cannot represent. Compiling the
# object graph remains useful evidence and prevents a checksum probe from being
# mistaken for an engine build.
add_executable(cod2_client EXCLUDE_FROM_ALL $<TARGET_OBJECTS:cod2_client_objects>)
target_link_options(cod2_client PRIVATE
  "SHELL:-s USE_SDL=2"
  "SHELL:-s USE_ZLIB=1"
  "SHELL:-s USE_WEBGL2=1"
  "SHELL:-s MIN_WEBGL_VERSION=2"
  "SHELL:-s MAX_WEBGL_VERSION=2"
  "SHELL:-s LEGACY_GL_EMULATION=1"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=536870912"
  "SHELL:-s MAXIMUM_MEMORY=4294967296"
  "SHELL:-s EXIT_RUNTIME=0"
  "SHELL:-s ASSERTIONS=1"
  "SHELL:-s ENVIRONMENT=web"
  "SHELL:-s STACK_SIZE=8388608")
set_target_properties(cod2_client PROPERTIES
  OUTPUT_NAME "cod2"
  SUFFIX ".js"
  LINKER_LANGUAGE CXX
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/site")

add_executable(cod2_core_probe
  "${CMAKE_CURRENT_LIST_DIR}/core_probe.c"
  "${COD2_SRC}/PC/qcommon/md4.c")
target_compile_definitions(cod2_core_probe PRIVATE COD2_DOWNSTREAM_WASM_CORE_PROBE=1)
target_include_directories(cod2_core_probe PRIVATE "${CMAKE_CURRENT_LIST_DIR}")
target_compile_options(cod2_core_probe PRIVATE
  -Wall -Wextra -Wpedantic -ffunction-sections -fdata-sections)
target_link_options(cod2_core_probe PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s ENVIRONMENT=web,node"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME=createCod2Diagnostic"
  "SHELL:-s EXIT_RUNTIME=1"
  "SHELL:-s ASSERTIONS=1"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-Wl,--gc-sections")
set_target_properties(cod2_core_probe PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/site"
  SUFFIX ".js")
