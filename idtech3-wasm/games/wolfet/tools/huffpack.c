#include <stdio.h>
#include <string.h>
#include "qcommon.h"

#define NYT HMAX

int main(void)
{
	static byte buf[65536];
	size_t n = fread(buf + 12, 1, sizeof(buf) - 12, stdin);
	memcpy(buf, "\xff\xff\xff\xff" "connect ", 12);
	msg_t msg;
	memset(&msg, 0, sizeof(msg));
	msg.data = buf;
	msg.maxsize = sizeof(buf);
	msg.cursize = (int)(n + 12);
	Huff_Compress(&msg, 12);
	fwrite(msg.data, 1, (size_t)msg.cursize, stdout);
	return 0;
}
