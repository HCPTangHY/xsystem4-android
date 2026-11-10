param([string]$Serial = 'fea37789')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$game = Split-Path -Parent $repo
$sdk = Join-Path $game 'android-build/sdk'
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$clang = Join-Path $sdk 'ndk/27.2.12479018/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'
$binary = Join-Path $game 'android-build/tmp/test-anime4k'
$env:TMP = Join-Path $game 'android-build/tmp'
$env:TEMP = $env:TMP
& $clang --target=aarch64-linux-android28 -std=c11 -O1 -g -DUSE_GLES `
    "-I$PSScriptRoot/include" "-I$repo/xsystem4/include" `
    "$PSScriptRoot/test_anime4k.c" -lEGL -lGLESv3 -lm -o $binary
if ($LASTEXITCODE -ne 0) { throw 'Native test build failed' }
& $adb -s $Serial shell mkdir -p /data/local/tmp/xsystem4-a4k-tests/shaders
& $adb -s $Serial push $binary /data/local/tmp/xsystem4-a4k-tests/test-anime4k
& $adb -s $Serial push "$repo/xsystem4/shaders/anime4k" /data/local/tmp/xsystem4-a4k-tests/shaders/
& $adb -s $Serial push "$repo/xsystem4/shaders/cunny" /data/local/tmp/xsystem4-a4k-tests/shaders/
& $adb -s $Serial shell chmod 755 /data/local/tmp/xsystem4-a4k-tests/test-anime4k
& $adb -s $Serial shell /data/local/tmp/xsystem4-a4k-tests/test-anime4k /data/local/tmp/xsystem4-a4k-tests
if ($LASTEXITCODE -ne 0) { throw 'GPU regression tests failed' }
