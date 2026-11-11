#!/usr/bin/env bash
#
# build_ffmpeg_android.sh
# =======================
# Cross-compile a *minimal* static FFmpeg (libavcodec / libavformat / libavutil /
# libswscale) for Android, for the ABIs required by xsystem4.
#
# Why this exists
# ---------------
# xsystem4's movie backend (xsystem4/src/movie_ffmpeg.c) links against the four
# static libraries produced here so that movie playback does not depend on the
# device's MediaPlayer/OMX stack.  The codec/demuxer set below is deliberately
# small: it covers the container/codec combinations the engine actually feeds it
# (ASF/WMV: wmv1/2/3 + wmav1/2; MPEG-PS/TS, AVI, MOV/MP4, MKV: mpeg1/2 + mp2/mp3/aac)
# while keeping the .a size and the link time sane.
#
# Usage
# -----
#   ./build_ffmpeg_android.sh [ABI ...]
#
#   ABIs (default: "arm64-v8a armeabi-v7a x86_64"):
#       arm64-v8a     aarch64-linux-android${API}-clang     (armv8-a)
#       armeabi-v7a   armv7a-linux-androideabi${API}-clang  (armv7-a)
#       x86_64        x86_64-linux-android${API}-clang      (x86-64)
#       x86           i686-linux-android${API}-clang        (i686)
#   Examples:
#       ./build_ffmpeg_android.sh                       # all three ABIs
#       ./build_ffmpeg_android.sh arm64-v8a             # just one
#       ABIS="x86_64" ./build_ffmpeg_android.sh         # same, via env
#
# Environment variables
# ---------------------
#   ANDROID_NDK_HOME   Existing NDK to reuse (e.g. /opt/android-ndk or
#                      $ANDROID_SDK_ROOT/ndk/27.2.12479018).  If set and valid,
#                      the NDK is NOT downloaded.  Otherwise the NDK is
#                      downloaded to $WORK_DIR and extracted to
#                      $WORK_DIR/android-ndk-$NDK_VERSION.
#   ANDROID_API        Android API level used for the clang wrappers (default 21).
#   FFMPEG_VERSION     FFmpeg release to build (default 7.1).
#   NDK_VERSION        NDK release to download when ANDROID_NDK_HOME is unset
#                      (default r27c).
#   OUT_DIR            Install root (default "<cwd>/android-build/deps/ffmpeg").
#                      Results land in "$OUT_DIR/<abi>/{lib,include}".
#   WORK_DIR           Scratch dir (default "/tmp/ffmpeg-android-build").
#   JOBS               Parallel make jobs (default: nproc).
#   ENABLE_NEON_V7A    "1" enables NEON for armeabi-v7a (default 0 = max
#                      compatibility; all arm64 devices are unaffected).
#   SKIP_DEPS          1 = never try to install build dependencies.
#   CLEAN              1 = wipe the per-ABI build dirs before configuring.
#
# CI (GitHub Actions ubuntu runner) example
# -----------------------------------------
#   - name: Build FFmpeg for Android
#     env:
#       ANDROID_NDK_HOME: ${{ env.ANDROID_NDK_LATEST_HOME }}
#     run: xsystem4-android-dev/tools/build_ffmpeg_android.sh
#
# Output
# ------
#   $OUT_DIR/arm64-v8a/lib/libavcodec.a libavformat.a libavutil.a libswscale.a
#   $OUT_DIR/arm64-v8a/include/...            (same for the other ABIs)
#
set -euo pipefail

# ---------------------------------------------------------------- configuration
FFMPEG_VERSION="${FFMPEG_VERSION:-7.1}"
NDK_VERSION="${NDK_VERSION:-r27c}"
ANDROID_API="${ANDROID_API:-21}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# <repo>/xsystem4-android-dev/tools -> <repo>/android-build/deps/ffmpeg
DEFAULT_OUT="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/android-build/deps/ffmpeg"
OUT_DIR="${OUT_DIR:-$DEFAULT_OUT}"
WORK_DIR="${WORK_DIR:-/tmp/ffmpeg-android-build}"
JOBS="${JOBS:-$( (command -v nproc >/dev/null && nproc) || echo 4 )}"
ENABLE_NEON_V7A="${ENABLE_NEON_V7A:-0}"
SKIP_DEPS="${SKIP_DEPS:-0}"
CLEAN="${CLEAN:-0}"

DEFAULT_ABIS=(arm64-v8a armeabi-v7a x86_64)

