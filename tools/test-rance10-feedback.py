"""Production regressions for backlog fonts and checkbox assets."""
from pathlib import Path
import ast
import sys
helper=Path(__file__).with_name('test-rance10-review-controls.py').read_text(encoding='utf8')
exec(helper[:helper.index('names = ')])
tree=ast.parse(helper)
exec(ast.get_source_segment(helper,next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='run')))
run_case = run
def run(name, code):
 if len(sys.argv) == 1 or name in sys.argv[1:]:
  run_case(name, code)

source=base+r"""
#define ASSET_CG 0
#define NOTICE(...) ((void)0)
typedef unsigned long long uint64_t;
struct cg_metrics{int w,h;};
struct cg{int type;struct cg_metrics metrics;void *pixels;};
struct archive_data{int no;};
void *assets[1]={(void*)1};int reads,decodes;bool missing;
struct archive_data data={7};
enum{FP_CG_DECODE=1};static unsigned long long fp_now(void){return 0;}static void fp_add(int c,unsigned long long s,const char *l){(void)c;(void)s;(void)l;}
struct archive_data *asset_get_by_name(int type,const char *name,int *id){reads++;if(missing)return NULL;if(id)*id=7;return &data;}
struct cg *cg_load_data(struct archive_data *d){decodes++;struct cg *c=xcalloc(1,sizeof(*c));c->metrics=(struct cg_metrics){2,4};c->pixels=xcalloc(32,1);((char*)c->pixels)[0]=42;return c;}
void archive_free_data(struct archive_data *d){}
void cg_free(struct cg *c){if(c){free(c->pixels);free(c);}}
void log_decoded_cg(const char *s,struct cg *c){}
int snprintf(char *d,size_t n,const char *fmt,...){if(n)*d=0;return 0;}
"""
asset=read('src/asset_manager.c')
if 'struct decoded_cg_entry {' in asset:
 source+=asset[asset.index('struct decoded_cg_entry {'):asset.index('bool asset_manager_load_archive(')].replace('64u * 1024 * 1024','64u')
source+=function('src/asset_manager.c','asset_cg_load_by_name')
source+=r"""
int run_tests(void){int id=-1;struct cg *a=asset_cg_load_by_name("portrait-a",&id);CHECK(a&&id==7);
 ((char*)a->pixels)[0]=1;cg_free(a);
 struct cg *b=asset_cg_load_by_name("portrait-a",&id);CHECK(b&&((char*)b->pixels)[0]==42);cg_free(b);
 b=asset_cg_load_by_name("portrait-a",NULL);cg_free(b);CHECK(reads==1&&decodes==1);
"""
if 'struct decoded_cg_entry {' in asset:
 source+=r"""
 b=asset_cg_load_by_name("portrait-b",NULL);cg_free(b);
 b=asset_cg_load_by_name("portrait-a",NULL);cg_free(b);
 b=asset_cg_load_by_name("portrait-c",NULL);cg_free(b);CHECK(decoded_cg_bytes<=64);
 int before=decodes;b=asset_cg_load_by_name("portrait-a",NULL);cg_free(b);CHECK(decodes==before);
 b=asset_cg_load_by_name("portrait-b",NULL);cg_free(b);CHECK(decodes==before+1);
 decoded_cg_cache_clear();CHECK(decoded_cg_bytes==0);
 before=decodes;b=asset_cg_load_by_name("portrait-a",NULL);cg_free(b);CHECK(decodes==before+1);
 missing=true;before=reads;CHECK(!asset_cg_load_by_name("missing",NULL));CHECK(!asset_cg_load_by_name("missing",NULL));CHECK(reads==before+2);
 decoded_cg_cache_clear();
"""
source+='return 0;}'
run('portrait-decoded-cache',source)

