#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <map>
#include <string>
#include <strings.h>
#include <vector>

struct idStr : std::string {
 using std::string::string;
 idStr(const std::string &s):std::string(s){}
 operator const char *() const { return c_str(); }
 int Icmp(const char *s) const { return strcasecmp(c_str(),s); }
};
template<class T> struct List : std::vector<T> {
 int Num() const { return this->size(); }
 void Append(T value) { this->push_back(value); }
};
struct Cvar { bool value=false; bool GetBool() const {return value;} } com_purgeAll,decl_warn_duplicates;
struct Common { template<class... T> void Printf(const char*,T...){} template<class... T> void Warning(const char*,T...){} } commonObject;
Common *common=&commonObject;
struct Src { template<class... T> void Warning(const char*,T...){} };
using declType_t=int;
enum {DS_UNPARSED,DS_DEFAULTED,DS_PARSED};
struct idDeclFile;
struct idDeclLocal {
 idDeclFile *sourceFile=nullptr;
 idDeclLocal *nextInFile=nullptr;
 bool redefinedInReload=false;
 int declState=DS_UNPARSED,parseCount=0,sourceTextOffset=0,sourceTextLength=0,sourceLine=0;
 char *textSource=nullptr;
 void SetTextLocal(const char *s,int n) {textSource=static_cast<char*>(malloc(n));memcpy(textSource,s,n);}
 void ParseLocal() {++parseCount;declState=DS_PARSED;}
};
void Mem_Free(void *p) {free(p);}
struct idDeclFile {
 idStr fileName;
 declType_t defaultType=0;
 idDeclLocal *decls=nullptr;
 idDeclFile()=default;
 idDeclFile(const char *name,declType_t type):fileName(name),defaultType(type){}
 bool Adopt(const idStr&,declType_t);
 void LoadAndParse();
 void Reload(bool) {LoadAndParse();}
};
struct idDeclFolder {idStr folder,extension;declType_t defaultType;};
struct idFileList {
 std::vector<std::string> names;
 int GetNumFiles() const {return names.size();}
 const char *GetFile(int i) const {return names[i].c_str();}
};
std::map<std::string,std::vector<std::string>> files;
struct FileSystem {
 idFileList *ListFiles(const char *folder,const char *extension,bool) {
  auto *result=new idFileList;
  const std::string prefix=std::string(folder)+"/",suffix=extension;
  for(const auto &f:files) if(f.first.rfind(prefix,0)==0 && f.first.size()>=suffix.size() &&
   f.first.substr(f.first.size()-suffix.size())==suffix) result->names.push_back(f.first.substr(prefix.size()));
  return result;
 }
 void FreeFileList(idFileList *list) {delete list;}
} fileSystemObject;
FileSystem *fileSystem=&fileSystemObject;
struct idDeclManagerLocal {
 List<idDeclFolder*> declFolders;
 List<idDeclFile*> loadedFiles;
 idDeclFile implicit;
 std::map<std::pair<int,std::string>,idDeclLocal*> declarations;
 const idDeclFile *GetImplicitDeclFile() const {return &implicit;}
 const char *GetDeclNameFromType(int) {return "sound";}
 idDeclLocal *FindTypeWithoutParsing(int type,const char *name,bool create) {
  auto key=std::make_pair(type,std::string(name));auto it=declarations.find(key);
  if(it!=declarations.end())return it->second;
  if(!create)return nullptr;
  auto *d=new idDeclLocal;d->sourceFile=&implicit;declarations[key]=d;return d;
 }
 void RegisterDeclFolder(const char*,const char*,declType_t);
 void Reload(bool);
 void ReloadFolders();
} declManagerLocal;
void idDeclFile::LoadAndParse() {
 for(auto *d=decls;d;d=d->nextInFile)d->redefinedInReload=false;
 for(const auto &name:files[fileName])Adopt(idStr(name),defaultType);
}

using byte=unsigned char;
constexpr int CF_2D=0;
bool imageAvailable=true;
byte pixel[4]={10,20,30,255};
struct idImage {
 bool defaulted=false,levelLoadReferenced=true,allowDownSize=false;
 int purges=0,loads=0,cubeFiles=CF_2D,filter=0,depth=0,repeat=0,timestamp=0,imageHash=0;
 idStr imgName="early-image";
 void (*generatorFunction)(idImage*)=nullptr;
 void PurgeImage() {++purges;}
 void MakeDefault() {defaulted=true;}
 void GenerateImage(const byte*,int,int,int,bool,int,int) {++loads;}
 void GenerateCubeImage(const byte**,int,int,bool,int) {++loads;}
 void ActuallyLoadImage(bool);
};
void R_LoadImageProgram(const char*,byte **pic,int *width,int *height,int*,int*) {*pic=imageAvailable?pixel:nullptr;*width=*height=1;}
void R_LoadCubeImages(const char*,int,byte **pics,int *width,int*) {for(int i=0;i<6;++i)pics[i]=imageAvailable?pixel:nullptr;*width=1;}
void R_StaticFree(void*){}
int MD4_BlockChecksum(const void*,int){return 123;}
struct idImageManager {bool insideLevelLoad=false;List<idImage*> images;void BeginLevelLoad();};
struct idSoundSample {bool defaultSound=false,levelLoadReferenced=true;int purges=0;void PurgeSoundSample(){++purges;}};
struct Allocator {int calls=0;void FreeEmptyBaseBlocks(){++calls;}} soundCacheAllocator;
struct idSoundCache {bool insideLevelLoad=false;List<idSoundSample*> listCache;void BeginLevelLoad();};

