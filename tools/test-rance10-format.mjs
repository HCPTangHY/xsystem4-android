import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build','rance10-tests');
const strings=fs.readFileSync(path.join(root,'xsystem4','subprojects','libsys4','src','string.c'),'utf8');
const stringHelpers=strings.slice(strings.indexOf('void string_append_cstr('),strings.indexOf('void string_pop_back('));
const numberHelper=strings.slice(strings.indexOf('static void number_zen2han('),strings.indexOf('int string_to_integer('));
const sjisMacro=fs.readFileSync(path.join(root,'xsystem4','subprojects','libsys4','include','system4','utfsjis.h'),'utf8').replace(/\\\r?\n/g,' ').match(/^#define SJIS_2BYTE.*$/m)[0];
const source=String.raw`
typedef unsigned int size_t;
typedef unsigned char uint8_t;
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
int warnings,unrefs,last_padding,last_zenkaku;
bool game_rance10_cn;
bool sys4_text_is_sjis;
#define WARNING(...) (warnings++)
void *memset(void *dst,int c,size_t n){char *p=dst;while(n--)*p++=c;return dst;}
void *memcpy(void *dst,const void *src,size_t n){char *d=dst;const char *s=src;while(n--)*d++=*s++;return dst;}
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return *a-*b;}
union vm_value {int i;float f;};
enum string_format_type {STRFMT_INT=2,STRFMT_FLOAT=3,STRFMT_STRING=4,STRFMT_BOOL=48,STRFMT_LONG_INT=56};
struct string {int size;char text[1024];};
struct string EMPTY_STRING,pool[64],operand={.size=5,.text="alice"};int used;
struct string *string_ref(struct string *s){struct string *d=&pool[used++];*d=*s;return d;}
struct string *string_realloc(struct string *s,unsigned int n){s->size=n;s->text[n]=0;return s;}
`+sjisMacro+'\n'+stringHelpers+'\n'+numberHelper+String.raw`
struct string *heap_get_string(int slot){return &operand;}
void heap_unref(int slot){unrefs++;}
/* Model the numeric dependency's SJIS output so the actual formatter must
   produce exact GBK bytes for EX node-name comparisons in the CN edition. */
int int_to_cstr(char *out,int cap,int value,int padding,bool zero,bool zen){
 last_padding=padding;last_zenkaku=zen;char digits[20];int n=0,k=0;
 do{digits[n++]='0'+value%10;value/=10;}while(value);
 while(k<padding-n)out[k++]=zero?'0':' ';
 while(n)out[k++]=digits[--n];
 if(zen){for(int i=k-1;i>=0;i--){char c=out[i];out[2*i]=c==' '?0x81:0x82;out[2*i+1]=c==' '?0x40:0x4f+c-'0';}k*=2;}
 out[k]=0;return k;
}
int float_to_cstr(char *out,int cap,float v,int pad,bool zero,int precision,bool zen){return 0;}
`+fs.readFileSync(path.join(root,'xsystem4','src','format.c'),'utf8').replace(/^#include.*$/gm,'')+String.raw`
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 /* First-battle conditions contain GBK full-width digits, as do generated
    EX node names. Verify conversion and termination before parsing them. */
 char round[]="\xa3\xb1\xc2\xd6";number_zen2han(round);
 CHECK(!strcmp(round,"1\xc2\xd6"));
 char cn[]="\xa1\xa1\xa3\xad\xa3\xb1\xa3\xb2";number_zen2han(cn);
 CHECK(!strcmp(cn," -12"));
 char jp[]="\x82\x50\x82\x51";number_zen2han(jp);
 CHECK(!strcmp(jp,"12"));
 char ascii[]="12345";number_zen2han(ascii);CHECK(!strcmp(ascii,"12345"));
 char chinese[]="\xd6\xd0\xce\xc4";number_zen2han(chinese);
 CHECK(!strcmp(chinese,"\xd6\xd0\xce\xc4"));
 char truncated[]="\xa3";number_zen2han(truncated);CHECK(!strcmp(truncated,"\xa3"));
 struct string fmt={.size=7,.text="%%0%dD"};
 struct string *first=string_format(&fmt,(union vm_value){.i=5},STRFMT_INT);
 CHECK(!strcmp(first->text,"%05D")&&warnings==0);
 struct string *second=string_format(first,(union vm_value){.i=42},STRFMT_INT);
 CHECK(!strcmp(second->text,"\x82\x4f\x82\x4f\x82\x4f\x82\x53\x82\x51")&&last_padding==5&&last_zenkaku&&warnings==0);
 game_rance10_cn=true;
 fmt=(struct string){.text="%03D"};
 second=string_format(&fmt,(union vm_value){.i=1},STRFMT_INT);
 CHECK(second->size==6&&!strcmp(second->text,"\xa3\xb0\xa3\xb0\xa3\xb1"));
 fmt=(struct string){.text="%D"};
 second=string_format(&fmt,(union vm_value){.i=1234567890},STRFMT_INT);
 CHECK(!strcmp(second->text,"\xa3\xb1\xa3\xb2\xa3\xb3\xa3\xb4\xa3\xb5\xa3\xb6\xa3\xb7\xa3\xb8\xa3\xb9\xa3\xb0"));
 fmt=(struct string){.text="%3D"};
 second=string_format(&fmt,(union vm_value){.i=1},STRFMT_INT);
 CHECK(!strcmp(second->text,"\xa1\xa1\xa1\xa1\xa3\xb1"));
 game_rance10_cn=false;
 fmt=(struct string){.text="%%05D"};first=string_format(&fmt,(union vm_value){.i=42},STRFMT_INT);
 CHECK(!strcmp(first->text,"%05D")&&warnings==0);
 fmt=(struct string){.text="%d/%d/%%"};first=string_format(&fmt,(union vm_value){.i=7},STRFMT_INT);
 CHECK(!strcmp(first->text,"7/%d/%"));
 fmt=(struct string){.text="%%%d"};first=string_format(&fmt,(union vm_value){.i=8},STRFMT_INT);
 CHECK(!strcmp(first->text,"%8"));
 fmt=(struct string){.text="%04d"};first=string_format(&fmt,(union vm_value){.i=9},STRFMT_INT);
 CHECK(!strcmp(first->text,"0009")&&!last_zenkaku);
 fmt=(struct string){.text="%s=%d"};first=string_format(&fmt,(union vm_value){.i=3},STRFMT_INT);
 CHECK(!strcmp(first->text,"%s=3"));
 fmt=(struct string){.text="[%7s] %%"};first=string_format(&fmt,(union vm_value){.i=1},STRFMT_STRING);
 CHECK(!strcmp(first->text,"[  alice] %")&&unrefs==1);
 fmt=(struct string){.text="literal %%s"};first=string_format(&fmt,(union vm_value){.i=1},STRFMT_STRING);
 CHECK(!strcmp(first->text,"literal %s")&&unrefs==2);
 fmt=(struct string){.text="empty"};first=string_format(&fmt,(union vm_value){.i=1},STRFMT_STRING);
 CHECK(!strcmp(first->text,"empty")&&unrefs==3);
 fmt=(struct string){.text="%"};first=string_format(&fmt,(union vm_value){.i=1},STRFMT_INT);
 CHECK(!strcmp(first->text,"%")&&warnings==1);
 /* Real libsys4 append functions exercise raw GBK bytes through the second
    formatting operation used by activity::detail::GetFreeName. */
 operand=(struct string){.size=4,.text="\xd6\xd0\xce\xc4"};
 fmt=(struct string){.text="%s:%d"};
 first=string_format(&fmt,(union vm_value){.i=1},STRFMT_STRING);
 CHECK(first->size==7&&!strcmp(first->text,"\xd6\xd0\xce\xc4:%d"));
 second=string_format(first,(union vm_value){.i=0},STRFMT_INT);
 CHECK(second->size==6&&!strcmp(second->text,"\xd6\xd0\xce\xc4:0"));
 struct string *next=string_format(first,(union vm_value){.i=1},STRFMT_INT);
 CHECK(next->size==6&&!strcmp(next->text,"\xd6\xd0\xce\xc4:1"));
 CHECK(strcmp(second->text,next->text)&&unrefs==4);
 fmt=(struct string){.text="\x81\xe0%%/%d/\xfe\x82"};
 first=string_format(&fmt,(union vm_value){.i=7},STRFMT_INT);
 CHECK(first->size==8&&!strcmp(first->text,"\x81\xe0%/7/\xfe\x82"));
 return 0;
}
`;
fs.mkdirSync(build,{recursive:true});fs.writeFileSync(path.join(build,'format-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'format-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));const line=instance.exports.run_tests();
assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: actual string formatter: Rance 10 two-stage %%0%dD, escaped percent, one substitution, width/full-width flags, unmatched string ownership.');
