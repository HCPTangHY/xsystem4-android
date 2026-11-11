"""Exercise dialogue-history serialization, horizontal sliders and review isolation.

Runs production C functions in WASM, without launching the game or changing saves.
"""
from pathlib import Path
import json, os, re, subprocess

root = Path(__file__).resolve().parent.parent
build = root / 'build/rance10-tests'
build.mkdir(parents=True, exist_ok=True)
def read(name):
    return (root/'xsystem4'/name).read_text(encoding='utf-8')
def function(file, name):
    source = read(file)
    m = re.search(r'^[^\n;{}]*\b'+name+r'\([^;{}]*\)\s*\{', source, re.M)
    assert m, name
    end = source.index('{', m.start()); depth = 0
    while True:
        depth += (source[end]=='{')-(source[end]=='}'); end += 1
        if not depth: return source[m.start():end]

base = r'''
typedef unsigned size_t; typedef unsigned uint32_t; typedef unsigned char uint8_t; typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
#define max(a,b) ((a)>(b)?(a):(b))
#define min(a,b) ((a)<(b)?(a):(b))
#define VM_ERROR(...) __builtin_trap()
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
void *memcpy(void *d,const void *s,size_t n){char *a=d;const char *b=s;while(n--)*a++=*b++;return d;}
void *memmove(void *d,const void *s,size_t n){char *a=d;const char *b=s;if(a>b){while(n){n--;a[n]=b[n];}}else memcpy(d,s,n);return d;}
void *memset(void *d,int c,size_t n){char *p=d;while(n--)*p++=c;return d;}
static union{long long align;char bytes[1048576];} arena;size_t used;
void *xmalloc(size_t n){char *p=arena.bytes+used;used+=(n+sizeof(size_t)+7)&~7;if(used>sizeof(arena))__builtin_trap();*(size_t*)p=n;return p+sizeof(size_t);}
void *xcalloc(size_t n,size_t s){return memset(xmalloc(n*s),0,n*s);}
void free(void *p){(void)p;}
void *xrealloc(void *p,size_t n){void *q=xmalloc(n);if(p){size_t old=((size_t*)p)[-1];memcpy(q,p,old<n?old:n);}return q;}
char *strdup(const char *s){return memcpy(xmalloc(strlen(s)+1),s,strlen(s)+1);}
struct string{int size,ref;char text[1];};struct string EMPTY_STRING={0,1,{0}};
struct string *make_string(const char *s,int n){struct string *p=xmalloc(sizeof(*p)+n);p->size=n;p->ref=1;memcpy(p->text,s,n);p->text[n]=0;return p;}
struct string *str(const char *s){return make_string(s,strlen(s));}
struct string *string_ref(struct string *s){if(!s||s->ref<1)__builtin_trap();s->ref++;return s;}
void free_string(struct string *s){if(!s||s->ref<1)__builtin_trap();s->ref--;}
struct string *string_dup(struct string *s){return make_string(s->text,s->size);}
void string_append_cstr(struct string **p,const char *s,int n){struct string *q=make_string((*p)->text,(*p)->size+n);memcpy(q->text+(*p)->size,s,n);free_string(*p);*p=q;}
void string_append(struct string **p,const struct string *b){string_append_cstr(p,b->text,b->size);}
void string_push_back(struct string **p,int c){char s[2]={c,c>>8};string_append_cstr(p,s,c>255?2:1);}
#define SJIS_2BYTE(c) ((unsigned char)(c)>=0x81 && (unsigned char)(c)!=0xff)
union vm_value{int i;float f;};
struct page{int nr_vars;union vm_value values[];};
#define AIN_ARRAY_INT 14
struct page *alloc_array(int rank,union vm_value *dim,int type,int st,bool init){struct page *p=xcalloc(1,sizeof(*p)+dim->i*sizeof(union vm_value));p->nr_vars=dim->i;return p;}
void delete_page_vars(struct page *p){}void free_page(struct page *p){free(p);}
struct iarray_writer{unsigned allocated,size;int *data;};
struct iarray_reader{union vm_value *data;unsigned size,pos;int error;};
bool iarray_end(struct iarray_reader *r){return r->pos>=r->size;}
int iarray_read(struct iarray_reader *r);
'''
names = ('iarray_init_writer','iarray_free_writer','iarray_write','iarray_write_string','iarray_to_page',
         'iarray_init_reader','iarray_read','iarray_read_string')