source=base+r"""
typedef struct {unsigned char r,g,b,a;} SDL_Color;
struct text_style{unsigned face;float size,bold_width;unsigned weight;float edge_left,edge_up,edge_right,edge_down;SDL_Color color,edge_color;};
struct parts_text{struct text_style ts;int line_space;};
#define PARTS_TEXT 3
struct parts{struct{int type;struct parts_text text;}states[3];} item;
struct parts *parts_try_get(int no){return no==7?&item:NULL;}
struct parts *parts_get(int no){return &item;}
struct parts_text *parts_get_text(struct parts *p,int state){p->states[state].type=PARTS_TEXT;return &p->states[state].text;}
bool parts_state_valid(int state){return state>=0&&state<3;}
void parts_text_rerender(struct parts *p,struct parts_text *t){}
void text_style_set_edge_width(struct text_style *t,float v){t->edge_left=t->edge_right=t->edge_up=t->edge_down=v;}
float text_style_edge_width(struct text_style *t){return max(max(t->edge_left,t->edge_right),max(t->edge_up,t->edge_down));}
int child_no,parent_no;void PE_SetParentPartsNumber(int c,int p){child_no=c;parent_no=p;}
"""
for name in ('PE_SetFont','PE_SetTextLineSpace','PE_GetPartsTextFontProperty','PE_GetTextLineSpace'):
 source+=function('src/parts/text.c',name)
source+=function('src/hll/PartsEngine.c','PartsEngine_AddChild')
source+=r"""
int run_tests(void){
 CHECK(PE_SetFont(7,256,23,255,240,200,.5f,1,2,3,1.25f,1));PE_SetTextLineSpace(7,10,1);
 int face=0,size=0,r=0,g=0,b=0,er=0,eg=0,eb=0;float bold=0,edge=0;
 PE_GetPartsTextFontProperty(7,&face,&size,&r,&g,&b,&bold,&er,&eg,&eb,&edge,1);
 CHECK(face==256&&size==23&&r==255&&g==240&&b==200&&bold==.5f&&er==1&&eg==2&&eb==3&&edge==1.25f);
 CHECK(PE_GetTextLineSpace(7,1)==10&&PE_GetTextLineSpace(7,0)==0&&PE_GetTextLineSpace(8,1)==0);
 PE_GetPartsTextFontProperty(7,&face,&size,&r,&g,&b,&bold,&er,&eg,&eb,&edge,0);CHECK(size==23);
 PartsEngine_AddChild(71,72);CHECK(parent_no==71&&child_no==72);return 0;
}
"""
run('backlog-font-parent',source)

source=base+r"""
#define ASSET_FLAT 4
struct parts{bool checkbox_checked;struct string *checkbox_flat,*checkbox_checked_flat;};
char *utf2gbk(const char *s,int unused){return strdup(s);} /* filenames only, byte-preserving fixture */
bool asset_exists_by_name(int type,const char *n,void *out){
 const char *names[]={"settings／一般.flat","settings／オン.flat","settings／DOWN.flat","settings／检查／一般.flat","settings／检查／オン.flat","settings／检查／DOWN.flat","override.flat"};
 for(int i=0;i<7;i++)if(!strcmp(names[i],n))return true;return false;
}
"""
source+=function('src/hll/PartsActivity.inc','pa_checkbox_flat_name')
source+=r"""
int run_tests(void){
 struct parts p={.checkbox_flat=str("settings")};
 struct string *n=pa_checkbox_flat_name(&p,0);CHECK(!strcmp(n->text,"settings／一般.flat"));free_string(n);
 p.checkbox_checked=true;n=pa_checkbox_flat_name(&p,1);CHECK(!strcmp(n->text,"settings／检查／オン.flat"));free_string(n);
 n=pa_checkbox_flat_name(&p,2);CHECK(!strcmp(n->text,"settings／检查／DOWN.flat"));free_string(n);
 p.checkbox_checked_flat=str("override.flat");n=pa_checkbox_flat_name(&p,2);CHECK(!strcmp(n->text,"override.flat"));free_string(n);
 free_string(p.checkbox_checked_flat);p.checkbox_checked_flat=str("missing.flat");
 n=pa_checkbox_flat_name(&p,2);CHECK(!strcmp(n->text,"settings／一般.flat"));free_string(n);
 p.checkbox_flat=&EMPTY_STRING;CHECK(!pa_checkbox_flat_name(&p,0));return 0;
}
"""
run('checkbox-authored-states',source)

