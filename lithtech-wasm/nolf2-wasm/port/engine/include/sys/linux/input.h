#ifndef PORT_ENGINE_LINUX_INPUT_H
#define PORT_ENGINE_LINUX_INPUT_H

#ifndef __LTCODES_H__
#include "ltcodes.h"
#endif
#ifndef __LTBASEDEFS_H__
#include "ltbasedefs.h"
#endif
#ifndef __CONCOMMAND_H__
#include "concommand.h"
#endif

class InputMgr
{
public:
	bool     (*Init)(InputMgr *pMgr, ConsoleState *pState);
	void     (*Term)(InputMgr *pMgr);
	bool     (*IsInitted)(InputMgr *pMgr);
	void     (*ListDevices)(InputMgr *pMgr);
	long     (*PlayJoystickEffect)(InputMgr *pMgr, const char *strEffectName, float x, float y);
	void     (*ReadInput)(InputMgr *pMgr, unsigned char *pActionsOn, float axisOffsets[3]);
	bool     (*FlushInputBuffers)(InputMgr *pMgr);
	LTRESULT (*ClearInput)();
	void     (*AddAction)(InputMgr *pMgr, const char *pActionName, int actionCode);
	bool     (*EnableDevice)(InputMgr *pMgr, const char *pDeviceName);
	bool     (*ClearBindings)(InputMgr *pMgr, const char *pDeviceName, const char *pTriggerName);
	bool     (*AddBinding)(InputMgr *pMgr,
		const char *pDeviceName, const char *pTriggerName, const char *pActionName,
		float rangeLow, float rangeHigh);
	bool     (*ScaleTrigger)(InputMgr *pMgr, const char *pDeviceName, const char *pTriggerName,
		float scale, float fRangeScaleMin, float fRangeScaleMax, float fRangeScalePreCenterOffset);
	DeviceBinding *(*GetDeviceBindings)(uint32 nDevice);
	void     (*FreeDeviceBindings)(DeviceBinding *pBindings);
	bool     (*StartDeviceTrack)(InputMgr *pMgr, uint32 nDevices, uint32 nBufferSize);
	bool     (*TrackDevice)(DeviceInput *pInputAttay, uint32 *pInOut);
	bool     (*EndDeviceTrack)();
	DeviceObject *(*GetDeviceObjects)(uint32 nDeviceFlags);
	void     (*FreeDeviceObjects)(DeviceObject *pList);
	bool     (*GetDeviceName)(uint32 nDeviceType, char *pStrBuffer, uint32 nBufferSize);
	bool     (*GetDeviceObjectName)(char const* pszDeviceName, uint32 nDeviceObjectId,
		char* pszDeviceObjectName, uint32 nDeviceObjectNameLen);
	bool     (*IsDeviceEnabled)(const char *pDeviceName);
	bool     (*ShowDeviceObjects)(const char *sDeviceName);
	bool     (*ShowInputDevices)();
};

LTRESULT input_GetManager(InputMgr **pMgr);
void input_SaveBindings(FILE *fp);

#endif