# ---------------------------------------------------------------------- helpers
log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# Parse positional ABIs and simple --flags.
ABIS=()
for arg in "$@"; do
	case "$arg" in
		-h|--help)
			sed -n '2,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
			exit 0 ;;
		--clean) CLEAN=1 ;;
		--jobs=*) JOBS="${arg#*=}" ;;
		--api=*) ANDROID_API="${arg#*=}" ;;
		--abi=*) ABIS+=("${arg#*=}") ;;
		--out=*) OUT_DIR="${arg#*=}" ;;
		-*) die "unknown option: $arg" ;;
		*) ABIS+=("$arg") ;;
	esac
done
if [ "${#ABIS[@]}" -eq 0 ]; then
	if [ -n "${ABIS_ENV:-}" ]; then
		# shellcheck disable=SC2206
		ABIS=(${ABIS_ENV})
	else
		ABIS=("${DEFAULT_ABIS[@]}")
	fi
fi

# ------------------------------------------------------- per-ABI configuration
abi_arch() { case "$1" in
	arm64-v8a)   echo aarch64 ;;
	armeabi-v7a) echo arm ;;
	x86_64)      echo x86_64 ;;
	x86)         echo x86 ;;
	*) die "unsupported ABI: $1" ;;
esac; }

abi_cpu() { case "$1" in
	arm64-v8a)   echo armv8-a ;;
	armeabi-v7a) echo armv7-a ;;
	x86_64)      echo x86-64 ;;
	x86)         echo i686 ;;
	*) die "unsupported ABI: $1" ;;
esac; }

# The clang wrapper basename (without the API level suffix).
abi_triple() { case "$1" in
	arm64-v8a)   echo aarch64-linux-android ;;
	armeabi-v7a) echo armv7a-linux-androideabi ;;
	x86_64)      echo x86_64-linux-android ;;
	x86)         echo i686-linux-android ;;
	*) die "unsupported ABI: $1" ;;
esac; }

# ---------------------------------------------------------------- dependencies
install_deps() {
	[ "$SKIP_DEPS" = "1" ] && { warn "SKIP_DEPS=1: not touching the package manager"; return 0; }
	local missing=()
	for c in make curl tar xz unzip; do
		command -v "$c" >/dev/null 2>&1 || missing+=("$c")
	done
	# diffutils (cmp) and pkg-config are used by ffmpeg's configure.
	command -v cmp >/dev/null 2>&1 || missing+=("diffutils")
	(command -v pkg-config >/dev/null 2>&1 || command -v pkgconf >/dev/null 2>&1) || missing+=("pkgconf")
	# x86 asm needs nasm/yasm; ffmpeg still builds without it (slower).
	if [ "${#missing[@]}" -eq 0 ]; then return 0; fi
	log "Missing build tools: ${missing[*]}"
	if command -v apt-get >/dev/null 2>&1; then
		local SUDO=""; [ "$(id -u)" = "0" ] || SUDO="sudo"
		$SUDO apt-get update -y
		# shellcheck disable=SC2086
		$SUDO apt-get install -y --no-install-recommends \
			build-essential curl tar xz-utils unzip diffutils pkg-config nasm
	elif command -v pacman >/dev/null 2>&1; then
		local SUDO=""; [ "$(id -u)" = "0" ] || SUDO="sudo"
		$SUDO pacman -Sy --noconfirm --needed \
			make curl tar xz unzip diffutils pkgconf nasm
	else
		warn "No supported package manager found; please install: ${missing[*]}"
	fi
}

# ------------------------------------------------------------------ acquire NDK
# Locate the llvm prebuilt host tag inside an NDK root.
ndk_toolchain() {
	local ndk="$1" tag
	for tag in linux-x86_64 darwin-x86_64 darwin-arm64 windows-x86_64; do
		if [ -d "$ndk/toolchains/llvm/prebuilt/$tag" ]; then
			echo "$ndk/toolchains/llvm/prebuilt/$tag"
			return 0
		fi
	done
	return 1
}

