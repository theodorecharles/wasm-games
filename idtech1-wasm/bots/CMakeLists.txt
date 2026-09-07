cmake_minimum_required(VERSION 3.22)
project(idtech1_classic_bots LANGUAGES C)

if(EMSCRIPTEN)
    message(FATAL_ERROR "Managed classic bots use the native compiler")
endif()
set(IDTECH1_SOURCE_DIR "" CACHE PATH "The canonical pinned/patched Crispy checkout")
if(NOT EXISTS "${IDTECH1_SOURCE_DIR}/src/d_loop.c")
    message(FATAL_ERROR "IDTECH1_SOURCE_DIR must identify the prepared Crispy source")
endif()
set(ENABLE_SDL2_MIXER OFF CACHE BOOL "Bots do not produce audio" FORCE)
set(ENABLE_SDL2_NET ON CACHE BOOL "Bots speak the native UDP protocol" FORCE)
add_subdirectory("${IDTECH1_SOURCE_DIR}" crispy EXCLUDE_FROM_ALL)

# Keep the inherited native build separate from wasm/CMakeLists.txt. GNU ld
# wraps only the local command producer and lobby entry point. No world state,
# protocol, RNG, weapon or simulation implementation is replaced.
foreach(game doom heretic hexen)
    set(target "crispy-${game}")
    target_sources(${target} PRIVATE "${CMAKE_CURRENT_LIST_DIR}/classic-bot.c"
        "${CMAKE_CURRENT_LIST_DIR}/classic-bot-lobby.c")
    target_include_directories(${target} PRIVATE
        "${IDTECH1_SOURCE_DIR}/src" "${IDTECH1_SOURCE_DIR}/src/${game}")
    string(TOUPPER "${game}" definition)
    target_compile_definitions(${target} PRIVATE "CLASSIC_BOT_${definition}=1")
    target_link_options(${target} PRIVATE
        "-Wl,--wrap=G_BuildTiccmd" "-Wl,--wrap=NET_WaitForLaunch" "-Wl,--wrap=TXT_Sleep")
    target_link_libraries(${target} m)
    set_target_properties(${target} PROPERTIES
        OUTPUT_NAME "classic-bot-${game}" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
endforeach()
