import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = fs.readFileSync(path.join(root, 'xsystem4/src/asset_manager.c'), 'utf8');
const start = engine.indexOf('static bool afa_load_archive(');
let end = engine.indexOf('{', start), depth = 0;
do { if (engine[end] === '{') depth++; if (engine[end] === '}') depth--; end++; } while (depth);
function func(name){const at=engine.indexOf(`static char *${name}(`);let j=engine.indexOf('{',at),d=0;do{if(engine[j]==='{')d++;if(engine[j]==='}')d--;j++;}while(d);return engine.slice(at,j);}
const source = `
typedef unsigned int size_t; typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define MAX_ARCHIVES 8
#define PATH_MAX 128
#define MMAP_IF_64BIT 0
#define ERROR(...) __builtin_trap()
#define WARNING(...) ((void)0)
#define display_utf0(s) (s)
#define SJIS_2BYTE(b) ((unsigned char)(b)>=0x81 && (unsigned char)(b)<=0xfe)
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
char temp_name[256];void *xmalloc(size_t n){if(n>sizeof(temp_name))__builtin_trap();return temp_name;}
void free(void *p){(void)p;}
${func('asset_gbk_number_name')}
struct asset_manager {int unused;};
struct afa_archive {char *filename;};
struct asset_manager_afa {struct asset_manager manager; struct afa_archive *archives[MAX_ARCHIVES];};
void *memmove(void *dst,const void *src,size_t n){char *d=dst;const char *s=src;if(d>s){for(size_t i=n;i>0;i--)d[i-1]=s[i-1];}else{for(size_t i=0;i<n;i++)d[i]=s[i];}return dst;}
int lower(int c){return c>='A'&&c<='Z'?c+32:c;}
int strcasecmp(const char *a,const char *b){while(*a&&lower(*a)==lower(*b)){a++;b++;}return lower(*a)-lower(*b);}
int snprintf(char *dst,size_t size,const char *format,const char *name){int i=0;while(*name&&i<(int)size-1)dst[i++]=*name++;format+=2;while(*format&&i<(int)size-1)dst[i++]=*format++;dst[i]=0;return i;}
int opens, fail;struct afa_archive fresh={"new.afa"};
struct afa_archive *afa_open(const char *path,int flags,int *error){(void)path;(void)flags;(void)error;opens++;return fail?NULL:&fresh;}
void log_archive_info(const char *path,struct afa_archive *ar){(void)path;(void)ar;}
${engine.slice(start, end)}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 struct afa_archive old[8]={{"a.afa"},{"b.afa"},{"c.afa"},{"d.afa"},{"e.afa"},{"f.afa"},{"g.afa"},{"h.afa"}};
 struct asset_manager_afa manager={0};for(int i=0;i<8;i++)manager.archives[i]=&old[i];
 CHECK(afa_load_archive(&manager.manager,"d"));CHECK(!opens&&manager.archives[0]==&old[3]&&manager.archives[1]==&old[0]&&manager.archives[3]==&old[2]&&manager.archives[7]==&old[7]);
 CHECK(afa_load_archive(&manager.manager,"H"));CHECK(!opens&&manager.archives[0]==&old[7]&&manager.archives[1]==&old[3]);
 for(int i=0;i<8;i++)for(int j=i+1;j<8;j++)CHECK(manager.archives[i]!=manager.archives[j]);
 manager.archives[7]=NULL;fail=1;CHECK(!afa_load_archive(&manager.manager,"missing"));CHECK(opens==2&&manager.archives[0]==&old[7]&&!manager.archives[7]);
 fail=0;CHECK(afa_load_archive(&manager.manager,"new"));CHECK(opens==3&&manager.archives[0]==&fresh&&manager.archives[1]==&old[7]);
 CHECK(afa_load_archive(&manager.manager,"new"));CHECK(opens==3);
 const char *converted=asset_gbk_number_name("route/\\x82\\x4f\\x82\\x54.ajp");
 CHECK(converted&&!strcmp(converted,"route/\\xa3\\xb0\\xa3\\xb5.ajp"));
 CHECK(!asset_gbk_number_name("route/\\xa3\\xb0\\xa3\\xb5.ajp"));
 CHECK(!asset_gbk_number_name("\\x81\\x82O/plain"));
 CHECK(!asset_gbk_number_name("plain/\\x82"));
 return 0;
}
`;
const build = path.join(root, 'build/rance10-tests');
fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, 'assets-test.c'), source);
const compiler = process.env.RANCE10_TEST_CLANG || path.resolve(root, '../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm = path.join(build, 'assets-test.wasm');
const result = spawnSync(compiler, ['--target=wasm32-unknown-unknown', '-x', 'c', '-std=gnu11', '-O1', '-fno-builtin', '-nostdlib', '-Werror', '-Wl,--no-entry', '-Wl,--export=run_tests', '-o', wasm, '-'], { input: source, encoding: 'utf8', env: { ...process.env, TEMP: build, TMP: build } });
assert.equal(result.status, 0, result.stderr || result.stdout);
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasm));
const line = instance.exports.run_tests();
assert.equal(line, 0, `C failure at ${line}: ${source.split('\n')[line - 1]}`);
console.log('PASS: actual archive loader reuses a full archive set, preserves load precedence, handles case and failed opens.');
