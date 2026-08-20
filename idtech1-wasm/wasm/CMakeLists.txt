cmake_minimum_required(VERSION 3.22)

# This is intentionally a standalone downstream build. Do not replace it with
# the repository-root CMake project: that path contains upstream's Emscripten
# integration, which is outside this port's provenance boundary.
project(idtech1_wasm VERSION 7.1.0 LANGUAGES C)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure this project with emcmake cmake -S wasm ...")
endif()

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

get_filename_component(REPO_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/generated")
configure_file(
    "${CMAKE_CURRENT_LIST_DIR}/config.h.in"
    "${CMAKE_BINARY_DIR}/generated/config.h"
    @ONLY)

set(COMMON_SOURCES
    "${REPO_ROOT}/src/crispy.c"
    "${REPO_ROOT}/src/i_main.c"
    "${REPO_ROOT}/src/i_system.c"
    "${REPO_ROOT}/src/m_argv.c"
    "${REPO_ROOT}/src/m_misc.c"
    "${REPO_ROOT}/src/i_browser.c")

set(GAME_COMMON_NAMES
    a11y aes_prng d_event d_iwad d_loop d_mode deh_str gusconf i_cdmus
    i_endoom i_flmusic i_glob i_input i_joystick i_musicpack i_oplmusic
    i_pcsound i_sdlmusic i_sdlsound i_sound i_timer i_truecolor i_video
    i_videohr i_winmusic midifallback midifile mus2mid m_bbox m_cheat
    m_config m_controls m_fixed net_client net_common net_dedicated net_gui
    net_io net_loop net_packet net_petname net_query net_sdl net_server
    net_structrw p_mapformat p_rejectpad sha1 memio tables v_diskicon v_video
    v_trans w_checksum w_main w_wad w_file w_file_stdc w_file_posix
    w_file_win32 w_merge z_zone)
foreach(name IN LISTS GAME_COMMON_NAMES)
    list(APPEND GAME_COMMON_SOURCES "${REPO_ROOT}/src/${name}.c")
endforeach()

set(DEHACKED_SOURCES
    "${REPO_ROOT}/src/deh_io.c"
    "${REPO_ROOT}/src/deh_main.c"
    "${REPO_ROOT}/src/deh_mapping.c"
    "${REPO_ROOT}/src/deh_text.c")

file(GLOB OPL_SOURCES CONFIGURE_DEPENDS "${REPO_ROOT}/opl/*.c")
file(GLOB PCSOUND_SOURCES CONFIGURE_DEPENDS "${REPO_ROOT}/pcsound/*.c")
file(GLOB TEXTSCREEN_SOURCES CONFIGURE_DEPENDS "${REPO_ROOT}/textscreen/*.c")

set(PORT_OPTIONS
    "SHELL:-sUSE_SDL=2"
    "SHELL:-sUSE_SDL_MIXER=2"
    "SHELL:-sUSE_SDL_NET=2")

function(add_crispy_web_target game use_deh export_name)
    file(GLOB GAME_SOURCES CONFIGURE_DEPENDS "${REPO_ROOT}/src/${game}/*.c")
    # Each d_main/h2_main translation unit includes its icon's generated C
    # file, so compiling that generated file separately would duplicate data.
    list(FILTER GAME_SOURCES EXCLUDE REGEX "_icon\\.c$")

    set(target "crispy-${game}")
    set(sources
        ${COMMON_SOURCES}
        ${GAME_COMMON_SOURCES}
        ${OPL_SOURCES}
        ${PCSOUND_SOURCES}
        ${TEXTSCREEN_SOURCES}
        ${GAME_SOURCES})
    if(use_deh)
        list(APPEND sources ${DEHACKED_SOURCES})
    endif()

    add_executable(${target} ${sources})
    target_include_directories(${target} PRIVATE
        "${CMAKE_BINARY_DIR}/generated"
        "${REPO_ROOT}/src"
        "${REPO_ROOT}/src/${game}"
        "${REPO_ROOT}/opl"
        "${REPO_ROOT}/pcsound"
        "${REPO_ROOT}/textscreen")
    target_compile_definitions(${target} PRIVATE CRISPY_WASM=1)
    string(TOUPPER "${game}" game_definition)
    target_compile_definitions(${target} PRIVATE "CRISPY_WASM_GAME_${game_definition}=1")
    target_compile_options(${target} PRIVATE ${PORT_OPTIONS})
    target_link_options(${target} PRIVATE
        ${PORT_OPTIONS}
        "SHELL:-sMODULARIZE=1"
        "SHELL:-sEXPORT_NAME=${export_name}"
        "SHELL:-sEXPORTED_RUNTIME_METHODS=['FS','callMain']"
        "SHELL:-sFORCE_FILESYSTEM=1"
        "SHELL:-lidbfs.js"
        "SHELL:-sALLOW_MEMORY_GROWTH=1"
        "SHELL:-sINITIAL_MEMORY=134217728"
        "SHELL:-sSTACK_SIZE=5242880"
        "SHELL:-sEXIT_RUNTIME=0"
        "SHELL:-sASSERTIONS=1"
        # Doom's generated state table intentionally type-erases one-argument
        # mobj actions and three-argument psprite actions. Native ABIs tolerate
        # those historic casts; WebAssembly needs explicit adapter thunks.
        "SHELL:-sEMULATE_FUNCTION_POINTER_CASTS=1"
        "SHELL:-sENVIRONMENT=web"
        "SHELL:-sMIN_WEBGL_VERSION=1"
        "SHELL:-sMAX_WEBGL_VERSION=2")
    set_target_properties(${target} PROPERTIES
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/dist")
endfunction()

add_crispy_web_target(doom TRUE createCrispyDoom)
add_crispy_web_target(heretic TRUE createCrispyHeretic)
add_crispy_web_target(hexen FALSE createCrispyHexen)

# The inherited native Strife tree remains to avoid destabilizing the shared
# Crispy source layout. It is deliberately not a web target or deliverable.
