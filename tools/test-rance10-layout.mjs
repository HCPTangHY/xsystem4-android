import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
await import('./test-rance10-array.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
const prefix=fs.readFileSync(path.join(build,'array-test.c'),'utf8').split('/* Generic Array ABI')[0];
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
const layout=read('src/parts/layoutbox.c');
const source=`${prefix}
${read('include/queue.h')}
int abs(int n){return n<0?-n:n;}
enum {PARTS_UNINITIALIZED,PARTS_FLAT=9,PARTS_LAYOUT_BOX=12,PARTS_LAYOUT_FREE=0,PARTS_LAYOUT_VERTICAL=1,PARTS_LAYOUT_HORIZONTAL=2};
struct flat {struct {int width,height;} hdr;};
struct common {int w,h;};
struct parts_layout_box {struct common common;int layout_type;bool wrap;float wrap_size;int align,padding_top,padding_bottom,padding_left,padding_right;};
struct parts_state {int type;union{struct common common;struct {struct common common;struct flat *flat;} flat;struct parts_layout_box layout_box;};};
TAILQ_HEAD(parts_list,parts);
struct parts {struct parts_state states[3];int state,component_type_override,origin_mode;struct {struct {int x,y;} pos;struct {float x,y;} scale;bool show;} local;int margin_left,margin_right,margin_top,margin_bottom;struct parts_list children;TAILQ_ENTRY(parts) child_list_entry;};
#define PARTS_FOREACH_CHILD(c,p) TAILQ_FOREACH(c,&(p)->children,child_list_entry)
void parts_set_dims(struct parts *p,struct common *c,int w,int h){(void)p;c->w=w;c->h=h;}
void parts_recalculate_hitbox(struct parts *p){(void)p;}
int invalidations;
void parts_component_dirty(struct parts *p){(void)p;invalidations++;}
${layout.slice(layout.indexOf('static void parts_layout_calc_size_horizontal'))}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
void init(struct parts *p){memset(p,0,sizeof(*p));TAILQ_INIT(&p->children);p->local.show=true;p->local.scale.x=p->local.scale.y=1;p->origin_mode=1;}
int run_tests(void){
struct parts row,a,b,hidden,ar,br,ac,bc;struct flat f={.hdr={200,200}};
init(&row);init(&a);init(&b);init(&hidden);init(&ar);init(&br);init(&ac);init(&bc);
row.states[0].type=PARTS_LAYOUT_BOX;row.states[0].layout_box.layout_type=PARTS_LAYOUT_HORIZONTAL;row.states[0].layout_box.align=1;row.origin_mode=5;
TAILQ_INSERT_TAIL(&row.children,&a,child_list_entry);TAILQ_INSERT_TAIL(&row.children,&b,child_list_entry);TAILQ_INSERT_TAIL(&row.children,&hidden,child_list_entry);
TAILQ_INSERT_TAIL(&a.children,&ar,child_list_entry);TAILQ_INSERT_TAIL(&b.children,&br,child_list_entry);
ar.states[0].type=br.states[0].type=PARTS_LAYOUT_BOX;
TAILQ_INSERT_TAIL(&ar.children,&ac,child_list_entry);TAILQ_INSERT_TAIL(&br.children,&bc,child_list_entry);
ac.states[0].type=bc.states[0].type=PARTS_FLAT;ac.states[0].flat.flat=bc.states[0].flat.flat=&f;
b.margin_left=8;hidden.local.show=false;hidden.states[0].common.w=500;
int w,h;parts_get_layout_size(&row,&w,&h);CHECK(w==408&&h==200&&a.states[0].common.w==200);
parts_do_layout(&row);CHECK(a.local.pos.x==-204&&b.local.pos.x==4&&a.local.pos.y==-100&&b.local.pos.y==-100);
b.local.show=false;parts_get_layout_size(&row,&w,&h);CHECK(w==200&&h==200);parts_do_layout(&row);CHECK(a.local.pos.x==-100);
f.hdr.width=194;f.hdr.height=92;parts_get_layout_size(&a,&w,&h);CHECK(w==194&&h==92);
CHECK(invalidations==0);
return 0;}
`;
fs.writeFileSync(path.join(build,'layout-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'layout-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{vm_error(line){throw new Error('VM '+line);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: actual layout groups measure nested widget content, preserve Flat header sizes, exclude hidden entries, apply margins and center two title buttons.');
