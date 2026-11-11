import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'xsystem4');
const build = path.join(root, 'build', 'rance10-tests');
const read = name => fs.readFileSync(path.join(engine, name), 'utf8');
function func(file, name) {
  const text = read(file);
  const m = new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`, 'm').exec(text);
  assert.ok(m, name);
  let end = text.indexOf('{', m.index), depth = 0;
  do { if (text[end] === '{') depth++; if (text[end] === '}') depth--; end++; } while (depth);
  return text.slice(m.index, end);
}
const ain = read('subprojects/libsys4/include/system4/ain.h');
const mapFixture=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/rance10-map-index-grid.json'),'utf8'));
const arraySignatures=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/rance10-array-signatures.json'),'utf8'));
const mapRows=mapFixture.values.length,mapColumns=mapFixture.values[0].length;
assert.ok(mapFixture.values.every(row=>row.length===mapColumns&&row.every(Number.isInteger)));
function macro(name) {
  const lines = ain.split(/\r?\n/), start = lines.findIndex(l => l.startsWith(`#define ${name}\t`) || l.startsWith(`#define ${name} `));
  assert.ok(start >= 0);
  let end = start;
  while (lines[end].endsWith('\\')) end++;
  return lines.slice(start, end + 1).join('\n');
}
const source = `
typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
typedef unsigned int size_t;
typedef _Bool bool;
unsigned vm_random_seed(void) { return 0x12345679u; }
#define true 1
#define false 0
#define NULL ((void*)0)
#define INT_MAX 2147483647
#define max(a,b) ((a)>(b)?(a):(b))
#define min(a,b) ((a)<(b)?(a):(b))
__attribute__((noreturn,import_module("env"),import_name("vm_error"))) void test_vm_error(int line);
#define VM_ERROR(...) test_vm_error(__LINE__)
#define WARNING(...) ((void)0)
#define NOTICE(...) ((void)0)
${ain.match(/enum ain_data_type\s*\{[\s\S]*?\};/)[0]}
${macro('AIN_ARRAY_TYPE')}
${macro('AIN_REF_TYPE')}
${macro('AIN_REF_ARRAY_TYPE')}
union vm_value { int32_t i; float f; void *ref; };
enum { GLOBAL_PAGE, LOCAL_PAGE, STRUCT_PAGE, ARRAY_PAGE, DELEGATE_PAGE, CLOSURE_PAGE };
enum { VM_PAGE, VM_STRING };
struct page { int type; union {int a_type,index;}; struct { int struct_type, rank; } array; struct {int struct_ptr,parent_page;unsigned struct_seq;} local; int nr_vars; union vm_value values[]; };
struct string { int marker; const char *text; };
struct string EMPTY_STRING={.text=""};
struct vm_pointer { int ref, type; struct page *page; struct string *s; };
struct vm_pointer heap_storage[256], *heap=heap_storage;
size_t heap_size=256;
int32_t free_slots[256], *heap_free_stack=free_slots;
int heap_free_ptr, heap_next_seq;
#define INITIAL_HEAP_SIZE 256
union vm_value stack[128]; int stack_ptr, hll_call_type_param;
struct ain_type { int data,struc; struct ain_type *array_type; };
struct ain_variable { struct ain_type type; };
struct ain_hll_function { char *name; int nr_arguments; struct ain_variable *arguments; struct ain_type return_type; };
struct static_hll_function { char *name; void *fun; const char *params; };
struct static_library { char *name; struct static_hll_function functions[5]; };
struct ain_function {struct ain_variable *vars;int nr_vars,nr_args;struct ain_type return_type;};
struct test_structure {struct ain_variable *members;int nr_members;};
struct { int version,nr_globals,nr_functions,nr_structures;struct ain_variable *globals;struct ain_function *functions;struct test_structure *structures; } program;
#define ain (&program)
struct {int page_slot,struct_page;} call_stack[64];int call_stack_ptr,page_checks;
int strcmp(const char *a, const char *b) { while (*a && *a==*b) {a++;b++;} return (unsigned char)*a-(unsigned char)*b; }
void *memcpy(void *d, const void *s, size_t n) { char *a=d; const char *b=s; for(size_t i=0;i<n;i++)a[i]=b[i];return d; }
void *memmove(void *d,const void *s,size_t n) {char *a=d;const char *b=s;if(a>b){for(size_t i=n;i>0;i--)a[i-1]=b[i-1];}else{for(size_t i=0;i<n;i++)a[i]=b[i];}return d;}
void *memset(void *d, int c, size_t n) { char *a=d; for(size_t i=0;i<n;i++)a[i]=c;return d; }
static union { long long align; unsigned char bytes[2048]; } blocks[256];
static size_t sizes[256]; static int used, allocated, freed, next_slot;
void *xcalloc(size_t n, size_t sz) { size_t bytes=n*sz; if(bytes>2048 || used>=256)__builtin_trap(); sizes[used]=bytes; allocated++;return memset(blocks[used++].bytes,0,bytes); }
void *xmalloc(size_t sz) { return xcalloc(1,sz); }
void free_page(struct page *p) { (void)p;freed++; }
void free(void *p) { if(p)free_page(p); }
void *xrealloc(void *p, size_t sz) { int i=0;while(i<used && blocks[i].bytes!=p)i++;if(i==used)__builtin_trap();void *q=xcalloc(1,sz);memcpy(q,p,sizes[i]<sz?sizes[i]:sz);free_page(p);return q; }
int heap_alloc_slot(int type) { if(next_slot>=256)__builtin_trap();int i=next_slot++;heap[i].ref=1;heap[i].type=type;return i; }
void heap_set_page(int slot, struct page *p) { heap[slot].page=p; }
int heap_alloc_page(struct page *p) { int slot=heap_alloc_slot(VM_PAGE);heap_set_page(slot,p);return slot; }
bool page_index_valid(int slot) { page_checks++;return slot>=0 && slot<next_slot && heap[slot].ref>0 && heap[slot].type==VM_PAGE; }
struct page *heap_get_page(int slot) { if(!page_index_valid(slot))__builtin_trap();return heap[slot].page; }
struct string *heap_get_string(int slot) { if(slot<1 || slot>=next_slot || heap[slot].ref<1)__builtin_trap();return heap[slot].s; }
void heap_ref(int slot) { if(slot<1 || slot>=next_slot || heap[slot].ref<1)__builtin_trap();heap[slot].ref++; }
void delete_page_vars(struct page *p);
void heap_unref(int slot) { if(slot<1 || slot>=next_slot || heap[slot].ref<1)__builtin_trap();if(--heap[slot].ref==0 && heap[slot].type==VM_PAGE && heap[slot].page){delete_page_vars(heap[slot].page);free_page(heap[slot].page);heap[slot].page=NULL;} }
void exit_unref(int slot) { heap_unref(slot); }
struct string *string_ref(struct string *s) { return s; }
int vm_string_ref(struct string *s) { int slot=heap_alloc_slot(VM_STRING);heap[slot].s=s;return slot; }
int vm_copy_page(struct page *p) { (void)p;__builtin_trap(); }
struct page *alloc_page(int type,int a_type,int n);
void create_struct(int no, union vm_value *v) { v->i=heap_alloc_slot(VM_PAGE);heap[v->i].page=alloc_page(STRUCT_PAGE,no,1);heap[v->i].page->values[0].i=1234; }
union vm_value stack_pop(void) { if(!stack_ptr)__builtin_trap();return stack[--stack_ptr]; }
#define stack_push(v) _Generic((v), union vm_value: push_value, int: push_int, bool: push_int)(v)
void push_value(union vm_value v) { stack[stack_ptr++]=v; }
void push_int(int v) { push_value((union vm_value){.i=v}); }
int predicate_key;void vm_call(int fno,int object){(void)object;if(fno==2){stack_pop();int obj=stack_pop().i;stack_push(obj==predicate_key);return;}if(fno==3){stack_pop();int rhs=stack_pop().i;stack_pop();int lhs=stack_pop().i;stack_push(lhs<rhs);return;}int value=stack_pop().i;if(fno==1){int lhs=stack_pop().i;stack_push(lhs<value);}else stack_push((value>predicate_key)-(value<predicate_key));}
${func('src/page.c','variable_initval')}
${func('src/page.c','variable_fini')}
${func('src/heap.c','heap_init')}
${func('src/ffi.c','stub_pop_arguments')}
${func('src/ffi.c','find_static_hll_function')}
${func('src/vm.c','vm_copy')}
${func('src/page.c','array_type')}
int variable_type(struct page *p,int i,void *s,void *r) { (void)s;(void)r;if(p->type==STRUCT_PAGE)return program.structures[p->index].members[i].type.data;if(p->a_type==AIN_IFACE)return i&1?AIN_VOID:AIN_IFACE;return p->array.rank>1?AIN_ARRAY:array_type(p->a_type); }
${func('src/page.c','delete_page_vars')}
void variable_set(struct page *p,int i,int type,union vm_value v) { variable_fini(p->values[i],type,true);p->values[i]=v; }
struct page *alloc_page(int type,int a_type,int n) { struct page *p=xcalloc(1,sizeof(*p)+n*sizeof(union vm_value));p->type=type;p->a_type=a_type;p->nr_vars=n;return p; }
${func('src/page.c','unref_array_type')}
${func('src/page.c','alloc_array')}
${func('src/page.c','realloc_array')}
bool array_index_ok(struct page *p,int i) { return i>=0 && i<p->nr_vars; }
${func('src/page.c','array_copy')}
${func('src/page.c','array_pushback')}
${func('src/page.c','array_popback')}
${func('src/page.c','array_erase')}
${func('src/page.c','array_insert')}
${func('src/page.c','array_fill')}
${func('src/page.c','array_reverse')}
unsigned int heap_get_seq(int object){return object<0?0:object+1;}
struct page *heap_get_delegate_page(int slot){struct page *p=heap_get_page(slot);if(p && p->type!=DELEGATE_PAGE)__builtin_trap();return p;}
${['delegate_is_closure','delegate_new_from_method','delegate_contains','delegate_append','delegate_numof','delegate_entry_current','delegate_entry_live','delegate_remove_entry','delegate_erase','delegate_prune','delegate_clear','delegate_get'].map(n=>func('src/page.c',n)).join('\n')}
${read('src/hll/ArrayGeneric.c').replace(/^#(?:include|define VM_PRIVATE).*$/gm,'')}
${['repair_legacy_scalar_array_pages','repair_legacy_scalar_array','repair_legacy_array_types'].map(n=>func('src/resume.c',n)).join('\n')}
int game_array_coverage(void) {
 ${arraySignatures.functions.filter(f=>f.call_count).map(f=>`{
  struct ain_variable args[]={${f.arguments.map(a=>`{.type={.data=${a.type}}}`).join(',')}};
  struct ain_hll_function f={.name=${JSON.stringify(f.name)},.nr_arguments=${f.arguments.length},.arguments=args,.return_type={.data=${f.result}}};
  if(!generic_array_function_supported(&f))return ${f.index+1};
 }`).join('\n')}
 return 0;
}
#define CHECK(c) do { if(!(c))return __LINE__; } while(0)
static struct ain_variable sig[5];
static void call(char *name,int argc,int a,int b,int c,int d) {
 sig[0].type.data=AIN_REF_ARRAY;
 for(int i=1;i<argc;i++)sig[i].type.data=AIN_INT;
 if(!strcmp(name,"PushBack"))sig[1].type.data=AIN_HLL_PARAM;
 if(!strcmp(name,"Fill"))sig[argc==4?3:1].type.data=AIN_HLL_PARAM;
 if(!strcmp(name,"Find") || !strcmp(name,"FindLast") || !strcmp(name,"IsExist") || !strcmp(name,"LowerBound") || !strcmp(name,"UpperBound") || !strcmp(name,"BinarySearch"))sig[1].type.data=AIN_HLL_PARAM;
 if(!strcmp(name,"Insert"))sig[2].type.data=AIN_HLL_PARAM;
 if(!strcmp(name,"Duplicate") || !strcmp(name,"Concat") || !strcmp(name,"Copy"))sig[1].type.data=AIN_REF_ARRAY;
 struct ain_hll_function f={.name=name,.nr_arguments=argc,.arguments=sig};
 stack_push(a);if(argc>1)stack_push(b);if(argc>2)stack_push(c);if(argc>3)stack_push(d);if(argc>4)stack_push(-1);
 generic_array_call(&f);
}
int run_tests(void) {
 next_slot=1; used=allocated=freed=stack_ptr=0;
 int slot=heap_alloc_slot(VM_PAGE);hll_call_type_param=AIN_INT;
 call("Alloc",5,slot,2,3,-1);CHECK(heap[slot].page->array.rank==2&&heap[slot].page->nr_vars==2);
 int row0=heap[slot].page->values[0].i,row1=heap[slot].page->values[1].i;
 CHECK(row0!=row1&&heap[row0].page->nr_vars==3&&heap[row0].page->array.rank==1);
 hll_call_type_param=AIN_ARRAY;call("At",2,slot,1,0,0);int rowref=stack_pop().i;
 CHECK(rowref==row1&&heap[row1].ref==2);
 hll_call_type_param=AIN_INT;call("At",2,rowref,2,0,0);int cell=stack_pop().i,cellowner=stack_pop().i;
 heap[cellowner].page->values[cell].i=42;heap_unref(cellowner);heap_unref(rowref);
 CHECK(heap[row0].page->values[2].i==0&&heap[row1].page->values[2].i==42);
 call("Numof",1,slot,0,0,0);CHECK(stack_pop().i==2);
 call("Free",1,slot,0,0,0);CHECK(heap[row0].ref==0&&heap[row1].ref==0&&allocated==freed);
 hll_call_type_param=AIN_STRING;call("Alloc",5,slot,2,2,3);
 CHECK(heap[slot].page->array.rank==3);row0=heap[slot].page->values[0].i;
 row1=heap[row0].page->values[0].i;int stringcell=heap[row1].page->values[0].i;
 call("Free",1,slot,0,0,0);CHECK(heap[stringcell].ref==0&&allocated==freed);
 hll_call_type_param=AIN_INT;call("Alloc",5,slot,0,4,-1);
 CHECK(heap[slot].page->array.rank==2&&heap[slot].page->nr_vars==0);
 call("Free",1,slot,0,0,0);CHECK(allocated==freed);
 /* Four explicit dimensions use all five physical HLL arguments. */
 sig[0].type.data=AIN_REF_ARRAY;for(int i=1;i<5;i++)sig[i].type.data=AIN_INT;
 struct ain_hll_function alloc4={.name="Alloc",.nr_arguments=5,.arguments=sig};
 stack_push(slot);stack_push(2);stack_push(1);stack_push(2);stack_push(3);generic_array_call(&alloc4);
 CHECK(heap[slot].page->array.rank==4&&heap[slot].page->nr_vars==2);
 row0=heap[slot].page->values[0].i;CHECK(heap[row0].page->array.rank==3);
 row1=heap[row0].page->values[0].i;CHECK(heap[row1].page->array.rank==2);
 int leaf4=heap[row1].page->values[1].i;CHECK(heap[leaf4].page->array.rank==1&&heap[leaf4].page->nr_vars==3);
 call("Free",1,slot,0,0,0);CHECK(allocated==freed);
 hll_call_type_param=AIN_FLOAT;
 call("Alloc",5,slot,2,-1,-1);
 CHECK(!stack_ptr && heap[slot].page->a_type==AIN_ARRAY_FLOAT);
 call("At",2,slot,1,0,0);
 CHECK(stack_ptr==2 && stack[0].i==slot && stack[1].i==1);
 int index=stack_pop().i, owner=stack_pop().i;
 heap[owner].page->values[index].f=1.25f;
 heap_unref(owner);
 call("Last",1,slot,0,0,0);index=stack_pop().i;owner=stack_pop().i;
 CHECK(heap[owner].page->values[index].f==1.25f);
 heap_unref(owner);
 call("First",1,slot,0,0,0);CHECK(stack_pop().i==0 && stack_pop().i==slot);
 heap_unref(slot);
 call("At",2,slot,-1,0,0);CHECK(stack_pop().i==-1 && stack_pop().i==-1);
 call("At",2,slot,2,0,0);CHECK(stack_pop().i==-1 && stack_pop().i==-1);
 call("Numof",1,slot,0,0,0);CHECK(stack_pop().i==2);
 int before=freed;call("Alloc",5,slot,0,-1,-1);CHECK(freed==before+1);
 call("PopBack",1,slot,0,0,0);CHECK(heap[slot].page->nr_vars==0);
 call("Free",1,slot,0,0,0);CHECK(heap[slot].page==NULL && heap[slot].ref==1);
 hll_call_type_param=AIN_INT;
 call("PushBack",2,slot,11,0,0);call("Insert",3,slot,1,22,0);
 CHECK(heap[slot].page->nr_vars==2 && heap[slot].page->values[0].i==11 && heap[slot].page->values[1].i==22);
 call("Insert",3,slot,0,5,0);CHECK(heap[slot].page->values[0].i==5);
 call("Erase",2,slot,1,0,0);CHECK(stack_pop().i==1 && heap[slot].page->values[1].i==22);
 call("Erase",2,slot,-1,0,0);CHECK(stack_pop().i==0);
 call("Reverse",1,slot,0,0,0);CHECK(heap[slot].page->values[0].i==22);
 call("Fill",2,slot,7,0,0);CHECK(stack_pop().i==2 && heap[slot].page->values[1].i==7);
 call("Realloc",2,slot,4,0,0);CHECK(heap[slot].page->values[2].i==0);
 call("Find",2,slot,7,0,0);CHECK(stack_pop().i==0);
 call("FindLast",2,slot,7,0,0);CHECK(stack_pop().i==1);
 call("IsExist",2,slot,8,0,0);CHECK(stack_pop().i==0);
 call("Free",1,slot,0,0,0);
 call("LowerBound",2,slot,7,0,0);CHECK(stack_pop().i==0);
 call("PushBack",2,slot,1,0,0);call("PushBack",2,slot,3,0,0);
 call("PushBack",2,slot,3,0,0);call("PushBack",2,slot,9,0,0);
 call("LowerBound",2,slot,3,0,0);CHECK(stack_pop().i==1);
 call("UpperBound",2,slot,3,0,0);CHECK(stack_pop().i==3);
 call("LowerBound",2,slot,10,0,0);CHECK(stack_pop().i==4);
 call("BinarySearch",2,slot,3,0,0);CHECK(stack_pop().i==1);
 call("BinarySearch",2,slot,7,0,0);CHECK(stack_pop().i==-1);
 call("Fill",4,slot,1,2,8);CHECK(stack_pop().i==2 && heap[slot].page->values[0].i==1 && heap[slot].page->values[1].i==8 && heap[slot].page->values[2].i==8 && heap[slot].page->values[3].i==9);
 heap[slot].page->values[1].i=3;heap[slot].page->values[2].i=3;
 struct ain_variable comparator_arg[1]={{{AIN_INT,-1,NULL}}};
 struct ain_function comparator[1]={{.vars=comparator_arg,.nr_vars=1,.nr_args=1}};
 program.functions=comparator;program.nr_functions=1;
 struct ain_variable comparator_sig[2]={{{AIN_REF_ARRAY}},{{AIN_HLL_FUNC}}};
 struct ain_hll_function callback={.name="BinarySearch",.nr_arguments=2,.arguments=comparator_sig};
 predicate_key=3;stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==1 && !stack_ptr);
 predicate_key=7;stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==-1 && !stack_ptr);
 callback.name="LowerBound";stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==3 && !stack_ptr);
 callback.name="Where";predicate_key=3;stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);
 int filtered=stack_pop().i;CHECK(!stack_ptr && heap[filtered].page->nr_vars==2);
 CHECK(heap[filtered].page->values[0].i==1 && heap[filtered].page->values[1].i==9);
 heap[filtered].page->values[0].i=20;CHECK(heap[slot].page->values[0].i==1);heap_unref(filtered);
 callback.name="Any";stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==1 && !stack_ptr);
 callback.name="All";stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==0 && !stack_ptr);
 callback.name="Numof";stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==2 && !stack_ptr);
 struct ain_variable less_args[2]={{{AIN_INT}},{{AIN_INT}}};
 struct ain_function sort_functions[2]={comparator[0],{.vars=less_args,.nr_args=2,.nr_vars=2,.return_type={AIN_BOOL}}};
 program.functions=sort_functions;program.nr_functions=2;callback.name="QuickSort";
 heap[slot].page->values[0].i=9;heap[slot].page->values[1].i=3;heap[slot].page->values[2].i=1;heap[slot].page->values[3].i=3;
 stack_push(slot);stack_push(-1);stack_push(1);generic_array_call(&callback);CHECK(stack_pop().i==slot && heap[slot].ref==2 && !stack_ptr);heap_unref(slot);
 CHECK(heap[slot].page->values[0].i==1 && heap[slot].page->values[1].i==3 && heap[slot].page->values[2].i==3 && heap[slot].page->values[3].i==9);
 program.functions=comparator;program.nr_functions=1;callback.name="EraseAll";
 stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);
 CHECK(stack_pop().i==1&&!stack_ptr&&heap[slot].page->nr_vars==2&&heap[slot].page->values[0].i==3&&heap[slot].page->values[1].i==3);
 callback.name="Remain";stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);
 CHECK(stack_pop().i==slot&&heap[slot].ref==2&&heap[slot].page==NULL);heap_unref(slot);
 callback.name="All";stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&callback);CHECK(stack_pop().i==1&&!stack_ptr);
 call("Realloc",2,slot,4,0,0);
 program.nr_functions=0;program.functions=NULL;
 for(int i=0;i<4;i++)heap[slot].page->values[i].i=i+1;
 array_copy(heap[slot].page,1,heap[slot].page,0,3);
 CHECK(heap[slot].page->values[0].i==1 && heap[slot].page->values[1].i==1 && heap[slot].page->values[2].i==2 && heap[slot].page->values[3].i==3);
 array_copy(heap[slot].page,0,heap[slot].page,1,3);
 CHECK(heap[slot].page->values[0].i==1 && heap[slot].page->values[1].i==2 && heap[slot].page->values[2].i==3);
 CHECK(array_fill(heap[slot].page,1,INT_MAX,(union vm_value){.i=9})==3);
 call("Unique",1,slot,0,0,0);CHECK(!stack_ptr && heap[slot].page->nr_vars==2 && heap[slot].page->values[0].i==1 && heap[slot].page->values[1].i==9);
 call("Reverse",1,slot,0,0,0);call("Sort",1,slot,0,0,0);
 CHECK(stack_pop().i==slot && heap[slot].ref==2 && heap[slot].page->values[0].i==1 && heap[slot].page->values[1].i==9);heap_unref(slot);
 call("Free",1,slot,0,0,0);
 hll_call_type_param=AIN_STRING;
 call("Alloc",5,slot,1,-1,-1);int original=heap[slot].page->values[0].i;
 call("At",2,slot,0,0,0);CHECK(stack_ptr==1 && stack[0].i==original && heap[original].ref==2);
 heap_unref(stack_pop().i);CHECK(heap[original].ref==1);
 call("Free",1,slot,0,0,0);CHECK(heap[original].ref==0);
 call("Alloc",5,slot,3,-1,-1);int unique0=heap[slot].page->values[0].i, unique1=heap[slot].page->values[1].i, unique2=heap[slot].page->values[2].i;
 call("Unique",1,slot,0,0,0);CHECK(!stack_ptr && heap[slot].page->nr_vars==1 && heap[unique0].ref==1 && heap[unique1].ref==0 && heap[unique2].ref==0);
 call("ShallowCopy",1,slot,0,0,0);int shallow=stack_pop().i;
 CHECK(heap[shallow].page!=heap[slot].page&&heap[shallow].page->values[0].i==unique0&&heap[unique0].ref==2);heap_unref(shallow);CHECK(heap[unique0].ref==1);
 call("Free",1,slot,0,0,0);CHECK(heap[unique0].ref==0);
 int value=vm_string_ref(&EMPTY_STRING);call("PushBack",2,slot,value,0,0);
 CHECK(heap[value].ref==1 && heap[slot].page->values[0].i==value);
 call("PopBack",1,slot,0,0,0);CHECK(heap[value].ref==0 && heap[slot].page==NULL);
 value=vm_string_ref(&EMPTY_STRING);call("Fill",2,slot,value,0,0);CHECK(stack_pop().i==0 && heap[value].ref==0);
 call("Alloc",5,slot,2,-1,-1);int old0=heap[slot].page->values[0].i,old1=heap[slot].page->values[1].i;
 value=vm_string_ref(&EMPTY_STRING);CHECK(array_fill(heap[slot].page,2,1,(union vm_value){.i=value})==0 && heap[value].ref==0);
 value=vm_string_ref(&EMPTY_STRING);CHECK(array_fill(heap[slot].page,0,-1,(union vm_value){.i=value})==0 && heap[value].ref==0);
 value=vm_string_ref(&EMPTY_STRING);call("Fill",2,slot,value,0,0);
 CHECK(stack_pop().i==2 && heap[value].ref==0 && heap[old0].ref==0 && heap[old1].ref==0);
 call("Realloc",2,slot,0,0,0);
 CHECK(heap[slot].page==NULL && allocated==freed && !stack_ptr);
 struct ain_variable members[1]={{{AIN_INT, -1, NULL}}};
 struct test_structure structs[1]={{members,1}};program.structures=structs;program.nr_structures=1;
 struct ain_type element={AIN_STRUCT,0,NULL};struct ain_variable owners[1]={{{AIN_ARRAY,0,&element}}};
 program.globals=owners;program.nr_globals=1;heap[0].ref=1;heap[0].type=VM_PAGE;heap[0].page=alloc_page(GLOBAL_PAGE,0,1);heap[0].page->values[0].i=slot;
 hll_call_type_param=AIN_STRUCT;call("EmplaceBack",1,slot,0,0,0);int object=stack_pop().i;
 CHECK(heap[slot].page->a_type==AIN_ARRAY_STRUCT && heap[slot].page->array.struct_type==0 && heap[object].ref==2 && heap[object].page->values[0].i==1234);
 heap_unref(object);call("Free",1,slot,0,0,0);CHECK(heap[object].ref==0);
 /* Batch container dependencies: self-copy, deep strings, sorting, references and ranges. */
 hll_call_type_param=AIN_INT;call("Alloc",5,slot,4,-1,-1);
 heap[slot].page->values[0].i=4;heap[slot].page->values[1].i=1;heap[slot].page->values[2].i=3;heap[slot].page->values[3].i=2;
 int dst=heap_alloc_slot(VM_PAGE);call("Duplicate",2,dst,slot,0,0);
 CHECK(heap[dst].page!=heap[slot].page&&heap[dst].page->values[0].i==4);
 call("Concat",2,dst,dst,0,0);CHECK(heap[dst].page->nr_vars==8&&heap[dst].page->values[4].i==4);
 call("Copy",2,slot,dst,0,0);CHECK(stack_pop().i==4&&heap[slot].page->values[3].i==2);
 call("DescSort",1,slot,0,0,0);CHECK(stack_pop().i==slot&&heap[slot].page->values[0].i==4&&heap[slot].page->values[3].i==1);heap_unref(slot);
 call("Min",1,slot,0,0,0);CHECK(stack_pop().i==3&&stack_pop().i==slot);heap_unref(slot);
 call("Max",1,slot,0,0,0);CHECK(stack_pop().i==0&&stack_pop().i==slot);heap_unref(slot);
 call("Shuffle",2,slot,123,0,0);int sum=0;for(int i=0;i<4;i++)sum+=heap[slot].page->values[i].i;CHECK(sum==10);
 /* Explicit seeds are repeatable. The script's sentinel -1 must select
    different assistant lines instead of resetting the PRNG on each click. */
 int seeded[4], first=-1, changed=0;
 for(int attempt=0;attempt<10;attempt++){
   for(int i=0;i<4;i++)heap[slot].page->values[i].i=i;
   call("Shuffle",2,slot,123,0,0);
   for(int i=0;i<4;i++){if(!attempt)seeded[i]=heap[slot].page->values[i].i;else CHECK(seeded[i]==heap[slot].page->values[i].i);}
   for(int i=0;i<4;i++)heap[slot].page->values[i].i=i;
   call("Shuffle",2,slot,-1,0,0);
   if(!attempt)first=heap[slot].page->values[0].i;
   else changed+=first!=heap[slot].page->values[0].i;
 }
 CHECK(changed>0);
 call("Free",1,dst,0,0,0);call("Free",1,slot,0,0,0);
 hll_call_type_param=AIN_STRING;value=vm_string_ref(&EMPTY_STRING);call("PushBack",2,slot,value,0,0);
 call("Duplicate",2,dst,slot,0,0);CHECK(heap[dst].page->values[0].i!=value&&heap_get_string(heap[dst].page->values[0].i)==&EMPTY_STRING);
 call("Free",1,slot,0,0,0);CHECK(heap[value].ref==0);call("Free",1,dst,0,0,0);
 hll_call_type_param=AIN_INT;call("Alloc",5,slot,4,-1,-1);for(int i=0;i<4;i++)heap[slot].page->values[i].i=i;
 struct ain_variable rangesig[4]={{{AIN_REF_ARRAY}},{{AIN_INT}},{{AIN_INT}},{{AIN_HLL_PARAM}}};
 struct ain_hll_function ranged={.name="Find",.nr_arguments=4,.arguments=rangesig};
 stack_push(slot);stack_push(1);stack_push(3);stack_push(2);generic_array_call(&ranged);CHECK(stack_pop().i==2);
 stack_push(slot);stack_push(1);stack_push(2);stack_push(2);generic_array_call(&ranged);CHECK(stack_pop().i==-1);
 rangesig[3].type.data=AIN_HLL_FUNC;predicate_key=1;
 program.functions=comparator;program.nr_functions=1;
 stack_push(slot);stack_push(1);stack_push(3);stack_push(-1);stack_push(0);generic_array_call(&ranged);CHECK(stack_pop().i==2&&!stack_ptr);
 program.functions=sort_functions;program.nr_functions=2;
 callback.name="Max";stack_push(slot);stack_push(-1);stack_push(1);generic_array_call(&callback);
 CHECK(stack_pop().i==3&&stack_pop().i==slot);heap_unref(slot);call("Free",1,slot,0,0,0);program.nr_functions=0;
 hll_call_type_param=AIN_IFACE;call("Alloc",5,slot,2,-1,-1);
 CHECK(heap[slot].page->nr_vars==4 && heap[slot].page->values[0].i==-1 && heap[slot].page->values[1].i==0);
 call("Numof",1,slot,0,0,0);CHECK(stack_pop().i==2);
 call("At",2,slot,1,0,0);CHECK(stack_pop().i==0 && stack_pop().i==-1);
 call("Free",1,slot,0,0,0);
 union vm_value borrowed_object;create_struct(0,&borrowed_object);object=borrowed_object.i;
 sig[0].type.data=AIN_REF_ARRAY;sig[1].type.data=AIN_HLL_PARAM;
 struct ain_hll_function ifacepush={.name="PushBack",.nr_arguments=2,.arguments=sig};
 stack_push(slot);stack_push(object);stack_push(309);generic_array_call(&ifacepush);
 CHECK(!stack_ptr && heap[object].ref==2 && heap[slot].page->nr_vars==2 && heap[slot].page->values[1].i==309);
 heap_unref(object);call("First",1,slot,0,0,0);CHECK(stack_pop().i==309 && stack_pop().i==object && heap[object].ref==2);heap_unref(object);
 call("Realloc",2,slot,3,0,0);CHECK(heap[object].ref==1 && heap[slot].page->values[4].i==-1);
 call("Reverse",1,slot,0,0,0);CHECK(heap[slot].page->values[4].i==object && heap[slot].page->values[5].i==309);
 call("Erase",2,slot,2,0,0);CHECK(stack_pop().i==1 && heap[object].ref==0);
 call("Free",1,slot,0,0,0);
 create_struct(0,&borrowed_object);object=borrowed_object.i;hll_call_type_param=AIN_REF_STRUCT;
 call("PushBack",2,slot,object,0,0);CHECK(heap[object].ref==2);
 heap_unref(object);CHECK(heap[object].ref==1);
 call("At",2,slot,0,0,0);CHECK(stack_pop().i==object && heap[object].ref==2);
 heap_unref(object);call("Free",1,slot,0,0,0);CHECK(heap[object].ref==0);
 /* Card construction appends through array<ref T> to an owned T array. */
 create_struct(0,&borrowed_object);object=borrowed_object.i;
 union vm_value one={.i=1};
 heap_set_page(slot,alloc_array(1,&one,AIN_ARRAY_STRUCT,0,false));
 heap[slot].page->values[0].i=object;
 call("Concat",2,slot,slot,0,0);
 CHECK(heap[slot].page->a_type==AIN_ARRAY_STRUCT&&heap[slot].page->nr_vars==2);
 CHECK(heap[slot].page->values[1].i==object&&heap[object].ref==2);
 call("Free",1,slot,0,0,0);CHECK(heap[object].ref==0);
 /* Interface predicates/comparators carry both object and vtable slots. */
 struct ain_variable iface_predvars[2]={{{AIN_IFACE}},{{AIN_VOID}}};
 struct ain_variable iface_lessvars[4]={{{AIN_IFACE}},{{AIN_VOID}},{{AIN_IFACE}},{{AIN_VOID}}};
 struct ain_function iface_callbacks[4]={0};
 iface_callbacks[2]=(struct ain_function){.vars=iface_predvars,.nr_vars=2,.nr_args=2,.return_type={AIN_BOOL}};
 iface_callbacks[3]=(struct ain_function){.vars=iface_lessvars,.nr_vars=4,.nr_args=4,.return_type={AIN_BOOL}};
 program.functions=iface_callbacks;program.nr_functions=4;hll_call_type_param=AIN_IFACE;
 union vm_value oa,ob;create_struct(0,&oa);create_struct(0,&ob);
 sig[0].type.data=AIN_REF_ARRAY;sig[1].type.data=AIN_HLL_PARAM;
 stack_push(slot);stack_push(ob);stack_push(22);generic_array_call(&ifacepush);
 stack_push(slot);stack_push(oa);stack_push(11);generic_array_call(&ifacepush);
 heap_unref(oa.i);heap_unref(ob.i);
 struct ain_variable cb_sig[2]={{{AIN_REF_ARRAY}},{{AIN_HLL_FUNC}}};
 struct ain_hll_function cb={.name="First",.nr_arguments=2,.arguments=cb_sig};predicate_key=oa.i;
 stack_push(slot);stack_push(-1);stack_push(2);generic_array_call(&cb);
 CHECK(stack_pop().i==11&&stack_pop().i==oa.i);heap_unref(oa.i);
 cb.name="Where";stack_push(slot);stack_push(-1);stack_push(2);generic_array_call(&cb);filtered=stack_pop().i;
 CHECK(heap[filtered].page->nr_vars==2&&heap[filtered].page->values[0].i==oa.i&&heap[filtered].page->values[1].i==11);
 /* Actual AdvInformationMap.Erase: Where -> Concat -> delete temporary -> EraseAll. */
 int retired=heap_alloc_page(NULL);call("Concat",2,retired,filtered,0,0);heap_unref(filtered);
 CHECK(!stack_ptr&&heap[oa.i].ref==2&&heap[retired].page->nr_vars==2);
 CHECK(heap[retired].page->values[0].i==oa.i&&heap[retired].page->values[1].i==11);
 cb.name="Sort";stack_push(slot);stack_push(-1);stack_push(3);generic_array_call(&cb);CHECK(stack_pop().i==slot);heap_unref(slot);
 CHECK(heap[slot].page->values[0].i==oa.i&&heap[slot].page->values[1].i==11);
 cb.name="Min";stack_push(slot);stack_push(-1);stack_push(3);generic_array_call(&cb);
 CHECK(stack_pop().i==11&&stack_pop().i==oa.i);heap_unref(oa.i);
 cb.name="Max";stack_push(slot);stack_push(-1);stack_push(3);generic_array_call(&cb);
 CHECK(stack_pop().i==22&&stack_pop().i==ob.i);heap_unref(ob.i);
 cb.name="EraseAll";stack_push(slot);stack_push(-1);stack_push(2);generic_array_call(&cb);
 CHECK(stack_pop().i==1&&heap[oa.i].ref==1&&heap[slot].page->nr_vars==2&&heap[slot].page->values[0].i==ob.i);
 call("Concat",2,retired,retired,0,0);
 CHECK(heap[retired].page->nr_vars==4&&heap[retired].page->values[3].i==11&&heap[oa.i].ref==2);
 call("Duplicate",2,retired,retired,0,0);CHECK(heap[oa.i].ref==2);
 heap_unref(retired);CHECK(heap[oa.i].ref==0);
 int empty_iface=heap_alloc_page(NULL);
 call("Concat",2,slot,empty_iface,0,0);CHECK(heap[slot].page->nr_vars==2&&heap[ob.i].ref==1);
 call("Duplicate",2,empty_iface,slot,0,0);CHECK(heap[ob.i].ref==2);
 heap_unref(empty_iface);CHECK(heap[ob.i].ref==1);
 call("Free",1,slot,0,0,0);CHECK(heap[ob.i].ref==0);
 free_page(heap[0].page);heap[0].page=NULL;heap[0].ref=0;program.nr_globals=0;program.nr_structures=0;
 CHECK(allocated==freed);
 struct ain_variable pred[2]={{{AIN_REF_ARRAY}},{{AIN_HLL_FUNC}}};
 struct ain_hll_function unsupported={.name="Unique",.nr_arguments=2,.arguments=pred};
 CHECK(!generic_array_function_supported(&unsupported));
 struct static_library lib={"Test",{{"Clamp",(void*)1,"int,int,int"},{"Clamp",(void*)2,"float,float,float"},{"Legacy",(void*)3,NULL},{NULL,NULL,NULL}}};
 CHECK(find_static_hll_function(&lib,"Clamp","int,int,int")==&lib.functions[0]);
 CHECK(find_static_hll_function(&lib,"Clamp","float,float,float")==&lib.functions[1]);
 CHECK(find_static_hll_function(&lib,"Clamp","int")==NULL);
 CHECK(find_static_hll_function(&lib,"Legacy","int")==&lib.functions[2]);
 value=vm_string_ref(&EMPTY_STRING);stack_push(value);
 struct ain_variable stubargs[2]={{{AIN_STRING}},{{AIN_REF_INT}}};
 struct ain_hll_function stub={.name="Missing",.nr_arguments=2,.arguments=stubargs};
 stack_push(slot);stack_push(0);stub_pop_arguments(&stub);
 CHECK(!stack_ptr && heap[value].ref==0);
 int borrowed=heap_alloc_slot(VM_PAGE);stack_push(borrowed);
 stubargs[0].type.data=AIN_ARRAY_INT;stub.nr_arguments=1;program.version=1;
 stub_pop_arguments(&stub);CHECK(!stack_ptr && heap[borrowed].ref==1);
 program.version=12;stack_push(borrowed);stub_pop_arguments(&stub);
 CHECK(!stack_ptr && heap[borrowed].ref==0);
 int dgslot=heap_alloc_slot(VM_PAGE);program.nr_functions=3;
 struct ain_variable dgargs[2]={{{AIN_REF_DELEGATE}},{{AIN_HLL_FUNC}}};
 struct ain_hll_function dgcall={.name="Set",.nr_arguments=2,.arguments=dgargs};
 stack_push(dgslot);stack_push(-1);stack_push(1);generic_delegate_call(&dgcall);
 CHECK(!stack_ptr && delegate_numof(heap[dgslot].page)==1 && heap[dgslot].ref==1);
 dgcall.name="Add";stack_push(dgslot);stack_push(-1);stack_push(1);generic_delegate_call(&dgcall);CHECK(delegate_numof(heap[dgslot].page)==1);
 stack_push(dgslot);stack_push(-1);stack_push(2);generic_delegate_call(&dgcall);CHECK(delegate_numof(heap[dgslot].page)==2);
 dgcall.name="Exist";stack_push(dgslot);stack_push(-1);stack_push(1);generic_delegate_call(&dgcall);CHECK(stack_pop().i==1);
 dgcall.name="Erase";stack_push(dgslot);stack_push(-1);stack_push(1);generic_delegate_call(&dgcall);CHECK(delegate_numof(heap[dgslot].page)==1);
 dgcall.name="Clear";dgcall.nr_arguments=1;stack_push(dgslot);generic_delegate_call(&dgcall);
 dgcall.name="Empty";stack_push(dgslot);generic_delegate_call(&dgcall);CHECK(stack_pop().i==1 && !stack_ptr);
 heap_unref(dgslot);CHECK(allocated==freed);program.nr_functions=0;
 /* A captured environment is owned by its delegate, but its original this
    remains weak and must be checked again after that object is released. */
 int closure_owner=heap_alloc_page(alloc_page(STRUCT_PAGE,0,0));
 struct page *env=alloc_page(CLOSURE_PAGE,0,0);
 env->local.struct_ptr=closure_owner;env->local.struct_seq=heap_get_seq(closure_owner);
 int closure=heap_alloc_page(env),target,method;
 struct page *callbacks=delegate_new_from_method(closure,1);heap_unref(closure);
 CHECK(delegate_get(callbacks,0,&target,&method)&&target==closure&&method==1);
 heap_unref(closure_owner);
 CHECK(!delegate_get(callbacks,0,&target,&method)&&callbacks->nr_vars==0&&heap[closure].ref==0);
 delete_page_vars(callbacks);free_page(callbacks);CHECK(allocated==freed);
 /* A live VM_PAGE slot can legitimately contain NULL (empty generic array).
    Clearing a delegate to a slot reused in this state must not dereference it. */
 int nullpage=heap_alloc_slot(VM_PAGE);
 CHECK(page_index_valid(nullpage)&&heap_get_page(nullpage)==NULL);
 callbacks=delegate_new_from_method(nullpage,1);
 CHECK(delegate_clear(callbacks)==callbacks&&callbacks->nr_vars==0);
 free_page(callbacks);heap_unref(nullpage);CHECK(allocated==freed);
 /* A new typed array passed by a local reference should resolve its owner
    from the active frame, independent of how many unrelated heap slots exist. */
 {
 union {long long align;unsigned char bytes[sizeof(struct page)+sizeof(union vm_value)];} owner_storage={0};
 struct page *owner=(struct page*)owner_storage.bytes;
 struct ain_type owned_element={AIN_STRUCT,0,NULL};
 struct ain_variable owned_var={.type={AIN_REF_ARRAY,-1,&owned_element}};
 struct ain_function owner_function={.vars=&owned_var,.nr_vars=1};
 struct test_structure owner_structs[2]={{.members=&owned_var,.nr_members=1},{0}};
 program.functions=&owner_function;program.nr_functions=1;program.structures=owner_structs;program.nr_structures=2;
 next_slot=241;heap[239]=(struct vm_pointer){.ref=1,.type=VM_PAGE};
 owner->type=LOCAL_PAGE;owner->index=0;owner->nr_vars=1;owner->values[0].i=239;
 heap[240]=(struct vm_pointer){.ref=1,.type=VM_PAGE,.page=owner};
 call_stack_ptr=1;call_stack[0].page_slot=240;call_stack[0].struct_page=-1;
 page_checks=0;CHECK(generic_array_struct_type(239)==0);CHECK(page_checks<8);
 owner->type=STRUCT_PAGE;call_stack[0].page_slot=-1;call_stack[0].struct_page=240;
 page_checks=0;CHECK(generic_array_struct_type(239)==0);CHECK(page_checks<8);
 owned_element.struc=1;CHECK(generic_array_struct_type(239)==1);
 call_stack_ptr=0;CHECK(generic_array_struct_type(239)==1); /* uncommon owner fallback */
 }
 memset(heap,0x55,heap_size*sizeof(*heap));heap_init();
 for(int i=0;i<256;i++)CHECK(heap[i].ref==0 && heap[i].type==0 && heap[i].page==NULL && heap[i].s==NULL && heap_free_stack[i]==i);
 CHECK(heap_free_ptr==1 && heap_next_seq==1);
 return 0;
}
static int erase_by_array(int target,int source,int type) {
 struct ain_variable args[]={{{AIN_REF_ARRAY}},{{AIN_REF_ARRAY}}};
 struct ain_hll_function f={.name="Erase",.nr_arguments=2,.arguments=args,.return_type={AIN_BOOL}};
 hll_call_type_param=type;stack_push(target);stack_push(source);generic_array_call(&f);
 return stack_pop().i;
}
int erase_array_cases(void) {
 next_slot=1;used=allocated=freed=stack_ptr=0;call_stack_ptr=0;
 memset(heap,0,sizeof(heap_storage));memset(&program,0,sizeof(program));
 int target=heap_alloc_slot(VM_PAGE),source=heap_alloc_slot(VM_PAGE),empty=heap_alloc_slot(VM_PAGE);
 hll_call_type_param=AIN_INT;
 int current[]={8,3,15,3,9},previous[]={3,20,3};
 for(int i=0;i<5;i++)call("PushBack",2,target,current[i],0,0);
 for(int i=0;i<3;i++)call("PushBack",2,source,previous[i],0,0);
 /* AddDiffAdmiral: keep the new IDs in their display order. */
 stack_push(9876);CHECK(erase_by_array(target,source,AIN_INT));CHECK(stack_pop().i==9876&&!stack_ptr);
 struct page *p=heap[target].page;
 CHECK(p->nr_vars==3&&p->values[0].i==8&&p->values[1].i==15&&p->values[2].i==9);
 CHECK(heap[source].page->nr_vars==3&&heap[source].page->values[0].i==3&&heap[source].page->values[1].i==20);
 CHECK(heap[source].ref==1&&heap[target].ref==1);
 CHECK(!erase_by_array(target,source,AIN_INT));
 CHECK(!erase_by_array(target,empty,AIN_INT)&&!erase_by_array(empty,source,AIN_INT));
 CHECK(erase_by_array(target,target,AIN_INT)&&heap[target].page->nr_vars==0&&heap[target].ref==1);
 CHECK(!erase_by_array(target,target,AIN_INT));
 heap_unref(target);heap_unref(source);heap_unref(empty);CHECK(allocated==freed);

 /* Check/decArrayS use character IDs: equal text in different VM slots
    must match, and the borrowed source must keep its own string alive. */
 struct string a={.text="character-A"},b={.text="character-B"},same_a={.text="character-A"};
 target=heap_alloc_slot(VM_PAGE);source=heap_alloc_slot(VM_PAGE);hll_call_type_param=AIN_STRING;
 int a1=vm_string_ref(&a),b1=vm_string_ref(&b),a2=vm_string_ref(&a),source_a=vm_string_ref(&same_a);
 call("PushBack",2,target,a1,0,0);call("PushBack",2,target,b1,0,0);call("PushBack",2,target,a2,0,0);
 call("PushBack",2,source,source_a,0,0);
 CHECK(a1!=source_a&&erase_by_array(target,source,AIN_STRING));
 CHECK(heap[a1].ref==0&&heap[a2].ref==0&&heap[b1].ref==1&&heap[source_a].ref==1);
 CHECK(heap[target].page->nr_vars==1&&heap[target].page->values[0].i==b1);
 CHECK(heap[source].ref==1&&heap[source].page->values[0].i==source_a);
 CHECK(erase_by_array(target,target,AIN_STRING)&&heap[b1].ref==0);
 heap_unref(target);heap_unref(source);CHECK(heap[source_a].ref==0&&allocated==freed);

 union vm_value two={.i=2},one={.i=1};
 target=heap_alloc_page(alloc_array(1,&two,AIN_ARRAY_FLOAT,-1,false));
 source=heap_alloc_page(alloc_array(1,&one,AIN_ARRAY_FLOAT,-1,false));
 heap[target].page->values[0].f=0.0f;heap[target].page->values[1].f=1.5f;heap[source].page->values[0].f=-0.0f;
 CHECK(erase_by_array(target,source,AIN_FLOAT));
 CHECK(heap[target].page->nr_vars==1&&heap[target].page->values[0].f==1.5f);
 heap_unref(target);heap_unref(source);CHECK(allocated==freed);

 /* Reference and interface elements release only the removed ownership. */
 struct ain_variable member={.type={AIN_INT}};struct test_structure structure={.members=&member,.nr_members=1};
 program.structures=&structure;program.nr_structures=1;
 int object=heap_alloc_page(alloc_page(STRUCT_PAGE,0,1));
 target=heap_alloc_slot(VM_PAGE);source=heap_alloc_slot(VM_PAGE);hll_call_type_param=AIN_REF_STRUCT;
 call("PushBack",2,target,object,0,0);call("PushBack",2,source,object,0,0);CHECK(heap[object].ref==3);
 CHECK(erase_by_array(target,source,AIN_REF_STRUCT)&&heap[object].ref==2);
 heap_unref(target);heap_unref(source);CHECK(heap[object].ref==1);
 target=heap_alloc_page(alloc_page(ARRAY_PAGE,AIN_IFACE,4));source=heap_alloc_page(alloc_page(ARRAY_PAGE,AIN_IFACE,2));
 heap[target].page->array.rank=heap[source].page->array.rank=1;
 heap[target].page->values[0].i=object;heap[target].page->values[1].i=7;
 heap[target].page->values[2].i=object;heap[target].page->values[3].i=9;
 heap[source].page->values[0].i=object;heap[source].page->values[1].i=7;
 heap_ref(object);heap_ref(object);heap_ref(object);
 CHECK(erase_by_array(target,source,AIN_IFACE)&&heap[object].ref==3);
 CHECK(heap[target].page->nr_vars==2&&heap[target].page->values[0].i==object&&heap[target].page->values[1].i==9);
 CHECK(heap[source].page->nr_vars==2&&heap[source].page->values[1].i==7);
 heap_unref(target);heap_unref(source);CHECK(heap[object].ref==1);heap_unref(object);CHECK(allocated==freed);
 memset(&program,0,sizeof(program));return 0;
}
/* QuestMapObjectCollection@0 (0x459d56) calls Alloc with type 79,
   declaring m_indexMap as array<array<int>>. Its cells are node indices,
   even when a number also happens to identify a live VM object. */
int nested_array_lifecycle(void) {
 next_slot=1;used=allocated=freed=stack_ptr=0;
 memset(heap,0,sizeof(heap_storage));memset(&program,0,sizeof(program));
 struct ain_type integer={AIN_INT,-1,NULL},row={AIN_ARRAY,-1,&integer};
 struct ain_variable member={.type={AIN_ARRAY,-1,&row}};
 struct test_structure collection={.members=&member,.nr_members=1};
 program.version=12;program.structures=&collection;program.nr_structures=1;
 int collection_slot=heap_alloc_page(alloc_page(STRUCT_PAGE,0,1));
 int grid=heap_alloc_slot(VM_PAGE);heap[collection_slot].page->values[0].i=grid;
 int unrelated=heap_alloc_page(alloc_page(DELEGATE_PAGE,0,0));
 call_stack_ptr=1;call_stack[0].page_slot=-1;call_stack[0].struct_page=collection_slot;
 hll_call_type_param=AIN_ARRAY;call("Alloc",5,grid,2,3,-1);
 struct page *p=heap[grid].page;int row0=p->values[0].i,row1=p->values[1].i;
 /* Check the whole allocate/write/release sequence, not just dimensions. */
 for(int r=0;r<2;r++)for(int c=0;c<3;c++)heap[p->values[r].i].page->values[c].i=-1;
 heap[row0].page->values[2].i=unrelated;heap[row1].page->values[2].i=unrelated;
 heap_unref(collection_slot);
 CHECK(heap[row0].ref==0&&heap[row1].ref==0&&heap[grid].ref==0);
 CHECK(heap[unrelated].ref==1);heap_unref(unrelated);CHECK(allocated==freed);
 memset(&program,0,sizeof(program));call_stack_ptr=0;
 return 0;
}
int nested_array_restore(void) {
 next_slot=1;used=allocated=freed=stack_ptr=0;call_stack_ptr=0;
 memset(heap,0,sizeof(heap_storage));memset(&program,0,sizeof(program));
 struct ain_type integer={AIN_INT,-1,NULL},row={AIN_ARRAY,-1,&integer};
 struct ain_variable member={.type={AIN_ARRAY,-1,&row}};
 struct test_structure collection={.members=&member,.nr_members=1};
 program.version=12;program.structures=&collection;program.nr_structures=1;
 int owner=heap_alloc_page(alloc_page(STRUCT_PAGE,0,1));
 /* Slot 122 is an unrelated config delegate in the captured snapshot. */
 heap[122]=(struct vm_pointer){.ref=1,.type=VM_PAGE,.page=alloc_page(DELEGATE_PAGE,0,0)};
 next_slot=123;
 int grid=heap_alloc_page(alloc_page(ARRAY_PAGE,AIN_ARRAY,${mapRows}));
 heap[owner].page->values[0].i=grid;struct page *p=heap[grid].page;p->array.rank=2;
 static const int cells[${mapRows}][${mapColumns}]={${mapFixture.values.map(row=>`{${row.join(',')}}`).join(',\n')}};
 for(int r=0;r<${mapRows};r++) {
  struct page *leaf=alloc_page(ARRAY_PAGE,AIN_ARRAY,${mapColumns});leaf->array.rank=1;
  for(int c=0;c<${mapColumns};c++)leaf->values[c].i=cells[r][c];
  p->values[r].i=heap_alloc_page(leaf);
 }
 int allocations=allocated;
 repair_legacy_array_types();repair_legacy_array_types();
 CHECK(p->a_type==AIN_ARRAY_INT&&p->array.rank==2&&allocated==allocations&&freed==0);
 for(int r=0;r<${mapRows};r++) {
  struct page *leaf=heap[p->values[r].i].page;
  CHECK(leaf->a_type==AIN_ARRAY_INT&&leaf->array.rank==1&&heap[p->values[r].i].ref==1);
  for(int c=0;c<${mapColumns};c++)CHECK(leaf->values[c].i==cells[r][c]);
 }
 heap_unref(owner);CHECK(heap[122].ref==1);heap_unref(122);CHECK(allocated==freed);
 memset(&program,0,sizeof(program));
 return 0;
}
int nested_array_shapes(void) {
 next_slot=1;used=allocated=freed=stack_ptr=0;call_stack_ptr=0;
 memset(heap,0,sizeof(heap_storage));memset(&program,0,sizeof(program));
 struct ain_type integer={AIN_INT,-1,NULL},row={AIN_ARRAY,-1,&integer},matrix={AIN_ARRAY,-1,&row};
 struct ain_variable owner_var={.type={AIN_ARRAY,-1,&matrix}};
 struct ain_function owner_function={.vars=&owner_var,.nr_vars=1};
 program.version=12;program.functions=&owner_function;program.nr_functions=1;
 int owner=heap_alloc_page(alloc_page(LOCAL_PAGE,0,1)),slot=heap_alloc_slot(VM_PAGE);
 heap[owner].page->values[0].i=slot;
 call_stack_ptr=1;call_stack[0].page_slot=owner;call_stack[0].struct_page=-1;
 hll_call_type_param=AIN_ARRAY;call("Alloc",5,slot,2,2,3);
 struct page *p=heap[slot].page;CHECK(p->array.rank==3&&p->a_type==AIN_ARRAY_INT);
 struct page *leaf=heap[heap[p->values[0].i].page->values[0].i].page;
 CHECK(leaf->array.rank==1&&leaf->a_type==AIN_ARRAY_INT&&leaf->values[2].i==0);
 call("Free",1,slot,0,0,0);
 /* Allocating only two dimensions of a 3D declaration leaves array-valued cells. */
 call("Alloc",5,slot,2,2,-1);p=heap[slot].page;
 int child=heap[p->values[0].i].page->values[0].i;
 CHECK(p->a_type==AIN_ARRAY&&heap[child].ref==1&&heap[child].page==NULL);
 repair_legacy_array_types();CHECK(p->a_type==AIN_ARRAY&&heap[child].ref==1);
 call("Free",1,slot,0,0,0);CHECK(heap[child].ref==0);
 /* A scalar enum leaf uses integer storage, while strings still own heap slots. */
 integer.data=AIN_ENUM;call("Alloc",5,slot,2,1,1);CHECK(heap[slot].page->a_type==AIN_ARRAY_INT);
 call("Free",1,slot,0,0,0);
 integer.data=AIN_STRING;call("Alloc",5,slot,2,1,1);p=heap[slot].page;
 leaf=heap[heap[p->values[0].i].page->values[0].i].page;int text=leaf->values[0].i;
 CHECK(p->a_type==AIN_ARRAY_STRING&&heap[text].type==VM_STRING&&heap[text].ref==1);
 call("Free",1,slot,0,0,0);CHECK(heap[text].ref==0);
 heap_unref(slot);free_page(heap[owner].page);heap[owner].page=NULL;heap_unref(owner);
 CHECK(allocated==freed);memset(&program,0,sizeof(program));call_stack_ptr=0;
 return 0;
}
int error_case(int which) {
 next_slot=1;used=allocated=freed=stack_ptr=0;memset(heap,0,sizeof(heap_storage));
 memset(&program,0,sizeof(program));call_stack_ptr=0;
 int slot=heap_alloc_slot(VM_PAGE);hll_call_type_param=AIN_INT;
 call("Alloc",5,slot,1,-1,-1);
 if(which==0)call("At",2,slot,-1,0,0);
 if(which==1)call("At",2,slot,1,0,0);
 if(which==2)call("Realloc",2,slot,-1,0,0);
 if(which==3)call("At",2,0,0,0,0);
 if(which==4){hll_call_type_param=AIN_IFACE_WRAP;call("First",1,slot,0,0,0);}
 if(which==5)call("Insert",3,slot,2,9,0);
 if(which==6){hll_call_type_param=AIN_STRUCT;call("Alloc",5,slot,1,-1,-1);}
 if(which==7){union vm_value dim={.i=-1};realloc_array(heap[slot].page,1,&dim,AIN_ARRAY_INT,-1,true);}
 if(which==8)array_copy(heap[slot].page,0,heap[slot].page,0,INT_MAX);
 if(which==9)call("Alloc",5,slot,2,-1,3);
 if(which==10)call("Alloc",5,slot,-2,-1,-1);
 if(which==11)call("Alloc",5,slot,INT_MAX,2,-1);
 if(which==12)call("Alloc",5,slot,INT_MAX,1,-1);
 if(which==13){
  call("Alloc",5,slot,2,2,-1);
  struct ain_variable cbargs[2]={{{AIN_REF_ARRAY}},{{AIN_HLL_FUNC}}};
  struct ain_hll_function cb={.name="Where",.nr_arguments=2,.arguments=cbargs};
  stack_push(slot);stack_push(-1);stack_push(0);generic_array_call(&cb);
 }
 if(which==14){struct ain_hll_function invalid={.name="Unknown",.nr_arguments=0};generic_array_call(&invalid);}
 if(which==15){hll_call_type_param=AIN_ARRAY;call("Alloc",5,slot,2,3,-1);}
 if(which==16){int source=heap_alloc_page(alloc_page(ARRAY_PAGE,AIN_ARRAY_STRING,0));heap[source].page->array.rank=1;erase_by_array(slot,source,AIN_INT);}

 return 1;
}
`;
fs.mkdirSync(build,{recursive:true});
fs.writeFileSync(path.join(build,'array-test.c'),source);
const compiler = process.env.RANCE10_TEST_CLANG || path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'array-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=c11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-Wl,--export=error_case','-Wl,--export=nested_array_lifecycle','-Wl,--export=nested_array_restore','-Wl,--export=nested_array_shapes','-Wl,--export=game_array_coverage','-Wl,--export=erase_array_cases','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm), {env:{vm_error(line){throw new WebAssembly.RuntimeError(`VM error at C line ${line}: ${source.split('\n')[line-1]}`);}}});
const missing=instance.exports.game_array_coverage();
assert.equal(missing,0,`Game calls an unsupported Array overload: ${JSON.stringify(arraySignatures.functions[missing-1])}`);
const line=instance.exports.run_tests();
assert.equal(line,0,`C failure at ${line}: ${source.split('\n')[line-1]}`);
for(const name of ['erase_array_cases','nested_array_lifecycle','nested_array_restore','nested_array_shapes']) {
 const failure=instance.exports[name]();
 assert.equal(failure,0,`${name} failure at ${failure}: ${source.split('\n')[failure-1]}`);
}
for(let i=2;i<17;i++)assert.throws(()=>instance.exports.error_case(i),WebAssembly.RuntimeError);
console.log('PASS: 50 game-used Array signatures; batch Erase integers/strings, order, self-alias, empty/no-match, borrowed ownership and interfaces; nested CALLHLL, map teardown, 71x24 snapshot repair and 15 invalid-input traps.');
