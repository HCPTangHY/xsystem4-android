"""Production C checks for ADV flags, review snapshots and converted UI lookup.

Reuse only harness definitions from the existing review tests; do not rerun them.
"""
from pathlib import Path
import ast
harness = Path(__file__).with_name('test-rance10-review-controls.py')
tree = ast.parse(harness.read_text(encoding='utf8'))
keep = []
for node in tree.body:
    if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef)):
        keep.append(node)
    elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('root','build','base') for t in node.targets):
        keep.append(node)
exec(compile(ast.Module(body=keep, type_ignores=[]), str(harness), 'exec'))
base = base.replace('bytes[1048576]', 'bytes[16777216]')
base += r"""
int memcmp(const void *a,const void *b,size_t n){const unsigned char *x=a,*y=b;while(n--){if(*x!=*y)return *x-*y;x++;y++;}return 0;}
void *memchr(const void *p,int v,size_t n){const unsigned char *s=p;while(n--){if(*s==(unsigned char)v)return (void*)s;s++;}return NULL;}
int strncmp(const char *a,const char *b,size_t n){while(n&&*a&&*a==*b){a++;b++;n--;}return n?(unsigned char)*a-(unsigned char)*b:0;}
char *strrchr(const char *s,int c){const char *p=NULL;do{if(*s==c)p=s;}while(*s++);return (char*)p;}
char *strstr(const char *s,const char *q){size_t n=strlen(q);for(;*s;s++)if(!strncmp(s,q,n))return (char*)s;return n?NULL:(char*)s;}
"""
source = base + r"""
#define WARNING(...)
#define display_utf0(s) (s)
uint32_t LittleEndian_getDW(const uint8_t *p,size_t at){return p[at]|p[at+1]<<8|p[at+2]<<16|(uint32_t)p[at+3]<<24;}
void LittleEndian_putDW(uint8_t *p,size_t at,uint32_t x){for(int i=0;i<4;i++)p[at+i]=x>>(i*8);}
uint8_t *disk;size_t disk_size;bool fail_write;
bool file_write(const char *path,const uint8_t *p,size_t n){if(fail_write)return false;disk=xmalloc(n);memcpy(disk,p,n);disk_size=n;return true;}
uint8_t *file_read(const char *p,size_t *n){*n=disk_size;return disk?memcpy(xmalloc(disk_size),disk,disk_size):NULL;}
int sprintf(char *out,const char *fmt,const char *s){size_t n=strlen(s);memcpy(out,s,n);memcpy(out+n,".adv",5);return n+4;}
""" + read('src/hll/MsgSkipAdv.inc') + r"""
int run_tests(void){
 struct string *a=str("story/A"),*b=str("story/B");
 msgskip_adv_init("MsgSkip.asd");CHECK(!strcmp(adv_skip_path,"MsgSkip.asd.adv"));
 MsgSkip_SetAdvFlag(a,7,0);MsgSkip_SetAdvFlag(a,7,2048);MsgSkip_SetAdvFlag(a,8,9);MsgSkip_SetAdvFlag(b,7,6);
 CHECK(MsgSkip_GetAdvFlag(a,7,0)&&MsgSkip_GetAdvFlag(a,7,2048));
 CHECK(!MsgSkip_GetAdvFlag(a,8,0)&&!MsgSkip_GetAdvFlag(b,7,0)&&!MsgSkip_GetAdvFlag(a,7,2047));
 MsgSkip_SetAdvFlag(a,7,-1);MsgSkip_SetAdvFlag(a,7,0x1000000);MsgSkip_SetAdvFlag(NULL,0,0);
 CHECK(!msgskip_is_adv_read(a,7,-1)&&!msgskip_is_adv_read(a,7,0x1000000));
 fail_write=true;msgskip_adv_save();CHECK(adv_skip_dirty&&!disk);fail_write=false;msgskip_adv_save();CHECK(!adv_skip_dirty&&disk_size>12);
 uint8_t *valid=disk;size_t size=disk_size;msgskip_adv_clear();CHECK(!adv_skip_path);
 CHECK(!msgskip_adv_read(valid,size-1)&&!msgskip_is_adv_read(a,7,0));
 uint8_t *bad=memcpy(xmalloc(size),valid,size);bad[0]='?';CHECK(!msgskip_adv_read(bad,size));
 memcpy(bad,valid,size);LittleEndian_putDW(bad,20,0xffffffff);CHECK(!msgskip_adv_read(bad,size));
 CHECK(msgskip_adv_read(valid,size)&&msgskip_is_adv_read(a,7,2048)&&msgskip_is_adv_read(a,8,9)&&msgskip_is_adv_read(b,7,6));
 MsgSkip_SetAdvFlag(a,7,42);CHECK(msgskip_adv_read(valid,size)&&msgskip_is_adv_read(a,7,42));
 msgskip_adv_clear();msgskip_adv_init("MsgSkip.asd");CHECK(msgskip_is_adv_read(a,7,0)&&!msgskip_is_adv_read(a,7,42));
 MsgSkip_SetAdvFlag(a,7,0xffffff);CHECK(msgskip_is_adv_read(a,7,0xffffff));
 msgskip_adv_clear();CHECK(!msgskip_is_adv_read(a,7,0)&&!adv_skip_dirty);return 0;
}
"""
run('adv-read-flags-roundtrip', source)

