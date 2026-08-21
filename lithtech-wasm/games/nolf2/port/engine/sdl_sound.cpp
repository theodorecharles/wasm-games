#include "bdefs.h"
#include "iltsound.h"
#include "mmsystem.h"

#include <SDL.h>
#include <stdio.h>
#include <string.h>
#include <vector>

#ifndef USE_ABSTRACT_SOUND_INTERFACES
#error sdl_sound.cpp requires USE_ABSTRACT_SOUND_INTERFACES
#endif

struct SSample {
	int used;
	int playing;
	int volume;
	int pan;
	int loop;
	sint32 user[8];
	const uint8 *data;
	uint32 len;
};

#define MAX_SAMPLES 64

class CSDLSoundSys : public ILTSoundSys
{
public:
	CSDLSoundSys() { memset(m_samples, 0, sizeof(m_samples)); m_ok = false; }
	virtual bool Init()
	{
		m_ok = true;
		dsi_PrintToConsole("SDL sound sys Init");
		return true;
	}
	virtual void Term() { m_ok = false; }
	virtual void* GetDDInterface(uint) { return NULL; }
	virtual void Lock() {}
	virtual void Unlock() {}
	virtual sint32 Startup() { return LS_OK; }
	virtual void Shutdown() {}
	virtual uint32 MsCount() { return SDL_GetTicks(); }
	virtual sint32 SetPreference(uint32, sint32) { return 0; }
	virtual sint32 GetPreference(uint32) { return 0; }
	virtual void MemFreeLock(void *ptr) { delete [] (char*)ptr; }
	virtual void* MemAllocLock(uint32 uiSize)
	{
		char *p = NULL;
		LT_MEM_TRACK_ALLOC(p = new char[uiSize], LT_MEM_TYPE_SOUND);
		return p;
	}
	virtual char* LastError() { return (char*)""; }
	virtual sint32 WaveOutOpen(LHDIGDRIVER *phDriver, PHWAVEOUT*, sint32, WAVEFORMAT*)
	{
		if (phDriver) *phDriver = (LHDIGDRIVER)(uintptr_t)1;
		return LS_OK;
	}
	virtual void WaveOutClose(LHDIGDRIVER) {}
	virtual void SetDigitalMasterVolume(LHDIGDRIVER, sint32) {}
	virtual sint32 GetDigitalMasterVolume(LHDIGDRIVER) { return 127; }
	virtual sint32 DigitalHandleRelease(LHDIGDRIVER) { return 1; }
	virtual sint32 DigitalHandleReacquire(LHDIGDRIVER) { return 1; }
	virtual void Set3DProviderMinBuffers(uint32) {}
	virtual sint32 Open3DProvider(LHPROVIDER) { return LS_OK; }
	virtual void Close3DProvider(LHPROVIDER) {}
	virtual void Set3DProviderPreference(LHPROVIDER, char*, void*) {}
	virtual void Get3DProviderAttribute(LHPROVIDER, char *sName, void *pVal)
	{
		if (sName && pVal && strstr(sName, "Max"))
			*(sint32*)pVal = 16;
	}
	virtual sint32 Enumerate3DProviders(LHPROENUM *phNext, LHPROVIDER *phDest, char **psName)
	{
		if (!phNext || *phNext != LS_PROENUM_FIRST)
			return 0;
		*phNext = 1;
		if (phDest) *phDest = 1;
		if (psName) *psName = (char*)"SDL Default";
		return 1;
	}
	virtual LH3DPOBJECT Open3DListener(LHPROVIDER) { return (LH3DPOBJECT)(uintptr_t)2; }
	virtual void Close3DListener(LH3DPOBJECT) {}
	virtual void SetListenerDoppler(LH3DPOBJECT, float) {}
	virtual void CommitDeferred() {}
	virtual void Set3DPosition(LH3DPOBJECT, float, float, float) {}
	virtual void Set3DVelocityVector(LH3DPOBJECT, float, float, float) {}
	virtual void Set3DOrientation(LH3DPOBJECT, float, float, float, float, float, float) {}
	virtual void Set3DUserData(LH3DPOBJECT, uint32, sint32) {}
	virtual void Get3DPosition(LH3DPOBJECT, float *x, float *y, float *z)
	{
		if (x) *x = 0; if (y) *y = 0; if (z) *z = 0;
	}
	virtual void Get3DVelocity(LH3DPOBJECT, float *x, float *y, float *z)
	{
		if (x) *x = 0; if (y) *y = 0; if (z) *z = 0;
	}
	virtual void Get3DOrientation(LH3DPOBJECT, float *fx, float *fy, float *fz, float *ux, float *uy, float *uz)
	{
		if (fx) *fx = 0; if (fy) *fy = 0; if (fz) *fz = 1;
		if (ux) *ux = 0; if (uy) *uy = 1; if (uz) *uz = 0;
	}
	virtual sint32 Get3DUserData(LH3DPOBJECT, uint32) { return 0; }
	virtual LH3DSAMPLE Allocate3DSampleHandle(LHPROVIDER) { return AllocSample(); }
	virtual void Release3DSampleHandle(LH3DSAMPLE h) { FreeSample(h); }
	virtual void Stop3DSample(LH3DSAMPLE h) { Stop(h); }
	virtual void Start3DSample(LH3DSAMPLE h) { Start(h); }
	virtual void Resume3DSample(LH3DSAMPLE h) { Start(h); }
	virtual void End3DSample(LH3DSAMPLE h) { Stop(h); }
	virtual sint32 Init3DSampleFromAddress(LH3DSAMPLE, void*, uint32, WAVEFORMATEX*, sint32, LTSOUNDFILTERDATA*) { return 1; }
	virtual sint32 Init3DSampleFromFile(LH3DSAMPLE, void*, sint32, sint32, LTSOUNDFILTERDATA*) { return 1; }
	virtual sint32 Get3DSampleVolume(LH3DSAMPLE) { return 127; }
	virtual void Set3DSampleVolume(LH3DSAMPLE, sint32) {}
	virtual uint32 Get3DSampleStatus(LH3DSAMPLE) { return LS_DONE; }
	virtual void Set3DSampleMsPosition(LHSAMPLE, sint32) {}
	virtual sint32 Set3DSampleInfo(LH3DSAMPLE, LTSOUNDINFO*) { return 1; }
	virtual void Set3DSampleDistances(LH3DSAMPLE, float, float) {}
	virtual void Set3DSamplePreference(LH3DSAMPLE, char*, void*) {}
	virtual void Set3DSampleLoopBlock(LH3DSAMPLE, sint32, sint32, bool) {}
	virtual void Set3DSampleLoop(LH3DSAMPLE, bool) {}
	virtual void Set3DSampleObstruction(LH3DSAMPLE, float) {}
	virtual float Get3DSampleObstruction(LH3DSAMPLE) { return 0; }
	virtual void Set3DSampleOcclusion(LH3DSAMPLE, float) {}
	virtual float Get3DSampleOcclusion(LH3DSAMPLE) { return 0; }

