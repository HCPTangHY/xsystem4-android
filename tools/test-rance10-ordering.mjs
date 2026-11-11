import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const read=f=>fs.readFileSync(path.join(root,'xsystem4',f),'utf8');
function fn(file,name){
 const text=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(text);assert.ok(m,name);
 let end=text.indexOf('{',m.index),depth=0;
 do{if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}while(depth);
 return text.slice(m.index,end);
}
const source=String.raw`
typedef unsigned size_t;typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define min(a,b) ((a)<(b)?(a):(b))
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
#define PARTS_CONTROLLER_SYSTEM_OVERLAY 1000000000
`+read('include/queue.h')+String.raw`
struct sprite{TAILQ_ENTRY(sprite) entry;int z,z2,id;bool in_scene,hidden,has_pixel;};
struct parts{struct sprite sp;TAILQ_ENTRY(parts) parts_list_entry;int no,controller_no;struct{int z;}global;bool back_scene;};
TAILQ_HEAD(parthead,parts);static struct parthead parts_list;
TAILQ_HEAD(scenehead,sprite);static struct scenehead sprite_list;
#define PARTS_LIST_FOREACH(p) TAILQ_FOREACH(p,&parts_list,parts_list_entry)
bool parts_multi_controller,scene_is_dirty;int id_counter,order[4];unsigned lookup_calls,legacy_calls,fast_calls;
int PE_get_controller_index(int id){lookup_calls++;for(int i=0;i<4;i++)if(order[i]==id)return i;return -1;}
void parts_engine_dirty(void){scene_is_dirty=true;}
void scene_dirty(void){scene_is_dirty=true;}
static union{long long alignment;unsigned char bytes[65536];}arena;static size_t used;
void *xmalloc(size_t n){size_t at=used;used=(used+n+7)&~7;if(used>sizeof(arena))__builtin_trap();return arena.bytes+at;}
void free(void *p){(void)p;}
`+fn('src/scene.c','scene_register_sprite')+fn('src/scene.c','scene_unregister_sprite')
+fn('src/scene.c','scene_register_sprite_batch')
+String.raw`
void scene_sprite_dirty(struct sprite *p){scene_dirty();if(p->hidden)scene_unregister_sprite(p);else if(p->has_pixel)scene_register_sprite(p);}
`+fn('src/parts/parts.c','parts_get_sprite_z')+fn('src/parts/parts.c','parts_get_sprite_z2')
+fn('src/parts/parts.c','parts_list_insert')+fn('src/parts/parts.c','parts_list_remove')
+fn('src/parts/parts.c','parts_list_resort')+fn('src/parts/parts.c','parts_controllers_resort')
+String.raw`
enum{N=1024,OTHER=7};struct parts items[N];struct sprite others[OTHER];int expected_parts[N],expected_scene[N+OTHER];
void setup(int mode){
 TAILQ_INIT(&parts_list);TAILQ_INIT(&sprite_list);id_counter=0;used=0;lookup_calls=0;
 parts_multi_controller=mode!=3;for(int i=0;i<4;i++)order[i]=i;
 for(int i=0;i<OTHER;i++){
  others[i]=(struct sprite){.z=i%4,.z2=i%5,.id=10000+i,.has_pixel=true};scene_register_sprite(&others[i]);
 }
 for(int i=0;i<N;i++){
  items[i]=(struct parts){.no=i,.controller_no=i%4,.global={.z=(i*37)%31},.back_scene=i%19==0};
  if(i%29==0)items[i].controller_no=PARTS_CONTROLLER_SYSTEM_OVERLAY;
  items[i].sp.has_pixel=true;items[i].sp.hidden=i%11==0;
  parts_list_insert(&items[i]);scene_sprite_dirty(&items[i].sp);
 }
 if(mode==0){order[0]=3;order[1]=1;order[2]=0;order[3]=2;}
 if(mode==1){order[0]=2;order[1]=0;order[2]=3;order[3]=1;}
 if(mode==2){order[0]=1;order[1]=3;order[2]=2;order[3]=0;}
 lookup_calls=0;
}
/* Reference the previous algorithm using the unchanged per-part primitives. */
void legacy_resort(void){struct parts *list[N],*p;int n=0;PARTS_LIST_FOREACH(p)list[n++]=p;for(int i=0;i<n;i++){parts_list_resort(list[i]);scene_sprite_dirty(&list[i]->sp);}}
int run_tests(void){
 for(int mode=0;mode<4;mode++){
  setup(mode);legacy_resort();unsigned before=lookup_calls;
  struct parts *p;struct sprite *sp;int n=0,ns=0;
  PARTS_LIST_FOREACH(p)expected_parts[n++]=p->no;
  TAILQ_FOREACH(sp,&sprite_list,entry)expected_scene[ns++]=sp->id;
  CHECK(n==N);
  setup(mode);parts_controllers_resort();unsigned after=lookup_calls;
  n=0;PARTS_LIST_FOREACH(p){CHECK(n<N&&p->no==expected_parts[n]);n++;}CHECK(n==N);
  n=0;TAILQ_FOREACH(sp,&sprite_list,entry){CHECK(n<ns&&sp->id==expected_scene[n]);n++;}CHECK(n==ns);
  for(int i=0;i<N;i++)CHECK(items[i].sp.in_scene!=items[i].sp.hidden);
  if(mode!=3){CHECK(after<=N);CHECK(before>after*100);legacy_calls=before;fast_calls=after;}
 }
 TAILQ_INIT(&parts_list);used=0;parts_controllers_resort();CHECK(used==0);
 return 0;
}
unsigned old_work(void){return legacy_calls;}unsigned new_work(void){return fast_calls;}
`;
fs.mkdirSync(build,{recursive:true});
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'ordering-tests.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-Wl,--export=old_work','-Wl,--export=new_work','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
if(r.error)throw r.error;assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));
const line=instance.exports.run_tests();assert.equal(line,0,`Ordering assertion ${line}: ${source.split('\n')[line-1]}`);
console.log(`PASS: 1,024-part batched order matches the previous algorithm, including ties, external sprites, hidden parts, overlays, back scenes and legacy mode; layer lookups ${instance.exports.old_work()} -> ${instance.exports.new_work()}.`);
