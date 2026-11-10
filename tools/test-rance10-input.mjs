import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
await import('./test-rance10-array.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
const prefix=fs.readFileSync(path.join(build,'array-test.c'),'utf8').split('/* Generic Array ABI')[0];
const input=fs.readFileSync(path.join(root,'xsystem4/src/parts/input.c'),'utf8').replace(/\r\n/g,'\n');
const native=fs.readFileSync(path.join(root,'xsystem4/src/input.c'),'utf8').replace(/\r\n/g,'\n');
function nativeFn(name){
 const m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(native);
 assert.ok(m,name);let end=native.indexOf('{',m.index),depth=0;
 do{if(native[end]==='{')depth++;if(native[end]==='}')depth--;end++;}while(depth);
 return native.slice(m.index,end);
}
const source=`${prefix}
#include <stdarg.h>
static void trace_log(const char *fmt,...){(void)fmt;}
__attribute__((import_module("env"),import_name("sinf"))) float test_sinf(float);
__attribute__((import_module("env"),import_name("cosf"))) float test_cosf(float);
#define sinf test_sinf
#define cosf test_cosf
${fs.readFileSync(path.join(root,'xsystem4/src/parts/rotation.h'),'utf8').replace(/^#include[^\n]*$/mg,'')}
typedef struct {int x,y;} Point;typedef struct {int x,y,w,h;} Rectangle;
enum parts_type {PARTS_CG,PARTS_LAYOUT_BOX,PARTS_UNINITIALIZED,PARTS_RECT_DETECTION,PARTS_FLAT};
struct parts_flat {Rectangle visible;};
struct parts {int no,state,controller_no;struct {enum parts_type type;struct {Rectangle hitbox,surface_area;} common;struct parts_flat flat;} states[3];struct parts *parent;void *scrollbar;bool back_scene,draggable,wheelable,input_enabled,is_hovered,pass_cursor,clickable,checkbox_checked,checkbox_button_mode;int component_type_override,linked_from,hover_time,on_cursor_sound,on_click_sound;struct {bool show;int alpha;Point pos;struct {float x,y,z;} scale,rotation;} global,local;};
void parts_textbox_focus(int no){(void)no;}
bool parts_flat_hittest(struct parts *p,struct parts_flat *f,float x,float y){(void)p;return x>=f->visible.x&&y>=f->visible.y&&x<f->visible.x+f->visible.w&&y<f->visible.y+f->visible.h;}
enum {PARTS_STATE_DEFAULT,PARTS_STATE_HOVERED,PARTS_STATE_CLICKED,VK_LBUTTON=1,VK_RBUTTON=2,VK_MBUTTON=4,PARTS_MSG_MOUSE_ENTER=10,PARTS_MSG_MOUSE_LEAVE,PARTS_MSG_MOUSE_ON,PARTS_MSG_MOUSE_MOVE,PARTS_MSG_KEY_TRIGGER,PARTS_MSG_KEY_DOWN,PARTS_MSG_MOUSE_CLICK,PARTS_MSG_KEY_UP,PARTS_MSG_DRAG_BEGIN,PARTS_MSG_DRAGGING,PARTS_MSG_DRAG_END,PARTS_MSG_DROP_ENTER,PARTS_MSG_DROP_ON,PARTS_MSG_DROPPED,PARTS_MSG_DROP_LEAVE,PARTS_MSG_KEY_PRESS,PARTS_MSG_MOUSE_WHEEL};
static int wheel_dir;static unsigned wheel_serial;
${nativeFn('mouse_get_wheel_serial')}
${nativeFn('mouse_get_wheel')}
${nativeFn('mouse_clear_wheel')}
#include <stdint.h>
static uint32_t test_ticks; static uint32_t SDL_GetTicks(void){return test_ticks;}
static uint32_t key_press_next;
#define KEY_PRESS_DELAY 400
#define KEY_PRESS_REPEAT 60
bool parts_began_click=true,prev_clicking,whole_button_down[3],whole_button_armed[3],is_dragging;Point parts_prev_pos,drag_initial_pos,drag_start_cursor;struct parts *drag_parts,*drop_target;int click_down_parts,clicked_parts,counts[32];
int event_count,event_part[256],event_type[256],event_button[256],event_args[256][5];const char *event_format[256];
int SDL_PointInRect(Point *p,Rectangle *r){return p->x>=r->x&&p->x<r->x+r->w&&p->y>=r->y&&p->y<r->y+r->h;}
void parts_msg_push(struct parts *p,int type,const char *fmt,...){if(event_count>=256)__builtin_trap();counts[type]++;event_part[event_count]=p?p->no:0;event_type[event_count]=type;event_format[event_count]=fmt;va_list ap;va_start(ap,fmt);for(int i=0;fmt[i];i++){if(i>=5||(fmt[i]!='i'&&fmt[i]!='b'))__builtin_trap();event_args[event_count][i]=va_arg(ap,int);}va_end(ap);if(type==PARTS_MSG_MOUSE_CLICK)event_button[event_count]=event_args[event_count][2];event_count++;}
void parts_dirty(struct parts *p){(void)p;}
struct parts *parts_get(int no){(void)no;__builtin_trap();}
void audio_play_sound(int no){(void)no;}
void parts_set_state(struct parts *p,int state){p->state=state;}
void parts_set_pos(struct parts *p,Point pos){p->local.pos=pos;}
void parts_scrollbar_input(struct parts *p,Point c,bool h,bool d,bool t,bool r){(void)p;(void)c;(void)h;(void)d;(void)t;(void)r;}
struct parts *test_parts[12];int test_count;Point test_mouse;bool test_keys[5];
enum sact_keycode{TEST_KEY_ZERO};
#define key_state test_keys
typedef Point SDL_Point;
typedef struct{int button,state,x,y;uint32_t timestamp;}SDL_MouseButtonEvent;
enum{SDL_PRESSED=1};
struct{Rectangle viewport;int w,h;}sdl={{0,0,1920,1080},1920,1080};
enum sact_keycode sdl_to_sact_button(int b){return b==1?VK_LBUTTON:b==2?VK_RBUTTON:b==3?VK_MBUTTON:0;}
${native.match(/^static struct \{ bool pending; int x, y; uint32_t time; \} mouse_presses\[3\];/m)[0]}
${native.match(/^#define INPUT_STALL_MS \d+$/m)[0]}
${native.match(/^static uint32_t last_frame_time, stall_begin, stall_end;$/m)[0]}
${nativeFn('input_press_is_stale')}
${nativeFn('mouse_button_index')}
${nativeFn('mouse_clear_presses')}
${nativeFn('mouse_take_press')}
${nativeFn('mouse_button_state')}
${nativeFn('mouse_event')}
${nativeFn('synthetic_mouse_event')}
#define PARTS_LIST_FOREACH_REVERSE(p) for(int iter=test_count;iter>0&&((p=test_parts[--iter]),1);)
bool key_is_down(int key){return test_keys[key];}
void mouse_get_pos(int *x,int *y){*x=test_mouse.x;*y=test_mouse.y;}
int checkbox_changes;bool checkbox_value;
void PE_CheckBoxChecked(int no,bool checked){if(no!=2)__builtin_trap();checkbox_changes++;checkbox_value=checked;}
void parts_checkbox_click(struct parts *p){PE_CheckBoxChecked(p->no,!p->checkbox_checked);}
static unsigned parts_input_depth;
bool parts_multi_controller;int active_controller;
int PE_get_active_controller(void){return active_controller;}
int PE_get_system_controller(void){return 999;}
static int test_stack[4]={1,3,7,9};
int PE_get_controller_index(int id){for(int i=0;i<4;i++)if(test_stack[i]==id)return i;return -1;}
void drag_state_reset(void){drag_parts=NULL;drop_target=NULL;is_dragging=false;}
${input.slice(input.indexOf('void PE_BeginInput(void)'),input.indexOf('void PE_SetDrag('))}
${input.slice(input.indexOf('static bool parts_hittest'),input.indexOf('static void drag_state_reset'))}
${input.slice(input.indexOf('static bool parts_controller_receives_input'),input.indexOf('void PE_UpdateInputState'))}
${input.slice(input.indexOf('void PE_UpdateInputState'),input.indexOf('void PE_SetPassCursor'))}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int queued(int type){for(int i=0;i<event_count;i++)if(event_type[i]==type)return i;return -1;}
struct parts drop_part(int no,int x){
 struct parts p={.no=no,.input_enabled=true,.clickable=true,.linked_from=-1,.global={.show=true,.alpha=255,.pos={x,0},.scale={1,1}}};
 p.states[0].common.hitbox=(Rectangle){0,0,80,80};return p;
}
void begin_drop_test(void){
 PE_EndInput();PE_BeginInput();program.version=12;prev_clicking=false;
 memset(test_keys,0,sizeof(test_keys));memset(whole_button_down,0,sizeof(whole_button_down));
 memset(counts,0,sizeof(counts));event_count=0;test_mouse=(Point){10,10};
}
int drop_regressions(void){
 program.version=12;
 /* Each ineligible front part must leave the clickable, non-draggable slot reachable. */
 for(int mode=0;mode<9;mode++){
  begin_drop_test();
  struct parts cursor=drop_part(100,0),slot=drop_part(200,100),blocker=drop_part(300,100),ancestor=drop_part(400,100);
  if(mode==0)blocker.global.show=false;
  if(mode==1)blocker.global.alpha=0;
  if(mode>=2&&mode<=4){blocker.clickable=false;blocker.states[0].type=mode==2?PARTS_LAYOUT_BOX:mode==3?PARTS_UNINITIALIZED:PARTS_RECT_DETECTION;}
  if(mode==5)blocker.input_enabled=false;
  if(mode==6)blocker.back_scene=true;
  if(mode>=7){blocker.parent=&ancestor;if(mode==7)ancestor.global.show=false;else ancestor.global.alpha=0;}
  test_parts[0]=&slot;test_parts[1]=&blocker;test_parts[2]=&cursor;test_count=3;
  test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);
  /* Descendant drag artwork is not a receiver, even with an interactive rectangle. */
  struct parts art=drop_part(500,100),art_child=drop_part(501,100);art.parent=&cursor;art_child.parent=&art;
  test_parts[3]=&art;test_parts[4]=&art_child;test_count=5;
  test_mouse=(Point){110,10};PE_UpdateInputState(16);
  int enter=queued(PARTS_MSG_DROP_ENTER);CHECK(enter>=0&&event_part[enter]==slot.no&&event_args[enter][0]==cursor.no);
  event_count=0;test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
  int dropped=queued(PARTS_MSG_DROPPED),end=queued(PARTS_MSG_DRAG_END);
  CHECK(dropped>=0&&end>dropped&&event_part[dropped]==slot.no&&event_part[end]==cursor.no);
  CHECK(!strcmp(event_format[dropped],"iii")&&event_args[dropped][0]==cursor.no&&event_args[dropped][1]==110&&event_args[dropped][2]==10);
  CHECK(!strcmp(event_format[end],"ib")&&event_args[end][0]==VK_LBUTTON&&!event_args[end][1]);
  CHECK(counts[PARTS_MSG_DROPPED]==1&&counts[PARTS_MSG_DRAG_END]==1&&counts[PARTS_MSG_DROP_LEAVE]==1);
 }
 /* Release may move to another receiver without a held-mouse update there. */
 begin_drop_test();
 struct parts cursor=drop_part(100,0),first=drop_part(200,100),second=drop_part(201,200);
 second.states[0].type=PARTS_LAYOUT_BOX; /* Clickable layout regions remain eligible. */
 test_parts[0]=&first;test_parts[1]=&second;test_parts[2]=&cursor;test_count=3;
 test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_mouse=(Point){110,10};PE_UpdateInputState(16);
 event_count=0;test_mouse=(Point){210,20};test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
 int leave=queued(PARTS_MSG_DROP_LEAVE),enter=queued(PARTS_MSG_DROP_ENTER),dropped=queued(PARTS_MSG_DROPPED),end=queued(PARTS_MSG_DRAG_END);
 CHECK(leave>=0&&event_part[leave]==first.no&&enter>leave&&event_part[enter]==second.no);
 CHECK(dropped>enter&&end>dropped&&event_part[dropped]==second.no&&event_args[dropped][0]==cursor.no&&event_args[dropped][1]==210&&event_args[dropped][2]==20);
 CHECK(counts[PARTS_MSG_DROP_LEAVE]==2&&counts[PARTS_MSG_DROPPED]==1);
 /* Revalidate even at unchanged coordinates if a receiver becomes invisible. */
 begin_drop_test();test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_mouse=(Point){110,10};PE_UpdateInputState(16);
 first.global.alpha=0;event_count=0;test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
 CHECK(queued(PARTS_MSG_DROPPED)<0&&queued(PARTS_MSG_DRAG_END)>=0);
 leave=queued(PARTS_MSG_DROP_LEAVE);CHECK(leave>=0&&event_part[leave]==first.no);
 /* An ordinary click, including release elsewhere, must never produce a drop. */
 for(int moved=0;moved<2;moved++){
  begin_drop_test();test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);
  if(moved)test_mouse=(Point){210,20};test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
  CHECK(!counts[PARTS_MSG_DRAG_BEGIN]&&!counts[PARTS_MSG_DRAG_END]&&!counts[PARTS_MSG_DROPPED]&&!counts[PARTS_MSG_DROP_ENTER]);
 }
 PE_EndInput();test_count=0;event_count=0;memset(counts,0,sizeof(counts));return 0;
}
int wheel_regressions(void){
 program.version=12;test_count=0;event_count=0;memset(counts,0,sizeof(counts));
 memset(test_keys,0,sizeof(test_keys));prev_clicking=false;PE_BeginInput();
 /* Backlog listens to the WholeMouse function set, including over plain
    text or empty space where no individual part requests wheel input. */
 wheel_dir=1;wheel_serial++;PE_UpdateInputState(16);
 int e=queued(PARTS_MSG_MOUSE_WHEEL);
 CHECK(e>=0&&event_part[e]==0&&counts[PARTS_MSG_MOUSE_WHEEL]==1);
 CHECK(!strcmp(event_format[e],"ii")&&event_args[e][0]==1&&event_args[e][1]==0);
 int forward,back;mouse_get_wheel(&forward,&back);CHECK(forward==1&&back==0);
 int old_count=event_count;PE_UpdateInputState(16);CHECK(event_count==old_count);
 /* A nested Activity must not replay the wheel step which opened it. */
 PE_BeginInput();PE_UpdateInputState(16);CHECK(event_count==old_count);PE_EndInput();
 event_count=0;memset(counts,0,sizeof(counts));wheel_dir=-1;wheel_serial++;PE_UpdateInputState(16);
 e=queued(PARTS_MSG_MOUSE_WHEEL);CHECK(e>=0&&event_part[e]==0&&event_args[e][0]==0&&event_args[e][1]==1);
 /* A script clearing the counts before dispatch must not create a zero
    wheel event (which otherwise interrupts backlog swipe/scroll handlers). */
 event_count=0;memset(counts,0,sizeof(counts));wheel_dir=1;wheel_serial++;mouse_clear_wheel();PE_UpdateInputState(16);
 CHECK(!counts[PARTS_MSG_MOUSE_WHEEL]);
 struct parts target=drop_part(22,0);target.wheelable=true;test_count=1;test_parts[0]=&target;test_mouse=(Point){20,20};
 event_count=0;memset(counts,0,sizeof(counts));wheel_dir=1;wheel_serial++;PE_UpdateInputState(16);
 int whole_wheel=-1,part_wheel=-1;
 for(int i=0;i<event_count;i++)if(event_type[i]==PARTS_MSG_MOUSE_WHEEL){if(!event_part[i])whole_wheel=i;else if(event_part[i]==22)part_wheel=i;}
 CHECK(counts[PARTS_MSG_MOUSE_WHEEL]==2&&whole_wheel>=0&&part_wheel>whole_wheel);
 /* Part number zero already addresses WholeMouse: send that event once. */
 target.no=0;event_count=0;memset(counts,0,sizeof(counts));wheel_serial++;PE_UpdateInputState(16);
 CHECK(counts[PARTS_MSG_MOUSE_WHEEL]==1);
 target.no=22;target.wheelable=false;event_count=0;memset(counts,0,sizeof(counts));wheel_serial++;PE_UpdateInputState(16);
 e=queued(PARTS_MSG_MOUSE_WHEEL);CHECK(counts[PARTS_MSG_MOUSE_WHEEL]==1&&event_part[e]==0);
 /* Older games keep their per-part event behavior. */
 program.version=10;target.wheelable=true;event_count=0;memset(counts,0,sizeof(counts));wheel_serial++;PE_UpdateInputState(16);
 e=queued(PARTS_MSG_MOUSE_WHEEL);CHECK(counts[PARTS_MSG_MOUSE_WHEEL]==1&&event_part[e]==22);
 program.version=12;PE_EndInput();test_count=0;event_count=0;memset(counts,0,sizeof(counts));mouse_clear_wheel();return 0;
}
int run_tests(void){
int drop_failure=drop_regressions();if(drop_failure)return drop_failure;
int wheel_failure=wheel_regressions();if(wheel_failure)return wheel_failure;
program.version=12;parts_began_click=false;
PE_BeginInput();clicked_parts=99;click_down_parts=99;whole_button_armed[0]=true;
PE_BeginInput();CHECK(clicked_parts==0&&click_down_parts==0&&!whole_button_armed[0]);clicked_parts=99;
PE_EndInput();CHECK(parts_began_click&&parts_input_depth==1&&clicked_parts==0);
PE_EndInput();CHECK(!parts_began_click&&parts_input_depth==0);
PE_EndInput();CHECK(!parts_began_click&&parts_input_depth==0);
program.version=10;PE_BeginInput();PE_BeginInput();PE_EndInput();CHECK(!parts_began_click);
program.version=12;PE_BeginInput();
struct parts root={.no=1,.input_enabled=false,.global={.show=true,.alpha=255}},button={.no=2,.input_enabled=true,.global={.show=true,.alpha=255,.pos={120,230},.scale={1,1}},.local.pos={20,30},.clickable=true,.linked_from=-1,.parent=&root};
button.states[0].common.hitbox=(Rectangle){20,30,100,80};root.global.pos=(Point){100,200};Point mouse={150,250};bool hover=false,click=false;
parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(button.is_hovered&&button.state==PARTS_STATE_HOVERED&&counts[PARTS_MSG_MOUSE_ENTER]==1);
hover=click=false;parts_update_mouse(&button,mouse,true,16,&hover,&click);CHECK(button.state==PARTS_STATE_CLICKED&&click_down_parts==2&&counts[PARTS_MSG_KEY_TRIGGER]==1);
prev_clicking=true;hover=click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(clicked_parts==2&&counts[PARTS_MSG_MOUSE_CLICK]==1&&counts[PARTS_MSG_KEY_UP]==1);
button.input_enabled=false;hover=click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(!button.is_hovered&&!hover);
button.input_enabled=true;button.back_scene=true;hover=click=false;parts_update_mouse(&button,mouse,true,16,&hover,&click);CHECK(!button.is_hovered&&!hover&&!click);button.back_scene=false;
button.input_enabled=true;root.global.show=false;hover=click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(!button.is_hovered&&!hover);
root.global.show=true;hover=true;click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(!button.is_hovered&&counts[PARTS_MSG_MOUSE_CLICK]==1);
/* The inactive card mode overlaps the visible card but has alpha zero. */
root.global.alpha=0;hover=click=false;parts_update_mouse(&button,mouse,true,16,&hover,&click);CHECK(!button.is_hovered&&!hover&&!click);
root.global.alpha=255;button.global.alpha=0;hover=click=false;parts_update_mouse(&button,mouse,true,16,&hover,&click);CHECK(!button.is_hovered&&!hover&&!click);
button.global.alpha=255;
button.component_type_override=2;prev_clicking=false;hover=click=false;
parts_update_mouse(&button,mouse,true,16,&hover,&click);CHECK(checkbox_changes==0);
prev_clicking=true;hover=click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);
CHECK(checkbox_changes==1&&checkbox_value);
button.checkbox_checked=true;prev_clicking=false;hover=click=false;parts_update_mouse(&button,mouse,true,16,&hover,&click);
prev_clicking=true;hover=click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);
CHECK(checkbox_changes==2&&!checkbox_value);
button.checkbox_button_mode=true;prev_clicking=false;hover=click=false;parts_update_mouse(&button,mouse,true,16,&hover,&click);
prev_clicking=true;hover=click=false;parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(checkbox_changes==2);
button.global.pos=(Point){100,200};button.global.scale.x=2;button.global.rotation.z=90;
CHECK(parts_hittest(&button,0,(Point){80,240}));CHECK(!parts_hittest(&button,0,(Point){100,402}));
button.global.rotation.z=0;button.global.scale.x=-2;CHECK(parts_hittest(&button,0,(Point){90,210}));
button.global.scale.x=0;CHECK(!parts_hittest(&button,0,(Point){90,210}));
button.global.scale.x=1;button.global.rotation.y=60;
CHECK(parts_hittest(&button,0,(Point){140,210}));CHECK(!parts_hittest(&button,0,(Point){160,210}));
button.global.rotation.y=90;CHECK(!parts_hittest(&button,0,(Point){100,210}));
button.global.rotation.y=180;CHECK(!parts_hittest(&button,0,(Point){90,210}));
button.global.rotation.y=0;
/* OrganizationCardView's large canvas must not shield the party close button. */
struct parts background=button;background.no=3;background.clickable=false;
background.states[0].type=PARTS_FLAT;background.states[0].common.hitbox=(Rectangle){20,30,1920,1080};
background.states[0].flat.visible=(Rectangle){0,0,10,10};background.global.pos=(Point){100,200};
prev_clicking=false;hover=click=false;parts_update_mouse(&background,mouse,true,16,&hover,&click);
CHECK(!hover&&!click);parts_update_mouse(&button,mouse,true,16,&hover,&click);CHECK(click_down_parts==2);
prev_clicking=true;hover=click=false;parts_update_mouse(&background,mouse,false,16,&hover,&click);parts_update_mouse(&button,mouse,false,16,&hover,&click);CHECK(clicked_parts==2);
button.global.pos=(Point){120,230};button.global.scale.x=1;
memset(counts,0,sizeof(counts));event_count=0;prev_clicking=false;click_down_parts=0;drag_state_reset();test_mouse=mouse;
test_count=0;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
CHECK(event_count==1&&event_part[0]==0&&event_type[0]==PARTS_MSG_MOUSE_CLICK&&event_button[0]==VK_LBUTTON);
test_keys[VK_RBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_RBUTTON]=false;PE_UpdateInputState(16);
CHECK(event_count==2&&event_part[1]==0&&event_button[1]==VK_RBUTTON);
test_count=1;test_parts[0]=&button;event_count=0;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
int whole=-1,part=-1;for(int i=0;i<event_count;i++)if(event_type[i]==PARTS_MSG_MOUSE_CLICK){if(event_part[i]==0)whole=i;else if(event_part[i]==2)part=i;}
CHECK(whole>=0&&part>whole);
test_count=0;event_count=0;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);PE_EndInput();PE_BeginInput();test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
CHECK(event_count==0);PE_EndInput();test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);CHECK(event_count==0);
/* A scene below the active controller (a quest list under its confirmation
 * dialog) must not be clicked; the active scene, scenes above it (help) and
 * the system overlay keep input. Stack order: 1, 3, 7, 9. */
PE_BeginInput();parts_multi_controller=true;active_controller=7;button.controller_no=3;
test_count=1;test_parts[0]=&button;event_count=0;
test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
{int to_button=0;for(int i=0;i<event_count;i++)to_button+=event_part[i]==2;CHECK(clicked_parts==0&&!to_button&&!button.is_hovered);}
PE_EndInput();PE_BeginInput();button.controller_no=7;event_count=0;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);
CHECK(clicked_parts==2);
PE_EndInput();PE_BeginInput();button.controller_no=9;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);CHECK(clicked_parts==2);
PE_EndInput();PE_BeginInput();button.controller_no=999;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);CHECK(clicked_parts==2);
PE_EndInput();PE_BeginInput();active_controller=999;button.controller_no=3;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);CHECK(clicked_parts==2);
active_controller=7;button.controller_no=7;
/* MuMu delivered both edges while a frame was busy loading cards. */
event_count=0;SDL_MouseButtonEvent down={1,SDL_PRESSED,150,250},up={1,0,150,250};
mouse_event(&down);mouse_event(&up);CHECK(!test_keys[VK_LBUTTON]);PE_UpdateInputState(80);
whole=part=-1;for(int i=0;i<event_count;i++)if(event_type[i]==PARTS_MSG_MOUSE_CLICK){if(event_part[i]==0)whole=i;else if(event_part[i]==2)part=i;}
CHECK(clicked_parts==2&&whole>=0&&part>whole);
event_count=0;PE_UpdateInputState(16);CHECK(!event_count||counts[PARTS_MSG_MOUSE_CLICK]>0);
for(int i=0;i<event_count;i++)CHECK(event_type[i]!=PARTS_MSG_MOUSE_CLICK);
/* Releasing outside the original target must still cancel the click. */
event_count=0;test_mouse=(Point){500,500};mouse_event(&down);mouse_event(&up);PE_UpdateInputState(80);
for(int i=0;i<event_count;i++)CHECK(event_type[i]!=PARTS_MSG_MOUSE_CLICK||event_part[i]==0);
/* A nested dialog must never receive the gesture that opened it. */
test_mouse=mouse;event_count=0;mouse_event(&down);mouse_event(&up);PE_BeginInput();PE_UpdateInputState(80);
for(int i=0;i<event_count;i++)CHECK(event_type[i]!=PARTS_MSG_MOUSE_CLICK);PE_EndInput();
/* Touch-generated edges and letterboxed coordinates use the same latch. */
event_count=0;synthetic_mouse_event(&down);synthetic_mouse_event(&up);PE_UpdateInputState(80);CHECK(clicked_parts==2);
int px,py; sdl.viewport=(Rectangle){100,50,960,540};
down.x=175;down.y=175;mouse_event(&down);mouse_event(&up);CHECK(mouse_take_press(VK_LBUTTON,&px,&py)&&px==150&&py==250);
CHECK(!mouse_take_press(VK_LBUTTON,&px,&py));sdl.viewport=(Rectangle){0,0,1920,1080};
/* A rapid right click on empty space still reaches WholeMouse exactly once. */
test_count=0;event_count=0;down.button=up.button=2;mouse_event(&down);mouse_event(&up);PE_UpdateInputState(80);
CHECK(event_count==1&&event_part[0]==0&&event_button[0]==VK_RBUTTON);
PE_EndInput();PE_BeginInput();memset(counts,0,sizeof(counts));event_count=0;
test_count=1;test_parts[0]=&button;test_mouse=mouse;button.draggable=false;
Point before=button.local.pos;test_keys[VK_LBUTTON]=true;PE_UpdateInputState(16);
test_mouse=(Point){mouse.x+20,mouse.y+10};PE_UpdateInputState(16);
CHECK(counts[PARTS_MSG_DRAG_BEGIN]==1&&counts[PARTS_MSG_DRAGGING]==1);
CHECK(button.local.pos.x==before.x&&button.local.pos.y==before.y);
test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);CHECK(counts[PARTS_MSG_DRAG_END]==1);
PE_EndInput();PE_BeginInput();memset(counts,0,sizeof(counts));event_count=0;
down=(SDL_MouseButtonEvent){1,SDL_PRESSED,150,250};mouse_event(&down);
test_mouse=(Point){500,500};PE_UpdateInputState(16);
CHECK(click_down_parts==2&&counts[PARTS_MSG_DRAG_BEGIN]==1&&counts[PARTS_MSG_DRAGGING]==1);
test_keys[VK_LBUTTON]=false;PE_UpdateInputState(16);CHECK(counts[PARTS_MSG_DRAG_END]==1);
return 0;}
`;
fs.writeFileSync(path.join(build,'input-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'input-test.wasm');
const r=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});assert.equal(r.status,0,r.stderr||r.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{sinf:Math.sin,cosf:Math.cos,vm_error(line){throw new Error('VM '+line);}}});const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: native input and WholeMouse wheel routing; empty/text areas, both directions, one dispatch per step, nested waits, clear-count behavior, per-part listeners and legacy input behavior.');
