#ifndef PORT_MMSYSTEM_H
#define PORT_MMSYSTEM_H

#include "windows.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef WAVE_FORMAT_PCM
#define WAVE_FORMAT_PCM 1
#endif
#ifndef WAVE_MAPPER
#define WAVE_MAPPER ((LONG)-1)
#endif

typedef struct tWAVEFORMAT {
	WORD wFormatTag;
	WORD nChannels;
	DWORD nSamplesPerSec;
	DWORD nAvgBytesPerSec;
	WORD nBlockAlign;
} WAVEFORMAT, *PWAVEFORMAT, *LPWAVEFORMAT, *PTWAVEFORMAT;

typedef struct tWAVEFORMATEX {
	WORD wFormatTag;
	WORD nChannels;
	DWORD nSamplesPerSec;
	DWORD nAvgBytesPerSec;
	WORD nBlockAlign;
	WORD wBitsPerSample;
	WORD cbSize;
} WAVEFORMATEX, *PWAVEFORMATEX, *LPWAVEFORMATEX;
#ifndef _WAVEFORMATEX_
#define _WAVEFORMATEX_
#endif

#ifdef __cplusplus
}
#endif

#endif
