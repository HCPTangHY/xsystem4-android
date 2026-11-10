import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
await import('./test-rance10-array.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8');
const prefix=fs.readFileSync(path.join(build,'array-test.c'),'utf8').split('/* Generic Array ABI')[0];
const enumText=read('src/parts/parts_internal.h').match(/enum parts_message_type\s*\{[\s\S]*?\};/)[0];
const source=`${prefix}
#include <stdarg.h>
${read('include/queue.h')}
#define possibly_unused
struct parts {int no,delegate_index;};bool parts_multi_controller;
void free_string(struct string *s){(void)s;}
${enumText}
${read('src/parts/message.c').replace(/^#include.*$/gm,'')}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 next_slot=1;program.version=12;parts_multi_controller=true;
 struct parts part={123,45};
 CHECK(PE_GetMessageType()==-1);PE_PopMessage();CHECK(PE_GetMessageType()==-1);
 int native[]={PARTS_MSG_MOUSE_ENTER,PARTS_MSG_MOUSE_MOVE,PARTS_MSG_MOUSE_LEAVE,PARTS_MSG_MOUSE_WHEEL,PARTS_MSG_MOUSE_CLICK,PARTS_MSG_MOUSE_ON,PARTS_MSG_DRAG_BEGIN,PARTS_MSG_DRAGGING,PARTS_MSG_DRAG_END,PARTS_MSG_DROP_ENTER,PARTS_MSG_DROP_ON,PARTS_MSG_DROPPED,PARTS_MSG_DROP_LEAVE,PARTS_MSG_KEY_TRIGGER,PARTS_MSG_KEY_DOWN,PARTS_MSG_KEY_UP};
 int modern[]={0,1,2,3,4,6,7,8,10,11,12,13,14,15,16,18};
 for(int i=0;i<16;i++){
  parts_msg_push(&part,native[i],"ii",10,20);
  CHECK(PE_GetMessageType()==modern[i]&&PE_GetMessagePartsNumber()==123&&PE_GetMessageDelegateIndex()==45);
  CHECK(PE_GetMessageVariableCount()==2&&PE_GetMessageVariableType(0)==1&&PE_GetMessageVariableInt(0)==10&&PE_GetMessageVariableInt(1)==20&&PE_GetMessageVariableInt(2)==0);
  PE_PopMessage();CHECK(PE_GetMessageType()==-1);
 }
 parts_msg_push(&part,PARTS_MSG_MOUSE_CLICK,"i",99);parts_msg_push(&part,PARTS_MSG_KEY_UP,"i",88);
 CHECK(PE_GetMessageVariableInt(0)==99);PE_PopMessage();CHECK(PE_GetMessageType()==18&&PE_GetMessageVariableInt(0)==88);
 PE_ReleaseMessage();CHECK(PE_GetMessageType()==-1);
 parts_msg_push(NULL,PARTS_MSG_MOUSE_CLICK,"iii",150,250,1);
 parts_msg_push(&part,PARTS_MSG_SCROLL,"ii",20,1024);
 CHECK(PE_GetMessageType()==4&&PE_GetMessagePartsNumber()==0&&PE_GetMessageDelegateIndex()==-1);
 CHECK(PE_GetMessageVariableCount()==3&&PE_GetMessageVariableInt(2)==1);PE_PopMessage();
 CHECK(PE_GetMessageType()==21&&PE_GetMessagePartsNumber()==123&&PE_GetMessageVariableInt(0)==20);
 PE_ReleaseMessage();CHECK(PE_GetMessageType()==-1);
 // CBackLogView subscribes to part 0 and expects two integer wheel counts.
 for(int forward=0;forward<2;forward++){
  parts_msg_push(NULL,PARTS_MSG_MOUSE_WHEEL,"ii",forward,1-forward);
  CHECK(PE_GetMessageType()==3&&PE_GetMessagePartsNumber()==0&&PE_GetMessageDelegateIndex()==-1);
  CHECK(PE_GetMessageVariableCount()==2&&PE_GetMessageVariableType(0)==1&&PE_GetMessageVariableType(1)==1);
  CHECK(PE_GetMessageVariableInt(0)==forward&&PE_GetMessageVariableInt(1)==1-forward);
  PE_PopMessage();CHECK(PE_GetMessageType()==-1);
 }
 // SceneSave registers the text-change callback on script message 22.
 parts_msg_push(&part,PARTS_MSG_CHANGED,"");
 CHECK(PE_GetMessageType()==22&&PE_GetMessagePartsNumber()==123&&PE_GetMessageDelegateIndex()==45&&PE_GetMessageVariableCount()==0);
 PE_ReleaseMessage();CHECK(PE_GetMessageType()==-1);
 program.version=10;CHECK(PE_GetMessageType()==0);parts_msg_push(&part,PARTS_MSG_MOUSE_CLICK,"i",7);CHECK(PE_GetMessageType()==5);PE_ReleaseMessage();
 program.version=12;parts_msg_push(&part,PARTS_MSG_CHANGED_FLAG,"b",true);
 CHECK(PE_GetMessageType()==23&&PE_GetMessageVariableType(0)==3&&PE_GetMessageVariableBool(0));
 PE_PopMessage();parts_msg_push(&part,PARTS_MSG_CHANGED_FLAG,"b",false);
 CHECK(PE_GetMessageVariableType(0)==3&&!PE_GetMessageVariableBool(0));PE_ReleaseMessage();
 parts_msg_push(&part,PARTS_MSG_DRAGGING,"iiiii",100,200,130,240,1);
 CHECK(PE_GetMessageType()==8&&PE_GetMessageVariableCount()==5);
 CHECK(PE_GetMessageVariableInt(4)==1&&PE_GetMessageVariableType(4)==1);PE_PopMessage();
 parts_msg_push(&part,PARTS_MSG_DRAG_END,"ib",1,false);
 CHECK(PE_GetMessageType()==10&&PE_GetMessageVariableCount()==2&&PE_GetMessageVariableType(1)==3&&!PE_GetMessageVariableBool(1));PE_PopMessage();
 CHECK(allocated==freed);return 0;
}
`;
fs.writeFileSync(path.join(build,'messages-test.c'),source);
const compiler=process.env.RANCE10_TEST_CLANG||path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm=path.join(build,'messages-test.wasm');
const result=spawnSync(compiler,['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(result.status,0,result.stderr||result.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm),{env:{vm_error(line){throw new WebAssembly.RuntimeError(`VM error at C line ${line}`);}}});
const line=instance.exports.run_tests();assert.equal(line,0,`C failure ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: actual message queue: modern/legacy IDs, whole-screen clicks, scrollbar event 21, parameters, FIFO and release.');
