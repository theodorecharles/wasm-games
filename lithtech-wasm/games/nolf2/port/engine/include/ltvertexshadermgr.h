#ifndef PORT_LTVERTEXSHADERMGR_H
#define PORT_LTVERTEXSHADERMGR_H

class ILTStream;
class LTVertexShader;
struct _D3DVERTEXELEMENT9;
typedef _D3DVERTEXELEMENT9 D3DVERTEXELEMENT9;

class LTVertexShaderMgr {
public:
	static LTVertexShaderMgr &GetSingleton() {
		static LTVertexShaderMgr s;
		return s;
	}
	bool AddVertexShader(ILTStream *, const char *, int, D3DVERTEXELEMENT9 *, int, bool) { return false; }
	void RemoveVertexShader(int) {}
	void RemoveAllVertexShaders() {}
	LTVertexShader *GetVertexShader(int) { return 0; }
};

#endif
