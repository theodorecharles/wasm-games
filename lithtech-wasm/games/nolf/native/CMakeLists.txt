cmake_minimum_required(VERSION 3.20)
project(nolf_wasm_probe LANGUAGES CXX)

set(NOLF_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/nolf-source")

# Compile a copy so "CommonUtilities.h" resolves to the wasm shim, not the
# Win32 header sitting next to the official CRC32.cpp.
configure_file(
  "${NOLF_SOURCE}/NOLF/Shared/CRC32.cpp"
  "${CMAKE_CURRENT_BINARY_DIR}/CRC32.cpp"
  COPYONLY
)

add_library(nolf_crc32_compile_gate OBJECT
  "${CMAKE_CURRENT_BINARY_DIR}/CRC32.cpp"
)
target_compile_features(nolf_crc32_compile_gate PRIVATE cxx_std_17)
target_include_directories(nolf_crc32_compile_gate PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/shims"
  "${NOLF_SOURCE}/NOLF/Shared"
)
target_compile_options(nolf_crc32_compile_gate PRIVATE -Wall -Wextra)

add_library(nolf_probe_objects OBJECT
  rez_probe.cpp
  crc32_export.cpp
)
target_compile_features(nolf_probe_objects PRIVATE cxx_std_17)
target_include_directories(nolf_probe_objects PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/shims"
  "${NOLF_SOURCE}/NOLF/Shared"
)
target_compile_options(nolf_probe_objects PRIVATE -Wall -Wextra)

add_library(nolf_host OBJECT lith_host.cpp lith_rez.cpp lith_image.cpp world_v66.cpp)
target_compile_features(nolf_host PRIVATE cxx_std_17)
target_include_directories(nolf_host PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/shims"
  "${NOLF_SOURCE}/NOLF/Shared"
)
target_compile_options(nolf_host PRIVATE -Wall -Wextra)

if(EMSCRIPTEN)
  add_executable(nolf_game
    game_main.cpp
    $<TARGET_OBJECTS:nolf_crc32_compile_gate>
    $<TARGET_OBJECTS:nolf_probe_objects>
    $<TARGET_OBJECTS:nolf_host>
  )
  target_include_directories(nolf_game PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
  target_link_options(nolf_game PRIVATE
    --no-entry
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT=web"
    "SHELL:-s EXPORTED_FUNCTIONS=['_lith_start','_lith_present','_lith_frame','_lith_host_init','_lith_host_state','_lith_host_new_game','_lith_host_confirm','_lith_host_menu_move','_lith_host_back','_lith_host_tick','_lith_host_look','_lith_host_set_controls','_lith_host_fire','_lith_host_gadget','_lith_host_save','_lith_host_load','_lith_host_player_health','_lith_host_frame_width','_lith_host_frame_height','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['HEAPU8','UTF8ToString','stringToNewUTF8','FS']"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s EXPORT_NAME=createNolfGame"
    "SHELL:-s FORCE_FILESYSTEM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s INVOKE_RUN=0"
  )
  set_target_properties(nolf_game PROPERTIES
    OUTPUT_NAME "nolf-game"
    SUFFIX ".mjs"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/dist"
  )
else()
  add_executable(nolf_probe_cli probe_cli.cpp)
  target_compile_features(nolf_probe_cli PRIVATE cxx_std_17)
  target_include_directories(nolf_probe_cli PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
  target_link_libraries(nolf_probe_cli PRIVATE nolf_crc32_compile_gate nolf_probe_objects)

  add_executable(nolf_lith_cli lith_cli.cpp)
  target_compile_features(nolf_lith_cli PRIVATE cxx_std_17)
  target_include_directories(nolf_lith_cli PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}"
    "${NOLF_SOURCE}/NOLF/Shared"
  )
  target_link_libraries(nolf_lith_cli PRIVATE nolf_host nolf_crc32_compile_gate nolf_probe_objects)
endif()
