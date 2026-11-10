import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const libs=fs.readFileSync(path.join(root,'xsystem4/src/hll/NewerLibs.c'),'utf8');
const split=libs.slice(libs.indexOf('static struct page *String_Split('),libs.indexOf('HLL_LIBRARY(String,'));
const utf=fs.readFileSync(path.join(root,'xsystem4/subprojects/libsys4/include/system4/utfsjis.h'),'utf8');
const leadMatch=utf.match(/#define SJIS_2BYTE\(b\)[\s\S]*?\n\n/);
assert.ok(leadMatch,'Production character-boundary macro missing');
const lead=leadMatch[0];
const skip=utf.match(/static inline char \*sjis_skip_char\([^)]*\)\s*\{[^}]*\}/)[0];
// Use the game's own compound condition strings when its offline AIN dump is present.
// The fixed Boss fixture below still runs on checkouts without game assets.
const conditions=[];
const ainPath=path.resolve(root,'../android-build/r10/Rance10.ain.raw');
if(fs.existsSync(ainPath)){
 const raw=fs.readFileSync(ainPath),section=raw.indexOf(Buffer.from('STR0'),16+raw.readUInt32LE(12));
 assert.ok(section>=0,'AIN string table missing');
 let pos=section+8;
 for(let i=0;i<raw.readUInt32LE(section+4);i++){
  const end=raw.indexOf(0,pos);assert.ok(end>=pos,'Truncated AIN string');
  const bytes=raw.subarray(pos,end);pos=end+1;
  const text=new TextDecoder('gbk').decode(bytes);
  if(bytes.length>=512||!/[&|＆｜]{2}/.test(text)||!/(轮|回合|ＨＰ|HP|支援|条件|概率)/.test(text))continue;
  const normalized=[];
  for(let j=0;j<bytes.length;j++){
   if(bytes[j]===0x20)continue;
   if(bytes[j]===0xa1&&bytes[j+1]===0xa1){j++;continue;}
   normalized.push(bytes[j]);
  }
  conditions.push('"'+normalized.map(b=>'\\x'+b.toString(16).padStart(2,'0')).join('')+'"');
 }
}
const source=String.raw`
typedef unsigned size_t;
typedef unsigned char uint8_t;
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define AIN_ARRAY_STRING 17
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
struct string {int size;char text[1024];};
union vm_value {int i;float f;};
struct page {int nr_vars;union vm_value values[128];};
struct string pool[512];int used;
struct page outputs[128];int pages_used;
bool sys4_text_is_sjis;
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
void *memset(void *p,int c,size_t n){char *s=p;while(n--)*s++=c;return p;}
void *memcpy(void *p,const void *q,size_t n){char *d=p;const char *s=q;while(n--)*d++=*s++;return p;}
int memcmp(const void *a,const void *b,size_t n){const unsigned char *x=a,*y=b;while(n--){if(*x!=*y)return *x-*y;x++;y++;}return 0;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
`+lead+skip+String.raw`
struct string *make_string(const char *s,int n){if(used>=512||n<0||n>=1024)__builtin_trap();struct string *p=&pool[used++];p->size=n;for(int i=0;i<n;i++)p->text[i]=s[i];p->text[n]=0;return p;}
int heap_alloc_string(struct string *s){return s-pool;}
struct page *array_pushback(struct page *p,union vm_value value,int type,int structure){if(!p){if(pages_used>=128)__builtin_trap();p=&outputs[pages_used++];p->nr_vars=0;}if(p->nr_vars>=128)__builtin_trap();p->values[p->nr_vars++]=value;return p;}
`+split+String.raw`
void reset(void){used=pages_used=0;sys4_text_is_sjis=false;}
struct page *split_value(const char *s,const char *delimiters,bool keep){struct string *input=make_string(s,strlen(s)),*separators=make_string(delimiters,strlen(delimiters));return String_Split(&input,separators,keep);}
struct page *tokens(const char *s,bool keep){reset();return split_value(s,"{},",keep);}
const char *at(struct page *p,int i){return pool[p->values[i].i].text;}
/* Replay the two Split calls followed by tokens[0] in the real Boss path:
   BattleConditionEvaluator@Evaluate -> BattleConditionExpressionEvaluator@0.
   Keep the outer array alive while the inner split allocates its own result. */
int condition_tokens(const char *s){
 reset();struct page *outer=split_value(s,"\xa3\xa6\xa3\xfc&|",false);
 if(!outer)return -1;
 for(int i=0;i<outer->nr_vars;i++){
  if(!*at(outer,i))return -2;
  struct page *inner=split_value(at(outer,i),"\xa3\xbc\xa3\xbe\xa3\xba<>:",false);
  if(!inner||!inner->nr_vars||!*at(inner,0))return -3;
 }
 return outer->nr_vars;
}
int boolean_condition(const char *s,bool conjunction){
 reset();struct page *p=split_value(s,"&|",false);if(!p)return -1;
 int result=conjunction;
 for(int i=0;i<p->nr_vars;i++){
  // The original evaluator treats an empty expression as unconditional true.
  int value=!*at(p,i)||!strcmp(at(p,i),"T");
  if(conjunction)result=result&&value;else result=result||value;
 }
 return result;
}
/* Follow ColorText@Add's actual token indexing for RGB tags and {} reset.
   An empty field between braces makes this same walk read past the end. */
int color_text(struct page *p){int spans=0;for(int i=0;i<p->nr_vars;){
 if(!strcmp(at(p,i),"{")){
  if(i+1>=p->nr_vars)return -1;
  if(!strcmp(at(p,i+1),"}")){i+=2;continue;}
  if(i+6>=p->nr_vars||strcmp(at(p,i+2),",")||strcmp(at(p,i+4),",")||strcmp(at(p,i+6),"}"))return -2;
  i+=7;
 }else{spans++;i++;}
 }return spans;}
int run_tests(void){
 // AIN string 13230, referenced by T-enemy creation for m55 (Gahkass).
 CHECK(condition_tokens("\xd3\xd1\xb7\xbd\xa3\xc8\xa3\xd0\xa3\xb4\xa3\xb0\xa3\xa5\xd2\xd4\xc9\xcf\xa3\xa6\xa3\xa6\xb8\xc5\xc2\xca\xa3\xbc\xa3\xb3\xa3\xb0\xa3\xbe")==2);
 struct page *p=tokens("{255,120,0}Attack{}: {0,255,80}100{} damage",true);
 CHECK(p&&p->nr_vars==22&&color_text(p)==4);
 CHECK(!strcmp(at(p,0),"{")&&!strcmp(at(p,6),"}")&&!strcmp(at(p,8),"{")&&!strcmp(at(p,9),"}"));
 p=tokens("{}",true);CHECK(p&&p->nr_vars==2&&color_text(p)==0);
 p=tokens(",,a,,b,",false);CHECK(p&&p->nr_vars==4&&!strcmp(at(p,0),"")&&!strcmp(at(p,1),"a")&&!strcmp(at(p,3),""));
 CHECK(!tokens("",true));p=tokens("",false);CHECK(p&&p->nr_vars==1&&!strcmp(at(p,0),""));
 p=tokens(",,",false);CHECK(p&&p->nr_vars==2);
 struct string save_text={.size=28,.text="1|0|2|3|0|2026/10/16 20:00|"},bar={.size=1,.text="|"};
 save_text.size=strlen(save_text.text);struct string *save_ptr=&save_text;used=0;
 p=String_Split(&save_ptr,&bar,false);CHECK(p&&p->nr_vars==7&&!strcmp(at(p,6),""));
 p=tokens("plain",true);CHECK(p&&p->nr_vars==1&&color_text(p)==1);
 /* A GBK trail byte equal to '{' must stay inside its character. */
 p=tokens("\x81\x7b{}",true);CHECK(p&&p->nr_vars==3&&pool[p->values[0].i].size==2&&color_text(p)==1);
 reset();sys4_text_is_sjis=true;p=split_value("\xa6,a",",",false);CHECK(p&&p->nr_vars==2&&pool[p->values[0].i].size==1);
 CHECK(boolean_condition("T&&T",true)==1);CHECK(boolean_condition("T&&F",true)==0);
 CHECK(boolean_condition("F&&T",true)==0);CHECK(boolean_condition("F&&F",true)==0);
 CHECK(boolean_condition("T||T",false)==1);CHECK(boolean_condition("T||F",false)==1);
 CHECK(boolean_condition("F||T",false)==1);CHECK(boolean_condition("F||F",false)==0);
 CHECK(condition_tokens("HP>40&&chance<30")==2);
 CHECK(condition_tokens("support:A||support:B")==2);
 const char *corpus[]={NULL,`+conditions.join(',')+String.raw`};
 for(size_t i=1;i<sizeof(corpus)/sizeof(*corpus);i++)CHECK(condition_tokens(corpus[i])>0);
 return 0;
}
`;
fs.mkdirSync(build,{recursive:true});
fs.writeFileSync(path.join(build,'string-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'string-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
if(r.error)throw r.error;
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));
const line=instance.exports.run_tests();
assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log(`PASS: production String.Split; Boss two-stage tokenization, AND/OR truth tables, ${conditions.length} game condition strings, empty save comments, ColorText, GBK and Shift-JIS boundaries.`);
