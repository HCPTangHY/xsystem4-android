#ifndef ANIME4K_TEST_SYSTEM4_H
#define ANIME4K_TEST_SYSTEM4_H
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define NOTICE(...) do { fprintf(stderr, __VA_ARGS__); fputc('\n', stderr); } while (0)
#define WARNING(...) NOTICE(__VA_ARGS__)
static inline void *xmalloc(size_t size)
{
    void *p = malloc(size);
    if (!p)
        abort();
    return p;
}
static inline void *xrealloc(void *p, size_t size)
{
    p = realloc(p, size);
    if (!p)
        abort();
    return p;
}
#endif
