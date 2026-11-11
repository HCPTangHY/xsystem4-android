// Execute the repaired C routines without starting Android or advancing a game.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
await import('./test-rance10-array.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8');
const prefix=fs.readFileSync(path.join(build,'array-test.c'),'utf8').split('/* Generic Array ABI')[0];
function fn(file,name){
 const t=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(t);
 assert.ok(m,name);let end=t.indexOf('{',m.index),depth=0;
 do{if(t[end]==='{')depth++;if(t[end]==='}')depth--;end++;}while(depth);
 return t.slice(m.index,end);
}
const ajp='subprojects/libsys4/src/ajp.c',parts='src/parts/parts.c',scroll='src/parts/scrollbar.inc';
const source=`${prefix}
typedef unsigned char uint8_t;typedef unsigned int uint32_t;
#define INT32_MAX 2147483647
typedef struct {int x,y;} Point;typedef struct {int x,y,w,h;} Rectangle;
struct parts_params {Point pos;struct {float x,y,z;} rotation,scale;};
__attribute__((import_module("env"),import_name("sinf"))) float test_sinf(float);
__attribute__((import_module("env"),import_name("cosf"))) float test_cosf(float);
__attribute__((import_module("env"),import_name("lroundf"))) long test_lroundf(float);
#define sinf test_sinf
#define cosf test_cosf
#define lroundf test_lroundf
${read('src/parts/rotation.h').replace(/^#include[^\n]*$/mg,'')}
${read('subprojects/libsys4/include/system4/cg.h').match(/struct cg_metrics\s*\{[\s\S]*?\};/)[0]}
${read(ajp).match(/struct ajp_header\s*\{[\s\S]*?\};/)[0]}
uint32_t LittleEndian_getDW(const uint8_t *p,int i){return p[i]|(p[i+1]<<8)|(p[i+2]<<16)|((uint32_t)p[i+3]<<24);}
void put32(uint8_t *p,int i,uint32_t n){for(int k=0;k<4;k++)p[i+k]=n>>(k*8);}
${fn(ajp,'ajp_checkfmt')}
${fn(ajp,'ajp_extract_header')}
${fn(ajp,'ajp_init_metrics')}
${fn(ajp,'ajp_get_metrics')}
${fn(parts,'parts_combine_pos')}
struct parts_scrollbar {int w,h,up,down,total,view,pos,step;bool horizontal,dragging,notify_pending,position_set;float drag_offset;};
struct parts_gauge {float rate,numerator,denominator;};
enum {PARTS_HGAUGE=7,PARTS_VGAUGE=8,PARTS_MSG_SCROLL=20};
struct parts {int delegate_index;struct parts_scrollbar *scrollbar;struct parts_params global;struct {int type;struct {Point origin_offset;} common;struct parts_gauge gauge;} states[3];};
struct parts fixture;
struct parts *parts_get(int no){if(no!=1)__builtin_trap();return &fixture;}
struct parts *parts_try_get(int no){return no==1?&fixture:NULL;}
bool parts_state_valid(int state){return state>=0&&state<3;}
struct parts_gauge *parts_get_hgauge(struct parts *p,int state){p->states[state].type=PARTS_HGAUGE;return &p->states[state].gauge;}
void parts_hgauge_set_rate(struct parts *p,struct parts_gauge *g,float r){(void)p;g->rate=max(0,min(1,r));}
${fn(parts,'PE_SetHGaugeRate')}
${fn('src/hll/PartsEngine.c','PartsEngine_GetGaugeValue')}
struct parts_scrollbar *parts_scrollbar_get(struct parts *p){return p->scrollbar;}
void parts_dirty(struct parts *p){(void)p;}
int scroll_events,scroll_pos,scroll_total;
void parts_msg_push(struct parts *p,int type,const char *fmt,int pos,int total){(void)p;(void)fmt;if(type!=PARTS_MSG_SCROLL)__builtin_trap();scroll_events++;scroll_pos=pos;scroll_total=total;}
${fn(scroll,'parts_scrollbar_set_pos')}
${fn(scroll,'parts_scrollbar_flush_notification')}
${fn(scroll,'parts_scrollbar_rect')}
${fn(scroll,'parts_scrollbar_input')}
struct archive {int names;};struct afa_archive {struct archive ar;};
struct asset_manager_afa {struct afa_archive *localized_base,*localized_patch;};
bool archive_exists_by_basename(struct archive *ar,const char *name,int *id){(void)id;return (ar->names&1&&!strcmp(name,"route"))||(ar->names&2&&!strcmp(name,"caution"))||(ar->names&4&&!strcmp(name,"new_help"));}
${fn('src/asset_manager.c','afa_localized_archive')}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 uint8_t data[64]={'A','J','P',0};struct cg_metrics m={.x=99,.y=99};
 put32(data,12,220);put32(data,16,308);put32(data,20,36);put32(data,24,20);put32(data,28,56);put32(data,32,8);
 CHECK(ajp_get_metrics(data,64,&m));CHECK(m.x==0&&m.y==0&&m.w==220&&m.h==308&&m.bpp==24&&m.has_pixel&&m.has_alpha);
 CHECK(!ajp_get_metrics(data,35,&m));CHECK(!ajp_get_metrics(data,63,&m));
 put32(data,20,0xfffffff0u);put32(data,24,0x100u);CHECK(!ajp_get_metrics(data,64,&m));
 put32(data,20,36);put32(data,24,20);put32(data,32,0);put32(data,28,0);CHECK(ajp_get_metrics(data,64,&m)&&!m.has_alpha);
 put32(data,12,0);CHECK(!ajp_get_metrics(data,64,&m));put32(data,12,220);data[0]='B';CHECK(!ajp_get_metrics(data,64,&m));
 program.version=12;struct parts_params parent={.pos={100,200},.scale={2,3},.rotation.z=90};Point pt=parts_combine_pos(&parent,(Point){10,20});CHECK(pt.x==40&&pt.y==220);
 program.version=10;pt=parts_combine_pos(&parent,(Point){10,20});CHECK(pt.x==110&&pt.y==220);program.version=12;
 CHECK(PE_SetHGaugeRate(1,100,100,1));CHECK(PartsEngine_GetGaugeValue(1,1,false,true)==100);
 CHECK(PE_SetHGaugeRate(1,37,PartsEngine_GetGaugeValue(1,1,false,true),1));CHECK(fixture.states[0].gauge.rate>0.369f&&fixture.states[0].gauge.rate<0.371f);
 CHECK(PartsEngine_GetGaugeValue(1,1,false,false)==37);CHECK(PartsEngine_GetGaugeValue(-1,1,false,true)==0);CHECK(PartsEngine_GetGaugeValue(1,0,false,true)==0);
 CHECK(PE_SetHGaugeRate(1,10,0,1)&&fixture.states[0].gauge.rate==0);
 struct parts_scrollbar bar={.w=32,.h=656,.up=54,.down=54,.total=1024,.view=360,.step=20};fixture.scrollbar=&bar;fixture.global.scale.x=fixture.global.scale.y=1;
 Rectangle r=parts_scrollbar_rect(&bar,3);CHECK(r.y==54&&r.h==192);
 parts_scrollbar_set_pos(&fixture,9999,true);parts_scrollbar_flush_notification(&fixture);r=parts_scrollbar_rect(&bar,3);CHECK(bar.pos==664&&r.y+r.h==602&&scroll_pos==664&&scroll_total==1024);
 parts_scrollbar_set_pos(&fixture,-1,false);CHECK(bar.pos==0&&scroll_events==1);
 parts_scrollbar_input(&fixture,(Point){16,630},true,true,true,false);parts_scrollbar_flush_notification(&fixture);CHECK(bar.pos==20&&scroll_events==2);
 parts_scrollbar_input(&fixture,(Point){16,20},true,true,true,false);CHECK(bar.pos==0);
 parts_scrollbar_input(&fixture,(Point){16,80},true,true,true,false);CHECK(bar.dragging);
 parts_scrollbar_input(&fixture,(Point){16,700},false,true,false,false);CHECK(bar.pos==664);
 parts_scrollbar_input(&fixture,(Point){16,700},false,false,false,true);CHECK(!bar.dragging);
 bar.total=bar.view;parts_scrollbar_set_pos(&fixture,50,false);r=parts_scrollbar_rect(&bar,3);CHECK(bar.pos==0&&r.y==54&&r.h==548);
 bar.h=20;r=parts_scrollbar_rect(&bar,3);CHECK(r.h==0&&r.y==20);
 struct afa_archive base={.ar.names=3},patch={.ar.names=4};struct asset_manager_afa mgr={&base,&patch};
 CHECK(afa_localized_archive(&mgr,"route")==&base&&afa_localized_archive(&mgr,"caution")==&base);
 CHECK(afa_localized_archive(&mgr,"new_help")==&patch&&afa_localized_archive(&mgr,"added_cg")==NULL);
 patch.ar.names|=1;CHECK(afa_localized_archive(&mgr,"route")==&patch);mgr.localized_base=NULL;CHECK(afa_localized_archive(&mgr,"caution")==NULL);
 return 0;
}
`;
fs.writeFileSync(path.join(build,'ui-fix-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'ui-fix-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{sinf:Math.sin,cosf:Math.cos,lroundf:x=>x<0?-Math.floor(-x+.5):Math.floor(x+.5),vm_error:line=>{throw new Error('VM '+line);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: actual C AJP dimensions/bounds, inherited coordinates, gauge denominators, formation scrollbar ranges/dragging and Chinese CG overlay precedence.');
