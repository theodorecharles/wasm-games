#ifndef INCLUDE_QCOMMON_H
#define INCLUDE_QCOMMON_H
#include "q_shared.h"

typedef struct
{
	qboolean allowoverflow;
	qboolean overflowed;
	qboolean oob;
	byte *data;
	int maxsize;
	int cursize;
	int uncompsize;
	int readcount;
	int bit;
	int strip;
} msg_t;

#define HMAX 256
typedef struct nodetype
{
	struct nodetype *left, *right, *parent;
	struct nodetype *next, *prev;
	struct nodetype **head;
	int weight;
	int symbol;
} node_t;

typedef struct
{
	int blocNode;
	int blocPtrs;
	node_t *tree;
	node_t *lhead;
	node_t *ltail;
	node_t *loc[HMAX + 1];
	node_t **freelist;
	node_t nodeList[768];
	node_t *nodePtrs[768];
} huff_t;

void Huff_Compress(msg_t *mbuf, int offset);
void Huff_addRef(huff_t *huff, byte ch);
void Huff_transmit(huff_t *huff, int ch, byte *fout, int maxoffset);
int Huff_Receive(node_t *node, int *ch, byte *fin);

int oldsize;
#endif
