import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const text=fs.readFileSync(path.join(root,'xsystem4/src/anime4k.c'),'utf8');
function func(name){
 const m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(text);assert.ok(m,name);
 let end=text.indexOf('{',m.index),depth=0;
 do{if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}while(depth);
 return text.slice(m.index,end);
}
const source=String.raw`
typedef _Bool bool;
#define true 1
#define false 0
#define atomic_load(p) (*(p))
#define atomic_store(p,v) (*(p)=(v))
typedef unsigned int GLuint;
#define CHAIN_X2_LEN 1
#define CHAIN_X4_LEN 2
#define MAX_CHAIN_LEN 2
#define GL_BLEND 1
#define GL_FRAMEBUFFER 2
#define GL_TEXTURE0 3
#define GL_TEXTURE_2D 4
#define GL_TRIANGLES 5
#define WARNING(...) ((void)0)
int g_mode=2,g_src_w,g_src_h,g_init_mode=-1,g_failed_mode=-1,g_failed_w,g_failed_h;
bool g_failed,g_init_done;
GLuint g_copy_prog=7,g_vert_shader=8,g_vert_shader_flip=9;int g_copy_loc_tex=0;
struct a4k_file {struct {int w,h;} main_out;} g_files[2];
int init_calls,pass_calls,draw_calls,fail_init,fail_pass,blend=1,fb,vp[4];
void free_file_state(struct a4k_file *f){}
void glDeleteProgram(GLuint p){}void glDeleteShader(GLuint s){}
bool init_chain(int w,int h,int mode){init_calls++;if(fail_init)return false;g_init_done=true;g_init_mode=mode;g_files[0].main_out.w=w*2;g_files[0].main_out.h=h*2;g_files[1].main_out.w=w*4;g_files[1].main_out.h=h*4;return true;}
bool glIsEnabled(int v){return blend;}
void glDisable(int v){blend=0;}void glEnable(int v){blend=1;}
GLuint run_file(struct a4k_file *f,GLuint tex,int w,int h){pass_calls++;fb=23;return fail_pass?0:33;}
void glBindFramebuffer(int t,GLuint f){fb=f;}
void glViewport(int x,int y,int w,int h){vp[0]=x;vp[1]=y;vp[2]=w;vp[3]=h;}
void glUseProgram(GLuint p){}void glActiveTexture(int t){}void glBindTexture(int t,GLuint v){}void glUniform1i(int loc,int v){}
void glDrawArrays(int m,int first,int n){draw_calls++;}
`+['anime4k_set_mode','anime4k_get_mode','anime4k_enabled','chain_length','release_chain','anime4k_render'].map(func).join('\n')+String.raw`
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 /* No image-content readback is supplied: production presentation must not
    depend on a driver-specific readback or disable itself after ten frames. */
 for(int i=0;i<30;i++){CHECK(anime4k_render(11,320,240,4,5,640,480));CHECK(!g_failed&&blend&&fb==0);}
 CHECK(init_calls==1&&pass_calls==60&&draw_calls==30&&vp[0]==4&&vp[1]==5);
 anime4k_set_mode(1);CHECK(anime4k_get_mode()==1&&anime4k_enabled());
 CHECK(anime4k_render(11,320,240,0,0,800,600));CHECK(init_calls==2&&pass_calls==61);
 CHECK(anime4k_render(12,640,480,0,0,800,600));CHECK(init_calls==3&&g_src_w==640&&g_src_h==480);
 fail_pass=1;CHECK(!anime4k_render(12,640,480,0,0,800,600)&&blend&&!g_failed);
 fail_pass=0;CHECK(anime4k_render(12,640,480,0,0,800,600));
 blend=0;CHECK(anime4k_render(12,640,480,0,0,800,600)&&!blend);
 anime4k_set_mode(3);CHECK(anime4k_render(12,640,480,0,0,800,600)&&g_init_mode==3);
 int before=pass_calls;CHECK(anime4k_render(12,640,480,0,0,800,600)&&pass_calls==before+1);
 fail_init=1;anime4k_set_mode(2);CHECK(!anime4k_render(12,640,480,0,0,800,600)&&g_failed);
 int attempts=init_calls;CHECK(!anime4k_render(12,640,480,0,0,800,600)&&init_calls==attempts);
 fail_init=0;anime4k_set_mode(1);CHECK(anime4k_render(12,640,480,0,0,800,600)&&!g_failed);
 anime4k_set_mode(0);CHECK(!anime4k_enabled()&&!anime4k_render(12,640,480,0,0,800,600));
 anime4k_set_mode(99);CHECK(!anime4k_enabled());
 return 0;
}
`;
const build=path.join(root,'build/rance10-tests');fs.mkdirSync(build,{recursive:true});fs.writeFileSync(path.join(build,'anime4k-lifecycle-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'anime4k-lifecycle-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));const line=instance.exports.run_tests();
assert.equal(line,0,`C failure at ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: actual Anime4K presentation survives 30 frames, mode/source changes and transient pass failure; restores blend state; requires no image-content readback. GL calls are simulated, device GPU verification pending.');
