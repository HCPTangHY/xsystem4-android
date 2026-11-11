import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const flat=fs.readFileSync(path.join(root,'xsystem4/src/parts/flat.c'),'utf8');
const getters=flat.slice(flat.indexOf('int PE_GetFlatFPS('),flat.indexOf('int PE_GetPartsFlatEndFrame('));
const source=`
typedef unsigned long size_t;
enum { PARTS_FLAT=7, FLAT_TIMELINE_SCRIPT=5 };
struct string {char *text;};
struct flat_script_key {unsigned frame_index;struct string *text;};
struct flat_timeline {int type;struct {size_t count;struct flat_script_key *keys;} script;};
struct flat {struct {int fps;} hdr;size_t nr_timelines;struct flat_timeline *timelines;};
struct parts {struct {int type;struct {struct flat *flat;} flat;} states[3];};
struct parts part;
struct parts *parts_try_get(int no){return no==12?&part:0;}
int parts_state_valid(int state){return state>=0&&state<3;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
${getters}
#define CHECK(c) do {if(!(c)) return __LINE__;} while(0)
int run_tests(void){
 struct string damage={"damage"},missing={"missing"};
 struct flat_script_key keys[]={{14,&damage}};
 struct flat_timeline timelines[]={{FLAT_TIMELINE_SCRIPT,{1,keys}}};
 struct flat effect={{30},1,timelines};
 part.states[0].type=PARTS_FLAT;part.states[0].flat.flat=&effect;
 CHECK(PE_GetFlatFPS(12,1)==30);
 CHECK(PE_GetFlatFrame(12,&damage,1)==14);
 CHECK((int)(1000.0f/PE_GetFlatFPS(12,1)*PE_GetFlatFrame(12,&damage,1))==466);
 CHECK(PE_GetFlatFrame(12,&missing,1)==-1);
 CHECK(PE_GetFlatFPS(12,0)==0&&PE_GetFlatFrame(12,&damage,4)==-1);
 CHECK(PE_GetFlatFPS(99,1)==0&&PE_GetFlatFrame(99,&damage,1)==-1);
 part.states[0].type=2;
 CHECK(PE_GetFlatFrame(12,&damage,1)==-1&&PE_GetFlatFPS(12,1)==0);
 CHECK(part.states[0].type==2&&part.states[0].flat.flat==&effect);
 return 0;
}`;
fs.mkdirSync(build,{recursive:true});
const compiler=path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'flat-info-test.wasm');
const result=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(result.status,0,result.error?.message||result.stderr);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));
const line=instance.exports.run_tests();
assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: Flat FPS/label getters, finite heal-effect wait, absent labels and non-mutating invalid queries.');
