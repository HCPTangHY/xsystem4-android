"""Run real exit/save/SDL cleanup functions in separate Android processes.

No Activity or game is started. A vendor-destructor sentinel detects whether
Android sys_exit incorrectly invokes process-wide static destructors.
"""
from pathlib import Path
import argparse
import os
import re
import struct
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--serial', required=True)
p.add_argument('--before', action='store_true')
args = p.parse_args()
root = Path(__file__).resolve().parent.parent
engine = root/'xsystem4'
lib = engine/'subprojects/libsys4'
build = root/'build/rance89-tests'
build.mkdir(parents=True, exist_ok=True)


def function(path, name):
    text = path.read_text('utf8')
    m = re.search(r'^[^\n;{}]*\b'+name+r'\([^;{}]*\)\s*\{', text, re.M)
    assert m, name
    end = text.index('{', m.start()); depth = 0
    while True:
        depth += (text[end] == '{') - (text[end] == '}'); end += 1
        if not depth:
            return text[m.start():end]+'\n'


source = r'''
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include "system4.h"
#include "system4/file.h"
#include "system4/little_endian.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %d: %s\n",__LINE__,#x);_Exit(101); } } while(0)
#define display_utf0(p) (p)
static char trace_path[512],save_name[512];
static char *save_path=save_name;
static uint8_t read_flags[]={0xa5,0x80};
static uint8_t *flags=read_flags;
static int nr_flags=9;
static void record(char c){FILE *f=fopen(trace_path,"ab");CHECK(f);CHECK(fputc(c,f)!=EOF);CHECK(!fclose(f));}
FILE *file_open_utf8(const char *path,const char *mode){return fopen(path,mode);}
static void msgskip_adv_save(void){record('S');}
static void glDeleteProgram(unsigned p){CHECK(p==123);record('G');}
static void SDL_DestroyWindow(void *p){CHECK(p==(void*)1);record('W');}
static void SDL_FreeFormat(void *p){CHECK(p==(void*)2);record('F');}
static void SDL_Quit(void){record('Q');}
static struct {void *window,*format;} sdl={(void*)1,(void*)2};
static struct {unsigned program;} default_shader={123};
'''
source += function(engine/'src/hll/MsgSkip.c', 'msgskip_save')
source += function(engine/'src/video.c', 'gfx_fini')
source += r'''
static void vendor_destructor(void){record('V');_Exit(99);}
static void reenter(void){record('R');sys_exit(23);}
int main(int argc,char **argv){
 CHECK(argc==3);snprintf(trace_path,sizeof(trace_path),"%s/trace",argv[2]);
 snprintf(save_name,sizeof(save_name),"%s/MsgSkip.asd",argv[2]);
 CHECK(!atexit(vendor_destructor));
 if(!strcmp(argv[1],"empty"))sys_exit(5);
 CHECK(!sys_atexit(gfx_fini));CHECK(!sys_atexit(msgskip_save));
 if(!strcmp(argv[1],"reenter"))CHECK(!sys_atexit(reenter));
 sys_exit(7);
}
'''
cfile = build/'android-exit-test.c'; cfile.write_text(source, encoding='utf8')
system_source = lib/'src/system.c'
if args.before:
    original = system_source.read_text('utf8').split('#ifdef __ANDROID__\nstruct sys_exit_callback')[0]
    original += 'int sys_atexit(void (*callback)(void)){return atexit(callback);}\n_Noreturn void sys_exit(int code){exit(code);}\n'
    system_source = build/'system-exit-before.c'; system_source.write_text(original, encoding='utf8')
compiler = root.parent/'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
adb = [str(root.parent/'android-build/sdk/platform-tools/adb.exe'), '-s', args.serial]
remote = '/data/local/tmp/xsystem4-android-exit-test'
directory = remote+'-data'
try:
    for target in ['android', 'desktop']:
        binary = build/('android-exit-test-'+target)
        subprocess.run([str(compiler), '--target=aarch64-linux-android28', '-std=gnu11', '-O1',
                        *(['-U__ANDROID__'] if target=='desktop' else []), '-ffunction-sections', '-fdata-sections',
                        '-Wl,--gc-sections', '-I', str(lib/'include'), str(cfile), str(system_source),
                        '-o', str(binary), '-llog'], check=True,
                       env={**os.environ, 'TEMP':str(build), 'TMP':str(build)})
        subprocess.run(adb+['push', str(binary), remote], check=True)
        subprocess.run(adb+['shell', 'chmod', '700', remote], check=True)
        subprocess.run(adb+['shell', 'mkdir', '-p', directory], check=True)
        for mode, expected_code, expected_trace in [('normal', 7, b'SGWFQ'), ('empty', 5, b''), ('reenter',23,b'R')]:
            if target=='desktop' and mode=='reenter':continue
            subprocess.run(adb+['shell', 'rm', '-f', directory+'/trace', directory+'/MsgSkip.asd'], check=True)
            subprocess.run(adb+['shell', 'touch', directory+'/trace'], check=True)
            result = subprocess.run(adb+['shell', remote, mode, directory], capture_output=True)
            trace = subprocess.run(adb+['exec-out', 'cat', directory+'/trace'], capture_output=True).stdout
            if target=='desktop':expected_code,expected_trace=99,expected_trace+b'V'
            assert result.returncode==expected_code, (target,mode,result.returncode,expected_code,trace,result.stderr)
            assert trace==expected_trace, (target,mode,trace,expected_trace)
            if mode=='normal':
                saved = subprocess.check_output(adb+['exec-out','cat',directory+'/MsgSkip.asd'])
                assert saved==struct.pack('<I',9)+b'\xa5\x80', saved
        print('PASS:', target, 'exit status; LIFO real MsgSkip save/SDL cleanup; destructor sentinel; reentry guard' if target=='android'
              else 'retains normal atexit/exit behavior', flush=True)
finally:
    subprocess.run(adb+['shell','rm','-f',remote,directory+'/trace',directory+'/MsgSkip.asd'],check=True)
    subprocess.run(adb+['shell','rmdir',directory],check=True)
