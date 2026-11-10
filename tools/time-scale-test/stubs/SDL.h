/* 测试用的极小 SDL 替身：只提供 time_scale.c 需要的那几个符号 */
#ifndef STUB_SDL_H
#define STUB_SDL_H

#include <stdint.h>

typedef uint64_t Uint64;
typedef uint32_t Uint32;

Uint64 SDL_GetTicks64(void);
void SDL_Delay(Uint32 ms);

#endif
