"""Test actual encoding, LS0, motion-clock and system-data code outside the game."""
from pathlib import Path
import argparse
import os
import re
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--serial', required=True)
args = p.parse_args()
root = Path(__file__).resolve().parent.parent
engine = root / 'xsystem4'
lib = engine / 'subprojects/libsys4'
build = root / 'build/rance89-tests'
build.mkdir(parents=True, exist_ok=True)


def function(path, name):
    text = path.read_text('utf8')
    m = re.search(r'^[^\n;{}]*\b' + name + r'\([^;{}]*\)\s*\{', text, re.M)
    assert m, name
    end = text.index('{', m.start()); depth = 0
    while True:
        depth += (text[end] == '{') - (text[end] == '}'); end += 1
        if not depth:
            return text[m.start():end] + '\n'


source = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>
#include <unistd.h>
#include "system4.h"
#include "system4/string.h"
#include "system4/utfsjis.h"
#include "system4/file.h"
#include "system4/little_endian.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %d: %s\n",__LINE__,#x); exit(1); } } while(0)
void *_xmalloc(size_t n,const char *f){void *p=malloc(n);CHECK(p);return p;}
void *_xcalloc(size_t n,size_t z,const char *f){void *p=calloc(n,z);CHECK(p);return p;}
void *_xrealloc(void *p,size_t n,const char *f){p=realloc(p,n);CHECK(p);return p;}
char *_xstrdup(const char *s,const char *f){return strdup(s);}
_Noreturn void sys_error(const char *fmt,...){va_list ap;va_start(ap,fmt);vfprintf(stderr,fmt,ap);va_end(ap);exit(1);}
void sys_warning(const char *fmt,...){va_list ap;va_start(ap,fmt);vfprintf(stderr,fmt,ap);va_end(ap);}
static const char *test_dir;
char *savedir_path(const char *name){char *p=malloc(strlen(test_dir)+strlen(name)+2);sprintf(p,"%s/%s",test_dir,name);return p;}
char *gamedir_path(const char *name){return savedir_path(name);}
FILE *file_open_utf8(const char *name,const char *mode){return fopen(name,mode);}
void *file_read(const char *name,size_t *size){FILE *f=fopen(name,"rb");if(!f)return NULL;fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);
 unsigned char *b=malloc(n+1);CHECK(fread(b,1,n,f)==n);CHECK(!fclose(f));b[n]=0;if(size)*size=n;return b;}
