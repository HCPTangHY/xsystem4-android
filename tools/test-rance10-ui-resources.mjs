import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8');
function fn(file,name){const s=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(s);assert.ok(m,name);let e=s.indexOf('{',m.index),d=0;do{d+=(s[e]==='{')-(s[e]==='}');e++;}while(d);return s.slice(m.index,e);}
const numeral=read('src/parts/parts_internal.h').match(/struct parts_numeral \{[\s\S]*?\};/)[0];
assert.match(read('src/hll/PartsEngine.c'),/HLL_EXPORT\(Parts_GetNumeralNumber, PE_GetNumeralNumber\)/);
const source=String.raw`
typedef unsigned size_t;typedef unsigned char uint8_t;typedef long long int_least64_t;typedef _Bool bool;
typedef unsigned GLuint;typedef unsigned GLenum;
#define true 1
#define false 0
#define NULL ((void*)0)
#define max(a,b) ((a)>(b)?(a):(b))
#define min(a,b) ((a)<(b)?(a):(b))
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
typedef struct {uint8_t r,g,b,a;} SDL_Color;
typedef struct texture{GLuint handle;int w,h;} Texture;
struct parts_common{Texture texture;int w,h;};
`+numeral+String.raw`
enum{PARTS_NUMERAL=6};
struct parts{struct{int type;struct parts_numeral num;}states[3];}fixture;
struct parts_numeral_font{Texture cg[12];}font_data[2],*parts_numeral_fonts=font_data;
int rendered,dirty,gets,last_glyph;
static Texture main_surface;static GLuint main_surface_fb,next_fb,next_texture,attachments[16];
int live_framebuffers,deleted_framebuffers;GLuint bound_fb;
void gfx_delete_texture(Texture *t){
 if(t==&main_surface&&t->handle)for(int i=1;i<16;i++)if(attachments[i]==t->handle)__builtin_trap();
 t->handle=0;
}
void gfx_init_texture_rgba(Texture *t,int w,int h,SDL_Color color){(void)color;rendered++;*t=(Texture){.handle=1000+rendered,.w=w,.h=h};}
void gfx_copy_with_alpha_map(Texture *dst,int x,int y,Texture *src,int sx,int sy,int w,int h){(void)dst;(void)x;(void)y;(void)sx;(void)sy;(void)w;(void)h;last_glyph=src->handle;}
void parts_set_dims(struct parts *p,struct parts_common *c,int w,int h){(void)p;c->w=w;c->h=h;}
void parts_dirty(struct parts *p){(void)p;dirty++;}
bool parts_state_valid(int state){return state>=0&&state<3;}
struct parts *parts_get(int no){gets++;return no==7?&fixture:NULL;}
struct parts *parts_try_get(int no){return no==7?&fixture:NULL;}
struct parts_numeral *parts_get_numeral(struct parts *p,int state){p->states[state].type=PARTS_NUMERAL;return &p->states[state].num;}
`+['parts_numeral_update','parts_numeral_set_number','PE_SetNumeralNumber','PE_GetNumeralNumber','PE_SetNumeralShowComma','PE_SetNumeralSpace','PE_SetNumeralLength'].map(n=>fn('src/parts/parts.c',n)).join('\n')+String.raw`
enum {GL_TEXTURE_2D,GL_RGB,GL_UNSIGNED_BYTE,GL_TEXTURE_MIN_FILTER,GL_TEXTURE_MAG_FILTER,GL_LINEAR,GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0};
void glDeleteFramebuffers(int n,const GLuint *names){for(int i=0;i<n;i++){if(!names[i]||names[i]>=16)__builtin_trap();attachments[names[i]]=0;live_framebuffers--;deleted_framebuffers++;}}
void glGenFramebuffers(int n,GLuint *names){for(int i=0;i<n;i++){names[i]=++next_fb;live_framebuffers++;}}
void glBindFramebuffer(GLenum target,GLuint fb){(void)target;bound_fb=fb;}
void glFramebufferTexture2D(GLenum target,GLenum attachment,GLenum tt,GLuint tex,int level){(void)target;(void)attachment;(void)tt;(void)level;attachments[bound_fb]=tex;}
void glGenTextures(int n,GLuint *names){for(int i=0;i<n;i++)names[i]=++next_texture;}
void glBindTexture(GLenum target,GLuint tex){(void)target;(void)tex;}
void glTexImage2D(GLenum t,int l,int f,int w,int h,int b,GLenum fmt,GLenum type,const void *pixels){(void)t;(void)l;(void)f;(void)w;(void)h;(void)b;(void)fmt;(void)type;(void)pixels;}
void glTexParameteri(GLenum t,GLenum p,int v){(void)t;(void)p;(void)v;}
`+fn('src/video.c','main_surface_init')+String.raw`
int run_tests(void){
 for(int f=0;f<2;f++)for(int d=0;d<12;d++)font_data[f].cg[d]=(Texture){.handle=100+f*20+d,.w=7+f,.h=10};
 struct parts_numeral *n=&fixture.states[0].num;n->font_no=0;n->rendered_font_no=-1;n->length=1;
 CHECK(PE_SetNumeralNumber(7,1234,1)&&rendered==1&&n->common.w==28);
 for(int i=0;i<1000;i++)CHECK(PE_SetNumeralNumber(7,1234,1));
 CHECK(rendered==1&&PE_GetNumeralNumber(7,1)==1234);
 n->font_no=1;CHECK(PE_SetNumeralNumber(7,1234,1)&&rendered==2&&n->common.w==32&&last_glyph>=120);
 n->common.texture.handle=0;CHECK(PE_SetNumeralNumber(7,1234,1)&&rendered==3);
 CHECK(PE_SetNumeralSpace(7,2,1)&&n->common.w==38&&rendered==4);
 CHECK(PE_SetNumeralNumber(7,1234,1)&&rendered==4);
 CHECK(PE_SetNumeralShowComma(7,true,1)&&n->common.w==48&&rendered==5);
 CHECK(PE_SetNumeralLength(7,6,1)&&rendered==6);
 CHECK(PE_SetNumeralNumber(7,-2147483647-1,1)&&PE_GetNumeralNumber(7,1)==(-2147483647-1));
 int before=gets;CHECK(PE_GetNumeralNumber(999,1)==0&&PE_GetNumeralNumber(7,0)==0&&PE_GetNumeralNumber(7,4)==0&&gets==before);
 fixture.states[1].type=99;CHECK(PE_GetNumeralNumber(7,2)==0&&fixture.states[1].type==99);
 n->have_num=false;CHECK(PE_SetNumeralNumber(7,-2147483647-1,1)&&rendered==8);
 main_surface_init(640,480);CHECK(live_framebuffers==1&&deleted_framebuffers==0&&main_surface.w==640);
 main_surface_init(1920,1080);CHECK(live_framebuffers==1&&deleted_framebuffers==1&&main_surface.w==1920);
 main_surface_init(1920,1080);CHECK(live_framebuffers==1&&deleted_framebuffers==2);
 return 0;
}
`;
fs.mkdirSync(build,{recursive:true});
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'ui-resource-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
if(r.error)throw r.error;assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));
const line=instance.exports.run_tests();assert.equal(line,0,`UI resource assertion ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: real numeral rendering/getter; 1,000 unchanged values render once, font/format/lost-texture invalidation, integer limits, read-only invalid queries; main framebuffer released on resize.');
