# Jupiter Linux client host + SDL/OpenGL renderer (nolf2_engine).
# port/boot/nolf2_boot.cpp remains the fallback frontend.

set(RT "${LT}/runtime")
set(SDK "${LT}/sdk")
set(ENG_INC "${CMAKE_CURRENT_SOURCE_DIR}/include")
set(SDL2_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../third_party/sdl2")

add_library(Lib_ILTSound STATIC
  ${RT}/sound/src/iltsound.cpp
)
target_include_directories(Lib_ILTSound PUBLIC
  ${ENG_INC}
  ${CMAKE_CURRENT_SOURCE_DIR}/../compat
  ${RT}/sound/src
  ${SDK}/inc
)
target_compile_definitions(Lib_ILTSound PRIVATE
  USE_ABSTRACT_SOUND_INTERFACES
  _LINUX __LINUX _FINAL _NOMFC
)
target_compile_options(Lib_ILTSound PRIVATE ${LT_CXX_FLAGS}
  -include ${ENG_INC}/nolf2_engine_port.h)

add_library(Lib_Info STATIC
  ${RT}/info/src/outputredir.cpp
  ${RT}/info/src/sys/win32/outputredir_win32.cpp
)
target_include_directories(Lib_Info PUBLIC
  ${ENG_INC}
  ${CMAKE_CURRENT_SOURCE_DIR}/../compat
  ${RT}/info/src
  ${SDK}/inc
  ${RT}/kernel/src
  ${RT}/shared/src
)
target_compile_definitions(Lib_Info PRIVATE _LINUX __LINUX _FINAL _NOMFC)
target_compile_options(Lib_Info PRIVATE ${LT_CXX_FLAGS})

add_library(Lib_UI STATIC
  ${RT}/ui/src/cuibase.cpp
  ${RT}/ui/src/cuibase_impl.cpp
  ${RT}/ui/src/cuibitmapfont.cpp
  ${RT}/ui/src/cuibutton.cpp
  ${RT}/ui/src/cuibutton_impl.cpp
  ${RT}/ui/src/cuicheck.cpp
  ${RT}/ui/src/cuicheck_impl.cpp
  ${RT}/ui/src/cuidropdownlist.cpp
  ${RT}/ui/src/cuidropdownlist_impl.cpp
  ${RT}/ui/src/cuifont_impl.cpp
  ${RT}/ui/src/cuifontmanager.cpp
  ${RT}/ui/src/cuiformattedpolystring.cpp
  ${RT}/ui/src/cuiformattedpolystring_impl.cpp
  ${RT}/ui/src/cuiinterval.cpp
  ${RT}/ui/src/cuiinterval_impl.cpp
  ${RT}/ui/src/cuilinklist.cpp
  ${RT}/ui/src/cuilist.cpp
  ${RT}/ui/src/cuilist_impl.cpp
  ${RT}/ui/src/cuimessagequeue.cpp
  ${RT}/ui/src/cuioption.cpp
  ${RT}/ui/src/cuioption_impl.cpp
  ${RT}/ui/src/cuipolystring.cpp
  ${RT}/ui/src/cuipolystring_impl.cpp
  ${RT}/ui/src/cuipolytex.cpp
  ${RT}/ui/src/cuiprogress.cpp
  ${RT}/ui/src/cuiprogress_impl.cpp
  ${RT}/ui/src/cuiredblack.cpp
  ${RT}/ui/src/cuirenderstate.cpp
  ${RT}/ui/src/cuislider.cpp
  ${RT}/ui/src/cuislider_impl.cpp
  ${RT}/ui/src/cuistaticimage.cpp
  ${RT}/ui/src/cuistaticimage_impl.cpp
  ${RT}/ui/src/cuistatictext.cpp
  ${RT}/ui/src/cuistatictext_impl.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/cuivectorfont_linux.cpp
  ${RT}/ui/src/cuiwidget.cpp
  ${RT}/ui/src/cuiwidget_impl.cpp
  ${RT}/ui/src/cuiwidgetmanager.cpp
  ${RT}/ui/src/cuiwindow.cpp
  ${RT}/ui/src/cuiwindow_impl.cpp
)
target_include_directories(Lib_UI PUBLIC
  ${ENG_INC}
  ${CMAKE_CURRENT_SOURCE_DIR}/../compat
  ${CMAKE_CURRENT_SOURCE_DIR}/../shims
  ${RT}/ui/src
  ${SDK}/inc
  ${SDK}/inc/physics
  ${LT}/libs/stdlith
  ${RT}/shared/src
  ${RT}/shared/src/sys/win
  ${RT}/kernel/src
  ${RT}/kernel/src/sys/win
  ${RT}/kernel/mem/src
  ${RT}/client/src
)
target_compile_definitions(Lib_UI PRIVATE _LINUX __LINUX _FINAL _NOMFC)
target_include_directories(Lib_UI PRIVATE /usr/include/freetype2 /usr/include/libpng16)
target_compile_options(Lib_UI PRIVATE ${LT_CXX_FLAGS}
  -include ${ENG_INC}/nolf2_engine_port.h
  -Wno-unused-variable -Wno-unused-function -Wno-sign-compare)

set(NOLF2_ENGINE_SOURCES
  sdl_client.cpp
  linux_dsi.cpp
  sdl_input.cpp
  sdl_render.cpp
  sdl_drawprim.cpp
  sdl_sound.cpp
  engine_linux_stubs.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../cres/cres_loadstring.cpp

  ${RT}/controlfilemgr/controlfilemgr.cpp
  ${RT}/client/src/client_filemgr.cpp
  ${RT}/kernel/src/icommandlineargs.cpp
  ${RT}/client/src/client_iltcommon.cpp
  ${RT}/server/src/server_iltcommon.cpp
  ${RT}/shared/src/shared_iltcommon.cpp
  ${RT}/kernel/src/sys/win/lt_cursor_impl.cpp
  ${RT}/client/src/client_iltmodel.cpp
  ${RT}/shared/src/modellt_impl.cpp
  ${RT}/server/src/server_iltmodel.cpp
  ${RT}/client/src/client_iltphysics.cpp
  ${RT}/server/src/server_iltphysics.cpp
  ${RT}/shared/src/shared_iltphysics.cpp
  ${RT}/server/src/server_iltsoundmgr.cpp
  ${RT}/sound/src/soundmgr.cpp
  ${RT}/shared/src/transformlt_impl.cpp
  ${RT}/client/src/client_iltvideomgr.cpp
  ${RT}/shared/src/interface_linkage.cpp
  ${RT}/world/src/world_blind_object_data.cpp
  ${RT}/world/src/world_blocker_data.cpp
  ${RT}/world/src/world_blocker_math.cpp
  ${RT}/client/src/world_client_bsp.cpp
  ${RT}/world/src/world_particle_blocker_data.cpp
  ${RT}/server/src/world_server_bsp.cpp
  ${RT}/world/src/world_shared_bsp.cpp
  ${RT}/model/src/animtracker.cpp
  ${RT}/shared/src/bdefs.cpp
  ${RT}/kernel/src/sys/win/bindmgr.cpp
  ${RT}/shared/src/classbind.cpp
  ${RT}/server/src/classmgr.cpp
  ${RT}/client/src/client_formatmgr.cpp
  ${RT}/client/src/client_graphmgr.cpp
  ${RT}/client/src/client_ticks.cpp
  ${RT}/client/src/clientde_impl.cpp
  ${RT}/client/src/clientmgr.cpp
  ${RT}/client/src/clientshell.cpp
  ${RT}/client/src/cmoveabstract.cpp
  ${RT}/client/src/cnet.cpp
  ${RT}/client/src/cobject.cpp
  ${RT}/shared/src/collision.cpp
  ${RT}/shared/src/compress.cpp
  ${RT}/shared/src/concommand.cpp
  ${RT}/shared/src/conparse.cpp
  ${RT}/client/src/console.cpp
  ${RT}/client/src/consolecommands.cpp
  ${RT}/kernel/src/sys/linux/counter.cpp
  ${RT}/client/src/sys/win/customfontfilemgr.cpp
  ${RT}/client/src/cutil.cpp
  ${RT}/model/src/sys/d3d/d3d_model_load.cpp
  ${RT}/kernel/io/src/sys/win/de_file.cpp
  ${RT}/world/src/de_mainworld.cpp
  ${RT}/kernel/mem/src/sys/linux/de_memory.cpp
  ${RT}/world/src/de_nodes.cpp
  ${RT}/world/src/de_objects.cpp
  ${RT}/shared/src/debuggeometry.cpp
  ${RT}/kernel/src/debugging.cpp
  ${RT}/client/src/debuggraphmgr.cpp
  ${RT}/shared/src/dhashtable.cpp
  ${RT}/shared/src/sys/win/dstreamopenqueuemgr.cpp
  ${RT}/shared/src/dtxmgr.cpp
  ${RT}/kernel/src/sys/win/dutil.cpp
  ${RT}/shared/src/engine_vars.cpp
  ${RT}/client/src/errorlog.cpp
  ${RT}/shared/src/findobj.cpp
  ${RT}/shared/src/ftclient.cpp
  ${RT}/shared/src/ftserv.cpp
  ${RT}/world/src/fullintersectline.cpp
  ${RT}/server/src/game_serialize.cpp
  ${RT}/shared/src/gamemath.cpp
  ${RT}/shared/src/genericprop_setup.cpp
  ${RT}/shared/src/genltstream.cpp
  ${RT}/shared/src/geometry.cpp
  ${RT}/shared/src/geomroutines.cpp
  ${RT}/shared/src/impl_common.cpp
  ${RT}/kernel/src/sys/win/interface_helpers.cpp
  ${RT}/server/src/interlink.cpp
  ${RT}/world/src/intersect_line.cpp
  ${RT}/world/src/intersectsweptsphere.cpp
  ${RT}/shared/src/leech.cpp
  ${RT}/world/src/light_table.cpp
  ${RT}/shared/src/lightmap_compress.cpp
  ${RT}/shared/src/lightmap_planes.cpp
  ${RT}/client/src/linesystem.cpp
  ${RT}/kernel/src/sys/win/load_pcx.cpp
  ${RT}/kernel/net/src/localdriver.cpp
  ${RT}/client/src/ltbenchmark_impl.cpp
  ${SDK}/inc/lterror.cpp
  ${RT}/kernel/src/sys/linux/lthread.cpp
  ${RT}/client/src/ltinfo_impl.cpp
  ${RT}/kernel/src/sys/linux/ltlibraryloader.cpp
  ${RT}/kernel/mem/src/ltmemory.cpp
  ${RT}/shared/src/ltmessage.cpp
  ${RT}/client/src/ltmessage_client.cpp
  ${RT}/server/src/ltmessage_server.cpp
  ${SDK}/inc/ltmodule.cpp
  ${SDK}/inc/ltobjref.cpp
  ${SDK}/inc/ltquatbase.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/ltrendermgr_stub.cpp
  ${RT}/client/src/lttexturestring.cpp
  ${RT}/kernel/src/sys/linux/ltthread.cpp
  ${RT}/shared/src/lttimer.cpp
  ${RT}/client/src/memorywatch.cpp
  ${RT}/model/src/model.cpp
  ${RT}/model/src/model_load.cpp
  ${RT}/model/src/modelallocations.cpp
  ${RT}/shared/src/motion.cpp
  ${RT}/shared/src/moveobject.cpp
  ${RT}/shared/src/moveplayer.cpp
  ${RT}/kernel/net/src/netmgr.cpp
  ${RT}/shared/src/nexus.cpp
  ${RT}/shared/src/objectmgr.cpp
  ${RT}/kernel/net/src/packet.cpp
  ${RT}/shared/src/parse_world_info.cpp
  ${RT}/client/src/particlesystem.cpp
  ${RT}/shared/src/pixelformat.cpp
  ${RT}/client/src/polygrid.cpp
  ${RT}/client/src/predict.cpp
  ${RT}/shared/src/ratetracker.cpp
  ${RT}/kernel/src/sys/win/render.cpp
  ${RT}/server/src/s_client.cpp
  ${RT}/server/src/s_concommand.cpp
  ${RT}/server/src/s_intersect.cpp
  ${RT}/server/src/s_net.cpp
  ${RT}/server/src/s_object.cpp
  ${RT}/server/src/server_consolestate.cpp
  ${RT}/server/src/server_extradata.cpp
  ${RT}/server/src/server_filemgr.cpp
  ${RT}/server/src/serverde_impl.cpp
  ${RT}/server/src/serverevent.cpp
  ${RT}/server/src/servermgr.cpp
  ${RT}/client/src/setupobject.cpp
  ${RT}/client/src/shellnet.cpp
  ${RT}/client/src/shelltransfer.cpp
  ${RT}/client/src/shellutil.cpp
  ${RT}/server/src/smoveabstract.cpp
  ${RT}/sound/src/soundbuffer.cpp
  ${RT}/sound/src/sounddata.cpp
  ${RT}/sound/src/soundinstance.cpp
  ${RT}/server/src/soundtrack.cpp
  ${RT}/client/src/sprite.cpp
  ${RT}/shared/src/spritecontrolimpl.cpp
  ${RT}/shared/src/stacktrace.cpp
  ${RT}/shared/src/stdlterror.cpp
  ${RT}/kernel/src/sys/linux/streamsim.cpp
  ${RT}/kernel/src/sys/win/stringmgr.cpp
  ${RT}/shared/src/strtools.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/text_mgr_linux.cpp
  ${RT}/client/src/texturestring.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/texturestringimage_linux.cpp
  ${RT}/kernel/src/sys/linux/timemgr.cpp
  ${RT}/model/src/transformmaker.cpp
  ${RT}/kernel/net/src/sys/win/udpdriver.cpp
  ${RT}/kernel/net/src/sys/linux/linux_ltthread.cpp
  ${RT}/shared/src/version_info.cpp
  ${RT}/client/src/volumeeffect.cpp
  ${RT}/client/src/watermark.cpp
  ${RT}/sound/src/wave.cpp
  ${RT}/client/src/sys/win/winclientde_impl.cpp
  ${RT}/client/src/sys/win/winconsole_impl.cpp
  ${RT}/world/src/world_tree.cpp
  ${RT}/kernel/src/sys/linux/linuxperfcountermanager.cpp
)

add_executable(nolf2_engine ${NOLF2_ENGINE_SOURCES})
set_target_properties(nolf2_engine PROPERTIES
  OUTPUT_NAME nolf2_engine
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../build-port"
)

target_include_directories(nolf2_engine PRIVATE
  ${ENG_INC}
  ${CMAKE_CURRENT_SOURCE_DIR}/../compat
  ${CMAKE_CURRENT_SOURCE_DIR}/../shims
  ${RT}/client/src
  ${RT}/client/src/sys/win
  ${SDK}/inc
  ${SDK}/inc/physics
  ${LT}/libs/stdlith
  ${LT}/libs/rezmgr
  ${LT}/libs/lith
  ${RT}/shared/src
  ${RT}/shared/src/sys/win
  ${RT}/kernel/src
  ${RT}/kernel/src/sys/win
  ${RT}/kernel/src/sys/linux
  ${RT}/kernel/mem/src
  ${RT}/world/src
  ${RT}/kernel/io/src
  ${RT}/kernel/net/src
  ${RT}/model/src
  ${RT}/sound/src
  ${RT}/lithtemplate
  ${RT}/physics/src
  ${RT}/info/src
  ${RT}/render_b/src
  ${RT}/ui/src
  ${RT}/controlfilemgr
  ${RT}/server/src
  ${LT}/NOLF2/Shared
  ${CMAKE_CURRENT_SOURCE_DIR}/../cres
  ${SDL2_ROOT}/include
  ${SDL2_ROOT}/include/SDL2
)

target_compile_definitions(nolf2_engine PRIVATE
  DE_LOCAL_SERVERBIND
  DE_CLIENT_COMPILE
  DSNDMGR_NO_MFC
  DIRECTENGINE_COMPILE
  MODEL_SUPPORT_ABC
  USE_ABSTRACT_SOUND_INTERFACES
  STDLITH_ALLOC_OVERRIDE
  NO_PRAGMA_LIBS
  _LINUX
  __LINUX
  _FINAL
  _NOMFC
)

target_compile_options(nolf2_engine PRIVATE
  ${LT_CXX_FLAGS}
  -include ${ENG_INC}/nolf2_engine_port.h
  -Wno-unused-variable
  -Wno-unused-function
  -Wno-unused-but-set-variable
  -Wno-unused-but-set-parameter
  -Wno-sign-compare
  -Wno-parentheses
  -Wno-switch
  -Wno-format
  -Wno-extra
  -Wno-write-strings
  -Wno-deprecated
)

target_link_libraries(nolf2_engine PRIVATE
  Lib_Lith
  Lib_StdLith
  Lib_ZLib
  ltmem
  Lib_RezMgr
  Lib_Info
  Lib_ILTSound
  Lib_UI
  ${SDL2_ROOT}/lib/libSDL2.so
  GL
  freetype
  pthread
  dl
  m
)

if(TARGET nolf2_object)
  target_link_libraries(nolf2_engine PRIVATE
    -Wl,--whole-archive nolf2_object -Wl,--no-whole-archive
  )
endif()
if(TARGET nolf2_cshell)
  target_link_libraries(nolf2_engine PRIVATE
    -Wl,--whole-archive nolf2_cshell -Wl,--no-whole-archive
  )
endif()

set_source_files_properties(
  ${RT}/kernel/src/sys/linux/linuxperfcountermanager.cpp
  PROPERTIES COMPILE_DEFINITIONS NO_PROFILE
)

target_link_options(nolf2_engine PRIVATE
  -pthread
  -rdynamic
  -Wl,--allow-multiple-definition
  "-Wl,-rpath,${SDL2_ROOT}/lib"
)
