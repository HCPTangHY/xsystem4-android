// Load every global in an offline device-save fixture through production code.
// Input JSON comes from android-build/r10/gsave_inspect.py; never writes a save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
await import('./test-rance10-savedata.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8');
function fn(file,name){const s=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(s);assert.ok(m,name);let end=s.indexOf('{',m.index),d=0;do{d+=(s[end]==='{')-(s[end]==='}');end++;}while(d);return s.slice(m.index,end);}
const q=s=>'"'+[...s].map(c=>'\\'+c.charCodeAt(0).toString(8).padStart(3,'0')).join('')+'"';
let source=fs.readFileSync(path.join(build,'savedata-test.c'),'utf8').split('struct gsave saved=')[0];
source=source.replace('int data,struc;','int data,struc,rank;')
 .replaceAll('heap_storage[256]','heap_storage[65536]').replace('heap_size=256','heap_size=65536')
 .replaceAll('free_slots[256]','free_slots[65536]').replace('INITIAL_HEAP_SIZE 256','INITIAL_HEAP_SIZE 65536')
 .replace('next_slot>=256','next_slot>=65536');
const begin=source.indexOf('static union { long long align; unsigned char bytes[2048]; }');
const end=source.indexOf('int heap_alloc_slot',begin);
source=source.slice(0,begin)+String.raw`
static union {long long align;unsigned char bytes[64*1024*1024];} arena;
static size_t used;static int allocated,freed,next_slot;
void *xcalloc(size_t n,size_t size){size_t bytes=n*size;if(used+bytes+8>=sizeof(arena))__builtin_trap();void *p=arena.bytes+used;used+=(bytes+7)&~7;allocated++;return memset(p,0,bytes);}
void *xmalloc(size_t n){return xcalloc(1,n);}void free_page(struct page *p){if(p)freed++;}void free(void *p){if(p)freed++;}
void *xrealloc(void *p,size_t n){__builtin_trap();}
`+source.slice(end);
source=source.replace(/int variable_type\(struct page \*p,int i,void \*s,void \*r\) \{[^\n]*\}/,'static bool delegate_is_closure(int slot);\nunsigned int heap_get_seq(int object);\n'+fn('src/page.c','variable_type'));
let data='';
const type=t=>`{.data=${t.data},.struc=${t.struc},.rank=${t.child?1:0}}`;
const structures=fixture.declarations.structures;
structures.forEach((s,i)=>{data+=`static struct ain_variable members${i}[]={${s.members.map(m=>`{.name=${q(m.name)},.type=${type(m.type)}}`).join(',')}};\n`;});
data+=`static struct test_structure structures[]={${structures.map((s,i)=>`{.name=${q(s.name)},.nr_members=${s.members.length},.members=members${i}}`).join(',')}};\n`;
data+=`static struct ain_variable globals[]={${fixture.declarations.globals.map(g=>`{.name=${q(g.name)},.type=${type(g.type)}}`).join(',')}};\n`;
const save=fixture.save;
save.records.forEach((r,i)=>{data+=`static int32_t indices${i}[]={${r.indices.join(',')}};\n`;});
data+=`static struct gsave_record records[]={${save.records.map((r,i)=>`{.struct_index=${r.struct_index},.nr_indices=${r.indices.length},.indices=indices${i}}`).join(',')}};\n`;
data+=`static struct gsave_global saved_globals[]={${save.globals.map(g=>`{.name=${q(g.name)},.type=${g.type},.value=${g.value}}`).join(',')}};\n`;
data+=`static struct string strings[]={${save.strings.map(s=>`{.size=${s.length},.text=${q(s)}}`).join(',')}};\n`;
data+=`static struct string *string_ptrs[]={${save.strings.map((s,i)=>`&strings[${i}]`).join(',')}};\n`;
save.arrays.forEach((a,i)=>{
 data+=`static int32_t dimensions${i}[]={${a.dimensions.join(',')}};\n`;
 a.flat_arrays.forEach((f,j)=>{data+=`static struct gsave_array_value values${i}_${j}[]={${f.values.map(v=>`{.type=${f.type},.value=${v}}`).join(',')}};\n`;});
 data+=`static struct gsave_flat_array flats${i}[]={${a.flat_arrays.map((f,j)=>`{.type=${f.type},.nr_values=${f.values.length},.values=values${i}_${j}}`).join(',')}};\n`;
});
data+=`static struct gsave_array arrays[]={${save.arrays.map((a,i)=>`{.rank=${a.rank},.dimensions=dimensions${i},.nr_flat_arrays=${a.flat_arrays.length},.flat_arrays=flats${i}}`).join(',')}};\n`;
data+=`static struct gsave_keyval keyvals[]={${save.keyvals.map(v=>`{.value=${v}}`).join(',')}};\n`;
save.struct_defs.forEach((s,i)=>{data+=`static struct gsave_field_def fields${i}[]={${s.fields.map(f=>`{.name=${q(f.name)},.type=${f.type}}`).join(',')}};\n`;});
data+=`static struct gsave_struct_def defs[]={${save.struct_defs.map((s,i)=>`{.name=${q(s.name)},.nr_fields=${s.fields.length},.fields=fields${i}}`).join(',')}};\n`;
data+=`static struct gsave saved={.key=${q(save.key)},.group=${q(save.group)},.version=7,.nr_records=${save.records.length},.records=records,.nr_globals=${save.globals.length},.globals=saved_globals,.nr_strings=${save.strings.length},.strings=string_ptrs,.nr_arrays=${save.arrays.length},.arrays=arrays,.nr_keyvals=${save.keyvals.length},.keyvals=keyvals,.nr_struct_defs=${save.struct_defs.length},.struct_defs=defs};\n`;
source+=data+String.raw`
static union vm_value loaded[1024];
int ain_get_global(void *unused,const char *name){for(int i=0;i<program.nr_globals;i++)if(!strcmp(globals[i].name,name))return i;return -1;}
void global_set(int i,union vm_value value,bool dtors){if(dtors)__builtin_trap();loaded[i]=value;}
`+fn('src/savedata.c','load_globals_from_gsave')+String.raw`
int run_tests(void){
 next_slot=1;program.version=12;game_rance10_cn=true;
 program.globals=globals;program.nr_globals=sizeof(globals)/sizeof(*globals);
 program.structures=structures;program.nr_structures=sizeof(structures)/sizeof(*structures);
 for(int i=0;i<saved.nr_arrays;i++)for(int j=0;j<arrays[i].nr_flat_arrays;j++)for(int k=0;k<arrays[i].flat_arrays[j].nr_values;k++)
  CHECK(gsave_validate_value(arrays[i].flat_arrays[j].values[k].value,arrays[i].flat_arrays[j].values[k].type,&saved));
 int n=0;CHECK(load_globals_from_gsave(&saved,saved.key,saved.group,&n)&&n==saved.nr_globals);
 for(int i=0;i<saved.nr_globals;i++){
  int g=ain_get_global(ain,saved_globals[i].name);CHECK(g>=0);
  int t=globals[g].type.data;
  if(t==AIN_INT||t==AIN_FLOAT||t==AIN_ENUM||t==AIN_BOOL)CHECK(loaded[g].i==saved_globals[i].value);
  if(t==AIN_STRING)CHECK(!strcmp(heap[loaded[g].i].s->text,strings[saved_globals[i].value].text));
  if(t==AIN_STRUCT)CHECK(heap[loaded[g].i].page->index==globals[g].type.struc);
 }
 return 0;
}
`;
fs.writeFileSync(path.join(build,'save-file-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'save-file-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{vm_error(line){throw new WebAssembly.RuntimeError(`VM error at ${line}: ${source.split('\n')[line-1]}`);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log(`PASS: offline device save: ${save.globals.length} globals, ${save.records.length} records, ${save.arrays.length} arrays reconstructed using production gsave loader and AIN declarations.`);
