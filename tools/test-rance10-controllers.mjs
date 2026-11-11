import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
await import('./test-rance10-array.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
const prefix=fs.readFileSync(path.join(build,'array-test.c'),'utf8').split('/* Generic Array ABI')[0];
const header=read('src/parts/parts_internal.h');
const stack=header.slice(header.indexOf('#define PARTS_CONTROLLER_STACK_MAX'),header.indexOf('extern struct parts_controller_stack'));
const parts=read('src/parts/parts.c');
let functions=parts.slice(parts.indexOf('static void parts_init_controller_part(int id)\n{'),parts.indexOf('void PE_parts_set_want_save'));
functions=functions.replace(/static void parts_controllers_resort\(void\)\n\{[\s\S]*?\n\}/,'static void parts_controllers_resort(void) {resorts++;}');
const wrapper=read('src/hll/PartsEngine.c').match(/static void PartsEngine_RemoveControllerNew\([^]*?\n\}/)[0];
const parentWrapper=read('src/hll/PartsEngine.c').match(/static int PartsEngine_Parts_GetParentPartsNumber\([^]*?\n\}/)[0];
const addWrapper=read('src/hll/PartsEngine.c').match(/static int PartsEngine_AddController\([^]*?\n\}/)[0];
const source=`${prefix}
${read('include/queue.h')}
${stack}
struct parts_controller_stack ctrl_stack;
bool parts_multi_controller;
struct parts {int no,delegate_index,controller_no; TAILQ_ENTRY(parts) parts_list_entry; int pending_parent;struct parts *parent;bool pass_cursor,input_enabled;int z;};
TAILQ_HEAD(parts_list,parts); struct parts_list parts_list;
int resorts;
int PE_AddController(int index);
void parts_release(int no){struct parts *p;TAILQ_FOREACH(p,&parts_list,parts_list_entry){if(p->no==no){TAILQ_REMOVE(&parts_list,p,parts_list_entry);return;}}__builtin_trap();}
struct parts *parts_try_get(int no){struct parts *p;TAILQ_FOREACH(p,&parts_list,parts_list_entry){if(p->no==no)return p;}return NULL;}
struct parts root_pool[32];int root_count;
struct parts *parts_get(int no){struct parts *p=parts_try_get(no);if(p)return p;if(root_count==32)__builtin_trap();p=&root_pool[root_count++];memset(p,0,sizeof(*p));p->no=no;p->delegate_index=-1;p->pending_parent=-1;TAILQ_INSERT_TAIL(&parts_list,p,parts_list_entry);return p;}
bool PE_IsExist(int no){return parts_try_get(no)!=NULL;}
void parts_set_z(struct parts *p,int z){p->z=z;}
void PE_UpdateComponent(int passed_time){(void)passed_time;}
int PE_GetParentPartsNumber(int no){struct parts *p=parts_try_get(no);return p?(p->pending_parent>=0?p->pending_parent:p->parent?p->parent->no:0):0;}
${functions}
${wrapper}
${parentWrapper}
${addWrapper}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 TAILQ_INIT(&parts_list);ctrl_stack_init();CHECK(ctrl_stack.active==0&&ctrl_stack.nr_controllers==1);
 int a=PE_AddController(-1),b=PE_AddController(-1),c=PE_AddController(1);
 CHECK(a==1&&b==2&&c==3);CHECK(PE_get_controller_index(a)==2&&PE_get_controller_id(1)==c);
 PE_move_controller(b,0);CHECK(PE_get_controller_id(0)==b&&ctrl_stack.active==c);
 PE_move_controller(b,-1);CHECK(PE_get_controller_id(3)==b);
 PE_set_active_controller(a);
 struct parts p={101,71,a},q={102,72,b},r={103,73,a};
 TAILQ_INSERT_TAIL(&parts_list,&p,parts_list_entry);TAILQ_INSERT_TAIL(&parts_list,&q,parts_list_entry);TAILQ_INSERT_TAIL(&parts_list,&r,parts_list_entry);
 p.pending_parent=q.pending_parent=r.pending_parent=-1;r.parent=&p;
 CHECK(PartsEngine_Parts_GetParentPartsNumber(p.no)==0&&PartsEngine_Parts_GetParentPartsNumber(-1)==0);
 CHECK(PartsEngine_Parts_GetParentPartsNumber(r.no)==p.no);
 r.pending_parent=q.no;CHECK(PartsEngine_Parts_GetParentPartsNumber(r.no)==q.no);
 r.pending_parent=-1;
 struct page *erased=NULL;PartsEngine_RemoveControllerNew(&erased,a);
 CHECK(erased->nr_vars==2&&erased->values[0].i==71&&erased->values[1].i==73);
 CHECK(TAILQ_FIRST(&parts_list)==&q&&TAILQ_NEXT(&q,parts_list_entry)==NULL);
 CHECK(PE_get_controller_index(a)==-1&&PE_get_controller_index(b)==2&&ctrl_stack.active==c);
 free_page(erased);erased=NULL;
 PE_set_active_controller(PARTS_CONTROLLER_SYSTEM_OVERLAY);int d=PE_AddController(-1);
 CHECK(PE_get_controller_index(d)==3&&d==4);
 while(ctrl_stack.nr_controllers>1)PE_RemoveController(&erased,0);
 int previous=ctrl_stack.active;PE_RemoveController(&erased,0);
 CHECK(ctrl_stack.nr_controllers==1&&ctrl_stack.active!=previous&&ctrl_stack.active==5);
 CHECK(PE_get_controller_id(-1)==-1&&PE_get_controller_id(1)==-1&&resorts>0);
 program.version=12;
 int top=PE_get_controller_id(0),added=PartsEngine_AddController(top);
 CHECK(PE_get_controller_id(1)==added&&PE_get_controller_index(top)==0);
 PartsEngine_RemoveControllerNew(&erased,added);
 added=PartsEngine_AddController(top);CHECK(PE_get_controller_id(1)==added);
 CHECK(added>ctrl_stack.nr_controllers);
 free_page(erased);erased=NULL;
 // Rance 10 uses layer IDs as component handles. A controller must reserve
 // its own empty root and skip a number already taken by a user component.
 TAILQ_INIT(&parts_list);parts_multi_controller=true;ctrl_stack_init();
 CHECK(parts_try_get(0)&&parts_try_get(PARTS_CONTROLLER_SYSTEM_OVERLAY));
 int scene=PE_AddController(-1);CHECK(scene==1&&PE_IsExist(scene));
 struct parts *scene_root=parts_try_get(scene);
 CHECK(scene_root->controller_no==scene&&scene_root->z==0&&scene_root->pass_cursor&&!scene_root->input_enabled);
 struct parts cover={2,91,scene};TAILQ_INSERT_TAIL(&parts_list,&cover,parts_list_entry);
 int next=PE_AddController(-1);CHECK(next==3&&parts_try_get(2)==&cover);
 CHECK(parts_try_get(next)!=&cover&&parts_try_get(next)->controller_no==next);
 PartsEngine_RemoveControllerNew(&erased,scene);
 CHECK(!PE_IsExist(scene)&&!PE_IsExist(2)&&PE_IsExist(next));
 CHECK(erased->nr_vars==1&&erased->values[0].i==91);
 CHECK(PE_IsExist(PARTS_CONTROLLER_SYSTEM_OVERLAY));
 free_page(erased);CHECK(allocated==freed);return 0;
}
void invalid_id(void){struct page *erased=NULL;PartsEngine_RemoveControllerNew(&erased,999);}
`;
fs.writeFileSync(path.join(build,'controllers-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'controllers-test.wasm');
const result=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-Wl,--export=invalid_id','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(result.status,0,result.stderr||result.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{vm_error(line){throw new WebAssembly.RuntimeError(`VM error at C line ${line}`);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
assert.throws(()=>instance.exports.invalid_id(),WebAssembly.RuntimeError);
console.log('PASS: actual controller insertion, stable IDs, move, removal by ID, part ownership, delegate indexes, overlay, active selection and invalid IDs.');
