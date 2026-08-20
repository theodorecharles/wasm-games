cmake_minimum_required(VERSION 3.20)

project(idtech2_quake_wasm C)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "This target requires Emscripten. Run scripts/build-web.sh.")
endif()

set(QUAKE_SOURCES
    WinQuake/cl_demo.c
    WinQuake/cl_input.c
    WinQuake/cl_main.c
    WinQuake/cl_parse.c
    WinQuake/cl_tent.c
    WinQuake/chase.c
    WinQuake/cmd.c
    WinQuake/common.c
    WinQuake/console.c
    WinQuake/crc.c
    WinQuake/cvar.c
    WinQuake/draw.c
    WinQuake/d_edge.c
    WinQuake/d_fill.c
    WinQuake/d_init.c
    WinQuake/d_modech.c
    WinQuake/d_part.c
    WinQuake/d_polyse.c
    WinQuake/d_scan.c
    WinQuake/d_sky.c
    WinQuake/d_sprite.c
    WinQuake/d_surf.c
    WinQuake/d_vars.c
    WinQuake/d_zpoint.c
    WinQuake/host.c
    WinQuake/host_cmd.c
    WinQuake/keys.c
    WinQuake/menu.c
    WinQuake/mathlib.c
    WinQuake/model.c
    WinQuake/net_loop.c
    WinQuake/net_main.c
    WinQuake/net_none.c
    WinQuake/net_vcr.c
    WinQuake/nonintel.c
    WinQuake/pr_cmds.c
    WinQuake/pr_edict.c
    WinQuake/pr_exec.c
    WinQuake/r_aclip.c
    WinQuake/r_alias.c
    WinQuake/r_bsp.c
    WinQuake/r_draw.c
    WinQuake/r_edge.c
    WinQuake/r_efrag.c
    WinQuake/r_light.c
    WinQuake/r_main.c
    WinQuake/r_misc.c
    WinQuake/r_part.c
    WinQuake/r_sky.c
    WinQuake/r_sprite.c
    WinQuake/r_surf.c
    WinQuake/r_vars.c
    WinQuake/sbar.c
    WinQuake/screen.c
    WinQuake/snd_dma.c
    WinQuake/snd_emscripten.c
    WinQuake/snd_mem.c
    WinQuake/snd_mix.c
    WinQuake/sv_main.c
    WinQuake/sv_move.c
    WinQuake/sv_phys.c
    WinQuake/sv_user.c
    WinQuake/view.c
    WinQuake/wad.c
    WinQuake/world.c
    WinQuake/zone.c
    WinQuake/cd_null.c
    WinQuake/sys_emscripten.c
    WinQuake/vid_emscripten.c
)

add_executable(quake1 ${QUAKE_SOURCES})
set_target_properties(quake1 PROPERTIES
    C_STANDARD 90
    C_STANDARD_REQUIRED ON
    C_EXTENSIONS ON
    OUTPUT_NAME quake1
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/web/dist"
)

target_include_directories(quake1 PRIVATE WinQuake)
target_compile_definitions(quake1 PRIVATE
    stricmp=strcasecmp
    WEBQUAKE=1
)
target_compile_options(quake1 PRIVATE
    -fno-common
    -Wno-deprecated-non-prototype
    -Wno-incompatible-pointer-types
    -Wno-implicit-function-declaration
    -Wno-int-conversion
    -Wno-parentheses
)

target_link_options(quake1 PRIVATE
    "SHELL:-s USE_SDL=2"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=67108864"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s ASSERTIONS=1"
    "SHELL:-s EXIT_RUNTIME=0"
    "SHELL:-s ENVIRONMENT=web"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['FS','callMain']"
    "SHELL:-lidbfs.js"
)

file(MAKE_DIRECTORY "${CMAKE_SOURCE_DIR}/web/dist")
configure_file(
    "${CMAKE_SOURCE_DIR}/web/game-adapter.js"
    "${CMAKE_SOURCE_DIR}/web/dist/game-adapter.js"
    COPYONLY
)
configure_file(
    "${CMAKE_SOURCE_DIR}/web/wasm-game.json"
    "${CMAKE_SOURCE_DIR}/web/dist/wasm-game.json"
    COPYONLY
)
configure_file(
    "${CMAKE_SOURCE_DIR}/web/wasm-game-data.json"
    "${CMAKE_SOURCE_DIR}/web/dist/wasm-game-data.json"
    COPYONLY
)
configure_file(
    "${CMAKE_SOURCE_DIR}/WinQuake/quake.ico"
    "${CMAKE_SOURCE_DIR}/web/dist/quake.ico"
    COPYONLY
)

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_options(quake1 PRIVATE -g3)
    target_link_options(quake1 PRIVATE -g3 "SHELL:-s ASSERTIONS=2")
endif()
