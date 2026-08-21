cmake_minimum_required(VERSION 3.20)
project(nolf2_wasm_probe LANGUAGES CXX)

set(NOLF2_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/nolf2-source")

configure_file(
  "${NOLF2_SOURCE}/Game/Shared/CRC32.cpp"
  "${CMAKE_CURRENT_BINARY_DIR}/CRC32.cpp"
  COPYONLY
)

add_library(nolf2_crc32_compile_gate OBJECT
  "${CMAKE_CURRENT_BINARY_DIR}/CRC32.cpp"
)
target_compile_features(nolf2_crc32_compile_gate PRIVATE cxx_std_17)
target_include_directories(nolf2_crc32_compile_gate PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/shims"
  "${NOLF2_SOURCE}/Game/Shared"
)
target_compile_options(nolf2_crc32_compile_gate PRIVATE -Wall -Wextra)

add_library(nolf2_stdlith_helpers OBJECT
  "${NOLF2_SOURCE}/libs/stdlith/helpers.cpp"
)
target_compile_features(nolf2_stdlith_helpers PRIVATE cxx_std_17)
target_compile_definitions(nolf2_stdlith_helpers PRIVATE __LINUX)
target_include_directories(nolf2_stdlith_helpers PRIVATE
  "${NOLF2_SOURCE}/libs/stdlith"
)
target_compile_options(nolf2_stdlith_helpers PRIVATE -Wall -Wextra)

add_library(nolf2_probe_objects OBJECT
  rez_probe.cpp
  crc32_export.cpp
)
target_compile_features(nolf2_probe_objects PRIVATE cxx_std_17)
target_include_directories(nolf2_probe_objects PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/shims"
  "${NOLF2_SOURCE}/Game/Shared"
)
target_compile_options(nolf2_probe_objects PRIVATE -Wall -Wextra)

add_library(nolf2_host OBJECT lith_host.cpp)
target_compile_features(nolf2_host PRIVATE cxx_std_17)
target_include_directories(nolf2_host PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/shims"
  "${NOLF2_SOURCE}/Game/Shared"
)
target_compile_options(nolf2_host PRIVATE -Wall -Wextra)

if(EMSCRIPTEN)
  add_executable(nolf2_game
    game_main.cpp
    $<TARGET_OBJECTS:nolf2_crc32_compile_gate>
    $<TARGET_OBJECTS:nolf2_stdlith_helpers>
    $<TARGET_OBJECTS:nolf2_probe_objects>
    $<TARGET_OBJECTS:nolf2_host>
  )
  target_include_directories(nolf2_game PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
  target_link_options(nolf2_game PRIVATE
    --no-entry
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT=web"
    "SHELL:-s EXPORTED_FUNCTIONS=['_lith_start','_lith_present','_lith_frame','_lith_host_init','_lith_host_state','_lith_host_new_game','_lith_host_tick','_lith_host_look','_lith_host_set_controls','_lith_host_fire','_lith_host_gadget','_lith_host_save','_lith_host_load','_lith_host_player_health','_lith_host_frame_width','_lith_host_frame_height','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['HEAPU8','UTF8ToString','stringToNewUTF8','FS']"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s EXPORT_NAME=createNolf2Game"
    "SHELL:-s FORCE_FILESYSTEM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s INVOKE_RUN=0"
  )
  set_target_properties(nolf2_game PROPERTIES
    OUTPUT_NAME "nolf2-game"
    SUFFIX ".mjs"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/dist"
  )
else()
  add_executable(nolf2_probe_cli probe_cli.cpp)
  target_compile_features(nolf2_probe_cli PRIVATE cxx_std_17)
  target_include_directories(nolf2_probe_cli PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
  target_link_libraries(nolf2_probe_cli PRIVATE
    nolf2_crc32_compile_gate
    nolf2_stdlith_helpers
    nolf2_probe_objects
  )

  add_executable(nolf2_lith_cli lith_cli.cpp)
  target_compile_features(nolf2_lith_cli PRIVATE cxx_std_17)
  target_include_directories(nolf2_lith_cli PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}"
    "${NOLF2_SOURCE}/Game/Shared"
  )
  target_link_libraries(nolf2_lith_cli PRIVATE
    nolf2_host
    nolf2_crc32_compile_gate
    nolf2_probe_objects
  )
endif()
