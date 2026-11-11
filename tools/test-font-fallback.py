"""Exercise actual FreeType font selection, rasterization and metrics on Android.

Uses independent temporary processes and font files, never a game Activity.
"""
from pathlib import Path
import argparse
import os
import re
import shlex
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--serial', required=True)
p.add_argument('--before', action='store_true')
args = p.parse_args()
root = Path(__file__).resolve().parent.parent
engine = root / 'xsystem4'
lib = engine / 'subprojects/libsys4'
build = root / 'build/font-fallback-tests'
build.mkdir(parents=True, exist_ok=True)
native = root / 'build/arm64-v8a/xsystem4-prefix/src/xsystem4-build'
stage = root / 'build/arm64-v8a/stage'
source = (engine / 'src/font_freetype.c').read_text('utf8')
if args.before:
    start = source.index('static struct font_ft *ft_font_with_glyph(')
    end = source.index('static bool ft_font_get_glyph(', start)
    source = source[:start] + r'''
static struct font_ft *ft_font_with_glyph(struct font_ft *font, uint32_t code)
{
 if(FT_Get_Char_Index(font->font,code))return font;
 static struct font *fallback; static bool attempted;
 if(!attempted){attempted=true;fallback=ft_font_load(XSYS4_DATA_DIR "/fonts/HanaMinA.ttf");
  if(!fallback)fallback=ft_font_load("fonts/HanaMinA.ttf");}
 struct font_ft *other=(struct font_ft*)fallback;
 return other&&FT_Get_Char_Index(other->font,code)?other:font;
}
''' + source[end:]

source = r'''
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>
#define SDL_MAIN_HANDLED
#define CHECK(x) do{if(!(x)){fprintf(stderr,"FAIL %d: %s\n",__LINE__,#x);_Exit(101);}}while(0)
''' + source + r'''
static unsigned char *texture_pixels;
static int texture_bytes,texture_ink,loads[3],mode;
void *_xcalloc(size_t n,size_t s,const char *f){void *p=calloc(n,s);CHECK(p);return p;}
void *_xmalloc(size_t n,const char *f){void *p=malloc(n);CHECK(p);return p;}
void *_xrealloc(void *p,size_t n,const char *f){p=realloc(p,n);CHECK(p);return p;}
_Noreturn void sys_error(const char *fmt,...){va_list a;va_start(a,fmt);vfprintf(stderr,fmt,a);va_end(a);_Exit(102);}
void sys_warning(const char *fmt,...){va_list a;va_start(a,fmt);vfprintf(stderr,fmt,a);va_end(a);}
void *SDL_LoadFile_RW(SDL_RWops *src,size_t *size,int freesrc){CHECK(0);return NULL;}
void *SDL_LoadFile(const char *path,size_t *size){
 int i=strstr(path,"NotoSansCJK")?0:strstr(path,"NotoSansSymbols2")?1:strstr(path,"HanaMinA")?2:-1;
 if(i>=0)loads[i]++;
 if(path[0]=='/'||(mode==1&&i>=0&&i<2)||(mode==2&&i>=0))return NULL;
 FILE *f=fopen(path,"rb");if(!f)return NULL;
 CHECK(!fseek(f,0,SEEK_END));long n=ftell(f);CHECK(n>0);rewind(f);
 void *data=malloc(n);CHECK(data);CHECK(fread(data,1,n,f)==n);CHECK(!fclose(f));*size=n;return data;
}
void gfx_init_texture_rmap(Texture *t,int w,int h,uint8_t *data){
 texture_bytes=w*h;texture_ink=0;free(texture_pixels);texture_pixels=malloc(texture_bytes);CHECK(texture_pixels);
 memcpy(texture_pixels,data,texture_bytes);
 for(int i=0;i<texture_bytes;i++)texture_ink+=texture_pixels[i]!=0;
 *t=(Texture){.handle=1,.w=w,.h=h};
}
static void name_is(struct font_ft *font,const char *expected){
 const char *name=FT_Get_Postscript_Name(font->font);
 if(!name||!strstr(name,expected))fprintf(stderr,"Expected face %s; actual %s\n",expected,name?name:"(null)");
 CHECK(name&&strstr(name,expected));
}
static void compare_glyph(struct font_ft *primary,uint32_t code,const char *expected){
 struct font_ft *face=ft_font_with_glyph(primary,code);name_is(face,expected);CHECK(FT_Get_Char_Index(face->font,code));
 for(int point=16;point<=32;point+=8){
  struct font_size *size=ft_font_get_size(&primary->super,point);
  for(int weight=0;weight<NR_FONT_WEIGHTS;weight++){
   struct glyph actual={0},direct={0};CHECK(ft_font_get_glyph(size,&actual,code,weight));CHECK(texture_ink>0);
   int bytes=texture_bytes;unsigned char *pixels=malloc(bytes);CHECK(pixels);memcpy(pixels,texture_pixels,bytes);
   struct font_size reference=*size;reference.font=&face->super;
   CHECK(ft_font_get_glyph(&reference,&direct,code,weight));CHECK(bytes==texture_bytes&&!memcmp(pixels,texture_pixels,bytes));free(pixels);
   CHECK(actual.advance==ft_font_size_char(size,code));CHECK(!memcmp(&actual.rect,&direct.rect,sizeof(actual.rect)));
   float advance=ft_font_size_char_kerning(size,code,0x71c3);CHECK(isfinite(advance)&&advance>0);
  }
 }
}
int main(int argc,char **argv){
 CHECK(argc==2);mode=atoi(argv[1]);ft_font_init();
 struct font_ft *primary=(struct font_ft*)ft_font_load("fonts/CEFFontsCJK-Regular.ttf");CHECK(primary);
 CHECK(!loads[0]&&!loads[1]&&!loads[2]);
 CHECK(ft_font_with_glyph(primary,0x71c3)==primary);CHECK(!loads[0]&&!loads[1]&&!loads[2]);
 CHECK(!FT_Get_Char_Index(primary->font,0x25bc));
 if(mode==2){CHECK(ft_font_with_glyph(primary,0x25bc)==primary);CHECK(loads[0]==2&&loads[1]==2&&loads[2]==2);}
 else{
  compare_glyph(primary,0x25bc,mode==1?"HanaMinA":"NotoSansCJKsc");
  if(!mode){CHECK(loads[0]==2&&!loads[1]&&!loads[2]);
   CHECK(!FT_Get_Char_Index(primary->font,0x2316));compare_glyph(primary,0x2316,"NotoSansSymbols2");
   CHECK(loads[0]==2&&loads[1]==2&&!loads[2]);
  }
 }
 compare_glyph(primary,0x71c3,"CEF-Fonts-CJK");compare_glyph(primary,0x41,"CEF-Fonts-CJK");
 int old[3];memcpy(old,loads,sizeof(old));
 for(int i=0;i<10;i++)CHECK(ft_font_with_glyph(primary,0x25bc));CHECK(!memcmp(old,loads,sizeof(old)));
 CHECK(ft_font_with_glyph(primary,0x10ffff)==primary);CHECK(!FT_Get_Char_Index(primary->font,0x10ffff));
 printf("PASS: mode %d; real font selection, three sizes/weights, raster/advance, primary preserved, lazy cache and unavailable fallbacks\n",mode);fflush(stdout);_Exit(0);
}
'''
cfile = build / 'font-fallback-test.c'
cfile.write_text(source, encoding='utf8')
binary = build / 'font-fallback-test'
compiler = root.parent / 'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
include = [engine/'include', lib/'include', native, stage/'include',
           native/'_deps/freetype-build/include', native/'_deps/freetype-src/include',
           native/'_deps/sdl-build/include/SDL2', native/'_deps/sdl-build/include-config-release/SDL2']