	virtual LHSAMPLE AllocateSampleHandle(LHDIGDRIVER) { return AllocSample(); }
	virtual void ReleaseSampleHandle(LHSAMPLE h) { FreeSample(h); }
	virtual void InitSample(LHSAMPLE) {}
	virtual void StopSample(LHSAMPLE h) { Stop(h); }
	virtual void StartSample(LHSAMPLE h) { Start(h); }
	virtual void ResumeSample(LHSAMPLE h) { Start(h); }
	virtual void EndSample(LHSAMPLE h) { Stop(h); }
	virtual void SetSampleVolume(LHSAMPLE, sint32) {}
	virtual void SetSamplePan(LHSAMPLE, sint32) {}
	virtual sint32 GetSampleVolume(LHSAMPLE) { return 127; }
	virtual sint32 GetSamplePan(LHSAMPLE) { return 64; }
	virtual void SetSampleUserData(LHSAMPLE h, uint32 uiIndex, sint32 siValue)
	{
		SSample *s = Samp(h);
		if (s && uiIndex < 8) s->user[uiIndex] = siValue;
	}
	virtual void GetDirectSoundInfo(LHSAMPLE, PTDIRECTSOUND *ppDS, PTDIRECTSOUNDBUFFER *ppDSB)
	{
		if (ppDS) *ppDS = NULL;
		if (ppDSB) *ppDSB = NULL;
	}
	virtual void SetSampleReverb(LHSAMPLE, float, float, float) {}
	virtual sint32 InitSampleFromAddress(LHSAMPLE h, void *pStart, uint32 uiLen, WAVEFORMATEX*, sint32, LTSOUNDFILTERDATA*)
	{
		SSample *s = Samp(h);
		if (!s) return 0;
		s->data = (const uint8*)pStart;
		s->len = uiLen;
		return 1;
	}
	virtual sint32 InitSampleFromFile(LHSAMPLE, void*, sint32, sint32, LTSOUNDFILTERDATA*) { return 1; }
	virtual void SetSampleLoopBlock(LHSAMPLE, sint32, sint32, bool) {}
	virtual void SetSampleLoop(LHSAMPLE, bool) {}
	virtual void SetSampleMsPosition(LHSAMPLE, sint32) {}
	virtual sint32 GetSampleUserData(LHSAMPLE h, uint32 uiIndex)
	{
		SSample *s = Samp(h);
		return (s && uiIndex < 8) ? s->user[uiIndex] : 0;
	}
	virtual uint32 GetSampleStatus(LHSAMPLE) { return LS_DONE; }

