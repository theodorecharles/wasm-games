#ifndef Q3HUFF_STUB_H
#define Q3HUFF_STUB_H
#include <stdint.h>
#include <string.h>
typedef uint8_t byte;
#define Com_Memcpy memcpy
#define Com_Memset memset
typedef struct {
	byte *data;
	int cursize;
	int maxsize;
} msg_t;
#define HMAX 256
#define NYT HMAX
#define INTERNAL_NODE (HMAX + 1)
typedef struct nodetype {
	struct nodetype *left, *right, *parent;
	struct nodetype *next, *prev;
	struct nodetype **head;
	int weight;
	int symbol;
} node_t;
typedef struct {
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
typedef struct {
	huff_t compressor;
	huff_t decompressor;
} huffman_t;
void Huff_Compress(msg_t *mbuf, int offset);
void Huff_Decompress(msg_t *mbuf, int offset);
void Huff_addRef(huff_t *huff, byte ch);
int Huff_Receive(node_t *node, int *ch, byte *fin);
void Huff_transmit(huff_t *huff, int ch, byte *fout, int maxoffset);
void Huff_offsetReceive(node_t *node, int *ch, byte *fin, int *offset, int maxoffset);
void Huff_offsetTransmit(huff_t *huff, int ch, byte *fout, int *offset, int maxoffset);
void Huff_putBit(int bit, byte *fout, int *offset);
int Huff_getBit(byte *fin, int *offset);
#endif
