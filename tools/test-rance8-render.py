"""Render the real legacy sprite initializer/shared shader on Android GLES.

Runs a separate EGL pbuffer test process; does not launch or control the game.
"""
from pathlib import Path
import argparse
import json
import os
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--serial", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
engine = root / "xsystem4"
build = root / "build/rance8-tests"
build.mkdir(parents=True, exist_ok=True)
text = (engine / "src/sprite.c").read_text(encoding="utf8")
match = re.search(r"^void sprite_init_chipmunk\(void\)\s*\{", text, re.M)
assert match
end = text.index("{", match.start())
depth = 0
while True:
    depth += (text[end] == "{") - (text[end] == "}")
    end += 1
    if not depth:
        initializer = text[match.start():end]
        break

source = r'''
#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #x); return 1; } } while (0)
#define WARNING(...) do { fprintf(stderr, __VA_ARGS__); abort(); } while (0)
struct shader { GLuint program; void (*prepare)(void); };
static struct {
    struct shader s;
    GLuint blend_rate, multiply_color, add_color, bot_left, top_right;
} sprite_shader;
static void prepare_sact_shader(void) {}
static void prepare_chipmunk_shader(void) {}
'''
prefix = "#version 300 es\nprecision highp float;\nprecision highp int;\n"
for var, name in (("vertex_source", "parts.v.glsl"), ("fragment_source", "parts.f.glsl")):
    source += "static const char *" + var + " = " + json.dumps(prefix + (engine / "shaders" / name).read_text(encoding="utf8")) + ";\n"
source += r'''
static GLuint compile_shader(GLenum type, const char *source) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, NULL);
    glCompileShader(shader);
    GLint ok;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[4096]; glGetShaderInfoLog(shader, sizeof(log), NULL, log);
        fprintf(stderr, "Shader compilation failed: %s\n", log); exit(1);
    }
    return shader;
}
static void gfx_load_shader(struct shader *shader, const char *vertex, const char *fragment) {
    shader->program = glCreateProgram();
    glAttachShader(shader->program, compile_shader(GL_VERTEX_SHADER, vertex_source));
    glAttachShader(shader->program, compile_shader(GL_FRAGMENT_SHADER, fragment_source));
    glLinkProgram(shader->program);
    GLint ok;
    glGetProgramiv(shader->program, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[4096]; glGetProgramInfoLog(shader->program, sizeof(log), NULL, log);
        fprintf(stderr, "Shader link failed: %s\n", log); exit(1);
    }
}
'''
source += initializer + "\n"
source += r'''
static void pixel(int x, int y, unsigned char out[4]) {
    glReadPixels(x, y, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, out);
}
int main(void) {
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    CHECK(display != EGL_NO_DISPLAY && eglInitialize(display, NULL, NULL));
    CHECK(eglBindAPI(EGL_OPENGL_ES_API));
    const EGLint attributes[] = {
        EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, 0x0040,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
        EGL_NONE
    };
    EGLConfig config; EGLint count;
    CHECK(eglChooseConfig(display, attributes, &config, 1, &count) && count);
    const EGLint size[] = {EGL_WIDTH, 32, EGL_HEIGHT, 32, EGL_NONE};
    const EGLint version[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display, config, size);
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, version);
    CHECK(surface != EGL_NO_SURFACE && context != EGL_NO_CONTEXT);
    CHECK(eglMakeCurrent(display, surface, surface, context));
    printf("GLES renderer: %s\n", glGetString(GL_RENDERER));
    sprite_init_chipmunk();
    glUseProgram(sprite_shader.s.program);
    const GLfloat identity[] = {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};
    const GLfloat view[] = {2,0,0,0, 0,2,0,0, 0,0,1,0, -1,-1,0,1};
    glUniformMatrix4fv(glGetUniformLocation(sprite_shader.s.program, "world_transform"), 1, GL_FALSE, identity);
    glUniformMatrix4fv(glGetUniformLocation(sprite_shader.s.program, "view_transform"), 1, GL_FALSE, view);
    glUniform1f(sprite_shader.blend_rate, 1);
    glUniform3f(sprite_shader.multiply_color, 1, 1, 1);
    glUniform3f(sprite_shader.add_color, 0, 0, 0);
    glUniform2f(sprite_shader.bot_left, 0, 0);
    glUniform2f(sprite_shader.top_right, 1, 1);
    GLuint texture, buffer, vao;
    glGenTextures(1, &texture); glBindTexture(GL_TEXTURE_2D, texture);
    unsigned char color[] = {64, 128, 192, 255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, color);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glGenVertexArrays(1, &vao); glBindVertexArray(vao);
    glGenBuffers(1, &buffer); glBindBuffer(GL_ARRAY_BUFFER, buffer);
    const GLfloat vertices[] = {
        0,0,0,1, 0,0,  1,0,0,1, 1,0,
        0,1,0,1, 0,1,  1,1,0,1, 1,1
    };
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
    GLint pos = glGetAttribLocation(sprite_shader.s.program, "vertex_pos");
    GLint uv = glGetAttribLocation(sprite_shader.s.program, "vertex_uv");
    glEnableVertexAttribArray(pos); glVertexAttribPointer(pos, 4, GL_FLOAT, GL_FALSE, 6 * sizeof(float), 0);
    glEnableVertexAttribArray(uv); glVertexAttribPointer(uv, 2, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void *)(4 * sizeof(float)));
    glViewport(0, 0, 32, 32); glClearColor(0, 0, 0, 1); glClear(GL_COLOR_BUFFER_BIT);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    unsigned char center[4], corner[4]; pixel(16, 16, center); pixel(2, 2, corner);
    printf("Legacy sprite pixels: center=(%u,%u,%u,%u), corner=(%u,%u,%u,%u)\n",
        center[0],center[1],center[2],center[3],corner[0],corner[1],corner[2],corner[3]);
    CHECK(center[0] == 64 && center[1] == 128 && center[2] == 192);
    CHECK(corner[0] == 64 && corner[1] == 128 && corner[2] == 192);
    /* The shared Parts crop optimization must still render only its slice. */
    glUniform4f(glGetUniformLocation(sprite_shader.s.program, "uv_rect"), .25f, .25f, .5f, .5f);
    glClear(GL_COLOR_BUFFER_BIT); glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    pixel(16, 16, center); pixel(2, 2, corner);
    CHECK(center[0] == 64 && center[1] == 128 && center[2] == 192);
    CHECK(!corner[0] && !corner[1] && !corner[2]);
    CHECK(glGetError() == GL_NO_ERROR);
    puts("PASS: legacy sprite covers full quad; shared Parts UV crop still works.");
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroyContext(display, context); eglDestroySurface(display, surface); eglTerminate(display);
    return 0;
}
'''
cfile = build / "legacy-sprite-gles-test.c"
cfile.write_text(source, encoding="utf8")
binary = build / "legacy-sprite-gles-test"
compiler = root.parent / "android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe"
subprocess.run([
    str(compiler), "--target=aarch64-linux-android28", "-std=gnu11", "-O1",
    "-Werror", str(cfile), "-o", str(binary), "-lEGL", "-lGLESv3",
], check=True, env={**os.environ, "TEMP": str(build), "TMP": str(build)})
adb = [str(root.parent / "android-build/sdk/platform-tools/adb.exe"), "-s", args.serial]
remote = "/data/local/tmp/xsystem4-legacy-sprite-gles-test"
subprocess.run(adb + ["push", str(binary), remote], check=True)
subprocess.run(adb + ["shell", "chmod", "700", remote], check=True)
subprocess.run(adb + ["shell", remote], check=True)
