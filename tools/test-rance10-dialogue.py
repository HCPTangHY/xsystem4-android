"""Execute the production dialogue parser and Flat key lookup with mocked glyph IO."""
from pathlib import Path
import re, subprocess, os, json

root = Path(__file__).resolve().parent.parent
engine = root / 'xsystem4'
build = root / 'build/rance10-tests'
build.mkdir(parents=True, exist_ok=True)

def func(file, name):
    text = (engine / file).read_text(encoding='utf-8')
    chars = list(text)
    i = 0
    while i < len(text):
        start = i
        if text[i:i+2] == '/*':
            i = text.index('*/', i+2) + 2
        elif text[i:i+2] == '//':
            i = text.find(chr(10), i+2)
            if i < 0: i = len(text)
        elif text[i] in (chr(34), chr(39)):
            quote = text[i]
            i += 1
            while i < len(text):
                if text[i] == chr(92): i += 2
                elif text[i] == quote:
                    i += 1
                    break
                else: i += 1
        else:
            i += 1
            continue
        for j in range(start, i):
            if chars[j] != chr(10): chars[j] = ' '
    masked = ''.join(chars)
    match = re.search(r'^[^\n;{}]*\b' + name + r'\([^;{}]*\)\s*\{', masked, re.M)
    assert match, name
    end = masked.index('{', match.start())
    depth = 0
    while True:
        depth += (masked[end] == '{') - (masked[end] == '}')
        end += 1
        if not depth:
            return text[match.start():end]

