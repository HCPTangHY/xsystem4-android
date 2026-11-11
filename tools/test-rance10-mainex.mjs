import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, 'xsystem4', name), 'utf8');
function func(file, name) {
  const text = read(file), match = new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`, 'm').exec(text);
  assert.ok(match, name);
  let end = text.indexOf('{', match.index), depth = 0;
  do { if (text[end] === '{') depth++; if (text[end] === '}') depth--; end++; } while (depth);
  return text.slice(match.index, end);
}
const exHeader = read('subprojects/libsys4/include/system4/ex.h');
const declarations = exHeader.slice(exHeader.indexOf('enum ex_value_type'), exHeader.indexOf('uint8_t *ex_decrypt'));
const hllHeader = read('src/hll/hll.h').replace(/^#include.*$/gm, '');
const mainex = read('src/hll/MainEXFile.c').replace('#include "MainEXFileNew.inc"', read('src/hll/MainEXFileNew.inc')).replace(/^#include.*$/gm, '');
const source = `
typedef unsigned int size_t; typedef unsigned int uint32_t; typedef int int32_t; typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define WARNING(...) ((void)0)
#define NOTICE(...) ((void)0)
#define ERROR(...) __builtin_trap()
#define VM_ERROR(...) __builtin_trap()
#define unlikely(c) (c)
struct string { int size,ref; char text[]; };
struct {int version;} ain_program={12},*ain=&ain_program;
enum {VM_PAGE,VM_STRING};struct {int ref,type;struct string *s;} heap[64];size_t heap_size=2;
union vm_value {int i;float f;};
struct page {int nr_vars;union vm_value values[];};
#define AIN_ARRAY_STRING 16
${['heap_index_valid','string_index_valid','heap_get_string'].map(n => func('src/heap.c', n)).join('\n')}
${declarations}
struct static_hll_function { char *name; void *fun; const char *params; };
struct static_library {char *name;struct static_hll_function functions[];};
${hllHeader}
int strcmp(const char *a,const char *b){while(*a && *a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
int strncmp(const char *a,const char *b,size_t n){for(size_t i=0;i<n;i++){if(a[i]!=b[i] || !a[i])return (unsigned char)a[i]-(unsigned char)b[i];}return 0;}
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
char *strchr(const char *s,int ch){for(;;s++){if(*s==ch)return (char*)s;if(!*s)return NULL;}}
void *memcpy(void *d,const void *s,size_t n){char *a=d;const char *b=s;for(size_t i=0;i<n;i++)a[i]=b[i];return d;}
int memcmp(const void *a,const void *b,size_t n){const unsigned char *x=a,*y=b;for(size_t i=0;i<n;i++)if(x[i]!=y[i])return x[i]-y[i];return 0;}
void *memset(void *d,int value,size_t n){char *a=d;for(size_t i=0;i<n;i++)a[i]=value;return d;}
static union {long long align;char bytes[65536];} arena;static size_t used;
void *xcalloc(size_t n,size_t s){size_t bytes=n*s;void *p=arena.bytes+used;used+=(bytes+7)&~7;if(used>sizeof(arena))__builtin_trap();return p;}
void *xrealloc(void *p,size_t s){void *result=xcalloc(1,s);if(p)memcpy(result,p,s-sizeof(void*));return result;}
void free(void *p){(void)p;}
char *xstrdup(const char *s){size_t n=strlen(s)+1;char *p=xcalloc(1,n);memcpy(p,s,n);return p;}
struct string *make(const char *text){int n=strlen(text);struct string *s=xcalloc(1,sizeof(*s)+n+1);s->size=n;s->ref=1;memcpy(s->text,text,n+1);return s;}
struct string *string_ref(struct string *s){if(!s || s->ref<1)__builtin_trap();s->ref++;return s;}
void free_string(struct string *s){if(!s || s->ref<1)__builtin_trap();s->ref--;}
int next_slot=2;
struct page *alloc_array(int rank,union vm_value *count,int type,int struc,bool init){(void)rank;(void)type;(void)struc;(void)init;struct page *p=xcalloc(1,sizeof(*p)+count->i*sizeof(union vm_value));p->nr_vars=count->i;for(int i=0;i<count->i;i++){p->values[i].i=next_slot;heap[next_slot++].s=make("");}return p;}
void heap_string_assign(int slot,struct string *s){free_string(heap[slot].s);heap[slot].s=string_ref(s);}
void delete_page_vars(struct page *p){for(int i=0;i<p->nr_vars;i++)free_string(heap[p->values[i].i].s);}
void free_page(struct page *p){(void)p;}
struct {char *ex_path;} config={"fixture.ex"};
char *gamedir_path(const char *filename){return (char*)filename;}
const char *display_utf0(const char *s){return s;}
struct ex *fixture;int reader_frees;
struct ex *ex_read_file(const char *filename){return !strcmp(filename,"missing.ex")?NULL:fixture;}
void ex_free(struct ex *reader){(void)reader;reader_frees++;}
${['ex_tree_get_path','_ex_get','ex_get','ex_table_get','ex_list_get','ex_col_from_name','ex_row_at_int_key','ex_row_at_string_key'].map(n => func('subprojects/libsys4/src/ex.c', n)).join('\n')}
${mainex}
${func('src/ffi.c', 'find_static_hll_function')}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 struct ex_block blocks[8]={0};struct ex program={6,blocks};fixture=&program;
 blocks[0].name=make("I");blocks[0].val=(struct ex_value){.type=EX_INT,.i=42};
 blocks[1].name=make("F");blocks[1].val=(struct ex_value){.type=EX_FLOAT,.f=1.25f};
 struct string *actual=make("configured"),*fallback=make("default");
 blocks[2].name=make("S");blocks[2].val=(struct ex_value){.type=EX_STRING,.s=actual};
 struct ex_list_item items[3]={0};
 items[0].value=blocks[0].val;items[1].value=blocks[1].val;items[2].value=blocks[2].val;
 struct ex_list list={3,items};blocks[3].name=make("List");blocks[3].val=(struct ex_value){.type=EX_LIST,.list=&list};
 struct ex_field fields[2]={0};fields[0].name=make("Key");fields[0].type=EX_INT;fields[0].is_index=1;fields[1].name=make("Text");fields[1].type=EX_STRING;
 struct ex_value row0[2]={{.type=EX_INT,.i=7},{.type=EX_STRING,.s=actual}},row1[2]={{.type=EX_INT,.i=9},{.type=EX_STRING,.s=make("stored")}};
 struct ex_value *rows[2]={row0,row1};struct ex_table table={.nr_fields=2,.fields=fields,.nr_columns=2,.nr_rows=2,.rows=rows};
 blocks[4].name=make("Table");blocks[4].val=(struct ex_value){.type=EX_TABLE,.t=&table};
 struct ex_tree children[3]={0};struct ex_value child_values[3]={0};
 children[0].name=make("branch");children[1].name=make("leaf1");children[1].is_leaf=true;children[1].leaf.name=make("leaf1");children[1].leaf.value=blocks[2].val;
 children[2].name=make("leaf2");children[2].is_leaf=true;children[2].leaf.name=make("leaf2");children[2].leaf.value=blocks[0].val;
 struct ex_tree tree={.name=make("Tree"),.nr_children=3,._children=child_values,.children=children};
 blocks[5].name=tree.name;blocks[5].val=(struct ex_value){.type=EX_TREE,.tree=&tree};
 MainEXFile_ModuleInit();
 CHECK(MainEXNew_Int(blocks[0].name,-5,0)==42 && MainEXNew_Int(blocks[2].name,-5,0)==-5);
 CHECK(MainEXNew_Float(blocks[1].name,9.5f,0)==1.25f && MainEXNew_Float(blocks[0].name,9.5f,0)==9.5f);
 struct string *missing=make("missing"),*out=MainEXNew_String(missing,fallback,0);
 CHECK(out==fallback && fallback->ref==2);free_string(fallback);CHECK(out->ref==1 && !strcmp(out->text,"default"));free_string(out);
 fallback=make("default");out=MainEXNew_String(blocks[2].name,fallback,0);
 free_string(fallback);CHECK(out==actual && actual->ref==2 && !strcmp(out->text,"configured"));free_string(out);
 fallback=make("default");out=MainEXNew_String(blocks[0].name,fallback,0);CHECK(out==fallback && fallback->ref==2);free_string(out);
 CHECK(MainEXNew_Int(missing,123,0)==123 && MainEXNew_Int(blocks[0].name,123,-1)==123 && MainEXNew_Int(blocks[0].name,123,123)==123);
 CHECK(MainEXNew_Type(blocks[2].name,0)==EX_STRING && MainEXNew_Exists(missing,0)==false);
 CHECK(MainEXNew_AInt(blocks[3].name,0,-5,0)==42 && MainEXNew_AInt(blocks[3].name,-1,-5,0)==-5 && MainEXNew_AInt(blocks[3].name,3,-5,0)==-5);
 CHECK(MainEXNew_AFloat(blocks[3].name,1,-5.0f,0)==1.25f && MainEXNew_AType(blocks[3].name,2,0)==EX_STRING);
 out=MainEXNew_AString(blocks[3].name,2,fallback,0);CHECK(out==actual && actual->ref==2);free_string(out);
 CHECK(MainEXNew_Row(blocks[4].name,0)==2 && MainEXNew_Col(blocks[4].name,0)==2 && MainEXNew_Row(blocks[2].name,0)==0);
 CHECK(MainEXNew_Col(blocks[3].name,0)==3 && MainEXNew_Col(missing,0)==0);
 CHECK(MainEXNew_GetRowAtIntKey(blocks[4].name,9,0)==1 && MainEXNew_GetRowAtIntKey(blocks[4].name,5,0)==-1);
 CHECK(MainEXNew_GetColAtFormatName(blocks[4].name,fields[1].name,0)==1 && MainEXNew_GetColAtFormatName(blocks[4].name,missing,0)==-1);
 CHECK(MainEXNew_A2Int(blocks[4].name,0,0,-5,0)==7 && MainEXNew_A2Int(blocks[4].name,0,1,-5,0)==-5 && MainEXNew_A2Int(blocks[4].name,-1,0,-5,0)==-5);
 out=MainEXNew_A2String(blocks[4].name,0,1,fallback,0);CHECK(out==actual);free_string(out);
 fields[0].is_index=0;fields[1].is_index=1;CHECK(MainEXNew_GetRowAtStringKey(blocks[4].name,actual,0)==0);
 row1[1].s=make("\\xa3\\xb0\\xa3\\xb4");
 CHECK(MainEXNew_GetRowAtStringKey(blocks[4].name,make("\\x82\\x4f\\x82\\x53"),0)==1);
 CHECK(MainEXFile_SA2Handle(blocks[4].val.id,make("\\x82\\x4f\\x82\\x53"),fields[0].name)==row1[0].id);
 row1[1].s=make("stored");
 CHECK(MainEXNew_GetNodeNameCount(tree.name,0)==1 && MainEXNew_GetEXNameCount(tree.name,0)==2);
 struct page *names=NULL;CHECK(MainEXNew_GetNodeNameList(tree.name,&names,0)&&names->nr_vars==1);
 CHECK(!strcmp(heap[names->values[0].i].s->text,"branch")&&children[0].name->ref==2);
 CHECK(MainEXNew_GetEXNameList(tree.name,&names,0)&&names->nr_vars==2&&children[0].name->ref==1);
 CHECK(!strcmp(heap[names->values[0].i].s->text,"leaf1")&&!strcmp(heap[names->values[1].i].s->text,"leaf2"));
 CHECK(!MainEXNew_GetNodeNameList(missing,&names,0)&&names->nr_vars==2);delete_page_vars(names);free_page(names);
 struct string *old=make("old");out=old;CHECK(MainEXNew_GetEXName(tree.name,1,&out,0) && old->ref==0 && !strcmp(out->text,"leaf2"));
 CHECK(!MainEXNew_GetEXName(tree.name,2,&out,0) && !strcmp(out->text,"leaf2"));free_string(out);
 CHECK(MainEXNew_Int(make("Tree.leaf2"),-5,0)==42);
 blocks[6].name=make("\\xa3\\xb0\\xa3\\xb0\\xa3\\xb1");blocks[6].val=blocks[2].val;
 program.nr_blocks=7;
 struct string *runtime_digits=make("\\x82\\x4f\\x82\\x4f\\x82\\x50");
 CHECK(MainEXNew_Value(runtime_digits,0)==&blocks[6].val);
 CHECK(!strcmp(runtime_digits->text,"\\x82\\x4f\\x82\\x4f\\x82\\x50"));
 ain->version=10;CHECK(!MainEXNew_Value(runtime_digits,0));ain->version=12;
 blocks[7].name=runtime_digits;blocks[7].val=blocks[0].val;program.nr_blocks=8;
 CHECK(MainEXNew_Value(runtime_digits,0)==&blocks[7].val);
 program.nr_blocks=6;
 int id=MainEXNew_AddEXReader(make("second.ex"));CHECK(id==1 && MainEXNew_Int(blocks[0].name,-5,id)==42);
 CHECK(MainEXNew_Col(blocks[3].name,id)==3 && MainEXNew_Col(blocks[3].name,-1)==0);
 MainEXNew_EraseEXReader(id);CHECK(reader_frees==1 && MainEXNew_Int(blocks[0].name,-5,id)==-5 && MainEXNew_AddEXReader(make("missing.ex"))==-1);
 struct static_hll_function *modern=find_static_hll_function(&lib_MainEXFile,"String","string,string,int");
 struct static_hll_function *legacy=find_static_hll_function(&lib_MainEXFile,"String","int,ref string");
 CHECK(modern && legacy && modern->fun==(void*)MainEXNew_String && legacy->fun==(void*)MainEXFile_String && modern!=legacy);
 CHECK(!find_static_hll_function(&lib_MainEXFile,"String","string,int") && find_static_hll_function(&lib_MainEXFile,"GetColAtFormatName","string,string,int"));
 old=make("old");out=old;CHECK(MainEXFile_String(blocks[2].val.id,&out) && out==actual && old->ref==0);free_string(out);
 int integer=0;CHECK(MainEXFile_Int(blocks[0].val.id,&integer) && integer==42);
 MainEXFile_ModuleFini();CHECK(reader_frees==2 && nr_ex_readers==0 && !ex && !handles);
 heap[0].ref=1;heap[0].type=VM_STRING;heap[0].s=actual;CHECK(heap_get_string(0)==actual);
 return 0;
}
void error_case(int kind){
 heap[0].ref=1;heap[0].type=VM_STRING;heap[0].s=NULL;
 if(kind==1)heap[0].type=VM_PAGE;
 if(kind==2)heap[0].ref=0;
 heap_get_string(kind==3?-1:kind==4?2:0);
}
`;
const build=path.join(root,'build','rance10-tests');fs.mkdirSync(build,{recursive:true});fs.writeFileSync(path.join(build,'mainex-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'mainex-tests.wasm');
const result=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-Wl,--export=error_case','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(result.status,0,result.stderr||result.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));const line=instance.exports.run_tests();
assert.equal(line,0,`C failure at ${line}: ${source.split('\n')[line-1]}`);
for(let i=0;i<5;i++)assert.throws(()=>instance.exports.error_case(i),WebAssembly.RuntimeError);
console.log('PASS: actual MainEXFile old/new implementations, real EX path/table/list lookups, default values, returned-string lifetime, typed ABI selection, reader IDs, legacy output ownership.');
