/* Executes the production renderer on the Android device's GLES driver. */
#include <EGL/egl.h>
#include <math.h>
#include <unistd.h>
#include "../../xsystem4/src/anime4k.c"

static int failures;
#define CHECK(test, message) do { \
    bool ok = (test); \
    printf("%s: %s\n", ok ? "PASS" : "FAIL", message); \
    if (!ok) failures++; \
} while (0)

static struct a4k_file make_pass(const char *body, int w, int h)
{
    struct a4k_file f = {0};
    f.n_passes = 1;
    f.passes[0].body = strdup(body);
    f.passes[0].n_binds = 1;
    strcpy(f.passes[0].binds[0], "MAIN");
    strcpy(f.passes[0].save, "MAIN");
    alloc_rt(&f.main_out, "test-output", w, h);
    CHECK(compile_pass(&f.passes[0], "regression"), "test shader compiles");
    return f;
}

static void test_orientation(void)
{
    enum { W = 8, H = 6 };
    unsigned char input[W * H * 4], output[sizeof(input)];
    for (int y = 0; y < H; y++) {
        for (int x = 0; x < W; x++) {
            int p = (y * W + x) * 4;
            input[p] = 16 + x * 24;
            input[p + 1] = 24 + y * 32;
            input[p + 2] = (x + y) * 12;
            input[p + 3] = 255;
        }
    }
    struct a4k_rt source = {0};
    bool feature_float = g_use_float;
    g_use_float = false; /* Game input is RGBA8, uploaded as UNSIGNED_BYTE. */
    alloc_rt(&source, "input", W, H);
    g_use_float = feature_float;
    glBindTexture(GL_TEXTURE_2D, source.tex);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, W, H, GL_RGBA, GL_UNSIGNED_BYTE, input);
    struct a4k_file f = make_pass("vec4 hook() { return MAIN_tex(MAIN_pos); }", W, H);
    run_file(&f, source.tex, W, H);
    if (feature_float) {
        float pixels[W * H * 4];
        glReadPixels(0, 0, W, H, GL_RGBA, GL_FLOAT, pixels);
        for (int i = 0; i < W * H * 4; i++)
            output[i] = (unsigned char)lroundf(fminf(1.f, fmaxf(0.f, pixels[i])) * 255.f);
    } else {
        glReadPixels(0, 0, W, H, GL_RGBA, GL_UNSIGNED_BYTE, output);
    }
    CHECK(glGetError() == GL_NO_ERROR, "identity pass and readback have no GLES errors");
    CHECK(memcmp(input, output, sizeof(input)) == 0, "one intermediate pass preserves every pixel's position");
    free_file_state(&f);
    free_rt(&source);
}

static void test_signed_features(void)
{
    struct a4k_file features = make_pass("vec4 hook() { return vec4(-0.5, 1.5, 0.25, 1.0); }", 4, 4);
    struct a4k_file decode = make_pass(
        "vec4 hook() { vec4 f = MAIN_tex(MAIN_pos); return vec4(-f.r, f.g - 1.0, f.b, 1.0); }", 4, 4);
    run_file(&features, 0, 4, 4);
    /* Use an 8-bit output only for observing the signed feature texture. */
    glBindTexture(GL_TEXTURE_2D, decode.main_out.tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 4, 4, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
    run_file(&decode, features.main_out.tex, 4, 4);
    unsigned char output[4];
    glReadPixels(2, 2, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, output);
    CHECK(abs(output[0] - 128) <= 1 && abs(output[1] - 128) <= 1,
          "CNN features retain negative and greater-than-one values");
    free_file_state(&features);
    free_file_state(&decode);
}

/* Exercise the actual CNN chain beyond the former ten-frame shutdown,
 * updating the source texture as a click-driven scene change would. */
static void test_presentation_lifetime(void)
{
    enum { W = 16, H = 12 };
    unsigned char input[W * H * 4];
    struct a4k_rt source = {0};
    bool feature_float = g_use_float;
    g_use_float = false;
    alloc_rt(&source, "scene-change-input", W, H);
    g_use_float = feature_float;
    for (int mode = 1; mode <= 3; mode++) {
        anime4k_set_mode(mode);
        bool passed = true;
        for (int frame = 0; frame < 24; frame++) {
            unsigned char level = frame < 12 ? 192 : 64;
            for (int i = 0; i < W * H; i++) {
                input[i*4] = input[i*4+1] = input[i*4+2] = level;
                input[i*4+3] = 255;
            }
            glActiveTexture(GL_TEXTURE0);
            glBindTexture(GL_TEXTURE_2D, source.tex);
            glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, W, H, GL_RGBA, GL_UNSIGNED_BYTE, input);
            bool rendered = anime4k_render(source.tex, W, H, 0, 0, 128, 96);
            GLenum error = glGetError();
            if (!rendered || g_failed || error != GL_NO_ERROR) {
                printf("DETAIL: mode=%d frame=%d rendered=%d failed=%d error=0x%x\n", mode, frame, rendered, g_failed, error);
                passed = false;
                break;
            }
        }
        CHECK(passed, mode == 1 ? "x2 survives 24 frames and a scene change"
                              : mode == 2 ? "x4 survives 24 frames and a scene change"
                                          : "CuNNy2 survives 24 frames and a scene change");
    }
    free_rt(&source);
}

int main(int argc, char **argv)
{
    if (argc > 1 && chdir(argv[1]) != 0)
        return 2;
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    EGLint major, minor, count;
    if (!eglInitialize(display, &major, &minor))
        return 2;
    const EGLint config_attrs[] = {
        EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_NONE
    };
    EGLConfig config;
    eglChooseConfig(display, config_attrs, &config, 1, &count);
    const EGLint surface_attrs[] = {EGL_WIDTH, 128, EGL_HEIGHT, 96, EGL_NONE};
    const EGLint context_attrs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display, config, surface_attrs);
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, context_attrs);
    if (!eglMakeCurrent(display, surface, surface, context))
        return 2;
    printf("GPU: %s / %s\n", glGetString(GL_RENDERER), glGetString(GL_VERSION));
    g_vert_shader = glCreateShader(GL_VERTEX_SHADER);
    const char *source = VERTEX_SHADER;
    glShaderSource(g_vert_shader, 1, &source, NULL);
    CHECK(compile_shader(g_vert_shader, "vertex"), "vertex shader compiles");
    const char *exts = (const char *)glGetString(GL_EXTENSIONS);
    g_use_float = exts && strstr(exts, "EXT_color_buffer_float");
    test_orientation();
    if (g_use_float)
        test_signed_features();
    else
        printf("SKIP: signed-feature test requires float render targets\n");
    test_presentation_lifetime();
    CHECK(glGetError() == GL_NO_ERROR, "no GLES errors");
    printf("RESULT: %d failure(s)\n", failures);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroyContext(display, context);
    eglDestroySurface(display, surface);
    eglTerminate(display);
    return failures ? 1 : 0;
}
