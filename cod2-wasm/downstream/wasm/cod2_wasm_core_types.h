#ifndef COD2_WASM_CORE_TYPES_H
#define COD2_WASM_CORE_TYPES_H

#include <stdint.h>

/*
 * Minimal downstream build seam for the reconstructed native MD4 module.
 *
 * The native header graph also imports renderer and platform declarations.
 * Pulling that graph into this first browser compile would couple this port to
 * OpenCoD2's removed experimental web target. Keep the ABI required by md4.c
 * explicit while the broader native/platform boundary is reconstructed.
 */
typedef uint32_t UINT4;

typedef struct MD4_CTX {
    UINT4 state[4];
    UINT4 count[2];
    unsigned char buffer[64];
} MD4_CTX;

#endif
