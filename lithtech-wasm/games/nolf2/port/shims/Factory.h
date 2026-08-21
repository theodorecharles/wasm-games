// Linux-safe Factory.h: MSVC empty token-paste (##fact##) is invalid on GCC.
#ifndef __FACTORY_H__
#define __FACTORY_H__

#define FACTORY_NEW(fact)\
	CFactory<fact>::Create();

#define FACTORY_DELETE(fact)\
	fact->Destroy();

#define DEFINE_FACTORY_CLASS(fact)\
	public CFactory<fact>

#define	DEFINE_ABSTRACT_FACTORY_METHODS(fact) \
	public:\
		virtual void Constructor();\
		virtual void Destructor();\
		virtual void Destroy() {}\
	private:

#define	DEFINE_FACTORY_METHODS(fact) \
	public:\
	virtual void Constructor();\
	virtual void Destructor();\
	virtual void Destroy() { CFactory<fact>::Destroy((fact*)this); }\
	private:

#define IMPLEMENT_FACTORY(fact, size)\
	CFactory<fact>::CCleaner CFactory<fact>::s_Cleaner;\
	int CFactory<fact>::s_cTYPE;\
	int CFactory<fact>::s_iCursor;\
	fact** CFactory<fact>::s_aPTYPE = CFactory<fact>::Initialize(size);

template<class TYPE> class CFactory
{
	typedef TYPE* PTYPE;

	public :

		static inline TYPE* Create();

		virtual void Constructor() = 0;
		virtual void Destructor() = 0;

		static void Destroy(TYPE* pTYPE);

	private :

		inline int GetFactoryIndex() { return m_iPTYPE; }
		inline void SetFactoryIndex(int iPTYPE) { m_iPTYPE = iPTYPE; }

		static inline bool Resize(int cTYPE);
		static inline PTYPE* Initialize(int cTYPE);
		static inline void AssertValid();

	private :

		class CCleaner
		{
			public :

				inline ~CCleaner()
				{
					if ( m_aPTYPE )
					{
						for ( int iPTYPE = 0 ; iPTYPE < m_cTYPE ; iPTYPE++ )
						{
							debug_delete(m_aPTYPE[iPTYPE]);
							m_aPTYPE[iPTYPE] = NULL;
						}

						debug_deletea(m_aPTYPE);
						m_aPTYPE = NULL;
						m_cTYPE = 0;
					}
				}

				PTYPE*	m_aPTYPE;
				int		m_cTYPE;
		};

	private :

		static PTYPE*	s_aPTYPE;
		static int		s_cTYPE;
		static int		s_iCursor;
		static CCleaner	s_Cleaner;
		int				m_iPTYPE;
};

template<class TYPE>
TYPE* CFactory<TYPE>::Create()
{
	if ( 0 == s_cTYPE )
	{
		if ( !Resize(1) )
		{
			return NULL;
		}
	}
	else if ( s_iCursor >= s_cTYPE )
	{
		if ( !Resize(s_cTYPE*2) )
		{
			return NULL;
		}
	}

	((CFactory<TYPE>*)s_aPTYPE[s_iCursor])->Constructor();

#ifdef _DEBUG
	AssertValid();
#endif

	return s_aPTYPE[s_iCursor++];
}

template<class TYPE>
void CFactory<TYPE>::Destroy(TYPE* pTYPE)
{
	if ( !s_aPTYPE ) return;

	int iPTYPE = ((CFactory<TYPE>*)pTYPE)->GetFactoryIndex();

	_ASSERT(s_iCursor > 0);
	_ASSERT(iPTYPE >= 0 && iPTYPE <= s_cTYPE);

	TYPE* pTemp = s_aPTYPE[--s_iCursor];
	s_aPTYPE[s_iCursor] = s_aPTYPE[iPTYPE];
	((CFactory<TYPE>*)s_aPTYPE[s_iCursor])->SetFactoryIndex(s_iCursor);
	s_aPTYPE[iPTYPE] = pTemp;
	((CFactory<TYPE>*)s_aPTYPE[iPTYPE])->SetFactoryIndex(iPTYPE);

	((CFactory<TYPE>*)pTYPE)->Destructor();

#ifdef _DEBUG
	AssertValid();
#endif

	return;
}

template<class TYPE>
TYPE** CFactory<TYPE>::Initialize(int cTYPE)
{
	typedef TYPE* PTYPE;

	_ASSERT(!s_aPTYPE);
	if ( s_aPTYPE ) return s_aPTYPE;

	PTYPE* aPTYPE;

	if ( cTYPE > 0 )
	{
		aPTYPE = debug_newa(PTYPE, cTYPE);

		for ( int iPTYPE = 0 ; iPTYPE < cTYPE ; iPTYPE++ )
		{
			aPTYPE[iPTYPE] = debug_new(TYPE);
			((CFactory<TYPE>*)aPTYPE[iPTYPE])->SetFactoryIndex(iPTYPE);
		}
	}
	else
	{
		aPTYPE = NULL;
		cTYPE = 0;
	}

	s_Cleaner.m_aPTYPE = aPTYPE;
	s_Cleaner.m_cTYPE = cTYPE;

	s_aPTYPE = aPTYPE;
	s_cTYPE = cTYPE;
	s_iCursor = 0;

	return aPTYPE;
}

template<class TYPE>
bool CFactory<TYPE>::Resize(int cTYPE)
{
	if ( cTYPE < s_iCursor ) return false;

	if ( cTYPE == s_cTYPE ) return true;

	typedef TYPE* PTYPE;

	PTYPE* aPTYPE = debug_newa(PTYPE, cTYPE);

	if ( cTYPE > s_cTYPE )
	{
        int iPTYPE;
        for ( iPTYPE = 0 ; iPTYPE < s_cTYPE ; iPTYPE++ )
		{
			aPTYPE[iPTYPE] = s_aPTYPE[iPTYPE];
			((CFactory<TYPE>*)aPTYPE[iPTYPE])->SetFactoryIndex(iPTYPE);
		}

		for ( iPTYPE = s_cTYPE ; iPTYPE < cTYPE ; iPTYPE++ )
		{
			aPTYPE[iPTYPE] = debug_new(TYPE);
			((CFactory<TYPE>*)aPTYPE[iPTYPE])->SetFactoryIndex(iPTYPE);
		}
	}
	else
	{
        int iPTYPE;
        for ( iPTYPE = 0 ; iPTYPE < cTYPE ; iPTYPE++ )
		{
			aPTYPE[iPTYPE] = s_aPTYPE[iPTYPE];
			((CFactory<TYPE>*)aPTYPE[iPTYPE])->SetFactoryIndex(iPTYPE);
		}

		for ( iPTYPE = s_cTYPE ; iPTYPE < cTYPE ; iPTYPE++ )
		{
			debug_delete(aPTYPE[iPTYPE]);
			aPTYPE[iPTYPE] = NULL;
		}
	}

	debug_deletea(s_aPTYPE);

	s_Cleaner.m_aPTYPE = aPTYPE;
	s_Cleaner.m_cTYPE = cTYPE;

	s_aPTYPE = aPTYPE;
	s_cTYPE = cTYPE;

	return true;
}

template<class TYPE>
void CFactory<TYPE>::AssertValid()
{
	for ( int iPTYPE = 0 ; iPTYPE < s_cTYPE ; iPTYPE++ )
	{
		_ASSERT(((CFactory<TYPE>*)s_aPTYPE[iPTYPE])->GetFactoryIndex() == iPTYPE);
	}
}

#endif
