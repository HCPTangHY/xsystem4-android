"""Check card load-time compensation and missing-symbol font selection."""
from pathlib import Path
import re, subprocess, os, json
root = Path(__file__).resolve().parent.parent
build = root / 'build/rance10-tests'
build.mkdir(parents=True, exist_ok=True)
def function(file, name):
    text = (root/'xsystem4'/file).read_text(encoding='utf-8')
    match = re.search(r'^[^\n;{}]*\b'+name+r'\([^;{}]*\)\s*\{', text, re.M)
    assert match, name
    end = text.index('{', match.start()); depth = 0
    while True:
        depth += (text[end]=='{')-(text[end]=='}'); end += 1
        if not depth: return text[match.start():end]
source = r'''
typedef unsigned uint32_t;typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
#define XSYS4_DATA_DIR "assets"
#define CHECK(x) do{if(!(x))return __LINE__;}while(0)
uint32_t ticks;uint32_t SDL_GetTicks(void){return ticks;}
struct {int version;} program={12},*ain=&program;
static uint32_t vm_load_time;
unsigned parts_update_serial;
#define PARTS_CONSTRUCTION_PROCESS 7
struct parts_construction_process{int load_started;unsigned load_frame;bool load_pending;};
struct parts{struct{int type;struct parts_construction_process cproc;}states[1];} card;
bool parts_state_valid(int state){return state==0;}
struct parts *parts_get(int no){return &card;}
struct parts *parts_try_get(int no){return no==7?&card:NULL;}
struct parts_construction_process *parts_get_construction_process(struct parts *p,int state){p->states[state].type=PARTS_CONSTRUCTION_PROCESS;return &p->states[state].cproc;}
bool parts_clear_construction_process(struct parts_construction_process *p){return true;}
bool PE_BuildPartsConstructionProcess(int no,int state){card.states[0].cproc.load_pending=false;ticks+=240;return state==1;}
struct string{int dummy;};
void vm_exclude_load_time(uint32_t milliseconds);
bool nested_cg_load;
bool PE_SetPartsCG(int no,struct string *name,int deform,int state){ticks+=320;if(nested_cg_load)vm_exclude_load_time(320);return state==1;}
struct font{int dummy;};struct font_ft{struct font super;int font;};
struct font_ft primary={.font=1},fallback={.font=2},symbols={.font=3},hana={.font=4};int fallback_loads;
int FT_Get_Char_Index(int font,uint32_t code){return code==0x25bc?(font==2):code==0x2316?(font==3):code==0x03ed?(font==4):code==0x71c3;}
struct font *ft_font_load(const char *path){fallback_loads++;return fallback_loads==1?&fallback.super:fallback_loads==2?&symbols.super:&hana.super;}
'''
for name in ('vm_exclude_load_time','vm_time'):
    source += function('src/vm.c',name)+'\n'
for name in ('PE_ClearPartsConstructionProcess','parts_construction_load_start'):
    source += function('src/parts/construction.c',name)+'\n'
source += function('src/hll/PartsEngine.c','PartsEngine_BuildPartsConstructionProcessThread')+'\n'
source += function('src/hll/PartsEngine.c','PartsEngine_SetPartsCGThread')+'\n'
source += function('src/font_freetype.c','ft_font_with_glyph')+'\n'
source += r'''
int run_tests(void){
 ticks=1000;CHECK(vm_time()==1000);
 CHECK(PartsEngine_BuildPartsConstructionProcessThread(7,1));
 CHECK(ticks==1240&&vm_time()==1000);ticks+=16;CHECK(vm_time()==1016);
 /* The first 100ms phase must start at 16%, not skip to its endpoint. */
 float scale=1.0f+0.2f*(vm_time()-1000)/100.0f;
 CHECK(scale>1.03f&&scale<1.04f);
 CHECK(!PartsEngine_BuildPartsConstructionProcessThread(7,0)&&vm_time()==1016);
 CHECK(PartsEngine_SetPartsCGThread(7,NULL,1)&&vm_time()==1016);
 ticks+=16;CHECK(vm_time()==1032);
 /* VM submission of the original card command list also takes time. */
 CHECK(PE_ClearPartsConstructionProcess(7,1));ticks+=107;
 CHECK(PartsEngine_BuildPartsConstructionProcessThread(7,1)&&vm_time()==1032);
 CHECK(!card.states[0].cproc.load_pending);ticks+=16;CHECK(vm_time()==1048);
 /* A pending command list cannot exclude elapsed animation in later frames. */
 CHECK(PE_ClearPartsConstructionProcess(7,1));ticks+=100;parts_update_serial++;
 CHECK(PartsEngine_BuildPartsConstructionProcessThread(7,1)&&vm_time()==1148);
 CHECK(PE_ClearPartsConstructionProcess(7,1));ticks+=30;
 CHECK(PE_BuildPartsConstructionProcess(7,1));int after_sync=vm_time();
 CHECK(PartsEngine_BuildPartsConstructionProcessThread(7,1)&&vm_time()==after_sync);
 CHECK(parts_construction_load_start(99,1)==vm_time());
 CHECK(parts_construction_load_start(7,0)==vm_time());
 program.version=10;int legacy=vm_time();
 CHECK(PE_ClearPartsConstructionProcess(7,1));ticks+=40;
 CHECK(PartsEngine_BuildPartsConstructionProcessThread(7,1));CHECK(vm_time()==legacy+280);
 CHECK(ft_font_with_glyph(&primary,0x71c3)==&primary&&fallback_loads==0);
 CHECK(ft_font_with_glyph(&primary,0x25bc)==&fallback&&fallback_loads==1);
 CHECK(ft_font_with_glyph(&primary,0x25bc)==&fallback&&fallback_loads==1);
 CHECK(ft_font_with_glyph(&primary,0x2316)==&symbols&&fallback_loads==2);
 CHECK(ft_font_with_glyph(&primary,0x03ed)==&hana&&fallback_loads==3);
 CHECK(ft_font_with_glyph(&primary,0x12345)==&primary&&fallback_loads==3);
 CHECK(ft_font_with_glyph(&primary,0x25bc)==&fallback&&fallback_loads==3);
 /* The real CG loader now excludes its own time. The async wrapper must
    not subtract that same interval twice and move the script clock back. */
 program.version=12;nested_cg_load=true;int before_nested=vm_time();
 CHECK(PartsEngine_SetPartsCGThread(7,NULL,1)&&vm_time()==before_nested);
 ticks+=16;CHECK(vm_time()==before_nested+16);
 return 0;
}
'''
cfile=build/'timing-font-test.c';cfile.write_text(source,encoding='utf-8')
wasm=build/'timing-font-test.wasm'
compiler=root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
subprocess.run([str(compiler),'--target=wasm32-unknown-unknown','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',str(wasm),str(cfile)],check=True,env={**os.environ,'TEMP':str(build),'TMP':str(build)})
script="const fs=require('fs');WebAssembly.instantiate(fs.readFileSync("+json.dumps(str(wasm))+")).then(({instance})=>{const line=instance.exports.run_tests();if(line)throw Error('C assertion line '+line);console.log('PASS: card load does not consume enlargement time; missing triangle uses bundled fallback.');});"
subprocess.run(['node','-e',script],check=True)