source = base + r"""
#define MAX_ARCHIVES 4
enum asset_type{ASSET_BGM,ASSET_SOUND,ASSET_VOICE,ASSET_CG,ASSET_FLAT,ASSET_TYPE_MAX};
struct asset_manager{void (*load_archive)(void);};
struct afa_file{struct string *name;};struct afa_archive{unsigned nr_files;struct afa_file *files;};
struct asset_manager_afa{struct asset_manager manager;struct afa_archive *archives[MAX_ARCHIVES];};
struct asset_manager *assets[ASSET_TYPE_MAX];void afa_load_archive(void){}
struct hash_table{const char *names[64];int count;};
struct hash_table *ht_create(int n){return xcalloc(1,sizeof(struct hash_table));}
void *ht_get(struct hash_table *t,const char *s,void *d){for(int i=0;i<t->count;i++)if(!strcmp(t->names[i],s))return (void*)1;return d;}
void ht_put(struct hash_table *t,const char *s,void *v){t->names[t->count++]=s;}
void ht_free(struct hash_table *t){free(t);}
""" + function('src/asset_manager.c','asset_search_titles')
afa=read('src/hll/AFAFactory.c')
source += function('src/hll/AFAFactory.c','get_asset_type')
source += afa[afa.index('static struct { struct string **titles;'):afa.index('HLL_LIBRARY(')]
source += r"""
int run_tests(void){
 struct afa_file files1[]={{str("_ui/icon.ajp")},{str("ui/icon.ajp")},{str("_ui/close.png")}};
 struct afa_file files2[]={{str("_ui/icon.png")},{str("_ui/next.ajp")}};
 struct afa_archive ar1={3,files1},ar2={2,files2};
 struct asset_manager_afa manager={{afa_load_archive},{&ar1,&ar2}};assets[ASSET_CG]=&manager.manager;
 CHECK(AFAFactory_SearchTitle(2,str("_"))==3&&AFAFactory_GetCountOfSearchData(2)==3);
 CHECK(!strcmp(AFAFactory_GetSearchTitleByIndex(2,0)->text,"_ui/icon"));
 CHECK(!strcmp(AFAFactory_GetSearchTitleByIndex(2,2)->text,"_ui/next"));
 CHECK(!AFAFactory_GetSearchTitleByIndex(2,-1)->size&&!AFAFactory_GetSearchTitleByIndex(2,3)->size);
 CHECK(AFAFactory_PrefixSearchTitle(2,str("ui/"))==1&&!strcmp(AFAFactory_GetSearchTitleByIndex(2,0)->text,"ui/icon"));
 CHECK(AFAFactory_SuffixSearchTitle(2,str("icon"))==2);
 CHECK(AFAFactory_SearchTitle(3,str("_"))==0&&AFAFactory_GetCountOfSearchData(2)==2);
 CHECK(AFAFactory_SearchTitle(2,str("missing"))==0&&!AFAFactory_GetSearchTitleByIndex(2,0)->size);
 CHECK(AFAFactory_SearchTitle(2,str("_"))==3&&AFAFactory_GetCountOfData(2)==4&&AFAFactory_GetCountOfSearchData(2)==3);
 CHECK(!strcmp(AFAFactory_GetTitleByIndex(2,3)->text,"_ui/next")&&!AFAFactory_GetTitleByIndex(2,4)->size&&AFAFactory_GetCountOfData(3)==0);
 CHECK(AFAFactory_SearchTitle(-1,str(""))==0&&AFAFactory_SearchTitle(99,str(""))==0);
 assets[ASSET_BGM]=assets[ASSET_SOUND]=assets[ASSET_VOICE]=&manager.manager;
 CHECK(AFAFactory_SearchTitle(5,str("_"))==3);return 0;
}
"""
run('afa-converted-ui-titles', source)

