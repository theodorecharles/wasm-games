cmake_minimum_required(VERSION 3.20)

project(Open1560WasmProbe LANGUAGES CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure this directory with emcmake")
endif()

set(OPEN1560_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/..")
set(OPEN1560_CODE "${OPEN1560_ROOT}/code/midtown")

# This target is deliberately compiled but not linked into the probe. It makes
# the build fail if the real Open1560 VFS implementation stops compiling for
# wasm, without pretending that the rest of the engine is standalone yet.
add_library(open1560_vfs_wasm_compile_gate OBJECT
    "${OPEN1560_CODE}/stream/vfsystem.cpp"
)
target_compile_features(open1560_vfs_wasm_compile_gate PRIVATE cxx_std_17)
target_compile_definitions(open1560_vfs_wasm_compile_gate PRIVATE
    ARTS_STANDALONE
    ARTS_TARGET_BUILD=1560
)
target_compile_options(open1560_vfs_wasm_compile_gate PRIVATE
    "-include${OPEN1560_CODE}/arts_pch.h"
    -Wall
    -Wextra
    -Wpedantic
    -Werror
)
target_include_directories(open1560_vfs_wasm_compile_gate PRIVATE
    "${OPEN1560_CODE}"
    "${OPEN1560_ROOT}/vendor/hedley"
    "${OPEN1560_ROOT}/vendor/mem"
)

add_executable(mm1_asset_probe asset_probe.cpp)
target_compile_features(mm1_asset_probe PRIVATE cxx_std_17)
target_compile_definitions(mm1_asset_probe PRIVATE ARTS_STANDALONE)
target_compile_options(mm1_asset_probe PRIVATE -Wall -Wextra -Wpedantic -Werror)
target_include_directories(mm1_asset_probe PRIVATE
    "${OPEN1560_CODE}"
    "${OPEN1560_ROOT}/vendor/hedley"
)
target_link_options(mm1_asset_probe PRIVATE
    --no-entry
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT=web,node"
    "SHELL:-s EXPORTED_FUNCTIONS=['_mm1_probe_archive','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['HEAPU8','UTF8ToString']"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s EXPORT_NAME=createMM1AssetProbe"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s MODULARIZE=1"
)
set_target_properties(mm1_asset_probe PROPERTIES
    OUTPUT_NAME "mm1-asset-probe"
    SUFFIX ".mjs"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/dist"
)

add_custom_command(TARGET mm1_asset_probe POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/index.html"
        "$<TARGET_FILE_DIR:mm1_asset_probe>/index.html"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/probe-ui.mjs"
        "$<TARGET_FILE_DIR:mm1_asset_probe>/probe-ui.mjs"
)

enable_testing()
find_program(NODE_EXECUTABLE node REQUIRED)
add_test(NAME mm1_asset_probe_contract
    COMMAND "${NODE_EXECUTABLE}"
        "${CMAKE_CURRENT_SOURCE_DIR}/test_probe.mjs"
        "$<TARGET_FILE:mm1_asset_probe>"
)
add_test(NAME open1560_archive_probe
    COMMAND "${NODE_EXECUTABLE}"
        "${CMAKE_CURRENT_SOURCE_DIR}/test_probe.mjs"
        "$<TARGET_FILE:mm1_asset_probe>"
        "${OPEN1560_ROOT}/game/1560.ar"
)
