CONFIG ?= config.default
-include $(CONFIG)


BINARY    ?= wolf3d
PREFIX    ?= /usr/local
MANPREFIX ?= $(PREFIX)

WEB ?= 0
WEB_VARIANT ?= wolf3d

ifeq ($(WEB),1)
    CFLAGS += -DWOLF4SDL_WEB
    ifeq ($(WEB_VARIANT),spear)
        CFLAGS += -DSPEAR
    else ifneq ($(WEB_VARIANT),wolf3d)
        $(error Unsupported WEB_VARIANT '$(WEB_VARIANT)'; expected wolf3d or spear)
    endif
    CFLAGS += -pthread
    CXXFLAGS += -Wno-c++11-narrowing
    CFLAGS_SDL ?= -s USE_SDL=1
    LDFLAGS_SDL ?= -s USE_SDL=1
    LDFLAGS += -s ALLOW_MEMORY_GROWTH=1
    LDFLAGS += -pthread
    LDFLAGS += -s PROXY_TO_PTHREAD=1
    LDFLAGS += -s PTHREAD_POOL_SIZE=1
    LDFLAGS += -s FORCE_FILESYSTEM=1
    LDFLAGS += -lidbfs.js
    LDFLAGS += -s INVOKE_RUN=0
    LDFLAGS += -s EXIT_RUNTIME=0
    LDFLAGS += -s EXPORTED_FUNCTIONS=_main,_WolfWasm_BrowserRuntimeState,_WolfWasm_BrowserCaptureIntent,_WolfWasm_BrowserControlsMask,_WolfWasm_BrowserSetInputCaptured,_WolfWasm_BrowserOpenMenu,_WolfWasm_BrowserControllerKey,_WolfWasm_BrowserControllerMouse,_WolfWasm_BrowserControllerButtons,_WolfWasm_BrowserPreparedDigiSounds,_WolfWasm_BrowserDigiStarts,_WolfWasm_BrowserActiveDigiChannels
    LDFLAGS += -s EXPORTED_RUNTIME_METHODS=FS,callMain
endif

INSTALL         ?= install
INSTALL_PROGRAM ?= $(INSTALL) -m 555 -s
INSTALL_MAN     ?= $(INSTALL) -m 444
INSTALL_DATA    ?= $(INSTALL) -m 444


SDL_CONFIG  ?= sdl-config
CFLAGS_SDL  ?= $(shell $(SDL_CONFIG) --cflags)
LDFLAGS_SDL ?= $(shell $(SDL_CONFIG) --libs)


CFLAGS += $(CFLAGS_SDL)

#CFLAGS += -Wall
#CFLAGS += -W
CFLAGS += -Wpointer-arith
CFLAGS += -Wreturn-type
CFLAGS += -Wwrite-strings
CFLAGS += -Wcast-align

ifdef GPL
    CFLAGS += -DUSE_GPL
endif


CCFLAGS += $(CFLAGS)
CCFLAGS += -std=gnu99
CCFLAGS += -Werror-implicit-function-declaration
CCFLAGS += -Wimplicit-int
CCFLAGS += -Wsequence-point

CXXFLAGS += $(CFLAGS)

LDFLAGS += $(LDFLAGS_SDL)
ifeq ($(WEB),0)
LDFLAGS += -lSDL_mixer
endif
ifneq (,$(findstring MINGW,$(shell uname -s)))
LDFLAGS += -static-libgcc
endif

SRCS :=
ifndef GPL
    SRCS += mame/fmopl.cpp
else
    SRCS += dosbox/dbopl.cpp
endif
SRCS += id_ca.cpp
SRCS += id_in.cpp
SRCS += id_pm.cpp
SRCS += id_sd.cpp
SRCS += id_us_1.cpp
SRCS += id_vh.cpp
SRCS += id_vl.cpp
SRCS += signon.cpp
SRCS += wl_act1.cpp
SRCS += wl_act2.cpp
SRCS += wl_agent.cpp
SRCS += wl_atmos.cpp
SRCS += wl_cloudsky.cpp
SRCS += wl_debug.cpp
SRCS += wl_draw.cpp
SRCS += wl_floorceiling.cpp
SRCS += wl_game.cpp
SRCS += wl_inter.cpp
SRCS += wl_main.cpp
SRCS += wl_menu.cpp
SRCS += wl_parallax.cpp
SRCS += wl_play.cpp
SRCS += wl_state.cpp
SRCS += wl_text.cpp

DEPS = $(filter %.d, $(SRCS:.c=.d) $(SRCS:.cpp=.d))
OBJS = $(filter %.o, $(SRCS:.c=.o) $(SRCS:.cpp=.o))

.SUFFIXES:
.SUFFIXES: .c .cpp .d .o

Q ?= @

all: $(BINARY)

ifndef NO_DEPS
depend: $(DEPS)

ifeq ($(findstring $(MAKECMDGOALS), clean depend Data),)
-include $(DEPS)
endif
endif

$(BINARY): $(OBJS)
	@echo '===> LD $@'
	$(Q)$(CXX) $(CFLAGS) $(OBJS) $(LDFLAGS) -o $@

.c.o:
	@echo '===> CC $<'
	$(Q)$(CC) $(CCFLAGS) -c $< -o $@

.cpp.o:
	@echo '===> CXX $<'
	$(Q)$(CXX) $(CXXFLAGS) -c $< -o $@

.c.d:
	@echo '===> DEP $<'
	$(Q)$(CC) $(CCFLAGS) -MM $< | sed 's#^$(@F:%.d=%.o):#$@ $(@:%.d=%.o):#' > $@

.cpp.d:
	@echo '===> DEP $<'
	$(Q)$(CXX) $(CXXFLAGS) -MM $< | sed 's#^$(@F:%.d=%.o):#$@ $(@:%.d=%.o):#' > $@

clean distclean:
	@echo '===> CLEAN'
	$(Q)rm -fr $(DEPS) $(OBJS) $(BINARY) $(BINARY).exe

install: $(BINARY)
	@echo '===> INSTALL'
	$(Q)$(INSTALL) -d $(PREFIX)/bin
	$(Q)$(INSTALL_PROGRAM) $(BINARY) $(PREFIX)/bin
