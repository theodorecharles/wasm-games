#ifndef PORT_DSOUND_H
#define PORT_DSOUND_H

#include "windows.h"

#ifndef LPDIRECTSOUND
struct IDirectSound;
struct IDirectSound8;
struct IDirectSoundBuffer;
struct IDirectSoundBuffer8;
struct IDirectSound3DListener8;
struct IDirectSound3DBuffer8;
typedef IDirectSound *LPDIRECTSOUND;
typedef IDirectSound8 *LPDIRECTSOUND8;
typedef IDirectSoundBuffer *LPDIRECTSOUNDBUFFER;
typedef IDirectSoundBuffer8 *LPDIRECTSOUNDBUFFER8;
typedef IDirectSound3DListener8 *LPDIRECTSOUND3DLISTENER8;
typedef IDirectSound3DBuffer8 *LPDIRECTSOUND3DBUFFER8;
#endif

#ifndef DSSCL_PRIORITY
#define DSSCL_PRIORITY 2
#define DSBCAPS_PRIMARYBUFFER 1
#define DSBCAPS_CTRL3D 2
#endif

#endif
