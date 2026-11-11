"""Run the real 3D shaders and post-processing code in a separate GLES pbuffer.

No game is started, resumed or controlled. The device can remain asleep.
"""
from pathlib import Path
import argparse
import json
import os
import re
import shutil
import struct
import subprocess

p = argparse.ArgumentParser(description=__doc__)
target = p.add_mutually_exclusive_group(required=True)
target.add_argument('--serial')
target.add_argument('--angle-dir', type=Path, help='Run locally with existing Windows ANGLE DLLs')
p.add_argument('--rance8-settings', type=Path, help='Use the FilterY from an actual 3DSetting.asd')
args = p.parse_args()
root = Path(__file__).resolve().parent.parent
engine = root / 'xsystem4'
build = root / 'build/rance89-tests'
build.mkdir(parents=True, exist_ok=True)
settings_y = 0.0  # RanceQuest's zero-initialized CReignSetting.FilterY.
if args.rance8_settings:
    data = args.rance8_settings.read_bytes()
    assert data[:8] == b'VSF\0\0\0\0\0'
    values = []
    offset = 8
    while offset < len(data):
        tag = data[offset]
        offset += 1
        if tag == 3:
            end = data.index(0, offset)
            value = data[offset:end]
            offset = end + 1
        else:
            assert tag in (1, 2), tag
            value = struct.unpack_from('<f' if tag == 2 else '<i', data, offset)[0]
            offset += 4
        values.append(value)
    assert values[:2] == [b'RST', 7] and len(values) == 22
    settings_y = values[18]
    print('Rance 8 actual settings FilterY:', settings_y, flush=True)


def function(text, name):
    m = re.search(r'^[^\n;{}]*\b' + name + r'\([^;{}]*\)\s*\{', text, re.M)
    assert m, name
    end = text.index('{', m.start())
    depth = 0
    while True:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
        if not depth:
            return text[m.start():end] + '\n'


source = r'''
#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL %d: %s (GL %x)\n",__LINE__,#x,glGetError()); exit(1); } } while (0)
#ifndef max
#define max(a,b) ((a)>(b)?(a):(b))
#endif
#define RE_TAPIR_PLUGIN 1
struct texture { GLuint handle; int w, h; };
struct RE_renderer {
    GLuint post_program, post_vao, post_fbo;
    struct texture post_scene, post_glare[2];
    GLint hemi_light_dir, hemi_sky_color, hemi_mid_color, hemi_ground_color;
    GLint specular_light_dir, tonemap_param, tonemap_param2;
};
struct RE_plugin {
    int version, glare_mode;
    float glare_brightness[4];
    float post_effect_filter_y, post_effect_filter_cb, post_effect_filter_cr;
    float light_params[41];
    struct RE_renderer *renderer;
};
typedef float vec3[3];
static void glm_vec3_normalize(vec3 v) {
    float length=sqrtf(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    if(length)for(int i=0;i<3;i++)v[i]/=length;
}
static void glm_vec3_negate_to(vec3 v,vec3 out) { for(int i=0;i<3;i++)out[i]=-v[i]; }
static void gfx_delete_texture(struct texture *t) {
    if(t->handle)glDeleteTextures(1,&t->handle);
    memset(t,0,sizeof(*t));
}
static void gfx_init_texture_blank(struct texture *t,int w,int h) {
    t->w=w; t->h=h; glGenTextures(1,&t->handle);glBindTexture(GL_TEXTURE_2D,t->handle);
    glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,w,h,0,GL_RGBA,GL_UNSIGNED_BYTE,NULL);
    glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
}
'''
prefix = '#version 300 es\nprecision highp float;\nprecision highp int;\n'
for name in ['reign.v.glsl', 'reign.f.glsl', 'reign_post.v.glsl', 'reign_post.f.glsl']:
    var = name.replace('.', '_')
    source += 'static const char *' + var + ' = ' + json.dumps((engine / 'shaders' / name).read_text('utf8')) + ';\n'
