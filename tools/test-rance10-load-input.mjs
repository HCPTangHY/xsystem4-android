// Loading a save replaces the script call stack. The parts input nesting
// (PE_BeginInput/PE_EndInput) must then match the WaitForClick loops open on
// the restored stack; before, every load kept the load menu's levels, input
// never closed again and taps during transitions fired click handlers.
// Runs the real vm.c reconstruction on bytecode shaped like Rance 10's.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
fs.mkdirSync(build,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,'xsystem4/src',p),'utf8').replace(/\r\n/g,'\n');
const vm=read('vm.c');
function fn(src,name){
  const m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(src);assert.ok(m,name);
  let end=src.indexOf('{',m.index),d=0;do{d+=(src[end]==='{')-(src[end]==='}');end++;}while(d);return src.slice(m.index,end);
}
// Both load paths rebuild the nesting.
assert.match(fn(vm,'system_call'),/vm_load_image\([^;]*\);\s*\/\/[^\n]*\n\s*vm_restore_input_depth\(\);/,'system.ResumeLoad');
assert.equal((read('quicksave.c').match(/vm_load_image\(QUICKSAVE_KEY, name\);\n\s*vm_restore_input_depth\(\);/g)||[]).length,2,'quick load paths');
assert.match(read('parts/input.c'),/void PE_ResetInputDepth\(unsigned depth\)\n\{[\s\S]*?parts_input_depth = depth;\n\tparts_began_click = depth > 0;/,'reset');

const source=String.raw`
typedef unsigned long size_t;typedef unsigned int uint32_t;typedef int int32_t;typedef unsigned short uint16_t;typedef unsigned char uint8_t;
typedef _Bool bool;enum{false,true};
static int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
enum opcode{PUSH=1,CALLHLL,CALLFUNC,CALLMETHOD,RETURN,ENDFUNC,FUNC,JUMP};
static int instruction_width(enum opcode op){return op==CALLHLL?14:op==RETURN?2:6;}
static uint16_t LittleEndian_getW(const uint8_t *b,int i){return b[i]|b[i+1]<<8;}
static uint32_t LittleEndian_getDW(const uint8_t *b,int i){return b[i]|b[i+1]<<8|b[i+2]<<16|(uint32_t)b[i+3]<<24;}
struct ain_hll_function{const char *name;};
struct ain_library{const char *name;int nr_functions;struct ain_hll_function *functions;};
struct ain_function{uint32_t address;};
struct ain{int version;uint8_t *code;size_t code_size;struct ain_function *functions;int nr_functions;struct ain_library *libraries;int nr_libraries;};
static struct ain_hll_function pe_fns[]={{"Init"},{"BeginInput"},{"EndInput"}};
static struct ain_library libs[]={{"Other",3,pe_fns},{"PartsEngine",3,pe_fns}};
static uint8_t code[512];static size_t at;static struct ain_function fns[8];
static struct ain the_ain={11,code,0,fns,8,libs,2},*ain=&the_ain;
struct function_call{int32_t fno;uint32_t call_address,return_address;int32_t page_slot,struct_page;};
static struct function_call call_stack[16];static int32_t call_stack_ptr;static size_t instr_ptr;
static unsigned reset_depth=99;static void PE_ResetInputDepth(unsigned d){reset_depth=d;}
static void w16(int v){code[at++]=v;code[at++]=v>>8;}
static void w32(int v){for(int i=0;i<4;i++)code[at++]=v>>(8*i);}
static size_t op1(enum opcode o,int a){w16(o);w32(a);return at;}
static size_t hll(int lib,int f){w16(CALLHLL);w32(lib);w32(f);w32(-1);return at;}
static size_t ret(void){w16(RETURN);return at;}
${fn(vm,'input_hll_delta')}
${fn(vm,'input_wrapper_delta')}
${fn(vm,'input_frame_depth')}
${fn(vm,'vm_input_depth_from_stack')}
${fn(vm,'vm_restore_input_depth')}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
static void frame(int i,int fno,size_t ret_addr){call_stack[i].fno=fno;call_stack[i].return_address=ret_addr;}
int run_tests(void){
 /* 1, 2: one-call wrappers around the HLL, as parts::detail::BeginInput/EndInput */
 fns[1].address=at;hll(1,1);ret();op1(ENDFUNC,1);
 fns[2].address=at;hll(1,2);ret();op1(ENDFUNC,2);
 /* 6: an unrelated HLL with the same index in another library */
 fns[6].address=at;hll(0,1);ret();op1(ENDFUNC,6);
 /* 3: WaitForClick, with an inline lambda that must not count */
 fns[3].address=at;op1(PUSH,0);size_t lam=op1(JUMP,0);op1(FUNC,7);op1(CALLFUNC,1);op1(ENDFUNC,7);(void)lam;
 size_t before_begin=op1(CALLFUNC,6);
 op1(CALLFUNC,1);size_t in_loop=op1(CALLFUNC,5);op1(JUMP,0);
 size_t after_end=op1(CALLFUNC,2);ret();op1(ENDFUNC,3);
 /* 4: a scene that runs WaitForClick */
 fns[4].address=at;op1(PUSH,0);size_t in_scene=op1(CALLFUNC,3);ret();op1(ENDFUNC,4);
 /* 5: View_Update */
 fns[5].address=at;op1(PUSH,0);size_t in_update=op1(PUSH,0);ret();op1(ENDFUNC,5);
 the_ain.code_size=at;
 CHECK(input_wrapper_delta(1)==1&&input_wrapper_delta(2)==-1&&input_wrapper_delta(6)==0);
 CHECK(input_frame_depth(3,before_begin)==0);
 CHECK(input_frame_depth(3,in_loop)==1);
 CHECK(input_frame_depth(3,after_end)==0);
 /* scene -> WaitForClick (waiting) -> View_Update */
 frame(0,4,0);frame(1,3,in_scene);frame(2,5,in_loop);call_stack_ptr=3;instr_ptr=in_update;
 CHECK(vm_input_depth_from_stack()==1);
 /* a dialog opened from a click handler: two waits open */
 frame(3,4,in_update);frame(4,3,in_scene);frame(5,5,in_loop);call_stack_ptr=6;
 CHECK(vm_input_depth_from_stack()==2);
 vm_restore_input_depth();CHECK(reset_depth==2);
 /* stopped before BeginInput or after EndInput: nothing open */
 frame(1,3,in_scene);frame(2,6,before_begin);call_stack_ptr=3;instr_ptr=fns[6].address;
 CHECK(vm_input_depth_from_stack()==0);
 frame(2,2,after_end);CHECK(vm_input_depth_from_stack()==0);
 /* frames returning into native code (no position in the caller) are ignored */
 frame(2,5,0xffffffff);CHECK(vm_input_depth_from_stack()==0);
 return 0;}
`;
fs.writeFileSync(path.join(build,'load-input-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'load-input-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wno-unused-function','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: after a load (ResumeLoad, quick load) the input nesting equals the WaitForClick loops open on the restored stack; nested dialogs, positions before/after the wait, inline lambdas and native frames.');
