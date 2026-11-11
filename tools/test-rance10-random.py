"""Exercise the RNG used by script-global FixedRandomDigit before main()."""
from pathlib import Path
import json, os, re, subprocess

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
typedef unsigned uint32_t;typedef unsigned char uint8_t;typedef unsigned size_t;
typedef unsigned long long uint64_t;typedef _Bool bool;
#define NULL ((void*)0)
#define true 1
#define false 0
#define CHECK(x) do{if(!(x))return __LINE__;}while(0)
uint64_t counter=1000000;uint64_t SDL_GetPerformanceCounter(void){return counter;}
int wall_time=1700000000;int time(void *p){return wall_time;}
struct{int version;}program={12},*ain=&program;
#define MT19937_STATE_SIZE 624
struct mt19937{uint32_t st[MT19937_STATE_SIZE];int i;};
'''
source += re.sub(r'^#include.*$', '', (root/'xsystem4/subprojects/libsys4/src/mt19937int.c').read_text(), flags=re.M)
source += '\nstatic struct mt19937 mt;static bool mt_initialized;\n'
source += function('src/vm.c','vm_random_seed')+'\n'
for name in ('math_genrand','Math_SetSeed','Math_SetSeedByCurrentTime','Math_RandF'):
    source += function('src/hll/Math.c',name)+'\n'
source += r'''
int run_tests(void){
 /* The game constructs this table before its explicit time-seeding call. */
 static float first_table[32767];
 for(int i=0;i<32767;i++)first_table[i]=Math_RandF();
 mt_initialized=false;counter+=987654321;wall_time++;
 int different=0;
 for(int i=0;i<32767;i++){
  float value=Math_RandF();CHECK(value>=0&&value<=1);
  different+=value!=first_table[i];
 }
 CHECK(different>32000);
 /* Repeated calls in one clock tick still have independent default seeds. */
 uint32_t a=vm_random_seed(),b=vm_random_seed();CHECK(a&&b&&a!=b);
 uint32_t values[64];Math_SetSeed(1234);
 for(int i=0;i<64;i++)values[i]=math_genrand();
 counter+=1000;wall_time++;Math_SetSeed(1234);
 for(int i=0;i<64;i++)CHECK(values[i]==math_genrand());
 /* The original fixed default remains for older games. */
 program.version=10;mt_initialized=false;
 struct mt19937 legacy;mt19937_init(&legacy,4357);
 for(int i=0;i<64;i++)CHECK(math_genrand()==mt19937_genrand(&legacy));
 Math_SetSeedByCurrentTime();uint32_t timed=math_genrand();
 Math_SetSeed(wall_time);CHECK(timed==math_genrand());
 return 0;
}
'''
cfile=build/'random-test.c';cfile.write_text(source,encoding='utf-8')
wasm=build/'random-test.wasm'
compiler=root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
subprocess.run([str(compiler),'--target=wasm32-unknown-unknown','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',str(wasm),str(cfile)],check=True,env={**os.environ,'TEMP':str(build),'TMP':str(build)})
script="const fs=require('fs');WebAssembly.instantiate(fs.readFileSync("+json.dumps(str(wasm))+")).then(({instance})=>{const line=instance.exports.run_tests();if(line)throw Error('C assertion line '+line);console.log('PASS: early random tables vary; explicit seeds and legacy defaults remain reproducible.');});"
subprocess.run(['node','-e',script],check=True)
