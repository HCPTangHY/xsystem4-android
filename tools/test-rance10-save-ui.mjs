// Exercise production save metadata, process variables and editable textbox code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),build=path.join(root,'build/rance10-tests');
const read=p=>fs.readFileSync(path.join(root,'xsystem4',p),'utf8').replace(/\r\n/g,'\n');
function fn(file,name){const s=read(file),m=new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`,'m').exec(s);assert.ok(m,name);let end=s.indexOf('{',m.index),d=0;do{d+=(s[end]==='{')-(s[end]==='}');end++;}while(d);return s.slice(m.index,end);}
const variables=read('src/hll/SystemService.c');
const textbox=read('src/parts/input.c');
const source=String.raw`
typedef unsigned size_t;typedef unsigned uint32_t;typedef _Bool bool;
#define NULL ((void*)0)
#define true 1
#define false 0
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
size_t strlen(const char *s){size_t n=0;while(s[n])n++;return n;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
void *memcpy(void *d,const void *s,size_t n){char *a=d;const char *b=s;while(n--)*a++=*b++;return d;}
void *memmove(void *d,const void *s,size_t n){char *a=d;const char *b=s;if(a>b){while(n){n--;a[n]=b[n];}}else memcpy(d,s,n);return d;}
int memcmp(const void *a,const void *b,size_t n){const unsigned char *x=a,*y=b;while(n--){if(*x!=*y)return *x-*y;x++;y++;}return 0;}
void *memset(void *d,int c,size_t n){char *p=d;while(n--)*p++=c;return d;}
static union{long long align;char bytes[65536];}arena;size_t used;
void *xmalloc(size_t n){char *p=arena.bytes+used;used+=(n+sizeof(size_t)+7)&~7;if(used>sizeof(arena))__builtin_trap();*(size_t*)p=n;return p+sizeof(size_t);}
void *xcalloc(size_t n,size_t s){void *p=xmalloc(n*s);return memset(p,0,n*s);}
void free(void *p){(void)p;}
void *xrealloc(void *p,size_t n){void *q=xmalloc(n);if(p){size_t old=((size_t*)p)[-1];memcpy(q,p,old<n?old:n);}return q;}
char *xstrdup(const char *s){return memcpy(xmalloc(strlen(s)+1),s,strlen(s)+1);}
struct string{int size,ref;char text[1];};
struct string EMPTY_STRING={0,1,{0}};
struct string *make_string(const char *s,int n){struct string *p=xmalloc(sizeof(*p)+n);p->size=n;p->ref=1;memcpy(p->text,s,n);p->text[n]=0;return p;}
struct string *cstr_to_string(const char *s){return make_string(s,strlen(s));}
struct string *string_ref(struct string *s){if(!s||s->ref<1)__builtin_trap();s->ref++;return s;}
void free_string(struct string *s){if(!s||s->ref<1)__builtin_trap();s->ref--;}
struct string *string_dup(struct string *s){return make_string(s->text,s->size);}
void string_append_cstr(struct string **p,const char *s,int n){struct string *q=make_string((*p)->text,(*p)->size+n);memcpy(q->text+(*p)->size,s,n);free_string(*p);*p=q;}
int char_bytes(const char *s){return (unsigned char)*s>=0x81&&s[1]?2:1;}
int sjis_count_char(const char *s){int n=0;while(*s){s+=char_bytes(s);n++;}return n;}
struct string *string_copy(struct string *s,int start,int n){int a=0,b=0;while(start--&&s->text[a])a+=char_bytes(s->text+a);b=a;while(n--&&s->text[b])b+=char_bytes(s->text+b);return make_string(s->text+a,b-a);}
void string_pop_back(struct string **p){int n=sjis_count_char((*p)->text);struct string *q=string_copy(*p,0,n?n-1:0);free_string(*p);*p=q;}
char *utf2gbk(const char *s,int n){(void)n;return xstrdup(s);}
`+variables.slice(variables.indexOf('static struct { struct string *key, *value; }'),variables.indexOf('static int SystemService_GetMixerName'))+String.raw`
struct parts_message_window{bool read_only;int max_length;struct string *source;};
struct parts{int no,component_type_override;struct parts_message_window *message;};
struct parts editor;int changes,starts,stops;bool ctrl;
enum{PARTS_MSG_CHANGED=21,VK_CONTROL=17,VK_RETURN=13,VK_BACK=8,VK_DELETE=46};
struct parts *parts_try_get(int no){return no&&no==editor.no?&editor:NULL;}
void PE_SetMessageWindowText(int no,struct string *s,int a,struct string *b,int c,int d){if(no!=editor.no)__builtin_trap();free_string(editor.message->source);editor.message->source=string_ref(s);}
void PE_FixMessageWindowText(int no){if(no!=editor.no)__builtin_trap();}
void parts_msg_push(struct parts *p,int type,const char *fmt){if(p!=&editor||type!=PARTS_MSG_CHANGED||*fmt)__builtin_trap();changes++;}
bool key_is_down(int k){return k==VK_CONTROL&&ctrl;}
char *SDL_GetClipboardText(void){return xstrdup("paste");}
void SDL_free(void *p){free(p);}
void(*input_handler)(const char*);void(*editing_handler)(const char*,int,int);void(*key_handler)(int);
void register_input_handler(void(*f)(const char*)){input_handler=f;}void clear_input_handler(void){input_handler=NULL;}
void register_editing_handler(void(*f)(const char*,int,int)){editing_handler=f;}void clear_editing_handler(void){editing_handler=NULL;}
void register_key_handler(void(*f)(int)){key_handler=f;}void clear_key_handler(void){key_handler=NULL;}
void SDL_StartTextInput(void){starts++;}void SDL_StopTextInput(void){stops++;}
`+textbox.slice(textbox.indexOf('static int textbox_focus_no;'),textbox.indexOf('static bool parts_hittest'))+String.raw`
typedef struct{unsigned char bytes[4096];size_t size,pos;}FILE;
FILE metadata;bool base_exists=true,metadata_exists;int legacy_reads;
int save_path_calls;bool copy_ok=true;
#define WARNING(...) ((void)0)
char *savedir_path(const char *s){save_path_calls++;return xstrdup(s);}
bool file_copy(const char *src,const char *dest){if(strcmp(src,"Thumb9999.qnt")||strcmp(dest,"Thumb0002.qnt"))__builtin_trap();return copy_ok;}
bool file_exists(const char *s){return base_exists;}
int sprintf(char *out,const char *fmt,const char *s){if(strcmp(fmt,"%s.comment"))__builtin_trap();size_t n=strlen(s);memcpy(out,s,n);memcpy(out+n,".comment",9);return n+8;}
FILE *file_open_utf8(const char *s,const char *mode){if(mode[0]=='w'){metadata.size=metadata.pos=0;metadata_exists=true;}else{if(!metadata_exists)return NULL;metadata.pos=0;}return &metadata;}
size_t fwrite(const void *p,size_t n,size_t count,FILE *f){size_t bytes=n*count;if(f->pos+bytes>sizeof(f->bytes))return 0;memcpy(f->bytes+f->pos,p,bytes);f->pos+=bytes;f->size=f->pos;return count;}
size_t fread(void *p,size_t n,size_t count,FILE *f){if(f->pos+n*count>f->size)return 0;memcpy(p,f->bytes+f->pos,n*count);f->pos+=n*count;return count;}
int fclose(FILE *f){return 0;}
bool read_legacy_group_save_comment(struct string *a,struct string *b,struct string **c){legacy_reads++;return false;}
`+['group_comment_path','write_group_save_comment','read_group_save_comment'].map(n=>fn('src/savedata.c',n)).join('\n')+'\n'+fn('src/hll/NewerLibs.c','System_CopySaveFile')+String.raw`
int run_tests(void){
 struct string *key=cstr_to_string("ResetLoadTargetIndex"),*value=cstr_to_string("1");
 SystemService_GameVariable_Set(key,value);free_string(value);CHECK(value->ref==1&&SystemService_GameVariable_IsExist(key));
 value=SystemService_GameVariable_Get(key);CHECK(!strcmp(value->text,"1"));free_string(value);
 value=cstr_to_string("2");SystemService_GameVariable_Set(key,value);free_string(value);CHECK(SystemService_GameVariable_NumofKey()==1);
 struct string *other=cstr_to_string("other");SystemService_GameVariable_Set(other,key);free_string(key);free_string(other);
 key=SystemService_GameVariable_GetKey(0);CHECK(!strcmp(key->text,"ResetLoadTargetIndex"));SystemService_GameVariable_Erase(key);free_string(key);
 CHECK(SystemService_GameVariable_NumofKey()==1);key=SystemService_GameVariable_GetKey(0);CHECK(!strcmp(key->text,"other"));SystemService_GameVariable_Erase(key);free_string(key);
 key=cstr_to_string("missing");value=SystemService_GameVariable_Get(key);CHECK(!value->size);free_string(value);SystemService_GameVariable_Erase(key);
 struct parts_message_window message={.source=string_ref(&EMPTY_STRING),.max_length=4};editor=(struct parts){7,8,&message};
 parts_textbox_focus(7);CHECK(starts==1&&input_handler&&key_handler&&editing_handler&&parts_textbox_has_focus(7));
 input_handler("A\xd6\xd0");CHECK(message.source->size==3&&changes==1);
 key_handler(VK_BACK);CHECK(!strcmp(message.source->text,"A")&&changes==2);
 editing_handler("composition",0,0);key_handler(VK_BACK);CHECK(changes==2);
 input_handler("B");key_handler(VK_RETURN);CHECK(!strcmp(message.source->text,"AB\n"));
 input_handler("XYZ");CHECK(!strcmp(message.source->text,"AB\nX"));
 ctrl=true;key_handler('A');key_handler('V');ctrl=false;CHECK(!strcmp(message.source->text,"past"));
 ctrl=true;key_handler('A');ctrl=false;key_handler(VK_DELETE);CHECK(!message.source->size);
 parts_textbox_focus(0);CHECK(stops==1&&!input_handler&&!editing_handler&&!key_handler);
 message.read_only=true;parts_textbox_focus(7);CHECK(starts==1&&!parts_textbox_has_focus(7));
 key=cstr_to_string("rance10");struct string *file=cstr_to_string("LocalSave00.asd");value=cstr_to_string("0|0|2|1|0|2026/10/16|\xd6\xd0\ntext");
 CHECK(write_group_save_comment(key,file,value));struct string *out=cstr_to_string("old");
 CHECK(read_group_save_comment(key,file,&out)&&out->size==value->size&&!strcmp(out->text,value->text));
 struct string *bad=cstr_to_string("bad-key");CHECK(!read_group_save_comment(bad,file,&out)&&!strcmp(out->text,value->text));
 metadata.size--;CHECK(!read_group_save_comment(key,file,&out)&&!strcmp(out->text,value->text));
 CHECK(write_group_save_comment(key,file,&EMPTY_STRING)&&read_group_save_comment(key,file,&out)&&!out->size);
 base_exists=false;CHECK(!write_group_save_comment(key,file,value)&&!read_group_save_comment(key,file,&out));
 base_exists=true;metadata_exists=false;CHECK(!read_group_save_comment(key,file,&out)&&legacy_reads==1);
 struct string *thumb=cstr_to_string("Thumb0002.qnt"),*capture=cstr_to_string("Thumb9999.qnt");
 save_path_calls=0;CHECK(System_CopySaveFile(thumb,capture)&&save_path_calls==2);
 copy_ok=false;CHECK(!System_CopySaveFile(thumb,capture));
 return 0;
}
`;
fs.mkdirSync(build,{recursive:true});fs.writeFileSync(path.join(build,'save-ui-test.c'),source);
const compiler=path.resolve(root,'../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'),wasm=path.join(build,'save-ui-test.wasm');
const result=spawnSync(compiler,['--target=wasm32-unknown-unknown','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-x','c','-o',wasm,'-'],{input:source,encoding:'utf8',env:{...process.env,TEMP:build,TMP:build}});
assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
const {instance}=await WebAssembly.instantiate(fs.readFileSync(wasm));const line=instance.exports.run_tests();
assert.equal(line,0,`C assertion ${line}: ${source.split('\n')[line-1]}`);
console.log('PASS: production reset variables retain ownership outside the VM; textbox edit/IME/backspace/limits/change events; metadata Chinese/newline/empty round-trip, key mismatch and truncation safety.');