bool file_write(const char *name,uint8_t *b,size_t n){FILE *f=fopen(name,"wb");if(!f)return false;bool ok=fwrite(b,1,n,f)==n;return fclose(f)==0&&ok;}
bool file_exists(const char *name){return access(name,F_OK)==0;}
int remove_utf8(const char *name){return remove(name);}
struct ain {int nr_messages;struct string **messages;};
'''
source += function(engine / 'src/hacks.c', 'script_text_uses_sjis')
csd = (engine / 'src/hll/CommonSystemData.c').read_text('utf8').split('HLL_LIBRARY(CommonSystemData,')[0]
csd = re.sub(r'^#include "(?:hll|xsystem4)\.h"\s*$', '', csd, flags=re.M)
source += csd
source += r'''
typedef float vec2[2];typedef float vec3[3];typedef float mat4[4][4];typedef float mat3x4[3][4];
#define GLM_MAT4_IDENTITY_INIT {{1,0,0,0},{0,1,0,0},{0,0,1,0},{0,0,0,1}}
enum { RE_REIGN_PLUGIN,RE_TAPIR_PLUGIN,RE_SEAL_PLUGIN };
enum { RE_FOG_NONE,RE_FOG_LINEAR,RE_FOG_LIGHT_SCATTERING };
enum { RE_ITYPE_SKINNED=2,RE_ITYPE_PARTICLE_EFFECT=8 };
enum { RE_MOTION_STATE_STOP,RE_MOTION_STATE_NOLOOP,RE_MOTION_STATE_LOOP };
struct archive;
struct archive_data {uint8_t *data;size_t size;};
static struct archive_data setting;
static bool archived=true;
struct archive_data *archive_get_by_name(struct archive *a,const char *n){return archived?&setting:NULL;}
void archive_free_data(struct archive_data *d){}
struct mot {unsigned nr_texture_indices;int *texture_indices;};
struct motion {int state;float current_frame,frame_begin,frame_end,loop_frame_begin,loop_frame_end;struct mot *mot;int texture_index;};
struct collider {int nr_path_points;vec3 *path_points;};
struct model {struct collider *collider;int nr_bones;};
struct RE_instance {float fps;bool use_mag_speed,motion_blend_put_time;struct motion *motion,*next_motion;int type,texture_animation_index;void *s3de_effect;
struct model *model;struct RE_plugin *plugin;mat3x4 *bone_transforms;bool local_transform_needs_update;mat4 local_transform;};
struct RE_plugin {int version,fog_type;float fog_near,fog_far,fog_color[3],ls_beta_r,ls_beta_m,ls_g,ls_distance,ls_light_dir[3],ls_light_color[3],ls_sun_color[3];
struct archive *aar;int nr_instances;struct RE_instance **instances;int mag_speed;
struct {float quake_pitch,quake_yaw;bool override_active;}camera;mat4 proj_transform;};
static void glm_vec3_copy(const float *a,float *b){memcpy(b,a,12);}
static void update_bones(struct RE_instance *i){}
static void s3de_effect_update(struct RE_instance *i){}
static void particle_effect_update(struct RE_instance *i){}
static unsigned freed_instances,collision_calls;
static struct RE_instance *create_instance(struct RE_plugin *p){struct RE_instance *i=calloc(1,sizeof(*i));CHECK(i);i->plugin=p;return i;}
static void free_instance(struct RE_instance *i){freed_instances++;free(i);}
static void *resize_array(void *p,size_t old,size_t count,size_t bytes){p=realloc(p,count*bytes);CHECK(p);memset((char*)p+old*bytes,0,(count-old)*bytes);return p;}
#undef xrealloc_array
#define xrealloc_array(p,old,n,bytes) resize_array(p,old,n,bytes)
static bool collider_height(struct collider *c,vec2 p,float *height){collision_calls++;*height=12;return true;}
static bool check_collision(struct collider *c,vec2 a,vec2 b,float radius,vec2 p){collision_calls++;p[0]=b[0];p[1]=b[1];return true;}
static bool collider_find_path(struct collider *c,vec3 a,vec3 b,mat4 matrix){collision_calls++;return true;}
static bool collider_optimize_path(struct collider *c){collision_calls++;return true;}
static void RE_calc_view_matrix(void *camera,void *a,mat4 out){}
static void RE_instance_update_local_transform(struct RE_instance *i){}
static void glm_mat4_mul(mat4 a,mat4 b,mat4 out){}
static void glm_mat3x4_copy(mat3x4 a,mat4 out){}
static void glm_mat4_transpose(mat4 m){}
static void glm_mat4_mulv3(mat4 m,vec3 v,float w,vec3 out){}
#define VM_ERROR(...) sys_error(__VA_ARGS__)
'''
for name in ['RE_plugin_set_fog_type', 'RE_plugin_get_fog_type', 'RE_plugin_load_light_scattering', 'update_motion', 'RE_build_model',
             'RE_create_instance_at', 'RE_release_instance', 'RE_instance_calc_2d_detection_height', 'RE_instance_calc_2d_detection',
             'RE_instance_find_path', 'RE_instance_get_path_line', 'RE_instance_optimize_path_line', 'RE_instance_trans_local_pos_to_world_pos_by_bone']:
    source += function(engine / 'src/3d/reign.c', name)
source += r'''
static struct RE_instance *test_instance;
static struct RE_instance *get_instance(int p,int n){return p==0 && n==0?test_instance:NULL;}
'''
for name in ['ReignEngine_GetInstanceMotionBlendPutTime', 'ReignEngine_SetInstanceMotionBlendPutTime']:
    source += function(engine / 'src/hll/ReignEngine.c', name)
native = '■正在厨房里教其制作料理。'.encode('cp932')
gbk = '■描绘模式：高品质。'.encode('gbk')


def cbytes(b):
    return '"' + ''.join('\\x%02x' % x for x in b) + '"'


source += 'static const char *native_text=' + cbytes(native) + ';\n'
source += 'static const char *gbk_text=' + cbytes(gbk) + ';\n'
source += r'''
static void encoding_tests(void){
 int code;sys4_text_is_sjis=true;CHECK(sjis_char2unicode(native_text,&code)==native_text+2 && code==0x25a0);
 char *utf=sjis2utf(native_text,0);CHECK(!strcmp(utf,"■正在厨房里教其制作料理。"));free(utf);
 CHECK(sjis_count_char("\xb6\xc0")==2 && sjis_skip_char("\xb6\xc0")[0]=='\xc0');
 char invalid[]={ (char)0xff,0x41,0 };CHECK(sjis_char2unicode(invalid,&code)==invalid+1 && code=='?');
 sys4_text_is_sjis=false;CHECK(sjis_char2unicode(gbk_text,&code)==gbk_text+2 && code==0x25a0);
 utf=sjis2utf(gbk_text,0);CHECK(!strcmp(utf,"■描绘模式：高品质。"));free(utf);
 CHECK(sjis_count_char(gbk_text)==10);
 char truncated[]={ (char)0x81,0,0x41,0 };CHECK(sjis_count_char(truncated)==1 && sjis_skip_char(truncated)==truncated+1);
 sjis_normalize_path(truncated);CHECK(truncated[2]==0x41);
 struct string *messages[32];for(int i=0;i<32;i++)messages[i]=cstr_to_string(native_text);
 struct ain a={32,messages};CHECK(script_text_uses_sjis(&a));
 for(int i=0;i<32;i++){free_string(messages[i]);messages[i]=cstr_to_string(gbk_text);}
 CHECK(!script_text_uses_sjis(&a));for(int i=0;i<32;i++)free_string(messages[i]);
 puts("PASS: R9 native Chinese/SJIS symbols and half-width kana; R8 GBK settings labels; encoding selection; truncated characters");
}
static void model_tests(void){
 uint8_t data[84]={0};memcpy(data,"LS0",4);LittleEndian_putDW(data,8,2);
 float values[18];for(int i=0;i<18;i++){values[i]=i+.25f;memcpy(data+12+i*4,&values[i],4);}
 setting=(struct archive_data){data,sizeof(data)};
 struct RE_plugin p={.version=1};CHECK(RE_plugin_load_light_scattering(&p,"test.ls2"));
 CHECK(p.fog_type==2 && p.fog_near==.25f && p.ls_beta_r==5.25f && p.ls_light_dir[2]==-11.25f && p.ls_sun_color[2]==17.25f);
 struct RE_plugin prior=p;float nan=NAN;memcpy(data+20,&nan,4);
 CHECK(!RE_plugin_load_light_scattering(&p,"test.ls2") && !memcmp(&p,&prior,sizeof(p)));
 setting.size=83;CHECK(!RE_plugin_load_light_scattering(&p,"test.ls2") && !memcmp(&p,&prior,sizeof(p)));
 archived=false;CHECK(!RE_plugin_load_light_scattering(&p,"missing.ls2") && !memcmp(&p,&prior,sizeof(p)));archived=true;
 CHECK(RE_plugin_set_fog_type(&p,2) && RE_plugin_get_fog_type(&p)==2);
 p.version=2;CHECK(RE_plugin_set_fog_type(&p,1) && p.fog_type==2 && RE_plugin_get_fog_type(&p)==1);
 struct motion current={.state=1,.frame_end=100},next=current;
 struct RE_instance inst={.fps=30,.motion=&current,.next_motion=&next,.type=1};struct RE_instance *instances[]={&inst};
 p.nr_instances=1;p.instances=instances;test_instance=&inst;
 CHECK(RE_build_model(&p,100) && current.current_frame==3 && next.current_frame==0);
 CHECK(ReignEngine_SetInstanceMotionBlendPutTime(0,0,true) && ReignEngine_GetInstanceMotionBlendPutTime(0,0));
 CHECK(RE_build_model(&p,100) && current.current_frame==6 && next.current_frame==3);
 CHECK(!ReignEngine_SetInstanceMotionBlendPutTime(0,1,true));
 puts("PASS: original LS0 fields and coordinate conversion; malformed/missing settings retain defaults; Tapir/Seal fog modes; queued motion clock");
}
static void unloaded_model_tests(void){
 struct RE_plugin p={0};CHECK(!RE_create_instance_at(NULL,0) && !RE_create_instance_at(&p,-1));
 CHECK(!RE_release_instance(NULL,0) && !RE_release_instance(&p,0) && !RE_release_instance(&p,-1));
 struct RE_instance *first=RE_create_instance_at(&p,0);CHECK(first && p.nr_instances==1);
 CHECK(!RE_release_instance(&p,1) && !RE_release_instance(&p,INT32_MAX));
 CHECK(!RE_create_instance_at(&p,INT32_MAX) && p.instances[0]==first);
 CHECK(RE_create_instance_at(&p,3) && p.nr_instances==4 && p.instances[0]==first && !p.instances[1]);
 CHECK(RE_release_instance(&p,0) && !RE_release_instance(&p,0));
 CHECK(RE_release_instance(&p,3) && freed_instances==2);free(p.instances);
 struct RE_instance inst={0};vec3 start={0},goal={1,2,3};int count=123;float x=4,y=5,z=6;
 CHECK(RE_instance_calc_2d_detection_height(NULL,0,0)==0);
 CHECK(RE_instance_calc_2d_detection_height(&inst,0,0)==0);
 CHECK(!RE_instance_calc_2d_detection(&inst,0,0,0,1,1,1,&x,&y,&z,1) && x==4 && y==5 && z==6);
 CHECK(!RE_instance_find_path(&inst,start,goal));
 CHECK(!RE_instance_get_path_line(&inst,&count) && count==123);
 CHECK(!RE_instance_optimize_path_line(&inst) && !collision_calls);
 mat3x4 bone={0};inst.bone_transforms=&bone;
 CHECK(!RE_instance_trans_local_pos_to_world_pos_by_bone(&inst,0,start,goal));
 struct model model={0};inst.model=&model;
 CHECK(!RE_instance_find_path(&inst,start,goal));
 CHECK(!RE_instance_get_path_line(&inst,&count) && !RE_instance_optimize_path_line(&inst));
 vec3 points[2]={{0},{1,2,3}};struct collider collider={2,points};model.collider=&collider;inst.plugin=&p;
 CHECK(RE_instance_calc_2d_detection_height(&inst,0,0)==12);
 CHECK(RE_instance_calc_2d_detection(&inst,0,0,0,1,2,3,&x,&y,&z,1) && x==1 && y==12 && z==3);
 CHECK(RE_instance_find_path(&inst,start,goal));
 CHECK(RE_instance_get_path_line(&inst,&count)==points && count==2);
 CHECK(RE_instance_optimize_path_line(&inst) && collision_calls==5);
 puts("PASS: unloaded models and invalid instance IDs fail safely; valid growth, release, collision and path calls still work");
}
static void system_tests(bool writing){
 struct string *path=cstr_to_string("SaveData\\CommonSystemData.sav");CommonSystemData_SetFullPathSaveFileName(path);free_string(path);
 struct string *k=cstr_to_string("Asra_TotalPlayTime"),*s=cstr_to_string("message"),*f=cstr_to_string("float"),*b=cstr_to_string("bool");
 CHECK(CommonSystemData_LoadAtStartup());int value=-1;float fv=-1;bool bv=true;struct string *text=NULL;
 if(writing){
  CHECK(CommonSystemData_SetDataInt(k,37));CHECK(CommonSystemData_SetDataString(k,s));
  CHECK(!CommonSystemData_GetDataInt(k,&value) && value==-1);
  CHECK(CommonSystemData_SetDataInt(k,128345));
  struct string *raw=cstr_to_string(gbk_text);CHECK(CommonSystemData_SetDataString(s,raw));free_string(raw);
  CHECK(CommonSystemData_SetDataFloat(f,1.25f));CHECK(CommonSystemData_SetDataBool(b,false));
 }else{
  CHECK(CommonSystemData_GetDataInt(k,&value) && value==128345);
  CHECK(CommonSystemData_GetDataString(s,&text) && !strcmp(text->text,gbk_text));free_string(text);
  CHECK(CommonSystemData_GetDataFloat(f,&fv) && fv==1.25f);CHECK(CommonSystemData_GetDataBool(b,&bv) && !bv);
  uint8_t bad[]={0,1,2};CHECK(file_write(save_path,bad,sizeof(bad)));
  CHECK(!CommonSystemData_LoadAtStartup() && CommonSystemData_GetDataInt(k,&value) && value==128345);
  CHECK(csd_save());
 }
 free_string(k);free_string(s);free_string(f);free_string(b);csd_free_table(table);table=NULL;
 puts(writing?"PASS: typed system data overwrites integer/string safely and persists every update":"PASS: system data survives a new process, preserves raw text and rejects corrupt files without losing loaded values");
}
int main(int argc,char **argv){CHECK(argc==3);test_dir=argv[2];encoding_tests();model_tests();unloaded_model_tests();system_tests(!strcmp(argv[1],"write"));free(save_path);return 0;}
'''
cfile = build / 'rance89-core-test.c'; cfile.write_text(source, encoding='utf8')
binary = build / 'rance89-core-test'
compiler = root.parent / 'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
subprocess.run([str(compiler), '--target=aarch64-linux-android28', '-std=gnu11', '-O1', '-ffunction-sections', '-fdata-sections',
                '-Wl,--gc-sections', '-I', str(lib / 'include'), str(cfile),
                *[str(lib / ('src/' + n + '.c')) for n in ['utfsjis', 'buffer', 'hashtable', 'string']], '-o', str(binary), '-lm'],
               check=True, env={**os.environ, 'TEMP': str(build), 'TMP': str(build)})
adb = [str(root.parent / 'android-build/sdk/platform-tools/adb.exe'), '-s', args.serial]
remote = '/data/local/tmp/xsystem4-rance89-core-test'
directory = remote + '-data'
try:
    subprocess.run(adb + ['push', str(binary), remote], check=True)
    subprocess.run(adb + ['shell', 'chmod', '700', remote], check=True)
    subprocess.run(adb + ['shell', 'mkdir', '-p', directory], check=True)
    for mode in ['write', 'read']:
        subprocess.run(adb + ['shell', remote, mode, directory], check=True)
finally:
    subprocess.run(adb + ['shell', 'rm', '-f', remote, directory + '/CommonSystemData.sav.xsystem4', directory + '/CommonSystemData.sav.xsystem4.tmp'], check=True)
    subprocess.run(adb + ['shell', 'rmdir', directory], check=True)
