import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Run the actual changed C helpers with a small instrumented heap, without Android.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'xsystem4');
const build = path.join(root, 'build', 'rance10-tests');
const read = name => fs.readFileSync(path.join(engine, name), 'utf8');
const ainHeader = read('subprojects/libsys4/include/system4/ain.h');

function functionSource(file, name) {
  const text = read(file);
  const match = new RegExp(`^(?:static )?[^\\n;{}]*\\b${name}\\([^;{}]*\\)\\s*\\{`, 'm').exec(text);
  assert.ok(match, `Missing C definition: ${name}`);
  const start = match.index;
  let end = text.indexOf('{', start), depth = 0;
  do {
    if (text[end] === '{') depth++;
    if (text[end] === '}') depth--;
    end++;
  } while (depth && end < text.length);
  assert.equal(depth, 0);
  return text.slice(start, end);
}

function macro(name) {
  const lines = ainHeader.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith(`#define ${name}\t`) || line.startsWith(`#define ${name} `));
  assert.ok(start >= 0, `Missing macro: ${name}`);
  let end = start;
  while (lines[end].endsWith('\\')) end++;
  return lines.slice(start, end + 1).join('\n');
}

const source = `
typedef int int32_t;
typedef _Bool bool;
#define true 1
#define false 0
#define NULL ((void*)0)
${ainHeader.match(/enum ain_data_type\s*\{[\s\S]*?\};/)[0]}
${macro('AIN_ARRAY_TYPE')}
${macro('AIN_REF_TYPE')}
union vm_value { int32_t i; float f; void *ref; };
enum { VM_PAGE, VM_STRING, ARRAY_PAGE = 4 };
struct string { int marker; };
struct string EMPTY_STRING;
struct page {
  int type, a_type;
  struct { int rank; } array;
  union vm_value values[2];
};
struct { struct page *page; struct string *s; int ref; } heap[32];
struct { struct { struct { int data; } type; } globals[1]; } program;
#define ain (&program)
static int next_slot, unrefs, exit_unrefs, copies, refs;
static struct page copied_page;
int heap_alloc_slot(int type) { (void)type; heap[next_slot].ref = 1; return next_slot++; }
void heap_set_page(int slot, struct page *page) { heap[slot].page = page; }
void heap_unref(int slot) { heap[slot].ref--; unrefs++; }
void exit_unref(int slot) { heap[slot].ref--; exit_unrefs++; }
void heap_ref(int slot) { heap[slot].ref++; refs++; }
struct page *heap_get_page(int slot) { return heap[slot].page; }
struct string *heap_get_string(int slot) { return heap[slot].s; }
struct string *string_ref(struct string *s) { return s; }
int vm_string_ref(struct string *s) { int slot = heap_alloc_slot(VM_STRING); heap[slot].s = s; return slot; }
int vm_copy_page(struct page *page) {
  int slot = heap_alloc_slot(VM_PAGE);
  if (page) { copied_page = *page; heap[slot].page = &copied_page; }
  else heap[slot].page = NULL;
  copies++;
  return slot;
}
${functionSource('src/page.c', 'variable_initval')}
${functionSource('src/page.c', 'variable_fini')}
${functionSource('src/vm.c', 'vm_copy')}
${functionSource('src/vm.c', 'global_set')}
${functionSource('src/hll/Array.c', 'array_is_int')}
#define CHECK(condition) do { if (!(condition)) return __LINE__; } while (0)
int run_tests(void) {
  next_slot = 1; unrefs = exit_unrefs = copies = refs = 0;
  struct page global = {0};
  heap[0].page = &global; heap[0].ref = 1;
  union vm_value first = variable_initval(AIN_ARRAY);
  CHECK(first.i > 0 && heap[first.i].page == NULL);
  CHECK(heap[0].page == &global && heap[0].ref == 1);
  union vm_value second = variable_initval(AIN_ARRAY);
  CHECK(second.i != first.i);
  variable_fini(first, AIN_ARRAY, true);
  CHECK(unrefs == 1 && heap[first.i].ref == 0);
  variable_fini(second, AIN_ARRAY, false);
  CHECK(exit_unrefs == 1 && heap[second.i].ref == 0);
  variable_fini((union vm_value){.i = -1}, AIN_ARRAY, true);
  CHECK(unrefs == 1);
  struct page array = {.type = ARRAY_PAGE, .a_type = AIN_ARRAY_INT, .array = {.rank = 1}};
  array.values[0].i = 42;
  union vm_value original = variable_initval(AIN_ARRAY);
  heap[original.i].page = &array;
  union vm_value copy = vm_copy(original, AIN_ARRAY);
  CHECK(copy.i != original.i && copies == 1);
  CHECK(heap[copy.i].page != &array && heap[copy.i].page->values[0].i == 42);
  union vm_value reference = vm_copy(original, AIN_REF_ARRAY);
  CHECK(reference.i == original.i && refs == 1 && heap[original.i].ref == 2);
  CHECK(array_is_int(&array));
  array.a_type = AIN_INT;
  CHECK(!array_is_int(&array) && !array_is_int(NULL));
  program.globals[0].type.data = AIN_ARRAY;
  global.values[0] = original;
  global_set(0, copy, true);
  CHECK(unrefs == 2 && global.values[0].i == copy.i);
  global_set(0, original, false);
  CHECK(exit_unrefs == 2 && global.values[0].i == original.i);
  CHECK(variable_initval(AIN_INT).i == 0);
  CHECK(variable_initval(AIN_REF_ARRAY).i == -1);
  union vm_value legacy = variable_initval(AIN_ARRAY_INT);
  CHECK(legacy.i > 0 && heap[legacy.i].page == NULL);
  variable_fini(legacy, AIN_ARRAY_INT, true);
  CHECK(unrefs == 3);
  CHECK(vm_copy((union vm_value){.i = 123}, AIN_INT).i == 123);
  // Array.At(enum) temporaries must not DELETE an initial zero/global page.
  CHECK(variable_initval(AIN_REF_ENUM).i == -1);
  int owner_refs = heap[original.i].ref;
  union vm_value enum_ref = vm_copy(original, AIN_REF_ENUM);
  CHECK(enum_ref.i == original.i && heap[original.i].ref == owner_refs + 1);
  variable_fini(enum_ref, AIN_REF_ENUM, true);
  CHECK(heap[original.i].ref == owner_refs && heap[0].ref == 1);
  variable_fini(variable_initval(AIN_REF_ENUM), AIN_REF_ENUM, true);
  CHECK(heap[0].ref == 1);
  return 0;
}
`;

fs.mkdirSync(build, { recursive: true });
const compiler = process.env.RANCE10_TEST_CLANG || path.resolve(root, '../android-build/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe');
const wasm = path.join(build, 'vm-helpers.wasm');
const result = spawnSync(compiler, ['--target=wasm32-unknown-unknown', '-x', 'c', '-std=c11', '-O1', '-nostdlib', '-Werror', '-Wl,--no-entry', '-Wl,--export=run_tests', '-o', wasm, '-'], {
  input: source,
  encoding: 'utf8',
  env: { ...process.env, TEMP: build, TMP: build },
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasm));
const failureLine = instance.exports.run_tests();
assert.equal(failureLine, 0, `C regression failed at generated line ${failureLine}: ${source.split('\n')[failureLine - 1]}`);
console.log('PASS: generic array allocation, independent slots, copy/reference ownership, finalization, global replacement, integer-array tags, legacy array/scalar behavior.');
