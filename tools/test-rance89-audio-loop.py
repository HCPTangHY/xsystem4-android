"""Exercise real mixer reads across short stereo loops and decoder EOF."""
from pathlib import Path
import json
import os
import re
import subprocess

root = Path(__file__).resolve().parent.parent
build = root / 'build/rance89-tests'
build.mkdir(parents=True, exist_ok=True)
text = (root / 'xsystem4/src/audio_mixer.c').read_text('utf8')


def function(name):
    m = re.search(r'^[^\n;{}]*\b' + name + r'\([^;{}]*\)\s*\{', text, re.M)
    assert m, name
    end = text.index('{', m.start()); depth = 0
    while True:
        depth += (text[end] == '{') - (text[end] == '}'); end += 1
        if not depth:
            return text[m.start():end] + '\n'


source = r'''
#include <stdbool.h>
#include <stdint.h>
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
#define WARNING(...) ((void)0)
#define STS_STREAM_CONTINUE 0
#define STS_STREAM_COMPLETE 1
#define SEEK_SET 0
#define min(a,b) ((a)<(b)?(a):(b))
typedef int64_t sf_count_t;
struct fake_file { int pos, channels, actual_frames, short_limit, seek_fails, read_calls; };
struct channel { struct fake_file *file; struct { sf_count_t frames; int channels; } info;
    uint_least32_t frame, loop_start, loop_end, loop_count; };
static sf_count_t sf_seek(struct fake_file *f,sf_count_t pos,int whence) {
    if(f->seek_fails)return -1;
    f->pos=pos;return pos;
}
static sf_count_t sf_readf_float(struct fake_file *f,float *out,sf_count_t count) {
    if(count<0 || ++f->read_calls>1000)__builtin_trap();
    int n=min(count,f->actual_frames-f->pos);
    if(f->short_limit)n=min(n,f->short_limit);
    if(n<0)n=0;
    for(int i=0;i<n;i++)for(int c=0;c<f->channels;c++)out[i*f->channels+c]=(f->pos+i)*10+c;
    f->pos+=n;return n;
}
'''
for name in ['cb_seek', 'cb_loop', 'cb_read_frames']:
    source += function(name)
source += r'''
int run_tests(void) {
    float out[22];uint_least32_t n;
    struct fake_file f={.channels=2,.actual_frames=3};
    struct channel c={.file=&f,.info={3,2},.loop_end=3,.loop_count=0};
    for(int i=0;i<22;i++)out[i]=-999;
    CHECK(cb_read_frames(&c,out,10,&n)==STS_STREAM_CONTINUE && n==10);
    for(int i=0;i<10;i++)for(int j=0;j<2;j++)CHECK(out[i*2+j]==(i%3)*10+j);
    CHECK(out[20]==-999 && out[21]==-999 && c.frame==1);
    f=(struct fake_file){.channels=2,.actual_frames=3};
    c=(struct channel){.file=&f,.info={3,2},.loop_end=3,.loop_count=2};
    CHECK(cb_read_frames(&c,out,10,&n)==STS_STREAM_COMPLETE && n==6 && c.loop_count==1);
    for(int i=0;i<6;i++)for(int j=0;j<2;j++)CHECK(out[i*2+j]==(i%3)*10+j);
    // Decoder ends earlier than its declared length, after a stereo loop wrap.
    f=(struct fake_file){.channels=2,.actual_frames=3};
    c=(struct channel){.file=&f,.info={9,2},.frame=2,.loop_end=4,.loop_count=0};f.pos=2;
    for(int i=0;i<22;i++)out[i]=-999;
    CHECK(cb_read_frames(&c,out,10,&n)==STS_STREAM_CONTINUE && n==10);
    for(int i=0;i<10;i++)for(int j=0;j<2;j++)CHECK(out[i*2+j]==((i+2)%3)*10+j);
    CHECK(out[20]==-999 && out[21]==-999);
    // A short positive read is progress, not a loop boundary.
    f=(struct fake_file){.channels=1,.actual_frames=8,.short_limit=2};
    c=(struct channel){.file=&f,.info={8,1},.loop_end=8,.loop_count=1};
    CHECK(cb_read_frames(&c,out,6,&n)==STS_STREAM_CONTINUE && n==6 && c.frame==6);
    for(int i=0;i<6;i++)CHECK(out[i]==i*10);
    f=(struct fake_file){.channels=2,.actual_frames=0};
    c=(struct channel){.file=&f,.info={8,2},.loop_end=8,.loop_count=0};
    CHECK(cb_read_frames(&c,out,10,&n)==STS_STREAM_COMPLETE && n==0 && f.read_calls<=2);
    f=(struct fake_file){.channels=2,.actual_frames=3,.pos=3};
    c=(struct channel){.file=&f,.info={3,2},.frame=3,.loop_start=3,.loop_end=3,.loop_count=0};
    CHECK(cb_read_frames(&c,out,10,&n)==STS_STREAM_COMPLETE && n==0);
    f=(struct fake_file){.channels=1,.actual_frames=3,.seek_fails=1};
    c=(struct channel){.file=&f,.info={3,1},.loop_end=3,.loop_count=0};
    CHECK(cb_read_frames(&c,out,10,&n)==STS_STREAM_COMPLETE && n==3);
    return 0;
}
'''
cfile = build / 'audio-loop-test.c'; cfile.write_text(source, encoding='utf8')
wasm = build / 'audio-loop-test.wasm'
compiler = root.parent / 'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
subprocess.run([str(compiler), '--target=wasm32-unknown-unknown', '-std=gnu11', '-O1', '-fno-builtin', '-nostdlib', '-Werror',
                '-Wl,--no-entry', '-Wl,--export=run_tests', '-o', str(wasm), str(cfile)], check=True,
               env={**os.environ, 'TEMP': str(build), 'TMP': str(build)})
script = 'const fs=require("fs");WebAssembly.instantiate(fs.readFileSync(' + json.dumps(str(wasm)) + ''')).then(({instance})=>{
const line=instance.exports.run_tests();if(line)throw Error('C assertion line '+line);
console.log('PASS: short stereo loops, finite repeats, early EOF, short positive reads, empty streams, invalid loops and failed seeks.');});'''
subprocess.run(['node', '-e', script], check=True)
