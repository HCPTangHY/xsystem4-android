import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const vm=fs.readFileSync(path.join(root,'xsystem4/src/vm.c'),'utf8');
const begin=vm.indexOf('void vm_write_error_report(');
assert.ok(begin>=0);
const writer=vm.slice(begin,vm.indexOf('\n_Noreturn void _vm_error(',begin));
const system=fs.readFileSync(path.join(root,'xsystem4/src/system4.c'),'utf8');
assert.match(system,/static void error_handler\([^)]*\)\s*\{\s*vm_write_error_report\(msg\);/);
// Compile the production writer. Only its filesystem/stdio boundary is mocked;
// JS checks the resulting report, path, failure handling, and bounded VM reads.
const source=String.raw`
typedef unsigned size_t;
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
typedef int FILE;
struct {const char *home_dir;} config;
struct function {const char *name;} functions[2]={{"Boss@Start"},{"Condition@Evaluate"}};
struct program {int version,nr_functions;struct function *functions;} program={12,2,functions},*ain;
struct frame {int fno,struct_page,page_slot;unsigned call_address;} call_stack[4];
union value {int i;} stack_data[4],*stack;
int stack_ptr,call_stack_ptr;
size_t instr_ptr,stack_size;
static char arena[8192];static unsigned used;static int fail_alloc,reenter;
size_t strlen(const char *p){size_t n=0;while(p[n])n++;return n;}
void *malloc(size_t n){if(fail_alloc)return NULL;unsigned at=used;used=(used+n+7)&~7;if(used>sizeof(arena))__builtin_trap();return arena+at;}
void free(void *p){(void)p;}
long long time(void *p){(void)p;return 1794200000;}
char *sjis2utf(const char *s,size_t n){if(!n)n=strlen(s);char *p=malloc(n+1);if(p){for(unsigned i=0;i<=n;i++)p[i]=s[i];}return p;}
__attribute__((import_module("env"),import_name("format"))) int snprintf(char *,size_t,const char *,...);
__attribute__((import_module("env"),import_name("print"))) int fprintf(FILE *,const char *,...);
__attribute__((import_module("env"),import_name("open"))) FILE *open_report(const char *,const char *);
__attribute__((import_module("env"),import_name("close"))) int fclose(FILE *);
void vm_write_error_report(const char *message);
FILE *file_open_utf8(const char *p,const char *mode){if(reenter)vm_write_error_report("recursive report");return open_report(p,mode);}
`+writer+String.raw`
void report_case(int which){
 used=0;fail_alloc=which==4;reenter=which==6;
 config.home_dir=which==2?NULL:"/emulator-data";
 ain=which==3?NULL:&program;instr_ptr=4343666;
 stack=stack_data;stack_ptr=2;stack_size=4;stack[0].i=42;stack[1].i=73;
 call_stack_ptr=2;
 call_stack[0]=(struct frame){.fno=0,.struct_page=12,.page_slot=13,.call_address=100};
 call_stack[1]=(struct frame){.fno=1,.struct_page=22,.page_slot=23,.call_address=200};
 call_stack[2]=(struct frame){.fno=999,.call_address=300};
 call_stack[3]=(struct frame){.fno=-1,.call_address=400};
 if(which==5){call_stack_ptr=999;stack_ptr=999;stack[2].i=84;stack[3].i=95;}
 if(which==7){call_stack_ptr=-1;stack_ptr=-1;}
 vm_write_error_report("Out of bounds page index: 90005/0");
}
`;
fs.mkdirSync(build,{recursive:true});
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'error-report-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=report_case','-Wl,--export-memory','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
if(r.error)throw r.error;
assert.equal(r.status,0,r.stderr||r.stdout);
let memory,text,opened,closed,failOpen;
const read=p=>{const b=new Uint8Array(memory.buffer);let e=p;while(b[e])e++;return new TextDecoder().decode(b.subarray(p,e));};
const format=(fmt,args)=>read(fmt).replace(/%(s|lld|zu|d|u)/g,(_,type)=>{
 const view=new DataView(memory.buffer);
 if(type==='lld'){args=(args+7)&~7;const v=view.getBigInt64(args,true);args+=8;return v.toString();}
 const v=type==='d'?view.getInt32(args,true):view.getUint32(args,true);args+=4;
 return type==='s'?read(v):String(v);
});
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{
 format(dst,size,fmt,args){const bytes=new TextEncoder().encode(format(fmt,args));const b=new Uint8Array(memory.buffer);const n=Math.min(bytes.length,size-1);b.set(bytes.subarray(0,n),dst);b[dst+n]=0;return bytes.length;},
 print(file,fmt,args){assert.equal(file,1);const value=format(fmt,args);text+=value;return value.length;},
 open(p,mode){opened.push(read(p));assert.equal(read(mode),'wb');return failOpen?0:1;},
 close(file){assert.equal(file,1);closed++;return 0;}
}});
memory=instance.exports.memory;
function run(which){text='';opened=[];closed=0;failOpen=which===1;instance.exports.report_case(which);return text;}
const normal=run(0);
assert.deepEqual(opened,['/emulator-data/xsystem4-last-error.txt']);
assert.equal(closed,1);
assert.match(normal,/Out of bounds page index: 90005\/0/);
assert.match(normal,/AIN version=12 ip=4343666 stack=2 frames=2/);
assert.match(normal,/VMFRAME 1 fno=1 name=Condition@Evaluate this=22 local=23 from=200/);
assert.match(normal,/VMSTACK 1=73/);
assert.equal(run(1),'');assert.equal(closed,0);
assert.equal(run(2),'');assert.equal(opened.length,0);
assert.doesNotMatch(run(3),/VMFRAME|VMSTACK/);assert.equal(closed,1);
assert.equal(run(4),'');assert.equal(opened.length,0);
const invalid=run(5);
assert.equal((invalid.match(/VMFRAME /g)||[]).length,4);
assert.equal((invalid.match(/VMSTACK /g)||[]).length,4);
assert.match(invalid,/name=invalid/);
assert.equal(run(6),normal);assert.equal(opened.length,1);
assert.doesNotMatch(run(7),/VMFRAME|VMSTACK/);
assert.equal(run(0),normal,'A failed report must not disable later reports');
console.log('PASS: production fatal-error report; message, full call stack, bounded operand stack, non-save path, early errors, I/O failure, allocation failure and reentrancy.');
