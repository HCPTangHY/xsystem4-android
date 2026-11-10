// Taps made while Rance 10 loads a scene (the script runs without drawing a
// frame) must not be replayed onto the screen that appears afterwards: that
// stacked several 解说 popups and could press buttons the player never saw.
// Taps from ordinary slow frames must still be delivered.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
fs.mkdirSync(build,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
function fn(file,name){const s=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(s);assert.ok(m,name);let end=s.indexOf('{',m.index),d=0;do{d+=(s[end]==='{')-(s[end]==='}');end++;}while(d);return s.slice(m.index,end);}
function line(file,re){const m=re.exec(read(file));assert.ok(m,String(re));return m[0];}
const input='src/input.c';
const source=String.raw`
typedef _Bool bool;
#define true 1
#define false 0
typedef unsigned uint32_t;
enum sact_keycode {VK_LBUTTON=1,VK_RBUTTON=2,VK_MBUTTON=4,VK_NR_KEYCODES=256};
bool key_state[VK_NR_KEYCODES];
struct {struct {int x,y,w,h;} viewport;int w,h;} sdl={{0,0,1024,576},1024,576};
static uint32_t now;
uint32_t SDL_GetTicks(void){return now;}
static int notices;
#define NOTICE(...) (notices++)
static int traces;
static void trace_log(const char *fmt,...){(void)fmt;traces++;}
void *memset(void *d,int c,unsigned long n){unsigned char *p=d;while(n--)*p++=(unsigned char)c;return d;}
${line(input,/^static struct \{ bool pending; int x, y; uint32_t time; \} mouse_presses\[3\];$/m)}
${line(input,/^#define INPUT_STALL_MS \d+$/m)}
${line(input,/^static uint32_t last_frame_time, stall_begin, stall_end;$/m)}
${fn(input,'input_mark_frame')}
${fn(input,'input_press_is_stale')}
${fn(input,'mouse_button_index')}
${fn(input,'mouse_clear_presses')}
${fn(input,'mouse_take_press')}
${fn(input,'mouse_button_state')}
static void frame(uint32_t t){now=t;input_mark_frame();}
static void tap(uint32_t t,int x,int y){mouse_button_state(VK_LBUTTON,true,x,y,t);mouse_button_state(VK_LBUTTON,false,x,y,t+80);}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 int x=0,y=0;
 // Normal frames: a tap is latched and delivered at its own position.
 frame(1000);frame(1016);tap(1020,100,200);frame(1033);
 CHECK(mouse_take_press(VK_LBUTTON,&x,&y)&&x==100&&y==200);
 CHECK(!mouse_take_press(VK_LBUTTON,&x,&y));
 // A slow (200 ms) frame keeps a tap made during it.
 tap(1100,300,300);frame(1233);
 CHECK(mouse_take_press(VK_LBUTTON,&x,&y)&&x==300);
 // Scene load: no frame for 1.5 s. A tap latched by system.Peek during the
 // load is dropped once the next frame shows the new screen.
 tap(1500,500,400);
 frame(2733);
 CHECK(!mouse_take_press(VK_LBUTTON,&x,&y));
 CHECK(notices==1&&traces==1);
 // Taps still queued in SDL when the load ends are ignored outright,
 // including the held-button state the game polls.
 mouse_button_state(VK_LBUTTON,true,600,100,2000);
 CHECK(!key_state[VK_LBUTTON]&&!mouse_take_press(VK_LBUTTON,&x,&y));
 mouse_button_state(VK_LBUTTON,false,600,100,2080);
 // The first tap after the load works again.
 frame(2750);tap(2760,10,20);frame(2766);
 CHECK(mouse_take_press(VK_LBUTTON,&x,&y)&&x==10&&y==20);
 // Exact window bounds: [last frame before the stall, first frame after).
 CHECK(!input_press_is_stale(1232)&&input_press_is_stale(1233)&&input_press_is_stale(2732)&&!input_press_is_stale(2733));
 // Tick wraparound.
 now=0xFFFFFF00u;input_mark_frame();now=0x00000200u;input_mark_frame();
 CHECK(input_press_is_stale(0xFFFFFFF0u)&&input_press_is_stale(0x100u)&&!input_press_is_stale(0x200u));
 return 0;}
`;
fs.writeFileSync(path.join(build,'stale-input-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'stale-input-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(r.status,0,r.stderr);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{}});
const failed=instance.exports.run_tests();assert.equal(failed,0,`C failure ${failed}: ${source.split('\n')[failed-1]}`);
// Both frame entry points must mark frames, and only for the AIN 11 engine.
assert.match(read('src/parts/parts.c'),/void PE_Update\([^)]*\)\n\{\n\tparts_update_serial\+\+;\n\tif \(ain->version >= 11\) input_mark_frame\(\);/);
assert.match(read('src/hll/SACT2.c'),/if \(ain->version >= 11\) input_mark_frame\(\);\n\thandle_events\(\);/);
console.log('PASS: taps made during a scene load are dropped instead of replayed onto the next screen; taps from normal and slow frames still land.');
