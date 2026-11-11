"""Exercise R8's multi-line help through the actual string and drawing code.

The standalone Android process uses a glyph sink; it never starts the game.
--ain optionally uses the installed translated script's exact help strings.
"""
from pathlib import Path
import argparse
import json
import os
import re
import struct
import subprocess
import zlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True)
parser.add_argument('--ain', type=Path)
parser.add_argument('--text-source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
engine = root / 'xsystem4'
lib = engine / 'subprojects/libsys4'
build = root / 'build/rance89-tests'
build.mkdir(parents=True, exist_ok=True)
text = (args.text_source or engine/'src/text.c').read_text('utf8')


def function(name):
    m = re.search(r'^[^\n;{}]*\b'+name+r'\([^;{}]*\)\s*\{', text, re.M)
    assert m, name
    end = text.index('{', m.start()); depth = 0
    while True:
        depth += (text[end] == '{') - (text[end] == '}'); end += 1
        if not depth:
            return text[m.start():end]+'\n'


lines = ['　与游戏画面的比例不一致', '但是，全屏时保持', '画面的比例。',
         '使用这个机能需要显卡', '正常支持Direct3D。']
lines = [line.encode('gbk') for line in lines]
separator, paragraph = b'\n\n', b'\n\n\n'
if args.ain:
    data = args.ain.read_bytes()
    if data[:4] == b'AI2\0':
        data = zlib.decompress(data[16:])
    off = data.index(b'STR0')+4
    n = struct.unpack_from('<I', data, off)[0]; off += 4
    strings = []
    for _ in range(n):
        end = data.index(0, off); strings.append(data[off:end]); off = end+1
    assert b'CASMultiLineTextSprite@GetTextList' in data and n > 257
    separator, paragraph = strings[10], strings[252]
    assert separator == b'\n\n' and paragraph == b'\n\n\n'
    lines = strings[253:258]
    print('Using actual R8 AIN settings strings 10,252,253..257', flush=True)
help_text = separator.join(lines[:3])+paragraph+separator.join(lines[3:])
source = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>
#include "system4.h"
#include "system4/string.h"
#include "system4/utfsjis.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %d: %s\n",__LINE__,#x);exit(1); } } while(0)
#define SYSTEM4_GFX_CORE_H
typedef struct { unsigned char r,g,b,a; } SDL_Color;
typedef struct { int x,y,w,h; } Rectangle;
typedef struct { unsigned handle; int w,h; } Texture;
#include "gfx/font.h"
void *_xmalloc(size_t n,const char *f){void *p=malloc(n);CHECK(p);return p;}
void *_xcalloc(size_t n,size_t z,const char *f){void *p=calloc(n,z);CHECK(p);return p;}
void *_xrealloc(void *p,size_t n,const char *f){p=realloc(p,n);CHECK(p);return p;}
char *_xstrdup(const char *s,const char *f){return strdup(s);}
_Noreturn void sys_error(const char *fmt,...){va_list ap;va_start(ap,fmt);vfprintf(stderr,fmt,ap);va_end(ap);exit(1);}
void sys_warning(const char *fmt,...){va_list ap;va_start(ap,fmt);vfprintf(stderr,fmt,ap);va_end(ap);}
bool gfx_text_advance_edges=false,game_rance02_mg=false,game_rance6_mg=false;
static struct { float text_x_scale; } config={1.f};
static unsigned glyph_count,draw_count,measure_count;
static float first_x;
static struct font font={.charmap=CHARMAP_UNICODE};
static struct font_size font_size={.size=20,.font=&font};
static struct font_size *text_style_font_size(struct text_style *ts){return &font_size;}
static float font_size_char(struct font_size *size,uint32_t code){
 CHECK(code!='\n' && code!='\r');measure_count++;return 10.f;
}
static struct glyph *font_get_glyph(struct font_size *size,uint32_t code,enum font_weight weight){
 CHECK(code!='\n' && code!='\r');glyph_count++;static struct glyph g={.advance=10};return &g;
}
static void record_draw(float x){if(!draw_count)first_x=x;draw_count++;}
static void gfx_draw_glyph(Texture *d,float x,int y,Texture *s,SDL_Color c,float scale,float edge,bool blend){record_draw(x);}
static void gfx_draw_glyph_alpha_blend(Texture *d,float x,int y,Texture *s,SDL_Color c,float scale,float edge){record_draw(x);}
static void gfx_draw_glyph_to_pmap(Texture *d,float x,int y,Texture *s,Rectangle r,SDL_Color c,float scale){record_draw(x);}
static void gfx_draw_glyph_to_amap(Texture *d,float x,int y,Texture *s,Rectangle r,float scale){record_draw(x);}
'''
for name in ['char_to_code', 'is_line_break', 'gfx_size_char_unstyled', 'gfx_size_char', 'gfx_size_text', '_gfx_render_text']:
    source += function(name)


def literal(data):
    return '"'+''.join('\\x%02x' % b for b in data)+'"'


source += 'static const char help_text[]='+literal(help_text)+';\n'
source += 'static const char *expected[]={'+','.join(literal(b) for b in lines[:3]+[b'']+lines[3:])+'};\n'
source += r'''
static void check_line(struct string *line,int number){
 // Same line separator and +1 consumption as CASMultiLineTextSprite@GetTextList.
 const char *visible=line->text;while(*visible=='\n' || *visible=='\r')visible++;
 CHECK(!strcmp(visible,expected[number]));
 int n=sjis_count_char(visible);struct text_style ts={.scale_x=1.f};
 measure_count=0;CHECK(fabsf(gfx_size_text(&ts,line->text)-n*10.f)<.001f && measure_count==n);
 struct text_render_metrics tm={.x=17,.y=9,.font_size=&font_size,.scale_x=1,.space_scale_x=1};
 Texture dst={0};
 for(int map=CHARMAP_UNICODE;map<=CHARMAP_SJIS;map++){
  font.charmap=map;
  for(int mode=RENDER_COPY;mode<=RENDER_ALPHA_BLENDED;mode++){
   glyph_count=draw_count=0;tm.mode=mode;
   CHECK(fabsf(_gfx_render_text(&dst,line->text,&tm)-n*10.f)<.001f);
   CHECK(glyph_count==n && draw_count==n && (!n || first_x==17.f));
  }
 }
 font.charmap=CHARMAP_UNICODE;
 gfx_text_advance_edges=true;ts.edge_left=1.2f;ts.edge_right=.3f;ts.bold_width=.4f;
 CHECK(fabsf(gfx_size_text(&ts,line->text)-n*13.5f)<.001f);
 tm.edge_spacing=1.75f;glyph_count=draw_count=0;
 CHECK(fabsf(_gfx_render_text(&dst,line->text,&tm)-n*13.5f)<.001f && glyph_count==n);
 CHECK(gfx_size_char(&ts,"\n")==0 && gfx_size_char(&ts,"\r")==0 && gfx_size_char_unstyled(&ts,"\n")==0);
 CHECK(gfx_size_char(&ts,"A")==13.5f);
 gfx_text_advance_edges=false;
}
int main(void){
 struct string *rest=cstr_to_string(help_text),*separator=cstr_to_string("\n\n");int count=0;
 while(rest->size){
  int index=string_find(rest,separator);
  if(index==-1){check_line(rest,count++);break;}
  struct string *line=string_copy(rest,0,index);check_line(line,count++);free_string(line);
  struct string *next=string_copy(rest,index+1,sjis_count_char(rest->text)-index-1);free_string(rest);rest=next;
 }
 CHECK(count==6);free_string(rest);free_string(separator);
 char mixed[]="\r\nA\rB\n";struct string *s=cstr_to_string(mixed);
 struct text_style ts={.scale_x=1};CHECK(gfx_size_text(&ts,s->text)==20.f);free_string(s);
 // Visible symbols and actual kanji must remain printable.
 struct text_render_metrics tm={.font_size=&font_size,.scale_x=1,.space_scale_x=1};
 char real_text[]={0xa1,0xf6,0xb3,0xf8,0};glyph_count=0;Texture dst={0};
 CHECK(_gfx_render_text(&dst,real_text,&tm)==20.f && glyph_count==2);
 puts("PASS: actual R8 help splits into five text lines and one paragraph gap; CR/LF never reach glyph lookup or add width/edge spacing; all five draw modes and both font maps; visible square and kanji retained");
 return 0;
}
'''
cfile = build/'rance8-settings-test.c'; cfile.write_text(source, encoding='utf8')
binary = build/'rance8-settings-test'
compiler = root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
subprocess.run([str(compiler), '--target=aarch64-linux-android28', '-std=gnu11', '-O1',
                '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
                '-I', str(lib/'include'), '-I', str(engine/'include'), str(cfile),
                str(lib/'src/utfsjis.c'), str(lib/'src/string.c'), '-o', str(binary), '-lm'],
               check=True, env={**os.environ, 'TEMP':str(build), 'TMP':str(build)})
adb = [str(root.parent/'android-build/sdk/platform-tools/adb.exe'), '-s', args.serial]
remote = '/data/local/tmp/xsystem4-rance8-settings-test'
try:
    subprocess.run(adb+['push', str(binary), remote], check=True)
    subprocess.run(adb+['shell', 'chmod', '700', remote], check=True)
    subprocess.run(adb+['shell', remote], check=True)
finally:
    subprocess.run(adb+['shell', 'rm', '-f', remote], check=True)
