#ifndef PORT_LTEFFECTSHADERMGR_H
#define PORT_LTEFFECTSHADERMGR_H

class LTEffectShaderMgr {
public:
	static LTEffectShaderMgr &GetSingleton() {
		static LTEffectShaderMgr s;
		return s;
	}
};

#endif
