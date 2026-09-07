#include <cstdio>
#include <stdexcept>
#include <GLES2/gl2.h>

struct Common {
    void Error(const char *, int) { throw std::runtime_error("unsupported image format"); }
} commonInstance;
Common *common=&commonInstance;
enum { TT_2D, TT_CUBIC };
struct idImage {
    static constexpr int TEXTURE_NOT_LOADED=-1;
    int texnum=1, type=TT_2D, uploadWidth=64, uploadHeight=64, internalFormat=GL_RGBA;
    int BitsForInternalFormat(int) const;
    int StorageSize() const;
};
#include "d3-image-accounting-production.h"

void result(const char *label,int format,int expected,int actual,bool threw,bool expectedThrow=false) {
    std::printf("{\"label\":\"%s\",\"format\":%d,\"expected\":%d,\"actual\":%d,\"threw\":%s,\"passed\":%s}\n",
        label,format,expected,actual,threw?"true":"false",(threw==expectedThrow && (threw || actual==expected))?"true":"false");
}
int main() {
    struct Format {int format,bits;};
    const Format formats[]={{1,32},{2,32},{3,32},{4,32},{GL_RGBA,32},{GL_RGBA4,16},{GL_RGB5_A1,16}};
    idImage image;
    for(const auto &f:formats) {
        int actual=-1; bool threw=false;
        try {actual=image.BitsForInternalFormat(f.format);}catch(const std::runtime_error &){threw=true;}
        result("bits",f.format,f.bits,actual,threw);
        image.internalFormat=f.format;
        for(const int type:{TT_2D,TT_CUBIC}) {
            image.type=type;actual=-1;threw=false;
            try {actual=image.StorageSize();}catch(const std::runtime_error &){threw=true;}
            const int expected=type==TT_2D ? (f.bits==32 ? 21845 : 10922) : (f.bits==32 ? 131072 : 65536);
            result(type==TT_2D?"2d-64x64":"cube-64x64",f.format,expected,actual,threw);
        }
    }
    image.internalFormat=0;
    int actual=-1;bool threw=false;
    try {actual=image.BitsForInternalFormat(0);}catch(const std::runtime_error &){threw=true;}
    result("invalid-format-still-rejected",0,0,actual,threw,true);
    image.texnum=idImage::TEXTURE_NOT_LOADED;actual=-1;threw=false;
    try {actual=image.StorageSize();}catch(const std::runtime_error &){threw=true;}
    result("unloaded-invalid-format",0,0,actual,threw);
}