source += 'static const char *prefix = ' + json.dumps(prefix) + ';\n'
source += 'static const float settings_y = ' + repr(settings_y) + 'f;\n'
source += r'''
static GLuint compile(GLenum type,const char *s,int engine) {
    char defines[200];snprintf(defines,sizeof(defines),"#define REIGN_ENGINE 0\n#define TAPIR_ENGINE 1\n#define SEAL_ENGINE 2\n#define ENGINE %d\n",engine);
    const char *strings[]={prefix,defines,s};
    GLuint shader=glCreateShader(type);glShaderSource(shader,3,strings,NULL);glCompileShader(shader);
    GLint ok;glGetShaderiv(shader,GL_COMPILE_STATUS,&ok);
    if(!ok){char log[8192];glGetShaderInfoLog(shader,sizeof(log),NULL,log);fprintf(stderr,"shader: %s\n",log);exit(1);}
    return shader;
}
static GLuint link_program(const char *v,const char *f,int engine) {
    GLuint program=glCreateProgram(),vs=compile(GL_VERTEX_SHADER,v,engine),fs=compile(GL_FRAGMENT_SHADER,f,engine);
    glAttachShader(program,vs);glAttachShader(program,fs);glLinkProgram(program);
    GLint ok;glGetProgramiv(program,GL_LINK_STATUS,&ok);
    if(!ok){char log[8192];glGetProgramInfoLog(program,sizeof(log),NULL,log);fprintf(stderr,"link: %s\n",log);exit(1);}
    glDeleteShader(vs);glDeleteShader(fs);return program;
}
static GLuint load_shader(const char *v,const char *f) {
    return link_program(reign_post_v_glsl,reign_post_f_glsl,1);
}
'''
renderer = (engine / 'src/3d/renderer.c').read_text('utf8')
header = (engine / 'include/reign.h').read_text('utf8')
source += re.search(r'enum seal_light_param\s*\{.*?\};', header, re.S)[0] + '\n'
for name in ['post_filter_exponent', 'post_target', 'post_sample', 'render_post_effects', 'setup_hemisphere_light', 'setup_tone_mapping']:
    if name == 'post_filter_exponent' and not re.search(r'\bpost_filter_exponent\(', renderer):
        continue  # Allow the same regression to demonstrate the old failure.
    source += function(renderer, name)
