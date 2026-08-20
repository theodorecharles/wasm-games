set(EMULATION_CORE_ARCHIVE
  "${CMAKE_CURRENT_SOURCE_DIR}/build/core/nes/libnestopia-jg.a")
if(NOT EXISTS "${EMULATION_CORE_ARCHIVE}")
  message(FATAL_ERROR "Build the pinned Nestopia JG core first: VARIANT=nes ./scripts/build-native-core.sh")
endif()

add_library(nestopia_jg STATIC IMPORTED GLOBAL)
set_target_properties(nestopia_jg PROPERTIES IMPORTED_LOCATION "${EMULATION_CORE_ARCHIVE}")
set(EMULATION_CORE_TARGET nestopia_jg)
set(EMULATION_HOST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/engine/src/jg_browser_host.cpp")
set(EMULATION_COMPILE_DEFINITIONS EMULATION_VARIANT_NES=1)
set(EMULATION_FACTORY_NAME createNesEmulationModule)
set(EMULATION_LINK_OPTIONS
  "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/vendor/nestopia-jg/NstDatabase.xml@/core/NstDatabase.xml")
