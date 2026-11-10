// HLL functions Rance 10 calls that were once unbound and silently returned 0
// or failed (found by auditing every CALLHLL site in Rance10.ain against the
// engine's export tables, overload by overload). Keep them registered.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,'xsystem4/src',p),'utf8').replace(/\r\n/g,'\n');
const required=[
  ['hll/Math.c',/HLL_EXPORT_SIG\(Min, Math_Min3, "int,int,int"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Min, Math_Min4, "int,int,int,int"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Min, Math_MinF3, "float,float,float"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Min, Math_MinF4, "float,float,float,float"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Max, Math_Max3, "int,int,int"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Max, Math_Max4, "int,int,int,int"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Max, Math_MaxF3, "float,float,float"\)/],
  ['hll/Math.c',/HLL_EXPORT_SIG\(Max, Math_MaxF4, "float,float,float,float"\)/],
  ['hll/NewerLibs.c',/HLL_EXPORT\(ReplaceRegex, String_ReplaceRegex\)/],
  ['hll/NewerLibs.c',/HLL_EXPORT\(Error, System_Error\)/],
  ['hll/MainEXFileNew.inc',/HLL_EXPORT_SIG\(Save, MainEXNew_Save, "ref array<\?>"\)/],
  ['hll/MainEXFileNew.inc',/HLL_EXPORT_SIG\(Load, MainEXNew_Load, "ref array<\?>"\)/],
  ['hll/PartsEngine.c',/HLL_EXPORT\(Parts_GetPartsCGDeform, PartsEngine_GetPartsCGDeform\)/],
  ['hll/PartsEngine.c',/HLL_EXPORT\(SetEnableSpeedUp, PartsEngine_SetEnableSpeedUp\)/],
  ['hll/PartsEngine.c',/HLL_EXPORT\(IsEnableSpeedUp, PartsEngine_IsEnableSpeedUp\)/],
];
for (const [file,re] of required) assert.match(read(file),re,`${file}: ${re}`);
// MainEXFile.Save must succeed: a failure makes every save call system.Error.
assert.match(read('hll/MainEXFileNew.inc'),/static bool MainEXNew_Save\(struct page \*\*image\)\n\{[\s\S]*?\n\treturn true;\n\}/);
console.log(`PASS: ${required.length} once-unbound Rance 10 HLL overloads stay registered (Min/Max 3-4 args, ReplaceRegex, Error, EX image, CG deform, speed-up).`);