acquire_ndk() {
	# 1) explicit ANDROID_NDK_HOME
	local candidates=()
	[ -n "${ANDROID_NDK_HOME:-}" ] && candidates+=("$ANDROID_NDK_HOME")
	[ -n "${ANDROID_NDK_ROOT:-}" ] && candidates+=("$ANDROID_NDK_ROOT")
	[ -n "${ANDROID_NDK:-}" ] && candidates+=("$ANDROID_NDK")
	candidates+=("$WORK_DIR/android-ndk-$NDK_VERSION")
	for c in "${candidates[@]}"; do
		if [ -d "$c" ] && ndk_toolchain "$c" >/dev/null; then
			NDK_ROOT="$(cd "$c" && pwd)"
			log "Reusing NDK at $NDK_ROOT"
			return 0
		elif [ -n "$c" ] && [ -d "$c" ]; then
			warn "Ignoring $c: no toolchains/llvm/prebuilt/<host> inside"
		fi
	done

	# 2) download it
	mkdir -p "$WORK_DIR"
	local zip="$WORK_DIR/android-ndk-$NDK_VERSION-linux.zip"
	local url="https://dl.google.com/android/repository/android-ndk-$NDK_VERSION-linux.zip"
	if [ ! -f "$zip" ]; then
		log "Downloading $url"
		curl -fL --retry 3 -o "$zip.part" "$url"
		mv "$zip.part" "$zip"
	fi
	log "Extracting NDK (this takes a minute)"
	unzip -q -o "$zip" -d "$WORK_DIR"
	NDK_ROOT="$WORK_DIR/android-ndk-$NDK_VERSION"
	[ -d "$NDK_ROOT" ] || die "NDK extraction did not produce $NDK_ROOT"
}

# --------------------------------------------------------------- acquire FFmpeg
acquire_ffmpeg() {
	mkdir -p "$WORK_DIR"
	FFMPEG_SRC="$WORK_DIR/ffmpeg-$FFMPEG_VERSION"
	if [ -d "$FFMPEG_SRC" ] && [ -f "$FFMPEG_SRC/configure" ]; then
		log "Reusing FFmpeg source at $FFMPEG_SRC"
		return 0
	fi
	local tarball="$WORK_DIR/ffmpeg-$FFMPEG_VERSION.tar.xz"
	if [ ! -f "$tarball" ]; then
		log "Downloading https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
		curl -fL --retry 3 -o "$tarball.part" \
			"https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
		mv "$tarball.part" "$tarball"
	fi
	log "Extracting FFmpeg sources"
	tar -C "$WORK_DIR" -xf "$tarball"
	[ -f "$FFMPEG_SRC/configure" ] || die "FFmpeg source is missing configure"
}

# ------------------------------------------------------------------ build steps
build_abi() {
	local abi="$1"
	local arch cpu triple cc cxx extra_cflags=""

	arch="$(abi_arch "$abi")"
	cpu="$(abi_cpu "$abi")"
	triple="$(abi_triple "$abi")"
	cc="$TC/bin/${triple}${ANDROID_API}-clang"
	cxx="$TC/bin/${triple}${ANDROID_API}-clang++"
	[ -x "$cc" ] || die "compiler not found: $cc"

	if [ "$abi" = "armeabi-v7a" ] && [ "$ENABLE_NEON_V7A" = "1" ]; then
		extra_cflags="-mfloat-abi=softfp -mfpu=neon"
	fi

	local build="$WORK_DIR/build-$abi"
	[ "$CLEAN" = "1" ] && rm -rf "$build"
	mkdir -p "$build"
	local prefix="$OUT_DIR/$abi"
	mkdir -p "$prefix"

	local args=(
		--prefix="$prefix"
		--target-os=android
		--arch="$arch"
		--cpu="$cpu"
		--enable-cross-compile
		--sysroot="$TC/sysroot"
		--cc="$cc"
		--cxx="$cxx"
		--ar="$TC/bin/llvm-ar"
		--nm="$TC/bin/llvm-nm"
		--ranlib="$TC/bin/llvm-ranlib"
		--strip="$TC/bin/llvm-strip"
		--enable-static
		--disable-shared
		--enable-pic
		--disable-programs
		--disable-doc
		--disable-avdevice
		--disable-postproc
		--disable-network
		--disable-encoders
		--disable-muxers
		--disable-filters
		--disable-devices
		--disable-hwaccels
		--disable-bsfs
		--disable-everything
		--enable-demuxer=asf,mpegps,mpegts,mov,avi,matroska,image2
		--enable-decoder=mpeg1video,mpeg2video,wmv1,wmv2,wmv3,vc1,wmav1,wmav2,wmapro,mp2,mp3,aac,mjpeg,png,pcm_s16le
		--enable-parser=mpegvideo,mpeg4video,h264,aac,mp3,mjpeg,png
		--enable-protocol=file
		--enable-swscale
		--enable-pthreads
		--enable-zlib
		--disable-iconv
		--disable-sdl2
		--disable-xlib
		--disable-vulkan
		--disable-vaapi
		--disable-vdpau
	)
	# These static libraries are linked into libxsystem4.so, so every object has
	# to be position independent: --enable-pic alone does NOT add -fPIC to the
	# C flags, and without it linking fails with
	#   relocation R_AARCH64_ADR_PREL_PG_HI21 cannot be used against symbol ...
	extra_cflags="${extra_cflags:+$extra_cflags }-fPIC"
	args+=(--extra-cflags="$extra_cflags")
	# x86/x86_64 assembly needs nasm or yasm; fall back to C-only otherwise.
	if [ "$arch" = "x86_64" ] || [ "$arch" = "x86" ]; then
		if ! command -v nasm >/dev/null 2>&1 && ! command -v yasm >/dev/null 2>&1; then
			warn "nasm/yasm not found: disabling x86 assembly (C only, slower)"
			args+=(--disable-x86asm)
		fi
	fi

	log "Configuring FFmpeg for $abi (arch=$arch cpu=$cpu api=$ANDROID_API)"
	(
		cd "$build"
		"$FFMPEG_SRC/configure" "${args[@]}"
	)

	log "Building $abi with -j$JOBS"
	make -C "$build" -j"$JOBS"
	log "Installing $abi -> $prefix"
	make -C "$build" install
}