#include "prey-deferred-production.h"

std::vector<std::pair<std::string,bool>> cases;
void check(const char *label,bool passed){cases.emplace_back(label,passed);}
int main() {
#ifdef PREYWASM_CLIENT
 const bool browser=true;
#else
 const bool browser=false;
#endif
 files["sound/menu.sndshd"]={"menu"};
 declManagerLocal.RegisterDeclFolder("sound",".sndshd",1);
 auto *menu=declManagerLocal.FindTypeWithoutParsing(1,"menu",false);
 auto *early=declManagerLocal.FindTypeWithoutParsing(1,"rh_intro1",true);
 early->declState=DS_DEFAULTED;
 files["sound/map_roadhouse.sndshd"]={"rh_intro1","rh_intro2","rh_intro3"};
 files["materials/new.mtr"]={"new-material"};
 declManagerLocal.RegisterDeclFolder("materials",".mtr",2);
 const int folders=declManagerLocal.declFolders.Num();
 if(browser)declManagerLocal.ReloadFolders();else declManagerLocal.Reload(true);
 auto *intro2=declManagerLocal.FindTypeWithoutParsing(1,"rh_intro2",false);
 check("new sound file discovered",browser?intro2!=nullptr:intro2==nullptr);
 check("registered folder list stays unique",declManagerLocal.declFolders.Num()==folders);
 check("existing explicit identity retained",declManagerLocal.FindTypeWithoutParsing(1,"menu",false)==menu);
 check("implicit identity retained",declManagerLocal.FindTypeWithoutParsing(1,"rh_intro1",false)==early);
 check("implicit default adopted and reparsed",browser?(early->sourceFile!=&declManagerLocal.implicit && early->parseCount==1):early->sourceFile==&declManagerLocal.implicit);
 idDeclFile direct("direct.sndshd",1),other("duplicate.sndshd",1);
 auto *implicit=declManagerLocal.FindTypeWithoutParsing(1,"early-direct",true);implicit->declState=DS_DEFAULTED;
 bool adopted=direct.Adopt("early-direct",1);
 check("direct implicit adoption",adopted==browser);
 check("adoption links into owning file",browser?(direct.decls==implicit && implicit->nextInFile==nullptr):direct.decls==nullptr);
 check("explicit cross-file duplicate rejected",!other.Adopt("menu",1) && other.decls==nullptr);
 check("new explicit definition accepted",direct.Adopt("fresh",1));
 auto *fresh=declManagerLocal.FindTypeWithoutParsing(1,"fresh",false);
 check("same-file duplicate rejected",!direct.Adopt("fresh",1));
 fresh->redefinedInReload=false;fresh->declState=DS_PARSED;
 check("existing explicit reload reparses",direct.Adopt("fresh",1) && fresh->parseCount==1);
 check("reload does not cycle file list",fresh->nextInFile!=fresh && (!fresh->nextInFile || fresh->nextInFile->nextInFile==nullptr));

 idImage missing,good,generated;missing.defaulted=true;generated.defaulted=true;
 generated.generatorFunction=[](idImage*){};
 idImageManager images;images.images={};images.images.Append(&missing);images.images.Append(&good);images.images.Append(&generated);
 images.BeginLevelLoad();
 check("fallback image purged for retry",missing.purges==(browser?1:0));
 check("valid and generated images retained",good.purges==0 && generated.purges==0);
 check("image references reset",!missing.levelLoadReferenced && !good.levelLoadReferenced);
 missing.ActuallyLoadImage(false);
 check("successful 2D retry clears default flag",missing.loads==1 && missing.defaulted==!browser);
 missing.defaulted=true;missing.cubeFiles=1;missing.ActuallyLoadImage(false);
 check("successful cube retry clears default flag",missing.loads==2 && missing.defaulted==!browser);
 imageAvailable=false;missing.cubeFiles=CF_2D;missing.ActuallyLoadImage(false);
 check("still missing image remains default",missing.defaulted);
 com_purgeAll.value=true;images.BeginLevelLoad();
 check("purge-all behavior retained",good.purges==1 && generated.purges==0);
 com_purgeAll.value=false;
 idSoundSample fallback,real;fallback.defaultSound=true;
 idSoundCache sound;sound.listCache.Append(nullptr);sound.listCache.Append(&fallback);sound.listCache.Append(&real);
 sound.BeginLevelLoad();
 check("fallback sample purged for retry",fallback.purges==(browser?1:0));
 check("real sample retained",real.purges==0);
 check("sample references reset and allocator maintained",!fallback.levelLoadReferenced && !real.levelLoadReferenced && soundCacheAllocator.calls==1);
 com_purgeAll.value=true;sound.BeginLevelLoad();
 check("sample purge-all behavior retained",real.purges==1);
 std::cout<<"{\"cases\":[";
 for(size_t i=0;i<cases.size();++i)std::cout<<(i?",":"")<<"{\"label\":\""<<cases[i].first<<"\",\"passed\":"<<(cases[i].second?"true":"false")<<"}";
 std::cout<<"]}\n";
}