command = [str(compiler), '--target=aarch64-linux-android28', '-std=gnu11', '-O1',
           '-DUSE_GLES', '-DXSYS4_DATA_DIR="/missing-data-prefix"',
           '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections']
for directory in include:
    command += ['-I', str(directory)]
command += [str(cfile), str(lib/'src/hashtable.c'), str(native/'_deps/freetype-build/libfreetype.a'),
            str(stage/'lib/libpng.a'), '-lz', '-lm', '-o', str(binary)]
env = {**os.environ, 'TEMP': str(build), 'TMP': str(build)}
subprocess.run(command, check=True, env=env)
adb = [str(root.parent/'android-build/sdk/platform-tools/adb.exe'), '-s', args.serial]
remote = '/data/local/tmp/xsystem4-noto-font-test'
files = ['CEFFontsCJK-Regular.ttf', 'NotoSansCJKsc-Regular.otf', 'NotoSansSymbols2-Regular.ttf', 'HanaMinA.ttf']
try:
    subprocess.run(adb+['shell', 'mkdir -p '+remote+'/fonts'], check=True, env=env)
    for name in files:
        subprocess.run(adb+['push', str(engine/'fonts'/name), remote+'/fonts/'+name], check=True, env=env)
    subprocess.run(adb+['push', str(binary), remote+'/test'], check=True, env=env)
    subprocess.run(adb+['shell', 'chmod 700 '+remote+'/test'], check=True, env=env)
    for mode in range(3):
        subprocess.run(adb+['shell', 'cd '+shlex.quote(remote)+' && ./test '+str(mode)], check=True, env=env)
finally:
    subprocess.run(adb+['shell', 'rm -f '+remote+'/test '+' '.join(remote+'/fonts/'+name for name in files)], check=True, env=env)
    subprocess.run(adb+['shell', 'rmdir '+remote+'/fonts '+remote], check=True, env=env)
