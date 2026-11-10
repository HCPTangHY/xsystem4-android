/* 变速齿轮单元测试（wasm 版，不依赖 libc / 不需要 Android）。
 *
 * 用假时钟替换 SDL_GetTicks64/SDL_Delay，链接真实的 src/time_scale.c，
 * 检查缩放后的时间轴是否符合预期，含"换挡不能跳帧"这条关键不变量。
 *
 * 结果通过导出的 ts_check_count / ts_check_pass / ts_check_value 读取，
 * 由 tools/time-scale-test/run.mjs 驱动。
 */

#define XSYSTEM4_TIME_SCALE_IMPL   /* 本文件直接调用 sys_*，不要宏替换 */
#include "time_scale.h"

/* ---- 假时钟 ---------------------------------------------------------- */
static Uint64 fake_real_ms = 10000;

Uint64 SDL_GetTicks64(void)
{
	return fake_real_ms;
}

void SDL_Delay(Uint32 ms)
{
	fake_real_ms += ms;              /* 睡眠 = 真实时间前进 */
}

/* ---- libc 替代（-nostdlib 下编译器可能生成 memcpy/memset 调用）-------- */
void *memcpy(void *dst, const void *src, unsigned long n)
{
	char *d = dst;
	const char *s = src;
	while (n--)
		*d++ = *s++;
	return dst;
}

void *memset(void *dst, int c, unsigned long n)
{
	char *d = dst;
	while (n--)
		*d++ = (char)c;
	return dst;
}

/* ---- 结果收集 -------------------------------------------------------- */
#define MAX_CHECKS 16

static int check_count;
static int check_pass[MAX_CHECKS];
static long long check_value[MAX_CHECKS];

static void check(int cond, long long value)
{
	if (check_count < MAX_CHECKS) {
		check_pass[check_count] = cond ? 1 : 0;
		check_value[check_count] = value;
		check_count++;
	}
}

int ts_check_count(void)
{
	return check_count;
}

int ts_check_pass(int i)
{
	return (i >= 0 && i < check_count) ? check_pass[i] : -1;
}

long long ts_check_value(int i)
{
	return (i >= 0 && i < check_count) ? check_value[i] : -1;
}

/* ---- 测试 ------------------------------------------------------------ */
static long long absdiff(long long a, long long b)
{
	long long d = a - b;
	return d < 0 ? -d : d;
}

void run_tests(void)
{
	Uint64 t0, t1;

	/* 1) 倍率 1.0 必须完全透传 */
	sys_set_time_scale(1.0);
	t0 = sys_get_ticks64();
	fake_real_ms += 1234;
	t1 = sys_get_ticks64();
	check((long long)(t1 - t0) == 1234, (long long)(t1 - t0));

	/* 2) 2 倍速：真实 1000ms -> 引擎看到 2000ms */
	sys_set_time_scale(2.0);
	t0 = sys_get_ticks64();
	fake_real_ms += 1000;
	t1 = sys_get_ticks64();
	check(absdiff((long long)(t1 - t0), 2000) <= 2, (long long)(t1 - t0));

	/* 3) 0.5 倍速：真实 1000ms -> 引擎看到 500ms */
	sys_set_time_scale(0.5);
	t0 = sys_get_ticks64();
	fake_real_ms += 1000;
	t1 = sys_get_ticks64();
	check(absdiff((long long)(t1 - t0), 500) <= 2, (long long)(t1 - t0));

	/* 4) 连续换挡不能跳帧：每次换挡前后时间轴差值必须 ~0 */
	{
		static const double seq[6] = { 1.0, 4.0, 0.25, 6.0, 0.5, 1.0 };
		long long worst = 0;
		int i;
		for (i = 0; i < 6; i++) {
			long long before = (long long)sys_get_ticks64();
			sys_set_time_scale(seq[i]);
			long long after = (long long)sys_get_ticks64();
			long long d = absdiff(after, before);
			if (d > worst)
				worst = d;
			fake_real_ms += 137;
		}
		check(worst <= 2, worst);
	}

	/* 5) 睡眠按倍率缩放（否则帧率限制会抵消加速）*/
	sys_set_time_scale(2.0);
	{
		Uint64 before = fake_real_ms;
		sys_delay(16);
		check(absdiff((long long)(fake_real_ms - before), 8) <= 1,
		      (long long)(fake_real_ms - before));
	}
	sys_set_time_scale(0.5);
	{
		Uint64 before = fake_real_ms;
		sys_delay(16);
		check(absdiff((long long)(fake_real_ms - before), 32) <= 1,
		      (long long)(fake_real_ms - before));
	}

	/* 6) 非法/越界倍率被夹住 */
	sys_set_time_scale(0.0);
	t0 = sys_get_ticks64();
	fake_real_ms += 100;
	t1 = sys_get_ticks64();
	check(absdiff((long long)(t1 - t0), 100) <= 2, (long long)(t1 - t0));

	sys_set_time_scale(999.0);
	t0 = sys_get_ticks64();
	fake_real_ms += 100;
	t1 = sys_get_ticks64();
	check(absdiff((long long)(t1 - t0), 2000) <= 40, (long long)(t1 - t0));

	/* 7) 32 位接口与 64 位一致 */
	sys_set_time_scale(1.0);
	check((Uint64)sys_get_ticks() == sys_get_ticks64(), (long long)sys_get_ticks());

	/*
	 * 8) 负等待回绕必须被截断。
	 * 引擎里 SDL_Delay(t + 16 - now) 在变速后会算出负数，回绕成 ~2^32，
	 * 不处理的话游戏会真的睡几十天（现象：变速后卡死、点不动）。
	 */
	{
		Uint64 before = fake_real_ms;
		sys_delay((Uint32)0xFFFFFFF0u);       /* -16 的回绕 */
		check((long long)(fake_real_ms - before) <= 1,
		      (long long)(fake_real_ms - before));
	}

	/* 9) 正常的长时间等待不能被误伤 */
	{
		Uint64 before = fake_real_ms;
		sys_set_time_scale(1.0);
		sys_delay(500);
		check((long long)(fake_real_ms - before) == 500,
		      (long long)(fake_real_ms - before));
	}
}
