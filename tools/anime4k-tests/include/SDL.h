#ifndef ANIME4K_TEST_SDL_H
#define ANIME4K_TEST_SDL_H
#include <stdio.h>
#include <stdlib.h>

static inline void *SDL_LoadFile(const char *path, size_t *size)
{
    FILE *fp = fopen(path, "rb");
    if (!fp)
        return NULL;
    fseek(fp, 0, SEEK_END);
    long length = ftell(fp);
    rewind(fp);
    char *data = malloc((size_t)length + 1);
    if (!data || fread(data, 1, (size_t)length, fp) != (size_t)length) {
        free(data);
        fclose(fp);
        return NULL;
    }
    fclose(fp);
    data[length] = 0;
    if (size)
        *size = (size_t)length;
    return data;
}
#define SDL_free free
#endif
