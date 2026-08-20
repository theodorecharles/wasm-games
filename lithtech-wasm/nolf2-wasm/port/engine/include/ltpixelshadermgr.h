#ifndef PORT_LTPIXELSHADERMGR_H
#define PORT_LTPIXELSHADERMGR_H

class ILTStream;
class LTPixelShader;

class LTPixelShaderMgr {
public:
	static LTPixelShaderMgr &GetSingleton() {
		static LTPixelShaderMgr s;
		return s;
	}
	bool AddPixelShader(ILTStream *, const char *, int, bool) { return false; }
	void RemovePixelShader(int) {}
	void RemoveAllPixelShaders() {}
	LTPixelShader *GetPixelShader(int) { return 0; }
};

#endif
