// Saves must survive the app being killed mid-write (Android low-memory
// kills, swipe-away, power loss) and failed writes: every save/config writer
// goes through atomic_file_open/commit, which writes "<path>.tmp", syncs it
// and renames it over the target, keeping the previous file on any failure.
// The helper itself runs here against an in-memory file system with injected
// faults; the writers are checked statically for the helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
fs.mkdirSync(build,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,'xsystem4/src',p),'utf8').replace(/\r\n/g,'\n');

// --- static: no save writer truncates its target in place any more ---------
const writers=[
  ['resume.c',2],['savedata.c',2],['hll/File.c',1],['hll/VSFile.c',1],['hll/vmFile.c',1],
];
for(const [file,min] of writers){
  const src=read(file);
  const opens=(src.match(/atomic_file_open\(/g)||[]).length;
  assert.ok(opens>=min,`${file}: expected >=${min} atomic_file_open, found ${opens}`);
  assert.ok(/atomic_file_commit\(/.test(src),`${file}: missing atomic_file_commit`);
  assert.doesNotMatch(src,/file_open_utf8\([^;]*"wb?"\)/,`${file}: still truncates a save in place`);
}
assert.match(read('savedata.c'),/atomic_file_write\(path, str, strlen\(str\)\)/,'save_json');
assert.match(read('hll/MsgSkip.c'),/atomic_file_write\(save_path, data, size\)/,'read flags');
assert.match(read('hll/MsgSkipAdv.inc'),/atomic_file_write\(adv_skip_path, data, size\)/,'ADV read flags');
assert.match(read('hll/CommonSystemData.c'),/atomic_file_write\(save_path, out\.buf, out\.index\)/,'CommonSystemData');

// --- dynamic: the helper against an in-memory file system ------------------
const util=read('util.c');
const helper=util.slice(util.indexOf('FILE *atomic_file_open('));
const source=String.raw`
typedef unsigned long size_t;typedef _Bool bool;enum{false,true};
#define NULL ((void*)0)
static unsigned char heap[1<<16];static size_t heap_top;
static void *xmalloc(size_t n){void *p=heap+heap_top;heap_top+=(n+15)&~15;return p;}
static void free(void *p){(void)p;}
static size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
static void *memcpy(void *d,const void *s,size_t n){for(size_t i=0;i<n;i++)((char*)d)[i]=((const char*)s)[i];return d;}
static int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
static char *strrchr(const char *s,int c){const char *r=0;for(;*s;s++)if(*s==c)r=s;return (char*)r;}
static char *strndup(const char *s,size_t n){char *d=xmalloc(n+1);memcpy(d,s,n);d[n]=0;return d;}
static int errno;static const char *strerror(int e){(void)e;return "err";}
static const char *display_utf0(const char *s){return s;}
static int warnings;
#define WARNING(...) (warnings++)
/* In-memory files: name -> contents. */
#define NF 8
static struct {char name[64];char data[64];size_t len;bool used;} files[NF];
static int find(const char *n){for(int i=0;i<NF;i++)if(files[i].used&&!strcmp(files[i].name,n))return i;return -1;}
static int create(const char *n){int i=find(n);if(i<0){i=0;while(i<NF&&files[i].used)i++;files[i].used=1;memcpy(files[i].name,n,strlen(n)+1);}files[i].len=0;return i;}
typedef struct FILE {int idx;bool err;} FILE;static FILE fobj[4];static int nfobj;
static int fail_open,fail_write,fail_sync,fail_close,fail_rename;
static FILE *file_open_utf8(const char *n,const char *mode){(void)mode;if(fail_open)return 0;FILE *f=&fobj[nfobj++%4];f->idx=create(n);f->err=0;return f;}
static size_t fwrite(const void *p,size_t sz,size_t n,FILE *f){if(fail_write){f->err=1;return 0;}memcpy(files[f->idx].data+files[f->idx].len,p,sz*n);files[f->idx].len+=sz*n;return n;}
static int fflush(FILE *f){(void)f;return 0;}
static int ferror(FILE *f){return f->err;}
static int fileno(FILE *f){return f->idx;}
static int fsync(int fd){(void)fd;return fail_sync?-1:0;}
static int fclose(FILE *f){(void)f;return fail_close?-1:0;}
static int rename(const char *a,const char *b){if(fail_rename)return -1;int i=find(a),j=find(b);if(i<0)return -1;if(j>=0)files[j].used=0;memcpy(files[i].name,b,strlen(b)+1);return 0;}
static int remove_utf8(const char *n){int i=find(n);if(i>=0)files[i].used=0;return 0;}
#define O_RDONLY 0
static int open(const char *p,int f){(void)p;(void)f;return 3;}
static int close(int fd){(void)fd;return 0;}
${helper}
static bool is(const char *n,const char *data){int i=find(n);if(i<0)return 0;size_t l=strlen(data);if(files[i].len!=l)return 0;for(size_t k=0;k<l;k++)if(files[i].data[k]!=data[k])return 0;return 1;}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
static void reset(void){for(int i=0;i<NF;i++)files[i].used=0;fail_open=fail_write=fail_sync=fail_close=fail_rename=0;
 int i=create("/s/save.asd");memcpy(files[i].data,"OLD",3);files[i].len=3;}
int run_tests(void){
 /* A complete write replaces the save and leaves no temporary file. */
 reset();CHECK(atomic_file_write("/s/save.asd","NEW",3));CHECK(is("/s/save.asd","NEW"));CHECK(find("/s/save.asd.tmp")<0);
 /* Each failure keeps the previous save byte for byte and cleans up. */
 int *faults[]={&fail_write,&fail_sync,&fail_close,&fail_rename};
 for(int k=0;k<4;k++){reset();*faults[k]=1;
  CHECK(!atomic_file_write("/s/save.asd","NEW",3));CHECK(is("/s/save.asd","OLD"));
  if(faults[k]!=&fail_rename)CHECK(find("/s/save.asd.tmp")<0);}
 /* Killed between open and commit: the save is untouched. */
 reset();char *tmp;FILE *f=atomic_file_open("/s/save.asd",&tmp);CHECK(f&&!strcmp(tmp,"/s/save.asd.tmp"));
 fwrite("NE",2,1,f);CHECK(is("/s/save.asd","OLD"));
 /* A first save (no previous file) is created normally. */
 reset();remove_utf8("/s/save.asd");CHECK(atomic_file_write("/s/save.asd","NEW",3));CHECK(is("/s/save.asd","NEW"));
 /* Open failure reports false and writes nothing. */
 reset();fail_open=1;CHECK(!atomic_file_write("/s/save.asd","NEW",3));CHECK(is("/s/save.asd","OLD"));
 return 0;}
`;
const src=source.replace(/#ifdef _WIN32[\s\S]*?#else\n([\s\S]*?)#endif\n/g,'$1');
fs.writeFileSync(path.join(build,'atomic-save-test.c'),src);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'atomic-save-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wno-incompatible-library-redeclaration','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:src,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${src.split('\n')[line-1]}`);
console.log(`PASS: crash-safe saves; ${writers.length+4} writers use the atomic helper, and a failed write/sync/close/rename or a kill mid-write keeps the previous save intact.`);