# Count live allocations only in the history fixture, including string ownership.
# The arena still does not reuse memory, so a retained reference remains inspectable.
history_base = 'int live_allocations;\n' + base
history_base = history_base.replace('void *xmalloc(size_t n){', 'void *xmalloc(size_t n){live_allocations++;')
history_base = history_base.replace('void free(void *p){(void)p;}', 'void free(void *p){if(p)live_allocations--;}')
history_base = history_base.replace('memcpy(q,p,old<n?old:n);', 'memcpy(q,p,old<n?old:n);free(p);')
history_base = history_base.replace('s->ref--;}', 'if(!--s->ref)free(s);}')
source = history_base + '\n'.join(function('src/hll/iarray.c', name) for name in names)
log = read('src/hll/ADVLogList.inc')
source += log[log.index('struct adv_log_page'):log.index('HLL_LIBRARY(')]
# Only production code decides page/text/voice boundaries and the int-array format.
source += r'''
static int rejects_without_changes(struct page *bad){
 struct adv_log_page *before=adv_log;
 int count=adv_log_count,allocations=live_allocations;
 bool enabled=adv_log_enabled,new_page=adv_log_new_page;
 struct string *text=before[0].text[0],*voice=before[0].voice[0],*filter=before[0].filter[0];
 int text_ref=text->ref,voice_ref=voice->ref,filter_ref=filter->ref;
 CHECK(!ADVLog_Load(&bad));
 CHECK(adv_log==before&&adv_log_count==count);
 CHECK(adv_log_enabled==enabled&&adv_log_new_page==new_page);
 CHECK(before[0].nr_text==2&&before[0].nr_voice==1&&before[1].nr_text==1);
 CHECK(before[0].text[0]==text&&before[0].voice[0]==voice&&before[0].filter[0]==filter);
 CHECK(text->ref==text_ref&&voice->ref==voice_ref&&filter->ref==filter_ref);
 CHECK(!strcmp(text->text,"first")&&!strcmp(voice->text,"voice-1")&&!strcmp(filter->text,"speaker"));
 CHECK(!strcmp(before[1].text[0]->text,"\xB2\xE2\xCA\xD4"));
 CHECK(live_allocations==allocations);
 return 0;
}
int run_tests(void){
 struct string *window=str("normal"),*line=str("first"),*voice=str("voice-1"),*filter=str("speaker");
 ADVLog_Clear();CHECK(ADVLog_IsEnable()&&ADVLog_GetNumofADVLog()==0);
 ADVLog_AddText(line,window);ADVLog_AddNewLine();ADVLog_AddText(str("second"),window);ADVLog_AddVoice(voice,filter);
 ADVLog_AddNewPage();ADVLog_AddText(str("\xB2\xE2\xCA\xD4"),window);
 CHECK(ADVLog_GetNumofADVLog()==2&&ADVLog_GetNumofADVLogText(0)==2);
 CHECK(!strcmp(ADVLog_GetADVLogText(0,0)->text,"first"));
 CHECK(!strcmp(ADVLog_GetADVLogVoice(0,0)->text,"voice-1"));
 CHECK(!strcmp(ADVLog_GetADVLogVoiceFilter(0,0)->text,"speaker"));
 CHECK(!ADVLog_GetADVLogText(-1,0)->size&&!ADVLog_GetADVLogText(0,99)->size);
 ADVLog_SetEnable(false);ADVLog_AddText(str("ignored"),window);CHECK(ADVLog_GetNumofADVLog()==2);
 struct page *saved=NULL;CHECK(ADVLog_Save(&saved));
 /* Replace a nonempty log and restore both serialized flags. Held getters must
    survive replacement; the old log must release exactly its own references. */
 struct string *held_text=ADVLog_GetADVLogText(0,1),*held_voice=ADVLog_GetADVLogVoice(0,0),*held_filter=ADVLog_GetADVLogVoiceFilter(0,0);
 int text_refs=held_text->ref,voice_refs=held_voice->ref,filter_refs=held_filter->ref;
 ADVLog_SetEnable(true);ADVLog_AddNewPage();ADVLog_AddText(line,window);ADVLog_AddNewPage();
 CHECK(adv_log_count==3&&adv_log_new_page);
 CHECK(ADVLog_Load(&saved)&&ADVLog_GetNumofADVLog()==2&&!ADVLog_IsEnable()&&!adv_log_new_page);
 CHECK(held_text->ref==text_refs-1&&held_voice->ref==voice_refs-1&&held_filter->ref==filter_refs-1);
 CHECK(!strcmp(held_text->text,"second")&&!strcmp(held_voice->text,"voice-1")&&!strcmp(held_filter->text,"speaker"));
 free_string(held_text);free_string(held_voice);free_string(held_filter);
 CHECK(!strcmp(adv_log[1].text[0]->text,"\xB2\xE2\xCA\xD4"));
 CHECK(!strcmp(adv_log[0].text[0]->text,"first"));
 CHECK(!strcmp(adv_log[0].filter[0]->text,"speaker"));
 int size=saved->nr_vars;
 /* Find the voice count using the serialized terminators, not text lengths. */
 int voice_count=11;
 for(int i=0;i<2;i++){while(saved->values[voice_count].i)voice_count++;voice_count++;}
 int count_offsets[]={9,10,voice_count};
 int bad_counts[]={-1,0x7fffffff,513};
 for(int flags=0;flags<4;flags++){
  adv_log_enabled=flags&1;adv_log_new_page=flags&2;
  /* Every nonempty truncated prefix, including mid-text/voice/filter, rolls back. */
  for(int n=1;n<size;n++){
   saved->nr_vars=n;CHECK(!rejects_without_changes(saved));
  }
  saved->nr_vars=size;
  int magic=saved->values[0].i;saved->values[0].i='?';
  CHECK(!rejects_without_changes(saved));saved->values[0].i=magic;
  saved->values[5].i=3;CHECK(!rejects_without_changes(saved));saved->values[5].i=2;
  for(int i=0;i<3;i++){
   int offset=count_offsets[i],original=saved->values[offset].i;
   for(int j=0;j<3;j++){
    saved->values[offset].i=bad_counts[j];CHECK(!rejects_without_changes(saved));
   }
   saved->values[offset].i=original;
  }
 }
 /* An encoded empty log commits its flags, unlike the legacy empty-buffer case. */
 int line_open=saved->values[8].i;
 saved->nr_vars=10;saved->values[9].i=0;saved->values[6].i=0;saved->values[7].i=0;saved->values[8].i=0;
 CHECK(ADVLog_Load(&saved)&&!adv_log_count&&!adv_log_enabled&&!adv_log_new_page);
 saved->nr_vars=size;saved->values[9].i=2;saved->values[6].i=1;saved->values[7].i=1;saved->values[8].i=line_open;
 CHECK(ADVLog_Load(&saved)&&adv_log_count==2&&adv_log_enabled&&adv_log_new_page);
 struct page *empty=NULL;CHECK(ADVLog_Load(&empty)&&!adv_log_count&&adv_log_enabled&&adv_log_new_page);
 CHECK(ADVLog_Load(&saved)&&adv_log_count==2);
 ADVLog_SetEnable(false);saved->nr_vars=0;
 CHECK(ADVLog_Load(&saved)&&!adv_log_count&&!adv_log_enabled&&adv_log_new_page);
 /* One line output in pieces is one entry; R only ends the line, and the
    backlog (which joins entries with "\n" itself) never sees a line break. */
 ADVLog_SetEnable(true);ADVLog_Clear();
 ADVLog_AddText(str("Rance"),window);ADVLog_AddText(str(" says"),window);ADVLog_AddNewLine();
 ADVLog_AddNewLine();
 ADVLog_AddText(str("next"),window);ADVLog_AddNewLine();
 CHECK(ADVLog_GetNumofADVLog()==1&&ADVLog_GetNumofADVLogText(0)==2);
 CHECK(!strcmp(ADVLog_GetADVLogText(0,0)->text,"Rance says")&&!strcmp(ADVLog_GetADVLogText(0,1)->text,"next"));
 for(int i=0;i<2;i++){struct string *t=ADVLog_GetADVLogText(0,i);for(int k=0;k<t->size;k++)CHECK(t->text[k]!='\n');}
 ADVLog_AddNewPage();ADVLog_AddText(str("page 2"),window);
 CHECK(ADVLog_GetNumofADVLog()==2&&ADVLog_GetNumofADVLogText(1)==1);
 /* Logs saved by version 1 (one entry per AddText, R kept as "\n") are rebuilt
    into lines when loaded, so existing saves show a normal backlog. */
 ADVLog_Clear();
 struct adv_log_page *p=adv_log_current();
 const char *v1[]={"first\n","sec","ond\n\n","tail"};
 for(int i=0;i<4;i++){p->text=xrealloc(p->text,(p->nr_text+1)*sizeof(*p->text));p->text[p->nr_text++]=str(v1[i]);}
 adv_log_line_open=false;
 struct page *old=NULL;CHECK(ADVLog_Save(&old));
 old->values[5].i=1;
 for(int i=8;i<old->nr_vars-1;i++)old->values[i]=old->values[i+1];
 old->nr_vars--;
 CHECK(ADVLog_Load(&old)&&ADVLog_GetNumofADVLog()==1&&ADVLog_GetNumofADVLogText(0)==3);
 CHECK(!strcmp(ADVLog_GetADVLogText(0,0)->text,"first")&&!strcmp(ADVLog_GetADVLogText(0,1)->text,"second"));
 CHECK(!strcmp(ADVLog_GetADVLogText(0,2)->text,"tail")&&adv_log_line_open);
 ADVLog_AddText(str(" end"),window);CHECK(!strcmp(ADVLog_GetADVLogText(0,2)->text,"tail end"));
 return 0;
}
'''

