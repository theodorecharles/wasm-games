set(EMULATION_CORE_ARCHIVE
  "${CMAKE_CURRENT_SOURCE_DIR}/build/core/snes/libbsnes-jg.a")
if(NOT EXISTS "${EMULATION_CORE_ARCHIVE}")
  message(FATAL_ERROR "Build the pinned bsnes-jg core first: VARIANT=snes ./scripts/build-native-core.sh")
endif()

add_library(bsnes_jg STATIC IMPORTED GLOBAL)
set_target_properties(bsnes_jg PROPERTIES IMPORTED_LOCATION "${EMULATION_CORE_ARCHIVE}")
set(EMULATION_CORE_TARGET bsnes_jg)
set(EMULATION_HOST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/engine/src/jg_browser_host.cpp")
set(EMULATION_COMPILE_DEFINITIONS EMULATION_VARIANT_SNES=1)
set(EMULATION_FACTORY_NAME createSnesEmulationModule)
set(EMULATION_LINK_OPTIONS
  "SHELL:-sASYNCIFY=1"
  "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/vendor/bsnes-jg/Database/boards.bml@/core/boards.bml"
  "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/engine/assets/empty-snes-database.bml@/core/SuperFamicom.bml"
  "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/engine/assets/empty-snes-database.bml@/core/BSMemory.bml"
  "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/engine/assets/empty-snes-database.bml@/core/SufamiTurbo.bml")
