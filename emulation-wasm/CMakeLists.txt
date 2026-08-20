cmake_minimum_required(VERSION 3.24)
project(emulation_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "emulation-wasm must be configured through emcmake")
endif()

set(EMULATION_VARIANT "" CACHE STRING "nes, snes, ps1, or ps2")
set_property(CACHE EMULATION_VARIANT PROPERTY STRINGS nes snes ps1 ps2)

if(NOT EMULATION_VARIANT MATCHES "^(nes|snes|ps1|ps2)$")
  message(FATAL_ERROR "Set -DEMULATION_VARIANT=nes|snes|ps1|ps2")
endif()

set(variant_definition "${CMAKE_CURRENT_SOURCE_DIR}/cmake/variants/${EMULATION_VARIANT}.cmake")
if(NOT EXISTS "${variant_definition}")
  message(FATAL_ERROR
    "${EMULATION_VARIANT} native host is not implemented. "
    "Complete cmake/variants/${EMULATION_VARIANT}.cmake and its real core host before building.")
endif()

include("${variant_definition}")

if(NOT EMULATION_CORE_TARGET OR NOT EMULATION_HOST_SOURCES)
  message(FATAL_ERROR "Variant definition must set EMULATION_CORE_TARGET and EMULATION_HOST_SOURCES")
endif()

add_executable(emulator ${EMULATION_HOST_SOURCES})
target_include_directories(emulator PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/engine/include"
  "${CMAKE_CURRENT_SOURCE_DIR}/vendor/jolly-good-api"
)
target_compile_features(emulator PRIVATE c_std_11 cxx_std_17)
target_compile_definitions(emulator PRIVATE ${EMULATION_COMPILE_DEFINITIONS})
target_compile_options(emulator PRIVATE "SHELL:-sUSE_SDL=2" -fexceptions ${EMULATION_COMPILE_OPTIONS})
target_link_libraries(emulator PRIVATE ${EMULATION_CORE_TARGET})

set_target_properties(emulator PROPERTIES
  OUTPUT_NAME "emulator"
  SUFFIX ".js"
)

target_link_options(emulator PRIVATE
  "SHELL:-sASSERTIONS=1"
  "SHELL:-sDISABLE_EXCEPTION_CATCHING=0"
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=0"
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sEXIT_RUNTIME=0"
  "SHELL:-sFORCE_FILESYSTEM=1"
  "SHELL:-lidbfs.js"
  "SHELL:-sUSE_SDL=2"
  "SHELL:-sMIN_WEBGL_VERSION=2"
  "SHELL:-sMAX_WEBGL_VERSION=2"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['FS','callMain','setCanvasSize']"
  "SHELL:-sEXPORTED_FUNCTIONS=['_main','_Emulation_BrowserSetButton','_Emulation_BrowserSetAxis','_Emulation_BrowserButtonState','_Emulation_BrowserReleaseAll','_Emulation_BrowserResize','_Emulation_BrowserSaveState','_Emulation_BrowserLoadState','_Emulation_BrowserStateOperationStatus','_Emulation_BrowserShutdown','_Emulation_BrowserRuntimeState','_Emulation_BrowserVideoWidth','_Emulation_BrowserVideoHeight','_Emulation_BrowserFrameCount','_Emulation_BrowserAudioFrameCount','_Emulation_BrowserAudioQueued']"
  "SHELL:-sEXPORT_NAME=${EMULATION_FACTORY_NAME}"
  ${EMULATION_LINK_OPTIONS}
)