def run(name, code):
    cfile = build / (name+'.c'); wasm = build / (name+'.wasm')
    cfile.write_text(code,encoding='utf-8')
    compiler=root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
    subprocess.run([str(compiler),'--target=wasm32-unknown-unknown','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',str(wasm),str(cfile)],check=True,env={**os.environ,'TEMP':str(build),'TMP':str(build)})
    script="const fs=require('fs');WebAssembly.instantiate(fs.readFileSync("+json.dumps(str(wasm))+")).then(({instance})=>{const line=instance.exports.run_tests();if(line)throw Error('C assertion line '+line);console.log('PASS: "+name+"');});"
    subprocess.run(['node','-e',script],check=True)
run('adv-history-roundtrip',source)

# Test both thumb orientations using the real geometry and input handlers.
source = base + r'''
typedef struct{int x,y;}Point;typedef struct{int x,y,w,h;}Rectangle;
struct parts_scrollbar{int w,h,up,down,total,view,pos,step;bool horizontal,dragging,notify_pending,position_set;int drag_offset;};
struct parts{int delegate_index;struct parts_scrollbar *scrollbar;struct{Point pos;struct{float x,y;}scale;struct{float z;}rotation;}global;struct{struct{Point origin_offset;}common;}states[1];};
struct parts_scrollbar *parts_scrollbar_get(struct parts *p){return p->scrollbar;}
void parts_dirty(struct parts *p){}int events;
#define PARTS_MSG_SCROLL 1
void parts_msg_push(struct parts *p,int type,const char *fmt,int pos,int total){events++;}
float sinf(float a){return 0;}float cosf(float a){return 1;}
int lroundf(float x){return x<0?(int)(x-.5f):(int)(x+.5f);}
'''
source += '\n'.join(function('src/parts/scrollbar.inc',name) for name in ('parts_scrollbar_set_pos','parts_scrollbar_flush_notification','parts_scrollbar_rect','parts_scrollbar_input'))
source += r'''
struct parts control;
struct parts *parts_get(int no){return &control;}
'''
source += '\n'.join(function('src/hll/PartsActivity.inc',name) for name in ('PA_GetVScrollbarScrollRate','PA_SetVScrollbarScrollRate','PA_SetVScrollbarScrollPos'))
source += r'''
int run_tests(void){
 struct parts_scrollbar bar={.w=512,.h=62,.up=0,.down=0,.total=100,.view=1,.pos=55,.horizontal=true};
 control=(struct parts){.scrollbar=&bar,.global={.scale={1,1}}};
 Rectangle r=parts_scrollbar_rect(&bar,3);CHECK(r.w==62&&r.h==62&&r.x>200&&r.y==0);
 CHECK(PA_GetVScrollbarScrollRate(0)>.55f&&PA_GetVScrollbarScrollRate(0)<.56f);
 PA_SetVScrollbarScrollRate(0,1);CHECK(bar.pos==99);
 PA_SetVScrollbarScrollRate(0,-1);CHECK(bar.pos==0);
 /* Config polls these getters/setters every frame. No position may drift. */
 for(int pos=0;pos<100;pos++){
  bar.pos=pos;
  for(int frame=0;frame<120;frame++)PA_SetVScrollbarScrollRate(0,PA_GetVScrollbarScrollRate(0));
  CHECK(bar.pos==pos);
 }
 bar.pos=0;
 r=parts_scrollbar_rect(&bar,3);
 parts_scrollbar_input(&control,(Point){r.x+10,15},true,true,true,false);
 CHECK(bar.dragging);parts_scrollbar_input(&control,(Point){1000,15},true,true,false,false);
 parts_scrollbar_flush_notification(&control);CHECK(bar.pos==99&&events);parts_scrollbar_input(&control,(Point){1000,15},true,false,false,true);CHECK(!bar.dragging);
 bar.horizontal=false;bar.w=62;bar.h=512;bar.pos=55;r=parts_scrollbar_rect(&bar,3);
 CHECK(r.w==62&&r.h==62&&r.y>200&&r.x==0);
 /* Scene review: setter before callback registration, including a single scene. */
 bar.total=bar.view=1;bar.pos=0;bar.position_set=false;events=0;control.delegate_index=-1;
 PA_SetVScrollbarScrollPos(0,1);parts_scrollbar_flush_notification(&control);
 CHECK(bar.notify_pending&&events==0);control.delegate_index=3;
 parts_scrollbar_flush_notification(&control);CHECK(events==1&&!bar.notify_pending);
 for(int i=0;i<120;i++){PA_SetVScrollbarScrollPos(0,0);parts_scrollbar_flush_notification(&control);}
 CHECK(events==1);return 0;
}
'''
run('settings-slider-input',source)

