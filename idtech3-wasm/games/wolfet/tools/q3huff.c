#include "q3huff_stub.h"
#include <stdio.h>

int main(void)
{
	static byte buf[65536];
	size_t n = fread(buf, 1, sizeof(buf), stdin);
	msg_t m;

	if (n < 12)
	{
		return 1;
	}
	m.data    = buf;
	m.cursize = (int)n;
	m.maxsize = (int)sizeof(buf);
	Huff_Compress(&m, 12);
	if (fwrite(buf, 1, (size_t)m.cursize, stdout) != (size_t)m.cursize)
	{
		return 1;
	}
	return 0;
}
