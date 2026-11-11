"""Exercise the real mixer startup/play path used by Rance Quest sound waits."""
from pathlib import Path
import json
import os
import re
import subprocess

root = Path(__file__).resolve().parent.parent
build = root / "build/rance8-tests"
build.mkdir(parents=True, exist_ok=True)
text = (root / "xsystem4/src/audio_mixer.c").read_text(encoding="utf-8")


def function(name):
    match = re.search(r"^[^\n;{}]*\b" + name + r"\([^;{}]*\)\s*\{", text, re.M)
    assert match, name
    end = text.index("{", match.start())
    depth = 0
    while True:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
        if not depth:
            return text[match.start():end] + "\n"


source = r'''
#include <stdbool.h>
#include <stddef.h>
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
#define WARNING(...) ((void)0)
#define NOTICE(...) ((void)0)
#define SDL_INIT_AUDIO 16
#define AUDIO_F32 1
#define CHUNK_SIZE 1024
typedef unsigned SDL_AudioDeviceID;
typedef unsigned char Uint8;
typedef struct {
    int freq, format, channels, samples;
    void (*callback)(void *, Uint8 *, int);
} SDL_AudioSpec;
struct mixer { int mixer; } storage[2];
struct channel { _Atomic int voice; int mixer_no, stream; float data[8]; };
static struct mixer *mixers;
static SDL_AudioDeviceID audio_device;
static unsigned initialized;
static int fail_init, fail_open, next_voice;
static int init_calls, open_calls, unpause_calls, channel_inits;
static int locks, lock_calls, invalid_locks, play_calls;
void *memset(void *p, int value, size_t n) {
    unsigned char *b = p;
    for (size_t i = 0; i < n; i++) b[i] = value;
    return p;
}
unsigned SDL_WasInit(unsigned flags) { return initialized & flags; }
int SDL_InitSubSystem(unsigned flags) {
    init_calls++;
    if (fail_init) return -1;
    initialized |= flags;
    return 0;
}
static void audio_callback(void *p, Uint8 *stream, int len) {}
void mixer_init_channels(void) { channel_inits++; mixers = storage; }
SDL_AudioDeviceID SDL_OpenAudioDevice(const char *name, int capture,
        const SDL_AudioSpec *want, SDL_AudioSpec *have, int changes) {
    open_calls++;
    if (!(initialized & SDL_INIT_AUDIO) || fail_open) return 0;
    *have = *want;
    return 41;
}
void SDL_PauseAudioDevice(SDL_AudioDeviceID id, int pause) {
    if (id != 41 || pause) __builtin_trap();
    unpause_calls++;
}
void SDL_LockAudioDevice(SDL_AudioDeviceID id) {
    lock_calls++; locks++;
    if (id != 41) invalid_locks++;
}
void SDL_UnlockAudioDevice(SDL_AudioDeviceID id) {
    if (id != 41) invalid_locks++;
    locks--;
}
int sts_mixer_play_stream(int *mixer, int *stream, float volume) {
    if (locks != 1) __builtin_trap();
    play_calls++;
    return next_voice;
}
static void reset(void) {
    mixers = NULL; audio_device = 0; initialized = 0;
    fail_init = fail_open = 0; next_voice = 3;
    init_calls = open_calls = unpause_calls = channel_inits = 0;
    locks = lock_calls = invalid_locks = play_calls = 0;
}
'''
for name in ("mixer_init", "channel_play", "channel_is_playing"):
    source += function(name)
source += r'''
int run_tests(void) {
    struct channel ch = { .voice = -1, .mixer_no = 1 };
    /* Kiwi may initialize before graphics has initialized any SDL subsystem. */
    reset();
    CHECK(mixer_init());
    CHECK(init_calls == 1 && open_calls == 1 && channel_inits == 1);
    CHECK(audio_device == 41 && unpause_calls == 1);
    CHECK(mixer_init() && init_calls == 1 && open_calls == 1);
    CHECK(channel_play(&ch) && channel_is_playing(&ch));
    CHECK(play_calls == 1 && !locks && !invalid_locks);
    CHECK(channel_play(&ch) && play_calls == 1);

    /* Failed startup must leave IsPlay false, or R8's unskippable SE wait loops. */
    reset(); ch.voice = -1; fail_init = 1;
    CHECK(!channel_play(&ch) && !channel_is_playing(&ch));
    CHECK(init_calls == 1 && !open_calls && !lock_calls && !play_calls);
    fail_init = 0;
    CHECK(channel_play(&ch) && channel_is_playing(&ch));
    CHECK(init_calls == 2 && open_calls == 1 && play_calls == 1);
    CHECK(!locks && !invalid_locks);

    /* An unavailable device can be retried without rebuilding mixer groups. */
    reset(); ch.voice = -1; fail_open = 1;
    CHECK(!channel_play(&ch) && !channel_is_playing(&ch));
    CHECK(init_calls == 1 && open_calls == 1 && channel_inits == 1);
    CHECK(!lock_calls && !play_calls);
    fail_open = 0;
    CHECK(channel_play(&ch) && channel_is_playing(&ch));
    CHECK(init_calls == 1 && open_calls == 2 && channel_inits == 1);
    CHECK(unpause_calls == 1 && play_calls == 1 && !invalid_locks);

    /* Exhausted voices must also report failure without entering a sound wait. */
    ch.voice = -1; next_voice = -1;
    CHECK(!channel_play(&ch) && !channel_is_playing(&ch));
    CHECK(!locks && !invalid_locks);
    next_voice = 4;
    CHECK(channel_play(&ch) && channel_is_playing(&ch));
    return 0;
}
'''
cfile = build / "audio-startup-test.c"
cfile.write_text(source, encoding="utf-8")
wasm = build / "audio-startup-test.wasm"
compiler = root.parent / "android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe"
subprocess.run([
    str(compiler), "--target=wasm32-unknown-unknown", "-std=gnu11", "-O1",
    "-fno-builtin", "-nostdlib", "-Werror", "-Wl,--no-entry",
    "-Wl,--export=run_tests", "-o", str(wasm), str(cfile),
], check=True, env={**os.environ, "TEMP": str(build), "TMP": str(build)})
script = "const fs=require('fs');WebAssembly.instantiate(fs.readFileSync(" + json.dumps(str(wasm)) + """
)).then(({instance})=>{const line=instance.exports.run_tests();
if(line)throw Error('C assertion line '+line);
console.log('PASS: early SDL audio init; failed init/open never plays; retry preserves mixers; exhausted voices report failure.');});
"""
subprocess.run(["node", "-e", script], check=True)
