// String.ReplaceRegex as Rance 10 uses it: `\{.+?\}` strips battle-log colour
// tags and `＜艾尔..＞` is replaced by the hero's name. Patterns and subjects
// are GBK, so `.` and literals must match whole double-byte characters.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
fs.mkdirSync(build,{recursive:true});
const regex=fs.readFileSync(path.join(root,'xsystem4/src/hll/regex.inc'),'utf8').replace(/\r\n/g,'\n').replace(/^#include[^\n]*$/mg,'');
const source=String.raw`
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
typedef unsigned char uint8_t;
typedef unsigned long size_t;
#define SJIS_2BYTE(b) (((uint8_t)(b) >= 0x81 && (uint8_t)(b) <= 0xfe))
static unsigned char heap[1<<20];static size_t heap_top;
static void *xmalloc(size_t n){n=(n+7)&~7ul;void *p=heap+heap_top;heap_top+=n;if(heap_top>sizeof heap)__builtin_trap();return p;}
void *memset(void *d,int c,unsigned long n){unsigned char *p=d;while(n--)*p++=(unsigned char)c;return d;}
void *memcpy(void *d,const void *s,unsigned long n){unsigned char *a=d;const unsigned char *b=s;while(n--)*a++=*b++;return d;}
static void *xcalloc(size_t n,size_t m){void *p=xmalloc(n*m);memset(p,0,n*m);return p;}
static void *xrealloc(void *old,size_t n){void *p=xmalloc(n);if(old)memcpy(p,old,n);return p;}
static void free(void *p){(void)p;}
struct string {int size;char text[256];};
static struct string EMPTY_STRING;
static struct string *string_ref(struct string *s){struct string *o=xmalloc(sizeof *o);*o=*s;return o;}
static struct string *string_dup(const struct string *s){struct string *o=xmalloc(sizeof *o);*o=*s;return o;}
static void string_append_cstr(struct string **s,const char *t,int n){memcpy((*s)->text+(*s)->size,t,n);(*s)->size+=n;(*s)->text[(*s)->size]=0;}
static void string_append(struct string **s,const struct string *t){string_append_cstr(s,t->text,t->size);}
${regex}
static struct string make(const char *t){struct string s;s.size=0;while(t[s.size]){s.text[s.size]=t[s.size];s.size++;}s.text[s.size]=0;return s;}
static int eq(const struct string *a,const char *b){int i=0;for(;i<a->size;i++)if(a->text[i]!=b[i])return 0;return b[i]==0;}
static int check(const char *subj,const char *pat,const char *rep,const char *want,bool want_valid){
 struct string s=make(subj),p=make(pat),r=make(rep);bool valid;
 struct string *out=rx_replace_all(&s,&p,&r,&valid);
 return valid==want_valid&&eq(out,want);}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 /* Battle log: non-greedy colour tags around GBK text. */
 CHECK(check("{c1}\xb5\xd0\xc8\xcb{/c}\xca\xdc\xb5\xbd\xc9\xcb\xba\xa6","\\{.+?\\}","","\xb5\xd0\xc8\xcb\xca\xdc\xb5\xbd\xc9\xcb\xba\xa6",true));
 /* Hero name: each '.' is one double-byte character. */
 CHECK(check("\xa3\xbc\xb0\xac\xb6\xfb\xc2\xb7\xb7\xc9\xa3\xbe\xcb\xb5\xb5\xc0","\xa3\xbc\xb0\xac\xb6\xfb..\xa3\xbe","\xc0\xbc\xcb\xb9","\xc0\xbc\xcb\xb9\xcb\xb5\xb5\xc0",true));
 CHECK(check("\xa3\xbc\xb0\xac\xb6\xfb\xc2\xb7\xa3\xbe\xcb\xb5\xb5\xc0","\xa3\xbc\xb0\xac\xb6\xfb..\xa3\xbe","\xc0\xbc\xcb\xb9","\xa3\xbc\xb0\xac\xb6\xfb\xc2\xb7\xa3\xbe\xcb\xb5\xb5\xc0",true));
 /* A trail byte 0x5c is part of its character, not a backslash. */
 CHECK(check("\x95\x5c{x}","\\{.+?\\}","","\x95\x5c",true));
 /* Greedy versus lazy. */
 CHECK(check("{a}b{c}","\\{.+\\}","",  "",true));
 CHECK(check("{a}b{c}","\\{.+?\\}","", "b",true));
 /* Bounded quantifier, classes, alternation, groups, anchors. */
 CHECK(check("a1234b","[0-9]{2,3}","#","a#4b",true));
 CHECK(check("cat dog","(cat|dog)","x","x x",true));
 CHECK(check("aaa","^a","b","baa",true));
 CHECK(check("aaa","a$","b","aab",true));
 CHECK(check("a b\tc","\\s","_","a_b_c",true));
 /* Empty matches advance one character. */
 CHECK(check("ab","x*","-","-a-b-",true));
 /* Unsupported syntax leaves the subject unchanged. */
 CHECK(check("abc","(","x","abc",false));
 return 0;}
`;
fs.writeFileSync(path.join(build,'regex-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'regex-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wno-unused-function','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{}});
const failed=instance.exports.run_tests();assert.equal(failed,0,`C failure ${failed}: ${source.split('\n')[failed-1]}`);
console.log('PASS: String.ReplaceRegex on GBK text: lazy colour tags, double-byte wildcards, 0x5c trail bytes, quantifiers, groups, anchors, empty matches and invalid patterns.');
