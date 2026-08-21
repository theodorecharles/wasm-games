#ifndef __ILTPERFCOUNTER_H__
#define __ILTPERFCOUNTER_H__

#include "ltmodule.h"

class ILTPerfCounter : public IBase {
public:
	interface_version(ILTPerfCounter, 0);

	virtual uint32 AddCounter(uint32 dwCounterGroup, const char *szCounterName) = 0;
	virtual uint32 GetCounterID(uint32 dwCounterGroup, const char *szCounterName) = 0;
	virtual bool DeleteCounter(uint32 uCounterID) = 0;
	virtual void StartCounter(uint32 uCounterID) = 0;
	virtual void StopCounter(uint32 uCounterID) = 0;
};

#endif
