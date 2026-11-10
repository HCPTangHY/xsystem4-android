"""Exercise modern Kiwi channel ownership without decoding audio or starting a game."""
from pathlib import Path
import subprocess, os, json
root=Path(__file__).resolve().parent.parent
build=root/'build/rance10-tests'
build.mkdir(parents=True,exist_ok=True)
source=r'''
typedef unsigned size_t;typedef unsigned Uint32;typedef long long int64_t;typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define INT_MAX 2147483647
#define AUDIO_NO_METADATA -1
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
#define CHECK(x) do {if(!(x))return __LINE__;}while(0)
char arena[65536];unsigned used;
void *xcalloc(size_t n,size_t z){void *p=arena+used;used=(used+n*z+7)&~7;if(used>sizeof(arena))__builtin_trap();return p;}
void *xrealloc(void *old,size_t n){void *p=xcalloc(n,1);if(old)for(size_t i=0;i<n-sizeof(void*);i++)((char*)p)[i]=((char*)old)[i];return p;}
void free(void *p){(void)p;}
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return *a-*b;}
char *xstrdup(const char *s){size_t n=strlen(s)+1;char *p=xcalloc(n,1);for(size_t i=0;i<n;i++)p[i]=s[i];return p;}
char *archive_basename(const char *s){char *p=xstrdup(s);for(int i=0;p[i];i++){if(p[i]=='.'){p[i]=0;break;}if(p[i]>='a'&&p[i]<='z')p[i]-=32;}return p;}
struct string {const char *text;};struct archive_data {int value;unsigned char *data;size_t size;};
void archive_free_data(struct archive_data *d){(void)d;}
enum {EX_INT=1,EX_STRING=3};
struct ex_value {int type;union {int i;struct string *s;};};
struct ex_table {unsigned nr_rows;struct ex_value rows[2][4];};struct ex {int unused;};
struct ex metadata;struct string ok_name={"ok"},bgm_name={"opus"};
struct ex_table sound_info={2,{{{EX_STRING,.s=&ok_name},{EX_INT,.i=2},{EX_INT,.i=13},{EX_INT,.i=24}},{{EX_STRING,.s=&bgm_name},{EX_INT,.i=1},{EX_INT,.i=200},{EX_INT,.i=900}}}};
struct ex *ex_read(const unsigned char *d,size_t n){return &metadata;}
void ex_free(struct ex *e){(void)e;}
struct ex_table *ex_get_table(struct ex *e,const char *name){return &sound_info;}
int ex_row_at_string_key(struct ex_table *t,const char *s){for(unsigned i=0;i<t->nr_rows;i++)if(!strcmp(s,t->rows[i][0].s->text))return i;return -1;}
int ex_col_from_name(struct ex_table *t,const char *s){return !strcmp(s,"Group")?1:!strcmp(s,"LoopBeginSample")?2:!strcmp(s,"LoopEndSample")?3:-1;}
struct ex_value *ex_table_get(struct ex_table *t,unsigned r,unsigned c){return r<t->nr_rows&&c<4?&t->rows[r][c]:NULL;}
void free_string(struct string *s){(void)s;}
struct string *cstr_to_string(const char *s){struct string *r=xcalloc(1,sizeof(*r));r->text=s;return r;}
enum asset_type {ASSET_BGM,ASSET_SOUND,ASSET_VOICE};
struct archive_data data;int fail_decode,opens,closes,active_channels;
struct channel {int playing,closed,group,begin,end;};
struct channel *channel_open_archive_data(struct archive_data *d,enum asset_type t,int n){if(fail_decode)return NULL;struct channel *c=xcalloc(1,sizeof(*c));opens++;active_channels++;return c;}
void channel_close(struct channel *c){if(c->closed)__builtin_trap();c->closed=1;c->playing=0;closes++;active_channels--;}
int channel_play(struct channel *c){if(c->closed)__builtin_trap();c->playing=1;return 1;}
int channel_stop(struct channel *c){c->playing=0;return 1;}
int channel_is_playing(struct channel *c){return c->playing;}
#define SIMPLE(fn) int fn(struct channel *c){return !c->closed;}
SIMPLE(channel_pause) SIMPLE(channel_restart) SIMPLE(channel_is_paused)
SIMPLE(channel_get_pos) SIMPLE(channel_get_length) SIMPLE(channel_get_loop_count)
SIMPLE(channel_stop_fade) SIMPLE(channel_is_fading)
int channel_set_loop_count(struct channel *c,int n){return 1;}
int channel_get_group(struct channel *c){return c->group;}
bool channel_set_group(struct channel *c,int n){c->group=n;return true;}
int channel_get_sample_length(struct channel *c){return 1000;}
int channel_set_loop_start_pos(struct channel *c,int n){c->begin=n;return 1;}
int channel_set_loop_end_pos(struct channel *c,int n){c->end=n;return 1;}
int channel_seek(struct channel *c,int n){return 1;}
int fade_volume;int channel_fade(struct channel *c,int t,int v,bool stop){fade_volume=v;return 1;}
struct id_pool {void **slots;int nr_slots;};
void id_pool_init(struct id_pool *p,int base){p->nr_slots=64;p->slots=xcalloc(64,sizeof(void*));}
void id_pool_delete(struct id_pool *p){p->slots=NULL;p->nr_slots=0;}
void *id_pool_get(struct id_pool *p,int i){return i>=0&&i<p->nr_slots?p->slots[i]:NULL;}
void *id_pool_set(struct id_pool *p,int i,void *s){if(i<0||i>=p->nr_slots)__builtin_trap();void *old=p->slots[i];p->slots[i]=s;return old;}
void *id_pool_release(struct id_pool *p,int i){void *s=id_pool_get(p,i);if(s)p->slots[i]=NULL;return s;}
struct archive_data *asset_get_by_name(enum asset_type t,const char *s,int *n){if(t==ASSET_SOUND&&(s[0]=='o'||!strcmp(s,"timemap_sound.ex"))){if(n)*n=2;return &data;}return NULL;}
bool asset_exists_by_name(enum asset_type t,const char *s,int *n){return t==ASSET_SOUND&&s[0]=='o';}
int mixer_get_numof(void){return 3;}const char *mixer_get_name(int i){return "test";}
int mixer_set_name(int i,const char *s){return 1;}
int mixer_get_volume(int i,int *v){*v=80;return 1;}
struct {unsigned mixer_nr_channels;int *mixer_volumes;char **mixer_channels;int default_volume;}config={.default_volume=100};
struct {int version;} ain_data={11},*ain=&ain_data;
void audio_init(void){}
Uint32 ticks;Uint32 SDL_GetTicks(void){return ticks;}
'''
source+='\n'.join(line for line in (root/'xsystem4/src/hll/KiwiSoundNew.inc').read_text(encoding='utf-8').splitlines() if not line.startswith('#include'))
source+=r'''
int run_tests(void){
 struct string ok={"ok"},missing={"missing"},empty={""};kiwi_init();
 CHECK(config.mixer_nr_channels==6&&!strcmp(config.mixer_channels[0],"Master"));
 int volume=0;CHECK(kiwi_mixer_default(1,&volume)&&volume==100);
 CHECK(kiwi_group_volume(1)>0.79f&&kiwi_group_volume(1)<0.81f);
 CHECK(kiwi_exists_file(&ok)&&!kiwi_exists_file(&missing));
 CHECK(!kiwi_prepare(-1,&ok,&empty,false)&&!opens);
 CHECK(kiwi_prepare(1,&ok,&empty,false)&&kiwi_exists_id(1));
 struct channel *prepared=((struct kiwi_sound*)id_pool_get(&kiwi_ids,1))->channel;
 CHECK(kiwi_group(1)==2&&prepared->begin==13&&prepared->end==24);
 struct string music={"opus.ogg"};CHECK(kiwi_group_file(&music)==1&&kiwi_group_file(&missing)==-1);
 CHECK(kiwi_get_free_id(1,4)==2&&kiwi_play(1)&&kiwi_is_play(1));
 CHECK(!kiwi_prepare(1,&missing,&empty,false)&&kiwi_is_play(1));
 fail_decode=1;CHECK(!kiwi_prepare(1,&ok,&empty,false)&&kiwi_is_play(1));fail_decode=0;
 CHECK(kiwi_prepare(1,&ok,&empty,false)&&closes==1&&active_channels==1);
 CHECK(kiwi_fade(1,100,0.5f,false,0)&&fade_volume==50);
 CHECK(kiwi_fade(1,100,2.0f,false,0)&&fade_volume==100);
 CHECK(kiwi_unprepare(1)&&!kiwi_exists_id(1)&&!active_channels);
 CHECK(kiwi_prepare(1,&music,&empty,false));prepared=((struct kiwi_sound*)id_pool_get(&kiwi_ids,1))->channel;
 CHECK(kiwi_group(1)==1&&prepared->begin==200&&prepared->end==900);
 CHECK(kiwi_unprepare(1)&&!active_channels);
 CHECK(kiwi_set_se_param(3,100,true));ticks=10;
 CHECK(kiwi_play_se(3,&ok)&&active_channels==1&&kiwi_is_play_se(3));
 ticks=30;CHECK(kiwi_play_se(3,&ok)&&active_channels==1);
 ticks=120;CHECK(kiwi_play_se(3,&ok)&&active_channels==2);
 struct kiwi_sound *s=id_pool_get(&kiwi_se_ids,3);s->tails[0]->playing=0;
 ticks=230;CHECK(kiwi_play_se(3,&ok)&&active_channels==2);
 CHECK(kiwi_stop_se(3)&&!active_channels&&!kiwi_is_play_se(3));
 CHECK(kiwi_get_free_se_id(3,5)==4);
 kiwi_set_se_param(3,0,false);CHECK(kiwi_play_se(3,&ok)&&kiwi_play_se(3,&ok)&&active_channels==1);
 kiwi_fini();CHECK(!active_channels&&opens==closes);return 0;
}
'''
(build/'sound-test.c').write_text(source,encoding='utf-8')
compiler=root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
wasm=build/'sound-test.wasm'
subprocess.run([str(compiler),'--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',str(wasm),str(build/'sound-test.c')],check=True,env={**os.environ,'TEMP':str(build),'TMP':str(build)})
script="const fs=require('fs');WebAssembly.instantiate(fs.readFileSync("+json.dumps(str(wasm))+")).then(({instance})=>{const line=instance.exports.run_tests();if(line)throw Error('C assertion line '+line);console.log('PASS: modern Kiwi prepare/failure/replacement, free IDs, fade volume, SE throttle/overlap/stop and complete channel release.');});"
subprocess.run(['node','-e',script],check=True)