# Settings free-layout children may already use centered coordinates.
source=base+r"""
typedef struct{int x,y;} Point;
struct common{int w,h;Point origin_offset;};
struct parts_layout_box{struct common common;int layout_type,align;};
struct parts{struct parts *parent;struct{Point pos;}local;struct{int type;union{struct common common;struct parts_layout_box layout_box;};}states[1];};
struct{int version;} ain_fixture={12},*ain=&ain_fixture;
#define PARTS_LAYOUT_BOX 12
#define PARTS_LAYOUT_FREE 0
"""
source+=function('src/parts/parts.c','parts_layout_pos')
source+=r"""
int run_tests(void){
 struct parts parent={0},child={.parent=&parent};
 parent.states[0].type=PARTS_LAYOUT_BOX;parent.states[0].layout_box.layout_type=PARTS_LAYOUT_FREE;
 parent.states[0].common=(struct common){.w=768,.h=156,.origin_offset={-384,0}};
 parent.states[0].layout_box.align=2;child.local.pos=(Point){-40,4};
 Point p=parts_layout_pos(&child);CHECK(p.x==-424&&p.y==4);
 parent.states[0].common=(struct common){.w=208,.h=312,.origin_offset={-104,-156}};
 parent.states[0].layout_box.align=1;child.local.pos=(Point){0,0};
 p=parts_layout_pos(&child);CHECK(p.x==-104&&p.y==-156);
 parent.states[0].layout_box.align=5;p=parts_layout_pos(&child);CHECK(p.x==-104&&p.y==-156);
 parent.states[0].layout_box.align=9;parent.states[0].common.origin_offset=(Point){-208,-312};
 child.local.pos=(Point){-20,-30};p=parts_layout_pos(&child);CHECK(p.x==-228&&p.y==-342);
 ain->version=10;p=parts_layout_pos(&child);CHECK(p.x==-20&&p.y==-30);
 child.parent=NULL;p=parts_layout_pos(&child);CHECK(p.x==-20&&p.y==-30);return 0;
}
"""
run('free-layout-alignment',source)

# Repeating unchanged animation properties must not recurse into a subtree.
source=base+r"""
typedef struct{int x,y;} Point;
typedef struct{unsigned char r,g,b,a;} SDL_Color;
struct params{Point pos;int alpha;SDL_Color add_color,multiply_color;struct{float x,y;}scale;struct{float x,y,z;}rotation;};
struct parts{struct parts *parent;struct params local,global;};
struct{int version;} ain_fixture={12},*ain=&ain_fixture;struct params root_params;
int visits;
void parts_component_dirty(struct parts *p){visits++;}
void parts_recalculate_hitbox(struct parts *p){visits++;}
void parts_update_global_pos(struct parts *p,Point x){visits++;}
void parts_update_global_alpha(struct parts *p,int x){visits++;}
void parts_update_global_add_color(struct parts *p,SDL_Color x){visits++;}
void parts_update_global_multiply_color(struct parts *p,SDL_Color x){visits++;}
void parts_update_global_scale_x(struct parts *p,float x){visits++;}
void parts_update_global_scale_y(struct parts *p,float x){visits++;}
void parts_update_global_rotate_x(struct parts *p,float x){visits++;}
void parts_update_global_rotate_y(struct parts *p,float x){visits++;}
void parts_update_global_rotate_z(struct parts *p,float x){visits++;}
void parts_dirty(struct parts *p){visits++;}
"""
for name in ('parts_set_pos','parts_set_alpha','parts_set_add_color','parts_set_multiply_color','parts_set_scale_x','parts_set_scale_y','parts_set_rotation_x','parts_set_rotation_y','parts_set_rotation_z'):
 source+=function('src/parts/parts.c',name)
