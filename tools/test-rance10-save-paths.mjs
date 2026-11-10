// Rance 10 retry/back-to-choice need each slot's .vsf header beside its .asd:
// the script copies, checks and deletes both through the save-folder APIs.
// Also checks that hiding the message window hides a linked part's children.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
fs.mkdirSync(build,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
function fn(file,name){const s=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(s);assert.ok(m,name);let end=s.indexOf('{',m.index),d=0;do{d+=(s[end]==='{')-(s[end]==='}');end++;}while(d);return s.slice(m.index,end);}
const source=String.raw`
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
typedef struct FILE FILE;
struct string {int size;const char *text;};
struct ain {int version;} the_ain,*ain=&the_ain;
static char buffer[2][64];static int which;
static char *tag(char t,const char *p){char *b=buffer[which^=1];int i=0;b[i++]=t;b[i++]=':';while(*p&&i<63)b[i++]=*p++;b[i]=0;return b;}
char *savedir_path(const char *p){return tag('S',p);}
char *gamedir_path(const char *p){return tag('G',p);}
static char opened[64];static FILE *fake=(FILE*)16;
FILE *file_open_utf8(const char *u,const char *mode){int i=0;while(u[i]&&i<63){opened[i]=u[i];i++;}opened[i]=0;(void)mode;return fake;}
int fclose(FILE *f){(void)f;return 0;}
void free(void *p){(void)p;}
int errno;char *strerror(int e){(void)e;return "";}
const char *display_utf0(const char *s){return s;}
#define WARNING(...) ((void)0)
static bool vs_read;static FILE *vs_file;
${fn('src/hll/VSFile.c','vsfile_open')}
struct parts {struct parts *parent;bool message_window;};
${fn('src/parts/render.c','parts_hidden_with_message_window')}
static int eq(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 struct string slot={6,"01.vsf"};
 the_ain.version=11;vs_file=NULL;CHECK(vsfile_open(&slot,false)&&eq(opened,"S:01.vsf"));
 vs_file=NULL;CHECK(vsfile_open(&slot,true)&&eq(opened,"S:01.vsf")&&vs_read);
 the_ain.version=6;vs_file=NULL;CHECK(vsfile_open(&slot,false)&&eq(opened,"G:01.vsf"));
 struct parts plate={NULL,true},base={&plate,false},name={&base,false},other={NULL,false};
 CHECK(parts_hidden_with_message_window(&plate));
 CHECK(parts_hidden_with_message_window(&name));
 CHECK(!parts_hidden_with_message_window(&other));
 return 0;}
`;
fs.writeFileSync(path.join(build,'save-paths-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'save-paths-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: AIN 11 VSFile save headers live beside .asd saves (older games keep game-directory paths); message-window links hide descendants.');
