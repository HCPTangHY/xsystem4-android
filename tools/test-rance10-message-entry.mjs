import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = fs.readFileSync(path.join(root, 'xsystem4/subprojects/libsys4/src/ain.c'), 'utf8');
const start = text.indexOf('static void resolve_message_function(');
let end = text.indexOf('{', start), depth = 0;
do { if (text[end] === '{') depth++; if (text[end] === '}') depth--; end++; } while (depth);
const source = `
#define AIN_VOID 0
#define AIN_INT 10
#define AIN_STRING 12
struct type {int data;};
struct var {struct type type;};
struct ain_function {struct type return_type;int nr_args;struct var *vars;};
struct ain {int version,msgf;struct {int present;} MSGF;struct ain_function *functions;};
static int found;
int ain_get_function(struct ain *ain,const char *name){(void)ain;(void)name;return found;}
${text.slice(start, end)}
#define CHECK(c) do{if(!(c))return __LINE__;}while(0)
int run_tests(void){
 struct var vars[3]={{{AIN_INT}},{{AIN_INT}},{{AIN_STRING}}};
 struct ain_function fn[2]={{{AIN_VOID},0,0},{{AIN_VOID},3,vars}};
 struct ain ain={12,-1,{0},fn};found=1;
 resolve_message_function(&ain);CHECK(ain.msgf==1);
 ain.msgf=0;ain.MSGF.present=1;resolve_message_function(&ain);CHECK(ain.msgf==0);
 ain.MSGF.present=0;ain.version=11;ain.msgf=-1;resolve_message_function(&ain);CHECK(ain.msgf==-1);
 ain.version=12;found=-1;resolve_message_function(&ain);CHECK(ain.msgf==-1);
 found=1;fn[1].nr_args=2;resolve_message_function(&ain);CHECK(ain.msgf==-1);
 fn[1].nr_args=3;vars[2].type.data=AIN_INT;resolve_message_function(&ain);CHECK(ain.msgf==-1);
 vars[2].type.data=AIN_STRING;fn[1].return_type.data=AIN_INT;resolve_message_function(&ain);CHECK(ain.msgf==-1);
 fn[1].return_type.data=AIN_VOID;resolve_message_function(&ain);CHECK(ain.msgf==1);
 return 0;
}
`;
const build = path.join(root, 'build/rance10-tests');
fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, 'message-entry-test.c'), source);
const compiler = process.env.RANCE10_TEST_CLANG || path.resolve(root, '../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm = path.join(build, 'message-entry-test.wasm');
const result = spawnSync(compiler, ['--target=wasm32-unknown-unknown','-x','c','-std=gnu11','-O1','-fno-builtin','-nostdlib','-Werror','-Wl,--no-entry','-Wl,--export=run_tests','-o',wasm,'-'], { input: source, encoding: 'utf8', env: {...process.env,TEMP:build,TMP:build} });
assert.equal(result.status, 0, result.stderr || result.stdout);
const {instance} = await WebAssembly.instantiate(fs.readFileSync(wasm));
assert.equal(instance.exports.run_tests(), 0);
console.log('PASS: AIN 12 message callback resolution; explicit MSGF, older games and invalid signatures preserved.');