# Resource ownership is the risk in sharing graphics across menu instances:
# one instance may replace its portrait while another still uses the original.
source = base + r'''
typedef struct{int handle,w,h;}Texture;
struct flat{int value;};
struct flat_stop_motion_frames{int *lib_indices;};
struct parts_flat{struct flat_resource *resource;struct flat *flat;struct string *name;
 void *root_state;Texture *textures,*original_textures;size_t nr_libraries;
 struct string **proxy_names;struct flat_stop_motion_frames *stop_motion_frames;};
bool live[512];int next_texture,deleted,flat_freed;
Texture texture(int w,int h){int n=++next_texture;live[n]=true;return (Texture){n,w,h};}
void gfx_delete_texture(Texture *t){if(t->handle){if(!live[t->handle])__builtin_trap();live[t->handle]=false;deleted++;t->handle=0;}}
void flat_free(struct flat *f){flat_freed++;}void flat_layer_state_free(void *p){}
'''
flat = read('src/parts/flat.c')
source += flat[flat.index('struct flat_resource {'):flat.index('enum emitter_direction_type')]
source += function('src/parts/flat.c','parts_flat_free')
source += function('src/parts/flat.c','flat_restore_cg')
source += r'''
int run_tests(void){
 struct flat model;Texture original=texture(200,300);
 struct flat_resource *r=xcalloc(1,sizeof(*r));r->name=str("menu.flat");r->flat=&model;
 r->textures=xmalloc(sizeof(Texture));r->textures[0]=original;r->nr_libraries=1;
 r->stop_motion_frames=xcalloc(1,sizeof(*r->stop_motion_frames));r->bytes=1000;
 flat_resources=r;flat_cache_bytes=1000;
 struct parts_flat a={0},b={0};flat_resource_acquire(&a,r);flat_resource_acquire(&b,r);
 CHECK(a.textures!=b.textures&&a.textures[0].handle==b.textures[0].handle&&r->refs==2);
 a.proxy_names=xcalloc(1,sizeof(*a.proxy_names));a.original_textures=xcalloc(1,sizeof(Texture));
 a.proxy_names[0]=str("replacement");a.original_textures[0]=a.textures[0];a.textures[0]=texture(200,300);
 CHECK(flat_restore_cg(&a,0)&&a.textures[0].handle==original.handle&&deleted==1);
 a.proxy_names[0]=str("replacement-2");a.original_textures[0]=a.textures[0];a.textures[0]=texture(200,300);
 parts_flat_free(&a);CHECK(r->refs==1&&live[original.handle]&&deleted==2);
 parts_flat_cache_clear();CHECK(flat_resources==r&&live[original.handle]);
 parts_flat_free(&b);CHECK(!r->refs&&live[original.handle]);
 parts_flat_cache_clear();CHECK(!flat_resources&&!flat_cache_bytes&&!live[original.handle]);
 CHECK(deleted==3&&flat_freed==1);return 0;
}
'''
run('shared-flat-texture-lifetime',source)

