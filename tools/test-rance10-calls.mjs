import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8');
function block(text,start){let end=text.indexOf('{',start),depth=0;do{if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}while(depth);return text.slice(start,end);}
function func(file,name){const t=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(t);assert.ok(m,name);return block(t,m.index);}
function opcode(name){const t=read('src/vm.c'),start=t.indexOf(`case ${name}: {`);assert.ok(start>=0,name);return block(t,t.indexOf('{',start));}
const source=`
typedef unsigned int size_t;typedef unsigned int uint32_t;
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
static bool trace_function_enabled(int f){(void)f;return false;}static void trace_function_call(int f){(void)f;}static void trace_function_return(int f){(void)f;}static void trace_method_entered(int f){(void)f;}
#define VM_ERROR(...) __builtin_trap()
#define VM_RETURN 0xffffffff
${read('subprojects/libsys4/include/system4/ain.h').match(/enum ain_data_type\s*\{[\s\S]*?\};/)[0]}
#define AIN_REF_TYPE 18
union vm_value {int i;float f;void *ref;};
union vm_value stack_pop(void);
union vm_value stack[64];int stack_ptr,operands[2];size_t instr_ptr;
struct member {struct {int data,struc;} type;};
struct ain_function {int nr_args,nr_vars,address;const char *name;struct member *vars;} functions[8];
struct ain_interface {int struct_type,vtable_offset;};
struct ain_struct {int nr_members,constructor,nr_interfaces;struct member *members;struct ain_interface *interfaces;} structures[8];
struct {int version,nr_structures,nr_functions;void *unused;} dummy;
struct ain_function_type { struct {int data;} return_type; int nr_arguments,nr_variables; struct member *variables; } delegates[3];
struct program {int version,nr_structures,nr_functions,nr_delegates;size_t code_size;unsigned char *code;typeof(functions[0]) *functions;struct ain_struct *structures;struct ain_function_type *delegates;} program;
#define ain (&program)
enum {LOCAL_PAGE=1,STRUCT_PAGE=2,DELEGATE_PAGE=4,CLOSURE_PAGE=5};
struct page {int type,index,nr_vars;union {struct {int struct_ptr,parent_page;uint32_t parent_seq,struct_seq;} local;struct {int live_slot;uint32_t live_seq;} delegate;};union vm_value values[8];};struct {struct page *page;} heap[64];struct page pages[64];
uint32_t sequences[64];uint32_t heap_get_seq(int slot){return sequences[slot];}
int refs[64];void heap_ref(int slot){if(slot!=-1)refs[slot]++;}
int invocation_releases;void heap_unref(int slot){if(slot!=60)__builtin_trap();invocation_releases++;heap[slot].page=NULL;}
int _function_call(int fno,int ret){(void)fno;(void)ret;heap[1].page=&pages[1];return 1;}
${func('src/vm.c','function_call').replace('static void function_call(', 'static void actual_function_call(')}
bool page_index_valid(int slot){return slot>=0 && slot<64 && heap[slot].page;}
struct page *heap_get_page(int slot){return heap[slot].page;}
#define stack_push(v) _Generic((v),union vm_value:push_value,int:push_int)(v)
void push_value(union vm_value v){stack[stack_ptr++]=v;}
void push_int(int i){push_value((union vm_value){.i=i});}
${func('src/vm.c','stack_pop')}
void *memmove(void *dst,const void *src,size_t n){char *d=dst;const char *s=src;if(d>s){for(size_t i=n;i>0;i--)d[i-1]=s[i-1];}else{for(size_t i=0;i<n;i++)d[i]=s[i];}return dst;}
int get_argument(int i){return operands[i];}
enum {CALLMETHOD=7,DG_CALL=8,X_GETENV=1,PUSH=2,FUNC=3,ENDFUNC=4,NR_OPCODES=9};int instruction_width(int op){return op==DG_CALL?10:op==X_GETENV?2:6;}
int seen_fno,seen_this,seen_args[8],seen_type,seen_lval,seen_rval;
void function_call(int fno,int ret){(void)ret;seen_fno=fno;for(int i=functions[fno].nr_args-1;i>=0;i--)seen_args[i]=stack_pop().i;}
void method_call(int fno,int ret){function_call(fno,ret);seen_this=stack_pop().i;}
void vm_execute(void){instr_ptr=12345;}
${func('src/vm.c','vm_call')}
void init_struct(int no,int slot);
${func('src/page.c','init_struct_constructor')}
${func('src/page.c','init_struct')}
int alloc_struct(int no){seen_type=no;heap[50+no].page=&pages[50+no];return 50+no;}
void create_struct(int no,union vm_value *v){v->i=alloc_struct(no);init_struct(no,v->i);}
void heap_struct_assign(int lval,int rval){seen_lval=lval;seen_rval=rval;}
void new_instruction(void){do ${opcode('NEW')} while(0);}
void call_instruction(void){do ${opcode('CALLMETHOD')} while(0);}
void assign_instruction(void){do ${opcode('SR_ASSIGN')} while(0);}
void cast_instruction(void){do ${opcode('X_ICAST')} while(0);}
bool string_index_valid(int no){(void)no;return false;}
void *heap_get_string(int no){(void)no;return (void*)0;}
int vm_string_ref(void *s){(void)s;return 0;}
int copies;
int heap_alloc_slot(int type){(void)type;return 60;}
#define VM_PAGE 1
struct page *copy_page(struct page *p){if(!p)return NULL;copies++;pages[60]=*p;return &pages[60];}
void heap_set_page(int no,struct page *p){heap[no].page=p;}
void array_ref_instruction(void){do ${opcode('A_REF')} while(0);}
union vm_value stack_peek(int n){return stack[stack_ptr-n-1];}
struct page *heap_get_delegate_page(int no){if(no!=20&&no!=60)__builtin_trap();return heap[no].page;}
int delegate_targets,delegate_this;
struct page *pruned;int prunes;void delegate_prune(struct page *p){pruned=p;prunes++;}
bool delegate_get(struct page *p,int i,int *obj,int *fun){if(i>=(p&&p->index==-1?p->nr_vars/3:delegate_targets))return false;*obj=55;*fun=3;return true;}
union vm_value vm_copy(union vm_value v,int t){(void)t;return v;}
int call_stack_ptr,current_local=30;
struct page *local_page(void){return heap[current_local].page;}
int local_page_slot(void){return current_local;}
char *strstr(const char *s,const char *needle){for(;*s;s++){int i=0;while(needle[i]&&s[i]==needle[i])i++;if(!needle[i])return (char*)s;}return (void*)0;}
unsigned char arena[16384];size_t arena_used;
void *xcalloc(size_t n,size_t size){size_t bytes=n*size,at=arena_used;arena_used=(at+bytes+7)&~7;if(arena_used>sizeof(arena))__builtin_trap();for(size_t i=0;i<bytes;i++)arena[at+i]=0;return arena+at;}
void *xrealloc(void *p,size_t bytes){void *next=xcalloc(1,bytes);if(p)memmove(next,p,bytes-sizeof(int));return next;}
void free(void *p){(void)p;}
int decoded_opcodes;int get_opcode(size_t ip){decoded_opcodes++;return ain->code[ip]|ain->code[ip+1]<<8;}
int LittleEndian_getDW(unsigned char *c,size_t ip){return c[ip]|c[ip+1]<<8|c[ip+2]<<16|c[ip+3]<<24;}
struct page *alloc_page(int type,int index,int n){pages[60]=(struct page){.type=type,.index=index,.nr_vars=n};return &pages[60];}
int heap_alloc_page(struct page *p){heap[60].page=p;return 60;}
int variable_type(struct page *p,int i,void *s,void *r){(void)p;(void)i;(void)s;(void)r;return AIN_INT;}
union vm_value variable_initval(int t){(void)t;return (union vm_value){.i=0};}
${read('src/vm.c').slice(read('src/vm.c').indexOf('struct lambda_capture_info {'),read('src/vm.c').indexOf('static int capture_delegate_environment('))}
${func('src/vm.c','capture_delegate_environment')}
void set_struct_page(int obj){delegate_this=obj;}
int iface_finalizations;
void variable_fini(union vm_value v,int t,bool exit){(void)v;(void)exit;if(t==AIN_IFACE)iface_finalizations++;}
${func('src/vm.c','delegate_return_width')}
${func('src/vm.c','delegate_environment_page')}
${func('src/vm.c','delegate_call')}
void delegate_begin(void){do ${opcode('DG_CALLBEGIN')} while(0);}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 program.version=12;heap[55].page=&pages[55];pages[55].type=STRUCT_PAGE;
 stack_ptr=0;stack_push(55);array_ref_instruction();
 CHECK(stack_pop().i==55&&refs[55]==1&&copies==0);
 program.version=10;stack_push(55);array_ref_instruction();
 CHECK(stack_pop().i==60&&heap[60].page!=heap[55].page&&copies==1);
 program.version=12;pages[55].type=3;stack_push(55);array_ref_instruction();
 CHECK(stack_pop().i==60&&copies==2);pages[55].type=STRUCT_PAGE;refs[55]=0;
 program.version=12;program.nr_structures=8;program.nr_functions=8;program.functions=functions;program.structures=structures;
 structures[1].constructor=2;functions[2].nr_args=0;functions[3].nr_args=4;
 instr_ptr=777;stack_ptr=0;stack_push(999);stack_push(11);stack_push(0);
 stack_push(0);stack_push(0);stack_push(0);stack_push(255);operands[0]=1;operands[1]=3;new_instruction();
 CHECK(seen_type==1 && seen_fno==3 && seen_this==51 && seen_args[0]==0 && seen_args[3]==255);
 CHECK(stack_ptr==4 && stack[0].i==999 && stack[1].i==11 && stack[2].i==0 && stack[3].i==51 && instr_ptr==777);
 stack_ptr=0;operands[1]=-1;new_instruction();CHECK(stack_ptr==1 && stack[0].i==51 && seen_fno==2);
 stack_ptr=0;stack_push(999);stack_push(51);stack_push(3);for(int i=0;i<4;i++)stack_push(10+i);operands[0]=4;call_instruction();
 CHECK(stack_ptr==1 && stack[0].i==999 && seen_this==51 && seen_args[0]==10 && seen_args[3]==13);
 stack_ptr=0;stack_push(999);stack_push(60);stack_push(61);assign_instruction();
 CHECK(stack_ptr==2 && stack[0].i==999 && stack[1].i==61 && seen_lval==60 && seen_rval==61);
 /* C-to-VM method with arguments uses the same [this,args] ABI. */
 stack_ptr=0;stack_push(999);for(int i=0;i<4;i++)stack_push(20+i);vm_call(3,55);
 CHECK(stack_ptr==1 && seen_this==55 && seen_args[0]==20 && seen_args[3]==23 && instr_ptr==777);
 /* Interface parameters borrow the object and must retain it for their frame. */
 struct member iface_args[2]={{{AIN_IFACE,2}},{{0,0}}};functions[4].nr_args=2;functions[4].vars=iface_args;
 stack_ptr=0;stack_push(55);stack_push(309);actual_function_call(4,0);
 CHECK(!stack_ptr && refs[55]==1 && pages[1].values[0].i==55 && pages[1].values[1].i==309);
 stack_push(-1);stack_push(0);actual_function_call(4,0);CHECK(!stack_ptr && refs[55]==1);
 struct ain_interface iface[2]={{2,0},{3,309}};structures[1].nr_interfaces=2;structures[1].interfaces=iface;
 pages[51].type=STRUCT_PAGE;pages[51].index=1;
 stack_push(51);operands[0]=3;cast_instruction();
 CHECK(stack_ptr==3 && stack[0].i==51 && stack[1].i==309 && stack[2].i==309 && refs[51]==0);
 stack_ptr=0;stack_push(51);operands[0]=1;cast_instruction();CHECK(stack[0].i==51 && stack[1].i==0 && stack[2].i==0);
 stack_ptr=0;stack_push(51);operands[0]=7;cast_instruction();CHECK(stack[0].i==-1 && stack[1].i==0 && stack[2].i==-1);
 stack_ptr=0;stack_push(-1);cast_instruction();CHECK(stack[0].i==-1 && stack[2].i==-1);
 /* Factory delegates return [object,vtable], preserving both across dispatch. */
 program.nr_delegates=3;program.delegates=delegates;heap[20].page=&pages[20];
 delegates[0].return_type.data=AIN_IFACE;delegates[0].nr_arguments=1;delegates[0].nr_variables=1;
 struct member dgvars[1]={{{AIN_INT,0}}};delegates[0].variables=dgvars;
 stack_ptr=0;stack_push(999);stack_push(20);stack_push(42);operands[0]=0;operands[1]=888;
 delegate_targets=1;pages[20].nr_vars=3;delegate_begin();CHECK(stack_ptr==6&&stack[1].i==42&&stack[2].i==60&&stack[3].i==0);
 /* stale entries leave the live list before the snapshot is taken */
 CHECK(prunes==1&&pruned==heap[20].page);
 delegate_call(0,888);CHECK(stack_ptr==4&&stack[3].i==1&&pages[1].values[0].i==42&&delegate_this==55&&pages[1].local.struct_ptr==55);
 stack_push(51);stack_push(309);delegate_call(0,888);
 CHECK(stack_ptr==3&&stack[0].i==999&&stack[1].i==51&&stack[2].i==309&&instr_ptr==888&&invocation_releases==1);
 /* Scalar returns and empty void delegates retain the old ABI. */
 delegates[1].return_type.data=AIN_INT;delegates[1].nr_arguments=0;
 stack_ptr=0;stack_push(999);stack_push(20);operands[0]=1;delegate_begin();delegate_call(1,888);
 CHECK(stack_ptr==3);stack_push(77);delegate_call(1,888);CHECK(stack_ptr==2&&stack[1].i==77);
 delegates[2].return_type.data=AIN_VOID;delegates[2].nr_arguments=0;delegate_targets=0;pages[20].nr_vars=0;
 stack_ptr=0;stack_push(999);stack_push(20);operands[0]=2;delegate_begin();delegate_call(2,888);
 CHECK(stack_ptr==1&&stack[0].i==999);
 /* An empty delegate borrows interface arguments; it cannot release the caller's scene. */
 struct member iface_dgvars[2]={{{AIN_IFACE,0}},{{AIN_VOID,0}}};
 delegates[2].nr_arguments=2;delegates[2].nr_variables=2;delegates[2].variables=iface_dgvars;
 stack_ptr=0;stack_push(999);stack_push(20);stack_push(55);stack_push(309);operands[0]=2;
 delegate_begin();delegate_call(2,888);CHECK(stack_ptr==1&&iface_finalizations==0);
 /* The first window unregisters itself while a layer is closing. Both
    original handlers must run, and a newly added handler waits until next dispatch. */
 delegates[2].nr_arguments=delegates[2].nr_variables=0;pages[20].nr_vars=6;delegate_targets=2;
 stack_ptr=0;stack_push(20);delegate_begin();delegate_call(2,888);
 CHECK(stack[1].i==1&&heap[60].page->nr_vars==6);
 pages[20].nr_vars=3;delegate_targets=1;delegate_call(2,888);CHECK(stack[1].i==2);
 pages[20].nr_vars=9;delegate_targets=3;int before_releases=invocation_releases;
 delegate_call(2,888);CHECK(stack_ptr==0&&invocation_releases==before_releases+1&&heap[20].page);
 /* Empty delegates still own and release their invocation. */
 heap[20].page=NULL;stack_push(20);delegate_begin();delegate_call(2,888);
 CHECK(stack_ptr==0&&invocation_releases==before_releases+2);heap[20].page=&pages[20];
 /* The route-finder callback writes its defining frame's bool; a deferred
    callback falls back to its retained environment after slot reuse. */
 pages[55].type=CLOSURE_PAGE;pages[55].index=4;
 pages[55].local.struct_ptr=51;pages[55].local.parent_page=30;pages[55].local.parent_seq=7;
 heap[30].page=&pages[30];pages[30].type=LOCAL_PAGE;pages[30].index=4;sequences[30]=7;
 delegates[2].nr_arguments=delegates[2].nr_variables=0;delegate_targets=1;
 stack_ptr=0;stack_push(20);stack_push(0);delegate_call(2,888);
 CHECK(pages[1].local.parent_page==30&&delegate_this==51);
 heap[pages[1].local.parent_page].page->values[4].i=1;
 CHECK(pages[30].values[4].i==1&&pages[55].values[4].i==0);
 sequences[30]=8;CHECK(delegate_environment_page(55)==55);
 stack_ptr=0;stack_push(20);stack_push(0);delegate_call(2,888);
 CHECK(pages[1].local.parent_page==55&&delegate_this==51);
 sequences[30]=7;pages[30].index=5;CHECK(delegate_environment_page(55)==55);
 pages[30].index=4;pages[30].type=STRUCT_PAGE;CHECK(delegate_environment_page(55)==55);
 heap[30].page=(void*)0;CHECK(delegate_environment_page(55)==55);
 /* A zero-local outer lambda contains an inline inner lambda capturing its
    own argument. Only captures in the requested body belong to the source. */
 unsigned char nested[]={FUNC,0,4,0,0,0,X_GETENV,0,PUSH,0,0,0,0,0,ENDFUNC,0,4,0,0,0,ENDFUNC,0,3,0,0,0};
 program.code=nested;program.code_size=sizeof(nested);functions[3].name="<lambda : Outer(0, 1)>";functions[3].address=0;
 call_stack_ptr=1;heap[30].page=&pages[30];pages[30].nr_vars=0;
 CHECK(capture_delegate_environment(51,3)==-1);
 unsigned char captured[]={X_GETENV,0,PUSH,0,4,0,0,0,ENDFUNC,0,3,0,0,0};
 clear_lambda_captures(); /* a different synthetic AIN body */
 program.code=captured;program.code_size=sizeof(captured);pages[30].nr_vars=5;pages[30].values[4].i=42;
 CHECK(capture_delegate_environment(51,3)==60);
 CHECK(pages[60].values[4].i==42&&pages[60].values[0].i==0&&pages[60].local.parent_page==30&&pages[60].local.parent_seq==7);
 int decoded_once=decoded_opcodes;
 for(int repeat=0;repeat<10000;repeat++){pages[30].values[4].i=repeat;CHECK(capture_delegate_environment(51,3)==60);CHECK(pages[60].values[4].i==repeat);}
 CHECK(decoded_opcodes==decoded_once); /* reuse analysis, capture current values */
 clear_lambda_captures();CHECK(!lambda_captures&&!nr_lambda_captures);
 call_stack_ptr=0;CHECK(capture_delegate_environment(51,3)==-1);
 /* Legacy NEW and struct assignment keep their stack type argument. */
 program.version=10;stack_ptr=0;stack_push(999);stack_push(1);new_instruction();CHECK(stack_ptr==2 && stack[1].i==51 && seen_fno==2);
 stack_ptr=0;stack_push(999);stack_push(60);stack_push(61);stack_push(1);assign_instruction();CHECK(stack_ptr==2 && seen_lval==60 && seen_rval==61);
 return 0;
}
`;
const build=path.join(root,'build','rance10-tests');fs.mkdirSync(build,{recursive:true});fs.writeFileSync(path.join(build,'calls-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'calls-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));const line=instance.exports.run_tests();assert.equal(line,0,`C failure at ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: actual NEW/CALLMETHOD/SR_ASSIGN opcode blocks, 4-argument constructor, C-to-VM method argument order, caller stack preservation, legacy v10 behavior.');