source = base
for name in ('iarray_init_writer','iarray_free_writer','iarray_write','iarray_write_float','iarray_write_string','iarray_write_string_or_null','iarray_read','iarray_read_float','iarray_read_string','iarray_read_string_or_null'):
    source += function('src/hll/iarray.c',name)+'\n'
header=read('src/parts/parts_internal.h')
source += re.search(r'struct flat_layer_state \{.*?\n\};',header,re.S)[0]
source += r"""
#define FLAT_LIB_TIMELINE 5
struct flat_timeline{struct string *library_name;};
struct flat_library{struct string *name;int type;struct{struct flat_timeline *timelines;size_t nr_timelines;}timeline;};
struct flat{struct flat_timeline *timelines;size_t nr_timelines;struct flat_library *libraries;size_t nr_libraries;};
struct parts_flat{struct string *name;bool stopped,needs_advance;int elapsed,pending_seek_delta;float fps_rate;struct flat_layer_state *root_state;struct flat *flat;size_t nr_libraries;struct string **proxy_names;};
struct parts{int unused;};struct flat model;
int parts_flat_find_library(struct flat *f,const char *s){for(size_t i=0;i<f->nr_libraries;i++)if(!strcmp(f->libraries[i].name->text,s))return i;return -1;}
"""
source += function('src/parts/flat.c','flat_layer_state_new')+function('src/parts/flat.c','flat_layer_state_free')
source += r"""
bool parts_flat_load(struct parts *p,struct parts_flat *f,struct string *name){f->name=name?string_dup(name):NULL;f->flat=name?&model:NULL;f->nr_libraries=model.nr_libraries;f->fps_rate=1;f->root_state=flat_layer_state_new(model.nr_timelines);return name!=NULL;}
bool parts_flat_change_cg(struct parts_flat *f,struct string *old,struct string *replacement){int i=parts_flat_find_library(f->flat,old->text);if(i<0)return false;if(!f->proxy_names)f->proxy_names=xcalloc(f->nr_libraries,sizeof(void*));f->proxy_names[i]=string_dup(replacement);return true;}
"""
for name in ('save_flat_layer','load_flat_layer','flat_layer_matches','save_parts_flat','load_parts_flat'):
    source += function('src/parts/save.c',name)+'\n'
