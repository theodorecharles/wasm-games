#include <stdio.h>
#include <string.h>

unsigned int Com_BlockChecksum(const void *buffer, int length);
unsigned int Com_BlockChecksumKey(void *buffer, int length, int key);

void Com_Memcpy(void *dest, const void *src, int count)
{
    memcpy(dest, src, (size_t)count);
}

void Com_Memset(void *dest, int value, int count)
{
    memset(dest, value, (size_t)count);
}

int main(void)
{
    static const char sample[] = "OpenCoD2 reconstructed native core";
    static const unsigned int expected_checksum = 0x9028dc2cU;
    static const unsigned int expected_keyed = 0x4cdcd263U;
    unsigned int checksum = Com_BlockChecksum(sample, (int)(sizeof(sample) - 1));
    unsigned int keyed = Com_BlockChecksumKey(
        (void *)sample,
        (int)(sizeof(sample) - 1),
        0x434f4432);

    puts("[cod2-wasm] downstream Emscripten core probe started");
    printf("[cod2-wasm] native MD4 block checksum: %08x\n", checksum);
    printf("[cod2-wasm] native keyed checksum: %08x\n", keyed);

    if (checksum != expected_checksum || keyed != expected_keyed) {
        fputs("[cod2-wasm] ERROR: deterministic native-core check failed\n", stderr);
        return 1;
    }

    puts("[cod2-wasm] probe complete; engine unavailable; status is Still in development");
    return 0;
}
