import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const vm=fs.readFileSync(path.join(root,'xsystem4/src/vm.c'),'utf8');
function block(start){let end=vm.indexOf('{',start),depth=0;do{if(vm[end]==='{')depth++;if(vm[end]==='}')depth--;end++;}while(depth);return vm.slice(start,end);}
function fn(name,optional=false){const m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(vm);if(!m&&optional)return '';assert.ok(m,name);return block(m.index);}
const refref=vm.indexOf('case REFREF: {');assert.ok(refref>=0);
const source=String.raw`
typedef int int32_t;typedef unsigned uint32_t;typedef _Bool bool;
#define NULL ((void*)0)
#define unlikely(x) (x)
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
__attribute__((noreturn,import_module("env"),import_name("error"))) void test_error(int);
#define VM_ERROR(...) test_error(__LINE__)
enum {VM_PAGE,VM_STRING};union vm_value{int32_t i;float f;};
struct page{int nr_vars;union vm_value values[4];}page;
struct {int ref,type;struct page *page;}heap[8];
union vm_value stack[16];int stack_ptr;
bool heap_index_valid(int i){return i>=0&&i<8&&heap[i].ref>0;}
bool page_index_valid(int i){return heap_index_valid(i)&&heap[i].type==VM_PAGE;}
void stack_push(int i){stack[stack_ptr++].i=i;}
`+fn('stack_pop')+fn('stack_peek')+fn('stack_peek_var_width',true)+fn('stack_pop_var_width',true)+fn('stack_pop_var')+fn('stack_peek_var')+String.raw`
void refref(void){do `+block(vm.indexOf('{',refref))+String.raw` while(0);}
void setup(void){stack_ptr=0;for(int i=0;i<8;i++){heap[i].ref=0;heap[i].page=NULL;}page.nr_vars=2;page.values[0].i=33;page.values[1].i=44;heap[1].ref=1;heap[1].type=VM_PAGE;heap[1].page=&page;}
int run_tests(void){
 setup();stack_push(1);stack_push(1);CHECK(stack_pop_var()->i==44&&stack_ptr==0);
 stack_push(1);stack_push(0);CHECK(stack_peek_var()->i==33&&stack_ptr==2);
 refref();CHECK(stack_ptr==2&&stack_pop().i==44&&stack_pop().i==33);
 return 0;
}
void invalid_case(int which){
 setup();int slot=1,index=0;
 if(which<=1)index=-1;
 if(which==2||which==3)heap[1].type=VM_STRING;
 if(which==4)index=2;
 if(which==5)heap[1].page=NULL;
 if(which==6)index=1;
 if(which==7)page.nr_vars=1;
 if(which==9)slot=2147483647;
 if(which==10)page.nr_vars=0;
 if(which!=8)stack_push(slot);stack_push(index);
 if(which==1||which==3)stack_peek_var();
 else if(which==6||which==7)refref();
 else stack_pop_var();
}
`;
fs.mkdirSync(build,{recursive:true});
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'vm-reference-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-Wl,--export=invalid_case','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
if(r.error)throw r.error;assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{error(line){throw new WebAssembly.RuntimeError(`VM reference error at ${line}`);}}});
assert.equal(instance.exports.run_tests(),0);
for(let i=0;i<11;i++)assert.throws(()=>instance.exports.invalid_case(i),WebAssembly.RuntimeError,`Invalid reference ${i} was accepted`);
console.log('PASS: real VM pop/peek/REFREF; normal references, negative indices, wrong heap type, null/empty pages, short stacks and two-slot bounds.');