source += r"""
int run_tests(void){
 struct flat_timeline root_tl[]={{str("nested")},{str("portrait")}},child_tl[]={{str("portrait")}};
 struct flat_library libs[]={{str("nested"),FLAT_LIB_TIMELINE,{child_tl,1}},{str("portrait"),1,{NULL,0}}};
 model=(struct flat){root_tl,2,libs,2};
 struct parts_flat f={0};parts_flat_load(NULL,&f,str("actor.flat"));
 f.stopped=true;f.needs_advance=false;f.elapsed=17;f.fps_rate=.75f;f.pending_seek_delta=3;
 f.root_state->current_frame=21;f.root_state->stopped=true;f.root_state->suppress_advance=false;f.root_state->jump_target=8;
 f.root_state->last_script_keys[0]=5;f.root_state->children[0]=flat_layer_state_new(1);f.root_state->children[0]->current_frame=9;
 CHECK(parts_flat_change_cg(&f,str("portrait"),str("portrait/replaced")));
 struct iarray_writer w={0};save_parts_flat(&w,&f);
 struct iarray_reader r={(union vm_value*)w.data,w.size,0,0};struct parts_flat restored={0};
 load_parts_flat(&r,NULL,&restored,13);CHECK(!r.error&&r.pos==r.size);
 CHECK(restored.stopped&&!restored.needs_advance&&restored.elapsed==17&&restored.fps_rate==.75f&&restored.pending_seek_delta==3);
 CHECK(restored.root_state->current_frame==21&&restored.root_state->stopped&&!restored.root_state->suppress_advance&&restored.root_state->jump_target==8);
 CHECK(restored.root_state->last_script_keys[0]==5&&restored.root_state->children[0]->current_frame==9);
 CHECK(!strcmp(restored.proxy_names[1]->text,"portrait/replaced"));
 struct iarray_writer old={0};iarray_write_string(&old,str("old.flat"));iarray_write(&old,12345);
 r=(struct iarray_reader){(union vm_value*)old.data,old.size,0,0};struct parts_flat legacy={0};load_parts_flat(&r,NULL,&legacy,12);
 CHECK(!r.error&&legacy.needs_advance&&legacy.root_state->current_frame==0&&iarray_read(&r)==12345);
 struct iarray_writer layer={0};save_flat_layer(&layer,f.root_state);
 r=(struct iarray_reader){(union vm_value*)layer.data,layer.size-1,0,0};CHECK(!load_flat_layer(&r,0)&&r.error);
 layer.data[5]=0x7fffffff;r=(struct iarray_reader){(union vm_value*)layer.data,layer.size,0,0};CHECK(!load_flat_layer(&r,0)&&r.error);
 struct iarray_writer deep={0};for(int i=0;i<131;i++){iarray_write(&deep,1);iarray_write(&deep,0);iarray_write(&deep,0);iarray_write(&deep,0);iarray_write(&deep,-1);iarray_write(&deep,1);iarray_write(&deep,-2);}iarray_write(&deep,0);
 r=(struct iarray_reader){(union vm_value*)deep.data,deep.size,0,0};CHECK(!load_flat_layer(&r,0)&&r.error);
 return 0;
}
"""
run('review-flat-state-roundtrip', source)

source=base+r"""
struct parts{int no,nr_radio_children,*radio_children;bool checkbox_checked;};struct parts controls[5];
struct parts *parts_get(int no){return &controls[no];}struct parts *parts_try_get(int no){return no>=0&&no<5?&controls[no]:NULL;}
#define PARTS_LIST_FOREACH(p) for(p=controls;p<controls+5;p++)
int refreshes,changed,group_changed;
#define PARTS_MSG_CHANGED_FLAG 22
#define PARTS_MSG_CHANGED 21
void PA_RefreshCheckBox(int no){refreshes++;}
void parts_msg_push(struct parts *p,int type,const char *format,...){if(type==PARTS_MSG_CHANGED_FLAG){if(strcmp(format,"b"))__builtin_trap();changed++;}else if(type==PARTS_MSG_CHANGED)group_changed++;}
"""
for name in ('PA_IsRadioButtonBoxExistGUI','PA_AddRadioButtonBoxChild','PA_RemoveRadioButtonBoxChild','PA_NumofRadioButtonBoxChild','PA_GetRadioButtonBoxChild','PA_ClearRadioButtonBoxChild','PE_CheckBoxChecked','parts_checkbox_click'):
    source+=function('src/hll/PartsActivity.inc',name)+'\n'
source+=r"""
int run_tests(void){
 for(int i=0;i<5;i++)controls[i].no=i;
 PA_AddRadioButtonBoxChild(1,2);PA_AddRadioButtonBoxChild(1,3);PA_AddRadioButtonBoxChild(1,2);
 CHECK(PA_NumofRadioButtonBoxChild(1)==2&&PA_GetRadioButtonBoxChild(1,1)==3);
 PE_CheckBoxChecked(2,true);CHECK(controls[2].checkbox_checked&&!changed&&!group_changed);
 parts_checkbox_click(&controls[3]);CHECK(!controls[2].checkbox_checked&&controls[3].checkbox_checked&&changed==1&&group_changed==1);
 parts_checkbox_click(&controls[3]);CHECK(controls[3].checkbox_checked&&changed==1&&group_changed==1);
 parts_checkbox_click(&controls[4]);parts_checkbox_click(&controls[4]);CHECK(!controls[4].checkbox_checked&&changed==3&&group_changed==1);
 PA_RemoveRadioButtonBoxChild(1,2);CHECK(PA_NumofRadioButtonBoxChild(1)==1&&!PA_IsRadioButtonBoxExistGUI(1,2));
 PA_ClearRadioButtonBoxChild(1);CHECK(PA_NumofRadioButtonBoxChild(1)==0);return 0;
}
"""
run('settings-radio-selection',source)