	virtual LHSTREAM OpenStream(char*, uint32, LHDIGDRIVER, char*, sint32) { return (LHSTREAM)(uintptr_t)3; }
	virtual void SetStreamLoop(LHSTREAM, bool) {}
	virtual void SetStreamPlaybackRate(LHSTREAM, sint32) {}
	virtual void SetStreamMsPosition(LHSTREAM, sint32) {}
	virtual void SetStreamUserData(LHSTREAM, uint32, sint32) {}
	virtual sint32 GetStreamUserData(LHSTREAM, uint32) { return 0; }
	virtual void CloseStream(LHSTREAM) {}
	virtual void StartStream(LHSTREAM) {}
	virtual void PauseStream(LHSTREAM, sint32) {}
	virtual void ResetStream(LHSTREAM) {}
	virtual void SetStreamVolume(LHSTREAM, sint32) {}
	virtual void SetStreamPan(LHSTREAM, sint32) {}
	virtual sint32 GetStreamVolume(LHSTREAM) { return 127; }
	virtual sint32 GetStreamPan(LHSTREAM) { return 64; }
	virtual uint32 GetStreamStatus(LHSTREAM) { return LS_DONE; }
	virtual sint32 GetStreamBufferParam(LHSTREAM, uint32) { return 0; }
	virtual void ClearStreamBuffer(LHSTREAM, bool) {}
	virtual sint32 DecompressADPCM(LTSOUNDINFO*, void**, uint32*) { return 0; }
	virtual sint32 DecompressASI(void*, uint32, char*, void**, uint32*, LTLENGTHYCB) { return 0; }
	virtual uint32 GetThreadedSoundTicks() { return 0; }
	virtual bool HasOnBoardMemory() { return false; }

	static CSDLSoundSys m_sys;

private:
	SSample m_samples[MAX_SAMPLES];
	bool m_ok;

	LHSAMPLE AllocSample()
	{
		int i;
		for (i = 0; i < MAX_SAMPLES; ++i) {
			if (!m_samples[i].used) {
				memset(&m_samples[i], 0, sizeof(m_samples[i]));
				m_samples[i].used = 1;
				return (LHSAMPLE)(uintptr_t)(i + 1);
			}
		}
		return NULL;
	}
	void FreeSample(LHSAMPLE h)
	{
		SSample *s = Samp(h);
		if (s) s->used = 0;
	}
	SSample *Samp(LHSAMPLE h)
	{
		uintptr_t i = (uintptr_t)h;
		if (i == 0 || i > MAX_SAMPLES) return NULL;
		return &m_samples[i - 1];
	}
	void Start(LHSAMPLE h)
	{
		SSample *s = Samp(h);
		if (s) s->playing = 1;
	}
	void Stop(LHSAMPLE h)
	{
		SSample *s = Samp(h);
		if (s) s->playing = 0;
	}
};

CSDLSoundSys CSDLSoundSys::m_sys;

class CSDLSoundFactory : public ILTSoundFactory
{
public:
	CSDLSoundFactory() { m_pSoundFactory = this; }
	virtual bool FillSoundSystems(char *pcSoundSysNames, uint uiMaxStringLen)
	{
		if (!pcSoundSysNames || uiMaxStringLen < 16)
			return false;
		strcpy(pcSoundSysNames, "sdl");
		pcSoundSysNames += 4;
		strcpy(pcSoundSysNames, "SDL audio");
		pcSoundSysNames += 10;
		pcSoundSysNames[0] = 0;
		return true;
	}
	virtual ILTSoundSys* MakeSoundSystem(const char*)
	{
		return &CSDLSoundSys::m_sys;
	}
};

static CSDLSoundFactory g_SDLSoundFactory;