source = base + r'''
typedef struct{int handle,w,h;}Texture;
struct cg{int w,h;};int loads,uploads,deletes,next_handle;bool live[512];int payload[512];
struct cg *asset_cg_load_by_name(const char *name,void *unused){loads++;struct cg *p=xmalloc(sizeof(*p));*p=(struct cg){32,64};if(!strcmp(name,"large"))p->w=p->h=4096;return p;}
void gfx_init_texture_with_cg(Texture *t,struct cg *p){uploads++;*t=(Texture){++next_handle,p->w,p->h};live[t->handle]=true;payload[t->handle]=1234;}
void gfx_init_texture_blank(Texture *t,int w,int h){*t=(Texture){++next_handle,w,h};live[t->handle]=true;}
void gfx_copy_with_alpha_map(Texture *dst,int dx,int dy,Texture *src,int sx,int sy,int w,int h){payload[dst->handle]=payload[src->handle];}
void gfx_delete_texture(Texture *t){if(t->handle){if(!live[t->handle])__builtin_trap();live[t->handle]=false;deletes++;t->handle=0;}}
void cg_free(struct cg *p){}
'''
construction = read('src/parts/construction.c')
source += construction[construction.index('static struct construction_source'):construction.index('static struct parts_construction_process *get_cproc')]
source += r'''
struct parts{int w,h;};struct parts_construction_process{struct{Texture texture;}common;};
struct parts_cp_cg{struct string *name;};
void parts_set_dims(struct parts *p,void *common,int w,int h){p->w=w;p->h=h;}
'''
source += function('src/parts/construction.c','build_cg')
source += r'''
int run_tests(void){
 struct string *name=str("portrait");Texture *a=construction_source(name);int handle=a->handle;
 for(int i=0;i<100;i++)CHECK(construction_source(name)->handle==handle);
 CHECK(loads==1&&uploads==1&&deletes==0);
 for(int i=0;i<97;i++){char n[2]={(char)(i+1),0};construction_source(str(n));}
 CHECK(deletes>0&&!live[handle]);
 construction_source(str("large"));CHECK(construction_bytes==64u*1024*1024);
 parts_construction_cache_clear();CHECK(construction_bytes==0&&uploads==deletes);
 struct parts p;struct parts_construction_process one={0},two={0};struct parts_cp_cg op={name};
 CHECK(build_cg(&p,&one,&op)&&build_cg(&p,&two,&op));
 CHECK(one.common.texture.handle!=two.common.texture.handle&&p.w==32&&p.h==64);
 payload[one.common.texture.handle]=99;
 CHECK(payload[two.common.texture.handle]==1234&&payload[construction_source(name)->handle]==1234);
 gfx_delete_texture(&one.common.texture);gfx_delete_texture(&two.common.texture);parts_construction_cache_clear();
 CHECK(deletes==uploads+2);
 return 0;
}
'''
run('card-source-decode-cache',source)