source+=r"""
int run_tests(void){
 struct parts parent={0},p={.parent=&parent};
 for(int i=0;i<10000;i++){
  parts_set_pos(&p,(Point){0,0});parts_set_alpha(&p,0);
  parts_set_add_color(&p,(SDL_Color){0,0,0,0});parts_set_multiply_color(&p,(SDL_Color){0,0,0,0});
  parts_set_scale_x(&p,0);parts_set_scale_y(&p,0);
  parts_set_rotation_x(&p,0);parts_set_rotation_y(&p,0);parts_set_rotation_z(&p,0);
 }
 CHECK(visits==0);
 parts_set_pos(&p,(Point){12,34});CHECK(p.local.pos.x==12&&p.local.pos.y==34&&visits>0);
 visits=0;parts_set_alpha(&p,999);CHECK(p.local.alpha==255&&visits>0);
 visits=0;parts_set_alpha(&p,999);CHECK(visits==0);
 parts_set_add_color(&p,(SDL_Color){1,2,3,0});CHECK(p.local.add_color.g==2&&visits>0);
 visits=0;parts_set_multiply_color(&p,(SDL_Color){4,5,6,255});CHECK(p.local.multiply_color.b==6&&visits>0);
 visits=0;parts_set_scale_x(&p,2);parts_set_scale_y(&p,3);CHECK(p.local.scale.x==2&&p.local.scale.y==3&&visits>0);
 visits=0;parts_set_rotation_x(&p,30);parts_set_rotation_y(&p,60);parts_set_rotation_z(&p,90);
 CHECK(p.local.rotation.x==30&&p.local.rotation.y==60&&p.local.rotation.z==90&&visits>0);return 0;
}
"""
run('unchanged-properties-no-traversal',source)

source=base.replace('union vm_value *data;unsigned size,pos;int error;', 'int *data;unsigned size,pos;int error;')+r"""
typedef struct{unsigned handle;int w,h;} Texture;
struct parts{int unused;};
struct parts_animation{struct{Texture texture;}common;Texture *frames;int nr_frames,frame_time,elapsed,current_frame;};
int iarray_read(struct iarray_reader *r){if(r->pos>=r->size){r->error=1;return 0;}return r->data[r->pos++];}
struct string *iarray_read_string_or_null(struct iarray_reader *r){return NULL;}
int loads;bool fail_load;
bool parts_animation_set_cg_by_index(struct parts *p,struct parts_animation *a,int start,int n,int time){
 loads++;if(fail_load)return false;a->frames=xcalloc(n,sizeof(Texture));a->nr_frames=n;a->frame_time=time;
 for(int i=0;i<n;i++)a->frames[i].handle=start+i;return true;
}
bool parts_animation_set_cg(struct parts *p,struct parts_animation *a,struct string *s,int start,int n,int time){return parts_animation_set_cg_by_index(p,a,start,n,time);}
"""
source+=function('src/parts/save.c','load_parts_animation')
source+=function('src/parts/parts.c','parts_animation_update')
source+=r"""
int run_tests(void){
 struct parts p={0};struct parts_animation a={0};int data[]={20,3,10,4,2};
 struct iarray_reader r={data,5,0,0};load_parts_animation(&r,&p,&a);
 CHECK(!r.error&&loads==1&&a.current_frame==2&&a.common.texture.handle==22);
 CHECK(!parts_animation_update(&a,5)&&a.elapsed==9);
 CHECK(parts_animation_update(&a,1)&&a.current_frame==0&&a.common.texture.handle==20);
 struct parts_animation empty={0};int zeros[]={0,0,0,0,0};r=(struct iarray_reader){zeros,5,0,0};
 load_parts_animation(&r,&p,&empty);CHECK(!r.error&&loads==1&&!parts_animation_update(&empty,16));
 int bad[][5]={{0,-1,10,0,0},{0,10001,10,0,0},{0,3,0,0,0},{0,3,10,0,3},{0,3,10,-1,0}};
 for(int i=0;i<5;i++){r=(struct iarray_reader){bad[i],5,0,0};load_parts_animation(&r,&p,&empty);CHECK(r.error&&loads==1);}
 for(int n=0;n<5;n++){r=(struct iarray_reader){data,n,0,0};load_parts_animation(&r,&p,&empty);CHECK(r.error&&loads==1);}
 fail_load=true;r=(struct iarray_reader){data,5,0,0};load_parts_animation(&r,&p,&empty);CHECK(r.error&&loads==2&&!empty.nr_frames);
 a.frame_time=0;CHECK(!parts_animation_update(&a,16));return 0;
}
"""
run('animation-restore-bounds',source)

