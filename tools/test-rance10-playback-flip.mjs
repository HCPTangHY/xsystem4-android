// Run production audio initialization, card transforms and atlas loading offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
await import('./test-rance10-array.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
const prefix=fs.readFileSync(path.join(build,'array-test.c'),'utf8').split('/* Generic Array ABI')[0];
function fn(file,name){
 const text=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(text);
 assert.ok(m,name);let end=text.indexOf('{',m.index),depth=0;
 do{if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}while(depth);
 return text.slice(m.index,end);
}
const source=`${prefix}
typedef unsigned char uint8_t;typedef unsigned uint32_t;
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
__attribute__((import_module("env"),import_name("sinf"))) float test_sinf(float);
__attribute__((import_module("env"),import_name("cosf"))) float test_cosf(float);
#define sinf test_sinf
#define cosf test_cosf
${read('src/parts/rotation.h').replace(/^#include[^\n]*$/mg,'')}
int near(float a,float b){return a-b<0.001f&&b-a<0.001f;}

// SDL_OpenAudioDevice must see an initialized subsystem, including when
// Kiwi initializes before the graphics library. Failed opens remain retryable.
typedef int SDL_AudioDeviceID;
typedef struct {int format,freq,channels,samples;void(*callback)(void*,uint8_t*,int);} SDL_AudioSpec;
enum {SDL_INIT_AUDIO=16,AUDIO_F32=32,CHUNK_SIZE=1024};
int subsystem,init_attempts,open_attempts,unpauses,fail_init,fail_open,channel_inits;
static SDL_AudioDeviceID audio_device;
static void *mixers;
unsigned SDL_WasInit(unsigned flags){return subsystem&flags;}
int SDL_InitSubSystem(unsigned flags){init_attempts++;if(fail_init)return -1;subsystem|=flags;return 0;}
const char *SDL_GetError(void){return "test failure";}
const char *SDL_GetCurrentAudioDriver(void){return "test";}
SDL_AudioDeviceID SDL_OpenAudioDevice(const char *name,int capture,SDL_AudioSpec *want,SDL_AudioSpec *have,int flags){
 if(!(subsystem&SDL_INIT_AUDIO)||want->freq!=44100||want->channels!=2)__builtin_trap();
 open_attempts++;*have=*want;return fail_open?0:7;
}
void SDL_PauseAudioDevice(int id,int paused){if(id!=7||paused)__builtin_trap();unpauses++;}
void audio_callback(void *p,uint8_t *out,int len){(void)p;(void)out;(void)len;}
static void mixer_init_channels(void){channel_inits++;mixers=&subsystem;}
${fn('src/audio_mixer.c','mixer_init')}
struct id_pool{int initialized;};static struct id_pool wav,bgm;int pool_inits;
void id_pool_init(struct id_pool *p,int base){if(p->initialized)__builtin_trap();p->initialized=1;pool_inits++;}
#define NR_ANONYMOUS_CHANNELS 64
static int anonymous_channels[NR_ANONYMOUS_CHANNELS];
${fn('src/audio.c','audio_init')}

typedef float mat4[4][4];typedef float vec3[3];
typedef struct{int x,y;} Point;typedef struct{int x,y,w,h;} Rectangle;
struct texture{int handle,w,h;};
struct parts_common{struct texture texture;int w,h;Point origin_offset;Rectangle surface_area;};
struct parts_params{Point pos;struct{float x,y;}scale;struct{float x,y,z;}rotation;int alpha;struct{int r,g,b;}add_color,multiply_color;int alpha_clipper_parts_no;};
struct parts{struct parts_params global;int draw_filter,sprite_deform;};
#define GLM_MAT4_IDENTITY_INIT {{1,0,0,0},{0,1,0,0},{0,0,1,0},{0,0,0,1}}
#define glm_rad(a) ((a)*0.01745329251994329577f)
void mul(mat4 a,mat4 b,mat4 out){mat4 t={0};for(int c=0;c<4;c++)for(int r=0;r<4;r++)for(int k=0;k<4;k++)t[c][r]+=a[k][r]*b[c][k];memcpy(out,t,sizeof(t));}
void glm_rotate_z(mat4 a,float angle,mat4 out){float c=cosf(angle),s=sinf(angle);mat4 b=GLM_MAT4_IDENTITY_INIT;b[0][0]=b[1][1]=c;b[0][1]=s;b[1][0]=-s;mul(a,b,out);}
void glm_rotate_x(mat4 a,float angle,mat4 out){float c=cosf(angle),s=sinf(angle);mat4 b=GLM_MAT4_IDENTITY_INIT;b[1][1]=b[2][2]=c;b[1][2]=s;b[2][1]=-s;mul(a,b,out);}
void glm_rotate_y(mat4 a,float angle,mat4 out){float c=cosf(angle),s=sinf(angle);mat4 b=GLM_MAT4_IDENTITY_INIT;b[0][0]=b[2][2]=c;b[0][2]=-s;b[2][0]=s;mul(a,b,out);}
void glm_translate(mat4 a,vec3 v){mat4 b=GLM_MAT4_IDENTITY_INIT;for(int i=0;i<3;i++)b[3][i]=v[i];mul(a,b,a);}
void glm_scale(mat4 a,vec3 v){for(int c=0;c<3;c++)for(int r=0;r<4;r++)a[c][r]*=v[c];}
void set_draw_filter_blend_func(int n){(void)n;}
enum{GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA,GL_ONE,GL_ZERO};
void glBlendFuncSeparate(int a,int b,int c,int d){(void)a;(void)b;(void)c;(void)d;}
mat4 quad;
void parts_render_texture(struct texture *t,mat4 m,Rectangle *r,float alpha,vec3 a,vec3 b,int filter,int clip){memcpy(quad,m,sizeof(quad));}
${fn('src/parts/render.c','parts_apply_rotation')}
${fn('src/parts/render.c','parts_render_cg')}

enum{FLAT_LIB_CG=1};
struct cg_metrics{int x,y,w,h,bpp;bool has_pixel,has_alpha;int pixel_pitch,alpha_pitch;};
struct cg{int type;struct cg_metrics metrics;void *pixels;};
struct flat_library{int type;struct string *name;struct{uint8_t *data;size_t size;bool atlas;uint32_t atlas_x,atlas_y,atlas_w,atlas_h;}cg;};
struct flat{struct flat_library *libraries;};
struct parts_flat{struct flat *flat;size_t nr_libraries;struct texture *textures;};
int decodes,cg_frees,uploads;uint8_t first_pixels[16];
struct cg *cg_load_buffer(uint8_t *p,size_t size){decodes++;if(*p==255)return NULL;struct cg *c=xcalloc(1,sizeof(*c));c->metrics=(struct cg_metrics){.w=4,.h=4,.pixel_pitch=16,.has_alpha=true};c->pixels=xmalloc(64);for(int i=0;i<64;i++)((uint8_t*)c->pixels)[i]=i;return c;}
void cg_free(struct cg *c){cg_frees++;free(c->pixels);free(c);}
void gfx_init_texture_with_cg(struct texture *t,struct cg *c){t->w=c->metrics.w;t->h=c->metrics.h;t->handle=++uploads;first_pixels[t->handle]=((uint8_t*)c->pixels)[0];}
${fn('src/parts/flat.c','parts_flat_load_textures')}
int run_tests(void){
 fail_init=1;audio_init();CHECK(init_attempts==1&&open_attempts==0&&pool_inits==2&&mixers==NULL);
 for(int i=0;i<NR_ANONYMOUS_CHANNELS;i++)CHECK(anonymous_channels[i]==-1);
 fail_init=0;fail_open=1;audio_init();CHECK(init_attempts==2&&open_attempts==1&&channel_inits==1&&unpauses==0);
 fail_open=0;audio_init();CHECK(open_attempts==2&&channel_inits==1&&pool_inits==2&&unpauses==1);
 audio_init();CHECK(open_attempts==2&&unpauses==1);
 struct parts p={.global={.pos={500,300},.scale={1,1},.alpha=255}};
 struct parts_common card={.w=200,.h=300,.origin_offset={-100,-150},.texture={1,200,300}};
 for(int i=0;i<=180;i+=15){
  p.global.rotation.y=i;parts_render_cg(&p,&card);
  CHECK(near(quad[0][0],200*cosf(glm_rad(i))));
  CHECK(near(quad[3][0]+quad[0][0]*0.5f+quad[1][0]*0.5f,500));
  CHECK(parts_rotation_back_facing(0,i)==(i>=90));
  CHECK(parts_rotation_back_facing(0,i-180)==(i<=90));
 }
 for(int i=-60;i<=60;i+=30){
  p.global.rotation.x=i;p.global.rotation.y=i/2;p.global.rotation.z=20;
  mat4 m=GLM_MAT4_IDENTITY_INIT;parts_apply_rotation(m,&p.global);float r[4];
  parts_rotation_projection(i,i/2,20,r);
  CHECK(near(m[0][0],r[0])&&near(m[1][0],r[1])&&near(m[0][1],r[2])&&near(m[1][1],r[3]));
 }
 uint8_t encoded[2]={1,2};struct string label={.text="atlas"};
 struct flat_library libs[6]={0};struct texture textures[6]={0};
 struct flat f={libs};struct parts_flat flat={&f,6,textures};
 for(int i=0;i<6;i++){libs[i].type=FLAT_LIB_CG;libs[i].name=&label;libs[i].cg.data=encoded;libs[i].cg.size=1;libs[i].cg.atlas=true;libs[i].cg.atlas_x=i%2*2;libs[i].cg.atlas_y=i/2*2;libs[i].cg.atlas_w=libs[i].cg.atlas_h=2;}
 libs[4].cg.data=&encoded[1];libs[4].cg.atlas_y=0;
 libs[5].cg.atlas_x=0xffffffffu; // Bad crop must not damage the cached sheet.
 int a=allocated,b=freed;parts_flat_load_textures(&flat);
 CHECK(decodes==2&&cg_frees==2&&uploads==5&&allocated-a==freed-b);
 CHECK(first_pixels[1]==0&&first_pixels[2]==8&&first_pixels[3]==32&&first_pixels[4]==40&&first_pixels[5]==0);
 CHECK(textures[0].w==2&&textures[0].h==2&&!textures[5].handle);
 uploads=0;memset(textures,0,sizeof(textures));decodes=cg_frees=0;encoded[0]=255;
 a=allocated;b=freed;parts_flat_load_textures(&flat);
 CHECK(decodes==2&&cg_frees==1&&uploads==1&&allocated-a==freed-b);
 return 0;
}
`;
fs.writeFileSync(path.join(build,'playback-flip-test.c'),source);
const compiler=path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'playback-flip-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.error?.message||r.stderr||r.stdout);
const{instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{sinf:Math.sin,cosf:Math.cos,vm_error(line){throw Error('VM '+line);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: early SDL audio startup, failed-open retry, centered card rotation/front-back visibility, shared atlas decode/crop/failure and complete temporary resource release.');