source = base + r'''
int conversions;
char *utf2sjis(const char *s,int n){conversions++;return strdup(!strcmp(s,"visible")?"sjis-visible":s);}
char *utf2gbk(const char *s,int n){conversions++;return strdup(!strcmp(s,"visible")?"gbk-visible":s);}
'''
source += function('src/hll/PartsActivity.inc','pa_matches')
source += r'''
int run_tests(void){
 for(int i=0;i<10000;i++){
  CHECK(pa_matches("sjis-visible","visible")&&pa_matches("gbk-visible","visible"));
  CHECK(!pa_matches("wrong","visible"));CHECK(pa_matches("size","size"));
 }
 CHECK(conversions==4);return 0;
}
'''
run('layout-encoding-key-cache',source)

source = base + '\n'.join(function('src/hll/iarray.c',name) for name in names)
source += r'''
#define CURRENT_SAVE_VERSION 12
#define PARTS_CONTROLLER_STACK_MAX 10000
#define PARTS_NUMERAL_FONT_TEXT 2
#define PARTS_NR_STATES 3
#define PARTS_FLAT 8
struct text_style{int unused;};
void iarray_read_text_style(struct iarray_reader *r,struct text_style *s){for(int i=0;i<23;i++)iarray_read(r);}
struct params{int x,alpha_clipper_parts_no;bool show;};
struct parts{int no,pending_parent,controller_no,delegate_index,linked_to,linked_from;
 bool back_scene,want_save,want_save_back_scene,input_enabled,clickable,draggable,message_window,message_window_effect;
 struct params local,global;struct{int type;struct{bool stopped;}flat;}states[3];
 struct{int elapsed,duration;bool keywait_show;}*message;};
struct{int active,nr_controllers;}ctrl_stack={7,3};
struct parts pool[128];int next_no=20,clears,updates,dirty;
struct parts *parts_try_get(int n){return n>=0&&n<128&&pool[n].no==n?&pool[n]:NULL;}
int PE_GetFreeNumber(void){return next_no++;}
void parts_release(int n){pool[n].no=-1;clears++;}
void parts_clear_motion(struct parts *p){}
void parts_component_dirty(struct parts *p){dirty++;}
#define WARNING(...) ((void)0)
void PE_UpdateComponent(int t){updates++;}
void parts_engine_dirty(void){dirty++;}
void PE_SetShow(int n,bool show){pool[n].local.show=show;}
/* Serialized drawable records are supplied by the scene serializer; this
   fixture focuses on remapping/isolation in the production review loader. */
struct parts *load_parts_at(struct iarray_reader *r,int version,int n){
 struct parts *p=&pool[n];*p=(struct parts){.no=n,.pending_parent=iarray_read(r),.global={.x=123,.show=true},
 .input_enabled=true,.clickable=true,.draggable=true,.want_save=true,.want_save_back_scene=true,.delegate_index=555};
 p->states[0].type=PARTS_FLAT;p->global.alpha_clipper_parts_no=iarray_read(r);return p;
}
'''
save=read('src/parts/save.c')
source+=save[save.index('static struct back_scene_part'):save.index('void PE_SetFontColorForBackScene')]
source+=r'''
struct page *snapshot(int count){
 struct iarray_writer w;iarray_init_writer(&w,"XPE");iarray_write(&w,12);iarray_write(&w,0);
 iarray_write(&w,2);iarray_write(&w,3);iarray_write(&w,10);
 iarray_write(&w,0);iarray_write(&w,1);iarray_write(&w,2);iarray_write(&w,count);
 for(int i=0;i<count;i++){iarray_write(&w,100+i);iarray_write(&w,i?100:0);}
 return iarray_to_page(&w);
}
int run_tests(void){
 for(int i=0;i<128;i++)pool[i].no=-1;
 pool[5]=(struct parts){.no=5,.local={.x=999,.show=true},.delegate_index=42};
 struct page *a=snapshot(2);CHECK(PE_LoadBackScene(&a));
 CHECK(ctrl_stack.active==7&&ctrl_stack.nr_controllers==3&&pool[5].no==5&&pool[5].local.x==999);
 CHECK(back_scene_count==2&&back_scene_number(100)==20&&back_scene_number(101)==21);
 CHECK(pool[20].controller_no==7&&pool[20].local.x==123&&pool[20].back_scene);
 CHECK(pool[21].local.alpha_clipper_parts_no==20&&pool[20].local.alpha_clipper_parts_no==0);
 CHECK(pool[20].pending_parent==-2&&pool[20].delegate_index==-1&&pool[20].input_enabled&&!pool[20].want_save);
 CHECK(!pool[20].clickable&&!pool[20].draggable);
 CHECK(pool[20].states[0].flat.stopped&&updates==1);
 PE_SetShowForBackScene(100,false);CHECK(!pool[20].local.show&&pool[5].local.show);
 CHECK(PE_LoadBackScene(&a)&&pool[20].no==-1&&back_scene_number(100)==22);
 PE_ClearBackScene();CHECK(!back_scene_count&&pool[22].no==-1&&pool[5].no==5);
 a->nr_vars--;CHECK(!PE_LoadBackScene(&a)&&!back_scene_count&&pool[5].no==5);
 struct page *b=snapshot(0);CHECK(PE_LoadBackScene(&b)&&!back_scene_count);
 struct page *z=snapshot(1);z->values[z->nr_vars-2].i=0;
 CHECK(PE_LoadBackScene(&z)&&pool[back_scene_number(0)].local.alpha_clipper_parts_no==0);
 PE_ClearBackScene();CHECK(clears==7&&pool[5].delegate_index==42);return 0;
}
'''
run('back-scene-clone-isolation',source)