source = r'''
typedef unsigned size_t; typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define INT_MAX 2147483647
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
#define SJIS_2BYTE(c) ((unsigned char)(c)>=0x81 && (unsigned char)(c)<=0xfe)
#define CHECK(c) do { if(!(c)) return __LINE__; } while(0)
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
int memcmp(const void *a,const void *b,size_t n){const unsigned char *x=a,*y=b;for(size_t i=0;i<n;i++)if(x[i]!=y[i])return x[i]-y[i];return 0;}
void *memcpy(void *d,const void *s,size_t n){for(size_t i=0;i<n;i++)((char*)d)[i]=((const char*)s)[i];return d;}
void *memset(void *d,int c,size_t n){for(size_t i=0;i<n;i++)((char*)d)[i]=c;return d;}
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
const char *strchr(const char *s,int c){while(*s&&*s!=c)s++;return *s==c?s:NULL;}
unsigned char arena[1024*1024];size_t used;
void *xcalloc(size_t n,size_t size){size_t bytes=n*size;void *p=arena+used;used=(used+bytes+7)&~7;if(used>sizeof(arena))__builtin_trap();memset(p,0,bytes);return p;}
void *xrealloc_array(void *old,size_t oldn,size_t n,size_t size){void *p=xcalloc(n,size);if(old)memcpy(p,old,min(n,oldn)*size);return p;}
void free(void *p){(void)p;}
float ceilf(float f){int i=(int)f;return i<f?i+1:i;}
int sscanf(const char *s,const char *fmt,...){
 __builtin_va_list ap;__builtin_va_start(ap,fmt);
 if(fmt[5]=='l'){if(memcmp(s,"font leading=",13)){__builtin_va_end(ap);return 0;}int *out=__builtin_va_arg(ap,int*);*out=0;for(s+=13;*s>='0'&&*s<='9';s++)*out=*out*10+*s-'0';__builtin_va_end(ap);return 1;}
 if(fmt[0]=='t'){if(memcmp(s,"time ",5)){__builtin_va_end(ap);return 0;}int *out=__builtin_va_arg(ap,int*);*out=0;for(s+=5;*s>='0'&&*s<='9';s++)*out=*out*10+*s-'0';__builtin_va_end(ap);return 1;}
 if(memcmp(s,"font ",5)){__builtin_va_end(ap);return 0;}
 char *key=__builtin_va_arg(ap,char*);float *v=__builtin_va_arg(ap,float*);s+=5;while(*s&&*s!='=')*key++=*s++;*key=0;if(*s!='='){__builtin_va_end(ap);return 0;}*v=0;for(s++;*s>='0'&&*s<='9';s++)*v=*v*10+*s-'0';__builtin_va_end(ap);return 2;
}
typedef struct {int x,y;} Point;
typedef struct {int x,y,w,h;} Rectangle;
typedef struct {unsigned char r,g,b,a;} SDL_Color;
typedef struct {unsigned handle;int w,h;} Texture;
struct text_style {unsigned face;float size,bold_width;unsigned weight;float edge_left,edge_up,edge_right,edge_down;SDL_Color color,edge_color;float scale_x,space_scale_x,font_spacing;void *font_size;};
void text_style_set_edge_width(struct text_style *t,float e){t->edge_left=t->edge_right=t->edge_up=t->edge_down=e;}
int text_style_height(struct text_style *t){return t->size;}
struct parts_common {Texture texture;int w,h;Point origin_offset;Rectangle hitbox,surface_area;};
struct parts_text_char {Texture t;struct parts_glyph_cache *cached;char ch[4];int advance;Point off;int show_at;};
struct parts_text_line {struct parts_text_char *chars;int nr_chars;unsigned height;float width;int extra_line_space;};
struct parts_text {struct parts_common common;unsigned nr_lines;struct parts_text_line *lines;int line_space;struct {float x;int y;}cursor;struct text_style ts;};
struct parts_flat {int unused;};
struct parts_animation {struct parts_common common;unsigned nr_frames,frame_time,elapsed,current_frame;Texture *frames;};
enum parts_type {PARTS_UNINITIALIZED,PARTS_TEXT,PARTS_FLAT,PARTS_ANIMATION,PARTS_CG,PARTS_PANEL,PARTS_LAYOUT_BOX,PARTS_HGAUGE,PARTS_VGAUGE,PARTS_NUMERAL,PARTS_RECT_DETECTION,PARTS_CONSTRUCTION_PROCESS,PARTS_3DLAYER,PARTS_MOVIE,PARTS_FLASH};
#define VM_ERROR(...) __builtin_trap()
struct {int version;} program={12},*ain=&program;
struct parts_state {int type;union{struct parts_text text;struct parts_flat flat;struct parts_animation anim;};};
struct string {char *text;size_t size;};
struct string EMPTY_STRING={"",0};
struct string *string_ref(struct string *s){return s;}
void free_string(struct string *s){(void)s;}
struct string *str(const char *s){struct string *out=xcalloc(1,sizeof(*out));out->text=(char*)s;out->size=strlen(s);return out;}
'''
source += re.search(r'struct parts_message_window \{.*?\n\};', (engine/'src/parts/parts_internal.h').read_text(),re.S)[0]
source += r'''
struct parts {struct parts_message_window *message;int component_type_override;struct parts_state states[1];};
struct parts window;
struct parts *parts_get(int no){return &window;}
struct parts *parts_try_get(int no){return no==1?&window:NULL;}
bool parts_state_valid(int state){return state==0;}
struct parts_scrollbar{bool horizontal;};
struct parts_scrollbar bar;
struct parts_scrollbar *parts_scrollbar_get(struct parts *p){(void)p;return &bar;}
int dirty_calls,rebuild_calls;
void parts_dirty(struct parts *p){(void)p;dirty_calls++;}
bool parts_flat_update(struct parts_flat *f,int ms){return false;}
void parts_state_reset(struct parts_state *s,int type){memset(s,0,sizeof(*s));s->type=type;s->text.ts=(struct text_style){.size=20,.scale_x=1,.color={255,255,255,255}};}
int flat_resets,flat_skips;
bool PE_BackPartsFlatBeginFrame(int no,int state){flat_resets++;parts_state_reset(&window.states[0],PARTS_FLAT);return true;}
bool PE_StepPartsFlatFinalFrame(int no,int state){flat_skips++;parts_state_reset(&window.states[0],PARTS_FLAT);return true;}
SDL_Color glyph_colors[1024];unsigned live[1024],next_texture;
void gfx_init_texture_rgba(Texture *t,int w,int h,SDL_Color c){t->w=w;t->h=h;t->handle=++next_texture;live[t->handle]=1;}
void gfx_delete_texture(Texture *t){if(t->handle){if(!live[t->handle])__builtin_trap();live[t->handle]=0;t->handle=0;}}
int gfx_size_char(struct text_style *t,const char *s){return SJIS_2BYTE(*s)?t->size:t->size/2;}
float gfx_render_textf(Texture *tx,int x,int y,const char *s,struct text_style *t,bool b){glyph_colors[tx->handle]=t->color;return gfx_size_char(t,s)+t->font_spacing;}
'''
cache = (engine/'src/parts/text.c').read_text(encoding='utf8')
source += cache[cache.index('struct parts_glyph_cache {'):cache.index('static const char *parts_text_append_char')]
for name in ('extract_sjis_char','text_style_offset','parts_text_append_char','parts_text_free'):
    source += '\n' + func('src/parts/text.c',name)