source=base+r"""
struct parts_motion{int begin_time,end_time;struct parts_motion *next;};
struct parts_motion_list{struct parts_motion *first;};int motion_end_t;
#define TAILQ_FOREACH(p,l,e) for((p)=(l)->first;(p);(p)=(p)->next)
#define TAILQ_INSERT_BEFORE(p,m,e) do{struct parts_motion **q=&motion_list->first;while(*q!=(p))q=&(*q)->next;(m)->next=(p);*q=(m);}while(0)
#define TAILQ_INSERT_TAIL(l,m,e) do{struct parts_motion **q=&(l)->first;while(*q)q=&(*q)->next;*q=(m);(m)->next=NULL;}while(0)
"""
source+=function('src/parts/motion.c','parts_motion_list_add')
source+=r"""
int run_tests(void){struct parts_motion_list list={0};struct parts_motion later={100,200,0},longer={0,500,0},shorter={50,60,0};
 parts_motion_list_add(&list,&later);CHECK(motion_end_t==200);
 parts_motion_list_add(&list,&longer);CHECK(motion_end_t==500&&list.first==&longer);
 parts_motion_list_add(&list,&shorter);CHECK(motion_end_t==500&&longer.next==&shorter&&shorter.next==&later);return 0;}
"""
run('motion-insertion-duration',source)

# Exercise the real command dispatch and helper selection, not a duplicate map.
cp_header=read('src/parts/parts_internal.h')
cp_enum=cp_header[cp_header.index('enum parts_cp_op_type {'):cp_header.index('struct parts_cp_create {')]
source=base+cp_enum+r"""
int selected;
bool add_text_to_cproc(int p,int x,int y,struct string *s,int t,int size,int r,int g,int b,float bold,
 int er,int eg,int eb,float edge,int cs,int ls,int state,enum parts_cp_op_type op){selected=op;return true;}
"""
for name in ('PE_AddDrawTextToPartsConstructionProcess','PE_AddAlphaBlendTextToPartsConstructionProcess'):
 source+=function('src/parts/construction.c',name)
dispatch=function('src/hll/PartsEngine.c','PartsEngine_add_construction_process')
text_cases='\n'.join(re.search(r'\bcase '+str(n)+r':.*?\bbreak;',dispatch,re.S).group() for n in (7,23))
source+=r"""
void dispatch_text(int command){int parts_no=7,dx=1,dy=2,font_type=0,font_size=20,font_r=255,font_g=255,font_b=255;
 int edge_r=0,edge_g=0,edge_b=0,char_space=1,line_space=3,state=1;float bold_weight=0,edge_weight=1;struct string *text=&EMPTY_STRING;
 switch(command){
"""+text_cases+r"""
}}
int run_tests(void){dispatch_text(7);CHECK(selected==PARTS_CP_DRAW_TEXT);
 dispatch_text(23);CHECK(selected==PARTS_CP_ALPHA_BLEND_TEXT);
 CHECK(PARTS_CP_DRAW_TEXT==9&&PARTS_CP_DRAW_CUT_CG_MAX_ALPHA==14&&PARTS_CP_ALPHA_BLEND_TEXT==15);return 0;}
"""
run('construction-alpha-text-dispatch',source)

# The production glyph helper must update transparent alpha only in the new mode.
source=base+r"""
typedef struct{int handle,w,h;} Texture;
typedef struct{unsigned char r,g,b,a;} SDL_Color;
enum{GL_ZERO,GL_ONE,GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA,GL_FUNC_ADD,GL_MAX};
int src_alpha,dst_alpha,alpha_equation=GL_FUNC_ADD,shader_calls,restores;float alpha,draw_width;
struct copy_data{float width,r,g,b,a,threshold;};
#define STRETCH_DATA(dx,dy,dw,dh,sx,sy,sw,sh) ((struct copy_data){.width=(dw)})
struct{int s;} blend_rmap_color_shader,dilate_shader;
float roundf(float x){return (int)(x+.5f);}
void glBlendFuncSeparate(int sr,int dr,int sa,int da){src_alpha=sa;dst_alpha=da;}
void glBlendFunc(int s,int d){src_alpha=s;dst_alpha=d;}
void glBlendEquationSeparate(int r,int a){alpha_equation=a;}
void restore_blend_mode(void){restores++;alpha_equation=GL_FUNC_ADD;}
void run_copy_shader(int *s,Texture *dst,Texture *glyph,struct copy_data *data){
 float coverage=.5f;shader_calls++;draw_width=data->width;
 if(alpha_equation==GL_MAX)alpha=max(alpha,coverage);
 else alpha=coverage*(src_alpha==GL_ONE)+alpha*(dst_alpha==GL_ONE);
}
"""
for name in ('draw_glyph','gfx_draw_glyph','gfx_draw_glyph_alpha_blend'):
 source+=function('src/draw.c',name)
