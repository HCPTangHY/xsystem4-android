// Delegate entries hold weak (object, function, sequence) targets, except
// closure environments, which each entry owns. A stale entry (its object was
// freed while still registered) must not release whatever reused the slot:
// Rance 10's base camp quest choice was lost when a per-frame delegate's
// stale entry kept releasing the closure that RunIScene's postEvent needed,
// so GetResult never ran and the quest was skipped. Runs the real heap.c
// allocator (LIFO slot reuse, sequence numbers) and page.c delegate code.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
fs.mkdirSync(build,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
function fn(src,name){
  const m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(src);assert.ok(m,name);
  let end=src.indexOf('{',m.index),d=0;do{d+=(src[end]==='{')-(src[end]==='}');end++;}while(d);return src.slice(m.index,end);
}
const heapc=read('src/heap.c'),pagec=read('src/page.c'),vmc=read('src/vm.c'),ainh=read('subprojects/libsys4/include/system4/ain.h');
function macro(name){
  const lines=ainh.split('\n'),start=lines.findIndex(l=>l.startsWith(`#define ${name}\t`)||l.startsWith(`#define ${name} `));
  assert.ok(start>=0,name);let end=start;while(lines[end].endsWith('\\'))end++;return lines.slice(start,end+1).join('\n');
}
// Every v12 call prunes the live list before iterating its snapshot.
assert.match(vmc,/struct page \*live = heap_get_delegate_page\(dg_page\);\s*delegate_prune\(live\);\s*struct page \*snapshot = copy_page\(live\);/,'DG_CALLBEGIN');

const source=String.raw`
typedef int int32_t;typedef unsigned int uint32_t;typedef unsigned long size_t;typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define unlikely(x) (x)
#define assert(x) do{if(!(x))__builtin_trap();}while(0)
__attribute__((noreturn,import_module("env"),import_name("vm_error"))) void test_vm_error(int line);
#define VM_ERROR(...) test_vm_error(__LINE__)
#define WARNING(...) ((void)0)
#define NOTICE(...) ((void)0)
#define INITIAL_HEAP_SIZE 8
#define HEAP_ALLOC_STEP 8
${ainh.match(/enum ain_data_type\s*\{[\s\S]*?\};/)[0]}
${macro('AIN_ARRAY_TYPE')}
${macro('AIN_REF_TYPE')}
union vm_value{int32_t i;float f;};
enum page_type{GLOBAL_PAGE,LOCAL_PAGE,STRUCT_PAGE,ARRAY_PAGE,DELEGATE_PAGE,CLOSURE_PAGE};
enum vm_pointer_type{VM_PAGE,VM_STRING};
struct page{enum page_type type;union{int index;enum ain_data_type a_type;};
 union{struct{int struct_ptr;int parent_page;uint32_t struct_seq;uint32_t parent_seq;}local;struct{int struct_type;int rank;}array;struct{int live_slot;uint32_t live_seq;}delegate;};
 int nr_vars;union vm_value values[];};
struct string;
struct vm_pointer{int ref;uint32_t seq;enum vm_pointer_type type;union{struct string *s;struct page *page;};};
struct vm_pointer *heap;size_t heap_size;uint32_t heap_next_seq;int32_t *heap_free_stack;size_t heap_free_ptr;
static unsigned char arena[1<<18];static size_t arena_top;
void *memset(void *d,int c,size_t n){unsigned char *a=d;for(size_t i=0;i<n;i++)a[i]=c;return d;}
void *memcpy(void *d,const void *s,size_t n){unsigned char *a=d;const unsigned char *b=s;for(size_t i=0;i<n;i++)a[i]=b[i];return d;}
static void *xmalloc(size_t n){unsigned char *p=arena+arena_top;arena_top+=16+((n+15)&~15u);if(arena_top>sizeof(arena))__builtin_trap();*(size_t*)p=n;return p+16;}
static void *xcalloc(size_t a,size_t b){return memset(xmalloc(a*b),0,a*b);}
static void *xrealloc(void *o,size_t n){void *p=xmalloc(n);if(o){size_t m=*(size_t*)((unsigned char*)o-16);memcpy(p,o,m<n?m:n);}return p;}
static void free(void *p){(void)p;}
struct ain_type{int data,struc,rank;};
struct ain_variable{struct ain_type type;};
struct ain_function{struct ain_variable *vars;};
struct ain_struct{struct ain_variable *members;int destructor;};
static struct ain_variable one_int[1]={{{AIN_INT,-1,0}}};
static struct ain_function functions[2]={{0},{one_int}};
static struct ain_struct structures[1]={{one_int,0}};
static struct{struct ain_variable *globals;struct ain_function *functions;struct ain_struct *structures;}the_ain={one_int,functions,structures};
#define ain (&the_ain)
static int pages_freed;
struct page *alloc_page(enum page_type type,int index,int nr){struct page *p=xcalloc(1,sizeof(*p)+nr*sizeof(union vm_value));p->type=type;p->index=index;p->nr_vars=nr;return p;}
void free_page(struct page *p){(void)p;pages_freed++;}
void delete_struct(int no,int slot){(void)no;(void)slot;}
void free_string(struct string *s){(void)s;__builtin_trap();}
void exit_unref(int slot){(void)slot;__builtin_trap();}
int vm_string_ref(struct string *s){(void)s;__builtin_trap();}
struct string *heap_get_string(int i){(void)i;__builtin_trap();}
int vm_copy_page(struct page *p){(void)p;__builtin_trap();}
void heap_unref(int slot);void heap_ref(int32_t slot);uint32_t heap_get_seq(int slot);bool heap_index_valid(int index);
bool page_index_valid(int index);struct page *heap_get_page(int index);void delete_page(int slot);void heap_grow(size_t new_size);
enum ain_data_type variable_type(struct page *page,int varno,int *struct_type,int *array_rank);
enum ain_data_type array_type(enum ain_data_type type);
${['heap_grow','heap_init','heap_alloc_slot','heap_free_slot','heap_double_free','heap_ref','heap_unref','heap_get_seq','heap_index_valid','page_index_valid','heap_get_page','heap_get_delegate_page','heap_set_page','heap_alloc_page'].map(n=>fn(heapc,n)).join('\n')}
${fn(vmc,'vm_copy')}
${['variable_fini','array_type','delegate_is_closure','variable_type','delete_page_vars','delete_page','copy_page',
   'delegate_new_from_method','delegate_contains','delegate_append','delegate_numof','delegate_entry_current','delegate_entry_live',
   'delegate_remove_entry','delegate_erase','delegate_prune','delegate_clear','delegate_get'].map(n=>fn(pagec,n)).join('\n')}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
static int new_object(void){int s=heap_alloc_slot(VM_PAGE);heap_set_page(s,alloc_page(STRUCT_PAGE,0,1));return s;}
/* DG_NEW_FROM_METHOD for a lambda with captures: the entry owns the environment. */
static int new_closure_delegate(int this_obj,int fun,int *env_out){
 struct page *e=alloc_page(CLOSURE_PAGE,1,1);e->local.struct_ptr=this_obj;e->local.struct_seq=heap_get_seq(this_obj);e->local.parent_page=-1;
 int env=heap_alloc_page(e);int dg=heap_alloc_page(delegate_new_from_method(env,fun));heap_unref(env);*env_out=env;return dg;}
/* One v12 DG_CALLBEGIN .. DG_CALL loop; returns how many entries were called. */
static int call_all(int dg,int *obj,int *fun){
 struct page *live=heap_get_delegate_page(dg);delegate_prune(live);
 struct page *snapshot=copy_page(live);if(!snapshot)snapshot=alloc_page(DELEGATE_PAGE,0,0);
 snapshot->index=-1;snapshot->delegate.live_slot=dg;snapshot->delegate.live_seq=heap_get_seq(dg);
 int inv=heap_alloc_page(snapshot),n=0;
 while(delegate_get(heap_get_delegate_page(inv),n,obj,fun))n++;
 heap_unref(inv);return n;}
int run_tests(void){
 heap_init();int o,f;
 /* Base camp: a UI object still registered in a per-frame delegate is freed;
    its slot is reused (LIFO) by the closure RunQuestSelectBaseCamp hands to
    RunIScene as postEvent. Frames keep calling the per-frame delegate. */
 int ui=new_object();int frame=heap_alloc_page(delegate_new_from_method(ui,5));
 heap_unref(ui);
 int env;int post=new_closure_delegate(-1,7,&env);
 CHECK(env==ui);uint32_t env_seq=heap_get_seq(env);
 for(int i=0;i<3;i++)CHECK(call_all(frame,&o,&f)==0);
 CHECK(heap[env].ref==1&&heap_get_seq(env)==env_seq);
 CHECK(heap_get_delegate_page(frame)->nr_vars==0);
 CHECK(call_all(post,&o,&f)==1&&o==env&&f==7);
 /* The scene finishes: releasing postEvent frees its environment once. */
 heap_unref(post);CHECK(heap_get_seq(env)==0);
 /* An entry can also go stale during a call: the first callback frees X and
    the next lambda's environment reuses X's slot before the snapshot gets to
    X. The snapshot must skip X without releasing that environment. */
 int first=new_object(),xo=new_object();
 int ev=heap_alloc_page(delegate_new_from_method(first,5));
 heap_set_page(ev,delegate_append(heap_get_delegate_page(ev),xo,6));
 struct page *evlive=heap_get_delegate_page(ev);delegate_prune(evlive);
 struct page *evsnap=copy_page(evlive);evsnap->index=-1;int inv=heap_alloc_page(evsnap);
 CHECK(delegate_get(heap_get_delegate_page(inv),0,&o,&f)&&o==first&&f==5);
 heap_unref(xo);int env7;int dg7=new_closure_delegate(-1,12,&env7);CHECK(env7==xo);
 CHECK(!delegate_get(heap_get_delegate_page(inv),1,&o,&f));
 heap_unref(inv);
 CHECK(heap[env7].ref==1&&call_all(dg7,&o,&f)==1&&o==env7&&f==12);
 /* A closure whose object died is not called and its owned reference goes. */
 int owner=new_object();int env2;int dg2=new_closure_delegate(owner,9,&env2);
 CHECK(call_all(dg2,&o,&f)==1&&heap[env2].ref==1);
 heap_unref(owner);
 CHECK(call_all(dg2,&o,&f)==0&&heap_get_seq(env2)==0&&heap_get_delegate_page(dg2)->nr_vars==0);
 heap_unref(dg2);
 /* Snapshot copies take and return their own closure references. */
 int env3;int dg3=new_closure_delegate(-1,11,&env3);
 for(int i=0;i<4;i++)CHECK(call_all(dg3,&o,&f)==1&&o==env3);
 CHECK(heap[env3].ref==1);heap_unref(dg3);CHECK(heap_get_seq(env3)==0);
 /* Unregistering: A leaves a stale entry, B reuses A's slot and registers
    the same method. Erasing B must remove B's entry, not A's stale one. */
 int a=new_object();int g=heap_alloc_page(delegate_new_from_method(a,5));heap_unref(a);
 int b=new_object();CHECK(b==a);
 heap_set_page(g,delegate_append(heap_get_delegate_page(g),b,5));CHECK(delegate_contains(heap_get_delegate_page(g),b,5));
 delegate_erase(heap_get_delegate_page(g),b,5);
 CHECK(!delegate_contains(heap_get_delegate_page(g),b,5)&&call_all(g,&o,&f)==0);
 /* Erasing a closure entry releases the environment it owns. */
 int env4;int dg4=new_closure_delegate(-1,13,&env4);
 delegate_erase(heap_get_delegate_page(dg4),env4,13);CHECK(heap_get_seq(env4)==0&&heap_get_delegate_page(dg4)->nr_vars==0);
 /* Pruning keeps the live entries (plain functions, live objects) in order. */
 int c=new_object(),dead=new_object();
 int h=heap_alloc_page(delegate_new_from_method(-1,3));
 heap_set_page(h,delegate_append(heap_get_delegate_page(h),dead,4));
 heap_set_page(h,delegate_append(heap_get_delegate_page(h),c,6));
 heap_unref(dead);
 int env5;int reuse=new_closure_delegate(-1,8,&env5);CHECK(env5==dead);
 delegate_prune(heap_get_delegate_page(h));
 struct page *hp=heap_get_delegate_page(h);
 CHECK(hp->nr_vars==6&&hp->values[0].i==-1&&hp->values[1].i==3&&hp->values[3].i==c&&hp->values[4].i==6);
 CHECK(heap[env5].ref==1&&call_all(reuse,&o,&f)==1&&o==env5);
 /* Clearing a delegate with a stale entry leaves the slot's new owner alone. */
 int x=new_object();int k=heap_alloc_page(delegate_new_from_method(x,5));heap_unref(x);
 int env6;int dg6=new_closure_delegate(-1,10,&env6);CHECK(env6==x);
 heap_set_page(k,delegate_clear(heap_get_delegate_page(k)));CHECK(heap[env6].ref==1);
 heap_unref(k);CHECK(heap[env6].ref==1&&call_all(dg6,&o,&f)==1);
 /* Rance 10 Gartia Turn 4: callback #0 erasing itself still runs #1, while
    callback #0 erasing #1 (or clearing the delegate) prevents #1 from firing
    and still runs #2 cleanly. */
 int m0=new_object(),m1=new_object(),m2=new_object();
 int mdg=heap_alloc_page(delegate_new_from_method(m0,21));
 heap_set_page(mdg,delegate_append(heap_get_delegate_page(mdg),m1,22));
 heap_set_page(mdg,delegate_append(heap_get_delegate_page(mdg),m2,23));
 struct page *msnap=copy_page(heap_get_delegate_page(mdg));
 msnap->index=-1;msnap->delegate.live_slot=mdg;msnap->delegate.live_seq=heap_get_seq(mdg);
 int minv=heap_alloc_page(msnap);
 CHECK(delegate_get(heap_get_delegate_page(minv),0,&o,&f)&&o==m0&&f==21);
 delegate_erase(heap_get_delegate_page(mdg),m0,21); /* self-erase */
 delegate_erase(heap_get_delegate_page(mdg),m1,22); /* cancel sibling callback */
 CHECK(delegate_get(heap_get_delegate_page(minv),1,&o,&f)&&o==m2&&f==23);
 CHECK(!delegate_get(heap_get_delegate_page(minv),2,&o,&f));
 heap_unref(minv);
 /* Delegate.Clear mid-dispatch stops all remaining callbacks and unrefs closures. */
 int cenv;int cdg=new_closure_delegate(-1,31,&cenv);
 heap_set_page(cdg,delegate_append(heap_get_delegate_page(cdg),m2,32));
 struct page *csnap=copy_page(heap_get_delegate_page(cdg));
 csnap->index=-1;csnap->delegate.live_slot=cdg;csnap->delegate.live_seq=heap_get_seq(cdg);
 int cinv=heap_alloc_page(csnap);
 heap_set_page(cdg,delegate_clear(heap_get_delegate_page(cdg)));
 CHECK(!delegate_get(heap_get_delegate_page(cinv),0,&o,&f));
 heap_unref(cinv);CHECK(heap_get_seq(cenv)==0);
 heap_unref(cdg);heap_unref(m0);heap_unref(m1);heap_unref(m2);
 return 0;}
`;
fs.writeFileSync(path.join(build,'delegates-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'delegates-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wno-unused-function','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
let vmError=0;
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{vm_error(line){vmError=line;throw new Error(`VM_ERROR at generated line ${line}`);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: stale delegate entries never release a reused slot (base camp postEvent survives per-frame calls and entries going stale mid-call), owned closures are released once, erase removes the live entry, prune keeps live entries in order.');