for name in ('parts_message_get','parts_message_free','parts_message_update','message_font_tag','parts_message_rebuild'):
    body = func('src/parts/message_window.inc',name)
    if name == 'parts_message_rebuild':
        body = body.replace('{', '{\n rebuild_calls++;', 1)
    source += '\n' + body
source += '\n#define MW(no) parts_message_get(parts_get(no))\n'
for name in ('PE_SetMessageWindowText','PE_GetMessageWindowText','PE_IsFixedMessageWindowText','PE_FixMessageWindowText','PE_SetMessageWindowTextArea','PE_SetMessageWindowTextSpeed','PE_BackMessageWindowFlatBeginFrame','PE_StepMessageWindowFlatFinalFrame'):
    source += '\n' + func('src/parts/message_window.inc',name)
for name in ('PE_SetComponentType','PE_GetComponentType'):
    source += '\n' + func('src/parts/parts.c',name)
for name in ('PA_SetMultiTextBoxText','PA_GetMultiTextBoxText'):
    source += '\n' + func('src/hll/PartsActivity.inc',name)
source += r'''
struct flat_key_data_graphic {int alpha;};
struct flat_key_frame_graphic {unsigned count;struct flat_key_data_graphic *keys;};
struct flat_timeline {int frame_count;struct {unsigned count;struct flat_key_data_graphic *keys;struct flat_key_frame_graphic *frames;}graphic;};
'''
source += func('src/parts/flat.c','parts_flat_graphic_key')
source += r'''
int revealed_chars(struct parts_message_window *m){
 int count=0;
 for(unsigned i=0;i<m->text.nr_lines;i++)
  for(int j=0;j<m->text.lines[i].nr_chars;j++)
   count+=m->text.lines[i].chars[j].show_at<=m->elapsed;
 return count;
}
int test_speed_changes(void){
 struct parts_message_window *m=parts_message_get(&window);
 PE_SetMessageWindowTextSpeed(1,10);
 PE_SetMessageWindowText(1,str("AB\nCDEF"),0,&EMPTY_STRING,0,0);
 parts_message_update(m,25);
 int rebuilds=rebuild_calls,dirty=dirty_calls;size_t allocations=used;
 struct parts_text_line *lines=m->text.lines;
 for(int i=0;i<100;i++)PE_SetMessageWindowTextSpeed(1,10);
 CHECK(rebuild_calls==rebuilds&&dirty_calls==dirty&&used==allocations);
 CHECK(m->text.lines==lines&&m->elapsed==25&&m->duration==60);
 CHECK(m->text.lines[1].chars[0].show_at==30&&revealed_chars(m)==2);
 /* Keep the prefix and half of the pending character's interval, even
    across line breaks and when slowing down or speeding up. */
 PE_SetMessageWindowTextSpeed(1,100);
 CHECK(m->elapsed==250&&m->duration==600&&revealed_chars(m)==2);
 CHECK(m->text.lines[1].chars[0].show_at==300&&!PE_IsFixedMessageWindowText(1));
 PE_SetMessageWindowTextSpeed(1,20);
 CHECK(m->elapsed==50&&m->duration==120&&revealed_chars(m)==2);
 parts_message_update(m,10);CHECK(revealed_chars(m)==3);
 PE_FixMessageWindowText(1);
 PE_SetMessageWindowTextSpeed(1,200);
 CHECK(PE_IsFixedMessageWindowText(1)&&m->elapsed==1200&&revealed_chars(m)==6);
 PE_SetMessageWindowText(1,str("AB\nCDEFG"),0,&EMPTY_STRING,0,0);
 CHECK(!PE_IsFixedMessageWindowText(1)&&revealed_chars(m)==6);
 parts_message_update(m,200);
 PE_SetMessageWindowTextSpeed(1,300);
 CHECK(PE_IsFixedMessageWindowText(1)&&m->elapsed==2100);
 /* Empty pages must not carry a fixed state into the next story text. */
 PE_SetMessageWindowText(1,&EMPTY_STRING,0,&EMPTY_STRING,0,0);
 PE_SetMessageWindowTextSpeed(1,10);
 PE_SetMessageWindowText(1,str("XY"),0,&EMPTY_STRING,0,0);
 CHECK(m->elapsed==0&&!PE_IsFixedMessageWindowText(1)&&revealed_chars(m)==0);
 parts_message_update(m,5);PE_SetMessageWindowTextSpeed(1,20);
 CHECK(m->elapsed==10&&revealed_chars(m)==0);
 /* Zero speed reveals ordinary characters, not explicit time-tag delays.
    A zero-time scope shares its preceding deadline and remains visible. */
 PE_SetMessageWindowTextSpeed(1,10);
 PE_SetMessageWindowText(1,str("A${time 0}BC${/time}${time 100}D${/time}E"),0,&EMPTY_STRING,0,0);
 parts_message_update(m,60);CHECK(revealed_chars(m)==3);
 PE_SetMessageWindowTextSpeed(1,20);
 CHECK(m->elapsed==70&&m->duration==140&&revealed_chars(m)==3);
 CHECK(m->text.lines[0].chars[2].show_at==20&&m->text.lines[0].chars[3].show_at==120);
 PE_SetMessageWindowTextSpeed(1,0);
 CHECK(m->elapsed==50&&m->duration==100&&revealed_chars(m)==3&&!PE_IsFixedMessageWindowText(1));
 rebuilds=rebuild_calls;dirty=dirty_calls;allocations=used;
 PE_SetMessageWindowTextSpeed(1,-1);PE_SetMessageWindowTextSpeed(1,-100);
 CHECK(m->speed==0&&rebuild_calls==rebuilds&&dirty_calls==dirty&&used==allocations&&m->elapsed==50);
 parts_message_update(m,50);CHECK(PE_IsFixedMessageWindowText(1)&&revealed_chars(m)==5);
 PE_SetMessageWindowTextSpeed(1,30);
 CHECK(PE_IsFixedMessageWindowText(1)&&m->elapsed==160);
 PE_SetMessageWindowText(1,str("ordinary"),0,&EMPTY_STRING,0,0);
 PE_SetMessageWindowTextSpeed(1,0);CHECK(PE_IsFixedMessageWindowText(1)&&m->elapsed==0);
 PE_SetMessageWindowTextSpeed(1,50);CHECK(PE_IsFixedMessageWindowText(1)&&m->elapsed==400);
 /* Saturated deadlines and large progress arithmetic remain capped. */
 PE_SetMessageWindowText(1,str("XY"),0,&EMPTY_STRING,0,0);
 parts_message_update(m,25);PE_SetMessageWindowTextSpeed(1,INT_MAX);
 CHECK(m->elapsed==1073741823&&m->duration==INT_MAX&&revealed_chars(m)==0);
 parts_message_update(m,INT_MAX);PE_SetMessageWindowTextSpeed(1,1);
 CHECK(m->elapsed==2&&PE_IsFixedMessageWindowText(1));
 PE_SetMessageWindowText(1,&EMPTY_STRING,0,&EMPTY_STRING,0,0);
 PE_SetMessageWindowTextSpeed(1,23);
 return 0;
}
int run_tests(void){
 int speed_failure=test_speed_changes();if(speed_failure)return speed_failure;
 /* The story manager invokes Flat reset/skip for static CG windows too.
    Preserve the frame and its bottom-anchor geometry in that sequence. */
 window.states[0].type=PARTS_CG;
 window.states[0].text.common.w=1920;window.states[0].text.common.h=396;
 window.states[0].text.common.origin_offset.y=-396;
 PE_BackMessageWindowFlatBeginFrame(1);PE_StepMessageWindowFlatFinalFrame(1);
 CHECK(window.states[0].type==PARTS_CG&&window.states[0].text.common.w==1920);
 CHECK(window.states[0].text.common.origin_offset.y+233==-163&&flat_resets==0&&flat_skips==0);
 window.states[0].type=PARTS_FLAT;
 CHECK(PE_BackMessageWindowFlatBeginFrame(1)&&PE_StepMessageWindowFlatFinalFrame(1));
 CHECK(flat_resets==1&&flat_skips==1);
 struct parts_message_window *m=parts_message_get(&window);
 PE_SetMessageWindowText(1,str("\xC4\xE3\xBA\xC3"),1,&EMPTY_STRING,0,0);
 CHECK(window.component_type_override==11 && m->text.lines[0].nr_chars==2);
 CHECK(m->text.common.w==40 && m->duration==46 && !PE_IsFixedMessageWindowText(1));
 CHECK(parts_message_update(m,23) && m->elapsed==23 && m->text.lines[0].chars[1].show_at==46);
 PE_FixMessageWindowText(1); CHECK(PE_IsFixedMessageWindowText(1));
 PE_SetMessageWindowText(1,str("\xC4\xE3\xBA\xC3!"),2,&EMPTY_STRING,0,0);
 CHECK(m->elapsed==46 && m->duration==69 && !PE_IsFixedMessageWindowText(1));
 PE_SetMessageWindowText(1,str("A${time 0}BC${/time}D\nE"),3,&EMPTY_STRING,0,0);
 CHECK(m->elapsed==0 && m->duration==69 && m->text.nr_lines==2);
 CHECK(m->text.lines[0].nr_chars==4 && m->text.lines[0].chars[2].show_at==23 && m->text.lines[1].chars[0].show_at==69);
 PE_SetMessageWindowText(1,str("${font r=12}A${font g=34}B${/font}C${/font}D"),4,&EMPTY_STRING,0,0);
 CHECK(m->text.lines[0].nr_chars==4 && m->text.ts.color.r==255);
 CHECK(glyph_colors[m->text.lines[0].chars[0].t.handle].r==12);
 CHECK(glyph_colors[m->text.lines[0].chars[1].t.handle].g==34);
 CHECK(glyph_colors[m->text.lines[0].chars[2].t.handle].g==255);
 CHECK(glyph_colors[m->text.lines[0].chars[3].t.handle].r==255);
 PE_SetMessageWindowTextArea(1,337,177,20,100);
 CHECK(m->text.nr_lines==2 && m->area.x==337);
 PE_SetMessageWindowTextSpeed(1,0); CHECK(PE_IsFixedMessageWindowText(1));
 PE_SetMessageWindowText(1,&EMPTY_STRING,0,&EMPTY_STRING,0,0);
 CHECK(m->text.common.w==0 && m->text.lines[0].nr_chars==0 && PE_IsFixedMessageWindowText(1));
 /* Save's Activity factory must keep returning the multi-line textbox
    type after setting/fixing text, rather than constructing a nil widget. */
 PE_SetComponentType(1,7,1);CHECK(PE_GetComponentType(1,1)==7);
 PA_SetMultiTextBoxText(1,str("save note\nsecond line"));
 CHECK(PE_GetComponentType(1,1)==7&&m->active&&m->speed==0);
 CHECK(!strcmp(PA_GetMultiTextBoxText(1)->text,"save note\nsecond line"));
 CHECK(m->text.nr_lines>=2&&PE_IsFixedMessageWindowText(1));
 PA_SetMultiTextBoxText(1,&EMPTY_STRING);CHECK(PE_GetComponentType(1,1)==7);
 PE_SetComponentType(1,3,1);CHECK(PE_GetComponentType(1,1)==3&&bar.horizontal);
 PE_SetComponentType(1,2,1);CHECK(PE_GetComponentType(1,1)==2&&!bar.horizontal);
 /* Rebuilding an unchanged page reuses the actual textures and spacing. */
 PA_SetMultiTextBoxText(1,str("cache cache"));
 unsigned uploads=next_texture;
 parts_message_rebuild(&window);CHECK(next_texture==uploads);
 parts_text_cache_clear();CHECK(live[m->text.lines[0].chars[0].t.handle]);
 parts_message_free(m);parts_text_cache_clear();for(unsigned i=1;i<=next_texture;i++)CHECK(!live[i]);
 struct flat_key_data_graphic old[]={{1},{2}}, a[]={{10},{11}}, b[]={{20}};
 struct flat_key_frame_graphic frames[]={{2,a},{0,NULL},{1,b}};
 struct flat_timeline tl={.frame_count=3,.graphic={.frames=frames}};
 CHECK(parts_flat_graphic_key(&tl,0,1)==&a[1]); CHECK(!parts_flat_graphic_key(&tl,1,0));
 CHECK(parts_flat_graphic_key(&tl,2,0)==&b[0]); CHECK(!parts_flat_graphic_key(&tl,2,1));
 CHECK(!parts_flat_graphic_key(&tl,-1,0) && !parts_flat_graphic_key(&tl,3,0));
 tl.graphic.frames=NULL;tl.graphic.keys=old;tl.graphic.count=2;
 CHECK(parts_flat_graphic_key(&tl,1,0)==&old[1] && !parts_flat_graphic_key(&tl,2,0));
 CHECK(!parts_flat_graphic_key(&tl,0,1));return 0;
}
'''
(build/'dialogue-test.c').write_text(source,encoding='utf-8')
compiler=root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
wasm=build/'dialogue-test.wasm'
subprocess.run([str(compiler),'--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',str(wasm),str(build/'dialogue-test.c')],check=True,env={**os.environ,'TEMP':str(build),'TMP':str(build)})
script="const fs=require('fs');WebAssembly.instantiate(fs.readFileSync("+json.dumps(str(wasm))+" )).then(({instance})=>{const line=instance.exports.run_tests();if(line)throw Error('C assertion line '+line);console.log('PASS: production dialogue parser GBK, timing, font scopes, append/fix/clear, wrapping, glyph release; Flat legacy and v15 multi-key/empty-frame bounds.');});"
subprocess.run(['node','-e',script],check=True)
