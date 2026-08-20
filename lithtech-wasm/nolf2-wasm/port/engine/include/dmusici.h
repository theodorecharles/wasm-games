#ifndef __DMUSICI_H__
#define __DMUSICI_H__

/* Stub DirectMusic interfaces — NOLF2 music is optional on the Linux host. */

#ifndef DWORD
typedef unsigned int DWORD;
#endif
#ifndef LONG
typedef int LONG;
#endif
#ifndef HRESULT
typedef int HRESULT;
#endif
#ifndef REFIID
#ifdef __cplusplus
#define REFIID const IID &
#else
#define REFIID const void *
#endif
#endif

#ifndef S_OK
#define S_OK 0
#define E_FAIL 0x80004005
#define E_NOTIMPL 0x80004001
#endif

struct IUnknown {
	virtual HRESULT QueryInterface(REFIID, void **) { return E_NOTIMPL; }
	virtual unsigned long AddRef() { return 1; }
	virtual unsigned long Release() { return 1; }
};

struct IDirectMusic : public IUnknown {};
struct IDirectMusic8 : public IDirectMusic {};
struct IDirectMusicPerformance : public IUnknown {};
struct IDirectMusicPerformance8 : public IDirectMusicPerformance {};
struct IDirectMusicLoader : public IUnknown {};
struct IDirectMusicLoader8 : public IDirectMusicLoader {};
struct IDirectMusicSegment : public IUnknown {};
struct IDirectMusicSegment8 : public IDirectMusicSegment {};
struct IDirectMusicSegmentState : public IUnknown {};
struct IDirectMusicGraph : public IUnknown {};
struct IDirectMusicBuffer : public IUnknown {};
struct IDirectMusicPort : public IUnknown {};
struct IDirectMusicTool : public IUnknown {};
struct IDirectMusicBand : public IUnknown {};

#ifndef DMUS_APATH_SHARED_STEREOPLUSREVERB
#define DMUS_APATH_SHARED_STEREOPLUSREVERB 1
#define DMUS_SEGF_DEFAULT 0
#define DMUS_SEGF_SECONDARY 1
#endif

#endif
