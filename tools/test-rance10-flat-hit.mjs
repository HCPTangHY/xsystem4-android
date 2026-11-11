import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
await import('./test-rance10-playback-flip.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
function fn(name){const s=read('src/parts/flat.c'),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(s);assert.ok(m,name);let end=s.indexOf('{',m.index),d=0;do{d+=(s[end]==='{')-(s[end]==='}');end++;}while(d);return s.slice(m.index,end);}
const playback=fs.readFileSync(path.join(build,'playback-flip-test.c'),'utf8');
let math=playback.slice(playback.indexOf('typedef float mat4'),playback.indexOf('void set_draw_filter_blend_func'));
math=math.replace('typedef float vec3[3];','typedef float vec3[3];typedef float vec2[2];').replace('struct parts{struct parts_params global;int draw_filter,sprite_deform;};','struct parts{struct parts_params global;int draw_filter,sprite_deform,origin_mode;};');
const header=read('subprojects/libsys4/include/system4/flat.h'),internal=read('src/parts/parts_internal.h');
const source=`typedef unsigned size_t;typedef unsigned uint32_t;typedef int int32_t;typedef unsigned char uint8_t;typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define max(a,b) ((a)>(b)?(a):(b))
#define fabsf __builtin_fabsf
#define FLAT_MAX_ANCESTOR_DEPTH 32
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
void *memcpy(void *d,const void *s,size_t n){char *a=d;const char *b=s;while(n--)*a++=*b++;return d;}
void *memset(void *d,int c,size_t n){char *p=d;while(n--)*p++=c;return d;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
struct string{char *text;};
__attribute__((import_module("env"),import_name("sinf"))) float sinf(float);
__attribute__((import_module("env"),import_name("cosf"))) float cosf(float);
${math}
typedef struct texture Texture;
#define glm_mat4_mul mul
void glm_mat4_identity(mat4 out){mat4 m=GLM_MAT4_IDENTITY_INIT;memcpy(out,m,sizeof(m));}
void glm_vec2_zero(vec2 out){out[0]=out[1]=0;}
${header.slice(header.indexOf('enum flat_error'),header.indexOf('struct flat *flat_open'))}
${internal.slice(internal.indexOf('struct flat_layer_state {'),internal.indexOf('struct parts_movie {'))}
${fn('parts_flat_find_library')}
${fn('parts_flat_build_layer_matrix')}
${fn('parts_flat_align_offset')}
int parts_flat_stop_motion_get_cg_lib(struct parts_flat *f,int index,int local){return local==0?1:-1;}
static bool flat_hittest_layer(struct parts_flat *,struct flat_layer_state *,struct flat_timeline *,size_t,mat4,float,float,int);
${fn('flat_hittest_key')}
${fn('flat_hittest_layer')}
${fn('parts_flat_hittest')}
int run_tests(void){
 struct string cg={"frame"},nested={"nested"};Texture textures[2]={{1,1536,20},{2,50,30}};
 struct flat_key_data_graphic keys[2]={{.pos_x=8,.pos_y=95,.scale_x=1,.scale_y=500,.alpha=255,.align=1,.area_x=1,.area_y=17,.area_width=1534,.area_height=2}};
 struct flat_timeline timeline={.type=FLAT_TIMELINE_GRAPHIC,.library_name=&cg,.frame_count=1,.graphic={.keys=keys,.count=1}};
 struct flat_library libs[2]={{.name=&cg,.type=FLAT_LIB_CG},{.name=&nested,.type=FLAT_LIB_TIMELINE}};
 struct flat flat={.hdr={.width=1920,.height=1080},.libraries=libs,.nr_libraries=2,.timelines=&timeline,.nr_timelines=1};
 struct flat_layer_state state={0};struct parts_flat f={.flat=&flat,.root_state=&state,.nr_libraries=2,.textures=textures};struct parts p={.origin_mode=1};
 CHECK(parts_flat_hittest(&p,&f,10,100));CHECK(!parts_flat_hittest(&p,&f,1873,1033));
 keys[0].alpha=0;CHECK(!parts_flat_hittest(&p,&f,10,100));keys[0].alpha=255;
 state.current_frame=1;CHECK(!parts_flat_hittest(&p,&f,10,100));state.current_frame=0;
 keys[0].area_width=keys[0].area_height=0;keys[0].pos_x=100;keys[0].pos_y=100;keys[0].scale_x=keys[0].scale_y=1;keys[0].angle_z=90;textures[0].w=40;textures[0].h=20;
 CHECK(parts_flat_hittest(&p,&f,90,110));CHECK(!parts_flat_hittest(&p,&f,110,110));
 keys[0].scale_x=0;CHECK(!parts_flat_hittest(&p,&f,90,110));keys[0].scale_x=1;keys[0].angle_z=0;
 struct flat_timeline child=timeline;struct flat_layer_state childstate={0};struct flat_layer_state *children[1]={&childstate};state.children=children;
 keys[1]=keys[0];keys[1].pos_x=20;keys[1].pos_y=10;child.graphic.keys=&keys[1];
 libs[1].timeline.timelines=&child;libs[1].timeline.nr_timelines=1;timeline.library_name=&nested;
 CHECK(parts_flat_hittest(&p,&f,125,115));CHECK(!parts_flat_hittest(&p,&f,105,105));
 struct flat_key_frame_graphic empty={0};timeline.graphic.frames=&empty;CHECK(!parts_flat_hittest(&p,&f,125,115));
 return 0;
}
`;
fs.writeFileSync(path.join(build,'flat-hit-test.c'),source);const compiler=path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'flat-hit-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-std=gnu11','-O1','-nostdlib','-fno-builtin','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-x','c','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});assert.equal(r.status,0,r.error?.message||r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{sinf:Math.sin,cosf:Math.cos}});const line=instance.exports.run_tests();assert.equal(line,0,`C assertion ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: production Flat hit geometry excludes party canvas outside its sprites; includes atlas crops, alpha, inactive frames, rotation, singular scale, nested timelines and empty frames.');