# ------------------------------------------------------------------ verification
verify_abi() {
	local abi="$1" lib="$OUT_DIR/$abi/lib" ok=1
	local NM="$TC/bin/llvm-nm"
	log "Verifying $abi"
	for f in libavcodec.a libavformat.a libavutil.a libswscale.a; do
		if [ -f "$lib/$f" ]; then
			printf '    %-16s %s bytes\n' "$f" "$(stat -c %s "$lib/$f")"
		else
			printf '    %-16s MISSING\n' "$f"; ok=0
		fi
	done

	# The whole point: WMV1 (and friends) must be compiled in, not just probed.
	local syms
	syms="$("$NM" --defined-only "$lib/libavcodec.a" 2>/dev/null || true)"
	for s in ff_wmv1_decoder ff_wmv2_decoder ff_wmav2_decoder; do
		if printf '%s\n' "$syms" | grep -q " $s\$"; then
			printf '    OK   %s\n' "$s"
		else
			printf '    FAIL %s missing from libavcodec.a\n' "$s"; ok=0
		fi
	done
	if printf '%s\n' "$("$NM" --defined-only "$lib/libavformat.a" 2>/dev/null || true)" \
		| grep -q ' ff_asf_demuxer$'; then
		printf '    OK   ff_asf_demuxer\n'
	else
		printf '    FAIL ff_asf_demuxer missing from libavformat.a\n'; ok=0
	fi
	if [ "$ok" = "1" ]; then
		printf '    => %s verified\n' "$abi"
	else
		printf '    => %s VERIFICATION FAILED\n' "$abi"
		return 1
	fi
}

# ------------------------------------------------------------------------ main
main() {
	log "FFmpeg $FFMPEG_VERSION / NDK $NDK_VERSION / API $ANDROID_API"
	log "Output: $OUT_DIR   Work: $WORK_DIR   Jobs: $JOBS"
	install_deps
	acquire_ndk
	acquire_ffmpeg

	TC="$(ndk_toolchain "$NDK_ROOT")" || die "no LLVM toolchain inside $NDK_ROOT"
	log "Toolchain: $TC"
	command -v make >/dev/null || die "make is required"

	local abi failed=()
	for abi in "${ABIS[@]}"; do
		if build_abi "$abi"; then
			verify_abi "$abi" || failed+=("$abi")
		else
			warn "build failed for $abi"
			failed+=("$abi")
		fi
	done

	log "Summary"
	for abi in "${ABIS[@]}"; do
		local total=0 f
		for f in libavcodec.a libavformat.a libavutil.a libswscale.a libswresample.a; do
			[ -f "$OUT_DIR/$abi/lib/$f" ] && total=$((total + $(stat -c %s "$OUT_DIR/$abi/lib/$f")))
		done
		printf '    %-12s %s bytes total\n' "$abi" "$total"
	done

	if [ "${#failed[@]}" -gt 0 ]; then
		die "failed ABIs: ${failed[*]}"
	fi
	log "Done. Static libs + headers are in $OUT_DIR/<abi>/{lib,include}"
}

main "$@"
