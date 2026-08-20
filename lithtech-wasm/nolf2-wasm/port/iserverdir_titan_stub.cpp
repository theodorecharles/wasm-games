#include "stdafx.h"
#include "iserverdir.h"
#include "iserverdir_titan.h"

class CServerDirStub : public IServerDirectory
{
public:
	CServerDirStub()
		: m_eStatus(eStatus_Waiting)
		, m_eLastRequest(eRequest_Nothing)
		, m_eLastResult(eRequestResult_Success)
		, m_bLocalPeer(true)
	{
	}

	virtual bool QueueRequest(ERequest) { return true; }
	virtual bool QueueRequestList(const TRequestList &) { return true; }
	virtual TRequestList GetWaitingRequestList() const { return TRequestList(); }
	virtual bool ClearRequestList() { return true; }
	virtual ERequestResult ProcessRequest(ERequest eNewRequest, uint32)
	{
		m_eLastRequest = eNewRequest;
		m_eLastResult = eRequestResult_Success;
		return eRequestResult_Success;
	}

	virtual bool PauseRequestList() { m_eStatus = eStatus_Paused; return true; }
	virtual bool ProcessRequestList() { m_eStatus = eStatus_Waiting; return true; }

	virtual ERequestResult BlockOnActiveRequest(uint32) { return eRequestResult_Success; }
	virtual ERequestResult BlockOnRequest(ERequest, uint32) { return eRequestResult_Success; }
	virtual ERequestResult BlockOnRequestList(const TRequestList &, uint32) { return eRequestResult_Success; }
	virtual ERequestResult BlockOnProcessing(uint32) { return eRequestResult_Success; }

	virtual bool IsRequestPending(ERequest) const { return false; }

	virtual ERequest GetLastSuccessfulRequest() const { return m_eLastRequest; }
	virtual ERequest GetLastErrorRequest() const { return eRequest_Nothing; }
	virtual ERequest GetActiveRequest() const { return eRequest_Nothing; }
	virtual ERequest GetLastRequest() const { return m_eLastRequest; }
	virtual ERequestResult GetLastRequestResult() const { return m_eLastResult; }
	virtual const char *GetLastRequestResultString() const { return ""; }

	virtual EStatus GetCurStatus() const { return m_eStatus; }
	virtual const char *GetCurStatusString() const { return "idle"; }

	virtual void SetStartupInfo(ILTMessage_Read &) {}
	virtual void GetStartupInfo(ILTMessage_Write &) {}

	virtual void SetGameName(const char *pName) { if (pName) m_sGameName = pName; }
	virtual const char *GetGameName() const { return m_sGameName.c_str(); }

	virtual bool SetCDKey(const char *pKey)
	{
		if (pKey) m_sCDKey = pKey;
		return true;
	}
	virtual bool GetCDKey(std::string *pKey)
	{
		if (pKey) *pKey = m_sCDKey;
		return true;
	}
	virtual bool IsCDKeyValid() const { return true; }

	virtual void SetVersion(const char *pVersion) { if (pVersion) m_sVersion = pVersion; }
	virtual void SetRegion(const char *pRegion) { if (pRegion) m_sRegion = pRegion; }
	virtual bool IsVersionValid() const { return true; }
	virtual bool IsVersionNewest() const { return true; }
	virtual bool IsPatchAvailable() const { return false; }

	virtual bool IsMOTDNew(EMOTD) const { return false; }
	virtual char const *GetMOTD(EMOTD) const { return ""; }

	virtual bool SetActivePeer(const char *pAddr)
	{
		m_bLocalPeer = (pAddr == 0);
		m_sPeer = pAddr ? pAddr : "";
		return true;
	}
	virtual bool GetActivePeer(std::string *pAddr, bool *pLocal) const
	{
		if (pAddr) *pAddr = m_sPeer;
		if (pLocal) *pLocal = m_bLocalPeer;
		return true;
	}
	virtual bool RemoveActivePeer()
	{
		m_bLocalPeer = true;
		m_sPeer.clear();
		return false;
	}

	virtual bool SetActivePeerInfo(EPeerInfo, ILTMessage_Read &) { return true; }
	virtual bool HasActivePeerInfo(EPeerInfo) const { return true; }
	virtual bool GetActivePeerInfo(EPeerInfo, ILTMessage_Write *) const { return false; }

	virtual TPeerList GetPeerList() const { return TPeerList(); }
	virtual void ClearPeerList() {}

	virtual bool HandleNetMessage(ILTMessage_Read &, const char *, uint16) { return false; }
	virtual bool SetNetHeader(ILTMessage_Read &) { return true; }

private:
	EStatus m_eStatus;
	ERequest m_eLastRequest;
	ERequestResult m_eLastResult;
	std::string m_sGameName;
	std::string m_sCDKey;
	std::string m_sVersion;
	std::string m_sRegion;
	std::string m_sPeer;
	bool m_bLocalPeer;
};

IServerDirectory *Factory_Create_IServerDirectory_Titan(bool, ILTCSBase &, HMODULE)
{
	return new CServerDirStub();
}