source+=r"""
int run_tests(void){Texture dst={1,100,100},glyph={2,12,20};SDL_Color color={255,255,255,255};
 alpha=0;gfx_draw_glyph(&dst,0,0,&glyph,color,.5f,0,true);CHECK(alpha==0&&draw_width==6);
 gfx_draw_glyph_alpha_blend(&dst,0,0,&glyph,color,.5f,0);CHECK(alpha==.5f&&draw_width==6);
 alpha=.8f;gfx_draw_glyph_alpha_blend(&dst,0,0,&glyph,color,1,2);CHECK(alpha==.8f);
 alpha=0;gfx_draw_glyph(&dst,0,0,&glyph,color,1,0,false);CHECK(alpha==.5f);
 CHECK(shader_calls==4&&restores==4&&alpha_equation==GL_FUNC_ADD);return 0;}
"""
run('construction-text-glyph-alpha',source)

# All construction text modes share newline layout without changing saved text.
source=base+cp_enum+r"""
typedef struct{int handle,w,h;} Texture;
typedef struct{unsigned char r,g,b,a;} SDL_Color;
struct text_style{float size,edge_up,edge_down;SDL_Color edge_color;};
struct parts_cp_text{struct string *text;int x,y,line_space;struct text_style style;};
struct parts_construction_process{struct{Texture texture;}common;};
float ceilf(float x){int n=x;return n<x?n+1:n;}
float text_style_height(struct text_style *s){return s->size+s->edge_up+s->edge_down;}
char *sjis_skip_char(const char *s){return (char*)s+(SJIS_2BYTE(*s)?2:1);}
int calls,ys[10],xs[10],modes[10],fills;struct string *lines[10];
int record(float x,int y,char *s,int mode){xs[calls]=x;ys[calls]=y;modes[calls]=mode;lines[calls++]=str(s);return 1;}
int gfx_render_text(Texture *t,float x,int y,char *s,struct text_style *style,bool blend){return record(x,y,s,blend?7:8);}
int gfx_render_text_alpha_blend(Texture *t,float x,int y,char *s,struct text_style *style){return record(x,y,s,23);}
float gfx_size_text(struct text_style *s,const char *t){return strlen(t);}
void gfx_fill_with_alpha(Texture *t,int x,int y,int w,int h,int r,int g,int b,int a){fills++;}
"""
source+=function('src/parts/construction.c','build_text')
source+=r"""
int run_tests(void){struct parts_construction_process c={.common.texture.handle=1};
 struct parts_cp_text op={.text=str("A\r\n\xB2\xE2\n\nB\rC"),.x=4,.y=10,.line_space=3,.style={.size=20,.edge_up=1,.edge_down=1}};
 CHECK(build_text(&c,&op,PARTS_CP_ALPHA_BLEND_TEXT));CHECK(calls==4);
 CHECK(ys[0]==10&&ys[1]==35&&ys[2]==85&&ys[3]==110);
 CHECK(xs[3]==4&&modes[0]==23&&modes[3]==23&&!strcmp(lines[1]->text,"\xB2\xE2"));
 CHECK(!strcmp(op.text->text,"A\r\n\xB2\xE2\n\nB\rC"));
 calls=0;CHECK(build_text(&c,&op,PARTS_CP_DRAW_TEXT));CHECK(calls==4&&modes[0]==7);
 calls=0;CHECK(build_text(&c,&op,PARTS_CP_COPY_TEXT));CHECK(calls==4&&modes[0]==8&&fills==4);
 calls=0;op.text=str("A\x81");CHECK(build_text(&c,&op,PARTS_CP_ALPHA_BLEND_TEXT));CHECK(calls==1&&!strcmp(lines[0]->text,"A"));
 c.common.texture.handle=0;CHECK(!build_text(&c,&op,PARTS_CP_ALPHA_BLEND_TEXT));return 0;}
"""
run('construction-text-newlines',source)