source += r'''
static void color_texture(struct texture *t,int w,int h,unsigned r,unsigned g,unsigned b) {
    gfx_delete_texture(t);gfx_init_texture_blank(t,w,h);
    unsigned char *pixels=malloc(w*h*4);
    for(int i=0;i<w*h;i++){pixels[i*4]=r;pixels[i*4+1]=g;pixels[i*4+2]=b;pixels[i*4+3]=255;}
    glTexSubImage2D(GL_TEXTURE_2D,0,0,0,w,h,GL_RGBA,GL_UNSIGNED_BYTE,pixels);free(pixels);
}
static void read_pixel(GLuint fbo,int x,int y,unsigned char p[4]) {
    glBindFramebuffer(GL_READ_FRAMEBUFFER,fbo);glReadPixels(x,y,1,1,GL_RGBA,GL_UNSIGNED_BYTE,p);
}
static void u1i(GLuint p,const char *n,int v){glUniform1i(glGetUniformLocation(p,n),v);}
static void u1f(GLuint p,const char *n,float v){glUniform1f(glGetUniformLocation(p,n),v);}
static void u3f(GLuint p,const char *n,float x,float y,float z){glUniform3f(glGetUniformLocation(p,n),x,y,z);}
static void u4f(GLuint p,const char *n,float x,float y,float z,float w){glUniform4f(glGetUniformLocation(p,n),x,y,z,w);}
static void attribute(GLuint p,const char *n,float x,float y,float z,float w){
    GLint a=glGetAttribLocation(p,n);if(a>=0){glDisableVertexAttribArray(a);glVertexAttrib4f(a,x,y,z,w);}
}
// The original PS 0x87 evaluates the rational polynomial using the packed
// (C*B,D*E,D*F,E/F) coefficients, then divides by its value at WhitePoint.
static double original_tone(double x,const float *lp) {
    double a=lp[2],b=lp[3],cb=(double)lp[4]*b,de=(double)lp[5]*lp[6];
    double df=(double)lp[5]*lp[7],ef=(double)lp[6]/lp[7],white=lp[1];
    x*=lp[0];
    double result=(x*(a*x+cb)+de)/(x*(a*x+b)+df)-ef;
    double norm=(white*(a*white+cb)+de)/(white*(a*white+b)+df)-ef;
    return result/norm;
}
static void seal_lighting_tests(GLuint p,GLuint fbo) {
    struct RE_renderer r={
        .hemi_light_dir=glGetUniformLocation(p,"hemi_light_dir"),
        .hemi_sky_color=glGetUniformLocation(p,"hemi_sky_color"),
        .hemi_mid_color=glGetUniformLocation(p,"hemi_mid_color"),
        .hemi_ground_color=glGetUniformLocation(p,"hemi_ground_color"),
        .specular_light_dir=glGetUniformLocation(p,"specular_light_dir"),
        .tonemap_param=glGetUniformLocation(p,"tonemap_param"),
        .tonemap_param2=glGetUniformLocation(p,"tonemap_param2")};
    // Original R9 Data/PolyData/BG/basho_01/basho_01.lit, first 33 fields.
    struct RE_plugin plugin={.renderer=&r,.light_params={
        .5999999046,.6099996567,.2199999988,.3000000119,.1000000015,.2000000030,.0099999998,.3000000119,
        -.5470371246,-.8286274076,-.1188570186,1.0677777529,1.0616666079,1.0694442987,
        .5089999437,.5067999363,.5407998562,.4877777696,.4877777696,.5255555511,
        .25,1.6599999666,.0500000007,200,-.5470371246,-.8286274076,-.1188570186,
        1.1377778053,1.0316666365,1.0394443274,.3877777755,.3877777755,.3855555058}};
    setup_hemisphere_light(&plugin);setup_tone_mapping(&plugin);
    float direction[3],propagation[3];glGetUniformfv(p,r.hemi_light_dir,direction);
    glGetUniformfv(p,r.specular_light_dir,propagation);
    for(int i=0;i<3;i++)CHECK(fabsf(direction[i]+propagation[i])<.00001);
    CHECK(direction[0]>0 && direction[1]>0 && direction[2]<0);
    u1i(p,"nolighting",0);u1i(p,"diffuse_type",1);
    const float ambient[]={.1,.05,0};const int texel[]={64,128,192};
    for(int sample=0;sample<3;sample++) {
        float n[3];
        if(sample==1){n[0]=-direction[1];n[1]=direction[0];n[2]=0;glm_vec3_normalize(n);}
        else for(int i=0;i<3;i++)n[i]=(sample==0?-1:1)*direction[i];
        attribute(p,"vertex_normal",n[0],n[1],n[2],0);
        for(int fog=0;fog<=1;fog++) {
            u1i(p,"fog_type",fog?2:0);
            u4f(p,"ls_params",.2,.1,.3,10);u3f(p,"ls_light_color",.8,.9,1);u3f(p,"ls_sun_color",0,0,0);
            glBindFramebuffer(GL_DRAW_FRAMEBUFFER,fbo);glDrawArrays(GL_TRIANGLES,0,3);
            unsigned char pixel[4];read_pixel(fbo,16,16,pixel);
            for(int c=0;c<3;c++) {
                double sky=plugin.light_params[11+c],mid=plugin.light_params[14+c],ground=plugin.light_params[17+c];
                double hemi=sample==0?ground:sample==2?sky:(ground+2*mid+sky)/4;
                double color=texel[c]/255.*hemi;
                if(fog)color*=exp(-.3*.5)*(.8+.1*c);
                color+=ambient[c]; // Original VS puts ambient into T7, after extinction.
                int expected=lround(fmin(1,fmax(0,original_tone(color,plugin.light_params)))*255);
                CHECK(abs((int)pixel[c]-expected)<=2);
            }
        }
    }
    CHECK(glGetError()==GL_NO_ERROR);
    puts("PASS: original R9 .lit hemisphere ground/middle/sky, light direction, tone mapping and ambient after scattering");
}
static void fog_tests(GLuint fbo) {
    GLuint program[3];
    for(int e=0;e<3;e++){
        program[e]=link_program(reign_v_glsl,reign_f_glsl,e);
        printf("PASS: engine %d real 3D shader compiles and links\n",e);
    }
    GLuint vao,vbo,ubo;glGenVertexArrays(1,&vao);glBindVertexArray(vao);
    glGenBuffers(1,&vbo);glBindBuffer(GL_ARRAY_BUFFER,vbo);
    const float vertices[]={-1,-1,-5, 3,-1,-5, -1,3,-5};
    glBufferData(GL_ARRAY_BUFFER,sizeof(vertices),vertices,GL_STATIC_DRAW);
    glGenBuffers(1,&ubo);glBindBuffer(GL_UNIFORM_BUFFER,ubo);glBufferData(GL_UNIFORM_BUFFER,308*48,NULL,GL_STATIC_DRAW);
    glBindBufferBase(GL_UNIFORM_BUFFER,0,ubo);
    struct texture tex={0};color_texture(&tex,1,1,64,128,192);
    unsigned char pix[4];
    for(int engine=1;engine<=2;engine++) {
        GLuint p=program[engine];glUseProgram(p);
        GLint a=glGetAttribLocation(p,"vertex_pos");glEnableVertexAttribArray(a);glVertexAttribPointer(a,3,GL_FLOAT,GL_FALSE,0,0);
        attribute(p,"vertex_color",1,1,1,1);attribute(p,"vertex_normal",0,0,1,0);
        attribute(p,"vertex_uv",0,0,0,0);attribute(p,"vertex_blend_weight",0,0,0,0);
        const float identity[]={1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};
        float proj[16];memcpy(proj,identity,sizeof(proj));proj[10]=0;
        for(int i=0;i<3;i++)glUniformMatrix4fv(glGetUniformLocation(p,i==0?"local_transform":i==1?"view_transform":"shadow_transform"),1,GL_FALSE,identity);
        glUniformMatrix4fv(glGetUniformLocation(p,"proj_transform"),1,GL_FALSE,proj);
        float normal[]={1,0,0,0,1,0,0,0,1};glUniformMatrix3fv(glGetUniformLocation(p,"normal_transform"),1,GL_FALSE,normal);
        GLuint block=glGetUniformBlockIndex(p,"BoneTransforms");glUniformBlockBinding(p,block,0);
        u4f(p,"uv_tiling",1,1,1,1);u1i(p,"has_bones",0);
        u1i(p,"tex",0);glActiveTexture(GL_TEXTURE0);glBindTexture(GL_TEXTURE_2D,tex.handle);
        // All active samplers must have a complete texture even in unselected branches.
        const char *samplers[]={"blend_tex","alpha_texture","light_texture","shadow_texture","normal_texture","specular_texture"};
        for(int i=0;i<6;i++)u1i(p,samplers[i],0);
        u3f(p,"diffuse_mod",1,1,1);u3f(p,"instance_ambient",.1,.05,0);u1f(p,"alpha_mod",1);
        u3f(p,"hemi_light_dir",0,0,1);u3f(p,"hemi_sky_color",1,1,1);u3f(p,"hemi_mid_color",1,1,1);u3f(p,"hemi_ground_color",1,1,1);
        u1i(p,"nolighting",1);u1i(p,"diffuse_type",1);u1i(p,"fog_type",1);
        u1f(p,"fog_near",0);u1f(p,"fog_far",10);u3f(p,"fog_color",.2,.4,.8);
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER,fbo);glViewport(0,0,32,32);glDisable(GL_BLEND);
        glDrawArrays(GL_TRIANGLES,0,3);read_pixel(fbo,16,16,pix);
        CHECK(abs((int)pix[0]-83)<=1);CHECK(abs((int)pix[1]-128)<=1);CHECK(abs((int)pix[2]-198)<=1);
        printf("PASS: engine %d linear fog pixel %u,%u,%u\n",engine,pix[0],pix[1],pix[2]);
        u1i(p,"fog_type",2);u4f(p,"ls_params",0,0,1,0);u3f(p,"ls_light_dir",0,0,0);u3f(p,"ls_light_color",1,1,1);u3f(p,"ls_sun_color",1,1,1);
        glDrawArrays(GL_TRIANGLES,0,3);read_pixel(fbo,16,16,pix);
        CHECK(abs((int)pix[0]-90)<=1 && abs((int)pix[1]-141)<=1 && abs((int)pix[2]-192)<=1);
        u4f(p,"ls_params",.2,.1,.3,10);u3f(p,"ls_light_dir",0,0,1);u3f(p,"ls_light_color",.8,.9,1);u3f(p,"ls_sun_color",.05,.04,.03);
        glDrawArrays(GL_TRIANGLES,0,3);read_pixel(fbo,16,16,pix);
        CHECK(pix[0]>40 && pix[0]<100 && pix[1]>80 && pix[1]<150 && pix[2]>130 && pix[2]<210);
        CHECK(glGetError()==GL_NO_ERROR);
        printf("PASS: engine %d scattering, including zero extinction/direction/distance, pixel %u,%u,%u\n",engine,pix[0],pix[1],pix[2]);
        if(engine==2)seal_lighting_tests(p,fbo);
        glDisableVertexAttribArray(a);
    }
    glUseProgram(0);glBindVertexArray(0);
    gfx_delete_texture(&tex);glDeleteBuffers(1,&vbo);glDeleteBuffers(1,&ubo);glDeleteVertexArrays(1,&vao);
    for(int i=0;i<3;i++)glDeleteProgram(program[i]);
}
int main(void) {
    EGLDisplay d=eglGetDisplay(EGL_DEFAULT_DISPLAY);CHECK(d!=EGL_NO_DISPLAY && eglInitialize(d,NULL,NULL));
    CHECK(eglBindAPI(EGL_OPENGL_ES_API));
    const EGLint attr[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,0x40,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
    EGLConfig cfg;EGLint n;CHECK(eglChooseConfig(d,attr,&cfg,1,&n)&&n);
    const EGLint size[]={EGL_WIDTH,64,EGL_HEIGHT,64,EGL_NONE},ver[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
    EGLSurface s=eglCreatePbufferSurface(d,cfg,size);EGLContext c=eglCreateContext(d,cfg,EGL_NO_CONTEXT,ver);
    CHECK(eglMakeCurrent(d,s,s,c));printf("GLES: %s\n",glGetString(GL_RENDERER));
    struct texture target={0};color_texture(&target,32,32,64,128,192);
    GLuint fbo;glGenFramebuffers(1,&fbo);glBindFramebuffer(GL_FRAMEBUFFER,fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
    CHECK(glCheckFramebufferStatus(GL_FRAMEBUFFER)==GL_FRAMEBUFFER_COMPLETE);
    fog_tests(fbo);
    color_texture(&target,32,32,64,128,192);glBindFramebuffer(GL_FRAMEBUFFER,fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
    struct RE_renderer r={0};struct RE_plugin p={.version=1,.renderer=&r,.post_effect_filter_y=1,.post_effect_filter_cb=1,.post_effect_filter_cr=1};
    unsigned char pix[4];render_post_effects(&p,&target,fbo);CHECK(!r.post_program);
    p.post_effect_filter_y=settings_y;
    render_post_effects(&p,&target,fbo);read_pixel(fbo,16,16,pix);
    printf("Rance 8 settings pixel: %u,%u,%u (source 64,128,192, FilterY %g)\n",pix[0],pix[1],pix[2],settings_y);
    CHECK(abs((int)pix[0]-64)<=1 && abs((int)pix[1]-128)<=1 && abs((int)pix[2]-192)<=1);
    puts("PASS: actual Rance 8 zero FilterY preserves scene brightness");
    p.post_effect_filter_y=2;render_post_effects(&p,&target,fbo);read_pixel(fbo,16,16,pix);
    CHECK(pix[0]>110 && pix[1]>170 && pix[2]>235);CHECK(glGetError()==GL_NO_ERROR);
    puts("PASS: YCbCr filter changes real pixels; identity bypass allocates nothing");
    // Positive exponents retain the original shader's full range, including
    // white when Y < 1. Zero/non-finite overrides must not enter pow().
    const float invalid[]={0,-1,NAN,INFINITY,-INFINITY};
    for(int i=0;i<5;i++) {
        p.post_effect_filter_y=p.post_effect_filter_cb=p.post_effect_filter_cr=invalid[i];
        color_texture(&target,32,32,64,128,192);glBindFramebuffer(GL_FRAMEBUFFER,fbo);
        glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
        render_post_effects(&p,&target,fbo);read_pixel(fbo,16,16,pix);
        CHECK(pix[0]==64 && pix[1]==128 && pix[2]==192);
        CHECK(isnan(invalid[i])?isnan(p.post_effect_filter_y):p.post_effect_filter_y==invalid[i]);
    }
    p.post_effect_filter_cb=p.post_effect_filter_cr=1;
    const float exponents[]={.1f,.5f,1,2};
    const int levels[]={0,1,64,128,192,254,255};
    for(int e=0;e<4;e++)for(int level=0;level<7;level++) {
        p.post_effect_filter_y=exponents[e];int v=levels[level];
        color_texture(&target,32,32,v,v,v);glBindFramebuffer(GL_FRAMEBUFFER,fbo);
        glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
        render_post_effects(&p,&target,fbo);read_pixel(fbo,16,16,pix);
        int expected=lround((1-pow(1-v/255.,exponents[e]))*255);
        for(int c=0;c<3;c++)CHECK(abs((int)pix[c]-expected)<=1);
    }
    CHECK(glGetError()==GL_NO_ERROR);
    puts("PASS: zero/invalid filters preserve RGB and API values; positive Y 0.1/0.5/1/2 matches original shader over black-to-white levels");
    p.post_effect_filter_y=1;p.glare_mode=1;p.glare_brightness[0]=-.05;p.glare_brightness[1]=.3;p.glare_brightness[3]=.45;
    color_texture(&target,32,32,64,128,192);glBindFramebuffer(GL_FRAMEBUFFER,fbo);glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
    render_post_effects(&p,&target,fbo);read_pixel(fbo,16,16,pix);
    CHECK(abs((int)pix[0]-99)<=2 && abs((int)pix[1]-163)<=2 && abs((int)pix[2]-227)<=2);
    printf("PASS: brightness + two blur passes + additive glare pixel %u,%u,%u\n",pix[0],pix[1],pix[2]);
    p.post_effect_filter_y=settings_y;
    color_texture(&target,32,32,64,128,192);glBindFramebuffer(GL_FRAMEBUFFER,fbo);glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
    render_post_effects(&p,&target,fbo);read_pixel(fbo,16,16,pix);
    CHECK(abs((int)pix[0]-99)<=2 && abs((int)pix[1]-163)<=2 && abs((int)pix[2]-227)<=2);
    puts("PASS: Rance 8 unset FilterY still permits glare");
    color_texture(&target,64,48,20,40,60);glBindFramebuffer(GL_FRAMEBUFFER,fbo);glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,target.handle,0);
    // Real scene rendering may leave another texture unit selected.
    glActiveTexture(GL_TEXTURE1);
    render_post_effects(&p,&target,fbo);CHECK(r.post_scene.w==64 && r.post_scene.h==48 && r.post_glare[0].w==16 && r.post_glare[0].h==12);
    CHECK(glGetError()==GL_NO_ERROR);puts("PASS: real post-processing code resizes its targets without GL errors");
    glDeleteProgram(r.post_program);glDeleteVertexArrays(1,&r.post_vao);glDeleteFramebuffers(1,&r.post_fbo);
    gfx_delete_texture(&r.post_scene);gfx_delete_texture(&r.post_glare[0]);gfx_delete_texture(&r.post_glare[1]);gfx_delete_texture(&target);glDeleteFramebuffers(1,&fbo);
    CHECK(glGetError()==GL_NO_ERROR);puts("PASS: 3D fog and post-processing checks complete");
    eglMakeCurrent(d,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);eglDestroyContext(d,c);eglDestroySurface(d,s);eglTerminate(d);return 0;
}
'''
cfile = build / 'rance89-gles-test.c'
cfile.write_text(source, encoding='utf8')
binary = build / 'rance89-gles-test'
compiler = root.parent / 'android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
if args.angle_dir:
    # Reuse the installed toolchain and ANGLE; do not start an app or a game.
    import pefile
    msvc = Path('E:/Program Files/Microsoft Visual Studio/18/Community/VC/Tools/MSVC/14.50.35717')
    sdk = Path('C:/Program Files (x86)/Windows Kits/10')
    sdk_version = '10.0.26100.0'
    includes = build / 'gles-include'
    for name in ('EGL', 'GLES3', 'KHR'):
        shutil.copytree(compiler.parents[1] / 'sysroot/usr/include' / name, includes / name, dirs_exist_ok=True)
    libtool = msvc / 'bin/Hostx64/x64/lib.exe'
    libraries = []
    for name in ('libEGL', 'libGLESv2'):
        dll = pefile.PE(str(args.angle_dir / (name + '.dll')))
        exports = [s.name.decode('ascii') for s in dll.DIRECTORY_ENTRY_EXPORT.symbols if s.name]
        definition = build / (name + '.def')
        definition.write_text('LIBRARY ' + name + '.dll\nEXPORTS\n' + '\n'.join(exports) + '\n', encoding='ascii')
        library = build / (name + '.lib')
        subprocess.run([str(libtool), '/nologo', '/machine:x64', '/def:' + str(definition), '/out:' + str(library)], check=True)
        libraries.append(str(library))
    binary = binary.with_suffix('.exe')
    env = {**os.environ,
           'INCLUDE': ';'.join(str(x) for x in [msvc / 'include', sdk / 'Include' / sdk_version / 'ucrt', sdk / 'Include' / sdk_version / 'shared', sdk / 'Include' / sdk_version / 'um']),
           'LIB': ';'.join(str(x) for x in [msvc / 'lib/x64', sdk / 'Lib' / sdk_version / 'ucrt/x64', sdk / 'Lib' / sdk_version / 'um/x64']),
           'PATH': str(args.angle_dir) + os.pathsep + os.environ['PATH'],
           'TEMP': str(build), 'TMP': str(build)}
    subprocess.run([str(msvc / 'bin/Hostx64/x64/cl.exe'), '/nologo', '/std:c11', '/O1', '/DNOMINMAX', '/D_CRT_SECURE_NO_WARNINGS',
                    '/I' + str(includes), str(cfile), '/Fo' + str(build / 'rance89-gles-test.obj'), '/Fe' + str(binary),
                    '/link', *libraries], check=True, env=env)
    subprocess.run([str(binary)], check=True, env=env)
    raise SystemExit(0)
subprocess.run([str(compiler), '--target=aarch64-linux-android28', '-std=gnu11', '-O1', '-Werror', str(cfile), '-o', str(binary), '-lEGL', '-lGLESv3', '-lm'], check=True,
               env={**os.environ, 'TEMP': str(build), 'TMP': str(build)})
adb = [str(root.parent / 'android-build/sdk/platform-tools/adb.exe'), '-s', args.serial]
remote = '/data/local/tmp/xsystem4-rance89-gles-test'
try:
    subprocess.run(adb + ['push', str(binary), remote], check=True)
    subprocess.run(adb + ['shell', 'chmod', '700', remote], check=True)
    subprocess.run(adb + ['shell', remote], check=True)
finally:
    subprocess.run(adb + ['shell', 'rm', '-f', remote], check=True)
