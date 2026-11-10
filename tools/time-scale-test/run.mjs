// 变速齿轮单元测试驱动：把真实 C 代码编成 wasm 跑一遍，不需要 Android / 设备。
//
//   node tools/time-scale-test/run.mjs
//
// 编译用 NDK 自带的 clang（--target=wasm32 -nostdlib），测试文件自带假时钟
// 与最小 libc，所以不依赖任何主机编译器。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');            // xsystem4-android-dev
const src = path.join(repo, 'xsystem4', 'src', 'time_scale.c');
const inc = path.join(repo, 'xsystem4', 'include');
const clang = path.join(repo, '..', 'android-build', 'sdk', 'ndk', '27.2.12479018',
  'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin', 'clang.exe');
const wasm = path.join(here, 'time_scale_test.wasm');

const NAMES = [
  '1x 完全透传',
  '2x：真实 +1000ms → 引擎 +2000ms',
  '0.5x：真实 +1000ms → 引擎 +500ms',
  '连续 6 次换挡不跳帧（最大跳变 ms）',
  '2x 下 sleep(16) 实睡 8ms',
  '0.5x 下 sleep(16) 实睡 32ms',
  '非法倍率 0 当作 1x',
  '999x 被夹到 20x',
  '32 位接口与 64 位一致',
  '负等待回绕被截断（否则变速后卡死）',
  '正常长等待不受误伤',
];

const args = [
  '--target=wasm32', '-O1', '-nostdlib', '-Wl,--no-entry', '-Wl,--export-all',
  `-I${path.join(here, 'stubs')}`, `-I${inc}`,
  path.join(here, 'test_time_scale.c'), src, '-o', wasm,
];
const cc = spawnSync(clang, args, { encoding: 'utf8' });
if (cc.status !== 0) {
  console.error('编译失败：\n' + (cc.stderr || cc.stdout));
  process.exit(1);
}

const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasm), {});
const e = instance.exports;
e.run_tests();

const n = e.ts_check_count();
let failed = 0;
for (let i = 0; i < n; i++) {
  const ok = e.ts_check_pass(i) === 1;
  const val = e.ts_check_value(i);
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${NAMES[i] ?? `check ${i}`}  → ${val}`);
}
const extra = e.ts_check_count() < NAMES.length ? [] : [];
console.log(`\n${failed ? '有测试未通过' : '全部通过'}（共 ${n} 项，失败 ${failed} 项）`);
fs.rmSync(wasm, { force: true });
process.exit(failed ? 1 : 0);
